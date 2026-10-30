// Closed numeric compatibility registry. No DB, encoder, worker or activation.
import {createHash} from 'node:crypto';
import {lstat,open} from 'node:fs/promises';
import {loadInstalledHierarchyMatcher} from './installed-hierarchy-matcher.js';
import {compileRootedHierarchyMatcher,describeRootedHierarchyMatcher} from '../domain/hierarchy-rooted-matcher.js';
const LEGACY='eead1b2dcd6508ebf3d5c45358c71be95e81363da7c0b8325f7466ce487ed21c';
const CURRENT='4e9b3d3d2053327707d6ff395a8373e6e5ac3195333183ac8516f84195c45524';
const ROOT=new URL('../../assets/hierarchy/',import.meta.url);
const unavailable=()=>Object.assign(Error('Supported hierarchy matcher unavailable'),{code:'unavailable'});
const need=v=>{if(!v)throw unavailable();};
const sha=b=>createHash('sha256').update(b).digest('hex');
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
const regular=(s,n)=>s.isFile()&&!s.isSymbolicLink()&&s.size===n;
function freeze(v){if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
async function fixed(name,spec){
 const file=new URL(name,ROOT),before=await lstat(file);need(regular(before,spec.bytes));let fd,raw;
 try{fd=await open(file,'r');const opened=await fd.stat();need(regular(opened,spec.bytes)&&same(before,opened));
  raw=Buffer.alloc(spec.bytes+1);let offset=0;
  while(offset<raw.length){const r=await fd.read(raw,offset,raw.length-offset,offset);if(!r.bytesRead)break;offset+=r.bytesRead;}
  const after=await fd.stat(),named=await lstat(file);
  need(offset===spec.bytes&&regular(after,spec.bytes)&&regular(named,spec.bytes)&&same(opened,after)&&same(after,named)&&sha(raw.subarray(0,spec.bytes))===spec.sha256);
  return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw.subarray(0,spec.bytes)));
 }finally{raw?.fill(0);await fd?.close();}
}
let complete=null,pending=null;
async function build(){
 const current=await loadInstalledHierarchyMatcher();need(current.descriptor.matcherIdentityHash===CURRENT);
 const values=[];for(const name of ['root-model.json','root-policy.json','input-definition.json','gta-detail.json'])values.push(await fixed(name,current.descriptor.assets[name]));
 const [rootModel,rootPolicy,inputDefinition,gta]=values;
 const matcher=compileRootedHierarchyMatcher({rootModel,rootPolicy,inputDefinition,
  nodes:[...rootModel.nodes.map(({id,parentId})=>({id,parentId})),{id:'video-games',parentId:'games'},{id:'gta',parentId:'video-games'}],detailArtifacts:[gta]});
 const identity=describeRootedHierarchyMatcher(matcher);
 need(identity.nodes.length===18&&identity.roots.length===16&&identity.detailArtifacts.length===1&&sha(JSON.stringify(identity))===LEGACY&&
  identity.representationHash===current.descriptor.matcherIdentity.representationHash&&identity.nativeObservation===false&&identity.assignmentAuthority===false);
 const legacy=Object.freeze({matcher,descriptor:freeze({...current.descriptor,matcherIdentityHash:LEGACY,matcherIdentity:identity})});
 return Object.freeze([current,legacy]);
}
export async function loadSupportedHierarchyMatchers(){
 if(arguments.length!==0)throw unavailable();if(complete)return complete;
 if(!pending)pending=build().then(value=>{complete=value;return value;}).catch(()=>{throw unavailable();}).finally(()=>{pending=null;});
 return pending;
}
export async function loadSupportedHierarchyMatcher(hash){
 need(arguments.length===1&&typeof hash==='string'&&/^[a-f0-9]{64}$/u.test(hash)&&(hash===CURRENT||hash===LEGACY));
 const found=(await loadSupportedHierarchyMatchers()).find(value=>value.descriptor.matcherIdentityHash===hash);need(found);return found;
}
