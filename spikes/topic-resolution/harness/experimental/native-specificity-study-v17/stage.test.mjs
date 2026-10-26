import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSpecificityManifest,digest,sha} from './manifest.js';
import {buildSpecificityStage,STAGE_SOURCE_PATHS,STAGE_FILE_PATHS} from './stage.js';

function fixture(){
 const cases=[];for(const split of ['training','calibration','test'])for(let i=0;i<(split==='test'?72:48);i++){
  const unknown=split==='test'&&i<2,id=unknown?'adr159-test-'+(i===0?'054':'083'):'invented-'+split+'-'+i;
  const gold={kind:'complete',path:['games','video-games','gta']};
  cases.push({id,groupId:'group-'+id,split,role:'leaf',nodeId:'gta',publicUrl:'https://publisher'+i%7+'.org/'+id,
   publicSupportUrl:'https://support-only.org/'+id,language:'en',publisherFamily:'family-'+split+'-'+i%(split==='test'?25:24),
   proposedGold:gold,assessmentGold:unknown?null:gold,labelStatus:unknown?'unverified':'verified',
   referenceAnnotation:split==='training'?{nodeId:'gta',kind:'member'}:null,formatState:'not-a-challenge'});
 }
 const body={schema:'hierarchy-native-specificity-panel/v1',cases,counts:{},sourceDigests:{},taxonomy:{unionNodeCount:25},
  assessmentPolicy:{allOriginalRowsAndDenominatorsRetained:true,unverifiedOrDisputedProposedGoldNeverPassedToAssessor:true},limitations:{},
  fullyReviewedGoldReady:false,nativeReady:false,modelReady:false,productionValidated:false,assignmentAuthority:false};
 const manifest=buildSpecificityManifest({panel:{...body,panelIdentity:digest(body)},expectedPanelIdentity:digest(body)});
 const template={manifest_version:3,name:'Murmingle isolated native specificity study template',version:'1.0.0',minimum_chrome_version:'116',
  incognito:'not_allowed',permissions:['scripting','tabs'],host_permissions:[],background:{service_worker:'worker.js',type:'module'},
  content_security_policy:{extension_pages:"default-src 'none'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"}};
 const sources=Object.fromEntries(STAGE_SOURCE_PATHS.map(name=>[name,name==='manifest.json'?JSON.stringify(template):'// invented '+name+'\nexport const marker = "unchanged";\n']));
 return {manifest,batch:manifest.batches[0],expectedPanelIdentity:manifest.panelIdentity,expectedManifestHash:manifest.manifestHash,
  sources,expectedSourceHashes:Object.fromEntries(STAGE_SOURCE_PATHS.map(name=>[name,sha(sources[name])]))};
}
function repin(f,name){f.expectedSourceHashes[name]=sha(f.sources[name]);}

