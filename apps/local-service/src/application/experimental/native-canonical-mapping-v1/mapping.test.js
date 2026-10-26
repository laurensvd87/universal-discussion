// Invented geometry only. No saved model, browser, database or real input access.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {compilePairedE5Input,describePairedE5Input} from '../../../domain/hierarchical-e5-paired-input.js';
import {compileNativeOwnerPreparation,prepareNativeOwnerObservation,compileNativeOwnerGrouping,
 groupNativeOwnerObservation,describeNativeOwnerGroupedObservation} from '../native-owner-grouping-v1/grouping.js';
import {compileNativeCanonicalMapping as compile,mapNativeCanonicalObservation as map,describeNativeCanonicalMapping as describe} from './mapping.js';

const H='a'.repeat(64),TRAIN='b'.repeat(64),DETAIL='c'.repeat(64),TARGET='d'.repeat(64);
const sha=x=>createHash('sha256').update(x).digest('hex'),digest=x=>sha(JSON.stringify(x));
const axis=i=>Array.from({length:384},(_,j)=>i===j?1:0),clone=v=>structuredClone(v);
function candidate({flat=false,detailWeight=1}={}){
 const inputDefinition={bodyWeight:1,titleWeight:0,encoderHash:H},paired=describePairedE5Input(compilePairedE5Input(inputDefinition));
 const nodes=[{id:'games',parentId:null},{id:'nature',parentId:null}],heads=nodes.map((n,i)=>({nodeId:n.id,enabled:true,positiveGroups:2,negativeGroups:2,weights:axis(i),intercept:0}));
 const schema='hierarchical-e5-paired-linear-heads-v1',lambda=.1,trainingIdHashes=[0,1,2,3].map(i=>sha('invented-training-'+i)).sort(),trainingGroupHashes=[0,1,2,3].map(i=>sha('invented-group-'+i)).sort();
 const rootModel={schema,representation:paired.representation,representationHash:paired.representationHash,trainingVersion:'invented-not-trained',trainingHash:H,taxonomyHash:digest(nodes),
  settingsHash:digest({schema,lambda,dimensions:384,centering:'training-mean-features-and-labels',solver:'shared-dual-gram-cholesky',targets:'ancestor-inclusive-plus-one-otherwise-minus-one',independentGroups:'duplicates-rejected',minimumPositiveGroups:2,minimumNegativeGroups:2}),
  parameterHash:digest({schema,representation:paired.representation,representationHash:paired.representationHash,heads}),lambda,dimensions:384,trainingIdHashes,trainingGroupHashes,provenanceHash:digest({trainingIdHashes,trainingGroupHashes}),
  experimental:true,productionValidated:false,assignmentAuthority:false,nodes,heads,trainingWork:{units:0,gramProducts:0,choleskyProducts:0,solveProducts:0,weightProducts:0}};
 const p={schema:'pooled-root-rank-development-policy/v1',modelHash:digest(rootModel),representationHash:paired.representationHash,inputConstructionHash:TRAIN,nodeIds:['games','nature'],calibrationHash:H,minimumAcceptedGroups:20,enabled:true,minWinnerScore:.5,minWinnerGap:.1,acceptedGroups:20,correctGroups:20,work:{countedUnits:0,preflightUpperBound:10000},developmentOnly:true,perClassPrecisionGuaranteed:false,productionValidated:false,assignmentAuthority:false};
 const rootCandidate={schema:'native-root-rank-candidate/v1',inputDefinition,rootModel,rootPolicy:{...p,policyHash:digest(p)},trainingInputConstructionHash:TRAIN,
  targetProfile:{producerId:'native-browser-current',inputConstructionHash:TARGET,extractorVersions:['article-container-prefix/v1','main-text-prefix/v1'],effectiveTitleRule:'trim-or-hostname/v1'}};
 const localNodes=flat?nodes:[...nodes,{id:'game-leaf',parentId:'games'},{id:'game-deep',parentId:'game-leaf'},{id:'nature-leaf',parentId:'nature'}];
 const members=flat?['games','nature']:['game-deep','nature-leaf'];
 const detailDefinition={bodyWeight:detailWeight,titleWeight:1-detailWeight,encoderHash:H},detailPaired=describePairedE5Input(compilePairedE5Input(detailDefinition));
 const artifact={schema:'hierarchical-e5-local-evidence/v1',representation:detailPaired.representation,representationHash:detailPaired.representationHash,inputConstructionHash:DETAIL,
  taxonomyVersion:'invented/v1',evidenceVersion:'invented/v1',calibrationVersion:'invented/v1',calibrationStatus:'experimental',nodes:localNodes,
  examples:members.flatMap((nodeId,i)=>[0,1].map(j=>({id:nodeId+'-ref'+j,groupId:nodeId+'-group'+j,nodeId,kind:'member',vector:axis(i)}))),
  nodePolicies:localNodes.map(n=>({nodeId:n.id,enabled:true,minSupport:2,minSimilarity:.7,minNegativeMargin:0,minRivalMargin:0}))};
 return {schema:'native-root-local-detail-transfer/v1',rootCandidate,detail:{artifact,inputDefinition:detailDefinition,supportedRootIds:['games','nature']}};
}
function observation(){
 const url='https://example.org/invented',documentId='invented-document',foreground={windowId:7,tabId:3,focused:true,windowType:'normal',incognito:false,active:true,tabStatus:'complete',sourceUrl:url,documentUrl:url,permissionGranted:true};
 return {schema:'native-scoped-observation/v1',rawTitle:' Invented title ',effectiveTitle:'Invented title',body:'Invented body.\nSecond line.',extractorVersion:'main-text-prefix/v1',
  nativeWitness:{schema:'chrome-scripting-native-reader/v1',studyId:'invented-study',studyRevision:'invented-revision',caseId:'invented-case',ordinal:1,observationNonce:'invented-observation',eventEpoch:0,tabId:3,windowId:7,frameId:0,documentId,sourceUrl:url,documentUrl:url,
   foregroundChecks:[{...foreground},{...foreground},{...foreground}],read:{contractVersion:'page-content/1',status:'collected',documentId},attestation:{contractVersion:'page-content-attestation/1',status:'attested',url},effectiveTitleRule:'trim-or-hostname/v1',nativeDocumentContinuityOnly:true,canonicalAuthority:false},
  rightsEvidenceHash:H,bodyVector:axis(0),titleVector:axis(0)};
}
const publication=()=>({builderHash:'1'.repeat(64),encoderHash:'2'.repeat(64),representationHash:'3'.repeat(64),modelHash:'4'.repeat(64),policyHash:'5'.repeat(64),modelId:'e5-small-q8-browser-main-prefix-v1'});
function setup({flat=false,detailWeight=1,modify=()=>{},depth=8}={}){
 const c=candidate({flat,detailWeight}),context=compileNativeOwnerPreparation({schema:'native-owner-preparation/v1',candidate:c}),o=observation();modify(o);
 const prepared=prepareNativeOwnerObservation(context,o),settings={revision:'owner-v1',defaultMaxDepth:depth,overrides:[]},policy=compileNativeOwnerGrouping(context,settings);
 const grouped=groupNativeOwnerObservation(policy,prepared),description=describeNativeOwnerGroupedObservation(grouped);
 const byId=new Map([...c.rootCandidate.rootModel.nodes,...c.detail.artifact.nodes].map(n=>[n.id,n]));
 const template={schema:'native-canonical-mapping-template/v1',semanticTransferHash:description.groupingIdentity.semanticTransferHash,topologyHash:description.groupingIdentity.topologyHash,
  nodes:[...byId.values()].map(n=>({nativeNodeId:n.id,nativeParentId:n.parentId,canonicalNodeId:'canonical-'+n.id})),publication:publication()};
 const input={schema:'native-canonical-mapping-input/v1',canonicalSource:{expected:{generation:'declared-generation',revision:0},sourceId:'declared-source',documentHash:'6'.repeat(64),prior:null},
  fields:{url:o.nativeWitness.sourceUrl,rawTitle:o.rawTitle,effectiveTitle:o.effectiveTitle,body:o.body,extractorVersion:o.extractorVersion},pair:{bodyVector:[...o.bodyVector],titleVector:[...o.titleVector]}};
 return {c,context,o,prepared,grouped,description,template,input,handle:compile(template)};
}
const mapped=f=>describe(map(f.handle,f.grouped,f.input));
function oracleWire(values){
 const data=new ArrayBuffer(4628),view=new DataView(data);[1,0,701,384,1].forEach((v,i)=>view.setInt32(i*4,v,false));
 for(let i=0;i<384;i++){view.setInt32(20+12*i,8,false);view.setFloat64(24+12*i,values[i],false);}return sha(new Uint8Array(data));
}
function oracleNative(values){const data=new ArrayBuffer(3072),view=new DataView(data);values.forEach((v,i)=>view.setFloat64(i*8,v,true));return createHash('sha256').update('builder-root-input-vector/binary64-le/384/v1\0').update(new Uint8Array(data)).digest('hex');}
function materialOracle(f){const a=f.input,p=f.template.publication;return digest({url:a.fields.url,title:a.fields.effectiveTitle,extractorVersion:a.fields.extractorVersion,modelId:p.modelId,
 bodyHash:sha(a.fields.body),titleHash:sha(a.fields.effectiveTitle),builderHash:p.builderHash,encoderHash:p.encoderHash,representationHash:p.representationHash,documentHash:a.canonicalSource.documentHash,
 bodyWireHash:oracleWire(a.pair.bodyVector),titleWireHash:oracleWire(a.pair.titleVector)});}
