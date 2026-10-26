// Inert by default. Exactly two owner-authorized fresh public exchanges, native UI only.
// Never logs account/session identifiers, request bodies, page text or answer text.
import {readFileSync,mkdtempSync,rmSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {prepareSessionPermission} from './prepare-session-permission.js';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),DATA=path.join(ROOT,'apps/local-service/data');
const VIDEO='https://www.youtube.com/watch?v=rd5EWR83AGs';
const QUESTIONS=Object.freeze([
  '@AI Antworte bitte in einem kurzen deutschen Satz: Welches Gericht wird laut Seitentitel in diesem Video gezeigt?',
  'Antwoord in één korte Nederlandse zin: Welk gerecht wordt volgens de paginatitel in deze video getoond?',
]);
const PUBLIC_READ_POSTS=new Set(['/v1/catalog/context','/v1/catalog/selection','/v1/catalog/url-selection','/v1/sources/enrichment','/v1/related','/v1/discover/search','/v1/topic-spaces/query','/v1/account/capabilities']);
const SAFE_GET=/^\/v1\/(?:health|version|catalog|ai\/(?:status|models)|topics\/[A-Za-z0-9._:-]+\/discussion|sources\/[A-Za-z0-9._:-]+\/(?:prior-discussions|alternate-discussion))$/u;
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');

