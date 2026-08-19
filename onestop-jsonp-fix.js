const ONESTOP_EXPORT_PREFIX = 'https://extmapviewer.aer.ca/Geocortex/Essentials/public/REST/sites/OneStop/map/export';
const nativeFetch = window.fetch.bind(window);
let callbackCounter = 0;

function normalizeOneStopImageUrl(value) {
  if (!value || typeof value !== 'string') return value;
  let url = value.trim();
  if (url.startsWith('//')) url = `https:${url}`;
  if (url.startsWith('http://extmapviewer.aer.ca/')) {
    url = `https://${url.slice('http://'.length)}`;
  }
  return url;
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
  const patched = function imageOverlayWithoutForcedCors(imageUrl, bounds, options) {
    let finalUrl = imageUrl;
    if (String(imageUrl || '').includes('extmapviewer.aer.ca')) {
      finalUrl = normalizeOneStopImageUrl(String(imageUrl));
      const safeOptions = { ...(options || {}) };
      delete safeOptions.crossOrigin;
      const overlay = originalImageOverlay.call(window.L, finalUrl, bounds, safeOptions);
      overlay.once('error', () => {
        console.error('OneStop disposition image failed to load:', finalUrl);
      });
      return overlay;
    }
    return originalImageOverlay.call(window.L, finalUrl, bounds, options);
  };
  patched.__oneStopCorsFixed = true;
  window.L.imageOverlay = patched;
}

patchLeafletImageOverlay();
