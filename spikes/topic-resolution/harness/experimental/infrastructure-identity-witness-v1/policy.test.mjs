import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createInfrastructurePolicy as diagnostic} from './policy.mjs';

// Authenticate FILE bytes before importing the immutable differential baseline.
const baselineUrl=new URL('../exact-browser-infrastructure-v1/compatibility-variant.mjs',import.meta.url);
assert.equal(createHash('sha256').update(await readFile(baselineUrl)).digest('hex'),'2d0309b15a7a74fe7a440c041a3c7592c7369b67258cb2f46db4c2723e71c07d');
const {createInfrastructurePolicy:baseline,StartupFatal}=await import(baselineUrl.href);
const ROOT='chrome://omnibox-popup.top-chrome/',AIM=ROOT+'omnibox_popup_aim.html',WORKER='chrome-extension://'+'a'.repeat(32)+'/worker.js';
const info=(targetId,type,url,extra={})=>({targetId,type,url,attached:type==='page',browserContextId:'ctx',...extra});
function fixture(factory,{created=true,seal=true}={}){
 const p=factory(),a=info('anchor','page','about:blank'),root=info('root','browser_ui',ROOT),aim=info('aim','browser_ui',AIM),w=info('worker','service_worker',WORKER);
 const f={p,a,root,aim,w,payload:t=>p.targetPayload({targetInfo:t}),create(t,closing){return p.created(f.payload(t),closing);},change(t,closing=false){return p.lifecycle('target-info-changed',{targetInfo:t},closing);},destroy(id,closing=true){return p.lifecycle('target-destroyed',{targetId:id},closing);},census(rows=[a,root,aim],phase='pre-load',url=null){return p.census({targetInfos:rows},phase,url);}};
 if(seal)p.seal({targetInfo:a});if(created&&seal)for(const t of [root,aim,a])f.create(t);return f;
}
function outcome(action){try{return {ok:true,value:action()};}catch(error){return {ok:false,error};}}
function equivalent(a,b){assert.equal(a.ok,b.ok);if(a.ok)assert.deepEqual(a.value,b.value);else{assert.equal(Object.getPrototypeOf(a.error),Object.getPrototypeOf(b.error));assert.equal(a.error.constructor,StartupFatal);assert.equal(a.error.code,b.error.code);assert.equal(a.error.message,b.error.message);}}
function differential(actions,options){const old=fixture(baseline,options),fresh=fixture(diagnostic,options);const results=[];for(const action of actions){const a=outcome(()=>action(old)),b=outcome(()=>action(fresh));equivalent(a,b);results.push(b);}return {old,fresh,results};}
const witness=(site,role,predicate)=>({schema:'native-infrastructure-identity-witness/v1',site,role,predicate});
function identityCase(name,setup,action,expected,options){test(name,()=>{
 const actions=[...(setup||[]),action,f=>f.p.isSealed(),f=>f.census(),f=>f.change(f.a),f=>f.p.release(),f=>f.p.isSealed(),f=>f.create(f.a)];
 const {fresh,results}=differential(actions,options),index=(setup||[]).length,error=results[index].error;
 assert.equal(error.code,'infrastructure-identity');
 // release cleared the first error; replay separately to inspect the witness.
 assert.equal(fresh.p.readFailureWitness(error),null);
 const f=fixture(diagnostic,options);for(const s of setup||[])s(f);const observed=outcome(()=>action(f));assert.equal(observed.error.code,'infrastructure-identity');
 const dto=f.p.readFailureWitness(observed.error);assert.deepEqual(dto,expected);assert.ok(Object.isFrozen(dto));assert.deepEqual(Object.keys(dto),['schema','site','role','predicate']);
 assert.equal(f.p.readFailureWitness(new StartupFatal('infrastructure-identity')),null);
 });}

