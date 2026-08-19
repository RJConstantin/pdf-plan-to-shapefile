const ONESTOP_EXPORT_PREFIX = 'https://extmapviewer.aer.ca/Geocortex/Essentials/public/REST/sites/OneStop/map/export';
const ONESTOP_PUBLIC_REST = 'https://extmapviewer.aer.ca/Geocortex/Essentials/public/REST';
const nativeFetch = window.fetch.bind(window);
let callbackCounter = 0;

function normalizeOneStopImageUrl(value) {
  if (!value || typeof value !== 'string') return value;
  const raw = value.trim();

  // Geocortex export responses may contain a short-lived TempFiles URL built
  // from an internal server name or from a REST base that is not externally
  // reachable. Never trust that host. Preserve only the TempFiles path/query
  // and rebuild it on the known public OneStop REST instance.
  try {
    const parsed = new URL(raw, `${ONESTOP_PUBLIC_REST}/`);
    const match = parsed.pathname.match(/\/TempFiles\/(.*)$/i);
    if (match) {
      return `${ONESTOP_PUBLIC_REST}/TempFiles/${match[1]}${parsed.search}${parsed.hash}`;
    }

    if (parsed.hostname.toLowerCase() === 'extmapviewer.aer.ca') {
      parsed.protocol = 'https:';
      return parsed.href;
    }
  } catch {
    const marker = raw.toLowerCase().indexOf('tempfiles/');
    if (marker >= 0) {
      const remainder = raw.slice(marker + 'tempfiles/'.length).replace(/^\/+/, '');
      return `${ONESTOP_PUBLIC_REST}/TempFiles/${remainder}`;
    }
  }

  return raw;
}

function normalizeOneStopResponse(data) {
  if (!data || typeof data !== 'object') return data;
  const copy = { ...data };
  ['href', 'url', 'imageUrl'].forEach((key) => {
    if (typeof copy[key] === 'string') copy[key] = normalizeOneStopImageUrl(copy[key]);
  });
  return copy;
}

function jsonpOneStop(url) {
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
      resolve(normalizeOneStopResponse(data));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('OneStop disposition request could not be loaded.'));
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('OneStop disposition request timed out.'));
    }, 20000);

    script.src = requestUrl.href;
    document.head.appendChild(script);
  });
}

window.fetch = async function patchedFetch(input, init) {
  const url = typeof input === 'string' ? input : input?.url;
  if (!url || !url.startsWith(ONESTOP_EXPORT_PREFIX)) {
    return nativeFetch(input, init);
  }

  const data = await jsonpOneStop(url);
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
};

function patchLeafletImageOverlay() {
  if (!window.L?.imageOverlay) {
    setTimeout(patchLeafletImageOverlay, 100);
    return;
  }
  if (window.L.imageOverlay.__oneStopCorsFixed) return;

  const originalImageOverlay = window.L.imageOverlay;
  const patched = function normalizedImageOverlay(imageUrl, bounds, options) {
    const raw = String(imageUrl || '');
    const isOneStopTemp = /tempfiles\//i.test(raw) || /extmapviewer\.aer\.ca/i.test(raw);
    if (isOneStopTemp) {
      const finalUrl = normalizeOneStopImageUrl(raw);
      const safeOptions = { ...(options || {}) };
      delete safeOptions.crossOrigin;
      const overlay = originalImageOverlay.call(window.L, finalUrl, bounds, safeOptions);
      overlay.once('error', () => {
        console.error('OneStop disposition image failed to load:', finalUrl);
        const button = document.getElementById('toggleDispositions');
        if (button) {
          button.textContent = 'Active dispositions: unavailable';
          button.title = 'The OneStop map export succeeded, but its temporary image could not be loaded.';
        }
        try { overlay.remove(); } catch {}
      });
      return overlay;
    }
    return originalImageOverlay.call(window.L, imageUrl, bounds, options);
  };
  patched.__oneStopCorsFixed = true;
  window.L.imageOverlay = patched;
}

patchLeafletImageOverlay();
