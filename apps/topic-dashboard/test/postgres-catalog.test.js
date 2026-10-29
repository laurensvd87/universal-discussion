import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDemoState, FIXED_REFERENCE_STATE_SCHEMA } from "../../local-service/src/domain/demo-state.js";
import { BROWSER_MODEL_ID, LEARNED_SOURCE_PROVENANCE, LEARNED_TOPIC_PROVENANCE } from "../../local-service/src/domain/learned-sources.js";
import { operationDigestFor } from "../../local-service/src/domain/source-threads.js";
import { RIDGE_PARAMETER_SHA256 } from "../../local-service/src/domain/ridge-topic-adapter.js";
import { readCatalogGrowthHistoryV2 } from "../../local-service/src/metrics/catalog-growth.js";
import { createNormalizedSqliteRepository } from "../../local-service/src/adapters/normalized-sqlite-repository.js";
import { createPGliteDatabase } from "../../local-service/portable/src/database.js";
import { importCanonicalV4, migrateCanonicalV4, readCanonicalV4MigrationManifest } from "../../local-service/portable/canonical-v4/index.js";
import { buildDashboardSnapshotV2 } from "../src/data/catalog.js";
import { createPostgresDashboardSource } from "../src/data/postgres-catalog.js";
import { generatePostgresDashboard, readPostgresDashboardRefreshKey,
  startPostgresDashboardGrowthSampler } from "../src/cli.js";

const START = "2026-10-13T12:00:00.000Z";
const unit = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];

// Pure SQL-response ports. These tests do not acquire a database or execute SQL.
async function hierarchyFixture(){
  const manifest=await readCanonicalV4MigrationManifest('hierarchy17'),queries=[];let stamp='b'.repeat(64),policyRevision=0,depth=1;
  const generation='hierarchy-dashboard',matcher='a'.repeat(64);
  let aggregate={generation,matcherIdentityHash:matcher,counts:{learnedSources:8,preparedSources:6,
    currentHeadClassifiedSources:3,currentHeadAbstainedSources:1,currentHeadExcludedSources:1,currentHeadPendingSources:3,distinctRoots:2},
    paths:[{path:['games','detail'],sources:3}]};
  let drift=false,version=7;
  const tx={dialect:'pg',async query(sql,args=[]){queries.push({tx,sql,args});
    if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')return {rows:[]};
    if(sql==='SELECT version,hash FROM canonical_v4.schema_migrations ORDER BY version')return {rows:manifest.map(({version,hash})=>({version,hash}))};
    if(sql.includes('meta.state_schema'))return {rows:[{state_schema:FIXED_REFERENCE_STATE_SCHEMA,import_generation:generation,import_revision:0,generation,
      revision:version,catalog_version:2,matching_version:2}]};
    if(sql.startsWith('WITH learned AS'))return {rows:[{total_sources:10,learned_pages:8,active_topics:2,total_topics:3,multi_member_topics:1,singleton_topics:1}]};
    if(sql==='SELECT * FROM canonical_v4.semantic_read_revision()')return {rows:[{generation,revision:stamp}]};
    if(sql==='SELECT canonical_v4.semantic_read_topic_nodes($1) AS metadata')return {rows:[{metadata:{generation,matcherIdentityHash:matcher,nodes:[
      {id:'detail',parentId:'games',path:['games','detail']},{id:'games',parentId:null,path:['games']},{id:'nature',parentId:null,path:['nature']}]}}]};
    if(sql==='SELECT * FROM canonical_v4.semantic_read_owner_policy()')return {rows:[{revision:String(policyRevision),default_max_depth:depth,overrides:[]}]};
    if(sql==='SELECT canonical_v4.semantic_read_dashboard_counts($1) AS metadata')return {rows:[{metadata:drift?{...aggregate,generation:'other'}:aggregate}]};
    assert.fail('No state, vectors or other SQL: '+sql);
  }};
  const database={query:()=>assert.fail('Every read belongs to the same physical RR'),transaction:work=>work(tx)};
  return {queries,source:createPostgresDashboardSource({database,schemaProfile:'hierarchy17'}),database,
    changePolicy(){policyRevision++;depth=2;stamp='c'.repeat(64);},changeBackground(){stamp='d'.repeat(64);},changeCanonical(){version++;},
    mutate:fn=>fn(aggregate),drift:()=>{drift=true;}};
}