test('accepted full flows, four-member bound, closing truthiness and null prototypes are differential',()=>{
 differential([f=>f.census(),f=>f.p.worker(f.payload(f.w)),f=>f.census([f.a,f.root,f.aim,f.w],'post-load',WORKER),f=>f.change(f.w),f=>f.change({...f.a,attached:false},'closing'),f=>f.destroy('root',{}),f=>f.destroy('aim',1),f=>f.destroy('worker','yes'),f=>f.destroy('anchor',true),f=>f.p.release(),f=>f.p.isSealed()]);
 differential([f=>f.p.targetPayload(Object.assign(Object.create(null),{targetInfo:Object.assign(Object.create(null),f.a)})),f=>f.create(info('unknown','other','')),f=>f.census([f.a,f.root,f.aim,info('browser','browser','')])]);
 // Only seal adds anchor; created has exactly two unique slots; worker permits
 // only one worker. No removal erases members. Thus public states have <=4,
 // never32; target-capacity is deliberately not exercised via forged state.
 const f=fixture(diagnostic);f.p.worker(f.payload(f.w));for(let n=0;n<40;n++)assert.throws(()=>f.create({...f.root,targetId:'extra-'+n}),{code:'infrastructure-identity'});
 assert.equal(f.census([f.a,f.root,f.aim,f.w],'post-load',WORKER).targets,4);
});

identityCase('anchor creation duplicate',[],f=>f.create(f.a),witness('created','anchor','duplicate-created'));
for(const [predicate,mutation]of [['type',{type:'other'}],['url',{url:'about:blank#x'}],['context',{browserContextId:'other'}],['attached',{attached:false}]]){
 identityCase('anchor creation '+predicate,[],f=>f.create({...f.a,...mutation}),witness('created','anchor',predicate),{created:false});
}
for(const [role,key]of [['ui-root','root'],['ui-aim','aim']]){
 for(const [predicate,mutation]of [['context',{browserContextId:'wrong'}],['attached',{attached:true}],['parent',{parentId:'p'}],['opener',{openerId:'o'}]]){
  identityCase('UI admission '+role+' '+predicate,[],f=>f.create({...f[key],...mutation}),witness('created',role,predicate),{created:false});
 }
 identityCase('UI duplicate slot '+role,[],f=>f.create({...f[key],targetId:'replacement'}),witness('created',role,'duplicate-role'));
}
identityCase('UI different role duplicate ID',[f=>f.create(f.root)],f=>f.create({...f.aim,targetId:'root'}),witness('created','ui-aim','duplicate-id'),{created:false});
identityCase('worker wrong type',[],f=>f.p.worker(f.payload(f.a)),witness('worker','worker','type'));
identityCase('worker already present',[f=>f.p.worker(f.payload(f.w))],f=>f.p.worker(f.payload({...f.w,targetId:'next'})),witness('worker','worker','worker-present'));
identityCase('worker duplicate ID',[],f=>f.p.worker(f.payload({...f.w,targetId:'root'})),witness('worker','worker','duplicate-id'));

for(const [role,key]of [['anchor','a'],['ui-root','root'],['ui-aim','aim'],['worker','w']]){
 const setup=role==='worker'?[f=>f.p.worker(f.payload(f.w))]:[];
 for(const [predicate,mutation]of [['type',{type:'other'}],['url',{url:'changed'}],['context',{browserContextId:'wrong'}]]){
  identityCase('changed '+role+' '+predicate,setup,f=>f.change({...f[key],...mutation}),witness('changed',role,predicate));
  identityCase('census '+role+' '+predicate,setup,f=>f.census([f.a,f.root,f.aim,...(role==='worker'?[f.w]:[])].map(t=>t.targetId===f[key].targetId?{...t,...mutation}:t),'post-load',WORKER),witness('census',role,predicate));
 }
 identityCase('changed terminal '+role,[...setup,f=>f.destroy(f[key].targetId)],f=>f.change(f[key],true),witness('changed',role,'terminal'));
 identityCase('census terminal '+role,[...setup,f=>f.destroy(f[key].targetId)],f=>f.census([f.a,f.root,f.aim,...(role==='worker'?[f.w]:[])],'post-load',WORKER),witness('census',role,'terminal'));
 const predicates=role==='anchor'?[['attached',{attached:false}]]:role==='worker'?[]:[['attached',{attached:true}],['parent',{parentId:'p'}],['opener',{openerId:'o'}]];
 for(const [predicate,mutation]of predicates){
  identityCase('changed '+role+' '+predicate,setup,f=>f.change({...f[key],...mutation}),witness('changed',role,predicate));
  identityCase('census '+role+' '+predicate,setup,f=>f.census([f.a,f.root,f.aim].map(t=>t.targetId===f[key].targetId?{...t,...mutation}:t)),witness('census',role,predicate));
 }
}

