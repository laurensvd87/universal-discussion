import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPostgresRuntimeOperatorForTest,parseHierarchyInstallInput,POSTGRES_RUNTIME_POOL_BUDGET,describePostgresRuntimePackaging} from '../src/ops/postgres-runtime-operator.js';
import {readSemanticOwnerMaintenanceInput} from '../portable/canonical-v4/semantic-owner-maintenance.js';

function fixture(extra={}){
 const calls=[],out=[],errors=[],modules=new Map(),databases=[];
 const ports={
  verifyRuntimeSnapshot(){calls.push(['verify']);return {rootSha256:'a'.repeat(64),files:10,totalBytes:100};},
  prepareRuntimeSnapshot:async()=>{calls.push(['prepare']);return {prepared:true,sealed:false};},
  sealRuntimeSnapshot(){calls.push(['seal']);return {sealed:true};},
  openRoleDatabase:async(role,max,name)=>{calls.push(['open',role,max,name]);const db={async close(){calls.push(['close',name]);}};databases.push(db);return db;},
  loadSnapshot:async name=>{calls.push(['load',name]);if(!modules.has(name))throw Error('Unexpected module');return modules.get(name);},
  loadBackup:async()=>({cleanupExpiredPostgresBackups:async()=>{calls.push(['retention']);}}),
  readTopicConfiguration:async()=>({alternateAdapter:null,alternateBodyMetric:null,alternateRidgeAdapter:{reference:'fixed'}}),
  readPairingOrigin:()=>`chrome-extension://${'a'.repeat(32)}`,readCrawlerToken:()=> 'invented-crawler-token',
  readInstallInput:async()=>({expectedHeadRevision:0,expectedPolicyRevision:0,policy:{defaultMaxDepth:1,overrides:[]}}),
  waitForShutdown:async close=>{calls.push(['shutdown']);await close();},
  setInterval:()=>{calls.push(['timer']);return 1;},clearInterval:()=>calls.push(['clear-timer']),
  writeStdout:text=>out.push(text),writeStderr:text=>errors.push(text),
  ...extra,
 };
 return {calls,out,errors,modules,databases,ports,operator:createPostgresRuntimeOperatorForTest(ports)};
}
const prefix='apps/local-service/';
function serviceModules(f,start){
 f.modules.set(prefix+'src/startup.js',{startLocalApplication:start});
 f.modules.set(prefix+'src/ai/existing-protected-refresh-store.js',{createExistingProtectedRefreshStore:()=>assert.fail('No refresh store during composition test')});
 f.modules.set(prefix+'src/ai/voice-request-trace-log.js',{createVoiceRequestTraceLog:()=>null});
}

test('owner maintenance commands validate closed input before one fixed owner pool and drain it without retries',async()=>{
 const input={expectedGeneration:'owner-generation',expectedMatcherIdentityHash:'a'.repeat(64),expectedHeadRevision:1,expectedPolicyRevision:1,cursor:null,initialHighWatermark:null,limit:10};
 for(const [operation,method]of [['inspect-legacy-roots','inspectLegacyRoots'],['adopt-legacy-roots','adoptLegacyRoots'],['set-hierarchy-policy','setHierarchyPolicy']]){
  const value=structuredClone(input);if(operation==='set-hierarchy-policy'){delete value.cursor;delete value.initialHighWatermark;delete value.limit;value.policy={defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:3}]};}
  const f=fixture({readOwnerInput:async()=>value});let calls=0;
  f.modules.set(prefix+'portable/canonical-v4/semantic-owner-maintenance.js',{readSemanticOwnerMaintenanceInput,createSemanticOwnerMaintenance:({database})=>{assert.equal(database,f.databases[0]);return {[method]:async checked=>{calls++;assert.deepEqual(checked,value);return {status:'invented-owner-port-result'};}};}});
  assert.equal(await f.operator.run([operation]),0);assert.equal(calls,1);const opened=f.calls.find(c=>c[0]==='open');assert.deepEqual(opened,['open','murmingle_owner',1,'murmingle-semantic-owner']);assert.equal(f.calls.filter(c=>c[0]==='close').length,1);assert.ok(f.calls.findIndex(c=>c[0]==='verify')<f.calls.findIndex(c=>c[0]==='open'));
 }
 const invalid=fixture({readOwnerInput:async()=>({...input,freePath:'foreign'})});invalid.modules.set(prefix+'portable/canonical-v4/semantic-owner-maintenance.js',{readSemanticOwnerMaintenanceInput});assert.equal(await invalid.operator.run(['adopt-legacy-roots']),1);assert.equal(invalid.databases.length,0);
 const failed=fixture({readOwnerInput:async()=>input});let calls=0;failed.modules.set(prefix+'portable/canonical-v4/semantic-owner-maintenance.js',{readSemanticOwnerMaintenanceInput,createSemanticOwnerMaintenance:()=>({adoptLegacyRoots:async()=>{calls++;throw false;}})});assert.equal(await failed.operator.run(['adopt-legacy-roots']),1);assert.equal(calls,1);assert.equal(failed.calls.filter(c=>c[0]==='close').length,1);
});

