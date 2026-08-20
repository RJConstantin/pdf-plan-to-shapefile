import test from 'node:test';
import assert from 'node:assert/strict';
import { extractHatchRings } from '../cad-geometry.mjs';

test('reconstructs separate pit and access-road outlines from CAD hatch triangles', () => {
  const paths = [
    [[322.74, 585.42], [359.7, 611.76], [296.76, 611.76]],
    [[296.76, 611.76], [282.96, 625.8], [345.84, 625.8]],
    [[282.96, 625.8], [345.84, 625.8], [319.86, 652.08]],
    [[296.76, 611.76], [359.7, 611.76], [345.84, 625.8]],
    [[330.3, 571.26], [335.46, 572.52], [329.1, 572.52]],
    [[329.1, 572.52], [279.36, 623.22], [285.48, 623.22]],
    [[279.36, 623.22], [285.48, 623.22], [282.96, 625.8]],
    [[329.1, 572.52], [335.46, 572.52], [285.48, 623.22]],
  ];

  const rings = extractHatchRings(paths);
  assert.equal(rings.length, 2);
  assert.deepEqual(rings.map((ring) => ring.length).sort(), [6, 6]);
  const vertices = new Set(rings.flat().map((point) => point.join(',')));
  assert(vertices.has('296.76,611.76'), 'keeps the inward corner removed by a convex hull');
  assert(vertices.has('285.48,623.22'), 'keeps the narrow access-road edge');
});
