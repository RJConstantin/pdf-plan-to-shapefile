import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.min.mjs';
import { detectExplicitDimensions, detectLegalLocation, detectLegalLocations, detectPadTraverse } from './plan-parser.mjs?v=2026.08.20.8';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.worker.min.mjs';

const ATS_SERVICE = 'https://geospatial.alberta.ca/titan/rest/services/base/alberta_township_system/MapServer';
const ONESTOP_EXPORT = 'https://extmapviewer.aer.ca/Geocortex/Essentials/public/REST/sites/OneStop/map/export';
const DEFAULT_CENTER = [54.5, -115.0];
const EPSG3400 = '+proj=tmerc +lat_0=0 +lon_0=-115 +k=0.9992 +x_0=500000 +y_0=0 +datum=NAD83 +units=m +no_defs +type=crs';
const NAD83_10TM_WKT = 'PROJCS["NAD_1983_10TM_AEP_Forest",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-115.0],PARAMETER["Scale_Factor",0.9992],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

const state = {
  pdf: null,
  pdfText: '',
  map: null,
  drawn: null,
  candidate: null,
  atsLayer: null,
  atsEnabled: true,
  dispositionsLayer: null,
  dispositionsEnabled: false,
  dispositionRequestId: 0,
  confirmed: false,
  detected: {},
  locatedFeature: null,
  currentFile: null,
};

const $ = (id) => document.getElementById(id);

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((s) => s.src === src)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

function loadCss(href) {
  if ([...document.styleSheets].some((s) => s.href === href)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

async function loadLibraries() {
  loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
  loadCss('https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css');
  await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
  await loadScript('https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js');
  await loadScript('https://unpkg.com/@mapbox/shp-write@0.4.3/shpwrite.js');
  await loadScript('https://cdn.jsdelivr.net/npm/proj4@2.21.0/dist/proj4.js');
  await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
}

async function ensureMap() {
  if (state.map) return;
  await loadLibraries();
  const L = window.L;
  state.map = L.map('planMap', { zoomControl: true }).setView(DEFAULT_CENTER, 5);

  const imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20,
    attribution: 'Tiles © Esri'
  }).addTo(state.map);
  const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  });
  L.control.layers({ Satellite: imagery, 'Street map': streets }, null, { collapsed: false }).addTo(state.map);

  state.drawn = new L.FeatureGroup().addTo(state.map);
  state.map.addControl(new L.Control.Draw({
    position: 'topleft',
    draw: {
      polyline: false,
      circle: false,
      circlemarker: false,
      marker: false,
      polygon: { allowIntersection: false, showArea: true },
      rectangle: { showArea: true }
    },
    edit: { featureGroup: state.drawn, remove: true }
  }));

  state.map.on(L.Draw.Event.CREATED, (e) => replaceBoundary(e.layer));
  state.map.on(L.Draw.Event.EDITED, () => {
    state.candidate = firstBoundaryLayer();
    invalidateConfirmation();
    updateBoundarySummary();
  });
  state.map.on(L.Draw.Event.DELETED, () => {
    state.candidate = firstBoundaryLayer();
    invalidateConfirmation();
    updateBoundarySummary();
  });
  state.map.on('moveend', () => {
    if (state.atsEnabled) refreshAtsGrid();
    if (state.dispositionsEnabled) refreshDispositions();
  });
  refreshAtsGrid();
}

async function handlePdf(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    setPdfStatus('Choose a PDF.');
    return;
  }
  state.currentFile = file;
  state.confirmed = false;
  state.locatedFeature = null;
  if (state.drawn) {
    state.drawn.clearLayers();
    state.candidate = null;
    updateBoundarySummary();
  }
  $('planPdfName').textContent = file.name;
  setPdfStatus('Reading PDF…');
  $('pdfConfidence').textContent = 'Analyzing plan';

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data }).promise;
    state.pdf = doc;
    let text = '';

    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      text += ' ' + tc.items.map((item) => item.str).join(' ');
      if (i === 1) await renderPage(page);
    }

    state.pdfText = text.replace(/\s+/g, ' ').trim();
    state.detected = detectPlanInfo(`${file.name} ${state.pdfText}`);
    const cadBoundary = await extractCadProposedBoundary(doc);
    if (cadBoundary && state.detected.legalLocations?.length >= 2) {
      state.detected.cadBoundary = cadBoundary;
    }
    applyDetectedFields(state.detected);
    renderDetectedInfo(state.detected, doc.numPages);
    setPdfStatus(state.pdfText.length > 40
      ? `Loaded ${doc.numPages} page${doc.numPages === 1 ? '' : 's'} with extractable plan text.`
      : `Loaded ${doc.numPages} page${doc.numPages === 1 ? '' : 's'}. Little or no extractable text was found. Enter the legal location and plan dimensions, then position the boundary on the map.`);
    $('pdfConfidence').textContent = confidenceLabel(state.detected);

    const located = await locateFromFields();
    if (state.detected.cadBoundary) {
      await buildCadBoundaryFromDetected();
    } else if (state.detected.traverse) {
      await buildTraverseFromDetected(located);
    } else if (numberValue('widthInput') && numberValue('heightInput')) {
      buildRectangleFromFields();
    } else if (located && state.detected.legal
      && !Number.isFinite(state.detected.lat) && !Number.isFinite(state.detected.lon)) {
      setPdfStatus('Section found, but this PDF page has no coordinate anchor or explicit pad dimensions. The map is centred on the section for reference only. Draw the boundary on the map or enter known coordinates and dimensions.');
    }
  } catch (err) {
    console.error(err);
    setPdfStatus(`The PDF could not be read: ${err.message || err}`);
    $('pdfConfidence').textContent = 'PDF read failed';
  }
}

