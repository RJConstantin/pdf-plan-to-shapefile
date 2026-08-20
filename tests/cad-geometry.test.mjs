import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrateRingsByArea, dissolveRings, extractHatchRings, matchClosedPathsByArea } from '../cad-geometry.mjs';

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

test('matches unlayered red site and access rings to printed plan areas', () => {
  const paths = [
    {
      pageNumber: 1,
      closed: true,
      points: [[303.93, 144.27], [365.97, 164.22], [383.31, 110.28], [321.27, 90.3]],
    },
    {
      pageNumber: 1,
      closed: true,
      points: [[368.88, 544.2], [315.57, 524.61], [307.95, 512.67], [298.83, 479.28], [293.31, 449.79], [261.51, 405.93], [265.62, 375.27], [262.95, 356.4], [286.29, 304.53], [294.87, 272.13], [302.04, 263.46], [328.47, 152.16], [323.07, 150.42], [296.85, 260.85], [289.71, 269.49], [280.92, 302.64], [257.1, 355.59], [259.89, 375.3], [255.57, 407.43], [288, 452.1], [293.31, 480.57], [302.7, 514.98], [311.82, 529.26], [365.82, 549.12]],
    },
    { pageNumber: 1, closed: true, points: [[0, 0], [20, 0], [20, 20], [0, 20]] },
    { pageNumber: 1, closed: false, points: [[0, 0], [100, 0], [100, 100], [0, 100]] },
  ];
  const match = matchClosedPathsByArea(paths, 10000, { site: 4.598, access: 3.244, total: 7.842 });
  assert.equal(match.rings.length, 2);
  assert.equal(match.siteRing.length, 4);
  assert.ok(Math.abs(match.hectares[0] - 4.598) < 0.01);
  assert.ok(Math.abs(match.hectares[1] - 3.244) < 0.01);
});

test('calibrates an oversized PDF drawing from its printed area', () => {
  const rings = [[[0, 0], [100, 0], [100, 100], [0, 100]]];
  const baseMetresPerPoint = 5000 * 0.0254 / 72;
  const targetArea = 10000 * (baseMetresPerPoint * 0.1) ** 2 / 10000;
  const calibration = calibrateRingsByArea(rings, 5000, targetArea);
  assert.equal(calibration.correction, 0.1);
  assert.ok(Math.abs(calibration.hectares - targetArea) < 1e-9);
});

test('dissolves adjoining plan areas even when a shared side is split differently', () => {
  const rings = [
    [[0, 0], [100, 0], [100, 100], [0, 100]],
    [[0, 100], [50, 100], [100, 100], [100, 120], [0, 120]],
  ];
  const dissolved = dissolveRings(rings);
  assert.equal(dissolved.length, 1);
  const area = dissolved[0].reduce((sum, point, index) => {
    const next = dissolved[0][(index + 1) % dissolved[0].length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
  assert.equal(Math.abs(area), 12000);
});
