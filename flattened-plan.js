import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.worker.min.mjs';

const $ = (id) => document.getElementById(id);
const EPSG3400 = '+proj=tmerc +lat_0=0 +lon_0=-115 +k=0.9992 +x_0=500000 +y_0=0 +datum=NAD83 +units=m +no_defs +type=crs';

let running = false;
let flattenedMode = false;
let currentLegal = null;
let lastAnchor = null;
let anchorLocked = false;

function injectStyles() {
  if ($('flattenedPlanStyles')) return;
  const style = document.createElement('style');
  style.id = 'flattenedPlanStyles';
  style.textContent = `
    .flattened-only{display:none}
    body.flattened-plan-mode .flattened-only{display:block}
    body.flattened-plan-mode .flattened-coordinate-row{display:none!important}
    body.flattened-plan-mode .flattened-manual-details{display:none}
    body.flattened-plan-mode.show-plan-details .flattened-manual-details{display:grid}
    .flattened-banner{display:none;margin:0 0 16px;padding:14px 16px;border:1px solid #c8dbea;border-radius:9px;background:#eef5fb;color:#405d73;font-size:12px;line-height:1.5}
    body.flattened-plan-mode .flattened-banner{display:block}
    .flattened-banner strong{color:#172229}
    .anchor-panel,.position-panel{margin:18px 0 20px;border:1px solid #c9dceb;background:#f5f9fc;border-radius:11px;padding:18px}
    .anchor-panel h3,.position-panel h3{margin:5px 0 6px;font:700 18px/1.25 Arial,Helvetica,sans-serif;color:#172229}
    .anchor-panel p,.position-panel p{margin:0 0 14px;color:#61717d;font-size:11px;line-height:1.55}
    .anchor-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
    .anchor-grid label,.coord-inputs label,.move-options label{display:grid;gap:5px;color:#536675;font-size:11px;font-weight:700}
    .anchor-grid select,.coord-inputs input,.coord-inputs select,.move-options select{width:100%;height:39px;border:1px solid #c8d6e1;border-radius:6px;background:#fff;padding:0 9px;color:#172229;font:12px Arial,Helvetica,sans-serif}
    .coord-inputs{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
    .coord-inputs.three{grid-template-columns:130px 1fr 1fr}
    .anchor-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px}
    .anchor-primary{border:0;background:#2463a0;color:#fff;border-radius:6px;padding:11px 15px;font-size:12px;font-weight:700;cursor:pointer}
    .anchor-primary:hover{background:#174a78}
    .details-toggle,.move-pad button,.rotate-controls button{border:1px solid #b9ccdd;background:#fff;color:#2463a0;border-radius:6px;font-weight:700;cursor:pointer}
    .details-toggle{padding:9px 11px;font-size:11px}
    .details-toggle:hover,.move-pad button:hover,.rotate-controls button:hover{background:#eaf2f9}
    .anchor-status{margin-top:10px;color:#5c7182;font-size:11px;line-height:1.45}
    .anchor-tip{margin-top:12px;padding-top:11px;border-top:1px solid #d9e5ef;color:#677784;font-size:10px;line-height:1.5}
    .move-layout{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center}
    .move-pad{display:grid;grid-template-columns:44px 44px 44px;grid-template-rows:40px 40px 40px;gap:5px;justify-content:start}
    .move-pad button{font-size:16px}.move-pad .north{grid-column:2;grid-row:1}.move-pad .west{grid-column:1;grid-row:2}.move-pad .centre{grid-column:2;grid-row:2;color:#6c7d89;font-size:10px;cursor:default}.move-pad .east{grid-column:3;grid-row:2}.move-pad .south{grid-column:2;grid-row:3}
    .move-options{display:grid;gap:11px}.rotate-controls{display:flex;gap:6px;flex-wrap:wrap}.rotate-controls button{padding:8px 10px;font-size:11px}
    .flattened-note{margin-top:13px;padding-top:12px;border-top:1px solid #d9e5ef;color:#677784;font-size:10px;line-height:1.5}
    .meridian-row{margin:10px 0 0;padding:10px 12px;border:1px solid #d7e2ec;border-radius:7px;background:#f7fafc;font:12px Arial,Helvetica,sans-serif;color:#536776}
    .meridian-row select{margin-left:8px;padding:5px 7px;border:1px solid #c8d5df;border-radius:5px}
    @media(max-width:700px){.anchor-grid,.coord-inputs,.coord-inputs.three,.move-layout{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function prepareDom() {
  const lat = $('latInput');
  const coordRow = lat?.closest('.two-fields');
  if (coordRow) coordRow.classList.add('flattened-coordinate-row');

  const width = $('widthInput');
  const widthRow = width?.closest('.two-fields');
  if (widthRow) widthRow.classList.add('flattened-manual-details');
  const rotation = $('rotationInput');
  const rotationLabel = rotation?.closest('label');
  if (rotationLabel) rotationLabel.classList.add('flattened-manual-details');

  if (!$('flattenedBanner')) {
    const banner = document.createElement('div');
    banner.id = 'flattenedBanner';
    banner.className = 'flattened-banner';
    banner.innerHTML = '<strong>Image-based plan mode.</strong> Use one known pad corner as the spatial anchor. The legal location is only used as a map reference and is not treated as the site coordinate.';
    $('detectedBox')?.insertAdjacentElement('beforebegin', banner);
  }

  if (!$('anchorPanel')) {
    const panel = document.createElement('section');
    panel.id = 'anchorPanel';
    panel.className = 'anchor-panel flattened-only';
    panel.innerHTML = `
      <div class="step-label">Anchor corner</div>
      <h3>Place the pad from one known corner.</h3>
      <p>Select which corner the survey coordinate represents, choose the coordinate style used on the plan, and enter that coordinate. The tool will calculate the pad centre from the detected dimensions and bearing.</p>

      <div class="anchor-grid">
        <label>Anchor corner
          <select id="anchorCorner">
            <option value="NW">Northwest (NW)</option>
            <option value="NE">Northeast (NE)</option>
            <option value="SE">Southeast (SE)</option>
            <option value="SW">Southwest (SW)</option>
          </select>
        </label>
        <label>Coordinate style
          <select id="anchorCoordStyle">
            <option value="utm">UTM NAD83</option>
            <option value="10tm">Alberta 10TM AEP Forest</option>
            <option value="dd">Latitude / Longitude - Decimal Degrees</option>
            <option value="dms">Latitude / Longitude - DMS</option>
          </select>
        </label>
      </div>

      <div id="anchorCoordInputs"></div>

      <div class="anchor-actions">
        <button type="button" class="anchor-primary" id="placeFromAnchor">Place pad from anchor</button>
        <button type="button" class="details-toggle" id="togglePlanDetails">Show / correct dimensions & bearing</button>
      </div>
      <div class="anchor-status" id="anchorStatus">Enter the coordinate printed on the plan for the selected corner.</div>
      <div class="anchor-tip">For UTM, select the zone shown on the plan. For Alberta 10TM, enter the 10TM Easting and Northing. The entered corner remains fixed when you adjust the pad rotation from the controls below.</div>
    `;
    document.querySelector('.map-card')?.insertAdjacentElement('beforebegin', panel);

    $('anchorCoordStyle')?.addEventListener('change', renderCoordinateInputs);
    $('placeFromAnchor')?.addEventListener('click', () => placeFromAnchor(false));
    $('togglePlanDetails')?.addEventListener('click', () => document.body.classList.toggle('show-plan-details'));
    renderCoordinateInputs();
  }

  if (!$('flattenedPositionPanel')) {
    const panel = document.createElement('section');
    panel.id = 'flattenedPositionPanel';
    panel.className = 'position-panel flattened-only';
    panel.innerHTML = `
      <div class="step-label">Fine adjustment - optional</div>
      <h3>Adjust the placed pad if needed.</h3>
      <p>The anchor method should do the main placement. Use these controls only if the plan or imagery shows that a small manual adjustment is needed.</p>
      <div class="move-layout">
        <div class="move-pad" aria-label="Move whole pad">
          <button type="button" class="north" data-move="north" title="Move north">↑</button>
          <button type="button" class="west" data-move="west" title="Move west">←</button>
          <button type="button" class="centre" tabindex="-1" aria-hidden="true">PAD</button>
          <button type="button" class="east" data-move="east" title="Move east">→</button>
          <button type="button" class="south" data-move="south" title="Move south">↓</button>
        </div>
        <div class="move-options">
          <label>Move each click
            <select id="moveStep">
              <option value="1">1 m</option>
              <option value="5">5 m</option>
              <option value="10" selected>10 m</option>
              <option value="25">25 m</option>
              <option value="50">50 m</option>
            </select>
          </label>
          <div>
            <div style="color:#536675;font-size:11px;font-weight:700;margin-bottom:5px">Rotate whole pad</div>
            <div class="rotate-controls">
              <button type="button" data-rotate="-1">-1°</button>
              <button type="button" data-rotate="-0.1">-0.1°</button>
              <button type="button" data-rotate="0.1">+0.1°</button>
              <button type="button" data-rotate="1">+1°</button>
            </div>
          </div>
        </div>
      </div>
      <div class="flattened-note">Moving the whole pad after anchor placement intentionally moves it away from the entered anchor. Rotation keeps the anchor corner fixed until a manual move is made.</div>
    `;
    document.querySelector('.map-card')?.insertAdjacentElement('beforebegin', panel);
    panel.querySelectorAll('[data-move]').forEach((button) => button.addEventListener('click', () => movePad(button.dataset.move)));
    panel.querySelectorAll('[data-rotate]').forEach((button) => button.addEventListener('click', () => rotatePad(Number(button.dataset.rotate))));
  }

  $('locatePlan')?.addEventListener('click', () => {
    if (flattenedMode) clearCentroidAfterLsdLocate();
  });
}

function renderCoordinateInputs() {
  const host = $('anchorCoordInputs');
  if (!host) return;
  const style = $('anchorCoordStyle')?.value || 'utm';

  if (style === 'utm') {
    host.innerHTML = `
      <div class="coord-inputs three">
        <label>UTM zone
          <select id="anchorZone"><option value="11">11N</option><option value="12" selected>12N</option></select>
        </label>
        <label>Easting (m)<input id="anchorEasting" type="number" step="any" placeholder="450136.01"></label>
        <label>Northing (m)<input id="anchorNorthing" type="number" step="any" placeholder="6313103.49"></label>
      </div>`;
  } else if (style === '10tm') {
    host.innerHTML = `
      <div class="coord-inputs">
        <label>10TM Easting (m)<input id="anchorEasting" type="number" step="any" placeholder="500000"></label>
        <label>10TM Northing (m)<input id="anchorNorthing" type="number" step="any" placeholder="6300000"></label>
      </div>`;
  } else if (style === 'dd') {
    host.innerHTML = `
      <div class="coord-inputs">
        <label>Latitude<input id="anchorLatitude" type="number" step="any" placeholder="56.958842"></label>
        <label>Longitude<input id="anchorLongitude" type="number" step="any" placeholder="-111.819941"></label>
      </div>`;
  } else {
    host.innerHTML = `
      <div class="coord-inputs">
        <label>Latitude DMS<input id="anchorLatitudeDms" type="text" placeholder="56°57'31.83\"N"></label>
        <label>Longitude DMS<input id="anchorLongitudeDms" type="text" placeholder="111°49'11.79\"W"></label>
      </div>`;
  }
  lastAnchor = null;
  anchorLocked = false;
}

function enterFlattenedMode() {
  flattenedMode = true;
  document.body.classList.add('flattened-plan-mode');
  document.body.classList.remove('show-plan-details');
  if ($('locatePlan')) $('locatePlan').textContent = 'Show LSD on map';
  if ($('applyRectangle')) $('applyRectangle').textContent = 'Rebuild from centre';
  $('ocrMeridianRow')?.remove();
  lastAnchor = null;
  anchorLocked = false;
}

function exitFlattenedMode() {
  flattenedMode = false;
  currentLegal = null;
  lastAnchor = null;
  anchorLocked = false;
  document.body.classList.remove('flattened-plan-mode', 'show-plan-details');
  $('ocrMeridianRow')?.remove();
  if ($('locatePlan')) $('locatePlan').textContent = 'Locate on map';
  if ($('applyRectangle')) $('applyRectangle').textContent = 'Build / reset rectangle';
}

function setValue(id, value) {
  const el = $(id);
  if (!el || value == null || value === '') return;
  el.value = String(value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function clearFlattenedFields() {
  ['legalInput','latInput','lonInput','widthInput','heightInput'].forEach((id) => {
    const el = $(id);
    if (el) el.value = '';
  });
  if ($('rotationInput')) $('rotationInput').value = '0';
}

function cleanText(text) {
  return String(text || '').replace(/[–—]/g, '-').replace(/[|]/g, 'I').replace(/\s+/g, ' ').trim();
}

function detectMeridian(text) {
  const patterns = [
    /\bW\s*([456])\s*M\b/i,
    /\bWEST\s+OF\s+(?:THE\s+)?([456])(?:ST|ND|RD|TH)?\s+MERIDIAN\b/i,
    /\b([456])(?:ST|ND|RD|TH)\s+MERIDIAN\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

function detectLegal(text) {
  const focused = text.match(/(?:PAD\s*SITE|WELL\s*SITE|SITE|PAD)[^0-9]{0,50}(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{2,3})\s*-\s*(\d{1,2})/i);
  const general = text.match(/\b(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{2,3})\s*-\s*(\d{1,2})\b/);
  const m = focused || general;
  if (!m) return null;
  const legal = { lsd:+m[1], sec:+m[2], twp:+m[3], rge:+m[4], mer:detectMeridian(text) };
  if (legal.lsd < 1 || legal.lsd > 16 || legal.sec < 1 || legal.sec > 36 || legal.twp < 1 || legal.twp > 126 || legal.rge < 1 || legal.rge > 34) return null;
  return legal;
}

function detectDimensions(text) {
  const nums = [...text.matchAll(/\b(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:M|METRES?)?\b/gi)]
    .map((m) => Number(m[1].replace(',', '.')))
    .filter((v) => Number.isFinite(v) && v >= 20 && v <= 500);
  const counts = new Map();
  nums.forEach((v) => { const k = Math.round(v * 10) / 10; counts.set(k, (counts.get(k) || 0) + 1); });
  const ranked = [...counts.entries()].sort((a,b) => b[1]-a[1] || a[0]-b[0]);
  const repeated = ranked.find(([,count]) => count >= 2);
  if (!repeated) return null;
  return { width: repeated[0], height: repeated[0], count: repeated[1] };
}

function detectRotation(text) {
  const matches = [...text.matchAll(/\b(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['’′]\s*(\d{1,2}(?:\.\d+)?)\s*[\"”″]?/g)];
  const options = matches.map((m) => {
    const bearing = +m[1] + (+m[2] / 60) + (+m[3] / 3600);
    const candidates = [bearing - 90, bearing - 270].sort((a,b) => Math.abs(a)-Math.abs(b));
    return { bearing, rotation:candidates[0] };
  }).filter((x) => x.bearing >= 0 && x.bearing < 360 && Math.abs(x.rotation) <= 45)
    .sort((a,b) => Math.abs(a.rotation)-Math.abs(b.rotation));
  return options[0] || null;
}

function formatBearing(value) {
  let d = Math.floor(value);
  const mf = (value - d) * 60;
  let m = Math.floor(mf);
  let s = Math.round((mf - m) * 60);
  if (s === 60) { s = 0; m += 1; }
  if (m === 60) { m = 0; d += 1; }
  return `${d}°${String(m).padStart(2,'0')}'${String(s).padStart(2,'0')}\"`;
}