async function renderPage(page) {
  const canvas = $('pdfCanvas');
  const wrap = $('pdfPreviewWrap');
  const base = page.getViewport({ scale: 1 });
  const targetWidth = Math.min(760, Math.max(400, wrap.parentElement.clientWidth - 40));
  const scale = targetWidth / base.width;
  const viewport = page.getViewport({ scale });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  wrap.classList.remove('hidden');
}

function detectPlanInfo(text) {
  const result = { textLength: text.length };
  if (!text) return result;

  const lat = text.match(/LATITUDE\s*:?\s*(\d{2}\.\d{4,})/i);
  const lon = text.match(/LONGITUDE\s*:?\s*(-?\d{3}\.\d{4,})/i);
  if (lat && lon) {
    result.lat = Number(lat[1]);
    result.lon = Number(lon[1]);
  }

  if (result.lat == null || result.lon == null) {
    const geo = text.match(/(\d{2})[°\s]+(\d{1,2})['’\s]+(\d{1,2}(?:\.\d+)?)\s*["”]?\s*N[^0-9]{0,40}(\d{3})[°\s]+(\d{1,2})['’\s]+(\d{1,2}(?:\.\d+)?)\s*["”]?\s*W/i);
    if (geo) {
      result.lat = dmsToDecimal(Number(geo[1]), Number(geo[2]), Number(geo[3]), false);
      result.lon = dmsToDecimal(Number(geo[4]), Number(geo[5]), Number(geo[6]), true);
    }
  }

  const legal = detectLegalLocation(text);
  if (legal) result.legal = legal;
  result.legalLocations = detectLegalLocations(text);
  if (!result.legal && result.legalLocations.length) result.legal = result.legalLocations[0];

  const dimensions = detectExplicitDimensions(text);
  if (dimensions) {
    result.width = dimensions.width;
    result.height = dimensions.height;
  }

  const traverse = detectPadTraverse(text);
  if (traverse) result.traverse = traverse;

  return result;
}

function multiplyMatrix(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function matrixPoint(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[2] * point[1] + matrix[4],
    matrix[1] * point[0] + matrix[3] * point[1] + matrix[5],
  ];
}

function parseConstructedPath(args, matrix) {
  let pathData = args?.[1];
  if (Array.isArray(pathData) && pathData.length === 1) [pathData] = pathData;
  const values = pathData && typeof pathData.length === 'number'
    ? Array.from(pathData)
    : Object.values(pathData || {});
  const points = [];
  for (let i = 0; i < values.length;) {
    const command = values[i++];
    if (command === 0 || command === 1) {
      if (i + 1 >= values.length) break;
      points.push(matrixPoint(matrix, [Number(values[i]), Number(values[i + 1])]));
      i += 2;
    } else if (command === 2) {
      if (i + 5 >= values.length) break;
      points.push(matrixPoint(matrix, [Number(values[i + 4]), Number(values[i + 5])]));
      i += 6;
    } else if (command === 3) {
      if (i + 3 >= values.length) break;
      points.push(matrixPoint(matrix, [Number(values[i + 2]), Number(values[i + 3])]));
      i += 4;
    } else if (command === 4) {
      break;
    } else {
      break;
    }
  }

  const cleaned = points.filter((point, index) => (
    index === 0 || Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) > 1e-6
  ));
  if (cleaned.length > 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) cleaned.pop();
  }
  return cleaned;
}

function principalEndpoints(points) {
  const centerX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  points.forEach(([x, y]) => {
    const dx = x - centerX;
    const dy = y - centerY;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  });
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const axis = [Math.cos(angle), Math.sin(angle)];
  const projections = points.map(([x, y]) => (x - centerX) * axis[0] + (y - centerY) * axis[1]);
  const minimum = Math.min(...projections);
  const maximum = Math.max(...projections);
  const tolerance = (maximum - minimum) * 0.02;
  const average = (items) => [
    items.reduce((sum, point) => sum + point[0], 0) / items.length,
    items.reduce((sum, point) => sum + point[1], 0) / items.length,
  ];
  return [
    average(points.filter((point, index) => projections[index] <= minimum + tolerance)),
    average(points.filter((point, index) => projections[index] >= maximum - tolerance)),
  ];
}