const topologyHash=nodes=>digest({schema:'native-owner-topology/v1',nodes:[...nodes].sort((a,b)=>a.nativeNodeId<b.nativeNodeId?-1:a.nativeNodeId>b.nativeNodeId?1:0).map(n=>({id:n.nativeNodeId,parentId:n.nativeParentId}))});

test('actual196 job preserves semantic deepest path independently from owner projection and canonical mapping',()=>{
 const f=setup(),full=mapped(f),broad=compileNativeOwnerGrouping(f.context,{revision:'broad',defaultMaxDepth:1,overrides:[]});
 const cut=describe(map(f.handle,groupNativeOwnerObservation(broad,f.prepared),f.input));
 assert.deepEqual(full.semantic.supportedPath,['games','game-leaf','game-deep']);assert.deepEqual(cut.semantic,full.semantic);
 assert.deepEqual(cut.grouping.mappedSelectedPath,['canonical-games']);assert.equal(cut.grouping.deepestSupportedCanonicalNodeId,'canonical-game-deep');
 assert.equal(cut.grouping.primaryCanonicalNodeId,'canonical-games');assert.equal(cut.commitments.materialHash,full.commitments.materialHash);
 assert.notEqual(cut.mappingHash,full.mappingHash);assert.equal(cut.compatibility.currentRootOnlySchema,false);assert.equal(cut.compatibility.currentQueueShapeCompatible,false);
 const override=compileNativeOwnerGrouping(f.context,{revision:'subtree',defaultMaxDepth:1,overrides:[{nodeId:'games',maxDepth:3}]});
 const refined=describe(map(f.handle,groupNativeOwnerObservation(override,f.prepared),f.input));assert.deepEqual(refined.grouping.mappedSelectedPath,full.grouping.mappedSelectedPath);
 assert.deepEqual(f.description,describeNativeOwnerGroupedObservation(f.grouped));
});

