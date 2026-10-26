// ADR153 builtins-only bootstrap census child. Default inert; no old module import.
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {createHash} from 'node:crypto';
import {readFile,lstat,realpath,readdir} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const OWN='spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/';
export const BASE='spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/';
export const OLD='spikes/topic-resolution/harness/experimental/native-extension-startup-dev-v1/';
export const BASE_FREEZE_SHA256='770eb68ef044dadbb6ef0f2edf2c927b643480e7d06cbf496319b1cab9d457ec';
export const OLD_FREEZE_SHA256='0d470f5315e9c7cd9fe910ccae91ffad67119a5e356d5c21f7bd62bebf9ac021';
export const OLD_ADDITIONS=Object.freeze(['run.mjs','run.test.mjs','protocol.json','README.md','supervise.py','supervise.test.mjs'].map(x=>OLD+x).concat('decisions/ADR-151-native-extension-startup-diagnostic.md'));
export const NEW_ADDITIONS=Object.freeze(['node.mjs','run.py','test.mjs','README.md'].map(x=>OWN+x).concat('decisions/ADR-153-owned-node-bootstrap-process-census.md'));
const DEV='spikes/topic-resolution/harness/experimental/playwright-dev-v1/',PREFIX='node_modules/playwright-core/';
const INTEGRITY='sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==';
const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../../../../..'),PKG=resolve(REPO,DEV,PREFIX);
const sha=x=>createHash('sha256').update(x).digest('hex'),digest=x=>sha(JSON.stringify(x));
function record(v,keys){
 assert.ok(v&&typeof v==='object'&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype);
 assert.deepEqual(Reflect.ownKeys(v),keys);return Object.fromEntries(keys.map(k=>{const d=Object.getOwnPropertyDescriptor(v,k);assert.ok(d?.enumerable&&Object.hasOwn(d,'value'));return [k,d.value];}));
}
function parse(bytes){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
export function parseCodePaths(bytes){
 const matches=[...new TextDecoder('utf-8',{fatal:true}).decode(bytes).matchAll(/export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\);/gu)];
 assert.equal(matches.length,1);const names=JSON.parse(matches[0][1]);assert.ok(Array.isArray(names)&&names.length===72&&new Set(names).size===72);
 assert.deepEqual(names,[...names].sort());for(const s of names)assert.ok(typeof s==='string'&&/^[A-Za-z0-9._/-]{1,240}$/u.test(s)&&!s.startsWith('/')&&!s.split('/').some(p=>['','.','..'].includes(p)));
 for(const s of ['source-paths.js','supervise.py','run.mjs'])assert.ok(names.includes(BASE+s));return names;
}
async function checked(path,max=4194304){
 const rel=relative(REPO,path);assert.ok(rel&&!rel.startsWith('..')&&!rel.includes(':'));let at=REPO;
 for(const part of rel.split(sep)){at=resolve(at,part);const s=await lstat(at);assert.ok(!s.isSymbolicLink()&&(await realpath(at)).toLowerCase()===at.toLowerCase());}
 const before=await lstat(path);assert.ok(before.isFile()&&before.size>0&&before.size<=max);const bytes=await readFile(path),after=await lstat(path);
 assert.equal(bytes.length,before.size);assert.deepEqual([after.size,after.mtimeMs,after.ctimeMs],[before.size,before.mtimeMs,before.ctimeMs]);return bytes;
}
async function packageFiles(){
 const out=[];let total=0;
 async function walk(path,depth=0){assert.ok(depth<=8);const s=await lstat(path);assert.ok(s.isDirectory()&&!s.isSymbolicLink()&&(await realpath(path)).toLowerCase()===path.toLowerCase());
  const children=(await readdir(path)).sort();assert.ok(children.length<=128);
  for(const name of children){const p=resolve(path,name),i=await lstat(p);assert.ok(!i.isSymbolicLink()&&(await realpath(p)).toLowerCase()===p.toLowerCase());
   if(i.isDirectory())await walk(p,depth+1);else {assert.ok(i.isFile()&&i.size>0&&i.size<=4194304);total+=i.size;assert.ok(total<=16777216&&out.length<128);out.push(PREFIX+relative(PKG,p).split(sep).join('/'));}}
 }await walk(PKG);assert.equal(out.length,115);assert.equal(total,13656167);return out;
}
/** Trusted test seams contain invented CODE/metadata only. Actual entry never
 * accepts options, pins or paths from CLI/JSON. No evidence JSON path is followed. */
