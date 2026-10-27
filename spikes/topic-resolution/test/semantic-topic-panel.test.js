import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSemanticTopicPanel} from '../browser/chromium/semantic-topic-panel.js';

const version={generation:'semantic-generation',revision:9},topic={id:'topic-a',title:'Canonical A',kind:'general'};
const actors=[{id:'demo-alex',displayName:'<Alex>',type:'human'}];
const post=(id,rootId=null)=>({id,rootId,replyToId:rootId,state:'visible',authorId:'demo-alex',actorType:'human',body:'<script>'+id,
  createdAt:'2026-10-27T12:00:00.000Z',edited:false});
const feed=(nodeId='games')=>({version,policyRevision:2,nodeId,roots:[{topic,discussionId:'discussion-a',root:post('root-a')}],nextCursor:'next_Cursor',actors});
const thread=()=>({version,policyRevision:2,nodeId:'games',topic,discussionId:'discussion-a',
  root:{...post('root-a'),replies:[{...post('reply-a','root-a'),replyToId:'off-page-parent'},
    {id:'deleted-a',rootId:'root-a',replyToId:'off-page-parent',state:'deleted',label:'Deleted by user'},
    {...post('ai-a','root-a'),actorType:'agent',authorId:'demo-imported-ai',insight:{kind:'generated',operatorId:'demo-alex'}}]},nextCursor:'thread_Cursor',actors});
const target=()=>{const value=thread();delete value.nextCursor;return {...value,targetId:'reply-a',rootRevision:2,targetRevision:1,root:{...value.root,replies:[value.root.replies[0]]}};};
const topics=()=>({version,policyRevision:2,topics:Array.from({length:25},(_,i)=>({id:i?'node-'+i:'games',title:i?'Topic '+i:'<Games>',path:[i?'node-'+i:'games']}))});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness({onReply}={}){const created=[],calls=[],replies=[],selections=[];
  const document={createElement(tag){const item={tag,textContent:'',children:[],listeners:new Map(),attributes:{},style:{},hidden:false,
    append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(key,value){this.attributes[key]=value;},
    addEventListener(event,fn){this.listeners.set(event,fn);},removeEventListener(event,fn){if(this.listeners.get(event)===fn)this.listeners.delete(event);}};created.push(item);return item;}};
  const root=document.createElement('section'),client={};for(const method of ['semanticTopics','semanticFeed','semanticThread','semanticTarget'])client[method]=(args,options)=>new Promise((resolve,reject)=>calls.push({method,args,options,resolve,reject}));
  const panel=mountSemanticTopicPanel(document,root,{client,onReply:value=>{replies.push(value);return onReply?.(value);},onSelectionChange:value=>selections.push(value)});
  const byId=id=>created.findLast(n=>n.id===id),all=n=>[n,...n.children.flatMap(all)];
  return {panel,root,calls,replies,selections,created,byId,all,click(id){byId(id).listeners.get('click')?.();},
    start(){panel.observe({actorId:'demo-alex',sessionRevision:1,sourceId:'page-b'});panel.setActive(true);panel.setConnection(true);},
    async directory(){calls.at(-1).resolve(topics());await settle();},
    async open(){panel.openTopic('games');calls.at(-1).resolve(feed());await settle();},
    async thread(){panel.openThread({nodeId:'games',rootId:'root-a'});calls.at(-1).resolve(thread());await settle();}};
}

test('global directory is bounded, locally searched and paginated without Source context',async()=>{
  const ui=harness();assert.equal(ui.calls.length,0);ui.start();assert.deepEqual(ui.calls[0].args,{});await ui.directory();
  assert.equal(ui.byId('semantic-topic-results').children.length,20);ui.click('semantic-topic-next');assert.equal(ui.byId('semantic-topic-results').children.length,5);
  const input=ui.byId('semantic-topic-search');input.value='Topic 24';input.listeners.get('input')();assert.equal(ui.byId('semantic-topic-results').children.length,1);
  assert.equal(ui.calls.length,1);ui.panel.observe({actorId:'demo-alex',sessionRevision:1,sourceId:'page-c',version:{revision:99}});assert.equal(ui.calls.length,1);
  input.value='';input.listeners.get('input')();ui.click('semantic-topic-open-games');assert.deepEqual(ui.calls.at(-1).args,{nodeId:'games',limit:20,cursor:null});
  ui.calls.at(-1).resolve(feed());await settle();ui.click('semantic-topic-back');assert.equal(ui.calls.length,2);ui.panel.dispose();
});