test('exact output schema, declared domains, false authority and detached descriptions contain no raw retention',()=>{
 const f=setup(),job=map(f.handle,f.grouped,f.input),out=describe(job);
 assert.deepEqual(Object.keys(out),['schema','templateHash','semantic','grouping','declaredCanonicalSource','declaredPublication','commitments','compatibility','registryArtifactHash','nativeAttested','publicationIdentityChecked','publicationVerified','canonicalAuthority','queueAuthority','assignmentAuthority','productionValidated','mappingHash']);
 assert.deepEqual(Object.keys(out.semantic),['transferHash','semanticWitnessHash','status','reason','supportedPath']);
 assert.deepEqual(Object.keys(out.grouping),['groupIdentityHash','ownerGroupingHash','selectedPath','mappedSupportedPath','mappedSelectedPath','deepestSupportedCanonicalNodeId','primaryCanonicalNodeId']);
 assert.deepEqual(Object.keys(out.declaredCanonicalSource),['claimScope','expected','sourceId','documentHash','prior']);
 assert.deepEqual(Object.keys(out.declaredPublication),['claimScope','builderHash','encoderHash','representationHash','modelHash','policyHash','modelId']);
 assert.deepEqual(Object.keys(out.commitments),['sourceInputHash','nativeWitnessHash','rightsEvidenceHash','sourceUrlHash','documentUrlHash','fieldBindings','bodyVectorHash','titleVectorHash','bodyWireHash','titleWireHash','materialHash']);
 assert.deepEqual(Object.keys(out.compatibility),['urlCompatible','titleCompatible','extractorCompatible','bodyNormCompatible','titleNormCompatible','materialCompatible','priorCompatible','currentRootOnlySchema','currentQueueShapeCompatible','scope']);
 const {mappingHash,...bound}=out;assert.equal(mappingHash,digest(bound));
 for(const k of ['nativeAttested','publicationIdentityChecked','publicationVerified','canonicalAuthority','queueAuthority','assignmentAuthority','productionValidated'])assert.equal(out[k],false);
 assert.equal(out.registryArtifactHash,null);assert.equal(out.declaredPublication.claimScope,'declared-unverified-unbound');assert.equal(out.declaredCanonicalSource.claimScope,'declared-not-current-state');
 const serialized=JSON.stringify(out);for(const v of [f.input.fields.url,f.input.fields.body,f.input.fields.rawTitle,f.input.fields.effectiveTitle])assert.equal(serialized.includes(v),false);
 function check(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const [k,v]of Object.entries(value)){assert.ok(!['rawTitle','effectiveTitle','body','url','bodyVector','titleVector','sqlArray','parameters','preparedObservation','nativeWitness','principal','context'].includes(k));check(v);}}}check(out);
 const again=describe(job);assert.deepEqual(again,out);assert.notEqual(again,out);assert.notEqual(again.commitments,out.commitments);assert.deepEqual(Object.keys(job),[]);
 f.template.nodes[0].canonicalNodeId='mutated';f.template.publication.builderHash=H;f.input.canonicalSource.sourceId='mutated';f.input.pair.bodyVector[0]=.5;
 assert.deepEqual(describe(job),out);
});