async function extractCadProposedBoundary(doc) {
  try {
    const config = await doc.getOptionalContentConfig();
    const order = (config.getOrder?.() || []).flat(Infinity).filter((id) => typeof id === 'string');
    const proposedLayerId = order.find((id) => /^P-PROPOSED$/i.test(config.getGroup(id)?.name || ''));
    const sectionLayerId = order.find((id) => /^L-USEC$/i.test(config.getGroup(id)?.name || ''));
    if (!proposedLayerId) return null;

    const candidates = [];
    const sectionSegments = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const operatorList = await page.getOperatorList();
      const names = Object.fromEntries(Object.entries(pdfjsLib.OPS).map(([name, code]) => [code, name]));
      const graphicsStack = [];
      const markedContent = [];
      let matrix = [1, 0, 0, 1, 0, 0];

      for (let index = 0; index < operatorList.fnArray.length; index += 1) {
        const name = names[operatorList.fnArray[index]];
        const args = operatorList.argsArray[index];
        if (name === 'save') graphicsStack.push(matrix.slice());
        else if (name === 'restore') matrix = graphicsStack.pop() || matrix;
        else if (name === 'transform') matrix = multiplyMatrix(matrix, args);
        else if (name === 'beginMarkedContentProps') {
          markedContent.push(args?.[1]?.id || markedContent.at(-1) || null);
        } else if (name === 'beginMarkedContent') {
          markedContent.push(markedContent.at(-1) || null);
        } else if (name === 'endMarkedContent') {
          markedContent.pop();
        } else if (name === 'constructPath' && markedContent.at(-1) === proposedLayerId) {
          const points = parseConstructedPath(args, matrix);
          if (points.length >= 6) {
            const xs = points.map((point) => point[0]);
            const ys = points.map((point) => point[1]);
            const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
            candidates.push({ page, pageNumber, points, span });
          }
        } else if (name === 'constructPath' && markedContent.at(-1) === sectionLayerId) {
          const points = parseConstructedPath(args, matrix);
          if (points.length === 2) sectionSegments.push({ pageNumber, points });
        }
      }
    }
    if (!candidates.length) return null;

    candidates.sort((a, b) => b.span - a.span || b.points.length - a.points.length);
    const candidate = candidates[0];
    const viewport = candidate.page.getViewport({ scale: 1 });
    const screenPoints = candidate.points.map((point) => viewport.convertToViewportPoint(point[0], point[1]));
    const screenSegments = sectionSegments
      .filter((segment) => segment.pageNumber === candidate.pageNumber)
      .map((segment) => segment.points.map((point) => viewport.convertToViewportPoint(point[0], point[1])));
    let [first, second] = principalEndpoints(screenPoints);
    const horizontal = Math.abs(first[0] - second[0]) >= Math.abs(first[1] - second[1]);
    const firstComesFirst = horizontal
      ? first[0] <= second[0]
      : first[1] <= second[1];
    if (!firstComesFirst) [first, second] = [second, first];

    return {
      pageNumber: candidate.pageNumber,
      points: screenPoints,
      startPoint: first,
      endPoint: second,
      sectionSegments: screenSegments,
    };
  } catch (err) {
    console.warn('A proposed CAD layer could not be extracted.', err);
    return null;
  }
}

function clusterGridLines(lines, tolerance = 18) {
  const sorted = lines.slice().sort((a, b) => a.reference - b.reference);
  const groups = [];
  sorted.forEach((line) => {
    let group = groups.at(-1);
    if (!group || line.reference - group.reference > tolerance) {
      group = { reference: line.reference, lines: [] };
      groups.push(group);
    }
    group.lines.push(line);
    group.reference = group.lines.reduce((sum, item) => sum + item.reference, 0) / group.lines.length;
  });
  return groups.filter((group) => group.lines.length >= 4);
}

function fitGridLine(group, vertical) {
  const points = group.lines.flatMap((line) => line.points);
  const independent = points.map((point) => point[vertical ? 1 : 0]);
  const dependent = points.map((point) => point[vertical ? 0 : 1]);
  const meanIndependent = independent.reduce((sum, value) => sum + value, 0) / independent.length;
  const meanDependent = dependent.reduce((sum, value) => sum + value, 0) / dependent.length;
  let numerator = 0;
  let denominator = 0;
  independent.forEach((value, index) => {
    const delta = value - meanIndependent;
    numerator += delta * (dependent[index] - meanDependent);
    denominator += delta * delta;
  });
  return {
    slope: denominator > 0 ? numerator / denominator : 0,
    intercept: meanDependent - (denominator > 0 ? numerator / denominator : 0) * meanIndependent,
    reference: group.reference,
  };
}

function intersectGridLines(vertical, horizontal) {
  const denominator = 1 - vertical.slope * horizontal.slope;
  if (Math.abs(denominator) < 1e-9) return null;
  const y = (horizontal.slope * vertical.intercept + horizontal.intercept) / denominator;
  return [vertical.slope * y + vertical.intercept, y];
}

function findCadSectionControls(cad) {
  const start = cad.startPoint;
  const end = cad.endPoint;
  const centerX = (start[0] + end[0]) / 2;
  const centerY = (start[1] + end[1]) / 2;
  const spanX = Math.abs(end[0] - start[0]);
  const spanY = Math.abs(end[1] - start[1]);
  const nearby = (cad.sectionSegments || []).filter(([a, b]) => {
    const x = (a[0] + b[0]) / 2;
    const y = (a[1] + b[1]) / 2;
    return Math.abs(x - centerX) <= Math.max(700, spanX * 0.9)
      && Math.abs(y - centerY) <= Math.max(650, spanY * 2.5);
  });
  const verticalItems = [];
  const horizontalItems = [];
  nearby.forEach((points) => {
    const [a, b] = points;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (Math.abs(dy) > Math.abs(dx) * 3) {
      const slope = dx / dy;
      verticalItems.push({ points, reference: (a[0] + b[0]) / 2 - slope * ((a[1] + b[1]) / 2 - centerY) });
    } else if (Math.abs(dx) > Math.abs(dy) * 3) {
      const slope = dy / dx;
      horizontalItems.push({ points, reference: (a[1] + b[1]) / 2 - slope * ((a[0] + b[0]) / 2 - centerX) });
    }
  });

  const verticals = clusterGridLines(verticalItems).map((group) => fitGridLine(group, true));
  const horizontals = clusterGridLines(horizontalItems).map((group) => fitGridLine(group, false));
  const leftOf = (value) => verticals
    .filter((line) => line.reference <= value + 20)
    .sort((a, b) => Math.abs(a.reference - value) - Math.abs(b.reference - value))[0];
  const startBoundary = leftOf(start[0]);
  const endBoundary = leftOf(end[0]);
  const low = Math.min(start[1], end[1]) - 20;
  const high = Math.max(start[1], end[1]) + 20;
  const rowBoundary = horizontals
    .filter((line) => line.reference >= low && line.reference <= high)
    .sort((a, b) => Math.min(Math.abs(a.reference - start[1]), Math.abs(a.reference - end[1]))
      - Math.min(Math.abs(b.reference - start[1]), Math.abs(b.reference - end[1])))[0];
  if (!startBoundary || !endBoundary || startBoundary === endBoundary || !rowBoundary) return null;
  const startControl = intersectGridLines(startBoundary, rowBoundary);
  const endControl = intersectGridLines(endBoundary, rowBoundary);
  return startControl && endControl ? [startControl, endControl] : null;
}

