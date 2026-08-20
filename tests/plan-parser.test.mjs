import test from 'node:test';
import assert from 'node:assert/strict';

import { detectDloPlan, detectExplicitDimensions, detectLegalLocation, detectLegalLocations, detectPadTraverse, detectPlanAreas, detectPlanCoordinates, detectPlanScale, detectSectionAnchors, detectSurveyDistances } from '../plan-parser.mjs';

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

test('prioritizes the well-centre legal location over nearby survey controls', () => {
  const text = 'N1/4 36-92-13W4 WELLCENTER (Within MSL260395) SUNCOR DW2 DOVER 14-2-92-12 within Theoretical NW 2, Twp. 92, Rge. 12, West of the 4th Meridian';
  assert.equal(detectLegalLocation(text), '14-2-92-12-W4M');
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

test('detects quarter-section and half-section anchors from borrow-pit filenames', () => {
  assert.deepEqual(
    detectSectionAnchors('As Built NE33-82-13-5_Rev0 Prelim.pdf'),
    [{ legal: 'SEC-33-82-13-W5M', sec: 33, twp: 82, rge: 13, mer: 5, part: 'NE', northSide: true, eastSide: true }]
  );
  assert.deepEqual(
    detectSectionAnchors('As Built S32-82-12-5_Rev0 Prelim.pdf')[0],
    { legal: 'SEC-32-82-12-W5M', sec: 32, twp: 82, rge: 12, mer: 5, part: 'S', northSide: false, eastSide: null }
  );
});

test('detects two adjoining quarter-section anchors from a borrow-pit filename', () => {
  const anchors = detectSectionAnchors('As Built NE 28 and SE 33-82-12-5_Rev0 Prelim.pdf');
  assert.deepEqual(anchors.map((anchor) => [anchor.part, anchor.sec, anchor.legal]), [
    ['NE', 28, 'SEC-28-82-12-W5M'],
    ['SE', 33, 'SEC-33-82-12-W5M'],
  ]);
});

test('uses the overview scale when a plan also contains larger details', () => {
  assert.equal(detectPlanScale('SCALE 1:5000 DETAIL SCALE 1:1000'), 5000);
  assert.equal(detectPlanScale('SCALE 1:2500 OVERVIEW SCALE 1:10 000'), 10000);
  assert.equal(detectPlanScale('Scale - 1 : 5000 DETAIL Scale - 1 : 500'), 5000);
});

test('detects proposed coordinates when PDF extraction places values before their labels', () => {
  const text = 'PROPOSED COORDINATES UTM 570342.52 6189333.51 Latitude -115.876617 55.844408 Longitude = = NAD 83';
  assert.deepEqual(detectPlanCoordinates(text), { lat: 55.844408, lon: -115.876617 });
});

test('detects proposed coordinates from unsigned latitude and signed longitude DMS values', () => {
  const text = 'PROPOSED COORDINATES Latitude -115°52\'35.8" 55°50\'39.9" Longitude';
  const result = detectPlanCoordinates(text);
  assert.ok(Math.abs(result.lat - 55.8444167) < 1e-6);
  assert.ok(Math.abs(result.lon + 115.8766111) < 1e-6);
});

test('detects sketch-plan areas in visual and PDF extraction order', () => {
  assert.deepEqual(
    detectPlanAreas('WELL SITE = 4.598 ha EXISTING ACCESS ROAD = 3.244 ha TOTAL = 7.842 ha'),
    { site: 4.598, access: 3.244, total: 7.842 }
  );
  assert.deepEqual(
    detectPlanAreas('= 4.598 ha (11.36 ac.) WELL SITE = 3.244 ha (8.02 ac.) EXISTING ACCESS ROAD = 7.842 ha (19.38 ac.) TOTAL'),
    { site: 4.598, access: 3.244, total: 7.842 }
  );
});

test('detects a DLO recreational-trail plan and its area controls', () => {
  const text = `AS-BUILT DLO RECREATIONAL TRAIL
    DISPOSITION AREAS DLO: Area outside existing dispositions 0.652 ha Total 0.652 ha
    2 m ACCESS ROAD = 30.3 km`;
  assert.deepEqual(detectDloPlan(text), { area: 0.652, width: 2, lengthKm: 30.3 });
});

test('detects a punctuated DLO section title', () => {
  assert.equal(
    detectLegalLocation('N.1/2 & S.E.1/4 Sec.25 Twp.41 - Rge.8 - W.5M.'),
    'SEC-25-41-8-W5M'
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

test('does not use a labelled corner cut as the site dimensions', () => {
  assert.equal(detectExplicitDimensions('8.00 A/R 20.0x20.0 Corner Cut Well Site Detail'), null);
});

test('collects surveyed distances while excluding bearing values', () => {
  assert.deepEqual(
    detectSurveyDistances("100.00 89°59'00'' 80.00 359°59'00'' 42.60 179°59'00''"),
    [100, 80, 42.6],
  );
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