test('native LE and PG array_send commitments match independent binary oracles including signed zero',()=>{
 const f=setup({modify:o=>{o.bodyVector[3]=-0;o.titleVector[5]=-0;}}),out=mapped(f);
 assert.equal(out.commitments.bodyVectorHash,oracleNative(f.input.pair.bodyVector));assert.equal(out.commitments.titleVectorHash,oracleNative(f.input.pair.titleVector));
 assert.equal(out.commitments.bodyWireHash,oracleWire(f.input.pair.bodyVector));assert.equal(out.commitments.titleWireHash,oracleWire(f.input.pair.titleVector));
 assert.notEqual(out.commitments.bodyVectorHash,out.commitments.bodyWireHash);assert.equal(out.commitments.materialHash,materialOracle(f));
 const changed=clone(f.input);changed.pair.bodyVector[3]=0;assert.throws(()=>map(f.handle,f.grouped,changed));
 for(const field of ['bodyVector','titleVector']){const a=clone(f.input);a.pair[field][0]=1+Number.EPSILON;assert.throws(()=>map(f.handle,f.grouped,a));}
});

test('repository material has fixed property-order gold hash and declaration sensitivity without publication identity inference',()=>{
 const f=setup(),out=mapped(f);assert.equal(out.commitments.materialHash,materialOracle(f));
 assert.equal(out.commitments.materialHash,'e9358639a6cf75d0acdede916a25958bd75aa2d78b773be13d8d4c0b369debcd');
 // Independent fixed string oracle; no DB-bearing repository import.
 const fixed='{"url":"https://example.org/invented","title":"Invented title","extractorVersion":"main-text-prefix/v1","modelId":"e5-small-q8-browser-main-prefix-v1","bodyHash":"'+sha(f.input.fields.body)+'","titleHash":"'+sha('Invented title')+'","builderHash":"'+'1'.repeat(64)+'","encoderHash":"'+'2'.repeat(64)+'","representationHash":"'+'3'.repeat(64)+'","documentHash":"'+'6'.repeat(64)+'","bodyWireHash":"'+oracleWire(axis(0))+'","titleWireHash":"'+oracleWire(axis(0))+'"}';
 assert.equal(out.commitments.materialHash,sha(fixed));
 for(const key of ['builderHash','encoderHash','representationHash','modelHash','policyHash']){const t=clone(f.template);t.publication[key]=H;const next=describe(map(compile(t),f.grouped,f.input));
  assert.notEqual(next.templateHash,out.templateHash);assert.notEqual(next.mappingHash,out.mappingHash);assert.equal(next.publicationIdentityChecked,false);assert.deepEqual(next.semantic,out.semantic);
  assert.equal(next.commitments.materialHash===out.commitments.materialHash,['modelHash','policyHash'].includes(key));}
});