function dmsToDecimal(d, m, s, west) {
  const value = d + m / 60 + s / 3600;
  return west ? -value : value;
}

function applyDetectedFields(info) {
  if (info.legal) $('legalInput').value = info.legal;
  if (Number.isFinite(info.lat)) $('latInput').value = info.lat.toFixed(7);
  if (Number.isFinite(info.lon)) $('lonInput').value = info.lon.toFixed(7);
  if (Number.isFinite(info.width)) $('widthInput').value = String(info.width);
  if (Number.isFinite(info.height)) $('heightInput').value = String(info.height);
}

function renderDetectedInfo(info, pages) {
  const found = [];
  if (info.legal) found.push(`<strong>Legal location:</strong> ${escapeHtml(info.legal)}`);
  if (Number.isFinite(info.lat) && Number.isFinite(info.lon)) found.push(`<strong>Coordinate:</strong> ${info.lat.toFixed(6)}, ${info.lon.toFixed(6)}`);
  if (Number.isFinite(info.width) && Number.isFinite(info.height)) found.push(`<strong>Likely dimensions:</strong> ${info.width} m × ${info.height} m`);
  if (info.traverse) found.push(`<strong>Survey boundary:</strong> ${info.traverse.segments.length} bearing-and-distance calls`);
  if (info.cadBoundary) found.push(`<strong>Proposed CAD boundary:</strong> vector layer found between ${escapeHtml(info.legalLocations[0])} and ${escapeHtml(info.legalLocations[1])}`);

  if (!found.length) {
    $('detectedBox').innerHTML = '<strong>No reliable spatial text was detected.</strong><br>This is common with flattened PDFs. Enter the legal location and dimensions shown on the plan, then verify the result on the map.';
    return;
  }

  const sectionOnly = info.legal?.startsWith('SEC-')
    && !Number.isFinite(info.lat) && !Number.isFinite(info.lon);
  const note = info.cadBoundary
    ? 'The proposed corridor is extracted from the PDF CAD layer and aligned from its CAD section lines to Alberta Township System section corners. Confirm the preliminary alignment against the plan and imagery before download.'
    : info.traverse
    ? 'The pad boundary will be reconstructed from the survey calls and positioned from the legal-land tie. Confirm it against the plan and imagery before download.'
    : sectionOnly
    ? 'This identifies the section only. The PDF page does not provide an exact coordinate anchor, so the site position and boundary must be confirmed manually.'
    : 'These values are a starting point only. Map confirmation is still required.';
  $('detectedBox').innerHTML = `<strong>Detected from PDF (${pages} page${pages === 1 ? '' : 's'}):</strong><br>${found.join('<br>')}<br><span class="detected-note">${note}</span>`;
}

function confidenceLabel(info) {
  if (info.cadBoundary && info.legalLocations?.length >= 2) return 'Proposed CAD corridor and two legal anchors found';
  if (info.traverse && info.legal) return 'Survey traverse and legal tie found';
  if (Number.isFinite(info.lat) && Number.isFinite(info.lon) && info.legal) return 'Good spatial anchors found';
  if (Number.isFinite(info.lat) && Number.isFinite(info.lon)) return 'Coordinate found';
  if (info.legal) return 'Legal location found';
  return 'Manual positioning required';
}

function parseLegal(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/[–—]/g, '-').replace(/\s+/g, '');
  let m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{1,3})-(\d{1,2})-?W?([456])M?$/);
  if (m) return { ls: +m[1], sec: +m[2], twp: +m[3], rge: +m[4], mer: +m[5], level: 'lsd' };
  m = s.match(/^(?:SEC-?)?(\d{1,2})-(\d{1,3})-(\d{1,2})-?W?([456])M?$/);
  if (m) return { sec: +m[1], twp: +m[2], rge: +m[3], mer: +m[4], level: 'section' };
  return null;
}

async function locateFromFields() {
  await ensureMap();
  const lat = numberValue('latInput');
  const lon = numberValue('lonInput');

  if (validLatLon(lat, lon)) {
    state.map.setView([lat, lon], 17);
    if (state.atsEnabled) refreshAtsGrid();
    return [lat, lon];
  }

  const legal = parseLegal($('legalInput').value);
  if (!legal) {
    setPdfStatus('Enter a valid latitude/longitude or Alberta legal location such as 11-15-73-17-W4M.');
    return null;
  }

  try {
    setPdfStatus('Locating the legal land description using the Alberta Township System…');
    const feature = await queryAtsLegal(legal);
    state.locatedFeature = feature;
    const center = geojsonCenter(feature.geometry);
    $('latInput').value = center[1].toFixed(7);
    $('lonInput').value = center[0].toFixed(7);
    state.map.fitBounds(window.L.geoJSON(feature).getBounds(), { padding: [30, 30], maxZoom: 17 });
    setPdfStatus('Legal location found. Use the plan and map to adjust the boundary before confirming.');
    if (state.atsEnabled) refreshAtsGrid();
    return [center[1], center[0]];
  } catch (err) {
    setPdfStatus(err.message || 'The legal location could not be found.');
    return null;
  }
}

