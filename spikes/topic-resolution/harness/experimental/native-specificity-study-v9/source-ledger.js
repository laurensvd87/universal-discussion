// Pure supplied-capability inventory. No filesystem, package loading or default IO.
import {types} from 'node:util';
import {record,dense,dataCopy,freeze,digest,sha,hash,requireTrue,refuse} from './manifest.js';
import {createSpecificityPanel} from '../../../../../apps/local-service/experiments/topic-encoder/native-specificity-panel-v1/panel.js';
import {buildSpecificityManifest} from './manifest.js';
import {buildSpecificityProducerProfile,CONSTRUCTION_SOURCE_KEYS} from './producer-profile.js';
import {createSpecificityArtifactReuse,OLD_FIT_BYTE_CAPS} from './artifact-reuse.js';
import {MODEL_SHA256,readAssetManifest} from '../../../browser/embedding/embedding-contract.js';

export const SOURCE_LEDGER_LIMITS=freeze({codeFiles:128,codeFileBytes:4194304,codeBytes:33554432,
 packageFiles:115,packageBytes:16777216,sourceKeys:256,metadataBytes:262144,metadataTotalBytes:1048576,
 artifactBytes:802816,assetManifestBytes:16384,baselineBytes:65536,lockfileBytes:262144,contextBytes:2097152});
const L=SOURCE_LEDGER_LIMITS,META=['candidates','curation','trainCalReview','testReview','finalReview'],ART=Object.keys(OLD_FIT_BYTE_CAPS);
const KINDS=['code','metadata','artifact','asset-manifest','package-baseline','lockfile'];
const ASSETS=['model.onnx','tokenizer.json','tokenizer_config.json','config.json','special_tokens_map.json',
 'tokenizers.mjs','ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'];
const INTEGRITY='sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==';
const NativePromise=Promise,nativeThen=Promise.prototype.then;
const byteLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length').get;
const setBytes=Uint8Array.prototype.set;
const copy=v=>dataCopy(v,{values:200000,units:2097152,depth:24,array:1024,properties:256,string:1048576});
function key(v){requireTrue(typeof v==='string'&&v.length>0&&v.length<=512&&v.isWellFormed()&&!/[\u0000-\u0020\u007f-\u009f]/u.test(v)&&!['__proto__','constructor','prototype'].includes(v));return v;}
function path(v){key(v);requireTrue(v.length<=512&&/^[A-Za-z0-9._/-]+$/u.test(v)&&!v.startsWith('/')&&v.split('/').every(s=>s&&s!=='.'&&s!=='..'),'path');return v;}
function integer(v,max){requireTrue(Number.isSafeInteger(v)&&v>0&&!Object.is(v,-0)&&v<=max,'capacity');return v;}
function bytes(v,max){requireTrue(v!==null&&typeof v==='object'&&!types.isProxy(v)&&Buffer.isBuffer(v)&&Object.getPrototypeOf(v)===Buffer.prototype,'bytes');
 const n=Reflect.apply(byteLength,v,[]);integer(n,max);const out=Buffer.alloc(n);Reflect.apply(setBytes,out,[v]);return out;}
function safePromise(v){if(types.isProxy(v)||!types.isPromise(v)||Object.getPrototypeOf(v)!==NativePromise.prototype)return false;
 return Reflect.ownKeys(v).every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return k!=='constructor'&&k!=='then'&&d&&Object.hasOwn(d,'value');});}
function frozenInput(v){if(v===null||typeof v!=='object')return;requireTrue(!types.isProxy(v)&&Object.isFrozen(v),'catalog');
 for(const k of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,k);requireTrue(d&&Object.hasOwn(d,'value'),'catalog');frozenInput(d.value);}}
function hashMap(v,max=128){const out=copy(v);requireTrue(out&&typeof out==='object'&&!Array.isArray(out));const keys=Object.keys(out);requireTrue(keys.length>0&&keys.length<=max);for(const k of keys){key(k);hash(out[k]);}return out;}
function equal(a,b){return digest(a)===digest(b);}
function parse(b){const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));return copy(value);}

/** Trusted catalog is a reviewed CODE literal, independently pinned outside it.
 * Invented catalogs prove only these pure contracts, never actual provenance. */
