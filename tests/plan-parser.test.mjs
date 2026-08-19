import test from 'node:test';
import assert from 'node:assert/strict';

import { detectLegalLocation } from '../plan-parser.mjs';

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
