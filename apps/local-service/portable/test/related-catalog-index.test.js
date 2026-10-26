import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildRelatedCatalogIndex as build, relatedCatalogChanges as changes, rankRelatedCatalogIndex as rank, prepareRelatedCatalogEntry,
  createRelatedCatalogEntryPreparation, readRelatedCatalogCapacityLimits } from '../canonical-v4/related-catalog-index.js';
import { createRelatedSourcesPreparation } from '../../../../spikes/topic-resolution/browser/core/related-sources.js';
import { BROWSER_MODEL_ID } from '../../src/domain/learned-sources.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function source(id, ordinal, cosine = 1, extra = {}) {
  const values = Array(384).fill(0); values[0] = cosine; values[1] = Math.sqrt(1 - cosine * cosine);
  return { id, ordinal, url: `https://example.org/${id}`, title: `Title ${id}`,
    embedding: { modelId: BROWSER_MODEL_ID, values }, topicId: null, primaryTopicId: `primary-${id}`,
    extractorVersion: 'main-text-prefix/v1', ...extra };
}
function proof(entries, extra = {}) {
  return { generation: 'generation', serverIdentity: 'server-start-1', relations: 'relation-manifest-1',
    horizon: '100', validatedAt: 1000, witnesses: entries.map(entry => ({ id: entry.id, ordinal: entry.ordinal,
      stamp: digest(entry), minAge: '1', maxAge: '100' })), ...extra };
}
function oracle(entries, id, limit = 20) {
  const compatible = entry => entry.embedding?.modelId === BROWSER_MODEL_ID &&
    ['main-text-prefix/v1', 'article-container-prefix/v1', 'crawler-static-html-prefix/v1'].includes(entry.extractorVersion);
  const values = entries.filter(compatible).map(({ id, url, title, embedding, topicId }) => ({ id, url, title, embedding, topicId }));
  const preparation = createRelatedSourcesPreparation(); preparation.append(values);
  return preparation.finish().rank(values.find(entry => entry.id === id), {
    limit, minSimilarity: 0.88, fallbackMinSimilarity: 0.80,
  }).map(({ id, url, title, relationship, method }) => ({ id, url, title, relationship, method,
    topicId: entries.find(entry => entry.id === id).primaryTopicId }));
}
async function fresh(entries, evidence = proof(entries)) { return build({ evidence, entries }); }
function freezeProof(value) {
  for (const witness of value.witnesses) Object.freeze(witness);
  Object.freeze(value.witnesses);
  return Object.freeze(value);
}

test('warm unchanged evidence reuses the exact opaque view without extending the original lifetime', async () => {
  const entries = [source('query', 0), source('a', 256, 0.9)], previous = await fresh(entries);
  const evidence = freezeProof(proof(entries, { horizon: '120', validatedAt: 299000 }));
  assert.deepEqual(changes(previous, evidence), { reuse: true, changedIds: [], removedIds: [] });
  const unchanged = await build({ previous, evidence, entries: [] });
  assert.equal(unchanged, previous);
  assert.deepEqual(await rank(unchanged, 'query', 20), oracle(entries, 'query'));
  assert.equal(changes(unchanged, proof(entries, { horizon: '121', validatedAt: 301001 })).reuse, false);
  await assert.rejects(() => build({ previous, evidence, entries: [entries[0]] }), TypeError);
});

test('mutable evidence is revalidated between changes and build instead of memoized', async () => {
  const entries = [source('query', 0), source('a', 256, 0.9)], previous = await fresh(entries);
  const evidence = proof(entries);
  assert.equal(changes(previous, evidence).changedIds.length, 0);
  evidence.witnesses[1].stamp = 'f'.repeat(64);
  await assert.rejects(() => build({ previous, evidence, entries: [] }), TypeError);
  evidence.witnesses[1].minAge = '0';
  assert.equal(changes(previous, evidence).reuse, false);
});

test('private compact vector storage preserves normalization arithmetic, signed zero and extreme coordinates', async () => {
  const query = source('query', 0), normal = source('normal', 256, 0.91), extreme = source('extreme', 512, 0.92);
  query.embedding.values[2] = -0;
  normal.embedding.values = normal.embedding.values.map(value => value * Number.MIN_VALUE);
  extreme.embedding.values = extreme.embedding.values.map(value => value * 1e300);
  const entries = [query, normal, extreme];
  const view = await fresh(entries);
  for (const id of ['query', 'normal', 'extreme']) assert.deepEqual(await rank(view, id, 20), oracle(entries, id));
});

