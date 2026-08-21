import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  LAT_CODES,
  LAT_DBF_FIELDS,
  ONESTOP_DBF_FIELDS,
  createDbf,
  latActivityLabel,
  latCodesForDisposition,
  latDispositionCode,
  makeLatName,
  makeOneStopName,
  parseOneStopRules,
  projectedGeometryArea,
} from '../submission-rules.mjs';

test('parses the official OneStop linked rules including quoted purposes', async () => {
  const csv = await readFile(new URL('../AER_OneStop_PLAR_A2.csv', import.meta.url), 'utf8');
  const rules = parseOneStopRules(csv);
  assert.ok(rules.length > 100);
  assert.ok(rules.some((rule) => (
    rule.disposition === 'LOC'
    && rule.purpose === 'Research, Monitoring and Education'
    && rule.activity === 'Water Observation / Monitoring - Industrial Use'
  )));
  assert.ok(rules.some((rule) => rule.disposition === 'PLA' && rule.activity === 'PNG / OS Pipeline'));
});

test('filters LAT activity codes by their disposition suffix', () => {
  const dloCodes = latCodesForDisposition('DLO');
  assert.ok(dloCodes.includes('ACES02DLOP'));
  assert.ok(dloCodes.every((code) => latDispositionCode(code) === 'DLO'));
  assert.equal(latActivityLabel('ACES02DLOP'), 'Access - Class I all weather');
  assert.match(latActivityLabel('ACES01EZEP'), /Official LAT activity/);
  assert.ok(LAT_CODES.every((code) => /^[A-Z0-9]{10}$/.test(code)));
});

test('creates the matching submission filenames', () => {
  const date = new Date(2026, 7, 21, 13, 4, 5, 6);
  assert.equal(makeOneStopName('pla', date), 'AER_PLA_20260821130405006');
  assert.equal(makeLatName(date), 'AER_LAT_20260821130405006');
});

test('writes exact OneStop and LAT dBASE schemas', () => {
  const oneStop = createDbf(ONESTOP_DBF_FIELDS, [[
    '1', 'PLA', '0', 'Pipeline', 'PNG / OS Pipeline', '1.235', '', '', '', ''
  ]], new Date(2026, 7, 21));
  const oneStopView = new DataView(oneStop.buffer);
  assert.equal(oneStop[0], 0x03);
  assert.equal(oneStopView.getUint32(4, true), 1);
  assert.equal(oneStopView.getUint16(8, true), 353);
  assert.equal(oneStopView.getUint16(10, true), 269);
  assert.equal(new TextDecoder().decode(oneStop.slice(32, 41)), 'Unique_ID');
  assert.equal(String.fromCharCode(oneStop[43]), 'N');

  const lat = createDbf(LAT_DBF_FIELDS, [['ACES02DLOP']], new Date(2026, 7, 21));
  const latView = new DataView(lat.buffer);
  assert.equal(latView.getUint16(8, true), 65);
  assert.equal(latView.getUint16(10, true), 11);
  assert.equal(new TextDecoder().decode(lat.slice(65 + 1, 65 + 11)), 'ACES02DLOP');
});

test('calculates projected polygon and multipart areas with holes', () => {
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]],
      [[25, 25], [75, 25], [75, 75], [25, 75], [25, 25]],
    ],
  };
  assert.equal(projectedGeometryArea(polygon), 7500);
  assert.equal(projectedGeometryArea({ type: 'MultiPolygon', coordinates: [polygon.coordinates, polygon.coordinates] }), 15000);
});
