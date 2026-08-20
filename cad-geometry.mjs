function pointKey(point, precision = 3) {
  return `${point[0].toFixed(precision)},${point[1].toFixed(precision)}`;
}

function edgeKey(a, b) {
  const first = pointKey(a);
  const second = pointKey(b);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function cleanPath(path) {
  const cleaned = path.filter((point, index) => (
    index === 0 || pointKey(point) !== pointKey(path[index - 1])
  ));
  if (cleaned.length > 2 && pointKey(cleaned[0]) === pointKey(cleaned.at(-1))) cleaned.pop();
  return cleaned;
}

function pathEdges(path) {
  return path.map((point, index) => {
    const next = path[(index + 1) % path.length];
    return { a: point, b: next, key: edgeKey(point, next) };
  });
}

function sharedEdgeGroups(paths) {
  const parents = paths.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const join = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parents[rootB] = rootA;
  };
  const owners = new Map();
  paths.forEach((path, pathIndex) => {
    pathEdges(path).forEach((edge) => {
      if (owners.has(edge.key)) join(pathIndex, owners.get(edge.key));
      else owners.set(edge.key, pathIndex);
    });
  });
  const groups = new Map();
  paths.forEach((path, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(path);
  });
  return [...groups.values()];
}

function traceBoundaryRings(paths) {
  const edgeCounts = new Map();
  const coordinates = new Map();
  paths.forEach((path) => {
    pathEdges(path).forEach((edge) => {
      const entry = edgeCounts.get(edge.key) || { count: 0, a: pointKey(edge.a), b: pointKey(edge.b) };
      entry.count += 1;
      edgeCounts.set(edge.key, entry);
      coordinates.set(pointKey(edge.a), edge.a);
      coordinates.set(pointKey(edge.b), edge.b);
    });
  });
  const edges = [...edgeCounts.values()].filter((edge) => edge.count % 2 === 1);
  const adjacency = new Map();
  edges.forEach((edge, index) => {
    [edge.a, edge.b].forEach((key) => {
      if (!adjacency.has(key)) adjacency.set(key, []);
      adjacency.get(key).push(index);
    });
  });
  const unused = new Set(edges.map((_, index) => index));
  const rings = [];
  while (unused.size) {
    const firstEdgeIndex = unused.values().next().value;
    const firstEdge = edges[firstEdgeIndex];
    const start = firstEdge.a;
    let current = start;
    let previous = null;
    const ring = [];
    for (let safety = 0; safety <= edges.length + 1; safety += 1) {
      ring.push(coordinates.get(current));
      const candidates = (adjacency.get(current) || []).filter((index) => unused.has(index));
      const edgeIndex = candidates.find((index) => {
        const edge = edges[index];
        const other = edge.a === current ? edge.b : edge.a;
        return other !== previous;
      }) ?? candidates[0];
      if (edgeIndex === undefined) break;
      unused.delete(edgeIndex);
      const edge = edges[edgeIndex];
      const next = edge.a === current ? edge.b : edge.a;
      previous = current;
      current = next;
      if (current === start) break;
    }
    if (ring.length >= 3 && current === start) rings.push(ring);
  }
  return rings;
}

export function extractHatchRings(paths) {
  const cleaned = paths.map(cleanPath).filter((path) => path.length >= 3);
  return sharedEdgeGroups(cleaned).flatMap(traceBoundaryRings);
}

function polygonArea(points) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
}

export function matchClosedPathsByArea(paths, planScale, targetAreas, tolerance = 0.08) {
  if (!(Number.isFinite(planScale) && planScale > 0 && Number.isFinite(targetAreas?.site))) return null;
  const metresPerPoint = planScale * 0.0254 / 72;
  const candidates = paths
    .filter((path) => path?.closed && path.points?.length >= 3)
    .map((path) => ({
      ...path,
      hectares: polygonArea(path.points) * metresPerPoint ** 2 / 10000,
    }));
  const relativeError = (candidate, target) => Math.abs(candidate.hectares - target) / target;
  const choose = (target, excluded, pageNumber = null) => candidates
    .filter((candidate) => candidate !== excluded && (pageNumber == null || candidate.pageNumber === pageNumber))
    .sort((a, b) => relativeError(a, target) - relativeError(b, target))[0];

  const site = choose(targetAreas.site, null);
  if (!site || relativeError(site, targetAreas.site) > tolerance) return null;
  const selected = [site];
  let access = null;
  if (Number.isFinite(targetAreas.access)) {
    access = choose(targetAreas.access, site, site.pageNumber);
    if (!access || relativeError(access, targetAreas.access) > tolerance) return null;
    selected.push(access);
  }
  if (Number.isFinite(targetAreas.total)) {
    const selectedTotal = selected.reduce((sum, candidate) => sum + candidate.hectares, 0);
    if (Math.abs(selectedTotal - targetAreas.total) / targetAreas.total > tolerance) return null;
  }
  return {
    pageNumber: site.pageNumber,
    rings: selected.map((candidate) => candidate.points),
    siteRing: site.points,
    hectares: selected.map((candidate) => candidate.hectares),
  };
}
