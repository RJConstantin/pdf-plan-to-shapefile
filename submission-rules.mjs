export const ONESTOP_DBF_FIELDS = [
  ['Unique_ID', 'N', 4, 0],
  ['Disp_Type', 'C', 10, 0],
  ['Rel_Unq_ID', 'N', 9, 0],
  ['Purpose', 'C', 100, 0],
  ['Activity', 'C', 100, 0],
  ['Area_Ha', 'N', 11, 3],
  ['Confl_Free', 'C', 3, 0],
  ['Adjoi_Disp', 'C', 3, 0],
  ['Space_Reqm', 'C', 3, 0],
  ['Sur_Pln_ID', 'C', 25, 0],
];

export const LAT_DBF_FIELDS = [['ACT_TYPE', 'C', 10, 0]];

export const LAT_DISPOSITIONS = {
  DLO: 'Licence of Occupation',
  DML: 'Miscellaneous Lease',
  DMS: 'Mineral Surface Lease',
  DPI: 'Pipeline Installation Lease',
  DPL: 'Pipeline Agreement',
  EZE: 'Easement',
  REA: 'Rural Electric Association Easement',
  REC: 'Recreational Development',
  SMC: 'Surface Material License',
  SME: 'Surface Materials Exploration',
  SML: 'Surface Material Lease',
  TCL: 'Tourism and Commercial Recreation Lease',
  VCE: 'Vegetation Control Easement',
};

export const LAT_CODE_LABELS = {
  ACES02DLOP: 'Access - Class I all weather',
  ACES03DLOP: 'Access - Class II all weather or dry',
  ACES04DLOP: 'Access - Class III all weather or dry',
  ACES05DLOP: 'Access - Class IV frozen/dry',
  ACES06DLOP: 'Access - Class V frozen',
  ACES07DLOP: 'Access - Class VI frozen',
  ARAC01DLOP: 'Aerial access - Airstrip',
  ARAC03DLOP: 'Aerial access - Heliport',
  SRMT02SMLP: 'Surface materials - Gravel',
  SRMT07SMLP: 'Surface materials - Sand',
  SRMT08SMLP: 'Surface materials - Sand and gravel',
  SRMT13SMEP: 'Surface materials exploration - Peat',
  SRMT14SMEP: 'Surface materials exploration - Aggregate',
  SRMT15SMEP: 'Surface materials exploration - Other',
};

