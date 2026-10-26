// Explicit V2 after V1 rejected unsupported wire ANY before model loading; V1 evidence preserved.
// Explicit local DEVELOPMENT pilot. The metadata inventory has already informed
// taxonomy design: it can never become a final independent release holdout.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createPgDatabase } from '../../../portable/src/database.js';
import { createWindowsDpapiPasswordProvider } from '../../../portable/src/windows-dpapi-password.js';
import { createEmbeddingWireQuery, decodeEmbeddingBase64Array } from '../../../portable/canonical-v4/embedding-binary-wire.js';
import { parseRelatedEmbeddingJson } from '../../../../../spikes/topic-resolution/browser/core/related-sources.js';
import { createPackagedCrawlerEmbedder } from '../../../src/crawler/packaged-e5.js';
import { compilePairedE5Input, describePairedE5Input, applyPairedE5Input } from '../../../src/domain/hierarchical-e5-paired-input.js';
import { compileHierarchyPrototypeScores, describeHierarchyPrototypeScores, scoreHierarchyPrototypeScores } from '../../../src/domain/hierarchical-e5-prototype-scores.js';
import { TAXONOMY, NODES } from './taxonomy.js';
import { validateMetadataGold,assessMetadataRankings } from './metadata-assessment.js';

const local = new URL('../../../data/', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonHash = value => hash(JSON.stringify(value));
const lexical = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const resultUrl = new URL('hierarchy-paired-development-v2-adr133.json', local);
async function bounded(url, maximum = 1024 * 1024) {
  const stat = await lstat(url); assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= maximum);
  const bytes = await readFile(url); assert.equal(bytes.length, stat.size); return bytes;
}
function capturedTitle(title) {
  assert.equal(typeof title, 'string'); let value = title.slice(0,512);
  if (/[\ud800-\udbff]$/u.test(value)) value = value.slice(0,-1);
  assert.ok(value.trim().length); return value;
}
function ranked(rows, score) {
  return rows.map(row => ({ nodeId: row.nodeId, score: row[score] }))
    .sort((a,b) => b.score-a.score || lexical(a.nodeId,b.nodeId));
}
export function createDevelopmentEmbeddingQuery(ids) {
  assert.ok(Array.isArray(ids)&&ids.length===120&&new Set(ids).size===120);
  return createEmbeddingWireQuery(`SELECT source_id,payload,model_id,dimensions,values_double
    FROM canonical_v4.embeddings WHERE source_id IN (${ids.map((_,i)=>`$${i+1}`).join(',')})`,ids);
}
// Ranking diagnostics are deliberately not assignments or calibrated confidence.
export function summarizeFeatures(features, nodes) {
  const byId = new Map(nodes.map(node => [node.id,node]));
  const roots = features.filter(f => byId.get(f.nodeId).parentId === null);
  const result = {};
  for (const [name,key] of [['direct-descriptor','directScore'],['descendant-union','subtreeScore']]) {
    const order = ranked(roots,key), first = order[0];
    const diagnosticPath = [first.nodeId];
    for (;;) {
      const children = features.filter(f => byId.get(f.nodeId).parentId === diagnosticPath.at(-1));
      if (!children.length) break;
      diagnosticPath.push(ranked(children,'subtreeScore')[0].nodeId);
    }
    result[name] = { topRoots: order.slice(0,3), rootMargin: first.score-order[1].score,
      forcedRankingPathNotAssignment: diagnosticPath };
  }
  return result;
}

