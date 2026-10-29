// Explicit offline native-Chrome fixture only. No pairing, provider, SQL, page
// ingestion, real public-page traffic or live extension changes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {launchChromiumPipe} from '../../../spikes/topic-resolution/harness/chromium-pipe.js';
import {collectArticlePublicationClaims} from '../experiments/automatic-topic-discovery-v1/publication-dom.js';
import {normalizeArticlePublicationClaims} from '../experiments/automatic-topic-discovery-v1/publication-metadata.js';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),ORIGIN='https://publication-fixture.murmingle.invalid';
const SOURCES=Object.freeze([
 'apps/local-service/harness/run-publication-dom-browser.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/publication-dom.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/publication-dom.test.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/publication-metadata.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/publication-metadata.test.js',
 'spikes/topic-resolution/harness/chromium-pipe.js',
]);
const sha=b=>createHash('sha256').update(b).digest('hex');
function pins(){return SOURCES.map(file=>{const p=path.join(ROOT,file),s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>131072)throw Error('source-bound');const b=fs.readFileSync(p);return{file,bytes:b.length,sha256:sha(b)};});}
const wrap=(head='',body='')=>`<!doctype html><html><head><title>Controlled publication fixture</title>${head}</head><body>${body}</body></html>`;
const ld=value=>'<script type="application/ld+json">'+JSON.stringify(value)+'</script>';
const article=(url,date='2024-10-08T12:00:00Z')=>({'@type':'NewsArticle',url,datePublished:date});
function cases(){return [
 {id:'head-current-jsonld',html:url=>wrap('<meta property="article:published_time" content="2024-10-08T12:00:00Z">'+ld({'@graph':[article(url),article(ORIGIN+'/other','2000-01-01')]})),expected:{capture:'captured',status:'known',kind:'timestamp',value:'2024-10-08T12:00:00.000Z'}},
 {id:'primary-article-time',html:()=>wrap('',`<header><article><time itemprop="datePublished" datetime="1999-01-01"></time></article></header><main><article><time itemprop="datePublished" datetime="2024-10-08"></time><aside><article><time itemprop="datePublished" datetime="2000-01-01"></time></article></aside></article></main>`),expected:{capture:'captured',status:'known',kind:'calendar-date',value:'2024-10-08'}},
 {id:'modified-not-publication',html:()=>wrap('<meta property="article:modified_time" content="2024-10-09T12:00:00Z">'),expected:{capture:'captured',status:'unknown',value:null}},
 {id:'conflicting-dates',html:()=>wrap('<meta name="datePublished" content="2024-10-08"><meta property="article:published_time" content="2024-10-09">'),expected:{capture:'captured',status:'conflict',value:null}},
 {id:'unscoped-ambiguity',html:()=>{const a=article(null);delete a.url;return wrap(ld([a,{...a,datePublished:'2000-01-01'}]));},expected:{capture:'unavailable',reason:'ambiguous-article-scope'}},
 {id:'malformed-data-not-code',html:()=>wrap('<script type="application/ld+json">globalThis.__publicationMarker=1</script>'),expected:{capture:'unavailable',reason:'json-invalid'}},
 {id:'script-quoted-meta-ignored',html:()=>wrap(`<script>globalThis.fakeMeta='<meta name="datePublished" content="1900-01-01">';</script>`),expected:{capture:'captured',status:'unknown',value:null}},
 {id:'isolated-native-dom',html:()=>wrap(`<meta name="datePublished" content="2024-10-08"><script>Element.prototype.getAttribute=function(){return 'PRIVATE_PAGE_OVERRIDE';};</script>`),expected:{capture:'captured',status:'known',kind:'calendar-date',value:'2024-10-08'}},
 {id:'large-structured-data',html:()=>wrap('<script type="application/ld+json">'+JSON.stringify({text:'x'.repeat(17000)})+'</script>'),expected:{capture:'unavailable',reason:'json-text-bound'}},
 ];}