async function inspectPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const nativeText = tc.items.map((item) => item.str).join(' ').replace(/\s+/g,' ').trim();
  if (nativeText.length > 80) return { flattened:false, nativeText, canvas:null };

  const base = page.getViewport({ scale:1 });
  const scale = Math.min(4.5, 3200 / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext:canvas.getContext('2d',{willReadFrequently:true}), viewport }).promise;
  return { flattened:true, nativeText, canvas };
}

async function runOcr(canvas) {
  const mod = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js');
  const worker = await mod.createWorker('eng', 1, {
    logger:(m) => {
      if (m.status === 'recognizing text' && Number.isFinite(m.progress)) {
        $('pdfStatus').textContent = `Reading image-based plan… ${Math.round(m.progress * 100)}%`;
      }
    }
  });
  await worker.setParameters({ tessedit_pageseg_mode:'11', preserve_interword_spaces:'1' });
  const result = await worker.recognize(canvas);
  await worker.terminate();
  return cleanText(result?.data?.text || '');
}

function renderFindings(legal, dims, rotation) {
  const lines = ['<strong>Image-based plan detected.</strong>'];
  if (legal) lines.push(`Legal location: ${legal.lsd}-${legal.sec}-${legal.twp}-${legal.rge}${legal.mer ? `-W${legal.mer}M` : ''}`);
  if (dims) lines.push(`Likely pad size: ${dims.width} m × ${dims.height} m`);
  if (rotation) lines.push(`Likely top-edge bearing: ${formatBearing(rotation.bearing)}`);
  if (!dims) lines.push('Pad dimensions were not reliable. Use Show / correct dimensions & bearing before placing the pad.');
  lines.push('<span class="detected-note">Enter one known corner coordinate below. The legal location is reference only.</span>');
  $('detectedBox').innerHTML = lines.join('<br>');
}

