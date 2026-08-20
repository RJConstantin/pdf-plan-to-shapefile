import test from 'node:test';
import assert from 'node:assert/strict';

import {
  boundaryCandidateArea,
  candidateFingerprint,
  candidatePreviewPaths,
  candidateRings,
  findProminentVectorCandidates,
  inferPageRotationQuarterTurns,
  inferPlanScaleFromVectorDimensions,
  isPlanRedColor,
  rankBoundaryCandidates,
  rotateScreenOffsetQuarterTurns,
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

test('fingerprints duplicate vector candidates consistently', () => {
  const first = { points: [[1, 2], [3, 2], [3, 4], [1, 4]] };
  const duplicate = { rings: [[[10, 20], [30, 20], [30, 40], [10, 40]]] };
  assert.equal(candidateFingerprint(first), candidateFingerprint(duplicate));
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

test('selects a prominent coloured site outline without a printed area', () => {
  const pageSizes = new Map([[1, { width: 1296, height: 1728 }]]);
  const paths = [
    { pageNumber: 1, closed: true, points: [[10, 10], [1290, 10], [1290, 20], [10, 20]] },
    { pageNumber: 1, closed: true, red: true, distinctive: true, points: [[466, 1086], [525, 1088], [522, 1145], [466, 1142]] },
    { pageNumber: 1, closed: true, red: true, distinctive: true, points: [[84, 689], [92, 689], [92, 697], [84, 697]] },
  ];
  const matches = findProminentVectorCandidates(paths, pageSizes, 5000);
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].ring, paths[1].points);
  assert.ok(matches[0].hectares > 1 && matches[0].hectares < 1.2);
});

test('accepts a nearly closed vector and removes its duplicated endpoint', () => {
  const matches = findProminentVectorCandidates([{
    pageNumber: 1,
    closed: false,
    distinctive: true,
    points: [[100, 100], [170, 100], [170, 170], [100, 170], [100.2, 100.1]],
  }], { 1: { width: 1000, height: 1000 } }, 1000);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].ring.length, 4);
});

test('infers a common plan scale from a surveyed pad and its dimensions', () => {
  const inference = inferPlanScaleFromVectorDimensions([{
    pageNumber: 1,
    closed: true,
    points: [[137.4, 570.36], [250.8, 570.36], [250.8, 712.2], [137.4, 712.2]],
  }], new Map([[1, { width: 612, height: 1008 }]]), [100, 80, 42.6, 170.62]);
  assert.equal(inference.scale, 2000);
  assert.equal(inference.horizontalMetres, 80);
  assert.equal(inference.verticalMetres, 100);
});

test('detects a CAD sheet whose readable content needs a clockwise quarter turn', () => {
  const textItems = [
    { str: 'SURVEY PLAN AND TITLE BLOCK WITH WELL SITE DETAILS AND CERTIFICATION', transform: [0, 10, -10, 0, 0, 0] },
    { str: 'BEARINGS DISTANCES ACCESS ROAD AND PLAN NOTES', transform: [0, 10, -10, 0, 0, 0] },
    { str: 'minor note', transform: [10, 0, 0, 10, 0, 0] },
  ];
  assert.equal(inferPageRotationQuarterTurns(textItems, [1, 0, 0, -1, 0, 1008]), 1);
});

test('leaves an upright CAD sheet unrotated', () => {
  const textItems = [
    { str: 'SURVEY PLAN AND TITLE BLOCK WITH WELL SITE DETAILS AND CERTIFICATION', transform: [10, 0, 0, 10, 0, 0] },
    { str: 'BEARINGS DISTANCES ACCESS ROAD AND PLAN NOTES', transform: [10, 0, 0, 10, 0, 0] },
  ];
  assert.equal(inferPageRotationQuarterTurns(textItems, [1, 0, 0, -1, 0, 1008]), 0);
});

test('rotates screen offsets clockwise around their anchor', () => {
  assert.deepEqual(rotateScreenOffsetQuarterTurns([10, 20], 1), [-20, 10]);
  assert.deepEqual(rotateScreenOffsetQuarterTurns([10, 20], 2), [-10, -20]);
  assert.deepEqual(rotateScreenOffsetQuarterTurns([10, 20], 3), [20, -10]);
});

test('accepts the orange-red CAD stroke used by survey plans', () => {
  assert.equal(isPlanRedColor('#ff2e17'), true);
  assert.equal(isPlanRedColor('#ff0000'), true);
  assert.equal(isPlanRedColor([255, 46, 23]), true);
  assert.equal(isPlanRedColor('#6b7f91'), false);
});
