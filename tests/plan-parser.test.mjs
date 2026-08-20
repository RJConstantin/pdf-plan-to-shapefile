import test from 'node:test';
import assert from 'node:assert/strict';

import { detectExplicitDimensions, detectLegalLocation } from '../plan-parser.mjs';

test('detects the Clear North pad-coded section location', () => {
  const text = 'CLEAR NORTH GIFT 5P-18-79-12-5 PAGE 5/7';
  assert.equal(detectLegalLocation(text), 'SEC-18-79-12-W5M');
});

test('detects a pad-coded location when PDF extraction adds spaces', () => {
  const text = 'CLEAR NORTH GIFT 5P - 18 - 79 - 12 - 5';
  assert.equal(detectLegalLocation(text), 'SEC-18-79-12-W5M');
});

test('preserves standard LSD location detection', () => {
  assert.equal(detectLegalLocation('LSD 11-15-73-17 W4M'), '11-15-73-17-W4M');
  assert.equal(detectLegalLocation('11-15-73-17-4'), '11-15-73-17-W4M');
});

test('detects an explicit section location', () => {
  assert.equal(detectLegalLocation('SEC-18-79-12-W5M'), 'SEC-18-79-12-W5M');
});

test('rejects out-of-range legal locations', () => {
  assert.equal(detectLegalLocation('5P-48-79-12-5'), null);
  assert.equal(detectLegalLocation('18-45-79-12-W5M'), null);
});

test('does not mistake repeated survey measurements and bearings for pad dimensions', () => {
  const text = '55.00 55.00 55.00 55.00 286°52\'35" 40.00 40.00 85.00 230.00 142.87';
  assert.equal(detectExplicitDimensions(text), null);
});

test('detects an explicit dimension pair', () => {
  assert.deepEqual(detectExplicitDimensions('PROPOSED PAD 150 m x 200 m'), {
    width: 150,
    height: 200,
  });
});

test('detects labelled width and length values', () => {
  assert.deepEqual(detectExplicitDimensions('WIDTH: 125.5 m LENGTH: 180 m'), {
    width: 125.5,
    height: 180,
  });
});