export function createSpecificitySourceLedger(input){
 const a=record(input,['catalog','expectedCatalogHash','expectedSourceHashes','readEntry','walkPackage','guard']);hash(a.expectedCatalogHash);
 for(const f of [a.readEntry,a.walkPackage,a.guard])requireTrue(typeof f==='function'&&!types.isProxy(f));
 // Descriptor-safe bounded copy before recursion or hashing; no callback yet.
 const c=copy(a.catalog);frozenInput(a.catalog);requireTrue(Buffer.byteLength(JSON.stringify(c))<=131072,'catalog');
 requireTrue(digest(c)===a.expectedCatalogHash,'catalog-auth');
 record(c,['schema','entries','metadata','artifacts','assetManifestKey','package','producerSourceAliases','oldSourceAliases','protocolSourceKey','embeddingContractSourceKey','bindings']);
 requireTrue(c.schema==='native-specificity-source-catalog/v1');
 const specs=dense(c.entries,144),entries=new Map(),paths=new Set(),code=[];
 for(const raw of specs){const s=record(raw,['key','path','kind','maximumBytes','sha256']);key(s.key);path(s.path);requireTrue(KINDS.includes(s.kind)&&!entries.has(s.key)&&!paths.has(s.path),'catalog');
  integer(s.maximumBytes,L.codeFileBytes);if(s.kind==='code'){requireTrue(s.sha256===null);code.push(s.key);}else if(s.kind!=='asset-manifest'||s.sha256!==null)hash(s.sha256);
  entries.set(s.key,freeze(s));paths.add(s.path);}
 requireTrue(code.length>0&&code.length<=L.codeFiles);const expected=hashMap(a.expectedSourceHashes);
 requireTrue(equal(Object.keys(expected).sort(),[...code].sort()),'source-keyset');
 const used=new Set(code);
 function slot(k,kind,cap){key(k);const s=entries.get(k);requireTrue(s!==undefined&&s.kind===kind&&!used.has(k)&&s.maximumBytes<=cap,'catalog');used.add(k);return s;}
 const metadata=record(c.metadata,META),artifacts=record(c.artifacts,ART);
 for(const k of META)slot(metadata[k],'metadata',L.metadataBytes);
 for(const k of ART)slot(artifacts[k],'artifact',OLD_FIT_BYTE_CAPS[k]);
 slot(c.assetManifestKey,'asset-manifest',L.assetManifestBytes);
 const pkg=record(c.package,['rootKey','prefix','baselineKey','lockfileKey','version','integrity','files','bytes']);path(pkg.rootKey);
 requireTrue(pkg.prefix==='node_modules/playwright-core/'&&pkg.version==='1.64.1'&&pkg.integrity===INTEGRITY&&pkg.files===115,'package');integer(pkg.bytes,L.packageBytes);
 slot(pkg.baselineKey,'package-baseline',L.baselineBytes);
 if(code.includes(pkg.lockfileKey))requireTrue(entries.get(pkg.lockfileKey).kind==='code');else slot(pkg.lockfileKey,'lockfile',L.lockfileBytes);
 requireTrue(used.size===entries.size&&code.length+pkg.files<=L.sourceKeys&&!code.some(k=>k.startsWith(pkg.prefix)),'catalog');
 function aliases(v,exact){const map=copy(v);requireTrue(map&&typeof map==='object'&&!Array.isArray(map));const keys=Object.keys(map);requireTrue(keys.length>0&&keys.length<=128);
  if(exact)requireTrue(equal(keys.sort(),[...exact].sort()),'alias');for(const k of keys){key(k);requireTrue(typeof map[k]==='string'&&code.includes(map[k]),'alias');}return map;}
 const producerAliases=aliases(c.producerSourceAliases,CONSTRUCTION_SOURCE_KEYS),oldAliases=aliases(c.oldSourceAliases);
 requireTrue(code.includes(c.protocolSourceKey)&&code.includes(c.embeddingContractSourceKey),'alias');
 record(c.bindings,['panelIdentity','encoderHash']);hash(c.bindings.panelIdentity);hash(c.bindings.encoderHash);freeze(c);
 let state='ready',hasFault=false,fault=null,unsafeOperationRefused=false,context=null;
 const pending=new Set();
 function poison(){if(!hasFault){hasFault=true;fault=new Error('Specificity source ledger refused');}state='failed';return fault;}
 function track(original){if(!safePromise(original)){unsafeOperationRefused=true;refuse('unsafe-promise');}pending.add(original);
  return new NativePromise((resolve,reject)=>nativeThen.call(original,v=>{pending.delete(original);resolve({value:v});},e=>{pending.delete(original);reject(e);}));}
 function check(){try{if(hasFault)throw fault;const value=a.guard();if(types.isProxy(value)){unsafeOperationRefused=true;refuse('unsafe-promise');}
   if(types.isPromise(value)){const observed=track(value);nativeThen.call(observed,()=>undefined,()=>undefined);refuse('async-guard');}
   requireTrue(value===undefined||value===true,'guard');if(hasFault)throw fault;
  }catch{throw poison();}}
 async function operation(action){check();const original=action();if(types.isProxy(original)){unsafeOperationRefused=true;refuse('unsafe-promise');}
  const result=types.isPromise(original)?await track(original):{value:original};check();return result;}
 const sourceAliases=(map,sourceHashes)=>Object.fromEntries(Object.entries(map).map(([alias,k])=>[alias,sourceHashes[k]]));
 async function collect(){
  check();const buffers=new Map(),entryHashes={},sourceHashes={};let codeBytes=0,metadataBytes=0,artifactBytes=0;
  for(const s of entries.values()){
   const remaining=s.kind==='code'?L.codeBytes-codeBytes:s.kind==='metadata'?L.metadataTotalBytes-metadataBytes:s.kind==='artifact'?L.artifactBytes-artifactBytes:s.maximumBytes;
   const b=bytes((await operation(()=>a.readEntry(s))).value,Math.min(s.maximumBytes,remaining)),actual=sha(b);
   if(s.kind!=='asset-manifest'||s.sha256!==null)requireTrue(actual===(s.kind==='code'?expected[s.key]:s.sha256),'file-auth');buffers.set(s.key,b);entryHashes[s.key]=actual;
   if(s.kind==='code'){sourceHashes[s.key]=actual;codeBytes+=b.length;requireTrue(codeBytes<=L.codeBytes,'capacity');}
   if(s.kind==='metadata'){metadataBytes+=b.length;requireTrue(metadataBytes<=L.metadataTotalBytes,'capacity');}
   if(s.kind==='artifact'){artifactBytes+=b.length;requireTrue(artifactBytes<=L.artifactBytes,'capacity');}check();
  }
  const raw=(await operation(()=>a.walkPackage(pkg.rootKey))).value,files=dense(raw,L.packageFiles),packageHashes={},packageBuffers=new Map();let packageBytes=0;
  requireTrue(files.length===pkg.files,'package-layout');
  for(const item of files){check();const r=record(item,['path','bytes']);path(r.path);requireTrue(r.path.startsWith(pkg.prefix)&&r.path.length>pkg.prefix.length&&!Object.hasOwn(packageHashes,r.path),'package-layout');
   const b=bytes(r.bytes,Math.min(L.codeFileBytes,L.packageBytes-packageBytes));packageBytes+=b.length;requireTrue(packageBytes<=L.packageBytes,'capacity');packageHashes[r.path]=sha(b);packageBuffers.set(r.path,b);}
  requireTrue(packageBytes===pkg.bytes&&Object.keys(sourceHashes).length+files.length<=L.sourceKeys,'package-bytes');
  const manifestBytes=buffers.get(c.assetManifestKey);
  const encoderHash=digest({modelSha256:MODEL_SHA256,embeddingContractSha256:sourceHashes[c.embeddingContractSourceKey],assetManifestSha256:sha(manifestBytes)});
  requireTrue(encoderHash===c.bindings.encoderHash,'encoder');
  requireTrue(buffers.get(pkg.lockfileKey).length<=L.lockfileBytes,'capacity');
  // ALL consumed FILE/CODE pins (including composite asset pin) precede JSON.
  const baseline=parse(buffers.get(pkg.baselineKey));requireTrue(baseline.schema==='playwright-route-burst-dev-freeze/v1','package-baseline');
  const {freezeHash,...baselineBody}=baseline;hash(freezeHash);requireTrue(digest(baselineBody)===freezeHash,'package-baseline');
  const baseHashes=hashMap(baseline.sourceHashes,256),packageKeys=Object.keys(packageHashes).sort();
  requireTrue(equal(Object.keys(baseHashes).filter(k=>k.startsWith(pkg.prefix)).sort(),packageKeys),'package-layout');
  for(const k of packageKeys)requireTrue(baseHashes[k]===packageHashes[k],'package-auth');
  const packageJson=packageBuffers.get(pkg.prefix+'package.json');requireTrue(packageJson!==undefined,'package-layout');
  const packageData=parse(packageJson),lock=parse(buffers.get(pkg.lockfileKey));
  requireTrue(packageData.name==='playwright-core'&&packageData.version===pkg.version&&lock.packages?.['node_modules/playwright-core']?.integrity===pkg.integrity,'package-version');
  const metaPins=Object.fromEntries(META.map(k=>[k,entries.get(metadata[k]).sha256]));
  const texts=Object.fromEntries(META.map(k=>[k,new TextDecoder('utf-8',{fatal:true}).decode(buffers.get(metadata[k]))]));
  const panel=createSpecificityPanel(metaPins).validate(texts);requireTrue(panel.panelIdentity===c.bindings.panelIdentity,'panel');
  requireTrue(panel.cases.length===168&&panel.cases.filter(r=>r.split==='training').length===48&&panel.cases.filter(r=>r.split==='calibration').length===48&&panel.cases.filter(r=>r.split==='test').length===72,'panel');
  const manifest=buildSpecificityManifest({panel,expectedPanelIdentity:c.bindings.panelIdentity});
  const assetData=readAssetManifest(parse(manifestBytes));
  requireTrue(equal([...assetData.keys()].sort(),[...ASSETS].sort()),'assets');
  const profile=buildSpecificityProducerProfile({panelIdentity:panel.panelIdentity,manifestHash:manifest.manifestHash,encoderHash,sourceHashes:sourceAliases(producerAliases,sourceHashes)});
  const oldSourceHashes=sourceAliases(oldAliases,sourceHashes),expectedOldFileHashes=Object.fromEntries(ART.map(k=>[k,entryHashes[artifacts[k]]])),oldFit={...Object.fromEntries(ART.map(k=>[k,buffers.get(artifacts[k])])),sourceHashes:oldSourceHashes};
  const reuse=createSpecificityArtifactReuse({expectedOldFileHashes,expectedOldSourceHashes:oldSourceHashes}).bind({oldFit,profileSet:profile,expectedRecipeHash:profile.recipeHash,panelIdentity:panel.panelIdentity,manifestHash:manifest.manifestHash,protocolHash:sourceHashes[c.protocolSourceKey]});
  const material={schema:'native-specificity-source-context/v1',catalogHash:a.expectedCatalogHash,sourceHashes:{...sourceHashes,...packageHashes},entryHashes,
   package:{files:files.length,bytes:packageBytes,version:pkg.version,baselineHash:entryHashes[pkg.baselineKey]},metadataHashes:Object.fromEntries(META.map(k=>[k,entryHashes[metadata[k]]])),
   artifactHashes:expectedOldFileHashes,panel,manifest,profile,rootCandidate:reuse.rootCandidate,rootReuse:reuse.receipt,encoderHash,
   assetPins:ASSETS.map(filename=>{const s=assetData.get(filename);return {filename,bytes:s.bytes,sha256:s.sha256};}),
   codeFiles:code.length,codeBytes,actualAssetBytesAuthenticated:false,actualIoAndPreparationRequired:true,productionValidated:false,assignmentAuthority:false};
  const out=copy({...material,contextHash:digest(material)});requireTrue(Buffer.byteLength(JSON.stringify(out))<=L.contextBytes,'capacity');freeze(out);check();requireTrue(pending.size===0&&!unsafeOperationRefused,'unsettled');return out;
 }
 return Object.freeze({
  async inspect(){try{requireTrue(state==='ready','phase');state='inspecting';const value=await collect();check();context=value;state='complete';return value;}catch{throw poison();}},
  async recheck(value){try{requireTrue(state==='complete'&&value===context,'context');state='rechecking';const fresh=await collect();check();requireTrue(fresh.contextHash===context.contextHash,'recheck');state='complete';return true;}catch{throw poison();}},
  snapshot(){return freeze({state,failed:hasFault,pendingOriginals:pending.size,unsafeOperationRefused});}
 });
}