test('six authenticated invented sources derive exact7 files and current primary-only permissions',()=>{
 const f=fixture(),s=buildSpecificityStage(f);assert.deepEqual(s.files.map(x=>x.path),STAGE_FILE_PATHS);
 const manifest=JSON.parse(s.files.find(x=>x.path==='manifest.json').text);
 assert.deepEqual(manifest.host_permissions,['https://publisher0.org/*','https://publisher1.org/*','https://publisher2.org/*','https://publisher3.org/*']);
 assert.ok(!manifest.host_permissions.some(x=>x.includes('support-only')||x.includes('jsdelivr')));
 for(const name of STAGE_SOURCE_PATHS.filter(x=>x!=='manifest.json'))assert.equal(s.files.find(x=>x.path===name).text,f.sources[name]);
 for(const file of s.files){assert.equal(file.sha256,sha(file.text));assert.equal(file.bytes,Buffer.byteLength(file.text));assert.ok(Object.isFrozen(file));}
 assert.equal(s.actualStagePublished,false);assert.equal(s.layoutVerified,false);assert.equal(s.assignmentAuthority,false);assert.ok(Object.isFrozen(s.files));
 assert.equal(buildSpecificityStage(f).stageIdentity,s.stageIdentity);
});
test('static batch literal retains exact globalIDs/native1..4 and distinct42 recipes',()=>{
 const f=fixture(),ids=new Set();for(const batch of f.manifest.batches){
  const s=buildSpecificityStage({...f,batch}),text=s.files.find(x=>x.path==='batch-config.js').text;
  assert.ok(text.startsWith('export const BATCH = '));assert.ok(text.endsWith(';\n'));
  const config=JSON.parse(text.slice('export const BATCH = '.length,-2));
  assert.deepEqual(config,{phase:batch.phase,batchIndex:batch.batchIndex,batchId:batch.batchId,cases:batch.cases});
  assert.deepEqual(config.cases.map(x=>x.nativeOrdinal),[1,2,3,4]);ids.add(s.stageIdentity);
 }assert.equal(ids.size,42);
});
test('all sources authenticate before any template or manifest parsing',()=>{
 const f=fixture();f.sources['manifest.json']='not json';repin(f,'manifest.json');f.sources['core/page-content-policy.js']+='tampered';
 let hooks=0;f.manifest=new Proxy({},{get(){hooks++;throw Error();},ownKeys(){hooks++;throw Error();}});
 assert.throws(()=>buildSpecificityStage(f),{code:'stage-source-identity'});assert.equal(hooks,0);
});
test('pins, exact source key set and wellformed bytes are mandatory',()=>{
 for(const change of [f=>{f.expectedSourceHashes['worker.js']='0'.repeat(64);},f=>{f.sources.extra='x';},f=>{delete f.sources['worker.js'];},
  f=>{f.expectedSourceHashes.extra='a'.repeat(64);},f=>{f.sources['worker.js']='\ud800';repin(f,'worker.js');},f=>{f.sources['worker.js']=Buffer.from('x');}]){
  const f=fixture();change(f);assert.throws(()=>buildSpecificityStage(f));
 }
});
test('source and metadata accessors/proxies are refused before executing hooks',()=>{
 for(const key of ['sources','expectedSourceHashes']){
  const f=fixture();let hooks=0;Object.defineProperty(f[key],'worker.js',{enumerable:true,get(){hooks++;throw Error();}});
  assert.throws(()=>buildSpecificityStage(f));assert.equal(hooks,0);
  const g=fixture();g[key]=new Proxy(g[key],{ownKeys(){hooks++;throw Error();}});assert.throws(()=>buildSpecificityStage(g));assert.equal(hooks,0);
 }
});
test('nonlaunchable template cannot widen permissions, worker, CSP, incognito or keys',()=>{
 for(const change of [m=>{m.host_permissions=['<all_urls>'];},m=>{m.permissions.push('webRequest');},m=>{m.background.service_worker='foreign.js';},
  m=>{m.incognito='spanning';},m=>{m.content_security_policy.extension_pages="script-src 'unsafe-eval'";},m=>{m.content_scripts=[];}]){
  const f=fixture(),m=JSON.parse(f.sources['manifest.json']);change(m);f.sources['manifest.json']=JSON.stringify(m);repin(f,'manifest.json');
  assert.throws(()=>buildSpecificityStage(f),{code:'stage-template'});
 }
 const f=fixture();f.sources['manifest.json']='not json';repin(f,'manifest.json');assert.throws(()=>buildSpecificityStage(f),{code:'stage-template'});
});
test('foreign batch, forged self-hash and caller external pin mismatch fail',()=>{
 const f=fixture();assert.throws(()=>buildSpecificityStage({...f,expectedManifestHash:'0'.repeat(64)}));
 assert.throws(()=>buildSpecificityStage({...f,batch:{...f.batch,batchId:f.manifest.batches[1].batchId}}));
 const manifest=JSON.parse(JSON.stringify(f.manifest));manifest.cases[0].groupId='other';const {manifestHash,...body}=manifest;manifest.manifestHash=digest(body);
 assert.throws(()=>buildSpecificityStage({...f,manifest}));
});
test('UTF8 file/aggregate/template caps preflight before generation',()=>{
 const a=fixture();a.sources['worker.js']='x'.repeat(131073);repin(a,'worker.js');assert.throws(()=>buildSpecificityStage(a),{code:'stage-capacity'});
 const b=fixture();for(const name of STAGE_SOURCE_PATHS.filter(x=>x!=='manifest.json')){b.sources[name]='x'.repeat(131072);repin(b,name);}assert.throws(()=>buildSpecificityStage(b),{code:'stage-capacity'});
 const c=fixture();c.sources['manifest.json']=' '.repeat(16385);repin(c,'manifest.json');assert.throws(()=>buildSpecificityStage(c),{code:'stage-capacity'});
 const d=fixture();d.sources['worker.js']='\u{1f431}'.repeat(32769);repin(d,'worker.js');assert.throws(()=>buildSpecificityStage(d),{code:'stage-capacity'});
});
