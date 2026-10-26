import { ServiceError } from '../../src/domain/errors.js';

const MAX_DIMENSIONS = 1536;
const MAX_PARAMETERS = 65535;
const MAX_BASE64_LENGTH = Math.ceil((20 + MAX_DIMENSIONS * 12) / 3) * 4;

function corrupt() {
  throw new ServiceError('storage-corrupt', 'Invalid canonical embedding binary data');
}

// PostgreSQL array_send: ndim, flags, element OID, dimension/lower bound,
// then a signed byte length and the network-order float8 for every element.
// Reading binary64 directly avoids decimal conversion and preserves signed zero.
export function decodeEmbeddingFloat8Array(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 32 || bytes.length > 20 + MAX_DIMENSIONS * 12)
    corrupt();
  if (bytes.readInt32BE(0) !== 1 || bytes.readInt32BE(4) !== 0 ||
      bytes.readUInt32BE(8) !== 701 || bytes.readInt32BE(16) !== 1) corrupt();
  const dimensions = bytes.readInt32BE(12);
  if (dimensions < 1 || dimensions > MAX_DIMENSIONS || bytes.length !== 20 + dimensions * 12)
    corrupt();
  const values = new Array(dimensions);
  for (let index = 0, offset = 20; index < dimensions; index += 1, offset += 12) {
    if (bytes.readInt32BE(offset) !== 8) corrupt();
    const value = bytes.readDoubleBE(offset + 4);
    if (!Number.isFinite(value)) corrupt();
    values[index] = value;
  }
  return values;
}

// Text protocol transports the PostgreSQL binary representation through ASCII
// base64. This avoids pg-protocol versions that decode binary DataRows as UTF8.
export function decodeEmbeddingBase64Array(value) {
  if (typeof value !== 'string' || value.length < 44 || value.length > MAX_BASE64_LENGTH ||
      value.length % 4 !== 0) corrupt();
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) corrupt();
  return decodeEmbeddingFloat8Array(bytes);
}

// Deliberately restricted to the embedding projection. Other columns retain
// ordinary PostgreSQL text-protocol parsing, without any global parser changes.
export function createEmbeddingWireQuery(text, values = []) {
  if (typeof text !== 'string' || text.length > 600000 || !Array.isArray(values) ||
      values.length > MAX_PARAMETERS || values.some((value) => typeof value !== 'string')) corrupt();
  const match = /^\s*SELECT\s+source_id\s*,\s*payload\s*,\s*model_id\s*,\s*dimensions\s*,\s*values_double\s+FROM\s+canonical_v4\.embeddings(?:\s+WHERE\s+source_id\s*(=\s*\$1|IN\s*\(([^)]*)\)))?\s*$/u.exec(text);
  if (!match) corrupt();
  if (match[1]?.startsWith('=')) {
    if (values.length !== 1) corrupt();
  } else if (match[1]) {
    const parameters = match[2].split(',').map((value) => value.trim());
    if (!parameters.length || parameters.length !== values.length ||
        parameters.some((value, index) => value !== `$${index + 1}`)) corrupt();
  } else if (values.length) corrupt();
  return { text: text.replace(/\bvalues_double\b/u,
    "replace(encode(array_send(values_double),'base64'), chr(10), '') AS values_double_base64"),
    values: values.slice() };
}
