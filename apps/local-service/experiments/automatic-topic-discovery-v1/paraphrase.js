// Fixed official research assets on D:, never a live model replacement. Inert
// import; preparation and local inference are separate explicit entry points.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {poolHidden,readAssetManifest,ORT_VERSION} from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
import {runPooledArticle} from '../topic-encoder/e5-infer.js';

export const PARAPHRASE_REVISION='e8f8c211226b894fcb81acc59f3b34ba3efd5f42';
const ROOT=fileURLToPath(new URL('../../../../',import.meta.url));
export const PARAPHRASE_ASSET_DIRECTORY=path.join(ROOT,'apps/local-service/data/automatic-topic-paraphrase-assets-20261029');
const ASSETS=path.join(ROOT,'spikes/topic-resolution/browser/embedding/.assets');
const SPECS=Object.freeze([
 ['onnx/model_qint8_avx512_vnni.onnx','model.onnx',125000000,'783fea82d71a58179b830a4dbd2d58447e640609e98eedf9ffa12622d375a672'],
 ['tokenizer.json','tokenizer.json',20000000,'2c3387be76557bd40970cec13153b3bbf80407865484b209e655e5e4729076b8'],
 ['tokenizer_config.json','tokenizer_config.json',32768,'5036ea374ffedd706e3bef33e2e0d6953cb868ef8a490e76e32ba0faa37a6b9b'],
 ['config.json','config.json',32768,'6300193cb75e01cf80c96decef7187dfb33094d97cc1490b7ead6ff134476e4e'],
 ['sentence_bert_config.json','sentence_bert_config.json',32768,'70f4448f31320443fe3557cacea5abf2dcc4915dda8c80646bec9f3bb0aa5a1f'],
]);
const need=value=>{if(!value)throw Error('paraphrase-refused');};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function disk(){const s=await fs.statfs(PARAPHRASE_ASSET_DIRECTORY);need(s.bavail*s.bsize>=4294967296);}
async function publicFile(remote,signal){
 let url=new URL(`https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/resolve/${PARAPHRASE_REVISION}/${remote}`);
 for(let i=0;i<=5;i++){
  need(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(url.hostname==='huggingface.co'||url.hostname.endsWith('.huggingface.co')||url.hostname.endsWith('.hf.co')));
  const r=await fetch(url,{signal,redirect:'manual',credentials:'omit',headers:{'User-Agent':'MurmingleLocalModelExperiment/1.0'}});
  if(![301,302,303,307,308].includes(r.status)){need(r.status===200&&r.body);return r;}
  const location=r.headers.get('location');await r.body?.cancel();need(i<5&&location);url=new URL(location,url);
 }throw Error('paraphrase-redirect');
}
let prepared=false;
export async function prepareParaphraseAssets(){
 need(arguments.length===0&&!prepared);prepared=true;need(/^D:\\/iu.test(PARAPHRASE_ASSET_DIRECTORY));
 const parent=path.dirname(PARAPHRASE_ASSET_DIRECTORY);need((await fs.realpath(parent)).toLowerCase()===parent.toLowerCase());
 const space=await fs.statfs(parent);need(space.bavail*space.bsize>=4294967296+150000000);
 await fs.mkdir(PARAPHRASE_ASSET_DIRECTORY);await disk();
 await fs.writeFile(path.join(PARAPHRASE_ASSET_DIRECTORY,'started.json'),JSON.stringify({schema:'automatic-topic-paraphrase-preparation/v1',utc:new Date().toISOString(),
  revision:PARAPHRASE_REVISION,sourceSha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),maximumAssetBytes:150000000,minimumDFreeBytes:4294967296,
  ownerContentSent:false,credentialsRead:false,liveChanged:false})+'\n',{flag:'wx'});
 const signal=AbortSignal.timeout(180000),inventory=[];
 for(const [remote,name,maximum,expected] of [['README.md','README.md',32768,null],...SPECS]){
  const response=await publicFile(remote,signal),file=await fs.open(path.join(PARAPHRASE_ASSET_DIRECTORY,name),'wx'),hash=createHash('sha256');let bytes=0,last=0;
  try{
   for await(const chunk of response.body){need(chunk instanceof Uint8Array&&chunk.length>0&&chunk.length<=16777216);bytes+=chunk.length;need(bytes<=maximum);hash.update(chunk);
    for(let offset=0;offset<chunk.length;){const w=await file.write(chunk,offset,chunk.length-offset);need(w.bytesWritten>0);offset+=w.bytesWritten;}
    if(bytes-last>=8388608){await disk();last=bytes;}
   }need(bytes>0);const actual=hash.digest('hex');if(expected)need(actual===expected);await file.sync();inventory.push({name,bytes,sha256:actual});
  }finally{await file.close();}
  if(name==='README.md')need(/^license:\s*apache-2\.0\s*$/mu.test(await fs.readFile(path.join(PARAPHRASE_ASSET_DIRECTORY,name),'utf8')));
  await disk();
 }
 const result={schema:'automatic-topic-paraphrase-assets/v1',status:'verified',revision:PARAPHRASE_REVISION,inventory,ownerContentSent:false,liveChanged:false};
 await fs.writeFile(path.join(PARAPHRASE_ASSET_DIRECTORY,'result.json'),JSON.stringify(result)+'\n',{flag:'wx'});return result;
}
async function checked(directory,name,maximum,expected){
 const file=path.join(directory,name),s=await fs.lstat(file);need(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=maximum&&(await fs.realpath(file)).toLowerCase()===file.toLowerCase());
 const b=await fs.readFile(file);need(b.length===s.size&&sha(b)===expected);return b;
}
export async function createParaphraseDevelopmentEncoder(){
 need(arguments.length===0);const receipt=JSON.parse(await fs.readFile(path.join(PARAPHRASE_ASSET_DIRECTORY,'result.json'),'utf8'));
 need(receipt.schema==='automatic-topic-paraphrase-assets/v1'&&receipt.status==='verified'&&receipt.revision===PARAPHRASE_REVISION);
 const card=receipt.inventory.find(p=>p.name==='README.md');need(card?.bytes<=32768&&/^[a-f0-9]{64}$/u.test(card.sha256));
 need(/^license:\s*apache-2\.0\s*$/mu.test((await checked(PARAPHRASE_ASSET_DIRECTORY,'README.md',32768,card.sha256)).toString('utf8')));
 const own=new Map();for(const[,name,maximum,expected]of SPECS)own.set(name,await checked(PARAPHRASE_ASSET_DIRECTORY,name,maximum,expected));
 const config=JSON.parse(own.get('config.json')),sentence=JSON.parse(own.get('sentence_bert_config.json'));need(config.hidden_size===384&&config.model_type==='bert'&&sentence.max_seq_length===128&&!config.auto_map);
 const manifestBytes=await fs.readFile(path.join(ASSETS,'manifest.json'));need(sha(manifestBytes)==='5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984');
 const manifest=readAssetManifest(JSON.parse(manifestBytes)),runtime=new Map();
 for(const name of ['tokenizers.mjs','ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']){
  const spec=manifest.get(name);const b=await checked(ASSETS,name,spec.bytes,spec.sha256);need(b.length===spec.bytes);runtime.set(name,b);
 }
 const {Tokenizer}=await import('../../../../spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs');
 const ort=await import('../../../../spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs');need(ort.env.versions.web===ORT_VERSION);
 const tokenizer=new Tokenizer(JSON.parse(own.get('tokenizer.json')),JSON.parse(own.get('tokenizer_config.json')));need(tokenizer.token_to_id('<s>')===0&&tokenizer.token_to_id('</s>')===2);
 ort.env.logLevel='error';ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.simd=true;ort.env.wasm.initTimeout=30000;
 ort.env.wasm.wasmBinary=runtime.get('ort-wasm-simd-threaded.wasm');ort.env.wasm.wasmPaths={mjs:new URL('../../../../spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs',import.meta.url).href};
 const session=await ort.InferenceSession.create(own.get('model.onnx'),{executionProviders:['wasm'],executionMode:'sequential',graphOptimizationLevel:'all',logSeverityLevel:3});
 if(session.inputNames.some(n=>!['input_ids','attention_mask','token_type_ids'].includes(n))||!session.inputNames.includes('input_ids')||!session.inputNames.includes('attention_mask')||!session.outputNames.includes('last_hidden_state')){await session.release();throw Error('paraphrase-model-io');}
 let calls=0,closed=false,busy=false;
 return Object.freeze({
  async embed(value){
   need(!busy&&!closed&&calls<32&&typeof value==='string'&&value.length>0&&value.length<=4096);busy=true;
   try{
    const text=value.normalize('NFKC').replace(/\s+/gu,' ').trim();need(text.length>0);const encoded=tokenizer.encode(text,{add_special_tokens:false}),content=encoded.ids;
    need(Array.isArray(content)&&content.length>0&&content.every(n=>Number.isSafeInteger(n)&&n>=0&&n<config.vocab_size));
    const ids=[0,...content.slice(0,126),2];calls++;
    const vector=await runPooledArticle(session,ort.Tensor,{ids,attention_mask:Array(ids.length).fill(1),token_type_ids:Array(ids.length).fill(0)},poolHidden);
    need(vector.length===384&&vector.every(Number.isFinite));return {vector:Array.from(vector),sampled:content.length>126,tokens:ids.length};
   }finally{busy=false;}
  },
  async close(){need(!busy);if(!closed){await session.release();closed=true;}return {closed,calls};},
 });
}
