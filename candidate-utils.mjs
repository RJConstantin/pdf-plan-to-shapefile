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
