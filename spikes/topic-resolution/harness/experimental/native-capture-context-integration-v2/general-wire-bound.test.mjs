// SOURCE-only closed-schema byte bound; no candidate execution or ownership claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const earlier=new URL('../native-capture-context-integration-v1/journey-wire-bound.test.mjs',import.meta.url);
assert.equal(sha(fs.readFileSync(earlier)),'79fd4597bbbdd7cc0ed36ddeb7d9fb4db5f6001d258d62dd09f3426d1649ed03');
// Authenticates all128 frozen CODE before imports and runs six earlier reports.
await import(earlier.href);
const old=new URL('../native-specificity-study-v19/browser-capture.mjs',import.meta.url),source=fs.readFileSync(old,'utf8');
assert.equal(sha(Buffer.from(source)),'beca0ad789a040dc206614f0795baca84c32d7f7b3eaf3244d20501a053b4501');
const held=new URL('../native-capture-context-integration-v1/browser-capture.mjs',import.meta.url);
assert.equal(sha(fs.readFileSync(held)),'419527915aaf5c060f647b59726a103d2f54966d214ce061efb4f43cb117d475');
const {projectSpecificityCaptureDiagnostic:project}=await import(held.href);
const {CODES:JOURNEY_CODES}=await import('../native-specificity-public-journey-v3/journey.mjs');
const {SPECIFICITY_DRIVER_FAILURE_STAGES:outerStages}=await import('../native-specificity-study-v19/driver.mjs');
const begin=source.indexOf('const FAILURE_CODES=Object.freeze({'),end=source.indexOf('const UNKNOWN_NETWORK_EVENTS=',begin);
assert.ok(begin>0&&end>begin);
const codes=Function('JOURNEY_CODES',"'use strict';"+source.slice(begin,end)+'return FAILURE_CODES;')(JOURNEY_CODES);
function domain(name){
 const match=source.match(new RegExp('const '+name+'=new Set\\((\\[[^\\n]+\\])\\);'));assert.ok(match,name);
 return Function("'use strict';return "+match[1])();
}
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8'),largest=values=>values.reduce((a,b)=>bytes(b)>bytes(a)?b:a);
const nominals=Object.entries(codes).flatMap(([family,values])=>[...values].map(code=>({family,code})));
const stages=domain('FAILURE_STAGES'),rpcs=domain('FAILURE_RPCS'),cleanup=largest(nominals);
const witnessKeys=['journeyWitness','timerWitness','infrastructureWitness','networkWitness','operationWitness','ownerNavigationWitness','navigationAccountingWitness'];
function record(primary,witnessKey=null,witness=null,overrides={}){
 const result={schema:'native-specificity-capture-failure/v1',stage:largest(stages),rpc:largest(rpcs),primary,cleanup,
  journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null};
 if(witnessKey!==null)result[witnessKey]=witness;return {...result,...overrides};
}
function accepted(primary,key,value){return project(record(primary,key,value));}
const maxima=[];
function checkDomain(label,primary,key,values,expectedCount){
 let maximum=0,worst=null,count=0;
 for(const value of values){const out=accepted(primary,key,value),size=bytes(out);count++;if(size>maximum){maximum=size;worst=out;}}
 assert.equal(count,expectedCount,label);assert.ok(worst,label);maxima.push({label,count,maximum,worst});
}
function* operations(){for(const lane of ['ordinary','denial','cleanup'])for(const rpc of rpcs)for(const kind of ['sync-throw','promise-rejection'])for(const cause of nominals)yield {lane,rpc,kind,cause};}
function* networks(){for(const scheme of domain('NETWORK_SCHEMES'))for(const resourceType of domain('NETWORK_TYPES'))for(const frameRelation of ['main','child','other','absent','unavailable'])for(const loaderRelation of ['main','blank','other','absent','unavailable'])yield {schema:'native-network-observation-witness/v1',event:'response',scheme,resourceType,frameRelation,loaderRelation};}
function* infrastructures(){for(const site of domain('INFRASTRUCTURE_SITES'))for(const role of domain('INFRASTRUCTURE_ROLES'))for(const predicate of domain('INFRASTRUCTURE_PREDICATES'))yield {schema:'native-infrastructure-identity-witness/v1',site,role,predicate};}
function* ownerNavigations(){
 for(const predicate of ['pending','frame'])yield {schema:'native-article-navigation-witness/v1',predicate,state:'unexamined',urlRelation:'unexamined'};
 for(const urlRelation of ['blank','other','unavailable'])yield {schema:'native-article-navigation-witness/v1',predicate:'target',state:'absent',urlRelation};
 for(const state of ['provisional','authenticated','retiring','terminal'])yield {schema:'native-article-navigation-witness/v1',predicate:'state',state,urlRelation:'unexamined'};
 for(const state of ['navigating','reading']){yield {schema:'native-article-navigation-witness/v1',predicate:'repeat',state,urlRelation:'unexamined'};
  for(const urlRelation of ['blank','other','unavailable'])yield {schema:'native-article-navigation-witness/v1',predicate:'url',state,urlRelation};}
}
function* mainNavigations(){for(const site of ['fresh','within','public','read','seal','retire'])for(const state of ['active','sealed','retiring','released','unavailable'])for(const balance of ['matched','unmatched','unavailable'])for(const urlRelation of ['not-examined','exact','different','blank','unavailable']){
 const value={schema:'native-main-navigation-observation/v1',site,state,balance,urlRelation};
 try{accepted({family:'unclassified',code:'unclassified'},'navigationAccountingWitness',value);}catch{continue;}yield value;
}}
const terminalTuples=[['cdp-frame','main','main',null],['cdp-frame','parent-absent','nonmain',null],['cdp-frame','parent-mismatch','child',null],['cdp-within','main','main',null],['playwright','main-detached','unexamined',true],['playwright','main','main',false]];

