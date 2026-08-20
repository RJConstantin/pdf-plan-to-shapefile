function finitePoint(point) {
  return Array.isArray(point)
    && point.length >= 2
    && Number.isFinite(point[0])
    && Number.isFinite(point[1]);
}

function normalizedRgbColor(value) {
  let components = null;
  if (typeof value === 'string') {
    const match = value.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (match) components = match.slice(1).map((component) => Number.parseInt(component, 16) / 255);
  } else if ((Array.isArray(value) || ArrayBuffer.isView(value)) && value.length >= 3) {
    const raw = Array.from(value).slice(0, 3);
    if (raw.every(Number.isFinite)) {
      const divisor = Math.max(...raw) > 1 ? 255 : 1;
      components = raw.map((component) => component / divisor);
    }
  }
  return components;
}

export function isPlanRedColor(value) {
  const components = normalizedRgbColor(value);
  if (!components) return false;
  const [red, green, blue] = components;
  return red >= 0.7 && green <= 0.3 && blue <= 0.3;
}

export function isSurveyAreaFillColor(value) {
  const components = normalizedRgbColor(value);
  if (!components) return false;
  const [red, green, blue] = components;
  return red >= 0.85 && green >= 0.72 && blue >= 0.25
    && Math.max(...components) - Math.min(...components) >= 0.08;
}

export function inferPageRotationQuarterTurns(textItems, viewportTransform) {
  if (!Array.isArray(textItems) || !Array.isArray(viewportTransform)
    || viewportTransform.length < 4) return 0;

  const weights = [0, 0, 0, 0];
  for (const item of textItems) {
    const transform = item?.transform;
    const text = String(item?.str || '').trim();
    if (!transform || transform.length < 4 || !text) continue;
    const a = viewportTransform[0] * transform[0] + viewportTransform[2] * transform[1];
    const b = viewportTransform[1] * transform[0] + viewportTransform[3] * transform[1];
    const angle = Math.atan2(b, a);
    const quarter = Math.round(angle / (Math.PI / 2));
    const residual = Math.abs(angle - quarter * Math.PI / 2);
    if (residual > 25 * Math.PI / 180) continue;
    const normalized = ((quarter % 4) + 4) % 4;
    weights[normalized] += Math.min(text.length, 80);
  }

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const dominantWeight = Math.max(...weights);
  const screenQuarterTurns = weights.indexOf(dominantWeight);
  if (total < 80 || dominantWeight / total < 0.65) return 0;
  return (4 - screenQuarterTurns) % 4;
}

export function rotateScreenOffsetQuarterTurns(offset, quarterTurns = 0) {
  const [x, y] = offset;
  const normalized = ((Math.round(quarterTurns) % 4) + 4) % 4;
  if (normalized === 1) return [-y, x];
  if (normalized === 2) return [-x, -y];
  if (normalized === 3) return [y, -x];
  return [x, y];
}

export function candidateRings(candidate) {
  const rings = candidate?.rings?.length ? candidate.rings : [candidate?.points || []];
  return rings
    .map((ring) => ring.filter(finitePoint))
    .filter((ring) => ring.length >= 3);
}

function downsampleRing(ring, limit = 320) {
  if (ring.length <= limit) return ring;
  const step = ring.length / limit;
  return Array.from({ length: limit }, (_, index) => ring[Math.floor(index * step)]);
}

export function candidateFingerprint(candidate) {
  return candidatePreviewPaths(candidate).join('|');
}

export function candidatePreviewPaths(candidate, width = 260, height = 132, padding = 9) {
  const quarterTurns = candidate?.pageQuarterTurns || 0;
  const rings = candidateRings(candidate).map((ring) => (
    ring.map((point) => rotateScreenOffsetQuarterTurns(point, quarterTurns))
  ));
  const points = rings.flat();
  if (!points.length) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  return rings.map((ring) => {
    const normalized = downsampleRing(ring).map(([x, y]) => [
      offsetX + (x - minX) * scale,
      offsetY + (y - minY) * scale,
    ]);
    return normalized.map(([x, y], index) => (
      `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`
    )).join(' ') + ' Z';
  });
}

export function boundaryCandidateArea(candidate) {
  if (Array.isArray(candidate?.hectares)) {
    return candidate.hectares.reduce((sum, value) => (
      Number.isFinite(value) ? sum + value : sum
    ), 0);
  }
  return Number.isFinite(candidate?.hectares) ? candidate.hectares : null;
}

export function rankBoundaryCandidates(candidates) {
  return candidates.slice().sort((a, b) => (
    (b.recommendationRank || 0) - (a.recommendationRank || 0)
    || (a.pageNumber || 0) - (b.pageNumber || 0)
    || candidateRings(b).length - candidateRings(a).length
  ));
}

