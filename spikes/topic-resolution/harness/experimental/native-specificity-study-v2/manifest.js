// ADR179 pure metadata contracts. No filesystem, browser, model or runtime IO.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {inspectPageUrl} from '../../../browser/core/page-content-policy.js';

export const RESOURCE_ORIGINS=Object.freeze(['https://cdn.jsdelivr.net','https://cdnjs.cloudflare.com',
 'https://fonts.googleapis.com','https://fonts.gstatic.com','https://unpkg.com']);
export const MANIFEST_LIMITS=Object.freeze({rows:168,batchRows:4,batches:42,bytes:1048576,
 panelBytes:524288,copyValues:100000,depth:24,stringUnits:16384,arrayEntries:1024,properties:128});
export class SpecificityError extends TypeError {
 constructor(code='contract'){super('Specificity study contract refused');this.name='SpecificityError';this.code=code;}
}
export const refuse=(code='contract')=>{throw new SpecificityError(code);};
export const requireTrue=(v,code='contract')=>{if(v!==true)refuse(code);};
export const sha=v=>createHash('sha256').update(v).digest('hex');
export const digest=v=>sha(JSON.stringify(v));
export function record(v,keys){
 requireTrue(v!==null&&typeof v==='object'&&!types.isProxy(v));
 requireTrue(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
 requireTrue(Reflect.ownKeys(v).length===keys.length);const out={};
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(v,key);requireTrue(d!==undefined&&d.enumerable&&Object.hasOwn(d,'value'));
  Object.defineProperty(out,key,{value:d.value,enumerable:true,writable:true,configurable:true});}return out;
}
export function dense(v,max){
 requireTrue(v!==null&&typeof v==='object'&&!types.isProxy(v)&&Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype);
 const n=Object.getOwnPropertyDescriptor(v,'length').value;requireTrue(n<=max&&Reflect.ownKeys(v).length===n+1);
 const out=[];for(let i=0;i<n;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));requireTrue(d!==undefined&&d.enumerable&&Object.hasOwn(d,'value'));out.push(d.value);}return out;
}
export function text(v,max=160,empty=false){requireTrue(typeof v==='string'&&v.length<=max&&v.isWellFormed()&&(empty||v.length>0)&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(v));return v;}
export function identifier(v){text(v);requireTrue(v.trim()===v);return v;}
export function hash(v){requireTrue(typeof v==='string'&&v.length===64&&/^[a-f0-9]{64}$/u.test(v));return v;}
export function integer(v,max=Number.MAX_SAFE_INTEGER){requireTrue(Number.isSafeInteger(v)&&v>=0&&v<=max&&!Object.is(v,-0));return v;}
export function freeze(v){if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
export function dataCopy(v,{values=100000,units=524288,depth=24,array=1024,properties=128,string=16384}={}){
 const budget={values,units};
 function visit(x,d){requireTrue(--budget.values>=0&&d<=depth,'capacity');
  if(x===null||typeof x!=='object'){
   requireTrue(x===null||['string','number','boolean'].includes(typeof x));
   if(typeof x==='number')requireTrue(Number.isFinite(x));
   if(typeof x==='string'){requireTrue(x.length<=string&&x.isWellFormed(),'capacity');budget.units-=x.length;requireTrue(budget.units>=0,'capacity');}return x;
  }
  requireTrue(!types.isProxy(x));if(Array.isArray(x))return dense(x,array).map(y=>visit(y,d+1));
  requireTrue(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
  const keys=Reflect.ownKeys(x);requireTrue(keys.length<=properties,'capacity');const out={};
  for(const k of keys){requireTrue(typeof k==='string'&&k.length<=160);budget.units-=k.length;requireTrue(budget.units>=0,'capacity');
   const desc=Object.getOwnPropertyDescriptor(x,k);requireTrue(desc.enumerable&&Object.hasOwn(desc,'value'));
   Object.defineProperty(out,k,{value:visit(desc.value,d+1),enumerable:true,writable:true,configurable:true});}return out;
 }return visit(v,0);
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sort=a=>[...new Set(a)].sort();
function publicUrl(v){text(v,2048);const p=inspectPageUrl(v);requireTrue(p.supported===true&&p.url===v);const u=new URL(v);requireTrue(u.protocol==='https:'&&!u.username&&!u.password&&!u.hash);return u;}
function identities(rows){
 requireTrue(rows.length===168);const ids=new Set(),groups=new Set(),urls=new Set(),families=new Map(),counts={training:0,calibration:0,test:0},statuses={verified:0,unverified:0};
 for(const r of rows){
  for(const k of ['id','groupId','publisherFamily','nodeId'])identifier(r[k]);publicUrl(r.publicUrl);publicUrl(r.publicSupportUrl);
  requireTrue(typeof r.split==='string'&&Object.hasOwn(counts,r.split)&&['en','de','nl','fr','es'].includes(r.language));
  requireTrue(!ids.has(r.id)&&!groups.has(r.groupId)&&!urls.has(r.publicUrl));ids.add(r.id);groups.add(r.groupId);urls.add(r.publicUrl);
  requireTrue(!families.has(r.publisherFamily)||families.get(r.publisherFamily)===r.split);families.set(r.publisherFamily,r.split);counts[r.split]++;
  requireTrue(typeof r.labelStatus==='string'&&Object.hasOwn(statuses,r.labelStatus));statuses[r.labelStatus]++;
  requireTrue(r.proposedGold!==null&&typeof r.proposedGold==='object');
  if(r.labelStatus==='unverified')requireTrue(r.split==='test'&&['adr159-test-054','adr159-test-083'].includes(r.id)&&r.assessmentGold===null);
  else requireTrue(same(r.proposedGold,r.assessmentGold));
 }
 requireTrue(same(counts,{training:48,calibration:48,test:72})&&families.size===73&&same(statuses,{verified:166,unverified:2}));
}
function scope(panelIdentity,rows,batchId){
 const primaryOrigins=sort(rows.map(r=>new URL(r.url??r.publicUrl).origin)),primaryHosts=sort(primaryOrigins.map(o=>new URL(o).hostname));
 const body={panelIdentity,...(batchId===undefined?{}:{batchId}),primaryHosts,primaryOrigins,cdnOrigins:[...RESOURCE_ORIGINS],
  hosts:sort([...primaryHosts,...RESOURCE_ORIGINS.map(o=>new URL(o).hostname)]),origins:sort([...primaryOrigins,...RESOURCE_ORIGINS])};
 if(batchId!==undefined)requireTrue(body.hosts.length<=9);return freeze({...body,scopeHash:digest(body)});
}
function batches(panelIdentity,rows){const all=[];
 for(const phase of ['train-cal','test']){
  const selected=rows.filter(r=>phase==='test'?r.split==='test':r.split!=='test');
  for(let i=0;i<selected.length;i+=4){const cases=selected.slice(i,i+4).map((r,j)=>({id:r.id,groupId:r.groupId,url:r.publicUrl,language:r.language,split:r.split,globalOrdinal:r.globalOrdinal,nativeOrdinal:j+1}));
   const core={phase,batchIndex:i/4+1,cases};all.push({...core,batchId:digest({schema:'native-specificity-batch-identity/v1',panelIdentity,...core})});}
 }return all;
}
export function buildSpecificityManifest(input){
 const a=record(input,['expectedPanelIdentity','panel']);hash(a.expectedPanelIdentity);
 const panel=dataCopy(a.panel);requireTrue(Buffer.byteLength(JSON.stringify(panel))<=MANIFEST_LIMITS.panelBytes,'capacity');
 const fields=['schema','cases','counts','sourceDigests','taxonomy','assessmentPolicy','limitations','fullyReviewedGoldReady','nativeReady','modelReady','productionValidated','assignmentAuthority','panelIdentity'];
 record(panel,fields);const {panelIdentity,...body}=panel;
 requireTrue(panelIdentity===a.expectedPanelIdentity&&digest(body)===a.expectedPanelIdentity,'panel-identity');
 requireTrue(panel.schema==='hierarchy-native-specificity-panel/v1');
 for(const k of ['fullyReviewedGoldReady','nativeReady','modelReady','productionValidated','assignmentAuthority'])requireTrue(panel[k]===false);
 requireTrue(panel.taxonomy.unionNodeCount===25&&panel.assessmentPolicy.allOriginalRowsAndDenominatorsRetained===true&&panel.assessmentPolicy.unverifiedOrDisputedProposedGoldNeverPassedToAssessor===true);
 const rows=dense(panel.cases,168).map((r,i)=>({...r,globalOrdinal:i+1}));identities(rows);
 const result={schema:'native-specificity-study-manifest/v1',panelIdentity,cases:rows,batches:batches(panelIdentity,rows),networkScope:scope(panelIdentity,rows)};
 requireTrue(Buffer.byteLength(JSON.stringify(result))<=MANIFEST_LIMITS.bytes,'capacity');return freeze({...result,manifestHash:digest(result)});
}
function copiedManifest(value){
 const m=dataCopy(value);record(m,['schema','panelIdentity','cases','batches','networkScope','manifestHash']);hash(m.panelIdentity);hash(m.manifestHash);
 requireTrue(m.schema==='native-specificity-study-manifest/v1');const {manifestHash,...body}=m;
 requireTrue(digest(body)===manifestHash,'manifest-identity');requireTrue(Buffer.byteLength(JSON.stringify(m))<=MANIFEST_LIMITS.bytes,'capacity');
 identities(m.cases);m.cases.forEach((r,i)=>requireTrue(r.globalOrdinal===i+1));
 requireTrue(same(m.batches,batches(m.panelIdentity,m.cases))&&same(m.networkScope,scope(m.panelIdentity,m.cases)),'manifest-identity');return m;
}
/** expectedManifestHash is a separately held owner pin from the authenticated
 * builder/preparation, NEVER the supplied manifest's own hash as authority. */
export function validateSpecificityBatch(input){
 const a=record(input,['manifest','batch','expectedPanelIdentity','expectedManifestHash']);hash(a.expectedPanelIdentity);hash(a.expectedManifestHash);
 const m=copiedManifest(a.manifest);requireTrue(m.panelIdentity===a.expectedPanelIdentity&&m.manifestHash===a.expectedManifestHash,'manifest-identity');
 const b=dataCopy(a.batch);const actual=m.batches.find(x=>x.batchId===b.batchId);requireTrue(actual!==undefined&&same(actual,b),'batch-identity');return freeze(actual);
}
/** Pure derivation, not authentication. Call only with the owner-validated
 * manifest/batch; this helper does not replace validateSpecificityBatch. */
export function deriveBatchNetworkScope(manifest,batch){
 const m=copiedManifest(manifest),b=dataCopy(batch);requireTrue(m.batches.some(x=>same(x,b)),'batch-identity');return scope(m.panelIdentity,b.cases,b.batchId);
}