test('persistent chunks exactly match the exhaustive oracle for ties, duplicates, manual priority and both floors', async () => {
  for (const cosine of [0.79, 0.80, 0.85, 0.879, 0.88, 0.92, 1]) {
    const entries = [source('query', 0, 1, { topicId: 'manual' }),
      source('alpha', 256, cosine), source('beta', 512, cosine),
      source('confirmed', 768, -1, { topicId: 'manual' }),
      source('duplicate', 1024, cosine, { url: 'https://example.org/alpha#fragment' })];
    const view = await fresh(entries);
    for (const limit of [0, 1, 2, 20, 100]) assert.deepEqual(await rank(view, 'query', limit), oracle(entries, 'query', limit));
    entries[3].topicId = null;
    assert.deepEqual(await rank(await fresh(entries), 'query', 20), oracle(entries, 'query'));
  }
});

test('fallback is globally one best hit and disappears when any chunk contains an ordinary result', async () => {
  const entries = [source('query', 0), source('lower', 256, 0.81), source('best', 512, 0.87)];
  assert.deepEqual((await rank(await fresh(entries), 'query', 20)).map(entry => entry.id), ['best']);
  entries.push(source('ordinary', 768, 0.9));
  assert.deepEqual((await rank(await fresh(entries), 'query', 20)).map(entry => entry.id), ['ordinary']);
});

test('many cross-chunk URL duplicates and equal scores preserve the global top-k oracle', async () => {
  const entries = [source('query', 0, 1, { topicId: 'manual' }), ...Array.from({ length: 220 }, (_, index) =>
    source(`candidate-${String(index).padStart(3, '0')}`, (index + 1) * 256, 0.7 + (index % 31) * 0.009, {
      url: `https://example.org/shared-${index % 80}`,
      topicId: index % 13 === 0 ? 'manual' : null,
      extractorVersion: index % 17 === 0 ? 'unsupported' : 'article-container-prefix/v1',
    }))];
  const view = await fresh([...entries].reverse());
  for (const limit of [1, 5, 20, 100]) assert.deepEqual(await rank(view, 'query', limit), oracle(entries, 'query', limit));
});

test('delta updates copy only changed IDs, remove deleted IDs and preserve the exhaustive result', async () => {
  const original = [source('query', 0), source('a', 256, 0.9), source('b', 512, 0.85)];
  const first = await fresh(original);
  const next = [original[0], source('a', 257, 0.91), source('c', 768, 0.96)];
  const evidence = proof(next, { horizon: '120', validatedAt: 1200 });
  assert.deepEqual(changes(first, evidence), { reuse: true, changedIds: ['a', 'c'], removedIds: ['b'] });
  const second = await build({ previous: first, evidence, entries: next.slice(1) });
  assert.deepEqual(await rank(second, 'query', 20), oracle(next, 'query'));
  assert.deepEqual(await rank(first, 'query', 20), oracle(original, 'query'));
  await assert.rejects(() => rank(second, 'b', 20), { code: 'not-found' });
  await assert.rejects(() => build({ previous: first, evidence, entries: [next[1]] }), TypeError);
  await assert.rejects(() => build({ previous: first, evidence, entries: next }), TypeError);
});

test('original time and xid8 baselines survive partial patches and equality checks', async () => {
  const entries = [source('query', 0), source('a', 256, 0.9)];
  let view = await fresh(entries);
  const patch = [entries[0], source('a', 256, 0.95)];
  const middle = proof(patch, { horizon: '900000000', validatedAt: 290000 });
  view = await build({ previous: view, evidence: middle, entries: [patch[1]] });
  assert.equal(changes(view, proof(patch, { horizon: '1000000100', validatedAt: 290001 })).reuse, false);
  assert.equal(changes(view, proof(patch, { horizon: '900000001', validatedAt: 301001 })).reuse, false);
  assert.equal(changes(view, proof(patch, { horizon: '900000001', validatedAt: 301000 })).reuse, true);
  const unchanged = await build({ previous: view, evidence: proof(patch, { horizon: '900000001', validatedAt: 300000 }), entries: [] });
  assert.equal(changes(unchanged, proof(patch, { horizon: '900000002', validatedAt: 301001 })).reuse, false);
});