test('Source URL is distinct from native navigation URL and both actual extractor variants remain reachable',()=>{
 const f=setup({modify:o=>{const doc=o.nativeWitness.sourceUrl+'?utm_source=invented';o.nativeWitness.documentUrl=doc;o.nativeWitness.foregroundChecks.forEach(v=>v.documentUrl=doc);}}),out=mapped(f);
 assert.notEqual(out.commitments.sourceUrlHash,out.commitments.documentUrlHash);assert.equal(out.compatibility.urlCompatible,true);
 const second=setup({modify:o=>o.extractorVersion='article-container-prefix/v1'});assert.equal(mapped(second).compatibility.extractorCompatible,true);
 for(const extractorVersion of ['crawler-static-html-prefix/v1','unknown'])assert.throws(()=>map(f.handle,f.grouped,{...f.input,fields:{...f.input.fields,extractorVersion}}));
 const bad=clone(f.input);bad.fields.url+='?changed=1';assert.throws(()=>map(f.handle,f.grouped,bad));
});

test('native-valid title controls, HTTP fixture and stricter pair norm become finite incompatibility without rewriting decisions',()=>{
 for(const control of ['\t','\n','\r']){const f=setup({modify:o=>{o.rawTitle='A'+control+'B';o.effectiveTitle=o.rawTitle;}}),out=mapped(f);
  assert.equal(out.compatibility.titleCompatible,false);assert.equal(out.commitments.materialHash,null);assert.equal(out.commitments.bodyWireHash,null);assert.deepEqual(out.semantic.supportedPath,['games','game-leaf','game-deep']);}
 const norm=setup({modify:o=>o.bodyVector[0]=1-2e-9}),out=mapped(norm);assert.equal(out.compatibility.bodyNormCompatible,false);assert.equal(out.commitments.bodyWireHash,null);
 const within=setup({modify:o=>o.bodyVector[0]=1-5e-10});assert.equal(mapped(within).compatibility.bodyNormCompatible,true);
 const http=setup({modify:o=>{const url='http://127.0.0.1:4173/background-fixture/invented';o.nativeWitness.sourceUrl=url;o.nativeWitness.documentUrl=url;o.nativeWitness.attestation.url=url;o.nativeWitness.foregroundChecks.forEach(v=>{v.sourceUrl=url;v.documentUrl=url;});}});
 assert.equal(mapped(http).compatibility.urlCompatible,false);assert.equal(mapped(http).commitments.materialHash,null);
 assert.equal(mapped(setup()).compatibility.materialCompatible,true); // Body LF is not transported.
});

