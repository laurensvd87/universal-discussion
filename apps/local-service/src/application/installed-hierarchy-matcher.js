// Fixed installed numeric artifacts only. No registration, database connection,
// encoder session or classification runs during import or load.
import {createHash} from 'node:crypto';
import {lstat,open} from 'node:fs/promises';
import {types} from 'node:util';
import {compileRootedHierarchyMatcher,describeRootedHierarchyMatcher} from '../domain/hierarchy-rooted-matcher.js';
import {MODEL_ID,MODEL_SHA256,readAssetManifest} from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const ENCODER='76332323c22d9523de1c54e45bbec0ea762b9c259b10775f5ccb4cbad13a9cd3';
const SPECS=Object.freeze({
 'root-model.json':Object.freeze({bytes:143743,sha256:'442ceb797e071f13ea4bc25df701846d2f167a7deb3e60de31711da8bdec7451'}),
 'root-policy.json':Object.freeze({bytes:983,sha256:'309afc18b29695640f4f15d8138d75ad002768f4e0b13d47df902e3d8bb6b546'}),
 'input-definition.json':Object.freeze({bytes:119,sha256:'2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'}),
 'gta-detail.json':Object.freeze({bytes:16394,sha256:'0233a7b624b646c2060495935f53bee6901e7068cedbda9352bf85945c1b54ea'}),
 'embedding-contract.js':Object.freeze({bytes:4881,sha256:'6b26cc2766acdbcba39259d1459e703995c3b5ae5a6fd4a4c78b7a968d0b3920'}),
 'encoder-manifest.json':Object.freeze({bytes:1716,sha256:'5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984'}),
});
const ROOT=new URL('../../assets/hierarchy/',import.meta.url);
const FILES=Object.freeze(Object.fromEntries(Object.keys(SPECS).map(name=>[name,name==='embedding-contract.js'
 ?new URL('../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js',import.meta.url)
 :name==='encoder-manifest.json'?new URL('../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json',import.meta.url):new URL(name,ROOT)])));
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const unavailable=()=>new Error('Installed hierarchy matcher unavailable');
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
function regular(info,size){return info.isFile()&&!info.isSymbolicLink()&&Number.isSafeInteger(info.size)&&info.size===size;}

// Exact bounded descriptor reads; final-leaf replacement/resize is refused.
// This is sampled file integrity, not an atomic filesystem sandbox.
async function readFixedFile(name){
 const url=FILES[name],spec=SPECS[name];if(!url||!spec)throw unavailable();
 const before=await lstat(url);if(!regular(before,spec.bytes))throw unavailable();
 const handle=await open(url,'r');let raw;
 try{
  const opened=await handle.stat();if(!regular(opened,spec.bytes)||!same(before,opened))throw unavailable();
  raw=Buffer.alloc(spec.bytes+1);let offset=0;
  while(offset<raw.length){const {bytesRead}=await handle.read(raw,offset,raw.length-offset,offset);if(bytesRead===0)break;offset+=bytesRead;}
  const after=await handle.stat(),named=await lstat(url);
  if(offset!==spec.bytes||!regular(after,spec.bytes)||!regular(named,spec.bytes)||!same(opened,after)||!same(after,named))throw unavailable();
  return raw.subarray(0,spec.bytes);
 }catch(error){raw?.fill(0);throw error;}finally{await handle.close();}
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function loader(read){
 let complete=null,pending=null;
 async function build(){
  const values={};
  for(const [name,spec] of Object.entries(SPECS)){
   const returned=read(name);if(types.isProxy(returned))throw unavailable();
   const raw=await returned;
   if(types.isProxy(raw)||!Buffer.isBuffer(raw))throw unavailable();
   try{
    if(raw.length!==spec.bytes||sha(raw)!==spec.sha256)throw unavailable();
    // The contract is verified as source bytes, never evaluated here.
    if(name!=='embedding-contract.js')values[name]=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
   }finally{raw.fill(0);}
  }
  const manifest=values['encoder-manifest.json'];readAssetManifest(manifest);
  const encoderHash=sha(JSON.stringify({modelSha256:MODEL_SHA256,embeddingContractSha256:SPECS['embedding-contract.js'].sha256,assetManifestSha256:SPECS['encoder-manifest.json'].sha256}));
  const inputDefinition=values['input-definition.json'];
  if(encoderHash!==ENCODER||inputDefinition.encoderHash!==encoderHash||manifest.modelId!==MODEL_ID)throw unavailable();
  const rootModel=values['root-model.json'],detail=values['gta-detail.json'];
  const nodes=[...rootModel.nodes.map(node=>({id:node.id,parentId:node.parentId})),{id:'video-games',parentId:'games'},{id:'gta',parentId:'video-games'}];
  const matcher=compileRootedHierarchyMatcher({rootModel,rootPolicy:values['root-policy.json'],inputDefinition,nodes,detailArtifacts:[detail]});
  const identity=describeRootedHierarchyMatcher(matcher);
  if(identity.nodes.length!==18||identity.roots.length!==16||identity.detailArtifacts.length!==1||identity.detailArtifacts[0].nodeId!=='gta'||
      !identity.detailArtifacts[0].eligible||JSON.stringify(identity.detailArtifacts[0].canonicalPath)!==JSON.stringify(['games','video-games','gta'])||
      identity.nativeObservation!==false||identity.productionValidated!==false||identity.assignmentAuthority!==false)throw unavailable();
  const descriptor=freeze({schema:'installed-hierarchy-matcher/v1',matcherIdentityHash:sha(JSON.stringify(identity)),matcherIdentity:identity,
   assets:SPECS,encoder:{modelId:MODEL_ID,encoderHash,manifestAndContractVerified:true,encoderAssetBytesVerified:false,
    requiredRuntime:'fixed-createPackagedCrawlerEmbedder-before-claims'},
   nativeObservation:false,productionValidated:false,assignmentAuthority:false});
  return Object.freeze({matcher,descriptor});
 }
 return Object.freeze(async function load(){
  if(arguments.length!==0)throw new TypeError('Installed matcher accepts no selectors');
  if(complete)return complete;
  if(!pending)pending=build().then(result=>{complete=result;return result;}).catch(()=>{throw unavailable();}).finally(()=>{pending=null;});
  return pending;
 });
}
const installed=loader(readFixedFile);
export async function loadInstalledHierarchyMatcher(){
 if(arguments.length!==0)throw new TypeError('Installed matcher accepts no selectors');
 return installed();
}
// Trusted byte-reader seam for pure failure/coalescing tests. It cannot change
// names, pins, topology or compiler; it grants no database/encoder authority.
export function createInstalledHierarchyMatcherLoaderForTest({readFixedFile:read}={}){
 if(arguments.length!==1||typeof read!=='function')throw new TypeError('Invalid installed matcher test reader');
 return loader(read);
}
