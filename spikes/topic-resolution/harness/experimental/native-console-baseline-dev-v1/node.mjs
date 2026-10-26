// ADR155 builtins-only child; default inert. No browser/model/client imports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,lstat,realpath,open,link} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
export const OWN='spikes/topic-resolution/harness/experimental/native-console-baseline-dev-v1/';
export const OLD='spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/';
export const OLD_FREEZE_SHA='2e78d5d1d3bf9f72eb799f6f3f6fbffd38c63caf628020abc6904f6038b25028';
export const OLD_NODE_SHA='f485ea2b30bd1cf704d75dc657edc35e4bdecdb7beed89c09e39939353503ac4';
export const ADDITIONS=Object.freeze(['baseline.py','run.py','node.mjs','test.mjs','README.md'].map(x=>OWN+x).concat('decisions/ADR-155-exact-owned-console-baseline-and-normal-drain.md'));
const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../../../../..'),OUTPUT=resolve(HERE,'output');
export const sha=x=>createHash('sha256').update(x).digest('hex');
const wire=x=>Buffer.from(JSON.stringify(x)),digest=x=>sha(wire(x));
export function strict(bytes){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=JSON.parse(text);
 // Canonical program JSON only: duplicates, whitespace and nonfinite/number aliases fail.
 assert.equal(JSON.stringify(value),text);return value;
}
function exact(v,keys){assert.ok(v&&typeof v==='object'&&!Array.isArray(v));assert.deepEqual(Object.keys(v),keys);return v;}
function hash(v){assert.match(v,/^[a-f0-9]{64}$/u);return v;}
function creation(v){assert.ok(typeof v==='string'&&/^[1-9][0-9]{0,19}$/u.test(v)&&BigInt(v)<(1n<<64n));}
async function checked(path,max=4194304){
 const rel=relative(REPO,path);assert.ok(rel&&!rel.startsWith('..')&&!rel.includes(':'));let at=REPO;
 for(const p of rel.split(sep)){at=resolve(at,p);const s=await lstat(at);assert.ok(!s.isSymbolicLink()&&(await realpath(at)).toLowerCase()===at.toLowerCase());}
 const before=await lstat(path);assert.ok(before.isFile()&&before.size>0&&before.size<=max);const bytes=await readFile(path),after=await lstat(path);
 assert.equal(bytes.length,before.size);assert.deepEqual([after.size,after.mtimeMs,after.ctimeMs],[before.size,before.mtimeMs,before.ctimeMs]);return bytes;
}
export async function authenticateInventory({read=checked,importer=u=>import(u),pins={freeze:OLD_FREEZE_SHA,node:OLD_NODE_SHA}}={}){
 const bytes=await read(resolve(REPO,OLD+'freeze.json'),65536);assert.equal(sha(bytes),pins.freeze);
 const metadata=strict(bytes),code=await read(resolve(REPO,OLD+'node.mjs'));
 assert.equal(metadata.sourceHashes?.[OLD+'node.mjs'],pins.node);assert.equal(sha(code),pins.node);
 const module=await importer(pathToFileURL(resolve(REPO,OLD+'node.mjs')).href);
 return {module,metadata,bytes};
}
export async function inspectNewSources(auth,{read=checked}={}){
 const result=await auth.module.inspectBootstrapSources(),sources=result.sourceHashes;
 assert.equal(Object.keys(sources).length,201);assert.deepEqual(sources,auth.metadata.sourceHashes);assert.deepEqual(Object.keys(sources),Object.keys(auth.metadata.sourceHashes));
 const out={...sources};for(const key of ADDITIONS)out[key]=sha(await read(resolve(REPO,key)));
 out[OLD+'freeze.json']=sha(auth.bytes);assert.equal(Object.keys(out).length,208);
 assert.deepEqual(await read(resolve(REPO,OLD+'freeze.json'),65536),auth.bytes);return out;
}
export function validateAck(ack,start,readySha){
 exact(ack,['schema','readySha256','freezeSha256','sourceHashesHash','originalNodePid','originalNodeCreationFiletime','baseline','baselineHash']);
 assert.equal(ack.schema,'native-console-ack/v1');assert.equal(ack.readySha256,readySha);
 for(const k of ['freezeSha256','sourceHashesHash','originalNodePid','originalNodeCreationFiletime'])assert.equal(ack[k],start[k]);
 const b=exact(ack.baseline,['schema','node','console','baselineHash']);assert.equal(b.schema,'native-console-baseline/v1');
 const encoding='win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1';
 function identity(v,path){exact(v,['pid','creationFiletime','imagePathSha256','imagePathHashEncoding']);assert.ok(Number.isSafeInteger(v.pid)&&v.pid>0&&v.pid<=0xffffffff);creation(v.creationFiletime);assert.equal(v.imagePathHashEncoding,encoding);assert.equal(v.imagePathSha256,sha(encoding+'\0'+path));}
 identity(b.node,'c:\\program files\\nodejs\\node.exe');assert.equal(b.node.pid,start.originalNodePid);assert.equal(b.node.creationFiletime,start.originalNodeCreationFiletime);
 if(b.console!==null){identity(b.console,'c:\\windows\\system32\\conhost.exe');assert.notEqual(b.console.pid,b.node.pid);}
 assert.equal(b.baselineHash,digest({schema:b.schema,node:b.node,console:b.console}));assert.equal(ack.baselineHash,b.baselineHash);return ack;
}
async function publish(name,value){
 const bytes=wire(value);assert.ok(bytes.length<=65536);const pending=resolve(OUTPUT,name+'.pending'),final=resolve(OUTPUT,name+'.json');
 const fd=await open(pending,'wx');try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}
 await link(pending,final);return sha(bytes);
}
async function bootstrap(){
 assert.equal(process.platform,'win32');assert.equal(process.env.MURMINGLE_NATIVE_CONSOLE_BASELINE_DEV_V1_SUPERVISED,'1');
 const timer=setTimeout(()=>{process.stderr.write('Child deadline.\n');process.exit(1);},25000);
 try{
  let input='';for await(const chunk of process.stdin){input+=chunk;assert.ok(Buffer.byteLength(input)<=4096);}
  const lines=input.split('\n');assert.equal(lines.length,3);assert.equal(lines[0],'NATIVE_CONSOLE_BASELINE_DEV_JOB_ASSIGNED_V1');assert.equal(lines[2],'');
  const start=exact(strict(Buffer.from(lines[1])),['schema','freezeSha256','sourceHashesHash','originalNodePid','originalNodeCreationFiletime']);
  assert.equal(start.schema,'native-console-start/v1');hash(start.freezeSha256);hash(start.sourceHashesHash);assert.equal(start.originalNodePid,process.pid);creation(start.originalNodeCreationFiletime);
  const auth=await authenticateInventory(),sources=await inspectNewSources(auth),freezeBytes=await checked(resolve(HERE,'freeze.json'),65536),f=strict(freezeBytes);
  exact(f,['schema','sourceHashes','oldFreezeSha256','freezeHash']);assert.equal(f.schema,'native-console-baseline-dev-freeze/v1');assert.deepEqual(f.sourceHashes,sources);assert.deepEqual(Object.keys(f.sourceHashes),Object.keys(sources));assert.equal(f.oldFreezeSha256,OLD_FREEZE_SHA);assert.equal(f.freezeHash,digest({schema:f.schema,sourceHashes:sources,oldFreezeSha256:f.oldFreezeSha256}));
  assert.equal(sha(freezeBytes),start.freezeSha256);assert.equal(digest(sources),start.sourceHashesHash);
  const ready={schema:'native-console-ready/v1',freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,originalNodePid:process.pid,originalNodeCreationFiletime:start.originalNodeCreationFiletime,baselineHash:'pending'};
  const readySha=await publish('ready',ready),until=performance.now()+5000;let ackBytes;
  while(!ackBytes){
   assert.ok(performance.now()<until);
   try{ackBytes=await checked(resolve(OUTPUT,'ack.json'),65536);assert.ok(performance.now()<until);}
   catch(e){if(e.code!=='ENOENT')throw e;assert.ok(performance.now()<until);await pause(25);}
  }
  const ack=validateAck(strict(ackBytes),start,readySha);
  assert.ok(performance.now()<until);
  assert.deepEqual(await inspectNewSources(auth),sources);assert.deepEqual(await checked(resolve(HERE,'freeze.json'),65536),freezeBytes);
  await publish('completion',{schema:'native-console-complete/v1',readySha256:readySha,ackSha256:sha(ackBytes),freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,originalNodePid:process.pid,originalNodeCreationFiletime:start.originalNodeCreationFiletime,baselineHash:ack.baselineHash,noBrowserImport:true,noModelCalls:true,noContentRead:true,noCanonicalWrites:true});
 }finally{clearTimeout(timer);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length===2)console.log('Inert. Separate review and run approval required.');
 else if(process.argv.length===3&&process.argv[2]==='--bootstrap')await bootstrap().catch(()=>{console.error('Console child unavailable.');process.exitCode=1;});
 else throw Error('Fixed CLI only');
}