let actualUsed=false;
export async function runPublicationDomBrowser(){
 if(arguments.length||actualUsed)throw Error('explicit-single-run');actualUsed=true;
 const sourcePins=pins(),base=path.join(ROOT,'apps/local-service/data/publication-dom-browser-20261029');
 fs.mkdirSync(base,{recursive:true});const attempt=fs.mkdtempSync(path.join(base,'attempt-')),profile=path.join(attempt,'profile');
 const rows=[];let browser,session,failure=null,fulfilled=0,blocked=0,ownedExited=false,profileRemoved=false;
 try{
  browser=launchChromiumPipe({executable:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',profileDirectory:profile});await browser.send('Browser.getVersion');
  const target=await browser.send('Target.createTarget',{url:'about:blank'});session=(await browser.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  const fixtures=new Map(cases().map(c=>[ORIGIN+'/'+c.id,c]));
  browser.on('Fetch.requestPaused',(event,s)=>{void(async()=>{
   const c=fixtures.get(event.request.url);if(c&&event.request.method==='GET'&&event.resourceType==='Document'){
    fulfilled++;await browser.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}],body:Buffer.from(c.html(event.request.url)).toString('base64')},s);
   }else{blocked++;await browser.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'},s);}
  })().catch(()=>{failure='fixture-network';});});
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'http://*'},{urlPattern:'https://*'}]},session);
  for(const [url,c]of fixtures){
   await browser.send('Page.navigate',{url},session);let ready=false;
   for(let i=0;i<100;i++){if(failure)throw Error(failure);const r=await browser.send('Runtime.evaluate',{expression:`location.href===${JSON.stringify(url)}&&document.readyState==='complete'`,returnByValue:true},session);if(r.result.value===true){ready=true;break;}await new Promise(r=>setTimeout(r,50));}if(!ready)throw Error('fixture-not-ready');
   const frame=(await browser.send('Page.getFrameTree',{},session)).frameTree.frame;
   const world=await browser.send('Page.createIsolatedWorld',{frameId:frame.id,worldName:'murmingle-publication-fixture-'+c.id},session);
   const response=await browser.send('Runtime.evaluate',{contextId:world.executionContextId,
    expression:`globalThis.__publicationMarker=0;(()=>{const start=performance.now();const output=(${collectArticlePublicationClaims.toString()})(${JSON.stringify(url)});return {output,marker:globalThis.__publicationMarker,elapsedMs:performance.now()-start};})()`,returnByValue:true},session);
   if(response.exceptionDetails)throw Error('isolated-evaluation');const observed=response.result.value,normalized=observed.output.status==='captured'?normalizeArticlePublicationClaims(observed.output.claimsJson):null;
   const expected=c.expected,passed=observed.marker===0&&observed.output.status===expected.capture&&
    (expected.reason===undefined||observed.output.reason===expected.reason)&&
    (expected.status===undefined||normalized?.status===expected.status)&&
    (expected.kind===undefined||normalized?.kind===expected.kind)&&
    (!Object.hasOwn(expected,'value')||normalized?.value===expected.value);
   rows.push({id:c.id,passed,captureStatus:observed.output.status,captureReason:observed.output.reason,metadata:normalized,elapsedMs:observed.elapsedMs,codeExecuted:observed.marker!==0});
   if(!passed)throw Error('case-mismatch');
  }
  if(JSON.stringify(pins())!==JSON.stringify(sourcePins))throw Error('source-changed');
 }catch(error){failure??=/^[a-z-]{1,64}$/u.test(error?.message??'')?error.message:'browser-unavailable';}
 finally{
  await browser?.close();ownedExited=browser?.hasExited===true;
  if(ownedExited&&fs.existsSync(profile)&&path.dirname(path.resolve(profile))===path.resolve(attempt)&&fs.realpathSync(profile).toLowerCase()===path.resolve(profile).toLowerCase()&&!fs.lstatSync(profile).isSymbolicLink()){
   fs.rmSync(profile,{recursive:true,maxRetries:5,retryDelay:100});profileRemoved=!fs.existsSync(profile);
  }
 }
 const result={schema:'publication-dom-native-browser-fixture/v1',utc:new Date().toISOString(),passed:failure===null&&rows.length===cases().length&&ownedExited&&profileRemoved,failure,rows,sourcePins,fulfilled,blocked,
  continuedExternalRequests:0,ownedExited,profileRemoved,liveChanged:false,scope:'Actual isolated-world Chrome DOM under controlled intercepted fixtures, not public-date truth, same-document Source attestation, ingestion or live metadata integration.'};
 fs.writeFileSync(path.join(attempt,'result.json'),JSON.stringify(result)+'\n',{flag:'wx'});
 return {passed:result.passed,failure,cases:rows.length,ownedExited,profileRemoved,result:path.relative(ROOT,path.join(attempt,'result.json')).replaceAll('\\','/')};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--run'){process.stderr.write('Explicit --run required; no action.\n');process.exitCode=2;}
 else try{const r=await runPublicationDomBrowser();process.stdout.write(JSON.stringify(r)+'\n');if(!r.passed)process.exitCode=1;}catch{process.stderr.write('Publication DOM fixture refused.\n');process.exitCode=1;}
}