test('feed and thread use original destinations, page actors, flat replies and minimal tombstones',async()=>{
  const ui=harness();ui.start();await ui.directory();await ui.open();ui.click('semantic-topic-thread-root-a');
  assert.deepEqual(ui.calls.at(-1).args,{nodeId:'games',rootId:'root-a',limit:20,cursor:null});ui.calls.at(-1).resolve(thread());await settle();
  const results=ui.byId('semantic-topic-results'),replies=results.children[1];assert.equal(replies.children.length,3);
  assert.equal(replies.children[0].children.some(n=>n.tag==='article'),false);assert.equal(replies.style.marginInlineStart,'1rem');
  assert.equal(replies.children[1].children.length,1);assert.equal(replies.children[1].children[0].textContent,'Deleted by user');
  assert.equal(replies.children[0].children[1].className,'discussion-body');assert.equal(Object.hasOwn(replies.children[1].attributes,'data-actor-type'),false);
  assert.ok(ui.all(results).some(n=>n.textContent==='AI · <Alex>'));assert.ok(ui.all(results).some(n=>n.textContent==='<Alex>'));
  assert.equal(ui.all(results).some(n=>['script','a','textarea'].includes(n.tag)),false);ui.panel.dispose();
});

test('reply handoff revalidates exact target and emits only canonical identities',async()=>{
  const ui=harness();ui.start();await ui.directory();await ui.thread();ui.click('semantic-topic-reply-reply-a');
  assert.equal(ui.replies.length,0);assert.equal(ui.calls.at(-1).method,'semanticTarget');assert.deepEqual(ui.calls.at(-1).args,{nodeId:'games',rootId:'root-a',targetId:'reply-a'});
  ui.calls.at(-1).resolve(target());await settle();assert.deepEqual(ui.replies,[{nodeId:'games',rootId:'root-a',targetId:'reply-a',topicId:'topic-a',discussionId:'discussion-a'}]);
  ui.click('semantic-topic-reply-reply-a');assert.equal(ui.calls.at(-1).method,'semanticTarget');ui.panel.dispose();
});

test('opaque feed and reply page cursors are bounded and previous restores cursor',async()=>{
  const ui=harness();ui.start();await ui.directory();await ui.open();ui.click('semantic-topic-next');assert.equal(ui.calls.at(-1).args.cursor,'next_Cursor');
  ui.calls.at(-1).resolve({...feed(),nextCursor:null});await settle();ui.click('semantic-topic-previous');assert.equal(ui.calls.at(-1).args.cursor,null);
  ui.calls.at(-1).resolve(feed());await settle();await ui.thread();ui.click('semantic-topic-next');assert.deepEqual(ui.calls.at(-1).args,{nodeId:'games',rootId:'root-a',limit:20,cursor:'thread_Cursor'});ui.panel.dispose();
});

test('selection and navigation fences reject stale success even when transport ignores abort',async()=>{
  const ui=harness();ui.start();await ui.directory();ui.panel.openTopic('games');const old=ui.calls.at(-1);ui.panel.openTopic('science');const current=ui.calls.at(-1);
  assert.equal(old.options.signal.aborted,true);assert.equal(old.options.beforeDispatch(),false);old.resolve(feed());await settle();assert.equal(ui.byId('semantic-topic-results').children.length,0);
  ui.panel.observe({actorId:'demo-alex',sessionRevision:1,sourceId:'page-z'});assert.equal(current.options.signal.aborted,false);current.resolve(feed('science'));await settle();
  assert.equal(ui.byId('semantic-topic-results').children.length,1);ui.panel.dispose();
});

test('account, session, disconnect and dispose revoke pending reads and target handoffs',async()=>{
  for(const revoke of [ui=>ui.panel.observe({actorId:'someone-else',sessionRevision:1}),ui=>ui.panel.observe({actorId:'demo-alex',sessionRevision:2}),ui=>ui.panel.setConnection(false),ui=>ui.panel.setActive(false),ui=>ui.panel.dispose()]){
    const ui=harness();ui.start();await ui.directory();await ui.thread();ui.click('semantic-topic-reply-reply-a');const old=ui.calls.at(-1);revoke(ui);
    assert.equal(old.options.signal.aborted,true);old.resolve(target());await settle();assert.equal(ui.replies.length,0);assert.equal(ui.byId('semantic-topic-results').children.length,0);
    ui.panel.dispose();assert.ok(ui.created.every(n=>n.listeners.size===0));
  }
});