async function main() {
  assert.equal(process.env.MURMINGLE_PAIRED_DEV_SUPERVISED, '1', 'Use the resource supervisor');
  const protocolBytes = await bounded(new URL('development-protocol.json', import.meta.url));
  const protocol = JSON.parse(protocolBytes);
  const inventoryBytes = await bounded(new URL('hierarchy-public-inventory-adr133.json',local));
  const inventory = JSON.parse(inventoryBytes);
  const goldBytes = await bounded(new URL('hierarchy-metadata-gold-adr133.json',local));
  const gold = JSON.parse(goldBytes);
  assert.equal(inventory.sampleHash, protocol.inventorySampleHash);
  assert.equal(jsonHash(inventory.sample), protocol.inventorySampleHash);
  assert.equal(inventory.protocolHash, protocol.inventoryProtocolHash);
  validateMetadataGold(gold,{inventory,taxonomySha256:hash(await bounded(new URL('taxonomy.js',import.meta.url))),nodes:NODES});
  assert.equal(inventory.sample.length,120); assert.equal(NODES.length,63);
  assert.equal(TAXONOMY.productionValidated,false);
  const sourceFiles = ['development-v2.js','development-protocol.json','taxonomy.js','supervise-development-v2.py','metadata-assessment.js',
    '../../../src/domain/hierarchical-e5-paired-input.js','../../../src/domain/hierarchical-e5-prototype-scores.js',
    '../../../src/crawler/packaged-e5.js','../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js',
    '../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json'];
  const sourceHashes = {};
  for (const name of sourceFiles) sourceHashes[name] = hash(await bounded(new URL(name,import.meta.url),4*1024*1024));
  await writeFile(new URL('hierarchy-paired-development-v2-adr133.started.json',local), JSON.stringify({
    schema:protocol.schema, diagnosticRun:'v2-wire-IN-correction-before-any-encoding', startedAt:new Date().toISOString(), protocolSha256:hash(protocolBytes),
    inventorySha256:hash(inventoryBytes), goldSha256:hash(goldBytes), sourceHashes,
    independentHoldout:false,canonicalWrites:0,providerCalls:0 })+'\n',{flag:'wx'});
  const begin = performance.now(); let database;
  let sources, snapshot;
  try {
    const password = createWindowsDpapiPasswordProvider({role:'murmingle_app'});
    database = await createPgDatabase({config:{host:'127.0.0.1',port:55432,database:'murmingle_canonical',
      user:'murmingle_app',password,ssl:false,max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,
      application_name:'murmingle-paired-development-adr133',
      options:'-c statement_timeout=5000 -c lock_timeout=500 -c transaction_timeout=15000'}});
    sources = await database.transaction(async tx => {
      await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const identity = (await tx.query(`SELECT current_database() AS db,current_user AS role,
        host(inet_server_addr()) AS host,inet_server_port() AS port,pg_current_snapshot()::text AS snapshot`)).rows[0];
      assert.equal(identity.db,'murmingle_canonical');assert.equal(identity.role,'murmingle_app');
      assert.equal(identity.host,'127.0.0.1');assert.equal(identity.port,55432);snapshot=identity.snapshot;
      const ids=inventory.sample.map(s=>s.id);assert.equal(new Set(ids).size,120);
      const meta=(await tx.query(`SELECT id,title,lower(split_part(url,'/',3)) AS host,provenance
        FROM canonical_v4.sources WHERE id=ANY($1::text[]) AND has_embedding`,[ids])).rows;
      const wire=createDevelopmentEmbeddingQuery(ids);
      const embeddings=(await tx.query(wire.text,wire.values)).rows;
      assert.equal(meta.length,120);assert.equal(embeddings.length,120);
      const m=new Map(meta.map(s=>[s.id,s])), e=new Map(embeddings.map(s=>[s.source_id,s]));
      assert.equal(m.size,120);assert.equal(e.size,120);
      return inventory.sample.map(old=>{
        const row=m.get(old.id), raw=e.get(old.id);assert.ok(row&&raw);
        const title=capturedTitle(row.title);
        assert.deepEqual({id:row.id,title,host:row.host,provenance:row.provenance},old,'Inventory metadata changed; no silent relabel');
        const embedding=parseRelatedEmbeddingJson(raw.payload), binary=decodeEmbeddingBase64Array(raw.values_double_base64);
        assert.equal(raw.model_id,protocol.encoderModelId);assert.equal(embedding.modelId,raw.model_id);
        assert.equal(Number(raw.dimensions),384);assert.ok(isDeepStrictEqual(binary,embedding.values));
        const inputHash=jsonHash({id:old.id,title,bodyVector:binary.map(n=>Object.is(n,-0)?'-0':n),modelId:raw.model_id});
        return {id:old.id,title,bodyVector:binary,inputHash};
      });
    });
  } finally {if(database)await database.close();}
  const encoderHash=sourceHashes['../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json'];
  const encoderStart=performance.now(), encoder=await createPackagedCrawlerEmbedder();
  const initMs=performance.now()-encoderStart;
  const descriptorVectors=new Map(),titleVectors=new Map(),encodeStart=performance.now();
  try {
    for (const node of NODES) {
      const vectors=[];
      for (const description of node.positiveDescriptions) vectors.push((await encoder.embed(`${node.label}. ${description}`)).values);
      descriptorVectors.set(node.id,vectors);
    }
    for (const source of sources) titleVectors.set(source.id,(await encoder.embed(source.title)).values);
  } finally {await encoder.close();}
  const encodingMs=performance.now()-encodeStart;
  const outcomes=[],artifacts=[],scoreTimes=[];
  for (const bodyWeight of protocol.bodyWeights) {
    const adapter=compilePairedE5Input({bodyWeight,titleWeight:1-bodyWeight,encoderHash});
    const definition=describePairedE5Input(adapter);
    const prototypes=NODES.map(node=>({id:node.id,parentId:node.parentId,
      prototypes:descriptorVectors.get(node.id).map((vector,index)=>applyPairedE5Input(adapter,{
        sourceId:`authored-descriptor-${node.id}-${index}`,sourceVersion:'authored-not-page-evidence',
        bodyVector:vector,titleVector:vector}).vector)}));
    const scorer=compileHierarchyPrototypeScores({schema:'hierarchy-topic-descriptor-prototypes/v1',
      representation:definition.representation,representationHash:definition.representationHash,nodes:prototypes});
    const metadata=describeHierarchyPrototypeScores(scorer);
    artifacts.push({bodyWeight,input:definition,scorer:metadata});
    for (const source of sources) {
      const paired=applyPairedE5Input(adapter,{sourceId:source.id,sourceVersion:source.inputHash,
        bodyVector:source.bodyVector,titleVector:titleVectors.get(source.id)});
      if(paired.status!=='available') {outcomes.push({id:source.id,inputHash:source.inputHash,bodyWeight,status:paired.status});continue;}
      const start=performance.now();
      const scores=scoreHierarchyPrototypeScores(scorer,{sourceId:source.id,sourceVersion:source.inputHash,
        representation:definition.representation,representationHash:definition.representationHash,vector:paired.vector});
      scoreTimes.push(performance.now()-start);
      outcomes.push({id:source.id,inputHash:source.inputHash,bodyWeight,status:'ranked-not-assigned',
        bodyTitleCosine:paired.bodyTitleCosine,rankers:summarizeFeatures(scores.features,NODES)});
    }
  }
  scoreTimes.sort((a,b)=>a-b);
  const result={schema:protocol.schema,diagnosticRun:'v2-wire-IN-correction-before-any-encoding',status:'complete',independentHoldout:false,calibrated:false,
    assignmentAuthority:false,productionReady:false,canonicalWrites:0,providerCalls:0,pageFetches:0,
    retainedSourceVectors:0,inventorySampleHash:inventory.sampleHash,inventorySha256:hash(inventoryBytes),
    goldSha256:hash(goldBytes),protocolSha256:hash(protocolBytes),sourceHashes,snapshot,
    sourceCount:sources.length,descriptorCount:126,titleEncodes:120,encoderInitMs:initMs,encodingMs,
    scorerP95Ms:scoreTimes[Math.floor(.95*(scoreTimes.length-1))],elapsedMs:performance.now()-begin,artifacts,outcomes};
  result.metadataAssessment=assessMetadataRankings({gold,result,weights:protocol.bodyWeights,
    rankers:protocol.rootRankers,marginBands:protocol.marginBands});
  const bytes=Buffer.from(JSON.stringify(result)+'\n');assert.ok(bytes.length<=protocol.limits.resultBytes);
  await writeFile(resultUrl,bytes,{flag:'wx'});
  process.stdout.write(JSON.stringify({status:result.status,resultSha256:hash(bytes),sourceCount:result.sourceCount,
    scorerP95Ms:result.scorerP95Ms,encoderInitMs:initMs,encodingMs,elapsedMs:result.elapsedMs,
    independentHoldout:false,productionReady:false})+'\n');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  const args=process.argv.slice(2);
  if(!args.length)process.stdout.write('No action. Use the fixed supervised development pilot.\n');
  else if(args.length!==1||args[0]!=='--run-development')process.exitCode=1;
  else main().catch(error=>{process.stderr.write(JSON.stringify({status:'development-failed',
    code:typeof error?.code==='string'?error.code:'validation-or-local-access'})+'\n');process.exitCode=1;});
}