function showMeridianSelector(legal) {
  $('ocrMeridianRow')?.remove();
  const row = document.createElement('div');
  row.id = 'ocrMeridianRow';
  row.className = 'meridian-row';
  row.innerHTML = '<strong>Meridian was not readable.</strong> Choose it for the map reference: <select id="ocrMeridian"><option value="">Select</option><option value="4">W4M</option><option value="5">W5M</option><option value="6">W6M</option></select>';
  $('detectedBox')?.insertAdjacentElement('afterend', row);
  $('ocrMeridian')?.addEventListener('change', (e) => {
    const mer = Number(e.target.value);
    if (!mer) return;
    legal.mer = mer;
    currentLegal = legal;
    setValue('legalInput', `${legal.lsd}-${legal.sec}-${legal.twp}-${legal.rge}-W${mer}M`);
    locateLsdForContext();
  });
}

function locateLsdForContext() {
  if (!flattenedMode || !$('legalInput')?.value) return;
  $('locatePlan')?.click();
  clearCentroidAfterLsdLocate();
}

function clearCentroidAfterLsdLocate() {
  if (!flattenedMode) return;
  const start = Date.now();
  const timer = setInterval(() => {
    const lat = Number($('latInput')?.value);
    const lon = Number($('lonInput')?.value);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= 48 && lat <= 61 && lon >= -121 && lon <= -109) {
      clearInterval(timer);
      $('latInput').value = '';
      $('lonInput').value = '';
      if ($('pdfStatus')) $('pdfStatus').textContent = 'LSD shown for reference. Enter a known pad corner coordinate below to place the site.';
    } else if (Date.now() - start > 8000) {
      clearInterval(timer);
    }
  }, 180);
}

