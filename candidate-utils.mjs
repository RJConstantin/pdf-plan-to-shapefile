function finitePoint(point) {
  return Array.isArray(point)
    && point.length >= 2
    && Number.isFinite(point[0])
    && Number.isFinite(point[1]);
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
  const rings = candidateRings(candidate);
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