test('generation, restart, rewrite, time regression and xid regression invalidate the entire prior proof', async () => {
  const entries = [source('query', 0), source('a', 256, 0.9)], view = await fresh(entries);
  for (const extra of [{ generation: 'new' }, { serverIdentity: 'new' }, { relations: 'rewritten' },
    { validatedAt: 999 }, { horizon: '99' }, { horizon: '1000000100' }]) {
    const change = changes(view, proof(entries, extra));
    assert.equal(change.reuse, false);
    assert.deepEqual(change.changedIds, ['query', 'a']);
  }
  const nearWrap = await fresh(entries, proof(entries, { horizon: '4294967290' }));
  assert.equal(changes(nearWrap, proof(entries, { horizon: '4294967300' })).reuse, true, 'full xid8 advance, not low32 ordering');
});

test('unsafe tuple ages prevent reuse even if every stamp is unchanged; fully checked unsafe views still rank', async () => {
  const entries = [source('query', 0), source('a', 256, 0.9)], first = await fresh(entries);
  for (const age of [{ minAge: '0', maxAge: '1' }, { minAge: '-1', maxAge: '1' },
    { minAge: '1', maxAge: '1000000000' }]) {
    const evidence = proof(entries);
    Object.assign(evidence.witnesses[1], age);
    assert.equal(changes(first, evidence).reuse, false);
    const unsafeView = await fresh(entries, evidence);
    assert.deepEqual(await rank(unsafeView, 'query', 20), oracle(entries, 'query'));
    assert.equal(changes(unsafeView, proof(entries)).reuse, false);
  }
});

test('ineligible rows remain tracked, never rank, and cannot serve as the query', async () => {
  const entries = [source('query', 0), source('a', 256, 0.9),
    source('unsupported-model', 512, 1, { embedding: { modelId: 'other-model', values: [0, 1] } }),
    source('unsupported-extractor', 768, 1, { extractorVersion: 'unsupported' })];
  const view = await fresh(entries);
  assert.deepEqual(await rank(view, 'query', 20), oracle(entries, 'query'));
  await assert.rejects(() => rank(view, 'unsupported-model', 20), { code: 'unavailable' });
  await assert.rejects(() => rank(view, 'unsupported-extractor', 20), { code: 'unavailable' });
  const next = structuredClone(entries); next[2].title = 'changed excluded title';
  assert.deepEqual(changes(view, proof(next)).changedIds, ['unsupported-model']);
});

test('opaque views own all input and output data and reject getters/proxies without execution', async () => {
  const entries = [source('query', 0), source('a', 256, 0.9)], before = structuredClone(entries);
  const view = await fresh(entries);
  entries[1].embedding.values[0] = -1; entries[1].title = 'changed';
  const result = await rank(view, 'query', 20);
  assert.deepEqual(result, oracle(before, 'query'));
  assert.ok(Object.isFrozen(view)); assert.deepEqual(Object.keys(view), []);
  assert.ok(Object.isFrozen(result[0]));
  let calls = 0;
  const getter = source('bad', 0);
  Object.defineProperty(getter, 'title', { enumerable: true, get() { calls++; return 'bad'; } });
  await assert.rejects(() => fresh([getter], proof(before.slice(0, 1))), TypeError);
  const proxy = new Proxy({}, { get() { calls++; throw Error('executed'); }, getPrototypeOf() { calls++; throw Error('executed'); } });
  assert.throws(() => changes(null, proxy), TypeError);
  await assert.rejects(() => build(proxy), TypeError);
  assert.equal(calls, 0);
});

test('count, chunk and cumulative budgets fail closed, including deltas crossing the total budget', async () => {
  assert.throws(() => changes(null, proof([], { witnesses: Array(131073).fill(null) })), { code: 'capacity' });
  const sparse = Array.from({ length: 513 }, (_, index) => source(`s${index}`, index * 256));
  await assert.rejects(() => fresh(sparse), { code: 'capacity' });
  const bigTitle = 't'.repeat(512), bigUrl = `https://example.org/${'u'.repeat(8000)}`;
  const entries = Array.from({ length: 3601 }, (_, index) => source(`s${index}`, index, 1, { title: bigTitle, url: `${bigUrl}${index}` }));
  const initial = entries.slice(0, 3600), view = await fresh(initial);
  // Large URL entries consume >8k units each; add enough to exceed 32Mi units only
  // after an otherwise small delta, proving the total is not checked per chunk.
  const extra = Array.from({ length: 200 }, (_, index) => source(`extra${index}`, 3601 + index, 1, { title: bigTitle, url: `${bigUrl}x${index}` }));
  await assert.rejects(() => build({ previous: view, evidence: proof([...initial, ...extra]), entries: extra }), { code: 'capacity' });
  await assert.rejects(() => fresh([...entries, ...extra]), { code: 'capacity' });
});