test('import is inert; invalid operations and missing test ports cannot open production resources',async()=>{
 const f=fixture();
 for(const args of [[],['service','extra'],['restore'],['install-hierarchy','--head=0'],null])assert.equal(await f.operator.run(args),2);
 assert.deepEqual(f.calls,[]);assert.equal(await createPostgresRuntimeOperatorForTest({writeStderr:()=>{}}).run(['service']),1);
 assert.throws(()=>createPostgresRuntimeOperatorForTest({host:()=>{}}));
});
test('service enables hierarchy without an embedded worker and closes app before its two bounded pools',async()=>{
 const f=fixture();serviceModules(f,async options=>{
  assert.equal(options.hierarchicalTopics,true);assert.equal(options.canonicalDatabase,f.databases[0]);assert.equal(options.urlSelectionDatabase,f.databases[1]);
  assert.equal(options.canonicalDatabaseOwned,false);assert.equal(options.urlSelectionDatabaseOwned,false);
  assert.equal(Object.hasOwn(options,'ingestionWorkerDatabase'),false);assert.equal(Object.hasOwn(options,'ingestionWorkerRepository'),false);
  return {close:async()=>f.calls.push(['application-close'])};
 });
 assert.equal(await f.operator.run(['service']),0);
 assert.deepEqual(f.calls.filter(c=>c[0]==='open').map(c=>c.slice(1)),[
  ['murmingle_app',32,'murmingle-api'],['murmingle_app',4,'murmingle-url-projection']]);
 assert.deepEqual(f.calls.filter(c=>c[0]==='application-close'||c[0]==='close'),[
  ['application-close'],['close','murmingle-url-projection'],['close','murmingle-api']]);
 assert.equal(f.calls.some(c=>c[1]?.includes?.('hierarchy-installation.js')),false);
});
test('startup and cleanup failures attempt every owned pool and expose only the finite operation error',async()=>{
 const f=fixture();serviceModules(f,async()=>{throw 0;});
 assert.equal(await f.operator.run(['service']),1);
 assert.deepEqual(f.calls.filter(c=>c[0]==='close').map(c=>c[1]),['murmingle-url-projection','murmingle-api']);
 assert.deepEqual(f.errors,['PostgreSQL service operation failed.\n']);
 const g=fixture();serviceModules(g,async()=>({async close(){g.calls.push(['application-close']);throw null;}}));
 assert.equal(await g.operator.run(['service']),1);assert.equal(g.calls.filter(c=>c[0]==='close').length,2);
});
test('standalone worker opens only its shared two-connection runtime and drains it before the pool',async()=>{
 const f=fixture();let received;
 f.modules.set(prefix+'src/application/installed-hierarchy-runtime.js',{openInstalledHierarchyRuntime:async options=>{
  received=options;return {close:async()=>f.calls.push(['runtime-close'])};
 }});
 f.modules.set(prefix+'src/domain/fixed-reference-topic-integration.js',{createInstalledFixedReferenceMatcher:adapter=>({represent:adapter})});
 assert.equal(await f.operator.run(['worker']),0);assert.equal(received.database,f.databases[0]);
 assert.equal(received.referenceMatcher.represent.reference,'fixed');assert.equal(typeof received.workerOptions.onProgress,'function');
 assert.deepEqual(f.calls.filter(c=>c[0]==='open').map(c=>c.slice(1)),[['murmingle_ingest_worker',2,'murmingle-ingest-worker-timed']]);
 assert.deepEqual(f.calls.filter(c=>c[0]==='runtime-close'||c[0]==='close'),[['runtime-close'],['close','murmingle-ingest-worker-timed']]);
 assert.equal(f.calls.some(c=>c[1]?.includes?.('postgres-ingestion-worker-loop.js')),false);
});
test('crawler keeps its existing state and token flow and selects17 before crawling or opening the sealed encoder',async()=>{
 const f=fixture();let options,health=false,embedRoot,stateFile;
 f.modules.set(prefix+'portable/canonical-v4/ingestion-repository.js',{createCanonicalV4IngestionRepository:value=>{
  assert.equal(value.schemaProfile,'hierarchy17');return {health:async()=>{health=true;}};
 }});
 f.modules.set(prefix+'src/ops/crawl-cli.js',{runCrawlerCli:async value=>{
  assert.equal(health,true);options=value;assert.equal(await value.tokenReader(),'invented-crawler-token');
  const client=await value.clientFactory('invented-token');assert.equal(typeof client.ingest,'function');
  value.stateFactory();value.embedderFactory();
 }});
 f.modules.set(prefix+'src/crawler/crawl-state.js',{createCrawlState:value=>{stateFile=value.filename;return {};}});
 f.modules.set(prefix+'src/crawler/local-ingest-client.js',{createLocalIngestClient:value=>{assert.equal(value.useSourceUrlPages,true);return {};}});
 f.modules.set(prefix+'src/crawler/postgres-ingest-client.js',{createPostgresCrawlerClient:()=>({version(){},knownSourceUrls(){},ingest(){}})});
 f.modules.set(prefix+'src/crawler/packaged-e5.js',{createPackagedCrawlerEmbedder:value=>{embedRoot=value.assetRoot;return {};}});
 assert.equal(await f.operator.run(['crawler']),0);assert.deepEqual(options.args,['--apply','--token-stdin']);
 assert.match(stateFile.replaceAll('\\','/'),/\/apps\/local-service\/data\/topic-crawler\.sqlite$/u);
 assert.match(embedRoot.replaceAll('\\','/'),/\/data\/hierarchy-release-20261028-final\/spikes\/topic-resolution\/browser\/embedding\/\.assets$/u);
 assert.deepEqual(f.calls.filter(c=>c[0]==='open').map(c=>c.slice(1)),[['murmingle_crawler_submitter',2,'murmingle-crawler']]);
 assert.equal(f.calls.filter(c=>c[0]==='close').length,1);
});
test('dashboard uses semantic refresh and aggregate mode without reading Ridge configuration',async()=>{
 let summarySource;
 const f=fixture({readTopicConfiguration:()=>assert.fail('Hierarchy dashboard never loads Ridge configuration'),
  startDashboardWatcher:options=>{assert.equal(options.initialRevision,'semantic-revision');return {close:async()=>f.calls.push(['watcher-close'])};}});
 f.modules.set('apps/topic-dashboard/src/data/postgres-catalog.js',{createPostgresDashboardSource:value=>{
  assert.equal(value.schemaProfile,'hierarchy17');summarySource={source:true};return summarySource;
 }});
 f.modules.set('apps/topic-dashboard/src/cli.js',{
  readPostgresDashboardRefreshKey:async source=>{assert.equal(source,summarySource);return 'semantic-revision';},
  generatePostgresDashboard:async options=>{assert.equal(options.source,summarySource);assert.equal(Object.hasOwn(options,'ridgeAdapter'),false);return {outputPath:'synthetic-dashboard',counts:{learnedSources:10}};},
  startPostgresDashboardGrowthSampler:()=>({close:async()=>f.calls.push(['growth-close'])}),
 });
 assert.equal(await f.operator.run(['dashboard']),0);
 assert.deepEqual(f.calls.filter(c=>['watcher-close','growth-close','close'].includes(c[0])),[
  ['watcher-close'],['growth-close'],['close','murmingle-dashboard']]);
});
test('owner installation is explicit, one-connection and passes supplied CAS policy unchanged',async()=>{
 const f=fixture();let request;
 f.modules.set(prefix+'portable/canonical-v4/hierarchy-installation.js',{installInstalledHierarchy:async input=>{
  request=input;return {schemaVersion:17,headRevision:1};
 }});
 assert.equal(await f.operator.run(['install-hierarchy']),0);assert.equal(request.database,f.databases[0]);
 assert.deepEqual(request.policy,{defaultMaxDepth:1,overrides:[]});assert.equal(request.expectedHeadRevision,0);assert.equal(request.expectedPolicyRevision,0);
 assert.deepEqual(f.calls.filter(c=>c[0]==='open').map(c=>c.slice(1)),[['murmingle_owner',1,'murmingle-hierarchy-installation']]);
 assert.equal(f.calls[0][0],'verify');assert.equal(f.calls.filter(c=>c[0]==='close').length,1);
});
test('installation stdin is bounded, explicit and cannot select a database or ignore policy',()=>{
 const valid={expectedHeadRevision:0,expectedPolicyRevision:2,policy:{defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:3}]}};
 assert.deepEqual(parseHierarchyInstallInput(JSON.stringify(valid)),valid);
 for(const value of [{...valid,database:'other'},{...valid,expectedHeadRevision:-1},{...valid,expectedPolicyRevision:Number.MAX_SAFE_INTEGER},
  {...valid,policy:null},{...valid,policy:{defaultMaxDepth:1}}, {...valid,policy:{defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:9}]}}])
  assert.throws(()=>parseHierarchyInstallInput(JSON.stringify(value)));
 assert.throws(()=>parseHierarchyInstallInput(' '.repeat(131073)));assert.throws(()=>parseHierarchyInstallInput('{'));
});
test('preflight and preparation never implicitly install or start services; pool budget stays below100',async()=>{
 const f=fixture();for(const operation of ['preflight','prepare-runtime','seal-runtime'])assert.equal(await f.operator.run([operation]),0);
 assert.deepEqual(f.calls,[['verify'],['prepare'],['seal']]);
 const b=POSTGRES_RUNTIME_POOL_BUDGET;assert.equal(b.api+b.exactUrl+b.worker+b.crawler+b.dashboard,b.permanentMaximum);
 assert.equal(b.permanentMaximum,42);assert.ok(b.permanentMaximum+b.statusOwner+b.installationOwner<100);
});
test('sealed source layout covers actual startup imports, package scopes and fixed assets within original limits',()=>{
 const layout=describePostgresRuntimePackaging(),root=fileURLToPath(new URL('../../../',import.meta.url));
 const selected=name=>layout.sourceFiles.includes(name)||layout.sourcePrefixes.some(prefix=>name.startsWith(prefix));
 const pending=['apps/local-service/src/startup.js','apps/local-service/src/ops/crawl-cli.js',
  'apps/local-service/src/application/installed-hierarchy-runtime.js','apps/topic-dashboard/src/cli.js',
  'spikes/topic-resolution/browser/core/insight-context.js'],seen=new Set();
 const patterns=[/^\s*(?:import|export)\s+(?:(?!;).)*?\bfrom\s*['"]([^'"]+)['"]/gms,
  /^\s*import\s*['"]([^'"]+)['"]/gm,/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g];
 while(pending.length){const name=pending.pop();if(seen.has(name))continue;seen.add(name);assert.ok(selected(name),name);
  const source=readFileSync(path.join(root,name),'utf8');
  for(const pattern of patterns)for(const match of source.matchAll(pattern))if(match[1].startsWith('.')){
   const target=path.resolve(root,path.dirname(name),match[1]),relative=path.relative(root,target).replaceAll('\\','/');
   assert.equal(relative.startsWith('../'),false);assert.equal(existsSync(target),true,relative);assert.ok(selected(relative),relative);
   if(/\.(?:m?js)$/u.test(target))pending.push(relative);
  }
 }
 assert.ok(seen.size>100);assert.equal(layout.encoderFiles.length,10);
 assert.ok(layout.requiredFiles.includes('apps/local-service/portable/canonical-v4/migrations/017-semantic-dashboard-counts.sql'));
 assert.equal(layout.maximumFiles,5000);assert.equal(layout.maximumBytes,512*1024*1024);assert.equal(layout.maximumManifestBytes,2*1024*1024);
 for(const [name,markers] of Object.entries(layout.sourceMarkers)){
  const source=readFileSync(path.join(root,name),'utf8');for(const marker of markers)assert.ok(source.includes(marker),`${name}: ${marker}`);
 }
 assert.equal(selected('apps/local-service/data/accounts.sqlite'),false);assert.equal(selected('apps/local-service/data/topic-crawler.sqlite'),false);
 for(const name of ['apps/local-service/package.json','apps/local-service/portable/package.json','apps/topic-dashboard/package.json','spikes/topic-resolution/package.json'])assert.ok(selected(name));
});