const LAT_CODE_TEXT = `ACES01EZEP,ACES02DLOP,ACES03DLOP,ACES04DLOP,ACES05DLOP,ACES06DLOP,ACES07DLOP,ACES09DLOP,ACES10DLOP,ACES11EZEP,ACES12DLOP,ACES12EZEP,ACES14DLOP,ACES15DLOP,ARAC01DLOP,ARAC03DLOP,ARAC04DMLP,BDSH01DLOP,BDSH02DLOP,BDSH03DLOP,BDSH04DLOP,BDSH05DLOP,BDSH06DLOP,BDSH07DLOP,BDSH08DLOP,BDSH12DLOP,BDSH13DLOP,BDSH14DLOP,BDSH15DLOP,BDSH16DLOP,BDSH17DLOP,BDSH18DLOP,BDSH19DLOP,CMDV01DMLP,CMDV02DMLP,CMDV03DMLP,CMDV04DMLP,CMDV05DMLP,CMRR01EZEP,CMRR01REAP,CMRR02EZEP,CMRR02REAP,CMRR03DMLP,EDRA01EZEP,EDRA01REAP,EDRA02DMLP,EDRA03EZEP,EDRA03REAP,EDRA04EZEP,EDRA04REAP,EDRA05EZEP,EDRA05REAP,EPEA01DLOP,FHCP01VCEP,GRTA01DLOP,GRTA03DLOP,GRTA04DLOP,GRTA05DLOP,HLPR01DMLP,PIIN08DMLP,PRKD01DPLP,PRKD02DPLP,PRKD03DLOP,PRKD04DPLP,PRKD05DLOP,PRKD05DPLP,PRKD07DPLP,PRKD10DLOP,PRKD11DLOP,PRUT01DPIP,PRUT02DPIP,PRUT03DPIP,PRUT04DPIP,PRUT05DPIP,PRUT06DPIP,PRUT07DPIP,PRUT08DPIP,PRUT09DPIP,PRUT10DPIP,PURL01DLOP,PURL04EZEP,PURL06DMLP,PURL07DMLP,PVLH01DMSP,PVLH02DMSP,PVLH03DMSP,PVLH04DMSP,RCTR01DLOP,RCTR01DMLP,RCTR02DLOP,RCTR02DMLP,RCTR04DMLP,RCTR05DMLP,RCTR06DMLP,RCTR07DMLP,RCTR08DLOP,RDMN01DMLP,RDMN01RECP,RDMN02DMLP,RDMN02RECP,RDMN03DMLP,RDMN03RECP,RDMN04DMLP,RDMN04RECP,RDMN05DMLP,RDMN05RECP,RDMN06DMLP,RDMN06RECP,RDMN07DMLP,RDMN07RECP,RDMN08DMLP,RDMN08RECP,RDMN10DMLP,RDMN10RECP,RDMN11DMLP,RDMN11RECP,RDMN12DLOP,RDMN13DMLP,RDMN13RECP,RDMN14DMLP,RDMN14RECP,RDMN15DMLP,RDMN15RECP,RDMN16DMLP,RDMN16RECP,RDVC01DMLP,RDVC02DMLP,RDVC03DMLP,RDVC04DMLP,RDVC05DMLP,RDVC06DMLP,RDVC07DMLP,RDVC08DMLP,RDVC09DMLP,RDVC11DMLP,RDVC12DMLP,RDVC13DLOP,RDVC14DMLP,RDVC15DMLP,RDVC16DMLP,RMSP09DLOP,RMSP10DLOP,RMSP11DLOP,RMSP12DLOP,RMSP13DLOP,RMSP14DLOP,RMSP15DLOP,RMSP16DLOP,RMSP17DLOP,SRMT02SMCP,SRMT02SMLP,SRMT03SMCP,SRMT03SMLP,SRMT04SMCP,SRMT04SMLP,SRMT05SMCP,SRMT05SMLP,SRMT06SMLP,SRMT07SMCP,SRMT07SMLP,SRMT08SMCP,SRMT08SMLP,SRMT09SMCP,SRMT09SMLP,SRMT10SMCP,SRMT10SMLP,SRMT11SMCP,SRMT11SMLP,SRMT12SMCP,SRMT12SMLP,SRMT13SMEP,SRMT14SMEP,SRMT15SMEP,SRMT16SMLP,SRNP01DMLP,SRNP02DMLP,SRNP03DMLP,SRNP04DMLP,SRNP05DMLP,SRNP06DMLP,TACD01TCLP,TACD02TCLP,TACD03TCLP,TACD04TCLP,TACD05TCLP,TACD06TCLP,TACD07TCLP,TACD08TCLP,TACD09TCLP,TACD10TCLP,TACD11TCLP,TACD12TCLP,TACD13TCLP,TACD14DLOP,TCDM01TCLP,TCDM02TCLP,TCDM03TCLP,TCDM04TCLP,TCDM05TCLP,TCDM06TCLP,TCDM07TCLP,TCDM08TCLP,TCDM09TCLP,TCDM10TCLP,TCDM11TCLP,TCDM12TCLP,TCDM13DLOP,TRCA01VCEP,WAIN01DMLP,WAIN02DMLP,WAIN03DMLP,WAIN04DMLP,WAIN05DMLP,WAUD01DLOP,WAUD02DLOP,WAUD04DLOP,WAUD05DLOP,WAUD06DLOP,WAUD07DLOP,WAUD08DLOP,WAUD10DLOP,WAUD11DLOP,WAUD12DLOP,WAUD13DLOP,WAUD14DLOP,WLSI02DMLP,WLSI03DMLP,WVER01DMLP,WVER02DMLP,WVER03DMLP,WVER04DMLP,WVER07DMLP,WVER08DMLP,WVER09DMLP,WVER10DMLP,WVER11DMLP,WVER14DMLP,WVER15DMLP`;