test('malformed evidence, ordinal collisions, nonfinite vectors and forged views fail closed', async () => {
  const entries = [source('query', 0), source('a', 256, 0.9)];
  const duplicate = proof(entries); duplicate.witnesses[1].ordinal = 0;
  assert.throws(() => changes(null, duplicate), TypeError);
  assert.throws(() => changes(null, proof(entries, { horizon: '1e2' })), TypeError);
  assert.throws(() => changes(Object.freeze({}), proof(entries)), TypeError);
  const bad = structuredClone(entries); bad[1].embedding.values[0] = Infinity;
  await assert.rejects(() => fresh(bad, proof(entries)), TypeError);
  await assert.rejects(() => build({ evidence: proof(entries), entries: [{ ...entries[0], ordinal: 1 }, entries[1]] }), TypeError);
});

test('cooperative copying aborts the whole build on a malformed later entry without touching the previous view', async () => {
  const original = [source('query', 0), source('a', 256, 0.9)], previous = await fresh(original);
  const entries = Array.from({ length: 130 }, (_, index) => source(`new${index}`, 1024 + index, 0.95));
  const combined = [...original, ...entries], evidence = proof(combined);
  const pending = build({ previous, evidence, entries });
  let getterCalls = 0;
  Object.defineProperty(entries[129], 'title', { enumerable: true, get() { getterCalls++; return 'late getter'; } });
  await assert.rejects(() => pending, TypeError);
  assert.equal(getterCalls, 0);
  assert.deepEqual(await rank(previous, 'query', 20), oracle(original, 'query'));
});

test('prepared catalog entries own normalized data before build and retain all evidence and delta fences', async () => {
  const entries=[source('query',0),source('a',256,.9),source('b',512,.85)], original=structuredClone(entries);
  const tokens=entries.map(prepareRelatedCatalogEntry), evidence=proof(entries);
  for(const token of tokens){assert.ok(Object.isFrozen(token));assert.deepEqual(Reflect.ownKeys(token),[]);}
  entries[0].embedding.values.fill(-1); entries[1].title='mutated';
  const view=await build({evidence,entries:tokens});
  assert.deepEqual(await rank(view,'query',20),oracle(original,'query'));
  const next=[...original.slice(0,2),source('c',768,.95)];
  const patched=await build({previous:view,evidence:proof(next,{horizon:'101',validatedAt:1100}),entries:[prepareRelatedCatalogEntry(next[2])]});
  assert.deepEqual(await rank(patched,'query',20),oracle(next,'query'));
  assert.equal(changes(patched,proof(next,{horizon:'102',validatedAt:301001})).reuse,false);
  await assert.rejects(()=>build({evidence,entries:[tokens[0],tokens[1],tokens[1]]}),TypeError);
  await assert.rejects(()=>build({evidence,entries:[tokens[0],tokens[1],Object.freeze({})]}),TypeError);
  const wrong=proof(original);wrong.witnesses[2].ordinal=513;
  await assert.rejects(()=>build({evidence:wrong,entries:tokens}),TypeError);
});

test('prepared catalog entry creation rejects hostile and ineligible malformed vectors without getters or proxy traps', async () => {
  let calls=0;
  const proxy=new Proxy([],{ownKeys(){calls++;throw Error('trap');},getPrototypeOf(){calls++;throw Error('trap');}});
  for(const extra of [{},{extractorVersion:null},{embedding:{modelId:'other',values:proxy}}]){
    const input=source('bad',0,1,extra);
    if(input.embedding.modelId===BROWSER_MODEL_ID)input.embedding.values=proxy;
    assert.throws(()=>prepareRelatedCatalogEntry(input),TypeError);
  }
  const getter=source('bad',0);Object.defineProperty(getter.embedding.values,'0',{enumerable:true,get(){calls++;return 1;}});
  assert.throws(()=>prepareRelatedCatalogEntry(getter),TypeError);
  const bad=source('ineligible',0,1,{extractorVersion:null});bad.embedding.values[0]=Infinity;
  assert.throws(()=>prepareRelatedCatalogEntry(bad),TypeError);
  assert.equal(calls,0);
  const entries=Array.from({length:513},(_,index)=>source(`s${index}`,index*256));
  await assert.rejects(()=>build({evidence:proof(entries),entries:entries.map(prepareRelatedCatalogEntry)}),{code:'capacity'});
});