async function queryAtsLegal(legal) {
  const layer = legal.level === 'lsd' ? 20 : 15;
  const clauses = [`M=${legal.mer}`, `RGE=${legal.rge}`, `TWP=${legal.twp}`, `SEC=${legal.sec}`];
  if (legal.level === 'lsd') clauses.push(`LS=${legal.ls}`);
  const p = new URLSearchParams({
    where: clauses.join(' AND '),
    outFields: legal.level === 'lsd' ? 'M,RGE,TWP,SEC,LS,QS,DESCRIPTOR' : 'M,RGE,TWP,SEC,DESCRIPTOR',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '20'
  });
  const res = await fetch(`${ATS_SERVICE}/${layer}/query?${p}`);
  if (!res.ok) throw new Error(`ATS service returned ${res.status}.`);
  const data = await res.json();
  if (!data.features?.length) throw new Error('No matching ATS parcel was found. Check the legal location.');
  return data.features.find((feature) => !/^RA\b/i.test(feature.properties?.DESCRIPTOR || ''))
    || data.features[0];
}

async function queryAtsSection(legal) {
  return queryAtsLegal({ ...legal, level: 'section' });
}

function sectionGridPosition(section) {
  const rows = [
    [31, 32, 33, 34, 35, 36],
    [30, 29, 28, 27, 26, 25],
    [19, 20, 21, 22, 23, 24],
    [18, 17, 16, 15, 14, 13],
    [7, 8, 9, 10, 11, 12],
    [6, 5, 4, 3, 2, 1],
  ];
  for (let row = 0; row < rows.length; row += 1) {
    const column = rows[row].indexOf(section);
    if (column >= 0) return { row, column };
  }
  return null;
}

function projectedSectionCorner(geometry, eastSide, northSide) {
  const lonLat = [];
  collectCoordinates(geometry.coordinates, lonLat);
  const points = lonLat.map((point) => window.proj4('EPSG:4326', EPSG3400, point));
  if (!points.length) throw new Error('An ATS section corner could not be resolved.');
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const target = [eastSide ? Math.max(...xs) : Math.min(...xs), northSide ? Math.max(...ys) : Math.min(...ys)];
  return points.reduce((closest, point) => (
    Math.hypot(point[0] - target[0], point[1] - target[1])
      < Math.hypot(closest[0] - target[0], closest[1] - target[1]) ? point : closest
  ));
}

async function querySectionWestMidpoint(legal) {
  const p = new URLSearchParams({
    where: `M=${legal.mer} AND RGE=${legal.rge} AND TWP=${legal.twp} AND SEC=${legal.sec}`,
    outFields: 'M,RGE,TWP,SEC,DESCRIPTOR',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '20'
  });
  const res = await fetch(`${ATS_SERVICE}/15/query?${p}`);
  if (!res.ok) throw new Error(`ATS service returned ${res.status}.`);
  const data = await res.json();
  if (!data.features?.length) throw new Error('The section tie point could not be located.');

  const coords = [];
  data.features.forEach((feature) => collectCoordinates(feature.geometry?.coordinates, coords));
  const ys = coords.map((point) => point[1]);
  const middle = (Math.min(...ys) + Math.max(...ys)) / 2;
  const closest = Math.min(...coords.map((point) => Math.abs(point[1] - middle)));
  const candidates = coords.filter((point) => Math.abs(point[1] - middle) <= closest + 1e-7);
  return candidates.reduce((west, point) => point[0] < west[0] ? point : west);
}

function geojsonCenter(geometry) {
  const coords = [];
  collectCoordinates(geometry.coordinates, coords);
  const xs = coords.map((p) => p[0]);
  const ys = coords.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

function collectCoordinates(value, out) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === 'number' && typeof value[1] === 'number') out.push(value);
  else value.forEach((v) => collectCoordinates(v, out));
}

function buildRectangleFromFields() {
  ensureMap().then(async () => {
    let lat = numberValue('latInput');
    let lon = numberValue('lonInput');
    const width = numberValue('widthInput');
    const height = numberValue('heightInput');
    const rotation = numberValue('rotationInput') || 0;

    if (!validLatLon(lat, lon)) {
      const found = await locateFromFields();
      if (!found) return;
      [lat, lon] = found;
    }
    if (!(width > 0 && height > 0)) {
      setPdfStatus('Enter the plan width and height in metres before building the rectangle.');
      return;
    }

    const corners = rectangleCorners(lat, lon, width, height, rotation);
    const layer = window.L.polygon(corners, { color: '#2463a0', weight: 3, fillOpacity: 0.18 });
    replaceBoundary(layer);
    state.map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 18 });
    setPdfStatus('Starting boundary created. Edit or redraw it on the map, then confirm the location and shape.');
  });
}

function rectangleCorners(lat, lon, width, height, rotationDeg) {
  const hw = width / 2;
  const hh = height / 2;
  const theta = rotationDeg * Math.PI / 180;
  const local = [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]];
  return local.map(([east, north]) => {
    const e = east * Math.cos(theta) + north * Math.sin(theta);
    const n = -east * Math.sin(theta) + north * Math.cos(theta);
    return offsetLatLon(lat, lon, e, n);
  });
}

