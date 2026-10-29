// Owned offline native DOM for an already policy-checked public HTTP response.
// No public browser request, provider, ingestion or Source-attestation authority.
import {launchChromiumPipe} from '../../../spikes/topic-resolution/harness/chromium-pipe.js';
import {collectArticlePublicationClaims} from '../experiments/automatic-topic-discovery-v1/publication-dom.js';
import {normalizeArticlePublicationClaims} from '../experiments/automatic-topic-discovery-v1/publication-metadata.js';

export async function openPublicationResponseDom(profileDirectory){
 const browser=launchChromiumPipe({executable:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',profileDirectory});
 let session,current=null,failure=false,reads=0,fulfilled=0,blocked=0,closed=false;
 const pending=new Set();
 try{
  await browser.send('Browser.getVersion');
  const target=await browser.send('Target.createTarget',{url:'about:blank'});
  session=(await browser.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  browser.on('Fetch.requestPaused',(event,s)=>{
   const task=(async()=>{
    if(current&&event.resourceType==='Document'&&event.request.method==='GET'&&event.request.url===current.url&&!current.used){
     current.used=true;fulfilled++;
     await browser.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[
      {name:'Content-Type',value:'text/html; charset=utf-8'},
      {name:'Content-Security-Policy',value:"default-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'"},
     ],body:Buffer.from(current.html,'utf8').toString('base64')},s);
    }else{blocked++;await browser.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'},s);}
   })();pending.add(task);void task.catch(()=>{failure=true;}).finally(()=>pending.delete(task));
  });
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*'}]},session);
 }catch{await browser.close();throw Error('dom-open');}
 async function read(url,html){
  if(closed||current||reads>=4||failure)throw Error('dom-state');
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.href!==url||typeof html!=='string'||html.length>524288||Buffer.byteLength(html,'utf8')>786432)throw Error('dom-input');
  reads++;current={url,html,used:false};
  try{
   await browser.send('Page.navigate',{url},session);let ready=false;
   for(let i=0;i<100;i++){
    if(failure)throw Error('dom-network');
    const r=await browser.send('Runtime.evaluate',{expression:`location.href===${JSON.stringify(url)}&&document.readyState==='complete'`,returnByValue:true},session);
    if(r.result.value===true){ready=true;break;}await new Promise(r=>setTimeout(r,50));
   }
   if(!ready||!current.used)throw Error('dom-ready');
   const frame=(await browser.send('Page.getFrameTree',{},session)).frameTree.frame;
   const world=await browser.send('Page.createIsolatedWorld',{frameId:frame.id,worldName:'murmingle-publication-response'},session);
   const r=await browser.send('Runtime.evaluate',{contextId:world.executionContextId,
    expression:`(()=>{const start=performance.now();const output=(${collectArticlePublicationClaims.toString()})(${JSON.stringify(url)});return {output,elapsedMs:performance.now()-start};})()`,returnByValue:true},session);
   if(r.exceptionDetails||failure)throw Error('dom-evaluate');
   const {output,elapsedMs}=r.result.value;
   if(!output||!['captured','unavailable'].includes(output.status)||!Number.isFinite(elapsedMs))throw Error('dom-output');
   if(output.status==='captured'&&output.documentUrl!==url)throw Error('dom-output');
   return {captureStatus:output.status,captureReason:output.reason,elapsedMs,
    metadata:output.status==='captured'?normalizeArticlePublicationClaims(output.claimsJson):null};
  }finally{current=null;}
 }
 async function close(){
  closed=true;current=null;
  await Promise.allSettled([...pending]);await browser.close();await Promise.allSettled([...pending]);
  return {ownedExited:browser.hasExited,reads,fulfilled,blocked,networkFailure:failure,continuedExternalRequests:0};
 }
 return Object.freeze({read,close});
}
