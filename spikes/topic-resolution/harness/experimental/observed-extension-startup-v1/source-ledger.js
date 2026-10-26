// ADR162 fixed CODE/package inventory only. No artifact/preparation/native actions.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,lstat,realpath,readdir} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
export const OWN='spikes/topic-resolution/harness/experimental/observed-extension-startup-v1/';
export const BASE='spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/';
export const V151='spikes/topic-resolution/harness/experimental/native-extension-startup-dev-v1/';
export const V158='spikes/topic-resolution/harness/experimental/composed-owned-bootstrap-dev-v1/';
export const V153='spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/';
export const V155='spikes/topic-resolution/harness/experimental/native-console-baseline-dev-v1/';
export const V157='spikes/topic-resolution/harness/experimental/growing-owned-job-census-v1/';
export const ADDITIONS=Object.freeze([BASE+'freeze.json',V151+'run.mjs',V151+'freeze.json',V158+'run.py',V158+'freeze.json',V153+'run.py',V153+'freeze.json',V155+'baseline.py',V155+'freeze.json',V157+'census.py',OWN+'run.mjs',OWN+'supervise.py',OWN+'source-ledger.js',OWN+'observed-variant.mjs',OWN+'test.mjs',OWN+'README.md','decisions/ADR-162-finite-startup-callback-observation.md']);
export const PINS=Object.freeze({base:'770eb68ef044dadbb6ef0f2edf2c927b643480e7d06cbf496319b1cab9d457ec',v151:'0d470f5315e9c7cd9fe910ccae91ffad67119a5e356d5c21f7bd62bebf9ac021',v158:'757989d78e7fabe070b4cfd6c9f87b73ad477d222e421ec1d54804103672bc1a',v153:'2e78d5d1d3bf9f72eb799f6f3f6fbffd38c63caf628020abc6904f6038b25028',v155:'487231c5608b16610e04d0905ea6cd01b84af64004386af66e8c619db517ee43'});
export const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../../../../..');
const DEV='spikes/topic-resolution/harness/experimental/playwright-dev-v1/',PREFIX='node_modules/playwright-core/';
export const PACKAGE_ROOT=resolve(REPO,DEV,PREFIX);
const INTEGRITY='sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==';
export const sha=x=>createHash('sha256').update(x).digest('hex'),digest=x=>sha(JSON.stringify(x));
export function strict(bytes){const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=JSON.parse(text);assert.equal(JSON.stringify(value),text);return value;}
export async function checked(path,max=4194304){
 const rel=relative(REPO,path);assert.ok(rel&&!rel.startsWith('..')&&!rel.includes(':'));let at=REPO;
 for(const part of rel.split(sep)){at=resolve(at,part);const s=await lstat(at);assert.ok(!s.isSymbolicLink()&&(await realpath(at)).toLowerCase()===at.toLowerCase());}
 const before=await lstat(path);assert.ok(before.isFile()&&before.size>0&&before.size<=max);const bytes=await readFile(path),after=await lstat(path);
 assert.equal(bytes.length,before.size);assert.deepEqual([after.size,after.mtimeMs,after.ctimeMs],[before.size,before.mtimeMs,before.ctimeMs]);return bytes;
}
export function parsePaths(bytes){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),matches=[...text.matchAll(/export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\);/gu)];assert.equal(matches.length,1);
 const names=JSON.parse(matches[0][1]);assert.ok(Array.isArray(names)&&names.length===72&&new Set(names).size===72);assert.deepEqual(names,[...names].sort());
 for(const name of names)assert.ok(typeof name==='string'&&/^[A-Za-z0-9._/-]{1,240}$/u.test(name)&&!name.startsWith('/')&&!name.split('/').some(p=>['','.','..'].includes(p)));
 assert.ok(names.includes(BASE+'source-paths.js'));return names;
}
async function packageFiles(){
 const out=[];let total=0;
 async function walk(path,depth=0){const s=await lstat(path);assert.ok(depth<=8&&s.isDirectory()&&!s.isSymbolicLink()&&(await realpath(path)).toLowerCase()===path.toLowerCase());const children=(await readdir(path)).sort();assert.ok(children.length<=128);
  for(const name of children){const p=resolve(path,name),s=await lstat(p);assert.ok(!s.isSymbolicLink()&&(await realpath(p)).toLowerCase()===p.toLowerCase());
   if(s.isDirectory())await walk(p,depth+1);else{assert.ok(s.isFile()&&s.size>0&&s.size<=4194304);total+=s.size;assert.ok(total<=16777216&&out.length<128);out.push(PREFIX+relative(PACKAGE_ROOT,p).split(sep).join('/'));}}
 }await walk(PACKAGE_ROOT);assert.equal(out.length,115);assert.equal(total,13656167);return out;
}
export function authenticate(buffers,pins=PINS){
 const fixed=[[BASE,pins.base],[V151,pins.v151],[V158,pins.v158],[V153,pins.v153],[V155,pins.v155]],metadata={};
 for(const [prefix,pin] of fixed){const b=buffers[prefix+'freeze.json'];assert.equal(sha(b),pin);metadata[prefix]=strict(b);}
 for(const [prefix,name] of [[V151,'run.mjs'],[V158,'run.py'],[V153,'run.py'],[V155,'baseline.py']])assert.equal(sha(buffers[prefix+name]),metadata[prefix].sourceHashes[prefix+name]);
 assert.equal(sha(buffers[V158+'run.py']),'f79957e5acfb7bc856d051015fe4db5ec9cd7dd74951799cbb95c43612cd02d4');
 assert.equal(sha(buffers[V153+'run.py']),'5865e5bbf769549ca5cd2e58f635b7cfee1e94d264fc4a82fd59ec42f66d0e27');
 assert.equal(sha(buffers[V155+'baseline.py']),'03cc1268b8772a8ae2b46c6af24de3fdad74b6abcb459825c7f9d5ec4be73527');
 assert.equal(sha(buffers[V157+'census.py']),metadata[V158].sourceHashes[V157+'census.py']);return metadata;
}
export async function inspectSources({read=checked,listPackage=packageFiles,basePin=PINS.base,authenticateSources=authenticate}={}){
 const baseBytes=await read(resolve(REPO,BASE+'freeze.json'),65536);assert.equal(sha(baseBytes),basePin);const base=strict(baseBytes);
 const literal=await read(resolve(REPO,BASE+'source-paths.js'));assert.equal(sha(literal),base.sourceHashes[BASE+'source-paths.js']);
 const names=parsePaths(literal),packages=await listPackage();assert.ok(Array.isArray(packages)&&packages.length===115&&new Set(packages).size===115);
 for(const name of packages)assert.ok(typeof name==='string'&&name.startsWith(PREFIX)&&/^[A-Za-z0-9._/-]{1,256}$/u.test(name)&&!name.split('/').some(p=>['','.','..'].includes(p)));
 const sourceHashes={},buffers={};
 for(const key of [...names,...packages]){const bytes=key===BASE+'source-paths.js'?literal:await read(key.startsWith(PREFIX)?resolve(PACKAGE_ROOT,key.slice(PREFIX.length)):resolve(REPO,key));buffers[key]=bytes;sourceHashes[key]=sha(bytes);}
 assert.equal(Object.keys(sourceHashes).length,187);assert.deepEqual(sourceHashes,base.sourceHashes);assert.deepEqual(Object.keys(sourceHashes),Object.keys(base.sourceHashes));
 const parsePinned=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
 const pkg=parsePinned(buffers[PREFIX+'package.json']),lock=parsePinned(buffers[DEV+'package-lock.json']);assert.equal(pkg.name,'playwright-core');assert.equal(pkg.version,'1.64.1');assert.equal(lock.packages[PREFIX.slice(0,-1)].integrity,INTEGRITY);
 for(const key of ADDITIONS){buffers[key]=key===BASE+'freeze.json'?baseBytes:await read(resolve(REPO,key),key.endsWith('freeze.json')?65536:4194304);sourceHashes[key]=sha(buffers[key]);}
 assert.equal(Object.keys(sourceHashes).length,204);authenticateSources(buffers);
 assert.deepEqual(await read(resolve(REPO,BASE+'source-paths.js')),literal);assert.deepEqual(await read(resolve(REPO,BASE+'freeze.json'),65536),baseBytes);
 return {sourceHashes,buffers};
}
export function validateFreeze(value,sources){assert.deepEqual(Object.keys(value),['schema','sourceHashes','freezeHash']);assert.equal(value.schema,'baselined-extension-startup-freeze/v1');assert.deepEqual(value.sourceHashes,sources);assert.deepEqual(Object.keys(value.sourceHashes),Object.keys(sources));assert.equal(value.freezeHash,digest({schema:value.schema,sourceHashes:sources}));return value;}