test('hierarchy17 summary partitions protected metadata separately from legacy containers in one RR without vectors',async()=>{
  const f=await hierarchyFixture(),value=await f.source.readHierarchySummary({now:()=>new Date(START)});
  assert.deepEqual(value.legacyContainers,{active:2,total:3,multiMember:1,singleton:1});
  assert.deepEqual(value.semantic.counts,{preparedSources:6,currentHeadClassifiedSources:3,currentHeadAbstainedSources:1,
    currentHeadExcludedSources:1,currentHeadPendingSources:3,distinctRoots:2,activeNodes:3,configuredDisplayGroups:2,occupiedDisplayGroups:1});
  assert.equal(value.semantic.preparedScope,'alive-learned-source-retained-input-any-model-or-version');
  assert.deepEqual(value.semantic.assignments,{schema:'topic-assignment-counts/v1',mode:'owner-display-policy',automaticDiscovery:'not-enabled',topics:[
    {id:'games',title:'Games',path:['games'],sources:3},{id:'nature',title:'Nature',path:['nature'],sources:0}]});
  assert.equal(new Set(f.queries.map(q=>q.tx)).size,1);assert.equal(f.queries[0].sql,'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(f.queries.some(q=>/FROM canonical_v4\.(?:embeddings|semantic_inputs|semantic_observations|semantic_root_edges)|SELECT source\.\*/u.test(q.sql)),false);
  assert.equal(Object.hasOwn(await f.source.readCounts(),'semantic'),false,'strict legacy growth point remains unchanged');
  assert.equal((await f.source.readSnapshot()).state,null);await assert.rejects(f.source.loadState(),TypeError);
});

test('hierarchy17 refresh covers owner cuts, background material and canonical changes without fake Source writes',async()=>{
  const f=await hierarchyFixture(),first=await f.source.readRevision();
  f.changePolicy();assert.notEqual(await f.source.readRevision(),first);
  const changed=await f.source.readHierarchySummary();assert.equal(changed.header.revision,7);
  assert.equal(changed.semantic.counts.configuredDisplayGroups,3);assert.equal(changed.semantic.counts.occupiedDisplayGroups,1);
  assert.equal(changed.semantic.counts.distinctRoots,2);
  assert.deepEqual(changed.semantic.assignments.topics.map(t=>[t.id,t.sources]),[['detail',3],['games',0],['nature',0]]);
  const policy=await f.source.readRevision();f.changeBackground();assert.notEqual(await f.source.readRevision(),policy);
  const background=await f.source.readRevision();f.changeCanonical();assert.notEqual(await f.source.readRevision(),background);
});

test('hierarchy17 per-topic counts partition classified pages once across owner display groups',async()=>{
  const f=await hierarchyFixture();f.mutate(a=>{a.counts.currentHeadClassifiedSources=5;a.counts.preparedSources=7;a.counts.currentHeadPendingSources=1;
    a.paths.push({path:['nature'],sources:2});});
  const value=await f.source.readHierarchySummary();assert.deepEqual(value.semantic.assignments.topics.map(t=>[t.id,t.sources]),[['games',3],['nature',2]]);
  assert.equal(value.semantic.assignments.topics.reduce((n,t)=>n+t.sources,0),value.semantic.counts.currentHeadClassifiedSources);
  assert.equal(new Set(f.queries.map(q=>q.tx)).size,1);assert(!f.queries.some(q=>/values_double|body_vector|title_values/u.test(q.sql)));
});

test('hierarchy17 refuses incoherent metadata, false partitions, malformed counts and duplicate/unknown paths',async()=>{
  for(const mutate of [a=>a.counts.currentHeadPendingSources++,a=>a.counts.preparedSources=0,a=>a.counts.distinctRoots='2',
    a=>a.paths.push(a.paths[0]),a=>a.paths[0].path=['unknown'],a=>a.paths[0].sources=2]){
    const f=await hierarchyFixture();f.mutate(mutate);await assert.rejects(f.source.readHierarchySummary(),{code:'dashboard-unavailable'});
  }
  const f=await hierarchyFixture();f.drift();await assert.rejects(f.source.readHierarchySummary(),{code:'dashboard-unavailable'});
  assert.throws(()=>createPostgresDashboardSource({database:f.database,schemaProfile:'hierarchy16'}),TypeError);
});

function canonicalState() {
  const state = createDemoState({ generation: "postgres-dashboard-fixture", createdAt: START, sources: [],
    topicSeeds: ["a", "c", "empty"].map(id => ({ id: `topic-${id}`, title: `Synthetic ${id}`, kind: "general" })) });
  state.schema = FIXED_REFERENCE_STATE_SCHEMA;
  state.sources = ["a", "b", "c"].map((id, index) => {
    const source = { id, title: `Synthetic ${id}`, url: `https://example.org/articles/${id}`,
      provenance: LEARNED_SOURCE_PROVENANCE, extractorVersion: "main-text-prefix/v1",
      policyVersion: "ridge1-fixed-reference-radius/v1", operationId: `operation-${id}`,
      embedding: { modelId: BROWSER_MODEL_ID, values: unit(index * 0.4) },
      topicIds: id === "b" ? ["topic-a", "topic-c"] : [`topic-${id}`] };
    return { ...source, operationDigest: operationDigestFor(source) };
  });
  state.sourceLinks = state.sources.map(source => ({ sourceId: source.id,
    topicId: source.topicIds[0], method: "learned-provisional" }));
  for (const topic of state.topics) {
    if (topic.id === "topic-empty") { topic.reference = null; continue; }
    Object.assign(topic, { provenance: LEARNED_TOPIC_PROVENANCE, retainTight: false,
      reference: { sourceId: topic.id.slice(6), parameterSha256: RIDGE_PARAMETER_SHA256,
        values: unit(topic.id === "topic-a" ? 0 : 0.8) } });
  }
  return state;
}

async function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "murmingle-postgres-dashboard-"));
  t.after(() => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(directory, { recursive: true, force: true });
  });
  const sqlitePath = path.join(directory, "canonical.sqlite"), state = canonicalState();
  const repository = createNormalizedSqliteRepository(sqlitePath, state); repository.close();
  const database = await createPGliteDatabase();
  t.after(() => database.close());
  await database.exec("CREATE ROLE murmingle_owner; CREATE ROLE murmingle_app");
  await migrateCanonicalV4(database);
  await importCanonicalV4({ database, sqlitePath });
  const queries = [];
  const observed = {
    query: (...args) => database.query(...args),
    transaction: callback => database.transaction(tx => callback({ ...tx,
      query(sql, parameters = []) { queries.push(sql); return tx.query(sql, parameters); } })),
  };
  return { directory, state, database, queries, source: createPostgresDashboardSource({ database: observed }) };
}