export async function inspectBootstrapSources({read=checked,listPackage=packageFiles,pins={base:BASE_FREEZE_SHA256,old:OLD_FREEZE_SHA256}}={}){
 // Authenticate the fixed literal's bytes BEFORE interpreting any path inside.
 // Only this fixed metadata path and fixed CODE path precede the pin check.
 const baseBytes=await read(resolve(REPO,BASE+'freeze.json'),65536);assert.equal(sha(baseBytes),pins.base);
 const base=parse(baseBytes);assert.equal(base.schema,'native-reader-root-transfer-freeze/v1');
 const literalPin=base.sourceHashes?.[BASE+'source-paths.js'];assert.match(literalPin,/^[a-f0-9]{64}$/u);
 const literal=await read(resolve(REPO,BASE+'source-paths.js'));assert.equal(sha(literal),literalPin);
 const names=parseCodePaths(literal),packages=await listPackage();
 assert.ok(Array.isArray(packages)&&packages.length===115&&new Set(packages).size===115);
 for(const p of packages)assert.ok(typeof p==='string'&&p.startsWith(PREFIX)&&/^[A-Za-z0-9._/-]{1,256}$/u.test(p)&&!p.split('/').some(x=>['','.','..'].includes(x)));
 const hashes={},buffers={};
 for(const name of [...names,...packages]){const p=name.startsWith(PREFIX)?resolve(PKG,name.slice(PREFIX.length)):resolve(REPO,name);
  const b=name===BASE+'source-paths.js'?literal:await read(p);hashes[name]=sha(b);buffers[name]=b;}
 assert.equal(Object.keys(hashes).length,187);assert.deepEqual(await read(resolve(REPO,BASE+'source-paths.js')),literal);
 const pkg=parse(buffers[PREFIX+'package.json']),lock=parse(buffers[DEV+'package-lock.json']);
 assert.equal(pkg.name,'playwright-core');assert.equal(pkg.version,'1.64.1');assert.equal(lock.packages['node_modules/playwright-core'].integrity,INTEGRITY);
 assert.deepEqual(base.sourceHashes,hashes);assert.deepEqual(Object.keys(base.sourceHashes),Object.keys(hashes));
 for(const name of OLD_ADDITIONS)hashes[name]=sha(await read(resolve(REPO,name)));
 hashes[BASE+'freeze.json']=sha(baseBytes);assert.equal(Object.keys(hashes).length,195);
 const oldBytes=await read(resolve(REPO,OLD+'freeze.json'),65536);assert.equal(sha(oldBytes),pins.old);
 const old=parse(oldBytes);assert.equal(old.schema,'native-extension-startup-dev-freeze/v1');assert.deepEqual(old.sourceHashes,hashes);assert.deepEqual(Object.keys(old.sourceHashes),Object.keys(hashes));
 for(const name of NEW_ADDITIONS)hashes[name]=sha(await read(resolve(REPO,name)));
 hashes[OLD+'freeze.json']=sha(oldBytes);assert.equal(Object.keys(hashes).length,201);
 assert.deepEqual(await read(resolve(REPO,BASE+'freeze.json'),65536),baseBytes);assert.deepEqual(await read(resolve(REPO,OLD+'freeze.json'),65536),oldBytes);
 return {sourceHashes:hashes,sourceHashesHash:digest(hashes)};
}
export function validateBootstrapFreeze(value,sources){
 const f=record(value,['schema','sourceHashes','oldFreezeSha256','baseFreezeSha256','freezeHash']);
 assert.equal(f.schema,'native-bootstrap-process-dev-freeze/v1');assert.equal(f.oldFreezeSha256,OLD_FREEZE_SHA256);assert.equal(f.baseFreezeSha256,BASE_FREEZE_SHA256);
 assert.deepEqual(f.sourceHashes,sources);assert.deepEqual(Object.keys(f.sourceHashes),Object.keys(sources));
 const {freezeHash,...body}=f;assert.equal(digest(body),freezeHash);return f;
}
async function handshake(){
 assert.equal(process.env.MURMINGLE_NATIVE_BOOTSTRAP_PROCESS_DEV_V1_SUPERVISED,'1');
 const expected=Buffer.from('NATIVE_BOOTSTRAP_PROCESS_DEV_JOB_ASSIGNED_V1\n');
 await new Promise((yes,no)=>{let wire=Buffer.alloc(0);const timer=setTimeout(()=>done(Error()),5000);
  const done=e=>{clearTimeout(timer);process.stdin.off('data',onData);process.stdin.off('end',onEnd);process.stdin.pause();e?no(e):yes();};
  const onEnd=()=>done(Error()),onData=chunk=>{if(!Buffer.isBuffer(chunk))return done(Error());wire=Buffer.concat([wire,chunk]);
   if(wire.length>expected.length||!wire.equals(expected.subarray(0,wire.length)))return done(Error());if(wire.length===expected.length)done();};
  process.stdin.on('data',onData);process.stdin.on('end',onEnd);process.stdin.resume();
 });
}
async function main(){
 if(process.argv.length===2){process.stdout.write('No action. Separate freeze and supervisor permission required.\n');return;}
 assert.deepEqual(process.argv.slice(2),['--bootstrap']);await handshake();
 const bytes=await checked(resolve(HERE,'freeze.json'),65536),sources=await inspectBootstrapSources(),f=validateBootstrapFreeze(parse(bytes),sources.sourceHashes);
 assert.deepEqual(await checked(resolve(HERE,'freeze.json'),65536),bytes);
 process.stdout.write(JSON.stringify({schema:'native-bootstrap-inventory-complete/v1',status:'complete',freezeHash:f.freezeHash,freezeSha256:sha(bytes),
  sourceHashesHash:sources.sourceHashesHash,inventoryCount:201,oldFreezeSha256:OLD_FREEZE_SHA256,baseFreezeSha256:BASE_FREEZE_SHA256,
  noBrowserImport:true,noModelCalls:true,noContentRead:true,noCanonicalWrites:true})+'\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{process.stderr.write('{"schema":"native-bootstrap-node-failure/v1","reason":"bootstrap-failed"}\n');process.exitCode=1;});
