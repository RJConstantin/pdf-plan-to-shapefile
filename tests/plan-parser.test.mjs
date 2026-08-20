import test from 'node:test';
import assert from 'node:assert/strict';

import { detectExplicitDimensions, detectLegalLocation, detectLegalLocations, detectPadTraverse } from '../plan-parser.mjs';

test('detects the Clear North pad-coded LSD location', () => {
  const text = 'CLEAR NORTH GIFT 5P-18-79-12-5 PAGE 5/7';
  assert.equal(detectLegalLocation(text), '5-18-79-12-W5M');
});

test('detects a pad-coded location when PDF extraction adds spaces', () => {
  const text = 'CLEAR NORTH GIFT 5P - 18 - 79 - 12 - 5';
  assert.equal(detectLegalLocation(text), '5-18-79-12-W5M');
});

test('preserves standard LSD location detection', () => {
  assert.equal(detectLegalLocation('LSD 11-15-73-17 W4M'), '11-15-73-17-W4M');
  assert.equal(detectLegalLocation('11-15-73-17-4'), '11-15-73-17-W4M');
});

test('detects an explicit section location', () => {
  assert.equal(detectLegalLocation('SEC-18-79-12-W5M'), 'SEC-18-79-12-W5M');
});

test('detects a labelled half-section location from an as-built plan', () => {
  assert.equal(
    detectLegalLocation('E.1/2 SEC. 12 TWP. 82 RGE. 11 W.5M.'),
    'SEC-12-82-11-W5M'
  );
  assert.equal(
    detectLegalLocation('As Built E12-82-11-5_Rev0 Prelim.pdf'),
    'SEC-12-82-11-W5M'
  );
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

test('detects the Clear North closed pad traverse and tie line', () => {
  const text = `PAD SITE DETAIL
    106°52'35" 230.00 180.00 196°52'35"
    241°52'35" 28.28 142.87 286°52'35" 67.13
    16°52'35" 200.00 140°13'30" 228.15 (Tie Line)`;
  const traverse = detectPadTraverse(text);
  assert.equal(traverse.anchor, 'section-west-midpoint');
  assert.equal(traverse.tie.distance, 228.15);
  assert.equal(traverse.segments.length, 6);

  let east = 0;
  let north = 0;
  for (const segment of traverse.segments) {
    const radians = segment.bearing * Math.PI / 180;
    east += segment.distance * Math.sin(radians);
    north += segment.distance * Math.cos(radians);
  }
  assert.ok(Math.hypot(east, north) < 0.01);
});

test('detects both endpoint legal locations in a preliminary pipeline filename', () => {
  const text = '(Option A) PLA 11-15-73-17-4 to 4-24-73-17-4_Rev0 Prelim.pdf';
  assert.deepEqual(detectLegalLocations(text), [
    '11-15-73-17-W4M',
    '4-24-73-17-W4M',
  ]);
});