function offsetLatLon(lat, lon, eastM, northM) {
  const r = 6378137;
  const dLat = northM / r;
  const dLon = eastM / (r * Math.cos(lat * Math.PI / 180));
  return [lat + dLat * 180 / Math.PI, lon + dLon * 180 / Math.PI];
}

async function buildCadBoundaryFromDetected() {
  const cad = state.detected.cadBoundary;
  const legalValues = state.detected.legalLocations?.slice(0, 2) || [];
  if (!cad || legalValues.length < 2) return;

  try {
    let legal = legalValues.map(parseLegal);
    if (legal.some((value) => !value)) throw new Error('Two valid endpoint legal locations are required.');
    const positions = legal.map((value) => sectionGridPosition(value.sec));
    if (positions.some((value) => !value)
      || legal[0].twp !== legal[1].twp || legal[0].rge !== legal[1].rge || legal[0].mer !== legal[1].mer) {
      throw new Error('The ATS section-grid control could not be resolved for these endpoints.');
    }
    if (positions[1].column < positions[0].column) {
      legal = [legal[1], legal[0]];
      positions.reverse();
    }
    if (positions[0].column === positions[1].column || positions[0].row === positions[1].row) {
      throw new Error('Two crossing ATS section-grid controls are required for this preliminary corridor.');
    }

    const sourceControls = findCadSectionControls(cad);
    if (!sourceControls) throw new Error('The PDF section lines could not be matched to the corridor.');
    const [startSection, endSection] = await Promise.all(legal.map(queryAtsSection));
    const endIsNorth = positions[1].row < positions[0].row;
    const startMetres = projectedSectionCorner(startSection.geometry, false, endIsNorth);
    const endMetres = projectedSectionCorner(endSection.geometry, false, !endIsNorth);
    const sourceVector = [
      sourceControls[1][0] - sourceControls[0][0],
      -(sourceControls[1][1] - sourceControls[0][1]),
    ];
    const targetVector = [
      endMetres[0] - startMetres[0],
      endMetres[1] - startMetres[1],
    ];
    const sourceLength = Math.hypot(...sourceVector);
    const targetLength = Math.hypot(...targetVector);
    if (!(sourceLength > 0 && targetLength > 0)) throw new Error('The proposed corridor endpoints could not be resolved.');
    const scale = targetLength / sourceLength;
    const rotation = Math.atan2(targetVector[1], targetVector[0])
      - Math.atan2(sourceVector[1], sourceVector[0]);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const corners = cad.points.map((point) => {
      const x = point[0] - sourceControls[0][0];
      const y = -(point[1] - sourceControls[0][1]);
      const metres = [
        startMetres[0] + scale * (x * cos - y * sin),
        startMetres[1] + scale * (x * sin + y * cos),
      ];
      const [lon, lat] = window.proj4(EPSG3400, 'EPSG:4326', metres);
      return [lat, lon];
    });

    const layer = window.L.polygon(corners, { color: '#d85817', weight: 3, fillOpacity: 0.22 });
    replaceBoundary(layer);
    state.map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 16 });
    const center = layer.getBounds().getCenter();
    $('latInput').value = center.lat.toFixed(7);
    $('lonInput').value = center.lng.toFixed(7);
    setPdfStatus(`Preliminary corridor polygon extracted from CAD layer P-PROPOSED and aligned from the ATS section grid between ${legalValues[0]} and ${legalValues[1]}. Verify the orange boundary before confirming.`);
  } catch (err) {
    console.error('The proposed CAD corridor could not be positioned.', err);
    setPdfStatus(`The proposed CAD layer was found, but it could not be positioned: ${err.message || err}`);
  }
}

async function buildTraverseFromDetected(located) {
  const traverse = state.detected.traverse;
  if (!traverse?.segments?.length) return;

  let origin;
  let tiedToSurvey = false;
  try {
    const legal = parseLegal($('legalInput').value);
    const sectionPoint = await querySectionWestMidpoint(legal);
    const tieRadians = traverse.tie.bearing * Math.PI / 180;
    origin = offsetLatLon(
      sectionPoint[1],
      sectionPoint[0],
      traverse.tie.distance * Math.sin(tieRadians),
      traverse.tie.distance * Math.cos(tieRadians)
    );
    tiedToSurvey = true;
  } catch (err) {
    console.warn('Survey tie could not be resolved; centring the traverse on the located parcel.', err);
  }

  const offsets = [[0, 0]];
  let east = 0;
  let north = 0;
  traverse.segments.forEach((segment) => {
    const radians = segment.bearing * Math.PI / 180;
    east += segment.distance * Math.sin(radians);
    north += segment.distance * Math.cos(radians);
    offsets.push([east, north]);
  });
  if (Math.hypot(east, north) < 1) offsets.pop();

  if (!origin) {
    const fallback = located || [state.map.getCenter().lat, state.map.getCenter().lng];
    const eastValues = offsets.map((point) => point[0]);
    const northValues = offsets.map((point) => point[1]);
    const centreEast = (Math.min(...eastValues) + Math.max(...eastValues)) / 2;
    const centreNorth = (Math.min(...northValues) + Math.max(...northValues)) / 2;
    origin = offsetLatLon(fallback[0], fallback[1], -centreEast, -centreNorth);
  }

  const corners = offsets.map(([eastOffset, northOffset]) => (
    offsetLatLon(origin[0], origin[1], eastOffset, northOffset)
  ));
  const layer = window.L.polygon(corners, { color: '#c6382f', weight: 3, fillOpacity: 0.2 });
  replaceBoundary(layer);
  state.map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 18 });
  const center = layer.getBounds().getCenter();
  $('latInput').value = center.lat.toFixed(7);
  $('lonInput').value = center.lng.toFixed(7);
  setPdfStatus(tiedToSurvey
    ? 'Pad polygon created from the survey bearings, distances, and legal-land tie. Verify the red boundary before confirming.'
    : 'Pad polygon created from the survey bearings and distances, centred on the located parcel. Move it to the surveyed position before confirming.');
}

