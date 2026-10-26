// Owner-authorized, bounded public-site QA. Import/default execution is inert.
// Actual packaged UI only: no renderer replacement, account login, inference or posts.
import {readFileSync,mkdtempSync,rmSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const SITES=Object.freeze([
  ['video','https://www.youtube.com/watch?v=rd5EWR83AGs'],
  ['recipe','https://www.leukerecepten.nl/recepten/kapsalon-maken/'],
  ['http','https://developer.mozilla.org/en-US/docs/Web/HTTP'],
]);
const HOSTS=new Set(['www.youtube.com','leukerecepten.nl','www.leukerecepten.nl','developer.mozilla.org']);
const READ_POSTS=new Set(['/v1/catalog/context','/v1/catalog/selection','/v1/catalog/url-selection',
  '/v1/sources/enrichment','/v1/related','/v1/discover/search','/v1/topic-spaces/query','/v1/account/capabilities']);
const SAFE_GET=/^\/v1\/(?:health|version|catalog|ai\/(?:status|models|diagnostics)|accounts\/capabilities|account\/capabilities|topics\/[A-Za-z0-9._:-]+\/discussion|sources\/[A-Za-z0-9._:-]+\/(?:prior-discussions|alternate-discussion))$/u;

export async function runLivePublicNativeQA({includeMdn=false,recipeOnly=false,mdnOnly=false,diagnoseNative=false}={}) {
  const sites=mdnOnly?[SITES[2]]:recipeOnly?[SITES[1]]:SITES.slice(0,includeMdn?3:2),firstSite=sites[0][1];
  const deadline=Date.now()+900000,phaseCounts={},routes={},statusCounts={},routeStatuses={},blockedMethods={},ingestErrors=[],responseInspections=[],pendingErrorResponses=new Map(),requestStarts=new Map(),readTimings=[],uiErrors=[],
    violations={forbiddenService:0,otherNetwork:0,providerReadsBlocked:0,errors:0,networkGuardErrors:0};
  let browser,profile,popupSession,stage='preflight',timer,failedIngest=false,consentResponses=0;
  const consentEndpoints=new Set(),consentPending=new Set();
  const nativeSessions=new Map(),nativeExceptions=[];let extensionOrigin=null,nativeWorkerSession=null;
  const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
  const remaining=()=>{const time=deadline-Date.now();if(time<=0)throw new Error('deadline');return time;};
  const pause=()=>new Promise(resolve=>setTimeout(resolve,250));
  async function evaluate(expression,session=popupSession){
    const result=await browser.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},session,Math.min(30000,remaining()));
    if(result.exceptionDetails)throw new Error('native-evaluation-failed');return result.result.value;
  }
  async function until(check,budget=30000){const end=Math.min(deadline,Date.now()+budget);while(Date.now()<end){try{if(await check())return true;}catch{/* A target may still be navigating. */}await pause();}return false;}
  async function instrument(session){
    await browser.send('Network.enable',{},session);
    await browser.send('Network.setBlockedURLs',{urls:['*googlevideo.com/*','*videoplayback*','*.mp4*','*.webm*','*.m3u8*']},session);
    await browser.send('Fetch.enable',{patterns:[{urlPattern:'http://*'},{urlPattern:'https://*'}]},session);
  }
  async function rejectConsent(session){
    const find="const labels=new Set(['Reject all','Alles ablehnen','Alles weigeren','Alles afwijzen','Alle cookies weigeren','Tout refuser','Rechazar todo']);const button=[...document.querySelectorAll('button')].slice(0,400).find(b=>b.getClientRects().length&&labels.has((b.innerText??'').trim()));";
    const candidate=await evaluate("(()=>{"+find+"if(!button)return null;const form=button.form??button.closest('form');return {action:form?.action??null,method:(form?.method??'GET').toUpperCase()};})()",session);
    if(!candidate)return false;let expectsResponse=false;
    if(candidate.action){const target=new URL(candidate.action);if(['consent.youtube.com','consent.google.com'].includes(target.hostname)&&target.protocol==='https:'&&['GET','POST'].includes(candidate.method)){
      consentEndpoints.add(target.origin+target.pathname+':'+candidate.method);expectsResponse=true;
    }}
    const before=consentResponses;await evaluate("(()=>{"+find+"if(button)button.click();})()",session);
    if(expectsResponse&&!await until(()=>consentResponses>before,15000))throw new Error('privacy-rejection-not-confirmed');
    await pause();return true;
  }
  async function cookingDocumentQuality(session){return evaluate("(()=>{const text=(document.body?.innerText??'').slice(0,4096).toLowerCase();return {documentTitleKapsalon:document.title.toLowerCase().includes('kapsalon'),cookingKeywords:(text.match(/\\b(?:kapsalon|kip|friet|chicken|fries)\\b/gu)??[]).length,consentKeywords:(text.match(/\\b(?:cookies?|consent|privacy|toestemming|datenschutz|advertising|tracking)\\b/gu)??[]).length,cookieOverlayVisible:[...document.querySelectorAll('[role=dialog],ytd-consent-bump-v2-lightbox,form[action*=consent]')].some(n=>n.getClientRects().length&&/cookie|consent|privacy|toestemming|datenschutz/iu.test(n.innerText??''))};})()",session);}
  async function nativeBreakpoint(session,url,line,entry){
    const condition="(globalThis.__murmingleQaNativeStages=(globalThis.__murmingleQaNativeStages??[]).slice(-23).concat("+entry+"),false)";
    await browser.send('Debugger.setBreakpointByUrl',{url,lineNumber:line-1,condition},session);
  }
  async function attachNativeDiagnostics(){
    if(!diagnoseNative)return;
    const targets=(await browser.send('Target.getTargets')).targetInfos;
    for(const target of targets){
      if(nativeSessions.has(target.targetId)||!['embedding/offscreen.html','embedding/inference-worker.js'].some(p=>target.url===extensionOrigin+'/'+p))continue;
      const session=(await browser.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
      nativeSessions.set(target.targetId,{session,kind:target.url.endsWith('.html')?'offscreen':'embedding-worker'});
      await browser.send('Runtime.enable',{},session);await browser.send('Debugger.enable',{},session);
      if(target.url.endsWith('offscreen.html')){
        await nativeBreakpoint(session,extensionOrigin+'/embedding/offscreen.js',12,"{stage:'offscreen-admission',pending:!!pending}");
        await nativeBreakpoint(session,extensionOrigin+'/embedding/offscreen.js',18,"{stage:'offscreen-worker-result',hasEmbedding:!!data?.embedding,fixedError:['model-unavailable','cancelled'].includes(data?.error)?data.error:null}");
      }else await browser.send('Debugger.setPauseOnExceptions',{state:'all'},session);
    }
  }
  async function nativeSnapshot(){
    if(!diagnoseNative)return;
    const contexts=[];
    for(const [kind,session] of [['background',nativeWorkerSession],...[...nativeSessions.values()].map(v=>[v.kind,v.session])]){
      try{contexts.push({kind,stages:await evaluate('globalThis.__murmingleQaNativeStages??[]',session)});}catch{contexts.push({kind,closed:true});}
    }
    emit({stage,result:'native-diagnostics',contexts,exceptions:nativeExceptions});
  }
  try {
    const data=path.join(ROOT,'apps/local-service/data');
    const pairing=JSON.parse(readFileSync(path.join(data,'pairing.json'),'utf8'));
    if(pairing.state!=='active'||!/^chrome-extension:\/\/[a-p]{32}$/u.test(pairing.origin))throw new Error('pairing-unavailable');
    let token=readFileSync(path.join(data,'pairing-recovery/pairing-token.txt'),'utf8').trim();
    if(!/^[A-Za-z0-9._-]{32,256}$/u.test(token))throw new Error('pairing-unavailable');
    profile=mkdtempSync(path.join(tmpdir(),'murmingle-public-native-qa-'));
    const source=readFileSync(new URL('./chromium-pipe.js',import.meta.url),'utf8');
    const old='--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1';
    if(source.split(old).length!==2)throw new Error('launcher-shape-changed');
    const customized=source.replace(old,old+', '+[...HOSTS,'consent.youtube.com','consent.google.com'].map(host=>'EXCLUDE '+host).join(', '));
    const {launchChromiumPipe}=await import('data:text/javascript;base64,'+Buffer.from(customized).toString('base64'));
    stage='isolated-browser-start';
    browser=launchChromiumPipe({executable:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',profileDirectory:path.join(profile,'profile')});
    await browser.send('Browser.getVersion');
    await browser.send('Target.setDiscoverTargets',{discover:true});
    timer=setTimeout(()=>void browser?.close(),remaining());
    browser.on('Runtime.exceptionThrown',({exceptionDetails})=>{violations.errors++;if(uiErrors.length>=5)return;
      const known=new Set(['Error','TypeError','RangeError','SyntaxError','ReferenceError']),frame=exceptionDetails.stackTrace?.callFrames?.[0];
      let file='other';try{const name=new URL(frame?.url??exceptionDetails.url).pathname.split('/').at(-1);if(['popup.js','discovery-panel.js','topic-space-panel.js','discussion-panel.js','insight-panel.js','account-panel.js'].includes(name))file=name;}catch{}
      uiErrors.push({name:known.has(exceptionDetails.exception?.className)?exceptionDetails.exception.className:'unknown',file,
        line:Number.isSafeInteger(frame?.lineNumber)?frame.lineNumber+1:null});
    });
    browser.on('Network.requestWillBeSent',({request,requestId,timestamp,redirectResponse},session)=>{
      if(redirectResponse&&consentPending.delete(session+':'+requestId))consentResponses++;
      try{const url=new URL(request.url);if(url.origin!=='http://127.0.0.1:4174')return;
        const category=['/v1/catalog/selection','/v1/catalog/url-selection','/v1/sources/enrichment','/v1/topic-spaces/query'].includes(url.pathname)?url.pathname.slice(4):/^\/v1\/topics\/[A-Za-z0-9._:-]+\/discussion$/u.test(url.pathname)?'discussion-preview':null;
        if(category&&requestStarts.size<64)requestStarts.set(session+':'+requestId,{category,started:timestamp,site:['video','recipe','http'].includes(stage)?stage:'setup'});
      }catch{}
    });
    browser.on('Network.responseReceived',({response,requestId,timestamp},session)=>{
      if(consentPending.delete(session+':'+requestId))consentResponses++;
      try{const url=new URL(response.url);if(url.origin==='http://127.0.0.1:4174'){statusCounts[response.status]=(statusCounts[response.status]??0)+1;
        const category=url.pathname==='/v1/sources/ingest'?'ingest':READ_POSTS.has(url.pathname)?url.pathname.slice(4):SAFE_GET.test(url.pathname)?'public-get':'other';
        const key=category+':'+response.status;routeStatuses[key]=(routeStatuses[key]??0)+1;
        const timing=requestStarts.get(session+':'+requestId);if(timing){requestStarts.delete(session+':'+requestId);if(readTimings.length<64)readTimings.push({category:timing.category,site:timing.site,elapsedMs:Math.max(0,Math.round((timestamp-timing.started)*1000)),status:response.status});}
        if(category==='ingest'&&response.status>=400&&pendingErrorResponses.size<3){failedIngest=true;pendingErrorResponses.set(session+':'+requestId,{requestId,session,status:response.status});}}}catch{}
    });
    browser.on('Network.loadingFinished',({requestId},session)=>{
      const key=session+':'+requestId,failed=pendingErrorResponses.get(key);if(!failed)return;pendingErrorResponses.delete(key);
      responseInspections.push((async()=>{try{
        const body=await browser.send('Network.getResponseBody',{requestId},session);const decoded=body.base64Encoded?Buffer.from(body.body,'base64').toString('utf8'):body.body;
        if(typeof decoded!=='string'||Buffer.byteLength(decoded)>2048){ingestErrors.push({status:failed.status,error:'body-outside-bound'});return;}
        const value=JSON.parse(decoded),codes=new Set(['internal','invalid-request','unauthorized','forbidden','not-found','conflict','capacity','request-too-large','alternate-unavailable','authentication-required','unavailable']);
        const messages=new Set(['Internal error','Invalid request','Request unavailable','Read unavailable','Page ingestion unavailable']);
        ingestErrors.push({status:failed.status,error:codes.has(value?.error)?value.error:'unrecognized',
          ...(messages.has(value?.message)?{message:value.message}:{})});
      }catch{ingestErrors.push({status:failed.status,error:'body-unavailable'});}})());
    });
    browser.on('Debugger.paused',(event,session)=>{void(async()=>{
      try{if(nativeExceptions.length<8){
        const known=new Set(['Error','TypeError','RangeError','ReferenceError','RuntimeError']),frame=event.callFrames?.[0],url=frame?.url??'';
        let file='other';if(extensionOrigin&&url.startsWith(extensionOrigin+'/')){const candidate=new URL(url).pathname.split('/').at(-1);if(/^[a-z0-9._-]{1,64}\.js$/iu.test(candidate))file=candidate;}
        let category={};if(event.data?.objectId){const inspected=await browser.send('Runtime.callFunctionOn',{objectId:event.data.objectId,returnByValue:true,functionDeclaration:"function(){const d=Object.getOwnPropertyDescriptor(this,'message'),v=d&&Object.hasOwn(d,'value')?d.value:'';return {memoryLike:typeof v==='string'&&/out of memory|memory allocation|insufficient memory|array buffer allocation/iu.test(v),cancelled:v==='cancelled',modelUnavailable:v==='model-unavailable'};}"},session);category=inspected.result?.value??{};}
        nativeExceptions.push({name:known.has(event.data?.className)?event.data.className:'unknown',file,line:Number.isSafeInteger(frame?.location?.lineNumber)?frame.location.lineNumber+1:null,...category});
      }}finally{await browser.send('Debugger.resume',{},session).catch(()=>{});}
    })().catch(()=>{});});
    browser.on('Fetch.requestPaused',(event,session)=>{void (async()=>{
      const url=new URL(event.request.url);let allowed=false;
      if(url.origin==='http://127.0.0.1:4174') {
        if(url.pathname==='/v1/ai/models'){violations.providerReadsBlocked++;await browser.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'},session);return;}
        const safePath=SAFE_GET.test(url.pathname)||READ_POSTS.has(url.pathname)||url.pathname==='/v1/sources/ingest';
        allowed=event.request.method==='OPTIONS'?safePath:event.request.method==='GET'?SAFE_GET.test(url.pathname):event.request.method==='POST'&&(READ_POSTS.has(url.pathname)||url.pathname==='/v1/sources/ingest');
        const category=url.pathname==='/v1/sources/ingest'?'ingest':READ_POSTS.has(url.pathname)?url.pathname.slice(4):SAFE_GET.test(url.pathname)?'public-get':'forbidden';
        routes[category]=(routes[category]??0)+1;if(!allowed){violations.forbiddenService++;const method=/^[A-Z]{1,10}$/u.test(event.request.method)?event.request.method:'unknown';blockedMethods[method+':'+category]=(blockedMethods[method+':'+category]??0)+1;}
      }else{allowed=url.protocol==='https:'&&HOSTS.has(url.hostname)&&event.resourceType!=='Media';
        if(!allowed&&consentEndpoints.has(url.origin+url.pathname+':'+event.request.method)){
          allowed=true;if(event.networkId)consentPending.add(session+':'+event.networkId);
        }
        if(!allowed)violations.otherNetwork++;}
      await browser.send(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId:event.requestId}:{requestId:event.requestId,errorReason:'BlockedByClient'},session);
    })().catch(()=>{violations.networkGuardErrors++;});});
    stage='extension-load';
    const loaded=await browser.send('Extensions.loadUnpacked',{path:path.join(ROOT,'spikes/topic-resolution/browser')});
    if(`chrome-extension://${loaded.id}`!==pairing.origin)throw new Error('extension-origin-mismatch');
    extensionOrigin=pairing.origin;
    stage='broad-native-permission-allowlisted-network';emit({stage,sites:sites.length,profile:'isolated-temporary',accountLogin:false,provider:false,posts:false});
    const managerTarget=await browser.send('Target.createTarget',{url:'chrome://extensions/'});
    const manager=await browser.send('Target.attachToTarget',{targetId:managerTarget.targetId,flatten:true});
    if(!await until(()=>evaluate("typeof chrome.developerPrivate?.addHostPermission==='function'",manager.sessionId)))throw new Error('permission-manager-unavailable');
    stage='native-permission-grant';
    const grant=await browser.send('Runtime.evaluate',{expression:`chrome.developerPrivate.addHostPermission(${JSON.stringify(loaded.id)},'https://*/*')`,awaitPromise:true,returnByValue:true,userGesture:true},manager.sessionId);
    if(grant.exceptionDetails){emit({stage,managerError:String(grant.exceptionDetails.exception?.description??'native-permission-failed').replaceAll(loaded.id,'[isolated-extension]').slice(0,200)});throw new Error('native-permission-failed');}
    await browser.send('Target.closeTarget',{targetId:managerTarget.targetId});
    let worker;
    if(!await until(async()=>{const targets=await browser.send('Target.getTargets');worker=targets.targetInfos.find(t=>t.type==='service_worker'&&t.url===pairing.origin+'/chromium/background.js');return Boolean(worker);} ))throw new Error('native-worker-unavailable');
    const workerSession=(await browser.send('Target.attachToTarget',{targetId:worker.targetId,flatten:true})).sessionId;
    nativeWorkerSession=workerSession;
    await instrument(workerSession);
    if(diagnoseNative){await browser.send('Runtime.enable',{},workerSession);await browser.send('Debugger.enable',{},workerSession);
      for(const [line,label] of [[91,'embedding-start'],[93,'embedding-complete'],[94,'attestation-start'],[95,'attestation-complete'],[100,'matching-start']])await nativeBreakpoint(workerSession,pairing.origin+'/core/background-matcher.js',line,JSON.stringify({stage:label}));
      await nativeBreakpoint(workerSession,pairing.origin+'/core/background-matcher.js',152,"{stage:'matcher-catch',fixedCode:['unauthorized','conflict','capacity','invalid-request'].includes(error?.code)?error.code:null,fixedMessage:['cancelled','model-unavailable'].includes(error?.message)?error.message:null,errorName:['Error','TypeError','RangeError'].includes(error?.name)?error.name:'unknown'}");
    }
    stage='native-worker-configure';
    if(!await until(()=>evaluate("typeof chrome.sidePanel?.setPanelBehavior==='function'&&typeof chrome.action?.setPopup==='function'",workerSession)))throw new Error('native-worker-not-ready');
    await evaluate("(async()=>{await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:false});await chrome.action.setPopup({popup:'chromium/popup.html'});})()",workerSession);
    stage='public-page-open';
    const page=await browser.send('Target.createTarget',{url:'about:blank'});
    const pageSession=(await browser.send('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;
    await instrument(pageSession);
    await browser.send('Page.navigate',{url:firstSite},pageSession);
    await until(()=>evaluate("document.readyState==='complete'&&(document.body?.innerText.length??0)>80",pageSession),45000);
    const firstRejected=await rejectConsent(pageSession);emit({stage:sites[0][0],result:'privacy-choice',clickedRejectAll:firstRejected});
    if(firstRejected)await until(()=>evaluate("document.readyState==='complete'&&(document.body?.innerText.length??0)>80",pageSession),45000);
    if(sites[0][0]!=='http'){const quality=await cookingDocumentQuality(pageSession);emit({stage:sites[0][0],result:'before-capture-quality',...quality});if(!quality.documentTitleKapsalon||quality.cookingKeywords===0)throw new Error('public-cooking-document-not-confirmed');}
    await browser.send('Page.bringToFront',{},pageSession);
    let nativeTab;
    if(!await until(async()=>{const targets=await browser.send('Target.getTargets',{filter:[{type:'tab',exclude:false},{exclude:true}]});nativeTab=targets.targetInfos.find(t=>t.type==='tab'&&t.url===firstSite);return Boolean(nativeTab);}))throw new Error('native-public-tab-unavailable');
    await browser.send('Extensions.triggerAction',{id:loaded.id,targetId:nativeTab.targetId});
    let popup;
    if(!await until(async()=>{const targets=await browser.send('Target.getTargets');popup=targets.targetInfos.find(t=>t.url===pairing.origin+'/chromium/popup.html');return Boolean(popup);}))throw new Error('native-popup-unavailable');
    popupSession=(await browser.send('Target.attachToTarget',{targetId:popup.targetId,flatten:true})).sessionId;
    await browser.send('Runtime.enable',{},popupSession);await instrument(popupSession);
    if(!await until(()=>evaluate("document.readyState==='complete'&&!!document.querySelector('#discussion-body')")))throw new Error('packaged-ui-unavailable');
    await evaluate(`(async()=>{const {createLocalServiceSessionProxy}=await import('../core/local-service-session.js');await createLocalServiceSessionProxy({sendMessage:message=>chrome.runtime.sendMessage(message)}).setToken(${JSON.stringify(token)});})()`);
    token=null;
    await browser.send('Page.reload',{ignoreCache:true},popupSession);
    if(!await until(()=>evaluate("document.readyState==='complete'&&!!document.querySelector('#matching-enable')")))throw new Error('packaged-ui-reload-unavailable');
    await evaluate("document.querySelector('#app-settings-button').click()");
    if(!await until(()=>evaluate("(()=>{const b=document.querySelector('#matching-enable');return b&&!b.disabled&&!b.hidden&&b.getClientRects().length>0})()")))throw new Error('normal-start-unavailable');
    await evaluate("document.querySelector('#matching-enable').click()");
    await evaluate("document.querySelector('#app-tab-discussion').click()");
    for(const [site,url] of sites) {
      stage=site;const started=Date.now();if(url!==firstSite)await browser.send('Page.navigate',{url},pageSession);
      const expected=new URL(url);
      if(!await until(()=>evaluate(`document.readyState==='complete'&&location.hostname===${JSON.stringify(expected.hostname)}&&(location.pathname===${JSON.stringify(expected.pathname)}||location.pathname.startsWith(${JSON.stringify(expected.pathname+'/')}))&&(document.body?.innerText.length??0)>80`,pageSession),45000))throw new Error('approved-public-document-not-ready');
      if(url!==firstSite){const rejected=await rejectConsent(pageSession);emit({stage:site,result:'privacy-choice',clickedRejectAll:rejected});if(rejected&&!await until(()=>evaluate("document.readyState==='complete'&&(document.body?.innerText.length??0)>80",pageSession),45000))throw new Error('privacy-document-not-ready');}
      if(url!==firstSite){
        if(site!=='http'){const quality=await cookingDocumentQuality(pageSession);emit({stage:site,result:'before-capture-quality',...quality});if(!quality.documentTitleKapsalon||quality.cookingKeywords===0)throw new Error('public-cooking-document-not-confirmed');}
        await evaluate("document.querySelector('#app-settings-button').click()");
        if(!await until(()=>evaluate("(()=>{const b=document.querySelector('#matching-enable');return b&&!b.disabled&&!b.hidden&&b.getClientRects().length>0})()")))throw new Error('normal-page-start-unavailable');
        await evaluate("document.querySelector('#matching-enable').click();document.querySelector('#app-tab-discussion').click()");
      }
      const activeDocument=await evaluate('location.href',pageSession);
      let ready=false,localDraft=false,previous='',samples=0;
      const end=Math.min(deadline,Date.now()+180000);
      while(Date.now()<end){
        await attachNativeDiagnostics();
        const value=await evaluate(`(async()=>{const s=await chrome.runtime.sendMessage({target:'page-matching',type:'status'});const b=document.querySelector('#discussion-body');return {phase:s.phase,reason:/^[a-z0-9-]{1,64}$/.test(s.reason??'')?s.reason:null,enabled:s.enabled,hasSource:!!s.sourceId,currentPageBound:s.currentUrl===${JSON.stringify(activeDocument)}&&s.url===${JSON.stringify(activeDocument)}&&s.tabId===s.currentTabId&&s.currentWindowId===s.sessionWindowId&&s.contextReason===null,topicState:document.body.dataset.topicState??'',canType:!!b&&!b.disabled,sendDisabled:document.querySelector('#discussion-submit')?.disabled!==false,loadingVisible:document.querySelector('#discussion-loading-scene')?.hidden===false}})()`);
        samples++;const phase=typeof value.phase==='string'&&/^[a-z-]{1,32}$/u.test(value.phase)?value.phase:'unknown';phaseCounts[phase]=(phaseCounts[phase]??0)+1;
        if(failedIngest){await until(()=>ingestErrors.length>0,1000);await Promise.allSettled(responseInspections);throw new Error('native-ingest-http-failure');}
        const key=JSON.stringify(value);if(key!==previous){emit({stage:site,elapsedMs:Date.now()-started,...value});previous=key;}
        if(value.canType&&value.currentPageBound&&!localDraft){localDraft=await evaluate("(()=>{const b=document.querySelector('#discussion-body');b.focus();b.value='Local public QA draft; do not send.';b.dispatchEvent(new Event('input',{bubbles:true}));return document.activeElement===b&&b.value==='Local public QA draft; do not send.'})()");}
        if(phase==='ready'&&value.hasSource&&value.currentPageBound&&!value.loadingVisible){ready=true;break;}
        if(['unsupported','blocked','error'].includes(phase)&&samples>=8&&value.reason!=='no-focused-page')break;
        await pause();
      }
      emit({stage:site,result:'page-observation',ready,elapsedMs:Date.now()-started,samples,localDraft});
      await nativeSnapshot();
      if(ready&&site!=='http'){
        const quality=await evaluate(`(async()=>{
          const s=await chrome.runtime.sendMessage({target:'page-matching',type:'status'});
          const [{createPageContentReader},{inspectPageNavigationUrl},{createLocalServiceClient},{createLocalServiceSessionProxy}]=await Promise.all([
            import('./page-content-reader.js'),import('../core/page-content-policy.js'),import('../core/local-service-client.js'),import('../core/local-service-session.js')]);
          const navigation=inspectPageNavigationUrl(s.currentUrl);if(!navigation.supported)return {collected:false};
          const captured=await createPageContentReader(chrome.scripting).read(s.currentTabId,navigation.url,s.currentUrl);
          const r=captured.result,t=(r.text??'').toLowerCase(),cooking=(t.match(/\\b(?:kapsalon|kip|friet|chicken|fries)\\b/gu)??[]).length,
            consent=(t.match(/\\b(?:cookies?|consent|privacy|toestemming|datenschutz|advertising|tracking|personalisatie)\\b/gu)??[]).length;
          const session=createLocalServiceSessionProxy({sendMessage:m=>chrome.runtime.sendMessage(m)}),client=createLocalServiceClient({fetchImpl:fetch.bind(globalThis),getToken:session.getToken});
          const catalog=await client.urlSelection({url:navigation.url});const source=catalog.catalog.sources.find(source=>source.id===s.sourceId);
          return {collected:r.status==='collected',prefixCookingKeywords:cooking,prefixConsentKeywords:consent,consentDominant:consent>cooking&&consent>=3,
            captureTitleKapsalon:typeof r.title==='string'&&r.title.toLowerCase().includes('kapsalon'),catalogTitleKapsalon:source?.title?.toLowerCase().includes('kapsalon')===true,
            extractorVersion:['main-text-prefix/v1','article-container-prefix/v1'].includes(r.extractorVersion)?r.extractorVersion:null};
        })()`);
        const documentQuality=await evaluate("(()=>{const text=(document.body?.innerText??'').toLowerCase();const overlays=[...document.querySelectorAll('[role=dialog],ytd-consent-bump-v2-lightbox,form[action*=consent]')].filter(n=>n.getClientRects().length&&/cookie|consent|privacy|toestemming|datenschutz/iu.test(n.innerText??''));return {documentTitleKapsalon:document.title.toLowerCase().includes('kapsalon'),cookieOverlayVisible:overlays.length>0};})()",pageSession);
        emit({stage:site,result:'capture-quality',...quality,...documentQuality});
      }
      await evaluate("document.querySelector('#app-tab-discover').click()");
      await until(()=>evaluate("(()=>{const p=document.querySelector('.topic-space-panel'),s=document.querySelector('#topic-space-status'),r=document.querySelector('#topic-space-results');return p?.getAttribute('aria-busy')==='false'&&(r?.children.length>0||s?.textContent==='No discussions found.');})()"),30000);
      const previewStarted=Date.now();
      const discover=await evaluate("(()=>{const groups=document.querySelector('#topic-space-results');const b=groups?.querySelector('button');if(b){b.focus();b.click();}return {groups:groups?.children.length??0,opened:!!b,ownerControlsVisible:document.querySelector('#topic-space-owner')?.hidden===false}})()");
      if(discover.opened){discover.previewLoaded=await until(()=>evaluate("!!document.querySelector('#discovery-preview h3')&&!document.querySelector('#discovery-preview').hidden"),30000);
        discover.previewElapsedMs=Date.now()-previewStarted;
        discover.previewMetadata=await evaluate("(()=>{const p=document.querySelector('#discovery-preview');return {sourceLinks:p?.querySelectorAll('a').length??0,hasComposer:!!p?.querySelector('textarea,form'),groupsHidden:document.querySelector('.topic-space-panel')?.hidden===true}})()");
        await evaluate("document.querySelector('#discovery-back')?.click()");
        discover.returnFocus=await evaluate("document.activeElement?.id?.startsWith('topic-space-open-')===true&&!document.querySelector('.topic-space-panel')?.hidden");}
      emit({stage:site,result:'discover',...discover});
      await evaluate("document.querySelector('#app-tab-discussion').click()");
      if(url!==sites.at(-1)[1]){await evaluate("document.querySelector('#app-settings-button').click();document.querySelector('#matching-pause')?.click()");if(!await until(()=>evaluate("(async()=>{const s=await chrome.runtime.sendMessage({target:'page-matching',type:'status'});return s.enabled===false})()")))throw new Error('capture-pause-not-confirmed');await evaluate("document.querySelector('#app-tab-discussion').click()");}
    }
    await evaluate("document.querySelector('#app-settings-button').click();document.querySelector('#matching-pause')?.click()");
    await Promise.allSettled(responseInspections);
    stage='complete';emit({stage,phaseCounts,routes,statusCounts,routeStatuses,blockedMethods,ingestErrors,readTimings,uiErrors,violations});
    if(violations.forbiddenService)throw new Error('forbidden-service-request-blocked');
  }catch(error){const protocol=/^Chromium (?:protocol (?:timeout|rejected)|pipe (?:unavailable|ended))(?:[^A-Za-z]+|.*?for |.*?during )([A-Za-z]+\.[A-Za-z]+)/u.exec(error.message??'');emit({stage,result:'failed',code:typeof error.message==='string'&&/^[a-z-]{1,80}$/u.test(error.message)?error.message:'qa-operation-failed',...(protocol?{protocolMethod:protocol[1]}:{}),phaseCounts,routes,statusCounts,routeStatuses,blockedMethods,ingestErrors,readTimings,violations});throw new Error('public-native-qa-failed');}
  finally{clearTimeout(timer);await browser?.close();if(profile){const resolved=path.resolve(profile);if(path.dirname(resolved)!==path.resolve(tmpdir())||!path.basename(resolved).startsWith('murmingle-public-native-qa-')||!lstatSync(resolved).isDirectory())throw new Error('cleanup-target-invalid');rmSync(resolved,{recursive:true,force:true});}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--run-live'))await runLivePublicNativeQA({includeMdn:process.argv.includes('--with-mdn'),recipeOnly:process.argv.includes('--recipe-only'),mdnOnly:process.argv.includes('--mdn-only'),diagnoseNative:process.argv.includes('--diagnose-native')});
  else process.stdout.write('No action. --run-live explicitly runs at most two public sites (three with --with-mdn; one with --recipe-only), bounded to fifteen minutes.\n');
}
