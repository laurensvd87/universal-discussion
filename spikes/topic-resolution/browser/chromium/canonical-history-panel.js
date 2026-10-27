import {readCanonicalHistoryListing,readCanonicalHistoryPage} from '../core/canonical-history-contract.js';

// Public history remains accessible independently of Source resolution and login.
// No canonical rows are merged into the current-page controller or composer.
export function mountCanonicalHistoryPanel(document,root,{client}={}){
 let active=false,available=false,disposed=false,epoch=0,abort=null,busy=false,loaded=false,account=null;
 let selected=null,page=0,cursors=[null],next=null,version=null,discussionVersion=null;
 const fixed=[],transient=[];
 function node(tag,text='',className=''){const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;}
 function listen(n,event,fn,bag=fixed){n.addEventListener(event,fn);bag.push([n,event,fn]);}
 function clear(bag){for(const [n,event,fn]of bag)n.removeEventListener(event,fn);bag.length=0;}
 function button(label,id){const n=node('button',label);n.type='button';n.id='canonical-history-'+id;n.className='secondary';return n;}
 const heading=node('h2','Public discussion history'),note=node('p','Read-only public discussions, including saved and unclassified threads.','field-note');
 const status=node('p');status.id='canonical-history-status';status.setAttribute('role','status');
 const back=button('All public discussions','back'),refresh=button('Refresh','refresh'),retry=button('Try again','retry');
 const results=node('div','','discovery-results');results.id='canonical-history-results';
 const previous=button('Previous','previous'),forward=button('Next','next'),label=node('span');
 const navigation=node('nav','','community-pagination');navigation.setAttribute('aria-label','Public history pages');navigation.append(previous,label,forward);
 root.replaceChildren(heading,note,back,refresh,status,retry,results,navigation);
 const usable=()=>active&&available&&!disposed;
 function controls(){root.hidden=!active;root.setAttribute('aria-busy',String(busy));back.hidden=!selected;back.disabled=!usable();refresh.disabled=busy||!usable();retry.disabled=busy||!usable();
  previous.disabled=busy||page===0||!usable();forward.disabled=busy||next===null||!usable();label.textContent='Page '+(page+1);}
 function invalidate(){epoch++;abort?.abort();abort=null;busy=false;}
 function reset(){invalidate();selected=null;page=0;cursors=[null];next=null;version=discussionVersion=null;loaded=false;retry.hidden=true;clear(transient);results.replaceChildren();heading.textContent='Public discussion history';controls();}
 function message(post){const card=node('article','','discussion-contribution');card.setAttribute('data-post-id',post.id);
  if(post.rootId!==null)card.style.marginInlineStart='1rem';
  if(post.state==='deleted'){card.append(node('p','Deleted by user','field-note'));return card;}
  card.setAttribute('data-actor-type',post.actorType);card.append(node('p',post.actorType==='agent'?'AI':'Human','field-note'),node('p',post.body,'discussion-body'));
  return card;
 }
 function render(value){clear(transient);results.replaceChildren();
  if(selected){heading.textContent=value.topic.title;for(const post of value.items)results.append(message(post));status.textContent=value.items.length?'':'No public messages on this page.';}
  else{heading.textContent='Public discussion history';for(const entry of value.results){const card=node('article','','discovery-card'),open=button(entry.title,'open-'+entry.topicId);
    open.className='discovery-title';listen(open,'click',()=>{if(usable())openTopic(entry);},transient);card.append(open,node('p',entry.visibleCount+' public messages','field-note'));results.append(card);}
   status.textContent=value.results.length?'':'No public discussions found.';
  }
 }
 async function load(index=0){if(!usable())return;invalidate();const ownEpoch=epoch,selection=selected,controller=new AbortController();abort=controller;
  const current=()=>usable()&&epoch===ownEpoch&&abort===controller&&!controller.signal.aborted;
  const cursor=cursors[index]??null;busy=true;retry.hidden=true;status.textContent='Loading public history…';clear(transient);results.replaceChildren();controls();
  try{
   const options={signal:controller.signal,beforeDispatch:current};
   const raw=selection?await client.canonicalDiscussionPage({topicId:selection.topicId,limit:20,cursor},options):await client.discover({query:'',limit:20,cursor},options);
   if(!current())return;
   const value=selection?readCanonicalHistoryPage(raw,selection):readCanonicalHistoryListing(raw);
   if(index>0&&(value.version.generation!==version?.generation||(selection?value.discussionVersion!==discussionVersion:value.version.revision!==version?.revision)))throw {code:'conflict'};
   page=index;version=value.version;discussionVersion=selection?value.discussionVersion:null;next=value.nextCursor;
   cursors=cursors.slice(0,index+1);if(next!==null)cursors[index+1]=next;loaded=true;render(value);
  }catch(error){if(!current())return;loaded=false;next=null;
   // Never resubmit a cursor the service has rejected. Retry requires a click.
   if(error?.code==='conflict'){page=0;cursors=[null];version=discussionVersion=null;}
   status.textContent='Public history is unavailable. Try again.';retry.hidden=false;
  }finally{if(current()){busy=false;abort=null;controls();}}
 }
 function openTopic(entry){invalidate();selected={topicId:entry.topicId,discussionId:entry.discussionId};heading.textContent=entry.title;page=0;cursors=[null];version=discussionVersion=null;next=null;loaded=false;void load();}
 listen(back,'click',()=>{if(!usable())return;reset();void load();});
 listen(refresh,'click',()=>{if(!usable())return;page=0;cursors=[null];version=discussionVersion=null;void load();});
 listen(retry,'click',()=>{void load(page);});listen(previous,'click',()=>{if(!busy&&page>0)void load(page-1);});listen(forward,'click',()=>{if(!busy&&next!==null)void load(page+1);});
 reset();status.textContent='Connect to read public history.';
 return Object.freeze({
  setActive(value){if(disposed||active===Boolean(value))return;active=Boolean(value);if(!active){reset();status.textContent='';}else if(usable()&&!loaded)void load();controls();},
  setAvailable(value){if(disposed||available===Boolean(value))return;available=Boolean(value);reset();status.textContent=available?'':'Connect to read public history.';if(usable())void load();},
  observe(value){if(disposed)return;const key=JSON.stringify([value?.actorId??null,value?.sessionRevision??null]);if(key===account)return;const changed=account!==null;account=key;if(changed){reset();if(usable())void load();}},
  refresh(){if(usable()){page=0;cursors=[null];version=discussionVersion=null;return load();}},
  dispose(){if(disposed)return;disposed=true;reset();clear(fixed);clear(transient);root.replaceChildren();root.hidden=true;},
 });
}