export function existingAccountPreflight(){
  const saved=JSON.parse(readFileSync(path.join(DATA,'chatgpt-registration.json'),'utf8'));
  if(saved.schema!=='chatgpt-registration/v1'||typeof saved.registration?.clientId!=='string'||typeof saved.registration?.subject!=='string')throw new Error('registration-unavailable');
  const db=new DatabaseSync(path.join(DATA,'accounts.sqlite'),{readOnly:true});let rows;
  try{rows=db.prepare("SELECT accounts.id FROM external_identities JOIN accounts ON accounts.id=external_identities.account_id WHERE issuer=? AND client_id=? AND subject=? AND accounts.state='active' AND accounts.username IS NOT NULL").all('https://auth.openai.com',saved.registration.clientId,saved.registration.subject);}finally{db.close();}
  emit({stage:'existing-account-preflight',matched:rows.length===1,count:rows.length});
  if(rows.length!==1)throw new Error('existing-named-account-not-unique');return rows[0].id;
}
function answerLanguage(body){
  const tokens=new Set((body.toLowerCase().match(/[\p{L}]+/gu)??[]));
  const german=['der','die','das','ist','wird','mit','ein','eine','und','im','diesem','gericht','gezeigt'].filter(t=>tokens.has(t)).length;
  const dutch=['het','een','wordt','met','van','en','dit','gerecht','getoond','deze','volgens','bereid'].filter(t=>tokens.has(t)).length;
  return german>=2&&german>dutch?'de':dutch>=2&&dutch>german?'nl':'ambiguous';
}
export async function runLiveAiPublicNativeQA(){
  const expectedAccount=existingAccountPreflight(),deadline=Date.now()+900000;
  const counts={humanAttempts:0,humanAccepted:0,providerStarts:0,sharesAttempted:0,sharesAccepted:0,signIns:0,ingests:0,blockedOldRecovery:0,blockedUnexpected:0};
  const exchanges=[{},{}],records=new Map(),inspections=new Set(),httpStatuses={},routeStatuses={},failureCodes=[];
  let browser,profile,popupSession,stage='preflight',timer,current=-1,login=null,authenticated=false,failure=null;
  const remaining=()=>{const n=deadline-Date.now();if(n<=0)throw new Error('deadline');return n;};
  const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
  async function until(check,ms=30000){const end=Math.min(deadline,Date.now()+ms);while(Date.now()<end){if(failure)throw new Error(failure);try{if(await check())return true;}catch(error){if(failure)throw error;}await pause();}return false;}
  async function evaluate(expression,session=popupSession){const r=await browser.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},session,Math.min(30000,remaining()));if(r.exceptionDetails)throw new Error('native-evaluation-failed');return r.result.value;}
  async function instrument(session){await browser.send('Network.enable',{},session);await browser.send('Network.setBlockedURLs',{urls:['*googlevideo.com/*','*videoplayback*','*.mp4*','*.webm*']},session);await browser.send('Fetch.enable',{patterns:[{urlPattern:'http://*'},{urlPattern:'https://*'}]},session);}
  function remember(event,session,info){if(event.networkId)records.set(session+':'+event.networkId,info);}
  async function guard(event,session){
    const url=new URL(event.request.url),method=event.request.method;let allowed=false;
    if(url.origin==='http://127.0.0.1:4174'){
      const route=url.pathname;
      if(route==='/v1/ai/insights/resumable'){counts.blockedOldRecovery++;await browser.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'},session);return;}
      if(method==='OPTIONS')allowed=SAFE_GET.test(route)||PUBLIC_READ_POSTS.has(route)||['/v1/account/chatgpt','/v1/account/me','/v1/account/session/renew','/v1/account/session/logout','/v1/sources/ingest','/v1/commands','/v1/ai/insights','/v1/ai/insights/result'].includes(route);
      else if(method==='GET')allowed=SAFE_GET.test(route);
      else if(method==='POST'){
        if(PUBLIC_READ_POSTS.has(route))allowed=true;
        else if(route==='/v1/account/chatgpt'&&stage==='existing-account-sign-in'&&counts.signIns===0){counts.signIns++;allowed=true;remember(event,session,{kind:'account'});}
        else if(route==='/v1/account/me'&&authenticated)allowed=true;
        else if(route==='/v1/account/session/renew'&&authenticated&&JSON.parse(event.request.postData??'{}').refreshToken===login?.refreshToken){allowed=true;remember(event,session,{kind:'account'});}
        else if(route==='/v1/account/session/logout'&&stage==='cleanup'&&authenticated)allowed=true;
        else if(route==='/v1/sources/ingest'&&counts.ingests===0){counts.ingests++;allowed=true;remember(event,session,{kind:'ingest'});}
        else if(route==='/v1/commands'&&authenticated&&current>=0&&current<2){
          const command=JSON.parse(event.request.postData??'{}').command,exchange=exchanges[current];
          if(command?.type==='create-root'&&stage==='human-'+current&&counts.humanAttempts===current&&command.body===QUESTIONS[current]&&command.originSourceId){
            counts.humanAttempts++;exchange.sourceId=command.originSourceId;exchange.topicId=command.topicId;allowed=true;remember(event,session,{kind:'human',index:current});
          }else if(command?.type==='share-insight-reply'&&exchange.rootId&&exchange.operationId&&command.operationId===exchange.operationId&&command.rootId===exchange.rootId&&command.replyToId===exchange.rootId&&command.topicId===exchange.topicId&&command.originSourceId===exchange.sourceId&&counts.sharesAttempted===current){
            if(!exchange.generatedBody)await until(()=>Boolean(exchange.generatedBody),5000);
            if(command.body===exchange.generatedBody){counts.sharesAttempted++;allowed=true;remember(event,session,{kind:'share',index:current});}
          }
        }else if(route==='/v1/ai/insights'&&authenticated&&current>=0&&current<2){
          const request=JSON.parse(event.request.postData??'{}'),exchange=exchanges[current];
          if(!exchange.rootId)await until(()=>Boolean(exchange.rootId),5000);
          if(exchange.rootId&&request.followupQuestionId===exchange.rootId&&request.context?.currentSource?.id===exchange.sourceId&&request.context?.topic?.id===exchange.topicId&&request.allowWebResearch===false&&counts.providerStarts===current&&typeof request.operationId==='string'&&!exchanges.some(e=>e.operationId===request.operationId)){
            exchange.operationId=request.operationId;counts.providerStarts++;allowed=true;remember(event,session,{kind:'start',index:current});
          }
        }else if(route==='/v1/ai/insights/result'&&authenticated){
          const operation=JSON.parse(event.request.postData??'{}').operationId,index=exchanges.findIndex(e=>e.operationId===operation);
          if(index>=0){allowed=true;remember(event,session,{kind:'result',index});}
        }
      }
      if(!allowed){counts.blockedUnexpected++;failure='unexpected-route-or-duplicate-blocked';}
    }else allowed=url.protocol==='https:'&&url.hostname==='www.youtube.com'&&event.resourceType!=='Media';
    await browser.send(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId:event.requestId}:{requestId:event.requestId,errorReason:'BlockedByClient'},session);
  }
  try{
    const pairing=JSON.parse(readFileSync(path.join(DATA,'pairing.json'),'utf8'));let token=readFileSync(path.join(DATA,'pairing-recovery/pairing-token.txt'),'utf8').trim();
    if(pairing.state!=='active'||!/^chrome-extension:\/\/[a-p]{32}$/u.test(pairing.origin)||!/^[A-Za-z0-9._-]{32,256}$/u.test(token))throw new Error('pairing-unavailable');
    profile=mkdtempSync(path.join(tmpdir(),'murmingle-two-public-exchanges-'));
    const source=readFileSync(new URL('./chromium-pipe.js',import.meta.url),'utf8'),old='--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1';if(source.split(old).length!==2)throw new Error('launcher-shape-changed');
    const {launchChromiumPipe}=await import('data:text/javascript;base64,'+Buffer.from(source.replace(old,old+', EXCLUDE www.youtube.com')).toString('base64'));
    browser=launchChromiumPipe({executable:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',profileDirectory:path.join(profile,'profile')});await browser.send('Browser.getVersion');await browser.send('Target.setDiscoverTargets',{discover:true});timer=setTimeout(()=>void browser?.close(),remaining());
    browser.on('Fetch.requestPaused',(event,session)=>{void guard(event,session).catch(()=>{failure='network-guard-failed';});});
    browser.on('Network.responseReceived',({response,requestId},session)=>{if(response.url.startsWith('http://127.0.0.1:4174/')){
      httpStatuses[response.status]=(httpStatuses[response.status]??0)+1;const pathname=new URL(response.url).pathname;
      const category=pathname==='/v1/sources/ingest'?'ingest':pathname.startsWith('/v1/ai/')?pathname.slice(4):pathname.startsWith('/v1/account/')?'account':'public-read';
      routeStatuses[category+':'+response.status]=(routeStatuses[category+':'+response.status]??0)+1;
      const record=records.get(session+':'+requestId);if(record)record.status=response.status;
    }});
    browser.on('Network.loadingFinished',({requestId},session)=>{
      const key=session+':'+requestId,record=records.get(key);if(!record)return;records.delete(key);
      const work=(async()=>{const r=await browser.send('Network.getResponseBody',{requestId},session),raw=r.base64Encoded?Buffer.from(r.body,'base64').toString('utf8'):r.body;if(raw.length>1000000)throw new Error('response-bound');const value=JSON.parse(raw);
        if(record.status!==200){const safeCodes=new Set(['internal','invalid-request','unauthorized','forbidden','not-found','conflict','capacity','request-too-large','alternate-unavailable','authentication-required','unavailable']);
          failureCodes.push({stage:record.kind,status:record.status,error:safeCodes.has(value?.error)?value.error:'unrecognized'});
          failure=record.kind==='ingest'?'native-ingest-http-failure':'accepted-flow-http-failure';return;}
        if(record.kind==='account'){if(value.account?.id!==expectedAccount||!value.account.username||value.account.state!=='active'){failure='existing-account-response-mismatch';return;}login={accessToken:value.session.accessToken,refreshToken:value.session.refreshToken};authenticated=true;}
        if(record.kind==='human'){exchanges[record.index].rootId=value.result?.contributionId;if(!exchanges[record.index].rootId)failure='human-ack-invalid';else counts.humanAccepted++;}
        if(record.kind==='result'&&value.state==='completed'){const e=exchanges[record.index];e.generatedBody=value.result?.body;if(typeof e.generatedBody!=='string')failure='answer-body-invalid';else e.language=answerLanguage(e.generatedBody);}
        if(record.kind==='result'&&value.state==='failed')failure='provider-job-failed';
        if(record.kind==='share'){exchanges[record.index].answerId=value.result?.contributionId;if(!exchanges[record.index].answerId)failure='share-ack-invalid';else counts.sharesAccepted++;}
      })().catch(()=>{failure='bounded-response-inspection-failed';});inspections.add(work);void work.finally(()=>inspections.delete(work));
    });
    const loaded=await browser.send('Extensions.loadUnpacked',{path:path.join(ROOT,'spikes/topic-resolution/browser')});if(pairing.origin!==`chrome-extension://${loaded.id}`)throw new Error('extension-origin-mismatch');
    await prepareSessionPermission(browser,loaded.id);
    let worker;if(!await until(async()=>{worker=(await browser.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url===pairing.origin+'/chromium/background.js');return Boolean(worker);}))throw new Error('native-worker-unavailable');
    const workerSession=(await browser.send('Target.attachToTarget',{targetId:worker.targetId,flatten:true})).sessionId;await instrument(workerSession);
    if(!await until(()=>evaluate("typeof chrome.sidePanel?.setPanelBehavior==='function'",workerSession)))throw new Error('native-worker-not-ready');
    await evaluate("(async()=>{await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:false});await chrome.action.setPopup({popup:'chromium/popup.html'});})()",workerSession);
    const page=await browser.send('Target.createTarget',{url:'about:blank'}),pageSession=(await browser.send('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;await instrument(pageSession);await browser.send('Page.navigate',{url:VIDEO},pageSession);
    if(!await until(()=>evaluate("document.readyState==='complete'&&(document.body?.innerText.length??0)>80",pageSession),45000))throw new Error('public-page-not-ready');await browser.send('Page.bringToFront',{},pageSession);
    let tab;if(!await until(async()=>{tab=(await browser.send('Target.getTargets',{filter:[{type:'tab',exclude:false},{exclude:true}]})).targetInfos.find(t=>t.type==='tab'&&t.url===VIDEO);return Boolean(tab);}))throw new Error('native-tab-unavailable');await browser.send('Extensions.triggerAction',{id:loaded.id,targetId:tab.targetId});
    let popup;if(!await until(async()=>{popup=(await browser.send('Target.getTargets')).targetInfos.find(t=>t.url===pairing.origin+'/chromium/popup.html');return Boolean(popup);}))throw new Error('native-popup-unavailable');popupSession=(await browser.send('Target.attachToTarget',{targetId:popup.targetId,flatten:true})).sessionId;await instrument(popupSession);
    if(!await until(()=>evaluate("document.readyState==='complete'&&!!document.querySelector('#discussion-body')")))throw new Error('packaged-ui-unavailable');
    await evaluate(`(async()=>{const {createLocalServiceSessionProxy}=await import('../core/local-service-session.js');await createLocalServiceSessionProxy({sendMessage:m=>chrome.runtime.sendMessage(m)}).setToken(${JSON.stringify(token)});})()`);token=null;await browser.send('Page.reload',{ignoreCache:true},popupSession);
    if(!await until(()=>evaluate("document.readyState==='complete'&&!!document.querySelector('#matching-enable')")))throw new Error('packaged-ui-reload-unavailable');
    stage='existing-account-sign-in';await evaluate("document.querySelector('.account-profile-button').click()");
    if(!await until(()=>evaluate("(()=>{const b=document.querySelector('.account-sheet > button.account-secondary');return b&&!b.disabled&&!b.hidden&&b.textContent==='Continue with ChatGPT'&&b.getClientRects().length>0})()")))throw new Error('ordinary-chatgpt-sign-in-unavailable');
    await evaluate("document.querySelector('.account-sheet > button.account-secondary').click()");if(!await until(()=>authenticated))throw new Error('existing-account-sign-in-not-confirmed');
    if(!await until(()=>evaluate("document.querySelector('.account-profile-button')?.textContent?.startsWith('@')===true&&document.querySelector('.account-sheet')?.getAttribute('aria-busy')==='false'&&!document.querySelector('.account-profile')?.hidden")))throw new Error('existing-account-ui-not-ready');
    await evaluate("document.querySelector('.account-close').click()");emit({stage,existingAccountConfirmed:true});
    stage='native-page-ready';await evaluate("document.querySelector('#app-settings-button').click()");
    if(!await until(()=>evaluate("(()=>{const b=document.querySelector('#matching-enable');return b&&!b.hidden&&!b.disabled})()")))throw new Error('normal-start-unavailable');await evaluate("document.querySelector('#matching-enable').click()");
    await evaluate("(()=>{const c=document.querySelector('#insight-related-page-text');if(c.checked){c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}));}const s=document.querySelector('#insight-preference-replyLanguage');s.value='en';s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#app-tab-discussion').click();})()");
    let readySignature='';const readyStarted=Date.now();
    if(!await until(async()=>{
      const value=await evaluate("(async()=>{const s=await chrome.runtime.sendMessage({target:'page-matching',type:'status'}),body=document.querySelector('#discussion-body'),model=document.querySelector('#insight-model');return {phase:/^[a-z-]{1,32}$/.test(s.phase??'')?s.phase:'unknown',reason:/^[a-z0-9-]{1,64}$/.test(s.reason??'')?s.reason:null,hasSource:!!s.sourceId,hasTopic:!!s.topicId,topicState:document.body.dataset.topicState??'',bodyDisabled:body?.disabled!==false,sendDisabled:document.querySelector('#discussion-submit')?.disabled!==false,modelSelected:!!model?.value,modelOptions:model?.options.length??0,modelDisabled:model?.disabled!==false,accountNamed:document.querySelector('.account-profile-button')?.textContent?.startsWith('@')===true}})()");
      const signature=JSON.stringify(value);if(signature!==readySignature){emit({stage:'native-ready-preflight',elapsedMs:Date.now()-readyStarted,...value});readySignature=signature;}
      return value.phase==='ready'&&value.hasSource&&!value.bodyDisabled&&value.modelSelected;
    },180000))throw new Error('native-ready-account-model-not-confirmed');
    for(current=0;current<2;current++){
      const started=Date.now();stage='human-'+current;emit({stage,expectedLanguage:current?'nl':'de'});
      await evaluate(`(()=>{const b=document.querySelector('#discussion-body');b.focus();b.value=${JSON.stringify(QUESTIONS[current])};b.dispatchEvent(new Event('input',{bubbles:true}));if(document.querySelector('#discussion-submit').disabled)throw Error('send-gated');document.querySelector('#discussion-submit').click();})()`);
      if(!await until(()=>Boolean(exchanges[current].rootId),30000))throw new Error('human-not-confirmed');
      if(current===1){stage='deliberate-sparkle';const rootId=exchanges[current].rootId;if(!await until(()=>evaluate(`(()=>{const b=document.querySelector('[data-contribution-id=${JSON.stringify(rootId)}][data-action=getinsights]');return b&&!b.disabled})()`)))throw new Error('exact-root-sparkle-unavailable');await evaluate(`document.querySelector('[data-contribution-id=${JSON.stringify(rootId)}][data-action=getinsights]').click()`);}
      if(!await until(()=>Boolean(exchanges[current].answerId),120000))throw new Error('answer-share-not-confirmed');
      const e=exchanges[current];await until(()=>evaluate(`(()=>{const card=document.querySelector('[data-post-id=${JSON.stringify(e.answerId)}]');return !!card&&card.getClientRects().length>0&&!!card.querySelector('[data-reply-to-id=${JSON.stringify(e.rootId)}]')})()`),5000);
      const published=await evaluate(`(()=>{const card=document.querySelector('[data-post-id=${JSON.stringify(e.answerId)}]');return {visible:!!card&&card.getClientRects().length>0,replyLevel:card?.querySelector('[data-reply-to-id=${JSON.stringify(e.rootId)}]')?1:null}})()`);
      emit({stage:'exchange-complete',exchange:current+1,elapsedMs:Date.now()-started,expectedLanguage:current?'nl':'de',languageHeuristic:e.language,languageMatchesExpected:e.language===(current?'nl':'de'),...published});
      if(!published.visible||published.replyLevel!==1)throw new Error('published-reply-level-not-confirmed');
    }
    stage='cleanup';await evaluate("document.querySelector('#app-settings-button').click();document.querySelector('#matching-pause')?.click();document.querySelector('.account-profile-button').click()");
    await evaluate("document.querySelector('.account-profile > button.account-secondary').click()");await Promise.allSettled([...inspections]);emit({stage:'complete',counts,httpStatuses,routeStatuses,failureCodes,retainedPublicExchanges:2});
  }catch(error){emit({stage,result:'stopped',code:/^[a-z0-9-]{1,80}$/u.test(error.message??'')?error.message:'native-qa-failed',counts,httpStatuses,routeStatuses,failureCodes});throw new Error('two-public-exchanges-stopped-no-retry');}
  finally{clearTimeout(timer);await browser?.close();login=null;for(const e of exchanges)delete e.generatedBody;if(profile){const resolved=path.resolve(profile);if(path.dirname(resolved)!==path.resolve(tmpdir())||!path.basename(resolved).startsWith('murmingle-two-public-exchanges-')||!lstatSync(resolved).isDirectory())throw new Error('cleanup-target-invalid');rmSync(resolved,{recursive:true,force:true});}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--run-live')&&process.argv.includes('--confirm-two-exchanges'))await runLiveAiPublicNativeQA();
  else if(process.argv.includes('--preflight'))existingAccountPreflight();
  else process.stdout.write('No action. Requires --run-live --confirm-two-exchanges after owner GO; --preflight is read-only.\n');
}