test('ADR215 exhausts all non-journey closed witness domains including every operation cause',()=>{
 assert.equal(nominals.length,207);assert.equal(rpcs.length,39);
 checkDomain('operation',{family:'capture',code:'client-operation'},'operationWitness',operations(),3*39*2*207);
 checkDomain('network',{family:'capture',code:'unknown-network-response'},'networkWitness',networks(),9*21*5*5);
 checkDomain('infrastructure',{family:'startup',code:'infrastructure-identity'},'infrastructureWitness',infrastructures(),4*5*12);
 checkDomain('owner-navigation',{family:'article-owner',code:'article-navigation'},'ownerNavigationWitness',ownerNavigations(),17);
 checkDomain('main-navigation',{family:'unclassified',code:'unclassified'},'navigationAccountingWitness',mainNavigations(),96);
 checkDomain('terminal-navigation',{family:'capture',code:'terminal-frame-navigation'},'navigationAccountingWitness',terminalTuples.map(([site,predicate,frameRelation,mainDetached])=>({schema:'native-terminal-navigation-observation/v1',site,predicate,frameRelation,mainDetached})),6);
 checkDomain('timer',{family:'capture',code:'article-deadline'},'timerWitness',function*(){for(const lane of ['ordinary','denial','cleanup'])for(const rpc of rpcs)yield {lane,rpc};}(),117);
 // The earlier independently authenticated six-report entry proves journey585.
 maxima.push({label:'public-journey',count:92160,maximum:585,worst:accepted({family:'public-journey',code:largest(JOURNEY_CODES)},'journeyWitness',{site:'lifecycle',phase:'dispatched',blankLoaderMatch:false,lifecycleName:'firstMeaningfulPaintCandidate',seenFactsMask:127})});
 assert.equal(bytes(maxima.at(-1).worst),585);
});

test('ADR215 all primary and scalar choices are bounded and incompatible witnesses cannot coexist',()=>{
 assert.equal(maxima.length,8);
 const familyMaximum=Math.max(...maxima.map(entry=>entry.maximum));
 for(const primary of nominals){const out=project(record(primary));assert.ok(bytes(out)<=familyMaximum);}
 for(const entry of maxima){
  for(const stage of stages)assert.ok(bytes(project({...entry.worst,stage}))<=entry.maximum);
  for(const rpc of [null,...rpcs])assert.ok(bytes(project({...entry.worst,rpc}))<=entry.maximum);
  for(const value of [null,...nominals])assert.ok(bytes(project({...entry.worst,cleanup:value}))<=entry.maximum);
  const active=witnessKeys.find(k=>entry.worst[k]!==null);assert.ok(active);
  for(const other of maxima){const next=witnessKeys.find(k=>other.worst[k]!==null);if(next===active)continue;
   assert.throws(()=>project({...entry.worst,[next]:other.worst[next]}),{code:'diagnostic-contract'});}
 }
 // Network event/code pairs and timer codes are the remaining dependent fields.
 const network=maxima.find(x=>x.label==='network');
 for(const [code,event]of [['unknown-network-response','response'],['unknown-network-data','data'],['unknown-loading-finished','finished'],['unknown-network-failure','failed']]){
  const out=project({...network.worst,primary:{family:'capture',code},networkWitness:{...network.worst.networkWitness,event}});assert.ok(bytes(out)<=network.maximum);
 }
 const timer=maxima.find(x=>x.label==='timer');
 assert.ok(bytes(project({...timer.worst,primary:{family:'capture',code:'rpc-deadline'}}))<=timer.maximum);
 // No new per-instance string may escape the closed ASCII domains in this proof.
 for(const value of [...stages,...rpcs,...nominals.flatMap(p=>[p.family,p.code])])assert.match(value,/^[A-Za-z0-9_.:-]+$/u);
});

test('ADR215 complete general wire stays below900 and3072 proposed transport arithmetic',()=>{
 assert.equal(maxima.length,8);let maximum=0;
 for(const entry of maxima)for(const phase of ['prepare','train-cal','test'])for(const stage of outerStages){
  const text=JSON.stringify({schema:'native-specificity-execution-failure/v1',phase,stage,capture:entry.worst}),size=Buffer.byteLength(text);
  const packet=Buffer.alloc(size+1);assert.equal(packet.write(text,'utf8'),size);packet[size]=10;
  assert.equal(packet.buffer.byteLength,packet.length);assert.equal(packet.byteOffset,0);assert.ok(packet.length<=900);assert.ok(3*packet.length+288<=3072);maximum=Math.max(maximum,packet.length);
 }
 process.stdout.write(JSON.stringify({scope:'closed-schema-byte-maximum-not-ownership',families:maxima.map(({label,count,maximum})=>({label,count,maximum})),maximumWireBytes:maximum,conservativeTransportBytes:3*maximum+288,proposedTransportCharge:3072,graphAndHolderAreAdditional:true,allLiveProof:false})+'\n');
});
