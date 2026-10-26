// ADR206 pure, unregistered owner successor; no capture/runtime authority.
import {fail,fields,dense,identity} from '../native-specificity-study-v17/article-owner.mjs';
export {ArticleOwnerError,fail,fields,dense,identity,CALLBACK_KINDS,createCallbackObservation} from '../native-specificity-study-v17/article-owner.mjs';
export function createArticleOwner({infrastructure,cases,clock=()=>performance.now()}){
 const roster=dense(cases,4);if(roster.length!==4)fail("contract");
 for(let i=0;i<4;i++){const c=fields(roster[i]);identity(c.id);if(c.nativeOrdinal!==i+1||typeof c.url!=="string"||!c.url.startsWith("https://"))fail("contract");}
 const articles=new Map(),all=new Set();let anchorContext=null,pending=null,closing=false,events=0,released=false,nextOrdinal=1;
 let navigationFailed=false,navigationError,navigationObservation=null;
 function navigationRefusal(predicate,state='unexamined',urlRelation='unexamined'){
  try{fail('article-navigation');}catch(error){
   if(!released&&!navigationFailed){navigationFailed=true;navigationError=error;
    try{navigationObservation=Object.freeze({schema:'native-article-navigation-witness/v1',predicate,state,urlRelation});}catch{navigationObservation=null;}}
   throw error;
  }
 }
 function check(){if(released)fail('released');if(pending&&clock()>=pending.until)fail('article-deadline');}
 function count(){if(++events>4096)fail('event-capacity');}
 // Logical, not V8 allocation: header128; set entry32+ASCII ID; map entry32;
 // field-name bytes plus strings/8-byte scalar/64-byte retained function slot.
 function accounting(){let bytes=128+8192+512;for(const id of all)bytes+=32+id.length;for(const r of articles.values()){bytes+=32;for(const [key,value]of Object.entries(r))bytes+=key.length+(typeof value==='string'?value.length:typeof value==='function'?64:8);}if(pending)bytes+=1024;return bytes;}
 function bounded(){if(accounting()>32768)fail('registry-capacity');}
 function charge(t){all.add(t.targetId);if(all.size>32)fail('target-capacity');bounded();}
 function info(value){const d=fields(value),t=fields(d.targetInfo);identity(t.targetId);if(Object.hasOwn(t,'browserContextId'))identity(t.browserContextId);if(typeof t.attached!=='boolean'||typeof t.type!=='string'||typeof t.url!=='string'||t.url.length>2048)fail('target-contract');return t;}
 function candidate(t){if(t.type!=='page'||t.url!=='about:blank'||t.browserContextId!==anchorContext||Object.hasOwn(t,'parentId')||Object.hasOwn(t,'openerId')||all.has(t.targetId))fail('unexpected-page');}
 function articleSame(r,t){if(r.terminal||t.type!=='page'||t.browserContextId!==r.context||Object.hasOwn(t,'parentId')||Object.hasOwn(t,'openerId')||t.url!==r.url&&!(r.state==='navigating'&&t.url===r.caseUrl))fail('article-identity');if(t.url===r.caseUrl)r.url=t.url;}
 function authenticateReady(){const p=pending;if(!p||!p.target||!p.returned||!p.page||!p.authInfo)return null;const r=p.target,t=p.authInfo;if(p.returned!==p.page||p.authenticated)fail('article-unmatched');articleSame(r,t);if(t.targetId!==r.id||t.url!=='about:blank'||!t.attached)fail('article-unmatched');r.state='authenticated';r.attached=true;p.authenticated=true;if(p.authResolve){p.authResolve(r.id);p.authResolve=null;p.authReject=null;}return r.id;}
 return Object.freeze({
  seal(value){check();const t=info(value);infrastructure.seal(value);anchorContext=t.browserContextId;charge(t);},
  reserve(fixture,until){check();if(pending||closing||!anchorContext||[...articles.values()].some(r=>!r.terminal)||!Number.isFinite(until)||clock()>=until||nextOrdinal>4||fixture.ordinal<nextOrdinal||fixture.ordinal>4||fixture.id!==roster[fixture.ordinal-1].id||fixture.url!==roster[fixture.ordinal-1].url)fail('article-slot');nextOrdinal=fixture.ordinal+1;pending={fixture,until,target:null,page:null,returned:null,authenticated:false};bounded();},
  page(value){check();count();if(!pending||pending.page||!value||pending.returned&&pending.returned!==value)fail('unexpected-page');pending.page=value;authenticateReady();},
  returned(value){check();if(!pending||pending.returned||!value||pending.page&&pending.page!==value)fail('article-slot');pending.returned=value;authenticateReady();},
  pageNavigation(frame,mainFrame,url){
   try{check();const p=pending,r=p?.target;
    if(!p)navigationRefusal('pending');
    if(frame!==mainFrame)navigationRefusal('frame');
    if((!r||['provisional','authenticated'].includes(r.state))&&url==='about:blank'&&!p.initialBlankSeen){p.initialBlankSeen=true;return;}
    if(!r)navigationRefusal('target','absent',typeof url!=='string'?'unavailable':url==='about:blank'?'blank':'other');
    const state=r.state;
    if(!['navigating','reading'].includes(state))navigationRefusal('state',state);
    if(r.pageCommitSeen)navigationRefusal('repeat',state);
    if(url!==r.caseUrl)navigationRefusal('url',state,typeof url!=='string'?'unavailable':url==='about:blank'?'blank':'other');
    r.pageCommitSeen=true;bounded();
   }catch(error){if(!released&&!navigationFailed){navigationFailed=true;navigationError=error;navigationObservation=null;}throw error;}
  },
  navigationWitnessFor(error){return arguments.length===1&&!released&&navigationFailed&&Object.is(error,navigationError)?navigationObservation:null;},
  created(value){check();count();const t=info(value);
   if(t.type==='page'&&pending){candidate(t);if(pending.target)fail('unexpected-page');const r={id:t.targetId,context:t.browserContextId,url:t.url,caseUrl:pending.fixture.url,state:'provisional',terminal:false,attached:t.attached,frame:null,loader:null};articles.set(r.id,r);charge(t);pending.target=r;authenticateReady();return;}
   if(articles.has(t.targetId))fail('article-revival');charge(t);const trusted=infrastructure.targetPayload(value);if(!infrastructure.created(trusted,closing))fail('unexpected-target');
  },
  worker(value){check();const t=info(value);if(all.has(t.targetId))fail('target-duplicate');charge(t);infrastructure.worker(infrastructure.targetPayload(value));},
  lifecycle(event,value){check();count();const d=fields(value),t=event==='target-info-changed'?info(value):null,id=identity(t?t.targetId:d.targetId),r=articles.get(id);
   if(!r){infrastructure.lifecycle(event,value,closing);return;}
   if(event==='target-info-changed'){articleSame(r,t);if(r.state==='retiring'&&t.attached&&r.attached===false)fail('article-revival');r.attached=t.attached;}
   else{if(event!=='target-destroyed'||r.terminal||r.state!=='retiring'&&!closing)fail('article-lifecycle');r.terminal=true;r.state='terminal';if(r.settleRetired)r.settleRetired();}
  },
  authenticate(value){check();if(!pending||pending.authInfo)fail('article-unmatched');pending.authInfo=info(value);const result=authenticateReady();if(result===null)fail('article-unmatched');return result;},
  awaitAuthentication(value){check();if(!pending||pending.authInfo)fail('article-unmatched');pending.authInfo=info(value);return new Promise((resolve,reject)=>{pending.authResolve=resolve;pending.authReject=reject;try{authenticateReady();}catch(e){reject(e);}});},
  abortPending(error){if(pending?.authReject){pending.authReject(error);pending.authReject=null;pending.authResolve=null;}},
  navigate(frameId,blankLoaderId){check();const p=pending;if(!p?.authenticated)fail('article-unmatched');const r=p.target;if(r.state!=='authenticated')fail('navigation-repeated');r.frame=identity(frameId);r.blankLoader=identity(blankLoaderId);r.state='navigating';bounded();},
  commit(value){check();const f=fields(fields(value).frame),r=pending?.target;if(!r||r.state!=='navigating'||r.loader||Object.hasOwn(f,'parentId')||f.id!==r.frame||f.url!==r.caseUrl||identity(f.loaderId)===r.blankLoader)fail('navigation-journey');r.loader=f.loaderId;r.url=f.url;bounded();},
  verifyNavigation(value){check();const d=fields(value),r=pending?.target;if(!r||!r.loader||d.frameId!==r.frame||d.loaderId!==r.loader||Object.hasOwn(d,'errorText'))fail('navigation-journey');r.state='reading';},
  assertReading(){check();if(pending?.target?.state!=='reading')fail('late-read');},
  retire(){check();const r=pending?.target;if(!r||!['reading','navigating','authenticated'].includes(r.state))fail('article-retirement');r.state='retiring';pending.until=Infinity;return new Promise(resolve=>{r.settleRetired=resolve;});},
  retired(){check();if(!pending?.target?.terminal)fail('article-retirement');pending=null;},
  census(value,phase,workerUrl){check();const rows=dense(fields(value).targetInfos,32),seen=new Set(),base=[];for(const row of rows){const t=fields(row);identity(t.targetId);if(seen.has(t.targetId))fail('census-duplicate');seen.add(t.targetId);charge(t);const r=articles.get(t.targetId);if(r){if(r.terminal)fail('census-revival');articleSame(r,t);}else base.push(row);}
   for(const r of articles.values())if(!r.terminal&&!seen.has(r.id))fail('census-omission');const result=infrastructure.census({targetInfos:base},phase,workerUrl);return Object.freeze({...result,articleTargets:rows.length-base.length,articleTombstones:[...articles.values()].filter(r=>r.terminal).length});},
  setClosing(){check();closing=true;},snapshot(){return Object.freeze({events,targets:all.size,articles:articles.size,tombstones:[...articles.values()].filter(r=>r.terminal).length,pending:pending!==null,retainedBytes:accounting()});},
  release(){articles.clear();all.clear();pending=null;released=true;navigationFailed=true;navigationError=undefined;navigationObservation=null;infrastructure.release();}
 });
}