test("PostgreSQL dashboard reads one validated v4 MVCC catalog without contribution bodies", async t => {
  const f = await fixture(t);
  const current = await f.source.readSnapshot({ now: () => new Date(START) });
  assert.equal(current.header.generation, f.state.generation);
  assert.equal(current.header.revision, f.state.revision);
  assert.deepEqual(current.state, { ...f.state, contributions: [] });
  assert.deepEqual(current.point, {
    at: START,
    seriesId: createHashFor(f.state.generation),
    revision: 0,
    totalSources: 3,
    learnedPages: 3,
    activeTopics: 2,
    totalTopics: 3,
    multiMemberTopics: 2,
    singletonTopics: 0,
  });
  const dashboard = buildDashboardSnapshotV2(current.state, { now: () => new Date(START) });
  assert.equal(dashboard.counts.learnedSources, 3);
  assert.equal(dashboard.counts.multiMemberTopics, 2);
  assert.deepEqual(dashboard.pages.find(page => page.id === "b").topicIds, ["topic-a", "topic-c"]);
  assert.equal(f.queries.some(sql => /FROM canonical_v4\.revisions/u.test(sql)), false);
  assert.equal(f.queries.some(sql => /SELECT\s+\*\s+FROM canonical_v4\.contributions/iu.test(sql)), false);
});

