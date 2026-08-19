const ONESTOP_EXPORT_PREFIX = 'https://extmapviewer.aer.ca/Geocortex/Essentials/public/REST/sites/OneStop/map/export';
const ONESTOP_IDENTIFY = 'https://extmapviewer.aer.ca/Geocortex/Essentials/public/REST/sites/OneStop/map/mapservices/170/identify';
const SYNTHETIC_DISPOSITION_URL = 'geocortex-identify://active-dispositions';
const nativeFetch = window.fetch.bind(window);
let callbackCounter = 0;

function setDispositionButton(text, title = '') {
  const button = document.getElementById('toggleDispositions');
  if (!button) return;
  button.textContent = text;
  button.title = title;
}

function jsonp(url, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(url);
    requestUrl.searchParams.set('f', 'json');

    const callbackName = `__oneStopJsonp_${Date.now()}_${callbackCounter++}`;
    requestUrl.searchParams.set('CallBack', callbackName);

    const script = document.createElement('script');
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      script.remove();
      try { delete window[callbackName]; } catch { window[callbackName] = undefined; }
    };

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('OneStop identify request could not be loaded.'));
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('OneStop identify request timed out.'));
    }, timeoutMs);

    script.src = requestUrl.href;
    document.head.appendChild(script);
  });
}

// app-v4.js still calls the old map/export workflow. Return a synthetic URL so
// it can keep its existing toggle and refresh logic, but do not create a map
// export or request a temporary image. The Leaflet patch below turns this URL
// into a live disposition feature layer built from OneStop Identify results.
window.fetch = async function patchedFetch(input, init) {
  const url = typeof input === 'string' ? input : input?.url;
  if (!url || !url.startsWith(ONESTOP_EXPORT_PREFIX)) {
    return nativeFetch(input, init);
  }

  const data = { href: SYNTHETIC_DISPOSITION_URL };
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function normalizeAttributes(value) {
  if (!value) return {};
  if (!Array.isArray(value)) return value;
  const out = {};
  value.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const key = item.name ?? item.fieldName ?? item.key ?? item.alias;
    if (key != null) out[key] = item.value ?? item.fieldValue ?? item.val ?? '';
  });
  return out;
}

function collectFeatureResults(node, out, context = {}) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((item) => collectFeatureResults(item, out, context));
    return;
  }
  if (typeof node !== 'object') return;

  const nextContext = {
    layerName: node.layerName ?? node.displayName ?? node.name ?? context.layerName ?? '',
    layerId: node.layerId ?? node.layerID ?? node.id ?? context.layerId ?? null,
  };

  if (node.feature && typeof node.feature === 'object' && node.feature.geometry) {
    out.push({
      geometry: node.feature.geometry,
      attributes: normalizeAttributes(node.feature.attributes ?? node.feature.properties ?? node.attributes ?? node.properties),
      layerName: nextContext.layerName,
      layerId: nextContext.layerId,
    });
    return;
  }

  if (node.geometry && (node.attributes || node.properties || node.layerId != null || node.layerName)) {
    out.push({
      geometry: node.geometry,
      attributes: normalizeAttributes(node.attributes ?? node.properties),
      layerName: nextContext.layerName,
      layerId: nextContext.layerId,
    });
    return;
  }

  Object.entries(node).forEach(([key, value]) => {
    if (['geometry', 'attributes', 'properties'].includes(key)) return;
    collectFeatureResults(value, out, nextContext);
  });
}

function geometryWkid(geometry) {
  return Number(geometry?.spatialReference?.latestWkid || geometry?.spatialReference?.wkid || 102100);
}

