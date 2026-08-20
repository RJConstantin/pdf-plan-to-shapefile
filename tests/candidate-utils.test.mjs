import test from 'node:test';
import assert from 'node:assert/strict';

import {
  boundaryCandidateArea,
  candidatePreviewPaths,
  candidateRings,
  rankBoundaryCandidates,
} from '../candidate-utils.mjs';

test('normalizes a candidate to a bounded SVG preview', () => {
  const paths = candidatePreviewPaths({
    points: [[100, 200], [500, 200], [500, 300], [100, 300]],
  }, 260, 132, 9);
  assert.equal(paths.length, 1);
  assert.match(paths[0], /^M9\.00 35\.75 L251\.00 35\.75/);
  assert.match(paths[0], /Z$/);
});

test('preserves every multipart ring in a candidate preview', () => {
  const candidate = {
    rings: [
      [[0, 0], [10, 0], [10, 10], [0, 10]],
      [[30, 0], [40, 0], [40, 10], [30, 10]],
    ],
  };
  assert.equal(candidateRings(candidate).length, 2);
  assert.equal(candidatePreviewPaths(candidate).length, 2);
});

test('ranks recommended overview geometry ahead of detail alternatives', () => {
  const ordered = rankBoundaryCandidates([
    { id: 'detail', recommendationRank: 60, pageNumber: 1 },
    { id: 'overview', recommendationRank: 100, pageNumber: 1 },
  ]);
  assert.deepEqual(ordered.map((candidate) => candidate.id), ['overview', 'detail']);
});

test('sums multipart hectare values for display', () => {
  assert.ok(Math.abs(boundaryCandidateArea({ hectares: [4.598, 3.244] }) - 7.842) < 1e-12);
  assert.equal(boundaryCandidateArea({ hectares: 0.652 }), 0.652);
});