function replaceBoundary(layer) {
  state.drawn.clearLayers();
  state.drawn.addLayer(layer);
  state.candidate = layer;
  invalidateConfirmation();
  updateBoundarySummary();
}

function firstBoundaryLayer() {
  let layer = null;
  state.drawn.eachLayer((l) => { if (!layer) layer = l; });
  return layer;
}

function updateBoundarySummary() {
  const layer = state.candidate || firstBoundaryLayer();
  if (!layer) {
    $('boundarySummary').textContent = 'No boundary has been created yet.';
    $('confirmBoundary').disabled = true;
    return;
  }
  const gj = layer.toGeoJSON();
  const ring = gj.geometry.type === 'Polygon' ? gj.geometry.coordinates[0] : null;
  const area = ring ? polygonAreaApprox(ring) : null;
  const hectares = area ? area / 10000 : null;
  const center = layer.getBounds().getCenter();
  $('boundarySummary').innerHTML = `<strong>Boundary ready for review.</strong> ${hectares ? `Approx. ${hectares.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ha. ` : ''}Map centre ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}.`;
  $('confirmBoundary').disabled = false;
}

function polygonAreaApprox(ring) {
  if (!ring?.length) return 0;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length * Math.PI / 180;
  const r = 6378137;
  const xy = ring.map(([lon, lat]) => [lon * Math.PI / 180 * r * Math.cos(lat0), lat * Math.PI / 180 * r]);
  let area = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) area += xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1];
  return Math.abs(area) / 2;
}

function confirmBoundary() {
  const layer = state.candidate || firstBoundaryLayer();
  if (!layer) return;
  state.confirmed = true;
  $('confirmBoundary').textContent = '✓ Location and boundary confirmed';
  $('confirmBoundary').classList.add('confirmed');
  $('downloadBoundary').disabled = false;
  $('downloadTitle').textContent = 'Boundary confirmed. Shapefile download is enabled.';
  $('boundarySummary').innerHTML = '<strong>Confirmed.</strong> Any further geometry edit or location-field change will require confirmation again.';
}

function invalidateConfirmation() {
  state.confirmed = false;
  $('confirmBoundary').textContent = 'Confirm location and boundary';
  $('confirmBoundary').classList.remove('confirmed');
  $('downloadBoundary').disabled = true;
  $('downloadTitle').textContent = 'Confirm the boundary to enable download.';
  if (state.candidate || firstBoundaryLayer()) $('confirmBoundary').disabled = false;
}

async function downloadBoundary() {
  if (!state.confirmed) return;
  const layer = state.candidate || firstBoundaryLayer();
  if (!layer) return;

  try {
    const source = layer.toGeoJSON();
    const projectedGeometry = transformGeometry(source.geometry);
    const legal = $('legalInput').value.trim();
    const fc = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: projectedGeometry,
        properties: {
          UNIQUE_ID: 'PDFPLAN1',
          SOURCE: 'PDF_PLAN',
          CONFIRMED: 'YES',
          LEGAL_LOC: legal.slice(0, 40)
        }
      }]
    };

    const result = window.shpwrite.zip(fc, {
      folder: 'PDF_Plan_Boundary',
      filename: 'PDF_Plan_Boundary',
      outputType: 'arraybuffer',
      compression: 'STORE'
    });
    const payload = result instanceof Promise ? await result : result;
    const zip = await window.JSZip.loadAsync(payload);
    const prjFiles = Object.keys(zip.files).filter((name) => name.toLowerCase().endsWith('.prj'));
    prjFiles.forEach((name) => zip.file(name, NAD83_10TM_WKT));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'PDF_Plan_Boundary_10TM.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setPdfStatus('Confirmed boundary shapefile created in NAD 1983 10TM AEP Forest.');
  } catch (err) {
    console.error(err);
    setPdfStatus(`The shapefile could not be created: ${err.message || err}`);
  }
}

function transformGeometry(geometry) {
  return { ...geometry, coordinates: transformCoords(geometry.coordinates) };
}

function transformCoords(value) {
  if (!Array.isArray(value)) return value;
  if (typeof value[0] === 'number' && typeof value[1] === 'number') {
    return window.proj4('EPSG:4326', EPSG3400, [value[0], value[1]]);
  }
  return value.map(transformCoords);
}

async function toggleAts() {
  await ensureMap();
  state.atsEnabled = !state.atsEnabled;
  $('toggleAts').textContent = `ATS grid: ${state.atsEnabled ? 'on' : 'off'}`;
  if (!state.atsEnabled) {
    if (state.atsLayer) state.atsLayer.clearLayers();
    return;
  }
  refreshAtsGrid();
}