export const LAT_CODES = Object.freeze(LAT_CODE_TEXT.split(','));

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field.replace(/\r$/, ''));
  if (row.some((value) => value.length)) rows.push(row);
  return rows;
}

export function parseOneStopRules(text) {
  const [header = [], ...rows] = parseCsv(text);
  const indexes = Object.fromEntries(header.map((value, index) => [value.trim(), index]));
  return rows.map((row) => ({
    disposition: (row[indexes.Disp_Type] || '').trim(),
    purpose: (row[indexes.Purpose] || '').trim(),
    activity: (row[indexes.Activity] || '').trim(),
    notes: (row[indexes.Notes] || '').trim(),
  })).filter((rule) => rule.disposition && rule.purpose && rule.activity);
}

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function latDispositionCode(code) {
  return /^[A-Z0-9]{10}$/.test(code || '') ? code.slice(-4, -1) : '';
}

export function latCodesForDisposition(disposition) {
  return LAT_CODES.filter((code) => latDispositionCode(code) === disposition);
}

export function latActivityLabel(code) {
  return LAT_CODE_LABELS[code] || `Official LAT activity (${code})`;
}

export function makeSubmissionTimestamp(date = new Date()) {
  const pad = (value, size = 2) => String(value).padStart(size, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}${pad(date.getMilliseconds(), 3)}`;
}

export function makeOneStopName(disposition, date = new Date()) {
  const code = String(disposition || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'FILE';
  return `AER_${code}_${makeSubmissionTimestamp(date)}`;
}

export function makeLatName(date = new Date()) {
  return `AER_LAT_${makeSubmissionTimestamp(date)}`;
}

function encodeDbfName(name) {
  const output = new Uint8Array(11);
  output.set(new TextEncoder().encode(String(name).slice(0, 10)), 0);
  return output;
}

function encodeDbfValue(value, width, rightAlign = false) {
  const output = new Uint8Array(width).fill(32);
  const encoded = new TextEncoder().encode(String(value ?? '').slice(0, width));
  output.set(encoded, rightAlign ? Math.max(0, width - encoded.length) : 0);
  return output;
}

export function createDbf(fields, rows, date = new Date()) {
  const headerLength = 32 + fields.length * 32 + 1;
  const recordLength = 1 + fields.reduce((sum, field) => sum + field[2], 0);
  const output = new Uint8Array(headerLength + recordLength * rows.length + 1);
  const view = new DataView(output.buffer);
  output[0] = 0x03;
  output[1] = date.getFullYear() - 1900;
  output[2] = date.getMonth() + 1;
  output[3] = date.getDate();
  view.setUint32(4, rows.length, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);

  fields.forEach(([name, type, width, decimals], index) => {
    const offset = 32 + index * 32;
    output.set(encodeDbfName(name), offset);
    output[offset + 11] = type.charCodeAt(0);
    output[offset + 16] = width;
    output[offset + 17] = decimals;
  });
  output[headerLength - 1] = 0x0d;

  rows.forEach((row, rowIndex) => {
    let offset = headerLength + rowIndex * recordLength;
    output[offset] = 0x20;
    offset += 1;
    fields.forEach((field, fieldIndex) => {
      const [, type, width] = field;
      output.set(encodeDbfValue(row[fieldIndex], width, type === 'N'), offset);
      offset += width;
    });
  });
  output[output.length - 1] = 0x1a;
  return output;
}

function ringArea(ring) {
  let area = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    area += ring[previous][0] * ring[index][1] - ring[index][0] * ring[previous][1];
  }
  return Math.abs(area) / 2;
}

export function projectedGeometryArea(geometry) {
  const polygonArea = (rings) => rings.reduce((sum, ring, index) => (
    sum + ringArea(ring) * (index === 0 ? 1 : -1)
  ), 0);
  if (geometry?.type === 'Polygon') return polygonArea(geometry.coordinates);
  if (geometry?.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
  }
  return 0;
}
