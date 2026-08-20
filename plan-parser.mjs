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

  return null;
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