test('fallback and astral field joins are exact UTF8 and UTF16 identities, with no trim or normalization rescue',()=>{
 const f=setup({modify:o=>{o.rawTitle=' \t ';o.effectiveTitle='example.org';o.body='Invented \u{1f428} body.';}}),out=mapped(f);
 assert.equal(out.commitments.fieldBindings.bodyCharacters,f.input.fields.body.length);assert.equal(out.commitments.fieldBindings.bodySha256,sha(f.input.fields.body));
 for(const key of ['rawTitle','effectiveTitle','body']){const a=clone(f.input);a.fields[key]+=' ';assert.throws(()=>map(f.handle,f.grouped,a));}
 const astral=setup({modify:o=>{o.rawTitle=' \u{1f428} ';o.effectiveTitle='\u{1f428}';}});assert.equal(mapped(astral).commitments.fieldBindings.effectiveTitleCharacters,2);
});

test('canonical declarations and prior compatibility preserve safe-integer and string domains including revision -0',()=>{
 const f=setup({flat:true});assert.equal(mapped(f).compatibility.currentQueueShapeCompatible,true);
 for(const version of ['1','9007199254740991']){const a=clone(f.input);a.canonicalSource.prior={sourceVersion:version,witnessHash:H,decisionHash:TRAIN};assert.equal(describe(map(f.handle,f.grouped,a)).compatibility.priorCompatible,true);}
 for(const version of ['0','01','-1','word','9007199254740992','9999999999999999']){const a=clone(f.input);a.canonicalSource.prior={sourceVersion:version,witnessHash:H,decisionHash:TRAIN};const out=describe(map(f.handle,f.grouped,a));assert.equal(out.compatibility.priorCompatible,false);assert.equal(out.compatibility.currentQueueShapeCompatible,false);assert.equal(out.compatibility.materialCompatible,true);}
 for(const version of [1,1n,Symbol('v'),new String('1'),'', '1'.repeat(17),'1\n']){const a={...f.input,canonicalSource:{...f.input.canonicalSource,prior:{sourceVersion:version,witnessHash:H,decisionHash:TRAIN}}};assert.throws(()=>map(f.handle,f.grouped,a));}
 const a=clone(f.input);a.canonicalSource.expected.revision=-0;assert.ok(Object.is(describe(map(f.handle,f.grouped,a)).declaredCanonicalSource.expected.revision,-0));
 for(const change of [{sourceId:'x'.repeat(129)},{documentHash:'not-a-hash'},{expected:{generation:'g',revision:Number.MAX_SAFE_INTEGER+1}},{prior:{sourceVersion:'1',witnessHash:'bad',decisionHash:H}}])assert.throws(()=>map(f.handle,f.grouped,{...f.input,canonicalSource:{...f.input.canonicalSource,...change}}));
});

test('complete topology is injective and hashed; no partial, cyclic, reused or excessive-depth mapping is accepted',()=>{
 const f=setup();for(const mutate of [t=>t.nodes[1].canonicalNodeId=t.nodes[0].canonicalNodeId,t=>t.nodes[1].nativeNodeId=t.nodes[0].nativeNodeId,t=>t.nodes[0].nativeParentId='missing',t=>t.nodes[0].nativeParentId=t.nodes[0].nativeNodeId,t=>t.nodes.pop(),t=>t.topologyHash=H]){const t=clone(f.template);mutate(t);assert.throws(()=>compile(t));}
 const reversed=clone(f.template);reversed.nodes.reverse();assert.equal(describe(map(compile(reversed),f.grouped,f.input)).templateHash,mapped(f).templateHash);
 for(const count of [144,145]){const t=clone(f.template);t.nodes=Array.from({length:count},(_,i)=>({nativeNodeId:'n'+String(i).padStart(3,'0'),nativeParentId:null,canonicalNodeId:'c'+i}));t.topologyHash=topologyHash(t.nodes);if(count===144)assert.ok(compile(t));else assert.throws(()=>compile(t));}
 for(const count of [8,9]){const t=clone(f.template);t.nodes=Array.from({length:count},(_,i)=>({nativeNodeId:'n'+i,nativeParentId:i?'n'+(i-1):null,canonicalNodeId:'c'+i}));t.topologyHash=topologyHash(t.nodes);if(count===8)assert.ok(compile(t));else assert.throws(()=>compile(t));}
});

