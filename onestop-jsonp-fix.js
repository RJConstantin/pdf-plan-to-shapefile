const ONESTOP_EXPORT_PREFIX = 'https://extmapviewer.aer.ca/Geocortex/Essentials/public/REST/sites/OneStop/map/export';
const nativeFetch = window.fetch.bind(window);
let callbackCounter = 0;

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
      resolve(data);
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
    if (String(imageUrl || '').includes('extmapviewer.aer.ca')) {
      const safeOptions = { ...(options || {}) };
      delete safeOptions.crossOrigin;
      return originalImageOverlay.call(window.L, imageUrl, bounds, safeOptions);
    }
    return originalImageOverlay.call(window.L, imageUrl, bounds, options);
  };
  patched.__oneStopCorsFixed = true;
  window.L.imageOverlay = patched;
}

patchLeafletImageOverlay();
