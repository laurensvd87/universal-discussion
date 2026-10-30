// Explicit, bounded live read probe. No posts, AI requests, ingestion, body
// capture or credential output. Pending context reads may request preparation
// through the application's normal path. Import performs no IO.
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLocalServiceClient} from '../../../spikes/topic-resolution/browser/core/local-service-client.js';

const DATA=new URL('../data/',import.meta.url);
const URLS=Object.freeze([
 'https://www.leukerecepten.nl/recepten/kapsalon-maken/',
 'https://www.youtube.com/watch?v=rd5EWR83AGs',
 'https://www.youtube.com/watch?v=A0fECnj5sas',
]);
const OUTPUT=new URL('known-topic-read-latency-20261030.json',DATA);
async function boundedRead(url,maximum){
 const fd=await open(url,'r');try{
  const before=await fd.stat();if(!before.isFile()||before.size<1||before.size>maximum)throw Error('probe-input');
  const bytes=Buffer.alloc(before.size);try{
   if((await fd.read(bytes,0,bytes.length,0)).bytesRead!==bytes.length)throw Error('probe-input');
   return bytes;
  }catch(error){bytes.fill(0);throw error;}
 }finally{await fd.close();}
}
export async function measureKnownTopicReads(){
 if(arguments.length)throw Error('probe-input');
 // This single retained output is intentionally exclusive, never overwritten
 // or reused as evidence for a later deployment.
 const output=await open(OUTPUT,'wx');let originBytes=null,tokenBytes=null,token=null;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000),rows=[];
 let active=0,maximumActive=0,requests=0,protocol=null;
 try{
  originBytes=await boundedRead(new URL('pairing.json',DATA),8192);
  const {origin}=JSON.parse(originBytes.toString('utf8'));originBytes.fill(0);originBytes=null;
  if(typeof origin!=='string'||!/^chrome-extension:\/\/[a-p]{32}$/u.test(origin))throw Error('probe-input');
  tokenBytes=await boundedRead(new URL('pairing-recovery/pairing-token.txt',DATA),128);
  token=tokenBytes.toString('utf8').replace(/\r?\n$/u,'');tokenBytes.fill(0);tokenBytes=null;
  if(!/^[A-Za-z0-9_-]{43}$/u.test(token))throw Error('probe-input');
  const client=createLocalServiceClient({getToken:()=>token,fetchImpl:async(url,options)=>{
   if(!url.startsWith('http://127.0.0.1:4174/v1/')||++requests>32||active>=4)throw Error('probe-bound');
   active++;maximumActive=Math.max(maximumActive,active);
   try{return await fetch(url,{...options,headers:{...options.headers,origin},signal:AbortSignal.any([options.signal,controller.signal])});}
   finally{active--;}
  }});
  async function observed(operation,site,phase,work){
   if(controller.signal.aborted)throw Error('probe-deadline');const before=performance.now();
   try{const result=await work();rows.push({operation,site,phase,status:'ok',milliseconds:performance.now()-before});return result;}
   catch(error){rows.push({operation,site,phase,status:'failed',code:['unauthorized','not-found','invalid-request','invalid-response','unavailable'].includes(error?.code)?error.code:'probe-error',milliseconds:performance.now()-before});return null;}
  }
  protocol=(await observed('capabilities',null,'first-observed',()=>client.semanticCapabilities({signal:controller.signal})))?.protocol??null;
  const selected=[];
  for(const [i,url]of URLS.entries()){
   const site=i+1,projection=await observed('saved-url',site,'first-observed',()=>client.urlSelection({url},{signal:controller.signal}));
   const source=projection?.catalog.sources.find(s=>s.url===url&&s.provenance==='owner-local-page-embedding/v1');
   if(!source)continue;selected.push({site,sourceId:source.id,url});
   const value=await observed('topic-context',site,'first-observed',()=>client.semanticContext({sourceId:source.id},{signal:controller.signal}));
   if(value)rows.at(-1).classification=value.status;
  }
  for(const source of selected){
   await observed('saved-url',source.site,'repeat',()=>client.urlSelection({url:source.url},{signal:controller.signal}));
   await observed('topic-context',source.site,'repeat',()=>client.semanticContext({sourceId:source.sourceId},{signal:controller.signal}));
  }
  // Four requests in flight, using independent Source contexts when available.
  // This is a small contention probe, not evidence of many-user capacity.
  if(selected.length)await Promise.all(Array.from({length:4},(_,i)=>{
   const source=selected[i%selected.length];return observed('topic-context',source.site,'four-concurrent',()=>client.semanticContext({sourceId:source.sourceId},{signal:controller.signal}));
  }));
  const sourceBytes=await boundedRead(new URL('./measure-known-topic-reads.js',import.meta.url),32768);
  const sourceSha256=createHash('sha256').update(sourceBytes).digest('hex');sourceBytes.fill(0);
  const result={schema:'known-topic-read-latency/v1',utc:new Date().toISOString(),sourceSha256,protocol,rows,requests,maximumConcurrentHeaderRequests:maximumActive,
   scope:'Authenticated live API including normal client validation; first-observed is not server/model cold start; four requests are not multi-user load',
   noPostsAiOrIngestion:true,credentialAndResponseContentRetained:false,browserRenderingMeasured:false};
  await output.writeFile(JSON.stringify(result)+'\n');await output.sync();return result;
 }finally{clearTimeout(timer);controller.abort();token=null;originBytes?.fill(0);tokenBytes?.fill(0);await output.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--measure-known-topic-reads')process.exitCode=2;
 else measureKnownTopicReads().then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(()=>{process.stderr.write('Known-topic read probe failed; no credentials or response contents were retained.\n');process.exitCode=1;});
}