// Keep the existing account/private workspace intact. Only the explicit public
// history view is usable without an account, and neither view shares its rows.
export function mountChatsWithPublicHistory(document,root,{client,readAccount,mountAccountChats}){
 const accountRoot=document.createElement('section'),historyRoot=document.createElement('section'),navigation=document.createElement('nav');
 accountRoot.id='account-chat-workspace';historyRoot.id='public-history-workspace';accountRoot.className=historyRoot.className='community-view';
 navigation.className='community-pagination';navigation.setAttribute('aria-label','My chats views');
 const accountButton=document.createElement('button'),historyButton=document.createElement('button');
 accountButton.type=historyButton.type='button';accountButton.textContent='My chats';historyButton.textContent='Public history';
 accountButton.id='account-chats-view';historyButton.id='public-history-view';
 accountButton.setAttribute('aria-controls',accountRoot.id);historyButton.setAttribute('aria-controls',historyRoot.id);
 navigation.append(accountButton,historyButton);root.replaceChildren(navigation,accountRoot,historyRoot);
 const history=mountCanonicalHistoryPanel(document,historyRoot,{client}),accountChats=mountAccountChats(accountRoot);
 let active=false,selected=false,disposed=false;
 const observe=()=>history.observe(readAccount());
 function select(){accountRoot.hidden=selected;accountButton.setAttribute('aria-pressed',String(!selected));historyButton.setAttribute('aria-pressed',String(selected));
  accountChats.setActive(active&&!selected);history.setActive(active&&selected);}
 const showAccount=()=>{if(disposed)return;selected=false;select();},showHistory=()=>{if(disposed)return;selected=true;observe();select();};
 accountButton.addEventListener('click',showAccount);historyButton.addEventListener('click',showHistory);select();
 return Object.freeze({...accountChats,
  start(...args){if(disposed)return Promise.resolve(false);selected=false;select();return accountChats.start(...args);},
  setActive(value){if(disposed)return;active=Boolean(value);observe();select();},
  setAvailable(value){if(disposed)return;observe();accountChats.setAvailable(value);history.setAvailable(value);},
  accountChanged(){if(disposed)return;observe();accountChats.accountChanged();},
  observe(){if(disposed)return;observe();accountChats.observe();},
  dispose(){if(disposed)return;disposed=true;accountButton.removeEventListener('click',showAccount);historyButton.removeEventListener('click',showHistory);history.dispose();accountChats.dispose();root.replaceChildren();},
 });
}
