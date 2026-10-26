// One failed TRAIN response only; no cohort replay, model or owner input.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {request as httpsRequest} from 'node:https';
import {IncomingMessage} from 'node:http';
import {readFile,lstat,realpath,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createPublicFetcher,PublicFetchError,PUBLIC_FETCH_POLICY} from '../../../src/crawler/public-fetch.js';
import {parseRobotsTxt as parseRobots,evaluateRobots,tdmRepUrlFor,parseTdmRepJson,matchTdmRep,parseXRobotsDirectives,parseTdmReservation} from '../../../src/crawler/robots.js';
import {captureStaticHtml} from '../../../src/crawler/static-capture.js';
import {pruneWikipediaTransportMetadata} from '../html-metadata-prune-v1/prune.js';

export const TARGET_URL='https://fr.wikipedia.org/wiki/Guerre_froide';
const HERE=dirname(fileURLToPath(import.meta.url)),OUTPUT=resolve(HERE,'output'),sha=b=>createHash('sha256').update(b).digest('hex');
const EXPECTED='PUBLIC_FETCH_ENCODING_DIAGNOSTIC_JOB_ASSIGNED\n';
const CAUSES=new Set(['ERR_BUFFER_TOO_LARGE','Z_BUF_ERROR','Z_DATA_ERROR','Z_MEM_ERROR','Z_STREAM_ERROR','Z_VERSION_ERROR',
  'ERR_ZLIB_INITIALIZATION_FAILED','ERR_ENCODING_INVALID_ENCODED_DATA','ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN']);
const FETCH_CODES=new Set(['invalid-host','dns-failed','dns-invalid','dns-non-public','invalid-url','invalid-headers','headers-too-large',
  'content-type','character-encoding','content-encoding','content-length','body-too-large','compression-ratio','dns-pin','remote-address',
  'http-status','redirect-location','network-failed','timeout','aborted','response-aborted']);