test('error retry and empty topic feed remain usable and invalid DTO never renders',async()=>{
  const ui=harness();ui.start();ui.calls.at(-1).reject(Error('private transport details'));await settle();assert.equal(ui.byId('semantic-topic-retry').hidden,false);
  assert.equal(ui.byId('semantic-topic-status').textContent.includes('private'),false);ui.click('semantic-topic-retry');await ui.directory();ui.panel.openTopic('games');
  ui.calls.at(-1).resolve({...feed(),roots:[],actors:[],nextCursor:null});await settle();assert.equal(ui.byId('semantic-topic-status').textContent,'No discussions found.');
  ui.panel.openThread({nodeId:'games',rootId:'root-a'});const invalid=thread();invalid.root.replies[1].body='secret';ui.calls.at(-1).resolve(invalid);await settle();
  assert.equal(ui.byId('semantic-topic-results').children.length,0);assert.equal(ui.byId('semantic-topic-retry').hidden,false);ui.panel.dispose();
});

test('conflicted cursors retry from the first page for feeds and threads',async()=>{
  for(const mode of ['open','thread']){const ui=harness();ui.start();await ui.directory();await ui[mode]();ui.click('semantic-topic-next');
    assert.notEqual(ui.calls.at(-1).args.cursor,null);ui.calls.at(-1).reject(Object.assign(Error('obsolete cursor'),{code:'conflict'}));await settle();
    ui.click('semantic-topic-retry');assert.equal(ui.calls.at(-1).args.cursor,null);ui.calls.at(-1).resolve(mode==='open'?feed():thread());await settle();
    assert.equal(ui.byId('semantic-topic-previous').disabled,true);ui.panel.dispose();}
});

test('target destination changes refuse handoff and preserve the readable thread',async()=>{
  for(const change of [value=>{value.topic={...topic,id:'different-topic'};},value=>{value.discussionId='different-discussion';}]){
    const ui=harness();ui.start();await ui.directory();await ui.thread();ui.click('semantic-topic-reply-reply-a');const changed=target();change(changed);ui.calls.at(-1).resolve(changed);await settle();
    assert.equal(ui.replies.length,0);assert.equal(ui.byId('semantic-topic-results').children[1].children.length,3);
    assert.equal(ui.byId('semantic-topic-status').textContent,'Topics are unavailable. Try again.');ui.panel.dispose();
  }
});

test('rejected async reply callback and target failure stay handled with public content readable',async()=>{
  const ui=harness({onReply:async()=>{throw Error('private callback detail');}});ui.start();await ui.directory();await ui.thread();ui.click('semantic-topic-reply-reply-a');ui.calls.at(-1).resolve(target());await settle();
  assert.equal(ui.replies.length,1);assert.equal(ui.byId('semantic-topic-results').children[1].children.length,3);assert.equal(ui.byId('semantic-topic-status').textContent,'Topics are unavailable. Try again.');
  ui.click('semantic-topic-reply-reply-a');assert.equal(ui.calls.at(-1).method,'semanticTarget');ui.calls.at(-1).reject(Error('target missing'));await settle();
  assert.equal(ui.byId('semantic-topic-results').children[1].children.length,3);assert.equal(ui.byId('semantic-topic-retry').hidden,false);ui.panel.dispose();
});

test('manual refresh and observed semantic policy changes revoke cached cuts and reset cursors',async()=>{
  const ui=harness();ui.start();await ui.directory();await ui.thread();ui.click('semantic-topic-next');const old=ui.calls.at(-1);
  ui.click('semantic-topic-refresh');assert.equal(old.options.signal.aborted,true);assert.equal(ui.calls.at(-1).method,'semanticTopics');assert.deepEqual(ui.calls.at(-1).args,{});
  old.resolve(thread());ui.calls.at(-1).resolve({...topics(),policyRevision:3,topics:[{id:'new-cut',title:'New cut',path:['new-cut']}]});await settle();
  assert.equal(ui.byId('semantic-topic-results').children.length,1);assert.ok(ui.byId('semantic-topic-open-new-cut'));assert.equal(ui.selections.at(-1),null);
  ui.panel.observe({actorId:'demo-alex',sessionRevision:1,semanticPolicyRevision:4,sourceId:'unrelated-page'});assert.equal(ui.calls.at(-1).method,'semanticTopics');
  const refreshed=ui.calls.at(-1);ui.panel.observe({actorId:'demo-alex',sessionRevision:1,semanticPolicyRevision:4,sourceId:'another-page'});assert.equal(ui.calls.at(-1),refreshed);assert.equal(refreshed.options.signal.aborted,false);
  refreshed.resolve({...topics(),policyRevision:4});await settle();ui.panel.openTopic('games');assert.equal(ui.calls.at(-1).args.cursor,null);ui.panel.dispose();
});
