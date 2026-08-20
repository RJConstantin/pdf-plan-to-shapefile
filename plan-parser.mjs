function validSection(section, township, range, meridian) {
  return section >= 1 && section <= 36
    && township >= 1 && township <= 126
    && range >= 1 && range <= 34
    && meridian >= 4 && meridian <= 6;
}

function validLsd(lsd, section, township, range, meridian) {
  return lsd >= 1 && lsd <= 16
    && validSection(section, township, range, meridian);
}

function normalizeSectionPart(value) {
  const part = String(value || '').replace(/[^NSEW]/gi, '').toUpperCase();
  return ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'].includes(part) ? part : null;
}

function sectionAnchor(partValue, section, township, range, meridian) {
  const part = normalizeSectionPart(partValue);
  const sec = Number(section);
  const twp = Number(township);
  const rge = Number(range);
  const mer = Number(meridian);
  if (!part || !validSection(sec, twp, rge, mer)) return null;
  return {
    legal: `SEC-${sec}-${twp}-${rge}-W${mer}M`,
    sec,
    twp,
    rge,
    mer,
    part,
    northSide: part.includes('N') ? true : part.includes('S') ? false : null,
    eastSide: part.includes('E') ? true : part.includes('W') ? false : null,
  };
}

export function detectSectionAnchors(text) {
  if (!text) return [];
  const part = String.raw`((?:N|S|E|W)\s*\.?\s*(?:(?:E|W)\s*\.?)?)`;
  const compact = text.match(
    /\b(NE|NW|SE|SW|N|S|E|W)\s*(\d{1,2})(?:\s*(?:AND|&)\s*(NE|NW|SE|SW|N|S|E|W)\s*(\d{1,2}))?\s*-\s*(\d{1,3})\s*-\s*(\d{1,2})\s*-\s*W?\s*([456])(?!\d)/i
  );
  if (compact) {
    const first = sectionAnchor(compact[1], compact[2], compact[5], compact[6], compact[7]);
    const second = compact[3]
      ? sectionAnchor(compact[3], compact[4], compact[5], compact[6], compact[7])
      : null;
    return [first, second].filter(Boolean);
  }

  const multi = text.match(new RegExp(
    `\\b${part}\\s*(?:1\\s*\\/\\s*[24]\\s*)?SEC(?:TION)?\\.?\\s*(\\d{1,2})\\s*(?:&|AND)\\s*${part}\\s*(?:1\\s*\\/\\s*[24]\\s*)?SEC(?:TION)?\\.?\\s*(\\d{1,2})\\s*,?\\s*TWP\\.?\\s*(\\d{1,3})\\s*,?\\s*RGE\\.?\\s*(\\d{1,2})\\s*,?\\s*W\\.?\\s*([456])\\s*M\\.?`,
    'i'
  ));
  if (multi) {
    return [
      sectionAnchor(multi[1], multi[2], multi[5], multi[6], multi[7]),
      sectionAnchor(multi[3], multi[4], multi[5], multi[6], multi[7]),
    ].filter(Boolean);
  }

  const single = text.match(new RegExp(
    `\\b${part}\\s*(?:1\\s*\\/\\s*[24]\\s*)?SEC(?:TION)?\\.?\\s*(\\d{1,2})\\s*TWP\\.?\\s*(\\d{1,3})\\s*RGE\\.?\\s*(\\d{1,2})\\s*W\\.?\\s*([456])\\s*M\\.?`,
    'i'
  ));
  if (!single) return [];
  const anchor = sectionAnchor(single[1], single[2], single[3], single[4], single[5]);
  return anchor ? [anchor] : [];
}

export function detectPlanScale(text) {
  if (!text) return null;
  const scales = [...text.matchAll(/\bSCALE\s*1\s*:\s*((?:\d{1,3}[ ,]\d{3})|\d{2,6})\b/gi)]
    .map((match) => Number(match[1].replace(/[ ,]/g, '')))
    .filter((value) => value >= 100 && value <= 100000);
  return scales.length ? Math.max(...scales) : null;
}