async function refreshAtsGrid() {
  if (!state.map || !state.atsEnabled || state.map.getZoom() < 11) {
    if (state.atsLayer) state.atsLayer.clearLayers();
    return;
  }

  const b = state.map.getBounds();
  const envelope = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
  const p = new URLSearchParams({
    where: '1=1',
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'M,RGE,TWP,SEC,LS,QS,DESCRIPTOR',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '800'
  });

  try {
    const res = await fetch(`${ATS_SERVICE}/20/query?${p}`);
    if (!res.ok) return;
    const data = await res.json();
    if (state.atsLayer) state.atsLayer.clearLayers();
    else state.atsLayer = window.L.geoJSON(null, {
      style: { color: '#6b7f91', weight: 1, fillOpacity: 0 },
      onEachFeature: (feature, layer) => {
        const a = feature.properties || {};
        layer.bindTooltip(`LSD ${a.LS}, Sec. ${a.SEC}-${a.TWP}-${a.RGE}-W${a.M}M`, { sticky: true });
      }
    }).addTo(state.map);
    state.atsLayer.addData(data);
    state.atsLayer.bringToBack();
  } catch {
    // Keep the map usable if the ATS service is temporarily unavailable.
  }
}

async function toggleDispositions() {
  await ensureMap();
  state.dispositionsEnabled = !state.dispositionsEnabled;
  const button = $('toggleDispositions');
  if (button) button.textContent = `Active dispositions: ${state.dispositionsEnabled ? 'on' : 'off'}`;
  if (!state.dispositionsEnabled) {
    state.dispositionRequestId += 1;
    if (state.dispositionsLayer) {
      state.map.removeLayer(state.dispositionsLayer);
      state.dispositionsLayer = null;
    }
    return;
  }
  refreshDispositions();
}

async function refreshDispositions() {
  if (!state.map || !state.dispositionsEnabled) return;
  const button = $('toggleDispositions');
  if (state.map.getZoom() < 11) {
    if (state.dispositionsLayer) {
      state.map.removeLayer(state.dispositionsLayer);
      state.dispositionsLayer = null;
    }
    if (button) button.textContent = 'Active dispositions: on (zoom in)';
    return;
  }

  const requestId = ++state.dispositionRequestId;
  if (button) button.textContent = 'Active dispositions: loading…';
  const bounds = state.map.getBounds();
  const sw = window.L.CRS.EPSG3857.project(bounds.getSouthWest());
  const ne = window.L.CRS.EPSG3857.project(bounds.getNorthEast());
  const size = state.map.getSize();
  const params = new URLSearchParams({
    bbox: `${sw.x},${sw.y},${ne.x},${ne.y}`,
    bboxSR: '3857',
    targetSR: '3857',
    layers: '170(show:9,10,11,12,15)',
    imageWidth: String(Math.min(1600, Math.max(500, Math.round(size.x)))),
    imageHeight: String(Math.min(1600, Math.max(500, Math.round(size.y)))),
    outputFormat: 'Png',
    transparentBackground: 'true',
    f: 'json'
  });

  try {
    const res = await fetch(`${ONESTOP_EXPORT}?${params}`);
    if (!res.ok) throw new Error(`OneStop export returned ${res.status}.`);
    const data = await res.json();
    if (requestId !== state.dispositionRequestId || !state.dispositionsEnabled) return;
    const href = data.href || data.url || data.imageUrl;
    if (!href) throw new Error('OneStop did not return a map image.');
    const imageUrl = new URL(href, ONESTOP_EXPORT).href;
    if (state.dispositionsLayer) state.map.removeLayer(state.dispositionsLayer);
    state.dispositionsLayer = window.L.imageOverlay(imageUrl, bounds, {
      opacity: 0.72,
      interactive: false,
      crossOrigin: true
    }).addTo(state.map);
    state.drawn.eachLayer((layer) => layer.bringToFront?.());
    if (button) {
      button.textContent = 'Active dispositions: on';
      button.title = 'Current AEP and AER disposition layers from the public OneStop Asset map service.';
    }
  } catch (err) {
    console.error('Active dispositions could not be loaded', err);
    if (requestId !== state.dispositionRequestId) return;
    if (button) {
      button.textContent = 'Active dispositions: unavailable';
      button.title = err.message || String(err);
    }
  }
}

function fitBoundary() {
  const layer = state.candidate || firstBoundaryLayer();
  if (layer && state.map) state.map.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 18 });
}

function numberValue(id) {
  const v = Number($(id).value);
  return Number.isFinite(v) ? v : null;
}

function validLatLon(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 48 && lat <= 61 && lon >= -121 && lon <= -109;
}

function setPdfStatus(text) {
  $('pdfStatus').textContent = text;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

function wireEvents() {
  $('planPdfInput').addEventListener('change', (e) => handlePdf(e.target.files?.[0]));
  const drop = $('planPdfDrop');
  ['dragenter', 'dragover'].forEach((name) => drop.addEventListener(name, (e) => {
    e.preventDefault();
    drop.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach((name) => drop.addEventListener(name, (e) => {
    e.preventDefault();
    drop.classList.remove('dragging');
  }));
  drop.addEventListener('drop', (e) => handlePdf(e.dataTransfer.files?.[0]));

  $('locatePlan').addEventListener('click', locateFromFields);
  $('applyRectangle').addEventListener('click', buildRectangleFromFields);
  $('toggleAts').addEventListener('click', toggleAts);
  $('toggleDispositions')?.addEventListener('click', toggleDispositions);
  $('fitBoundary').addEventListener('click', fitBoundary);
  $('confirmBoundary').addEventListener('click', confirmBoundary);
  $('downloadBoundary').addEventListener('click', downloadBoundary);

  ['legalInput','latInput','lonInput','widthInput','heightInput','rotationInput'].forEach((id) => {
    $(id).addEventListener('input', invalidateConfirmation);
  });
}

(async () => {
  wireEvents();
  try {
    await ensureMap();
  } catch (err) {
    console.error(err);
    setPdfStatus(`The map libraries could not be loaded: ${err.message || err}`);
  }
})();