test('release namespace is new and both local-state backup data-root helpers are required external hashes only',async()=>{
 const layout=describePostgresRuntimePackaging();assert.equal(layout.snapshotLeaf,'hierarchy-release-20261028-final');assert.equal(layout.manifestFilename,'postgres-hierarchy-release-20261028-final-manifest.json');assert.ok(Object.isFrozen(layout.externalFiles));
 const source=readFileSync(new URL('../src/ops/postgres-runtime-operator.js',import.meta.url),'utf8');
 for(const relative of ['apps/local-service/src/ops/local-state-backup-operator.js','apps/local-service/src/ops/windows-local-state-read-lease.js']){
  assert.equal(layout.externalFiles.filter(name=>name===relative).length,1);assert.equal(layout.requiredFiles.includes(relative),false);assert.equal(source.includes(`loadSnapshot("${relative}")`),false);
 }
 assert.equal(source.includes('path.join(dataDir, "hierarchy-runtime")'),false);assert.equal(source.includes('path.join(dataDir, "postgres-hierarchy-runtime-manifest.json")'),false);
 const f=fixture();for(const args of [['local-state-backup'],['backup-local-state'],['restore-local-state'],['prepare-runtime','--path=hierarchy-runtime']])assert.equal(await f.operator.run(args),2);assert.deepEqual(f.calls,[]);
 assert.equal(layout.maximumFiles,5000);assert.equal(layout.maximumBytes,512*1024*1024);assert.equal(POSTGRES_RUNTIME_POOL_BUDGET.permanentMaximum,42);
});