function xyToLatLng(L, geometry, pair) {
  const x = Number(pair?.[0]);
  const y = Number(pair?.[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const wkid = geometryWkid(geometry);
  if ([4326, 4269].includes(wkid) || (Math.abs(x) <= 180 && Math.abs(y) <= 90)) {
    return [y, x];
  }
  const ll = L.CRS.EPSG3857.unproject(L.point(x, y));
  return [ll.lat, ll.lng];
}

function layerFromGeometry(L, geometry, style) {
  if (!geometry || typeof geometry !== 'object') return null;

  if (Array.isArray(geometry.rings)) {
    const rings = geometry.rings
      .map((ring) => ring.map((pair) => xyToLatLng(L, geometry, pair)).filter(Boolean))
      .filter((ring) => ring.length >= 3);
    return rings.length ? L.polygon(rings, style) : null;
  }

  if (Array.isArray(geometry.paths)) {
    const paths = geometry.paths
      .map((path) => path.map((pair) => xyToLatLng(L, geometry, pair)).filter(Boolean))
      .filter((path) => path.length >= 2);
    return paths.length ? L.polyline(paths, style) : null;
  }

  if (Number.isFinite(Number(geometry.x)) && Number.isFinite(Number(geometry.y))) {
    const ll = xyToLatLng(L, geometry, [geometry.x, geometry.y]);
    return ll ? L.circleMarker(ll, { ...style, radius: 5 }) : null;
  }

  return null;
}

function dispositionDetails(feature) {
  const a = feature.attributes || {};
  const number = a.DISP_NUM ?? a.Disposition_Number ?? a['Disposition Number'] ?? a.dispositionNumber ?? '';
  const type = a.DISP_TYPE ?? a.TYPENAME ?? a.Disposition_Type ?? a['Disposition Type'] ?? '';
  const status = a.STATCD ?? a.Disposition_Status ?? a['Disposition Status'] ?? '';
  const company = a.COMPANY ?? a.Company ?? a.company ?? '';
  const area = a.AREA_HECT ?? a.Disposition_Total_Area ?? a['Area Hectares'];

  const rows = [];
  if (number) rows.push(`<strong>${escapeHtml(number)}</strong>`);
  if (feature.layerName) rows.push(escapeHtml(feature.layerName));
  if (type && String(type) !== String(feature.layerName)) rows.push(`Type: ${escapeHtml(type)}`);
  if (status) rows.push(`Status: ${escapeHtml(status)}`);
  if (company) rows.push(`Company: ${escapeHtml(company)}`);
  if (area !== '' && area != null && Number.isFinite(Number(area))) rows.push(`Area: ${Number(area).toLocaleString(undefined, { maximumFractionDigits: 4 })} ha`);

  return {
    label: number || feature.layerName || 'Disposition',
    html: rows.join('<br>') || 'Active disposition',
  };
}

async function identifyDispositions(L, map, bounds, targetGroup) {
  if (!map || !bounds || !map.hasLayer(targetGroup)) return;

  if (map.getZoom() < 13) {
    setTimeout(() => setDispositionButton('Active dispositions: on (zoom in)', 'Zoom in to approximately 1:100,000 or closer to load active dispositions.'), 0);
    return;
  }

  setTimeout(() => setDispositionButton('Active dispositions: loading…', 'Loading active disposition polygons from OneStop Identify.'), 0);

  const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
  const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
  const size = map.getSize();
  const xmin = Math.min(sw.x, ne.x);
  const ymin = Math.min(sw.y, ne.y);
  const xmax = Math.max(sw.x, ne.x);
  const ymax = Math.max(sw.y, ne.y);
  const envelope = { xmin, ymin, xmax, ymax, spatialReference: { wkid: 102100 } };

  const params = new URLSearchParams({
    layers: 'all:9,10,11,12,15',
    geometry: JSON.stringify(envelope),
    geometryType: 'esriGeometryEnvelope',
    imageDisplay: `${Math.max(1, Math.round(size.x))},${Math.max(1, Math.round(size.y))},96`,
    mapExtent: `${xmin},${ymin},${xmax},${ymax}`,
    tolerance: '0',
    pixelTolerance: '0',
    maxAllowableOffset: '0.5',
    sr: '102100',
    resultLimit: '500',
    returnGeometry: 'true',
    f: 'json',
  });

  try {
    const data = await jsonp(`${ONESTOP_IDENTIFY}?${params}`);
    if (!map.hasLayer(targetGroup)) return;

    const found = [];
    collectFeatureResults(data?.results ?? data, found);

    const allowedIds = new Set([9, 10, 11, 12, 15]);
    const features = found.filter((feature) => feature.layerId == null || allowedIds.has(Number(feature.layerId)));

    targetGroup.clearLayers();
    let rendered = 0;
    features.forEach((feature) => {
      const layer = layerFromGeometry(L, feature.geometry, {
        color: '#8a4f2d',
        weight: 2,
        opacity: 0.9,
        fillColor: '#c77945',
        fillOpacity: 0.16,
      });
      if (!layer) return;
      const details = dispositionDetails(feature);
      layer.bindTooltip(String(details.label), { sticky: true });
      layer.bindPopup(details.html, { maxWidth: 360 });
      targetGroup.addLayer(layer);
      rendered += 1;
    });

    if (!map.hasLayer(targetGroup)) return;
    if (rendered) {
      setDispositionButton('Active dispositions: on', `${rendered} disposition feature${rendered === 1 ? '' : 's'} loaded in the current view. Click a polygon for details.`);
    } else {
      setDispositionButton('Active dispositions: on (none in view)', 'OneStop Identify returned no active disposition polygons in the current view.');
    }
  } catch (err) {
    console.error('OneStop disposition identify failed', err);
    if (!map.hasLayer(targetGroup)) return;
    targetGroup.clearLayers();
    setDispositionButton('Active dispositions: unavailable', err.message || String(err));
  }
}

function patchLeafletImageOverlay() {
  if (!window.L?.imageOverlay) {
    setTimeout(patchLeafletImageOverlay, 80);
    return;
  }
  if (window.L.imageOverlay.__oneStopIdentifyPatched) return;

  const L = window.L;
  const originalImageOverlay = L.imageOverlay;
  const patched = function dispositionIdentifyOverlay(imageUrl, bounds, options) {
    if (String(imageUrl || '').startsWith(SYNTHETIC_DISPOSITION_URL)) {
      const group = L.layerGroup();
      const originalOnAdd = group.onAdd.bind(group);
      group.onAdd = function onAdd(map) {
        originalOnAdd(map);
        identifyDispositions(L, map, bounds, group);
      };
      return group;
    }
    return originalImageOverlay.call(L, imageUrl, bounds, options);
  };

  patched.__oneStopIdentifyPatched = true;
  L.imageOverlay = patched;
}

patchLeafletImageOverlay();