test('short-circuit order matches original compound predicates',()=>{
 const checks=[
  [f=>f.change({...f.root,type:'other',url:'wrong',browserContextId:'wrong',attached:true,parentId:'p',openerId:'o'}),'type'],
  [f=>f.change({...f.root,url:'wrong',browserContextId:'wrong',attached:true}),'url'],
  [f=>f.change({...f.root,browserContextId:'wrong',attached:true}),'context'],
  [f=>f.change({...f.root,attached:true,parentId:'p',openerId:'o'}),'attached'],
  [f=>f.change({...f.root,parentId:'p',openerId:'o'}),'parent'],
  [f=>f.create({...f.root,targetId:'next',browserContextId:'wrong',attached:true,parentId:'p'}),'context'],
  [f=>f.create({...f.root,targetId:'next',attached:true,parentId:'p'}),'attached'],
  [f=>f.create({...f.root,targetId:'next',parentId:'p',openerId:'o'}),'parent'],
  [f=>f.p.worker(f.payload(f.a)),'type']
 ];
 for(const [action,predicate]of checks){const {fresh,results}=differential([action,f=>f.census()]);assert.equal(fresh.p.readFailureWitness(results[0].error).predicate,predicate);}
});

test('all original entrypoint errors latch even when nonidentity; postfault behavior stays original',()=>{
 const faults=[
  [f=>f.p.targetPayload(null),{}],
  [f=>f.p.seal({targetInfo:f.a}),{}],
  [f=>f.p.created({}),{}],
  [f=>f.p.worker({}),{}],
  [f=>f.change({...f.a,targetId:'unknown'}),{}],
  [f=>f.census([], 'invalid'),{}],
  [f=>f.p.created(null),{seal:false}],
  [f=>f.create(f.a,true),{}]
 ];
 for(const [fault,options]of faults){const {fresh,results}=differential([fault,f=>f.create(f.a),f=>f.p.isSealed()],options);assert.equal(results[0].ok,false);assert.equal(fresh.p.readFailureWitness(results[0].error),null);assert.equal(fresh.p.readFailureWitness(results[1].error),null);}
 const f=fixture(diagnostic);const first=outcome(()=>f.create(f.a)).error,second=outcome(()=>f.change({...f.root,url:'bad'})).error;
 assert.equal(f.p.readFailureWitness(first).predicate,'duplicate-created');assert.equal(f.p.readFailureWitness(second),null);assert.equal(f.census().targets,3);
 f.p.release();assert.equal(f.p.readFailureWitness(first),null);assert.equal(f.p.diagnosticRetainedBytes(),320);assert.throws(()=>f.create(f.a),{code:'anchor-contract'});assert.equal(f.p.readFailureWitness(first),null);
});

test('descriptor, census grammar, unknown-target and lifetime negatives are differential and zero-hook',()=>{
 let hooks=0;const proxy=new Proxy({}, {get(){hooks++;throw Error('hook');},getPrototypeOf(){hooks++;throw Error('hook');},ownKeys(){hooks++;throw Error('hook');}});
 const getter=Object.defineProperty({},'targetInfo',{get(){hooks++;throw Error('hook');},enumerable:true});
 const symbol={targetInfo:info('x','other',''),[Symbol()]:1};
 const sparse=[];sparse.length=1;const accessor=[];Object.defineProperty(accessor,'0',{get(){hooks++;throw Error('hook');},enumerable:true});
 const cases=[f=>f.p.targetPayload(proxy),f=>f.p.targetPayload(getter),f=>f.p.targetPayload(symbol),f=>f.p.targetPayload({targetInfo:{...f.a,targetId:''}}),f=>f.p.targetPayload({targetInfo:{...f.a,browserContextId:undefined}}),f=>f.p.targetPayload({targetInfo:{...f.a,parentId:''}}),f=>f.p.targetPayload({targetInfo:{...f.a,openerId:proxy}}),f=>f.p.targetPayload({targetInfo:{...f.a,url:'x'.repeat(2049)}}),f=>f.p.targetPayload({targetInfo:{...f.a,type:'x'.repeat(65)}}),f=>f.p.census({targetInfos:sparse},'pre-load'),f=>f.p.census({targetInfos:accessor},'pre-load'),f=>f.p.census({targetInfos:proxy},'pre-load'),f=>f.census([f.a,f.a,f.root,f.aim]),f=>f.census([f.a,f.root]),f=>f.census([f.a,f.root,f.aim,info('x','other','')]),f=>f.change({...f.a,targetId:'unknown'}),f=>f.destroy('unknown'),f=>f.destroy('root',false),f=>f.p.lifecycle('target-crashed',{targetId:'root'},true),f=>{f.destroy('root');return f.destroy('root');}];
 for(const action of cases)differential([action,f=>f.p.isSealed(),f=>f.p.release(),f=>f.p.isSealed()]);
 assert.equal(hooks,0);
 const f=fixture(diagnostic);const error=outcome(()=>f.create(f.a)).error;
 assert.equal(f.p.readFailureWitness(proxy),null);assert.equal(f.p.readFailureWitness(getter),null);assert.equal(f.p.readFailureWitness(),null);assert.equal(f.p.readFailureWitness(error,proxy),null);assert.equal(f.p.diagnosticRetainedBytes(proxy),null);assert.equal(hooks,0);assert.equal(f.p.diagnosticRetainedBytes(),320);
 const dto=f.p.readFailureWitness(error);assert.throws(()=>{dto.role='worker';},TypeError);assert.equal(JSON.stringify(dto).includes('ctx'),false);
});

