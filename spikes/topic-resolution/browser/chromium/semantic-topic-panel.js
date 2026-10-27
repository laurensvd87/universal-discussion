import {readSemanticTopics, readSemanticFeed, readSemanticThread, readSemanticTarget} from '../core/local-service-contract.js';

export const SEMANTIC_TOPIC_EN = Object.freeze({
  heading:'Search Topics', search:'Search Topics', loading:'Loading…', error:'Topics are unavailable. Try again.',
  connect:'Connect to explore topics.', empty:'No discussions found.', back:'Back', previous:'Previous', next:'Next',
  reply:'Reply', retry:'Try again', refresh:'Refresh', deleted:'Deleted by user', ai:'AI · {name}',
});

// This panel has no foreground Source binding. All destinations come from the
// bounded canonical read DTO, including when another page is open in the tab.
export function mountSemanticTopicPanel(document, root, {client, messages={}, onReply, onSelectionChange,
  idPrefix='semantic-topic-',contextMode=false,onRefresh}={}) {
  if(typeof idPrefix!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(idPrefix))throw new TypeError('Invalid panel prefix');
  root.className=[root.className,'semantic-topic-panel'].filter(Boolean).join(' ');
  const t=key=>messages[key]??SEMANTIC_TOPIC_EN[key];
  let active=false, connected=false, disposed=false, epoch=0, pending=null, busy=false, context='';
  let directory=null, offset=0, selection=null, page=null, cursor=null, history=[],topicContext=null;
  const listeners=[], dynamic=[];
  const node=(tag,text='',id='')=>{const n=document.createElement(tag);n.textContent=text;if(id)n.id=idPrefix+id.replace(/^semantic-topic-/u,'');return n;};
  const listen=(n,event,fn,list=listeners)=>{n.addEventListener(event,fn);list.push([n,event,fn]);};
  const unlisten=list=>{for(const [n,event,fn] of list)n.removeEventListener(event,fn);list.length=0;};
  const button=(text,id)=>{const n=node('button',text,id);n.type='button';return n;};
  const heading=node('h2',t('heading'),'semantic-topic-heading');root.setAttribute('aria-labelledby',heading.id);
  const search=node('input','','semantic-topic-search');search.type='search';search.maxLength=256;search.value='';search.setAttribute('aria-label',t('search'));
  const back=button(t('back'),'semantic-topic-back'), retry=button(t('retry'),'semantic-topic-retry'), refreshButton=button(t('refresh'),'semantic-topic-refresh');
  const status=node('p','','semantic-topic-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const results=node('div','','semantic-topic-results'), previous=button(t('previous'),'semantic-topic-previous'), next=button(t('next'),'semantic-topic-next');
  results.className='discovery-results';
  const pager=node('nav');pager.append(previous,next);root.replaceChildren(heading,search,back,refreshButton,status,results,pager,retry);
  function available(){return active&&connected&&!disposed;}
  function filtered(){const query=search.value.trim().toLocaleLowerCase();return (directory?.topics??[]).filter(item=>item.title.toLocaleLowerCase().includes(query));}
  function controls(){root.setAttribute('aria-busy',String(busy));back.hidden=contextMode?!selection?.rootId:!selection;search.hidden=contextMode||Boolean(selection);
    heading.textContent=selection?(selection.rootId?page?.topic?.title:null)??(topicContext?.id===selection.nodeId?topicContext.title:null)??directory?.topics.find(item=>item.id===selection.nodeId)?.title??selection.nodeId:t('heading');
    refreshButton.disabled=!available();previous.disabled=busy||!available()||(selection?history.length===0:offset===0);
    next.disabled=busy||!available()||(selection?!page?.nextCursor:offset+20>=filtered().length);}
  function invalidate(){epoch++;pending?.abort();pending=null;busy=false;controls();}
  function clear(){unlisten(dynamic);results.replaceChildren();page=null;retry.hidden=true;}
  function reset(){directory=null;selection=contextMode&&topicContext?{nodeId:topicContext.id}:null;offset=0;cursor=null;history=[];clear();controls();}
  function changed(){onSelectionChange?.(selection?{...selection}:null);}
  function directoryView(){clear();const items=filtered().slice(offset,offset+20);
    const names=new Map(directory.topics.map(item=>[item.id,item.title]));
    for(const item of items){const card=node('section'),open=button(item.title,'semantic-topic-open-'+item.id);card.className='discovery-card';
      if(item.path.length>1)card.append(node('p',item.path.map(id=>names.get(id)??id).join(' › ')));
      listen(open,'click',()=>openTopic(item.id),dynamic);card.append(open);results.append(card);}
    status.textContent=items.length?'':t('empty');controls();}
  function postView(post, actors, destination){const card=node('article');card.className='discussion-contribution';card.setAttribute('data-post-id',post.id);
    if(post.state==='deleted'){card.append(node('p',t('deleted')));return card;}
    const actorId=post.actorType==='agent'?post.insight.operatorId:post.authorId;
    const name=actors.find(actor=>actor.id===actorId)?.displayName??'';
    card.setAttribute('data-actor-type',post.actorType);const body=node('p',post.body);body.className='discussion-body';
    card.append(node('strong',post.actorType==='agent'?t('ai').replace('{name}',name):name),body);
    if(onReply){const reply=button(t('reply'),'semantic-topic-reply-'+post.id);const stamp=epoch;
      listen(reply,'click',()=>{if(available()&&stamp===epoch&&!busy)void replyTo({...destination,targetId:post.id});},dynamic);card.append(reply);}
    return card;}
  function pageView(){unlisten(dynamic);results.replaceChildren();
    if(selection.rootId){const destination={nodeId:selection.nodeId,rootId:page.root.id,topicId:page.topic.id,discussionId:page.discussionId};
      results.append(postView(page.root,page.actors,destination));
      // Every reply is one level below the root, including off-page parents.
      const replies=node('div');replies.className='semantic-topic-replies';if(replies.style)replies.style.marginInlineStart='1rem';
      for(const reply of page.root.replies)replies.append(postView(reply,page.actors,destination));results.append(replies);
    }else for(const item of page.roots){const card=postView(item.root,page.actors,{nodeId:selection.nodeId,rootId:item.root.id,topicId:item.topic.id,discussionId:item.discussionId});
      const open=button(item.topic.title,'semantic-topic-thread-'+item.root.id);listen(open,'click',()=>openThread({nodeId:selection.nodeId,rootId:item.root.id}),dynamic);card.append(open);results.append(card);}
    status.textContent=!selection.rootId&&!page.roots.length?t('empty'):'';controls();}
  async function request(method, args, parse, publish){
    if(!available())return;invalidate();const stamp=epoch, abort=new AbortController();pending=abort;busy=true;retry.hidden=true;status.textContent=t('loading');controls();
    const valid=()=>available()&&epoch===stamp&&pending===abort&&!abort.signal.aborted;
    try{const raw=await client[method](args,{signal:abort.signal,beforeDispatch:valid});if(!valid())return;
      const value=parse(raw,args);if(!valid())return;await publish(value);
    }catch(error){if(valid()){
      if(error?.code==='conflict'||error?.status===409){cursor=null;history=[];}
      // A failed target or reply handoff leaves the already public page readable.
      if(method==='semanticTarget'&&page)pageView();else clear();
      status.textContent=t('error');retry.hidden=false;
    }}
    finally{if(valid()){pending=null;busy=false;controls();}}
  }
  function load(){if(!available()){status.textContent=t('connect');controls();return;}
    if(contextMode&&!selection){clear();status.textContent=t('empty');controls();return;}
    if(!selection){if(directory){directoryView();return;}void request('semanticTopics',{},readSemanticTopics,value=>{directory=value;directoryView();});return;}
    const args={...selection,limit:20,cursor};void request(selection.rootId?'semanticThread':'semanticFeed',args,selection.rootId?readSemanticThread:readSemanticFeed,value=>{page=value;pageView();});}
  function openTopic(nodeId){if(!available()||typeof nodeId!=='string'||!nodeId)return;invalidate();selection={nodeId};cursor=null;history=[];clear();changed();load();}
  function openThread({nodeId,rootId}={}){if(!available()||typeof nodeId!=='string'||typeof rootId!=='string'||!nodeId||!rootId)return;invalidate();selection={nodeId,rootId};cursor=null;history=[];clear();changed();load();}
  async function replyTo(destination){await request('semanticTarget',{nodeId:destination.nodeId,rootId:destination.rootId,targetId:destination.targetId},readSemanticTarget,async value=>{
    // Exact fresh target lookup validates identity; bodies never enter the callback.
    if(value.nodeId!==destination.nodeId||value.root.id!==destination.rootId||value.targetId!==destination.targetId||
      value.topic.id!==destination.topicId||value.discussionId!==destination.discussionId)throw new Error('destination-changed');
    pageView();status.textContent='';await onReply?.({nodeId:value.nodeId,rootId:value.root.id,targetId:value.targetId,topicId:value.topic.id,discussionId:value.discussionId});});}
  function refreshPage(){if(!available())return;invalidate();cursor=null;history=[];clear();load();}
  async function refresh(){if(!available())return;
    if(contextMode&&onRefresh){try{await onRefresh();}catch{if(available()){status.textContent=t('error');}}return;}
    if(contextMode){refreshPage();return;}invalidate();reset();changed();load();}
  function setTopicContext(card,{preserveThread=false,force=false}={}){if(disposed||!contextMode)return false;
    // Reuse bounded directory-card syntax validation only; this synthetic header
    // never enters retained state, transport, or any posting-authority path.
    let next=null;try{if(card!==null)next=readSemanticTopics({version:{generation:'syntax-only',revision:0},policyRevision:0,topics:[card]}).topics[0];}catch{return false;}
    if(!force&&JSON.stringify(next)===JSON.stringify(topicContext))return true;topicContext=next;
    if((next||preserveThread)&&selection?.rootId){controls();return true;}
    invalidate();selection=next?{nodeId:next.id}:null;cursor=null;history=[];clear();changed();load();return true;}
  listen(search,'input',()=>{if(!available()||selection)return;offset=0;if(directory)directoryView();});
  listen(back,'click',()=>{if(!available()||!selection)return;invalidate();selection=contextMode?(topicContext?{nodeId:topicContext.id}:null):selection.rootId?{nodeId:selection.nodeId}:null;cursor=null;history=[];clear();changed();load();});
  listen(retry,'click',()=>load());
  listen(refreshButton,'click',refresh);
  listen(previous,'click',()=>{if(!available()||busy)return;if(selection){if(!history.length)return;cursor=history.pop();}else offset=Math.max(0,offset-20);load();});
  listen(next,'click',()=>{if(!available()||busy)return;if(selection){if(!page?.nextCursor)return;history.push(cursor);cursor=page.nextCursor;}else{if(offset+20>=filtered().length)return;offset+=20;}load();});
  status.textContent=t('connect');retry.hidden=true;controls();
  return {openTopic,openThread,refresh,refreshPage,setTopicContext,
    setActive(value){value=Boolean(value);if(disposed||active===value)return;active=value;invalidate();reset();changed();load();},
    setConnection(value){value=Boolean(value);if(disposed||connected===value)return;connected=value;invalidate();reset();changed();load();},
    observe(state){if(disposed)return;const value=JSON.stringify([state?.actorId??null,state?.accountId??null,state?.sessionRevision??null,state?.semanticPolicyRevision??null]);if(value===context)return;context=value;invalidate();if(contextMode)topicContext=null;reset();changed();load();},
    dispose(){if(disposed)return;disposed=true;invalidate();reset();unlisten(listeners);root.replaceChildren();},
  };
}