test('authentic jobs and templates cannot be replaced with JSON, another transfer/topology or wrong arity',()=>{
 const f=setup();for(const job of [{},clone(f.description),Promise.resolve(f.grouped)])assert.throws(()=>map(f.handle,job,f.input));
 assert.throws(()=>map({},f.grouped,f.input));assert.throws(()=>describe({}));assert.throws(()=>compile(f.template,'extra'));assert.throws(()=>map(f.handle,f.grouped,f.input,'extra'));assert.throws(()=>describe(map(f.handle,f.grouped,f.input),'extra'));
 for(const key of ['semanticTransferHash','topologyHash']){const t=clone(f.template);t[key]=H;if(key==='topologyHash')assert.throws(()=>compile(t));else assert.throws(()=>map(compile(t),f.grouped,f.input));}
 const other=setup({flat:true});assert.throws(()=>map(f.handle,other.grouped,other.input));
});

test('unresolved/tied root decisions retain empty membership without inventing a canonical primary',()=>{
 for(const values of [axis(2),axis(0).map((_,i)=>i<2?Math.SQRT1_2:0)]){const f=setup({modify:o=>{o.bodyVector=values;o.titleVector=values;}}),out=mapped(f);
  assert.equal(out.semantic.status,'unresolved');assert.deepEqual(out.semantic.supportedPath,[]);assert.deepEqual(out.grouping.mappedSelectedPath,[]);assert.equal(out.grouping.deepestSupportedCanonicalNodeId,null);assert.equal(out.grouping.primaryCanonicalNodeId,null);}
});

test('actual local-detail conflict retains the supported root and semantic reason without flattening the hierarchy',()=>{
 const f=setup({detailWeight:0,modify:o=>{o.bodyVector=axis(0);o.titleVector=axis(1);}}),out=mapped(f),actual=f.description.preparedObservation.decision;
 assert.equal(actual.reason,'local-detail-conflict');assert.deepEqual(actual.supportedPath,['games']);
 assert.equal(out.semantic.reason,actual.reason);assert.equal(out.semantic.semanticWitnessHash,actual.semanticWitnessHash);
 assert.deepEqual(out.semantic.supportedPath,actual.supportedPath);assert.deepEqual(out.grouping.mappedSupportedPath,['canonical-games']);
 assert.deepEqual(out.grouping.mappedSelectedPath,['canonical-games']);assert.equal(out.grouping.primaryCanonicalNodeId,'canonical-games');
 assert.equal(out.grouping.deepestSupportedCanonicalNodeId,'canonical-games');assert.equal(out.compatibility.currentRootOnlySchema,false);
 assert.equal(out.compatibility.currentQueueShapeCompatible,false);assert.equal(f.template.nodes.length,5);
 const broad=compileNativeOwnerGrouping(f.context,{revision:'conflict-broad',defaultMaxDepth:1,overrides:[]});
 const cut=describe(map(f.handle,groupNativeOwnerObservation(broad,f.prepared),f.input));
 assert.deepEqual(cut.semantic,out.semantic);assert.equal(cut.commitments.materialHash,out.commitments.materialHash);
});