test('opaque prepared entries cannot bypass the cumulative catalog budget through a small delta', async () => {
  const prefix=`https://example.org/${'u'.repeat(8080)}`;
  const entries=Array.from({length:4000},(_,index)=>source(`s${index}`,index,1,{
    title:'t'.repeat(512),url:`${prefix}${index}`,embedding:{modelId:BROWSER_MODEL_ID,values:[1]},
  }));
  const tokens=entries.map(prepareRelatedCatalogEntry), initial=entries.slice(0,3800);
  const previous=await build({evidence:proof(initial),entries:tokens.slice(0,3800)});
  await assert.rejects(()=>build({previous,evidence:proof(entries,{horizon:'101',validatedAt:1100}),entries:tokens.slice(3800)}),{code:'capacity'});
  await assert.rejects(()=>build({evidence:proof(entries),entries:tokens}),{code:'capacity'});
});

function largeStreamingEntries(count) {
  const prefix=`https://example.org/${'u'.repeat(8080)}`;
  return Array.from({length:count},(_,index)=>source(`large${index}`,index,1,{
    title:'t'.repeat(512),url:`${prefix}${index}`,embedding:{modelId:BROWSER_MODEL_ID,values:[1]},
  }));
}

test('streaming preparation enforces projected total before later vector batches and poisons on capacity', async () => {
  const entries=largeStreamingEntries(5000), evidence=proof(entries), preparation=createRelatedCatalogEntryPreparation({evidence});
  const tokens=[];let batches=0;
  assert.throws(()=>{
    for(let offset=0;offset<entries.length;offset+=512){batches++;for(const row of entries.slice(offset,offset+512))tokens.push(preparation.prepare(row));}
  },{code:'capacity'});
  assert.ok(batches<Math.ceil(entries.length/512),'over-budget catalog stops before later synthetic embedding batches');
  assert.throws(()=>preparation.prepare(entries.at(-1)),TypeError);
  await assert.rejects(()=>build({evidence,entries:tokens}),TypeError,'no incomplete delta can publish');
});

test('streaming preparation reserves unchanged rows, subtracts changed rows and lets removals free capacity', async () => {
  const entries=largeStreamingEntries(3800), previous=await fresh(entries);
  const added=largeStreamingEntries(4000).slice(3800), next=[...entries,...added];
  const overflowing=createRelatedCatalogEntryPreparation({evidence:proof(next),previous});
  assert.throws(()=>added.map(row=>overflowing.prepare(row)),{code:'capacity'});
  const changed=entries.map((row,index)=>index<200?{...row,title:'q'.repeat(512)}:row);
  const changedEvidence=proof(changed), changedPreparation=createRelatedCatalogEntryPreparation({evidence:changedEvidence,previous});
  const patched=await build({previous,evidence:changedEvidence,entries:changed.slice(0,200).map(row=>changedPreparation.prepare(row))});
  assert.equal((await rank(patched,entries[1].id,1))[0].title,'q'.repeat(512));
  const reduced=[...entries.slice(300),...added], reducedEvidence=proof(reduced);
  const reducedPreparation=createRelatedCatalogEntryPreparation({evidence:reducedEvidence,previous});
  const view=await build({previous,evidence:reducedEvidence,entries:added.map(row=>reducedPreparation.prepare(row))});
  assert.equal((await rank(view,entries[300].id,1)).length,1);
});

test('streaming preparation rejects wrong IDs, ordinals, duplicates and malformed rows and cannot resume', async () => {
  const entries=[source('query',0),source('a',256,.9)], evidence=proof(entries);
  for(const bad of [source('unknown',512),{...entries[1],ordinal:257},{...entries[1],title:''}]){
    const p=createRelatedCatalogEntryPreparation({evidence});p.prepare(entries[0]);
    assert.throws(()=>p.prepare(bad),TypeError);assert.throws(()=>p.prepare(entries[1]),TypeError);
  }
  const p=createRelatedCatalogEntryPreparation({evidence});p.prepare(entries[0]);
  assert.throws(()=>p.prepare(entries[0]),TypeError);assert.throws(()=>p.prepare(entries[1]),TypeError);
  const previous=await fresh(entries), expired=proof(entries,{validatedAt:301001});
  const revalidating=createRelatedCatalogEntryPreparation({evidence:expired,previous});
  const rebuilt=await build({previous,evidence:expired,entries:entries.map(row=>revalidating.prepare(row))});
  assert.deepEqual(await rank(rebuilt,'query',20),oracle(entries,'query'));
  const limits=readRelatedCatalogCapacityLimits();assert.ok(Object.isFrozen(limits));
  assert.deepEqual(limits,{maximumSources:131072,maximumUnits:32*1024*1024,maximumChunks:512,chunkSize:256});
});
