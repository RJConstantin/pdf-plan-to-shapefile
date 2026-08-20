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
