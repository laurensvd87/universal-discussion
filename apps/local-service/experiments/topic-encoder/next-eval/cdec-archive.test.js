import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { readCdecArchive } from './cdec-archive.js';

function fixture(overrides = {}) {
  const parts = [];
  for (let i = 0; i < 170; i++) {
    const header = Buffer.alloc(512);
    const name = i === 0 && overrides.name || `cdec-wn-dataset/dataset_docs/${i}.json`;
    const value = Buffer.from('{}');
    header.write(name,0,100,'utf8');
    header.write(value.length.toString(8).padStart(11,'0'),124,11,'ascii');
    header[156] = i === 0 && overrides.kind || 48;
    parts.push(header,Buffer.concat([value,Buffer.alloc(510)]));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}

test('bounded archive parser reads only allowlisted in-memory members', () => {
  const files = readCdecArchive(fixture());
  assert.equal(files.size,170);
  assert.equal(files.get('dataset_docs/0.json').toString('utf8'),'{}');
});

test('archive parser denies traversal and symlink entries', () => {
  assert.throws(()=>readCdecArchive(fixture({name:'cdec-wn-dataset/../bad.json'})));
  assert.throws(()=>readCdecArchive(fixture({kind:50})));
});