test('optional fields, falsey closing and lifecycle mutations retain baseline behavior',()=>{
 for(const closing of [undefined,null,false,0,'',NaN])differential([f=>f.change({...f.a,attached:false},closing),f=>f.census()]);
 differential([f=>f.p.worker(f.payload(info('worker','service_worker',WORKER,{browserContextId:undefined}))) ]);
 differential([f=>{const w={...f.w};delete w.browserContextId;return f.p.worker(f.payload(w));},f=>{const w={...f.w};delete w.browserContextId;return f.census([f.a,f.root,f.aim,w],'post-load',WORKER);}]);
 differential([f=>f.change({...f.a,attached:false},true),f=>f.change(f.a,true),f=>f.change({...f.a,attached:false},true)]);
 differential([f=>f.p.worker(f.payload(f.w)),f=>f.change({...f.w,attached:true,parentId:'p',openerId:'o'}),f=>f.census([f.a,f.root,f.aim,f.w],'post-load',WORKER)]);
});

test('best-effort witness projection cannot replace original error',()=>{
 const f=fixture(diagnostic),freeze=Object.freeze;let error;
 try{Object.freeze=value=>{if(value?.schema==='native-infrastructure-identity-witness/v1')throw Error('projection');return freeze(value);};error=outcome(()=>f.create(f.a)).error;}finally{Object.freeze=freeze;}
 assert.equal(Object.getPrototypeOf(error),StartupFatal.prototype);assert.equal(error.code,'infrastructure-identity');assert.equal(f.p.readFailureWitness(error),null);assert.equal(f.census().targets,3);
});

test('pending ORIGINAL discovery interleavings are differential without native actions',async()=>{
 for(const mode of ['changed-before-created','created-changed-census','duplicate-before-resolve','changed-after-resolve','census-before-resolve']){
  const run=async factory=>{
   const f=fixture(factory,{created:false});let resolve;const original=new Promise(r=>{resolve=r;});let settled=false;original.then(()=>{settled=true;});const errors=[];
   const event=action=>{const r=outcome(action);if(!r.ok)errors.push(r.error);};
   if(mode==='changed-before-created')event(()=>f.change(f.a));
   for(const t of [f.a,f.root,f.aim])event(()=>f.create(t));
   if(mode==='created-changed-census')event(()=>f.change({...f.root,attached:true}));
   if(mode==='duplicate-before-resolve')event(()=>f.create(f.a));
   if(mode==='census-before-resolve')event(()=>f.census());
   assert.equal(settled,false);resolve({});await original;assert.equal(settled,true);
   if(mode==='changed-after-resolve')event(()=>f.change({...f.aim,url:ROOT}));
   const census=outcome(()=>f.census());const dto=errors.length&&f.p.readFailureWitness?f.p.readFailureWitness(errors[0]):null;f.p.release();return {codes:errors.map(e=>e.code),census,dto};
  };
  const a=await run(baseline),b=await run(diagnostic);assert.deepEqual(a.codes,b.codes);equivalent(a.census,b.census);
  if(mode==='changed-before-created'||mode==='census-before-resolve')assert.equal(b.dto,null);else assert.ok(b.dto);
 }
});