test("PostgreSQL aggregate-only path does not select vectors or private payloads above the graph limit", async t => {
  const f = await fixture(t);
  f.queries.length = 0;
  const current = await f.source.readSnapshot({ now: () => new Date(START), graphLimit: 2 });
  assert.equal(current.state, null);
  assert.equal(current.point.learnedPages, 3);
  assert.equal(current.point.multiMemberTopics, 2);
  assert.equal(f.queries.some(sql => /canonical_v4\.(?:embeddings|fixed_references|operation_receipts|contributions|revisions)/u.test(sql)), false);
  assert.equal(f.queries.some(sql => /\bpayload\b/iu.test(sql)), false);
});

test("PostgreSQL dashboard generation keeps v2 overlap history outside the canonical database", async t => {
  const f = await fixture(t), outputPath = path.join(f.directory, "report", "dashboard.html");
  const growthPath = path.join(f.directory, "derived", "topic-growth-v2.sqlite");
  mkdirSync(path.dirname(growthPath), { mode: 0o700 });
  const result = await generatePostgresDashboard({ source: f.source, outputPath, growthPath,
    adapter: null, bodyMetric: null, ridgeAdapter: null, now: () => new Date(START) });
  assert.equal(result.counts.learnedSources, 3);
  assert.equal(result.counts.multiMemberTopics, 2);
  assert.equal(result.counts.singletonTopics, 0);
  assert.equal(existsSync(outputPath), true);
  assert.equal(existsSync(growthPath), true);
  const bridge = readFileSync(path.join(path.dirname(outputPath), "snapshot.js"), "utf8");
  assert.match(bridge, /catalog-growth\/v2/u);
  assert.match(bridge, /"multiMemberTopics":2/u);
  const key = JSON.parse(await readPostgresDashboardRefreshKey(f.source, { growthPath,
    ridgePath: path.join(f.directory, "absent-ridge"), adapterPath: path.join(f.directory, "absent-adapter"),
    bodyPath: path.join(f.directory, "absent-body") }));
  assert.equal(JSON.parse(key[0])[0], f.state.generation);
  assert.equal(Number.isSafeInteger(JSON.parse(key[0])[1]), true);
});

test("PostgreSQL dashboard growth sampler keeps live v2 history advancing after startup", async t => {
  const f = await fixture(t), growthPath = path.join(f.directory, "derived", "topic-growth-v2.sqlite");
  mkdirSync(path.dirname(growthPath), { mode: 0o700 });
  let now = new Date(START), scheduled;
  const sampler = startPostgresDashboardGrowthSampler({ source: f.source, growthPath, now: () => now,
    setIntervalImpl: callback => { scheduled = callback; return 1; }, clearIntervalImpl: () => {} });
  try {
    await sampler.sample();
    let history = readCatalogGrowthHistoryV2(growthPath, { now: () => now });
    assert.equal(history.points.length, 1);
    assert.equal(history.points[0].learnedPages, 3);
    now = new Date("2026-10-13T12:01:00.000Z");
    scheduled();
    await sampler.sample();
    history = readCatalogGrowthHistoryV2(growthPath, { now: () => now });
    assert.equal(history.points.length, 2);
    assert.equal(history.points.at(-1).at, now.toISOString());
    assert.equal(history.points.at(-1).learnedPages, 3);
  } finally { await sampler.close(); }
});

function createHashFor(value) {
  // Keep the expected series calculation independent of dashboard internals.
  return createHash("sha256").update(value, "utf8").digest("hex");
}