async function ensureProj4() {
  if (window.proj4) return window.proj4;
  const existing = [...document.scripts].find((s) => s.src.includes('proj4'));
  if (!existing) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/proj4@2.21.0/dist/proj4.js';
    document.head.appendChild(script);
  }
  const start = Date.now();
  while (!window.proj4 && Date.now() - start < 7000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!window.proj4) throw new Error('Coordinate conversion library did not load.');
  return window.proj4;
}

function parseDms(raw, isLongitude) {
  let s = String(raw || '').trim().toUpperCase();
  if (!s) return null;
  const negative = /[WS]/.test(s) || /^-/.test(s);
  s = s.replace(/[NSEW]/g, ' ').replace(/[°º'’′\"”″:,]/g, ' ').replace(/-/g, ' ');
  const nums = s.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (!nums.length) return null;
  let value = nums[0];
  if (nums.length > 1) value += nums[1] / 60;
  if (nums.length > 2) value += nums[2] / 3600;
  if (negative) value *= -1;
  const max = isLongitude ? 180 : 90;
  return Number.isFinite(value) && Math.abs(value) <= max ? value : null;
}

async function readAnchorCoordinate() {
  const style = $('anchorCoordStyle')?.value || 'utm';
  if (style === 'dd') {
    const lat = Number($('anchorLatitude')?.value);
    const lon = Number($('anchorLongitude')?.value);
    if (!(lat >= 48 && lat <= 61 && lon >= -121 && lon <= -109)) throw new Error('Enter a valid Alberta latitude and longitude.');
    return { lat, lon, styleLabel:'Decimal Degrees' };
  }
  if (style === 'dms') {
    const lat = parseDms($('anchorLatitudeDms')?.value, false);
    const lon = parseDms($('anchorLongitudeDms')?.value, true);
    if (!(lat >= 48 && lat <= 61 && lon >= -121 && lon <= -109)) throw new Error('Enter valid latitude and longitude DMS values including N/S and E/W.');
    return { lat, lon, styleLabel:'DMS' };
  }

  const easting = Number($('anchorEasting')?.value);
  const northing = Number($('anchorNorthing')?.value);
  if (!(Number.isFinite(easting) && Number.isFinite(northing))) throw new Error('Enter both Easting and Northing.');
  const proj4 = await ensureProj4();
  let source;
  let styleLabel;
  if (style === '10tm') {
    source = EPSG3400;
    styleLabel = 'Alberta 10TM AEP Forest';
  } else {
    const zone = Number($('anchorZone')?.value);
    if (![11,12].includes(zone)) throw new Error('Select UTM zone 11N or 12N.');
    source = `+proj=utm +zone=${zone} +datum=NAD83 +units=m +no_defs`;
    styleLabel = `UTM NAD83 Zone ${zone}N`;
  }
  const [lon, lat] = proj4(source, 'EPSG:4326', [easting, northing]);
  if (!(lat >= 48 && lat <= 61 && lon >= -121 && lon <= -109)) throw new Error('That projected coordinate does not fall within Alberta. Check the coordinate style, zone, Easting and Northing.');
  return { lat, lon, styleLabel };
}

function offsetCoordinate(lat, lon, eastM, northM) {
  const r = 6378137;
  return [
    lat + (northM / r) * 180 / Math.PI,
    lon + (eastM / (r * Math.cos(lat * Math.PI / 180))) * 180 / Math.PI
  ];
}

function cornerOffset(corner, width, height, rotationDeg) {
  const hw = width / 2;
  const hh = height / 2;
  const local = {
    NW:[-hw, hh],
    NE:[ hw, hh],
    SE:[ hw,-hh],
    SW:[-hw,-hh],
  }[corner];
  const theta = rotationDeg * Math.PI / 180;
  const east = local[0] * Math.cos(theta) + local[1] * Math.sin(theta);
  const north = -local[0] * Math.sin(theta) + local[1] * Math.cos(theta);
  return { east, north };
}

async function placeFromAnchor(quiet) {
  if (!flattenedMode) return;
  const status = $('anchorStatus');
  try {
    const width = Number($('widthInput')?.value);
    const height = Number($('heightInput')?.value);
    const rotation = Number($('rotationInput')?.value) || 0;
    if (!(width > 0 && height > 0)) {
      document.body.classList.add('show-plan-details');
      throw new Error('Enter the pad width and height shown on the plan, then place it from the anchor again.');
    }

    const anchor = await readAnchorCoordinate();
    const corner = $('anchorCorner')?.value || 'NW';
    const offset = cornerOffset(corner, width, height, rotation);
    const [centerLat, centerLon] = offsetCoordinate(anchor.lat, anchor.lon, -offset.east, -offset.north);

    setValue('latInput', centerLat.toFixed(8));
    setValue('lonInput', centerLon.toFixed(8));
    lastAnchor = { ...anchor, corner };
    anchorLocked = true;

    $('applyRectangle')?.click();
    setTimeout(() => $('fitBoundary')?.click(), 450);

    if (status) status.textContent = `${corner} corner anchored using ${anchor.styleLabel}. Pad placed from that exact corner using ${width} m × ${height} m and ${rotation.toFixed(2)}° rotation.`;
    if (!quiet && $('pdfStatus')) $('pdfStatus').textContent = 'Pad placed from the entered anchor corner. Verify it against the PDF and imagery, then confirm the boundary.';
  } catch (err) {
    if (status) status.textContent = err.message || String(err);
    if (!quiet && $('pdfStatus')) $('pdfStatus').textContent = err.message || String(err);
  }
}

function movePad(direction) {
  const lat = Number($('latInput')?.value);
  const lon = Number($('lonInput')?.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    $('pdfStatus').textContent = 'Place the pad from an anchor corner first.';
    return;
  }
  const step = Number($('moveStep')?.value) || 10;
  let east = 0, north = 0;
  if (direction === 'north') north = step;
  if (direction === 'south') north = -step;
  if (direction === 'east') east = step;
  if (direction === 'west') east = -step;
  const [newLat,newLon] = offsetCoordinate(lat, lon, east, north);
  setValue('latInput', newLat.toFixed(8));
  setValue('lonInput', newLon.toFixed(8));
  anchorLocked = false;
  $('applyRectangle')?.click();
  setTimeout(() => $('fitBoundary')?.click(), 350);
  $('pdfStatus').textContent = `Moved pad ${step} m ${direction}. This manual move is now offset from the entered anchor coordinate.`;
}

function rotatePad(delta) {
  const current = Number($('rotationInput')?.value) || 0;
  const next = current + delta;
  setValue('rotationInput', next.toFixed(2));
  if (anchorLocked && lastAnchor) {
    placeFromAnchor(true);
    $('pdfStatus').textContent = `Pad rotation: ${next.toFixed(2)}°. The selected anchor corner stayed fixed.`;
    return;
  }
  if ($('widthInput')?.value && $('heightInput')?.value && $('latInput')?.value && $('lonInput')?.value) $('applyRectangle')?.click();
  setTimeout(() => $('fitBoundary')?.click(), 300);
  $('pdfStatus').textContent = `Pad rotation: ${next.toFixed(2)}°.`;
}

async function analyzeFile(file) {
  if (!file || running) return;
  running = true;
  try {
    const inspected = await inspectPdf(file);
    if (!inspected.flattened) {
      exitFlattenedMode();
      return;
    }

    enterFlattenedMode();
    clearFlattenedFields();
    $('pdfConfidence').textContent = 'Image-based plan';
    $('pdfStatus').textContent = 'Image-based plan detected. Reading the plan for legal location, dimensions and bearing…';

    let text = '';
    try {
      text = await runOcr(inspected.canvas);
    } catch (ocrError) {
      console.error('OCR unavailable', ocrError);
      $('detectedBox').innerHTML = '<strong>Image-based plan mode is active.</strong><br>Automatic reading was unavailable. Enter the legal location if you want the LSD shown for reference, then enter the pad dimensions and one anchor corner coordinate.';
      $('pdfConfidence').textContent = 'Anchor placement mode';
      $('pdfStatus').textContent = 'Enter the pad dimensions and one known corner coordinate below.';
      document.body.classList.add('show-plan-details');
      return;
    }

    const legal = detectLegal(text);
    const dims = detectDimensions(text);
    const rotation = detectRotation(text);
    currentLegal = legal;

    if (legal) {
      if (legal.mer) setValue('legalInput', `${legal.lsd}-${legal.sec}-${legal.twp}-${legal.rge}-W${legal.mer}M`);
      else {
        setValue('legalInput', `${legal.lsd}-${legal.sec}-${legal.twp}-${legal.rge}`);
        showMeridianSelector(legal);
      }
    }
    if (dims) {
      setValue('widthInput', dims.width);
      setValue('heightInput', dims.height);
    }
    if (rotation) setValue('rotationInput', rotation.rotation.toFixed(2));

    renderFindings(legal, dims, rotation);
    $('pdfConfidence').textContent = 'Anchor placement mode';

    if (!dims) document.body.classList.add('show-plan-details');
    if (legal?.mer) {
      locateLsdForContext();
    } else if (legal) {
      $('pdfStatus').textContent = 'Choose the meridian to show the LSD for reference, then enter a known pad corner coordinate below.';
    } else {
      $('pdfStatus').textContent = 'Enter one known pad corner coordinate below. The LSD is optional when an exact anchor coordinate is available.';
    }
  } catch (err) {
    console.error(err);
    enterFlattenedMode();
    $('pdfConfidence').textContent = 'Anchor placement mode';
    $('pdfStatus').textContent = 'This plan could not be read automatically. Enter the pad dimensions and one known corner coordinate below.';
    document.body.classList.add('show-plan-details');
  } finally {
    running = false;
  }
}

function scheduleAnalyze(file) {
  if (!file) return;
  setTimeout(() => analyzeFile(file), 450);
}

injectStyles();
prepareDom();

$('planPdfInput')?.addEventListener('change', (e) => scheduleAnalyze(e.target.files?.[0]));
$('planPdfDrop')?.addEventListener('drop', (e) => scheduleAnalyze(e.dataTransfer?.files?.[0]));