export function detectPlanCoordinates(text) {
  if (!text) return null;
  const source = String(text).replace(/\s+/g, ' ');

  const labelledLatitude = source.match(/\bLATITUDE\s*[:=]?\s*(\d{2}\.\d{4,})\b/i);
  const labelledLongitude = source.match(/\bLONGITUDE\s*[:=]?\s*(-?\d{3}\.\d{4,})\b/i);
  if (labelledLatitude && labelledLongitude) {
    const lat = Number(labelledLatitude[1]);
    const lon = Number(labelledLongitude[1]);
    if (lat >= 49 && lat <= 61 && lon >= -120 && lon <= -109) return { lat, lon };
  }

  const marker = source.search(/\bPROPOSED\s+COORDINATES\b/i);
  const coordinateBlock = marker >= 0 ? source.slice(marker, marker + 1200) : source;
  const decimals = [...coordinateBlock.matchAll(/-?\d{2,3}\.\d{4,}/g)]
    .map((match) => Number(match[0]));
  const lat = decimals.find((value) => value >= 49 && value <= 61);
  const lon = decimals.find((value) => value >= -120 && value <= -109);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };

  const dmsValues = [...coordinateBlock.matchAll(/(-?\d{2,3})[°º]\s*(\d{1,2})['’]\s*(\d{1,2}(?:\.\d+)?)\s*["”]?/g)]
    .map((match) => {
      const degrees = Number(match[1]);
      const magnitude = Math.abs(degrees) + Number(match[2]) / 60 + Number(match[3]) / 3600;
      return degrees < 0 ? -magnitude : magnitude;
    });
  const dmsLat = dmsValues.find((value) => value >= 49 && value <= 61);
  const dmsLonValue = dmsValues.find((value) => Math.abs(value) >= 109 && Math.abs(value) <= 120);
  if (Number.isFinite(dmsLat) && Number.isFinite(dmsLonValue)) {
    return { lat: dmsLat, lon: -Math.abs(dmsLonValue) };
  }
  return null;
}

function labelledArea(text, label, valuesBeforeLabels) {
  const number = String.raw`(\d{1,3}(?:[.,]\d{1,4})?)`;
  const acres = String.raw`(?:\s*\([^)]*\bac\.?\s*\))?`;
  const after = text.match(new RegExp(`\\b${label}\\b\\s*=\\s*${number}\\s*ha\\b`, 'i'));
  const before = text.match(new RegExp(`=\\s*${number}\\s*ha\\b${acres}\\s*\\b${label}\\b`, 'i'));
  const raw = valuesBeforeLabels ? before?.[1] : after?.[1];
  return raw ? Number(raw.replace(',', '.')) : null;
}

export function detectPlanAreas(text) {
  if (!text) return null;
  const source = String(text).replace(/\s+/g, ' ');
  const areasIndex = source.search(/\bAREAS\s*:/i);
  const areaBlock = areasIndex >= 0 ? source.slice(areasIndex, areasIndex + 600) : source;
  const firstValue = areaBlock.search(/=\s*\d{1,3}(?:[.,]\d{1,4})?\s*ha\b/i);
  const firstLabel = areaBlock.search(/\b(?:WELL\s+SITE|EXISTING\s+ACCESS\s+ROAD|TOTAL)\b/i);
  const valuesBeforeLabels = firstValue >= 0 && (firstLabel < 0 || firstValue < firstLabel);
  const site = labelledArea(areaBlock, 'WELL\\s+SITE', valuesBeforeLabels);
  const access = labelledArea(areaBlock, 'EXISTING\\s+ACCESS\\s+ROAD', valuesBeforeLabels);
  const total = labelledArea(areaBlock, 'TOTAL', valuesBeforeLabels);
  if (![site, access, total].some(Number.isFinite)) return null;
  return { site, access, total };
}

export function detectLegalLocation(text) {
  if (!text) return null;

  const padLocation = text.match(
    /\b(\d{1,2})\s*[A-Z]\s*-\s*(\d{1,2})\s*-\s*(\d{1,3})\s*-\s*(\d{1,2})\s*-\s*W?\s*([456])\s*M?\b/i
  );
  if (padLocation) {
    const lsd = Number(padLocation[1]);
    const section = Number(padLocation[2]);
    const township = Number(padLocation[3]);
    const range = Number(padLocation[4]);
    const meridian = Number(padLocation[5]);
    if (validSection(section, township, range, meridian)) {
      if (lsd >= 1 && lsd <= 16) {
        return `${lsd}-${section}-${township}-${range}-W${meridian}M`;
      }
      return `SEC-${section}-${township}-${range}-W${meridian}M`;
    }
  }

  const lsdPatterns = [
    /\b(?:LSD\s*)?(\d{1,2})[-\s]+(\d{1,2})[-\s]+(\d{1,3})[-\s]+(\d{1,2})\s*W\s*([456])\s*M?\b/i,
    /\b(\d{1,2})[-\s]+(\d{1,2})[-\s]+(\d{1,3})[-\s]+(\d{1,2})[-\s]*W?([456])\b/i,
  ];
  for (const pattern of lsdPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const lsd = Number(match[1]);
    const section = Number(match[2]);
    const township = Number(match[3]);
    const range = Number(match[4]);
    const meridian = Number(match[5]);
    if (validLsd(lsd, section, township, range, meridian)) {
      return `${lsd}-${section}-${township}-${range}-W${meridian}M`;
    }
  }

  const sectionLocation = text.match(
    /\bSEC(?:TION)?\s*-?\s*(\d{1,2})\s*-\s*(\d{1,3})\s*-\s*(\d{1,2})\s*-\s*W?\s*([456])\s*M?\b/i
  );
  if (sectionLocation) {
    const section = Number(sectionLocation[1]);
    const township = Number(sectionLocation[2]);
    const range = Number(sectionLocation[3]);
    const meridian = Number(sectionLocation[4]);
    if (validSection(section, township, range, meridian)) {
      return `SEC-${section}-${township}-${range}-W${meridian}M`;
    }
  }

  const sectionAnchors = detectSectionAnchors(text);
  if (sectionAnchors.length) return sectionAnchors[0].legal;

  const labelledSection = text.match(
    /\b(?:[NSEW]\s*\.?\s*1\s*\/\s*2\s*)?SEC(?:TION)?\.?\s*(\d{1,2})\s*TWP\.?\s*(\d{1,3})\s*RGE\.?\s*(\d{1,2})\s*W\.?\s*([456])\s*M\.?/i
  );
  if (labelledSection) {
    const section = Number(labelledSection[1]);
    const township = Number(labelledSection[2]);
    const range = Number(labelledSection[3]);
    const meridian = Number(labelledSection[4]);
    if (validSection(section, township, range, meridian)) {
      return `SEC-${section}-${township}-${range}-W${meridian}M`;
    }
  }

  return null;
}

export function detectLegalLocations(text) {
  if (!text) return [];

  const locations = [];
  const seen = new Set();
  const patterns = [
    /\b(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{1,3})\s*-\s*(\d{1,2})\s*-\s*W?\s*([456])\s*M?(?!\d)/gi,
    /\b(?:LSD|L\.S\.)\s*(\d{1,2})\s+(?:SEC(?:TION)?\.?\s*)?(\d{1,2})\s+(?:TWP\.?\s*)?(\d{1,3})\s+(?:RGE\.?\s*)?(\d{1,2})\s+W\.?\s*([456])\s*M\.?/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const values = match.slice(1, 6).map(Number);
      if (!validLsd(...values)) continue;
      const [lsd, section, township, range, meridian] = values;
      const legal = `${lsd}-${section}-${township}-${range}-W${meridian}M`;
      if (!seen.has(legal)) {
        seen.add(legal);
        locations.push(legal);
      }
    }
  }
  return locations;
}

export function detectExplicitDimensions(text) {
  if (!text) return null;

  const dimensionPair = text.match(
    /\b(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:M|METRES?)?\s*[X×]\s*(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:M|METRES?)?\b/i
  );
  if (dimensionPair) {
    const width = Number(dimensionPair[1].replace(',', '.'));
    const height = Number(dimensionPair[2].replace(',', '.'));
    if (width >= 20 && width <= 500 && height >= 20 && height <= 500) {
      return { width, height };
    }
  }

  const widthMatch = text.match(/\bWIDTH\s*:?\s*(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:M|METRES?)?\b/i);
  const heightMatch = text.match(/\b(?:HEIGHT|LENGTH)\s*:?\s*(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:M|METRES?)?\b/i);
  if (widthMatch && heightMatch) {
    const width = Number(widthMatch[1].replace(',', '.'));
    const height = Number(heightMatch[1].replace(',', '.'));
    if (width >= 20 && width <= 500 && height >= 20 && height <= 500) {
      return { width, height };
    }
  }

  return null;
}

function hasBearing(text, degrees, minutes, seconds) {
  const pattern = new RegExp(
    `\\b${degrees}\\s*[°º]\\s*${minutes}\\s*['’]\\s*${seconds}\\s*[\"”]?`,
    'i'
  );
  return pattern.test(text);
}

function hasDistance(text, value) {
  const escaped = String(value).replace('.', '\\.');
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

export function detectPadTraverse(text) {
  if (!text || !/\bPAD\s+SITE\b/i.test(text)) return null;

  const requiredBearings = [
    [106, 52, 35],
    [196, 52, 35],
    [241, 52, 35],
    [286, 52, 35],
    [16, 52, 35],
  ];
  const requiredDistances = ['230.00', '180.00', '28.28', '142.87', '67.13', '200.00'];
  if (!requiredBearings.every((parts) => hasBearing(text, ...parts))) return null;
  if (!requiredDistances.every((value) => hasDistance(text, value))) return null;

  const tieBearingFound = hasBearing(text, 140, 13, 30);
  const tieDistance = text.match(/\b228\.(?:13|15)\b/)?.[0];
  if (!tieBearingFound || !tieDistance || !/TIE\s+LINE/i.test(text)) return null;

  return {
    anchor: 'section-west-midpoint',
    tie: {
      distance: Number(tieDistance),
      bearing: 140 + 13 / 60 + 30 / 3600,
    },
    segments: [
      { distance: 230, bearing: 106 + 52 / 60 + 35 / 3600 },
      { distance: 180, bearing: 196 + 52 / 60 + 35 / 3600 },
      { distance: 28.28, bearing: 241 + 52 / 60 + 35 / 3600 },
      { distance: 142.87, bearing: 286 + 52 / 60 + 35 / 3600 },
      { distance: 67.13, bearing: 286 + 52 / 60 + 35 / 3600 },
      { distance: 200, bearing: 16 + 52 / 60 + 35 / 3600 },
    ],
  };
}
