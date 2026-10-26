// Fixed public model artifacts only. No app credentials or owner URLs are read.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,mkdir,open,readFile,realpath,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=new URL('../../../data/hierarchy-nli-assets-adr133-v1/',import.meta.url);
const existingRuntime=new URL('../../../../../spikes/topic-resolution/browser/embedding/.assets/',import.meta.url);
const remoteNames=new Set(['model_quantized.onnx','tokenizer.json','config.json','tokenizer_config.json','special_tokens_map.json']);
const runtimeNames=new Set(['tokenizers.mjs','ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']);
const expectedRevision='ca5daf3d11b6c4b3143b1f4602a2edfb64c3ad7e';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

async function verifiedDestinationParent(){
  const parent=fileURLToPath(new URL('../',root)),normalized=path.resolve(parent);
  assert.match(normalized,/^D:\\/iu);assert.equal((await realpath(parent)).toLowerCase(),normalized.toLowerCase());
  let current=normalized.slice(0,3);
  for(const part of normalized.slice(3).split('\\')){
    current=path.join(current,part);const stat=await lstat(current);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink());
  }
}
async function fixedPublicFetch(initial){
  let url=new URL(initial);const signal=AbortSignal.timeout(180000);
  for(let redirects=0;redirects<=5;redirects++){
    assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');assert.equal(url.port,'');
    assert.ok(url.hostname==='huggingface.co'||url.hostname.endsWith('.huggingface.co')||url.hostname.endsWith('.hf.co'));
    const response=await fetch(url,{signal,redirect:'manual',
      headers:{'User-Agent':'MurmingleLocalModelExperiment/1.0'},credentials:'omit'});
    if(![301,302,303,307,308].includes(response.status))return response;
    const location=response.headers.get('location');await response.body?.cancel();
    assert.ok(location&&redirects<5);url=new URL(location,url);
  }
  throw Error('Public model redirect capacity');
}

async function copyCheckedAsset(spec){
  const url=new URL(spec.filename,existingRuntime),stat=await lstat(url);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink());assert.equal(stat.size,spec.bytes);
  const bytes=await readFile(url);assert.equal(bytes.length,spec.bytes);assert.equal(digest(bytes),spec.sha256);
  try{await writeFile(new URL(spec.filename,root),bytes,{flag:'wx'});}finally{bytes.fill(0);}
}
async function downloadCheckedAsset(spec){
  const path=spec.filename==='model_quantized.onnx'?`onnx/${spec.filename}`:spec.filename;
  const url=`https://huggingface.co/onnx-community/multilingual-MiniLMv2-L6-mnli-xnli-ONNX/resolve/${expectedRevision}/${path}`;
  const response=await fixedPublicFetch(url);
  assert.equal(response.status,200);assert.ok(response.body);
  const declared=response.headers.get('content-length'),encoding=response.headers.get('content-encoding');
  if(declared!==null&&(encoding===null||encoding==='identity'))assert.equal(Number(declared),spec.bytes);
  const handle=await open(new URL(spec.filename,root),'wx'),hash=createHash('sha256');let size=0;
  try{
    for await(const chunk of response.body){
      assert.ok(chunk instanceof Uint8Array&&chunk.byteLength>0&&chunk.byteLength<=16*1024*1024);
      size+=chunk.byteLength;assert.ok(size<=spec.bytes);hash.update(chunk);
      let offset=0;
      while(offset<chunk.byteLength){const written=await handle.write(chunk,offset,chunk.byteLength-offset);
        assert.ok(written.bytesWritten>0);offset+=written.bytesWritten;}
    }
    assert.equal(size,spec.bytes);assert.equal(hash.digest('hex'),spec.sha256);await handle.sync();
  }finally{await handle.close();}
}
async function main(){
  assert.equal(process.env.MURMINGLE_NLI_SUPERVISED,'prepare');
  assert.match(fileURLToPath(root),/^D:\\/iu);
  const manifestBytes=await readFile(new URL('assets.json',import.meta.url)),manifest=JSON.parse(manifestBytes);
  assert.equal(manifest.schema,'hierarchy-nli-assets/v1');assert.equal(manifest.revision,expectedRevision);
  assert.equal(manifest.assets.length,9);assert.equal(new Set(manifest.assets.map(a=>a.filename)).size,9);
  assert.equal(manifest.assets.filter(a=>remoteNames.has(a.filename)).length,5);
  for(const a of manifest.assets){assert.ok(remoteNames.has(a.filename)||runtimeNames.has(a.filename));assert.match(a.sha256,/^[a-f0-9]{64}$/u);
    assert.ok(Number.isSafeInteger(a.bytes)&&a.bytes>0&&a.bytes<=108*1024*1024);}
  await verifiedDestinationParent();
  await mkdir(root,{recursive:false});
  await writeFile(new URL('preparation-started.json',root),JSON.stringify({schema:'hierarchy-nli-assets-preparation/v1',
    startedAt:new Date().toISOString(),manifestSha256:digest(manifestBytes),modelConversion:'third-party-not-author-signed',
    ownerDataSent:false,credentialsRead:false})+'\n',{flag:'wx'});
  for(const spec of manifest.assets){
    if(remoteNames.has(spec.filename))await downloadCheckedAsset(spec);else await copyCheckedAsset(spec);
    process.stdout.write(JSON.stringify({asset:spec.filename,status:'verified',bytes:spec.bytes})+'\n');
  }
  await writeFile(new URL('preparation-complete.json',root),JSON.stringify({schema:'hierarchy-nli-assets-preparation/v1',
    status:'verified',completedAt:new Date().toISOString(),manifestSha256:digest(manifestBytes),assets:manifest.assets,
    modelConversion:'third-party-not-author-signed',ownerDataSent:false,credentialsRead:false})+'\n',{flag:'wx'});
}
const args=process.argv.slice(2);
if(!args.length)process.stdout.write('No action. Explicit supervised --prepare-assets only.\n');
else if(args.length!==1||args[0]!=='--prepare-assets')process.exitCode=1;
else main().catch(error=>{process.stderr.write(JSON.stringify({status:'asset-preparation-failed',
  code:typeof error?.code==='string'?error.code:'validation-or-network'})+'\n');process.exitCode=1;});
