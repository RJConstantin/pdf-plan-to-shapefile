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
    /\b\d{1,2}\s*[A-Z]\s*-\s*(\d{1,2})\s*-\s*(\d{1,3})\s*-\s*(\d{1,2})\s*-\s*W?\s*([456])\s*M?\b/i
  );
  if (padLocation) {
    const section = Number(padLocation[1]);
    const township = Number(padLocation[2]);
    const range = Number(padLocation[3]);
    const meridian = Number(padLocation[4]);
    if (validSection(section, township, range, meridian)) {
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