function ringArea(ring) {
  return Math.abs(ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
}

function ringLength(ring) {
  return ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
  }, 0);
}

function effectivelyClosedRing(path) {
  const points = (path?.points || []).filter(finitePoint);
  if (points.length < 3) return null;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const closingGap = Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]);
  if (!path.closed && closingGap > Math.max(1.5, diagonal * 0.025)) return null;
  return closingGap <= Math.max(1e-6, diagonal * 0.025) ? points.slice(0, -1) : points;
}

export function findProminentVectorCandidates(paths, pageSizes, planScale, limit = 4) {
  if (!Number.isFinite(planScale) || planScale <= 0) return [];
  const metresPerPoint = planScale * 0.0254 / 72;
  const evaluated = (paths || []).map((path) => {
    const ring = effectivelyClosedRing(path);
    const pageSize = pageSizes instanceof Map ? pageSizes.get(path.pageNumber) : pageSizes?.[path.pageNumber];
    if (!ring || !pageSize?.width || !pageSize?.height) return null;

    const xs = ring.map((point) => point[0]);
    const ys = ring.map((point) => point[1]);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const bboxArea = width * height;
    const pageArea = pageSize.width * pageSize.height;
    const area = ringArea(ring);
    const perimeter = ringLength(ring);
    const coverage = bboxArea / pageArea;
    const fillRatio = bboxArea > 0 ? area / bboxArea : 0;
    const aspectRatio = Math.min(width, height) / Math.max(width, height);
    const hectares = area * metresPerPoint ** 2 / 10000;

    if (width < Math.max(5, pageSize.width * 0.004)
      || height < Math.max(5, pageSize.height * 0.004)
      || coverage < 0.00012 || coverage > 0.15
      || fillRatio < 0.08 || aspectRatio < 0.05
      || hectares < 0.002 || hectares > 5000) return null;

    const compactness = perimeter > 0 ? 4 * Math.PI * area / perimeter ** 2 : 0;
    const colourBoost = path.red ? 35 : path.distinctive ? 18 : 0;
    const closureBoost = path.closed ? 5 : 0;
    const sizeScore = Math.log10(Math.max(1, coverage * 1e6)) * 10;
    return {
      ...path,
      ring,
      hectares,
      score: colourBoost + closureBoost + sizeScore + Math.min(12, compactness * 18),
    };
  }).filter(Boolean);
  const coloured = evaluated.filter((candidate) => candidate.distinctive);
  const ranked = (coloured.length ? coloured : evaluated)
    .sort((a, b) => b.score - a.score || b.hectares - a.hectares);
  const topScore = ranked[0]?.score;
  return ranked
    .filter((candidate) => candidate.score >= topScore - 12)
    .slice(0, limit);
}

export function inferPlanScaleFromVectorDimensions(paths, pageSizes, distances) {
  const commonScales = [500, 1000, 2000, 2500, 5000, 10000, 20000];
  const dimensionValues = (distances || []).filter((value) => Number.isFinite(value) && value >= 20 && value <= 500);
  if (!dimensionValues.length) return null;
  const matches = [];

  for (const path of paths || []) {
    const ring = effectivelyClosedRing(path);
    const pageSize = pageSizes instanceof Map ? pageSizes.get(path.pageNumber) : pageSizes?.[path.pageNumber];
    if (!ring || !pageSize?.width || !pageSize?.height) continue;
    const xs = ring.map((point) => point[0]);
    const ys = ring.map((point) => point[1]);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const coverage = width * height / (pageSize.width * pageSize.height);
    if (width < 10 || height < 10 || coverage < 0.0005 || coverage > 0.15) continue;

    for (const horizontalMetres of dimensionValues) {
      for (const verticalMetres of dimensionValues) {
        const horizontalScale = horizontalMetres * 72 / (width * 0.0254);
        const verticalScale = verticalMetres * 72 / (height * 0.0254);
        const agreementError = Math.abs(horizontalScale - verticalScale)
          / ((horizontalScale + verticalScale) / 2);
        if (agreementError > 0.035) continue;
        const averageScale = (horizontalScale + verticalScale) / 2;
        const scale = commonScales.reduce((closest, candidate) => (
          Math.abs(candidate - averageScale) < Math.abs(closest - averageScale) ? candidate : closest
        ));
        const commonScaleError = Math.abs(scale - averageScale) / scale;
        if (commonScaleError > 0.06) continue;
        matches.push({
          scale,
          horizontalMetres,
          verticalMetres,
          agreementError,
          commonScaleError,
          score: 100 - agreementError * 800 - commonScaleError * 400 + Math.log10(coverage * 1e6),
        });
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score)[0] || null;
}