function invalid(){throw Error('Diagnostic validation failed');}
function data(value,key){
  if(!value||typeof value!=='object'||types.isProxy(value))return undefined;
  const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value')?d.value:undefined;
}
function header(response,name,regex){
  const distinct=data(response,'headersDistinct'),headers=data(response,'headers');
  let v=distinct&&typeof distinct==='object'?data(distinct,name):undefined;
  if(v===undefined)v=headers&&typeof headers==='object'?data(headers,name):undefined;
  if(v===undefined)return {value:null,safe:true};
  if(Array.isArray(v)){
    if(types.isProxy(v)||v.length!==1)return {value:null,safe:false};
    v=data(v,'0');
  }
  return typeof v==='string'&&regex.test(v)?{value:v,safe:true}:{value:null,safe:false};
}
export function responseMetadata(response){
  const encoding=header(response,'content-encoding',/^[a-z0-9,._+ -]{0,64}$/iu),length=header(response,'content-length',/^[0-9]{1,32}$/u);
  const status=data(response,'statusCode');
  return {status:Number.isInteger(status)&&status>=100&&status<=599?status:null,
    contentEncoding:encoding.value,contentEncodingSafe:encoding.safe,contentLength:length.value,contentLengthSafe:length.safe};
}
export function errorMetadata(error){
  const code=data(error,'code'),causeCode=data(data(error,'cause'),'code'),status=data(error,'status');
  return {type:error&&!types.isProxy(error)&&error instanceof PublicFetchError?'PublicFetchError':'diagnostic-or-policy-failure',
    code:typeof code==='string'&&FETCH_CODES.has(code)?code:null,
    causeCode:typeof causeCode==='string'&&CAUSES.has(causeCode)?causeCode:null,
    status:Number.isInteger(status)&&status>=100&&status<=599?status:null};
}
export function observedRequestImpl(records,delegate){
  if(!Array.isArray(records)||typeof delegate!=='function')invalid();
  return (options,onResponse)=>{
    if(records.length>=3)invalid();
    const record={...responseMetadata({}),compressedBytesObserved:0,compressedSha256:null,compressedHashComplete:false,observerCapped:false};
    records.push(record);let hash=createHash('sha256'),hashed=0;
    // EXACT options/lookup object and core response validation first. Do not
    // resume, pipe, clone or consume a stream before the existing fetcher does.
    return delegate(options,response=>{
      onResponse(response);
      // IncomingMessage headers are native prototype getters, not own data
      // properties. Project only these three fields after core validation.
      const metadata=response instanceof IncomingMessage?{statusCode:response.statusCode,headers:response.headers,headersDistinct:response.headersDistinct}:response;
      Object.assign(record,responseMetadata(metadata));
      if(response.destroyed)return;
      response.on('data',chunk=>{
        if(record.observerCapped)return;
        if(!Buffer.isBuffer(chunk)){record.observerCapped=true;return;}
        record.compressedBytesObserved+=chunk.length;
        const remaining=PUBLIC_FETCH_POLICY.maxCompressedBytes-hashed;
        if(chunk.length>remaining){record.observerCapped=true;hash=null;return;}
        if(hash){hash.update(chunk);hashed+=chunk.length;}
      });
      response.once('end',()=>{
        if(hash&&!record.observerCapped){record.compressedSha256=hash.digest('hex');record.compressedHashComplete=true;hash=null;}
      });
    });
  };
}
export async function collectDiagnostic({fetchPublic,clock=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),signal}={}){
  if(typeof fetchPublic!=='function'||typeof clock!=='function'||typeof sleep!=='function')invalid();
  const began=clock(),attempts=[];let last=-Infinity,stage='robots';
  function remaining(){const n=45000-(clock()-began);if(n<=0||signal?.aborted)throw new PublicFetchError('timeout');return n;}
  async function get(url,kind,crawlDelay=2000){
    const allowed={robots:'https://fr.wikipedia.org/robots.txt',tdmrep:tdmRepUrlFor(TARGET_URL),page:TARGET_URL};
    if(url!==allowed[kind]||attempts.length>=3)invalid();
    const pause=Math.max(0,last+Math.max(2000,crawlDelay)-clock());if(pause>=remaining())throw new PublicFetchError('timeout');
    if(pause)await sleep(pause);remaining();last=clock();attempts.push({kind,startedOffsetMs:clock()-began});
    let response;
    try{
      response=await fetchPublic(url,{resourceKind:kind,signal,timeoutMs:Math.min(15000,Math.max(1,Math.floor(remaining())))});
      remaining();if(response.kind!=='content'||response.status!==200||response.finalUrl!==url)invalid();return response;
    }catch(error){response?.body?.fill(0);if(error instanceof PublicFetchError&&error.code==='http-status'&&[404,410].includes(error.status)&&kind!=='page')return null;throw error;}
  }
  let response;
  try{
    response=await get('https://fr.wikipedia.org/robots.txt','robots');let robots;
    try{robots=parseRobots(response?.text??'');}finally{response?.body?.fill(0);response=null;}
    const tdmUrl=tdmRepUrlFor(TARGET_URL),tdmRule=evaluateRobots(robots,tdmUrl);if(!tdmRule.allowed)invalid();
    stage='tdmrep';response=await get(tdmUrl,'tdmrep',tdmRule.crawlDelayMs);let tdm;
    try{tdm=response===null?null:parseTdmRepJson(response.text);}finally{response?.body?.fill(0);response=null;}
    const pageRule=evaluateRobots(robots,TARGET_URL);if(!pageRule.allowed)invalid();
    const reservation=tdm===null?null:matchTdmRep(tdm,TARGET_URL).reservation;if(reservation===1)invalid();
    stage='page';response=await get(TARGET_URL,'page',pageRule.crawlDelayMs);
    const result={status:'fetch-succeeded',pageDecodedBytes:response.body.length,policyChecked:false};
    // Same existing policy/directive path, transient only. Nothing from the
    // HTML, extracted title or body is retained in the diagnostic metadata.
    stage='page-policy';const pruned=pruneWikipediaTransportMetadata({html:response.text}),current=captureStaticHtml(pruned.html,TARGET_URL);
    const h=response.headers,header=h.tdmReservation===null?null:parseTdmReservation(h.tdmReservation);
    if(h.tdmReservation!==null&&header===null||current.directives.tdmReservationInvalid||
      [reservation,header,current.directives.tdmReservation].includes(1)||parseXRobotsDirectives(h.xRobotsTag).blocked||current.directives.noindex)invalid();
    result.policyChecked=true;
    return {stage,attempts,outcome:result,elapsedMs:clock()-began};
  }catch(error){return {stage,attempts,outcome:{status:'observed-failure',failure:errorMetadata(error)},elapsedMs:clock()-began};}
  finally{response?.body?.fill(0);}
}
async function boundedHash(path){if(await realpath(path)!==path)invalid();const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size>4*1024*1024)invalid();const b=await readFile(path);if(b.length>4*1024*1024)invalid();return sha(b);}
async function absent(path){try{await lstat(path);invalid();}catch(e){if(e.code!=='ENOENT')throw e;}}
async function handshake(){
  if(process.platform!=='win32'||process.env.MURMINGLE_FETCH_ENCODING_DIAGNOSTIC_SUPERVISED!=='1')invalid();
  await new Promise((yes,no)=>{let b='';const finish=e=>{clearTimeout(timer);process.stdin.off('data',onData);process.stdin.off('end',onEnd);process.stdin.pause();e?no(e):yes();};
    const onData=c=>{b+=c.toString('utf8');if(b.length>EXPECTED.length)finish(Error('handshake'));else if(b===EXPECTED)finish();};
    const onEnd=()=>finish(Error('handshake'));const timer=setTimeout(()=>finish(Error('handshake')),5000);process.stdin.on('data',onData);process.stdin.on('end',onEnd);process.stdin.resume();});
}
async function run(){
  await handshake();if(!/^D:/iu.test(HERE)||await realpath(OUTPUT)!==OUTPUT)invalid();
  const marker=resolve(OUTPUT,'node.started.json'),resultPath=resolve(OUTPUT,'result.json');for(const p of [marker,resultPath])await absent(p);
  const sources={'run.mjs':fileURLToPath(import.meta.url),'supervise.py':resolve(HERE,'supervise.py'),
    'public-fetch.js':resolve(HERE,'../../../src/crawler/public-fetch.js'),'robots.js':resolve(HERE,'../../../src/crawler/robots.js'),
    'static-capture.js':resolve(HERE,'../../../src/crawler/static-capture.js'),'prune.js':resolve(HERE,'../html-metadata-prune-v1/prune.js')};
  const sourceHashes={};for(const [n,p]of Object.entries(sources))sourceHashes[n]=await boundedHash(p);
  await writeFile(marker,JSON.stringify({schema:'public-fetch-encoding-diagnostic-started/v1',sourceHashes,noAutomaticRepeat:true}),{flag:'wx'});
  const records=[],fetchPublic=createPublicFetcher({requestImpl:observedRequestImpl(records,httpsRequest)});
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),45000);let diagnostic;
  try{diagnostic=await collectDiagnostic({fetchPublic,signal:abort.signal});}finally{clearTimeout(timer);}
  for(const [n,p]of Object.entries(sources))if(await boundedHash(p)!==sourceHashes[n])invalid();
  const result={schema:'public-fetch-encoding-diagnostic/v1',target:TARGET_URL,sourceHashes,sourceHashesRechecked:true,
    ...diagnostic,transport:records,bodyRetained:false,headerOverrides:false,limitsChanged:false,noAutomaticRetry:true,
    cohortReplay:false,modelExecuted:false,canonicalWrites:false,productionValidated:false};
  const b=Buffer.from(JSON.stringify(result));if(b.length>32768)invalid();await writeFile(resultPath,b,{flag:'wx'});
  console.log(JSON.stringify({status:'diagnostic-complete',stage:diagnostic.stage,outcome:diagnostic.outcome.status,resultSha256:sha(b)}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length===2)console.log('No action. Explicit supervised --diagnose-encoding required.');
  else if(process.argv.length===3&&process.argv[2]==='--diagnose-encoding')await run().catch(()=>{console.error('Encoding diagnostic refused; no retry.');process.exitCode=1;});
  else{console.error('Unsupported encoding diagnostic mode');process.exitCode=1;}
}