test('nested proxies, accessors, then/toJSON hooks, sparse arrays and prototypes refuse without caller hooks',()=>{
 const f=setup();let hooks=0;const proxy=v=>new Proxy(v,{get(){hooks++;throw Error();},ownKeys(){hooks++;throw Error();},getPrototypeOf(){hooks++;throw Error();},getOwnPropertyDescriptor(){hooks++;throw Error();}});
 const paths=[[],['canonicalSource'],['canonicalSource','expected'],['fields'],['pair'],['pair','bodyVector'],['pair','titleVector']];
 for(const path of paths){const a=clone(f.input);if(path.length===0){assert.throws(()=>map(f.handle,f.grouped,proxy(a)));continue;}let parent=a;for(const k of path.slice(0,-1))parent=parent[k];const key=path.at(-1),v=parent[key];parent[key]=proxy(v);assert.throws(()=>map(f.handle,f.grouped,a));}
 for(const path of [['fields','body'],['canonicalSource','documentHash'],['pair','bodyVector']]){const a=clone(f.input);Object.defineProperty(a[path[0]],path[1],{enumerable:true,get(){hooks++;return null;}});assert.throws(()=>map(f.handle,f.grouped,a));}
 for(const key of ['then','toJSON']){const a=clone(f.input);a[key]=()=>{hooks++;};assert.throws(()=>map(f.handle,f.grouped,a));const t=clone(f.template);t[key]=()=>{hooks++;};assert.throws(()=>compile(t));}
 const a=clone(f.input);delete a.pair.bodyVector[1];assert.throws(()=>map(f.handle,f.grouped,a));
 const nullProto=Object.assign(Object.create(null),f.input);assert.throws(()=>map(f.handle,f.grouped,nullProto));assert.throws(()=>compile(proxy(f.template)));assert.throws(()=>map(f.handle,proxy({}),f.input));
 for(const field of ['nodes','publication']){const t=clone(f.template);t[field]=proxy(t[field]);assert.throws(()=>compile(t));}
 const t=clone(f.template);Object.defineProperty(t.nodes[0],'canonicalNodeId',{enumerable:true,get(){hooks++;return 'x';}});assert.throws(()=>compile(t));
 assert.equal(hooks,0);
});

test('every declared record member rejects accessor hooks, including prior/publication and vector elements',()=>{
 const f=setup();f.input.canonicalSource.prior={sourceVersion:'1',witnessHash:H,decisionHash:TRAIN};let hooks=0,checks=0;
 function memberPaths(value,path=[]){if(!value||typeof value!=='object')return [];const paths=[];
  for(const key of Object.keys(value)){paths.push([...path,key]);if(!Array.isArray(value))paths.push(...memberPaths(value[key],[...path,key]));}return paths;}
 for(const [base,invoke] of [[f.template,v=>compile(v)],[f.input,v=>map(f.handle,f.grouped,v)]])for(const path of memberPaths(base)){
  const a=clone(base);let owner=a;for(const key of path.slice(0,-1))owner=owner[key];Object.defineProperty(owner,path.at(-1),{enumerable:true,get(){hooks++;throw Error('must not run');}});
  assert.throws(()=>invoke(a));checks++;}
 // Nodes are dense objects nested in an array; test each node's three members.
 for(let i=0;i<f.template.nodes.length;i++)for(const key of Object.keys(f.template.nodes[i])){const a=clone(f.template);Object.defineProperty(a.nodes[i],key,{enumerable:true,get(){hooks++;throw Error();}});assert.throws(()=>compile(a));checks++;}
 assert.ok(checks>780);assert.equal(hooks,0);
});

test('bounded invented compile/map/describe timing is reported separately, never a serving latency gate',t=>{
 const f=setup(),start=performance.now(),handle=compile(f.template),compileMs=performance.now()-start;
 for(let i=0;i<20;i++)describe(map(handle,f.grouped,f.input));
 const mapping=[],describing=[];for(let i=0;i<128;i++){let a=performance.now();const job=map(handle,f.grouped,f.input);mapping.push(performance.now()-a);a=performance.now();describe(job);describing.push(performance.now()-a);}
 const summary=xs=>{xs.sort((a,b)=>a-b);return {p50Ms:xs[Math.floor(xs.length*.5)],p95Ms:xs[Math.floor(xs.length*.95)],maxMs:xs.at(-1)};};
 t.diagnostic(JSON.stringify({scope:'invented-prepared-job-metadata-only-not-capture-encoding-db-or-ui',iterations:128,compileMs,map:summary(mapping),describe:summary(describing)}));
 assert.ok(Number.isFinite(compileMs));assert.equal(mapped(f).assignmentAuthority,false);
});
