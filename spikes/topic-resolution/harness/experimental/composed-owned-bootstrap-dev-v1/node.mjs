// ADR158 builtins-only, explicit13 source inventory. Default inert.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,lstat,realpath,open,link} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
export const OWN='spikes/topic-resolution/harness/experimental/composed-owned-bootstrap-dev-v1/';
const OLD153='spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/',OLD155='spikes/topic-resolution/harness/experimental/native-console-baseline-dev-v1/',PART='spikes/topic-resolution/harness/experimental/growing-owned-job-census-v1/';
export const SOURCE_KEYS=Object.freeze([OWN+'run.py',OWN+'node.mjs',OWN+'test.mjs',OWN+'README.md',
 'decisions/ADR-158-composed-minimal-owned-bootstrap-guardian.md',OLD153+'run.py',OLD153+'freeze.json',
 OLD155+'baseline.py',OLD155+'freeze.json',PART+'census.py',PART+'test.mjs',PART+'README.md',
 'decisions/ADR-157-bounded-growing-owned-job-census.md']);
const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../../../../..'),OUTPUT=resolve(HERE,'output');
export const sha=x=>createHash('sha256').update(x).digest('hex');
const wire=x=>Buffer.from(JSON.stringify(x)),digest=x=>sha(wire(x));
export function strict(bytes){const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=JSON.parse(text);assert.equal(JSON.stringify(value),text);return value;}
function exact(v,keys){assert.ok(v&&typeof v==='object'&&!Array.isArray(v));assert.deepEqual(Object.keys(v),keys);return v;}
function creation(v){assert.ok(typeof v==='string'&&/^[1-9][0-9]{0,19}$/u.test(v)&&BigInt(v)<(1n<<64n));}
async function checked(path,max=4194304){
 const rel=relative(REPO,path);assert.ok(rel&&!rel.startsWith('..')&&!rel.includes(':'));let at=REPO;
 for(const part of rel.split(sep)){at=resolve(at,part);const s=await lstat(at);assert.ok(!s.isSymbolicLink()&&(await realpath(at)).toLowerCase()===at.toLowerCase());}
 const before=await lstat(path);assert.ok(before.isFile()&&before.size>0&&before.size<=max);const bytes=await readFile(path),after=await lstat(path);
 assert.equal(bytes.length,before.size);assert.deepEqual([after.size,after.mtimeMs,after.ctimeMs],[before.size,before.mtimeMs,before.ctimeMs]);return bytes;
}
export async function inventory({read=checked}={}){
 const sources={};for(const key of SOURCE_KEYS)sources[key]=sha(await read(resolve(REPO,key),key.endsWith('freeze.json')?65536:4194304));return sources;
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
export async function waitAck({read,until,clock=()=>performance.now(),pause:wait=pause}){
 while(true){
  assert.ok(clock()<until);
  try{const bytes=await read();assert.ok(clock()<until);return bytes;}
  catch(e){if(e.code!=='ENOENT')throw e;assert.ok(clock()<until);await wait(25);}
 }
}
async function publish(name,value){
 const data=wire(value);assert.ok(data.length<=65536);const pending=resolve(OUTPUT,name+'.pending'),final=resolve(OUTPUT,name+'.json');
 const fd=await open(pending,'wx');try{await fd.writeFile(data);await fd.sync();}finally{await fd.close();}
 await link(pending,final);return sha(data);
}
async function bootstrap(){
 assert.equal(process.platform,'win32');assert.equal(process.env.MURMINGLE_COMPOSED_OWNED_BOOTSTRAP_DEV_V1_SUPERVISED,'1');
 const timer=setTimeout(()=>{console.error('Child deadline.');process.exit(1);},25000);
 try{
  let input='';for await(const chunk of process.stdin){input+=chunk;assert.ok(Buffer.byteLength(input)<=4096);}
  const lines=input.split('\n');assert.equal(lines.length,3);assert.equal(lines[0],'COMPOSED_OWNED_BOOTSTRAP_JOB_ASSIGNED_V1');assert.equal(lines[2],'');
  const start=exact(strict(Buffer.from(lines[1])),['schema','freezeSha256','sourceHashesHash','originalNodePid','originalNodeCreationFiletime']);
  assert.equal(start.schema,'native-console-start/v1');for(const k of ['freezeSha256','sourceHashesHash'])assert.match(start[k],/^[a-f0-9]{64}$/u);assert.equal(start.originalNodePid,process.pid);creation(start.originalNodeCreationFiletime);
  const sources=await inventory(),freezeBytes=await checked(resolve(HERE,'freeze.json'),65536),f=strict(freezeBytes);
  exact(f,['schema','sourceHashes','freezeHash']);assert.equal(f.schema,'composed-owned-bootstrap-freeze/v1');assert.deepEqual(f.sourceHashes,sources);assert.deepEqual(Object.keys(f.sourceHashes),SOURCE_KEYS);assert.equal(f.freezeHash,digest({schema:f.schema,sourceHashes:sources}));
  assert.equal(sha(freezeBytes),start.freezeSha256);assert.equal(digest(sources),start.sourceHashesHash);
  const ready={schema:'native-console-ready/v1',freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,originalNodePid:process.pid,originalNodeCreationFiletime:start.originalNodeCreationFiletime,baselineHash:'pending'};
  const readySha=await publish('ready',ready),until=performance.now()+5000;
  const ackBytes=await waitAck({read:()=>checked(resolve(OUTPUT,'ack.json'),65536),until});
  const ack=validateAck(strict(ackBytes),start,readySha);assert.ok(performance.now()<until);
  assert.deepEqual(await inventory(),sources);assert.deepEqual(await checked(resolve(HERE,'freeze.json'),65536),freezeBytes);
  await publish('completion',{schema:'native-console-complete/v1',readySha256:readySha,ackSha256:sha(ackBytes),freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,originalNodePid:process.pid,originalNodeCreationFiletime:start.originalNodeCreationFiletime,baselineHash:ack.baselineHash,noBrowserImport:true,noModelCalls:true,noContentRead:true,noCanonicalWrites:true});
 }finally{clearTimeout(timer);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length===2)console.log('Inert. Separate review and phase approval required.');
 else if(process.argv.length===3&&process.argv[2]==='--bootstrap')await bootstrap().catch(()=>{console.error('Composed child unavailable.');process.exitCode=1;});
 else throw Error('Fixed CLI only');
}
