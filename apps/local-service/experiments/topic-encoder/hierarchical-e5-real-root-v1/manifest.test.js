import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGoldManifest,GOLD_FILES} from './manifest.js';

test('actual sealed gold forms root-only48/48 and untouched balanced32, without manufacturing child negatives',async()=>{
  const m=await loadGoldManifest();assert.equal(m.cases.length,128);assert.equal(m.rootNodes.length,16);assert.equal(m.taxonomyNodes.length,63);
  assert.deepEqual(m.goldSourceHashes,GOLD_FILES);assert.ok(Object.isFrozen(m)&&Object.isFrozen(m.cases));
  for(const row of m.cases){
    assert.ok(!Object.hasOwn(row,'expectedTopicId'));assert.equal(typeof row.expectedRootId,'string');
    if(row.split!=='test')assert.equal(row.specificityPath,null);
  }
  const anchors=m.cases.filter(r=>r.specificityPath!==null);assert.equal(anchors.length,4);
  assert.equal(anchors.find(r=>r.id==='real-test-supplement-001').specificityPath.at(-1),'gta');
  assert.equal(anchors.find(r=>r.id==='real-test-supplement-003').specificityPath.at(-1),'koalas');
  for(const id of ['web-01','web-02','web-03','web-04'])assert.ok(!m.cases.some(r=>r.id===id));
});
