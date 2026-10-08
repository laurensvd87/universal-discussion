import { gunzipSync } from 'node:zlib';

const PREFIX = 'cdec-wn-dataset/';
const MAX_UNPACKED = 16 * 1024 * 1024;
const BLOCK = 512;

function field(buffer, start, end) {
  return buffer.subarray(start, end).toString('utf8').replace(/\0.*$/su, '').trim();
}

// Accept only the fixed archive's documented file inventory, and never hand
// path strings to the filesystem. The caller separately verifies SHA-256.
export function readCdecArchive(compressed) {
  if (!Buffer.isBuffer(compressed) || compressed.length < 100 || compressed.length > 2 * 1024 * 1024)
    throw new TypeError('Invalid research archive');
  const tar = gunzipSync(compressed, { maxOutputLength: MAX_UNPACKED });
  const files = new Map();
  let offset = 0, entries = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every(byte => byte === 0)) break;
    if (++entries > 512) throw new Error('Research archive has too many entries');
    const name = field(header, 0, 100);
    const prefix = field(header, 345, 500);
    const path = prefix ? `${prefix}/${name}` : name;
    const kind = header[156];
    const sizeField = field(header, 124, 136);
    if (!/^[0-7]+$/u.test(sizeField)) throw new Error('Invalid archive size');
    const size = Number.parseInt(sizeField, 8);
    const padded = Math.ceil(size / BLOCK) * BLOCK;
    if (!Number.isSafeInteger(size) || size > 4 * 1024 * 1024 || offset + BLOCK + padded > tar.length ||
        !path.startsWith(PREFIX) || path.includes('..') || path.includes('\\'))
      throw new Error('Invalid research archive entry');
    if (kind === 53) {
      if (size !== 0 || !path.endsWith('/')) throw new Error('Invalid directory entry');
    } else if (kind === 0 || kind === 48) {
      const relative = path.slice(PREFIX.length);
      if (!/^(?:dataset_docs\/\d+\.json|dataset_splits\/(?:train|test)_subtopics\.txt|dataset_labels\/coref_pairs\.json|README\.md|LICENSE)$/u.test(relative) ||
          files.has(relative)) throw new Error('Unexpected or duplicate research file');
      files.set(relative, tar.subarray(offset + BLOCK, offset + BLOCK + size));
    } else throw new Error('Unsupported archive entry type');
    offset += BLOCK + padded;
  }
  if (entries < 170 || files.size < 170) throw new Error('Incomplete research archive');
  return files;
}
