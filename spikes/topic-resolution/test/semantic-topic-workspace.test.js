import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSemanticTopicWorkspace} from '../browser/chromium/semantic-topic-workspace.js';
import {createLocalServiceClient} from '../browser/core/local-service-client.js';

const turn=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {resolve,reject,promise};};
const version={generation:'generation',revision:7},actors=[{id:'demo-alex',displayName:'Actual Alex',type:'human'}];
const page=()=>({phase:'ready',sourceId:'source-b',topicId:'canonical-b',actorId:'demo-alex',catalog:{version:{...version}},
  resolution:{documentId:'doc-b',currentTabId:7,currentUrl:'https://example.com/b',currentWindowId:2,sessionWindowId:2,
    sessionRevision:'session-b',enabled:true,hostAccess:true,currentOrigin:'https://example.com',contextReason:null,blockedOrigins:[]},draft:{mode:'root',body:'',semantic:false}});
const context=(patch={})=>({version:{...version},policyRevision:2,sourceId:'source-b',sourceVersion:'0',status:'classified',supportedPath:['games','detail'],selectedPath:['games'],
  topic:{id:'games',title:'Games',path:['games']},...patch});
const post=(id,rootId=null)=>({id,rootId,replyToId:rootId,state:'visible',actorType:'human',authorId:'demo-alex',body:'Public '+id,createdAt:'2026-10-27T12:00:00.000Z',edited:false});
const topic={id:'canonical-a',title:'Original topic A',kind:'general'};
const feed=nodeId=>({version,policyRevision:2,nodeId,roots:[{topic,discussionId:'discussion-a',root:post('root-a')}],nextCursor:null,actors});
const thread=nodeId=>({version,policyRevision:2,nodeId,topic,discussionId:'discussion-a',root:{...post('root-a'),replies:[{...post('reply-a','root-a'),replyToId:'off-page-parent'}]},nextCursor:null,actors});
const target=request=>{const value=thread(request.nodeId);delete value.nextCursor;return {...value,targetId:request.targetId,rootRevision:3,targetRevision:request.targetId==='root-a'?3:2,
  root:{...value.root,replies:request.targetId==='root-a'?[]:value.root.replies}};};
const directory=()=>({version,policyRevision:2,topics:[{id:'music',title:'Music',path:['music']},{id:'games',title:'Games',path:['games']}]});

function harness({selectSemanticTarget}={}){
  const created=[],calls=[],selections=[],navigation=[],availability=[],modes=[],routing=[];
  const document={createElement(tag){const item={tag,children:[],attributes:{},listeners:new Map(),style:{},hidden:false,textContent:'',value:'',
    append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(k,v){this.attributes[k]=v;},
    addEventListener(event,fn){this.listeners.set(event,fn);},removeEventListener(event,fn){if(this.listeners.get(event)===fn)this.listeners.delete(event);},focus(){this.focused=true;}};created.push(item);return item;},
    querySelector(selector){return selector==='#discussion-body'?composer:null;}};
  const discoverRoot=document.createElement('section'),discussionRoot=document.createElement('section'),composer=document.createElement('textarea'),client={};
  for(const method of ['semanticCapabilities','semanticContext','semanticTopics','semanticFeed','semanticThread','semanticTarget'])client[method]=(args,options)=>{
    const wait=deferred(),call={method,args,options,done:false,resolve(value){call.done=true;wait.resolve(value);},reject(error){call.done=true;wait.reject(error);}};calls.push(call);return wait.promise;};
  let current=page();const controller={currentState:()=>current,setSemanticTopicsAvailable(value){routing.push(value);},async selectSemanticTarget(ids){selections.push(ids);return selectSemanticTarget?selectSemanticTarget(ids):true;}};
  const workspace=mountSemanticTopicWorkspace(document,{discoverRoot,discussionRoot,client,controller,discussionPanel:{setSemanticFeedMode(value){modes.push(value);}},navigate:value=>navigation.push(value),onAvailability:value=>availability.push(value)});
  const all=node=>[node,...node.children.flatMap(all)],byId=id=>all(discoverRoot).concat(all(discussionRoot)).find(node=>node.id===id);
  const pending=method=>calls.findLast(call=>call.method===method&&!call.done);
  return {created,calls,selections,navigation,availability,modes,routing,document,discoverRoot,discussionRoot,composer,workspace,client,all,byId,pending,
    click(id){const item=byId(id);assert.ok(item,id);item.listeners.get('click')?.();},
    observe(value){current=value;workspace.observePage(value);},current:()=>current,
    start(){workspace.observePage(current);workspace.setActive(true);workspace.setConnection(true);},
    async answer(method,value){const call=pending(method);assert.ok(call,method);call.resolve(value);await turn();return call;},
    async ready(){this.start();await this.answer('semanticCapabilities',{protocol:'semantic-topics/v1'});await this.answer('semanticTopics',directory());await this.answer('semanticContext',context());await this.answer('semanticFeed',feed('games'));},
    async selectGlobal(){this.click('semantic-discover-open-music');await this.answer('semanticFeed',feed('music'));this.click('semantic-discover-reply-root-a');const call=pending('semanticTarget');await this.answer('semanticTarget',target(call.args));},
  };
}

test('workspace imports inertly and real panels have distinct IDs with global Source-independent requests',async()=>{
  const ui=harness();assert.equal(ui.calls.length,0);await ui.ready();
  assert.deepEqual(ui.calls.filter(c=>c.method==='semanticTopics').map(c=>c.args),[{}]);assert.deepEqual(ui.calls.find(c=>c.method==='semanticContext').args,{sourceId:'source-b'});
  assert.equal(ui.byId('semantic-context-search').hidden,true);assert.equal(ui.byId('semantic-context-heading').textContent,'Games');assert.equal(ui.modes.at(-1),true);
  const ids=ui.all(ui.discoverRoot).concat(ui.all(ui.discussionRoot)).map(n=>n.id).filter(Boolean);assert.equal(new Set(ids).size,ids.length);
  assert.deepEqual(ui.availability,['loading','available']);assert.ok(ui.routing.includes(true));ui.workspace.dispose();
});

test('global reply handoff keeps Page B unchanged, opens original Root A and Back restores Source B feed',async()=>{
  const ui=harness();await ui.ready();const before=structuredClone(ui.current());await ui.selectGlobal();
  assert.deepEqual(ui.selections,[{nodeId:'music',rootId:'root-a',targetId:'root-a',topicId:'canonical-a',discussionId:'discussion-a'}]);
  assert.deepEqual(ui.pending('semanticThread').args,{nodeId:'music',rootId:'root-a',limit:20,cursor:null});assert.deepEqual(ui.navigation,['discussion']);assert.equal(ui.composer.focused,true);assert.deepEqual(ui.current(),before);
  await ui.answer('semanticThread',thread('music'));ui.click('semantic-context-back');assert.deepEqual(ui.pending('semanticFeed').args,{nodeId:'games',limit:20,cursor:null});
  await ui.answer('semanticFeed',feed('games'));assert.equal(ui.byId('semantic-context-heading').textContent,'Games');ui.workspace.dispose();
});

test('main feed is active independently of discovery and its reply action selects only exact canonical IDs',async()=>{
  const ui=harness();ui.observe(ui.current());ui.workspace.setConnection(true);await ui.answer('semanticCapabilities',{protocol:'semantic-topics/v1'});
  assert.equal(ui.calls.some(call=>call.method==='semanticTopics'),false);await ui.answer('semanticContext',context());await ui.answer('semanticFeed',feed('games'));
  ui.click('semantic-context-reply-root-a');const exact=ui.pending('semanticTarget');await ui.answer('semanticTarget',target(exact.args));
  assert.deepEqual(ui.selections,[{nodeId:'games',rootId:'root-a',targetId:'root-a',topicId:'canonical-a',discussionId:'discussion-a'}]);
  assert.deepEqual(ui.pending('semanticThread').args,{nodeId:'games',rootId:'root-a',limit:20,cursor:null});ui.workspace.dispose();
});

test('ordinary revision changes never retarget an explicit thread and post completion refreshes only that root',async()=>{
  const ui=harness();await ui.ready();await ui.selectGlobal();await ui.answer('semanticThread',thread('music'));
  const selected={...ui.current(),draft:{mode:'reply',semantic:true,body:'Reply'}};ui.observe(selected);const topics=ui.calls.filter(c=>c.method==='semanticTopics').length;
  ui.observe({...selected,catalog:{version:{generation:'generation',revision:8}}});await ui.answer('semanticContext',context({version:{generation:'generation',revision:10}}));
  assert.equal(ui.calls.filter(c=>c.method==='semanticTopics').length,topics);assert.equal(ui.byId('semantic-context-heading').textContent,'Original topic A');
  ui.observe({...ui.current(),draft:{mode:'root',semantic:false,body:''}});assert.deepEqual(ui.pending('semanticThread').args,{nodeId:'music',rootId:'root-a',limit:20,cursor:null});
  await ui.answer('semanticThread',thread('music'));ui.workspace.dispose();
});

test('Source navigation aborts stale main context but leaves global directory requests and cache independent',async()=>{
  const ui=harness();ui.start();await ui.answer('semanticCapabilities',{protocol:'semantic-topics/v1'});const directoryRead=ui.pending('semanticTopics'),old=ui.pending('semanticContext');
  const next={...ui.current(),sourceId:'source-c',resolution:{...ui.current().resolution,documentId:'doc-c',currentUrl:'https://example.com/c'}};ui.observe(next);
  assert.equal(old.options.signal.aborted,true);assert.equal(directoryRead.options.signal.aborted,false);
  old.resolve(context());directoryRead.resolve(directory());await turn();const recent=ui.pending('semanticContext');assert.deepEqual(recent.args,{sourceId:'source-c'});
  recent.resolve(context({sourceId:'source-c',topic:{id:'games',title:'Games',path:['games']}}));await turn();assert.equal(ui.calls.filter(c=>c.method==='semanticTopics').length,1);ui.workspace.dispose();
});

test('Source, native document and account changes fence pending exact-target handoffs before navigation',async()=>{
  for(const change of [value=>({...value,sourceId:'source-c'}),value=>({...value,resolution:{...value.resolution,documentId:'new-document'}}),value=>({...value,actorId:'demo-blair'})]){
    const gate=deferred(),ui=harness({selectSemanticTarget:()=>gate.promise});await ui.ready();
    ui.click('semantic-discover-open-music');await ui.answer('semanticFeed',feed('music'));ui.click('semantic-discover-reply-root-a');const exact=ui.pending('semanticTarget');exact.resolve(target(exact.args));await turn();
    ui.observe(change(ui.current()));gate.resolve(true);await turn();assert.deepEqual(ui.navigation,[]);assert.equal(ui.composer.focused,undefined);ui.workspace.dispose();
  }
});

test('navigation during the panel exact-target read aborts transport before controller handoff',async()=>{
  const ui=harness();await ui.ready();ui.click('semantic-discover-open-music');await ui.answer('semanticFeed',feed('music'));ui.click('semantic-discover-reply-root-a');
  const exact=ui.pending('semanticTarget');ui.observe({...ui.current(),resolution:{...ui.current().resolution,documentId:'replacement-document'}});
  assert.equal(exact.options.signal.aborted,true);assert.equal(await exact.options.beforeDispatch(),false);exact.resolve(target(exact.args));await turn();
  assert.deepEqual(ui.selections,[]);assert.deepEqual(ui.navigation,[]);ui.workspace.dispose();
});

test('explicit global thread can be read after Source abstention and genuine navigation clears it',async()=>{
  const ui=harness();ui.start();await ui.answer('semanticCapabilities',{protocol:'semantic-topics/v1'});await ui.answer('semanticTopics',directory());await ui.answer('semanticContext',context({selectedPath:[],topic:null}));
  assert.equal(ui.discussionRoot.hidden,true);await ui.selectGlobal();await ui.answer('semanticThread',thread('music'));assert.equal(ui.discussionRoot.hidden,false);
  ui.observe({...ui.current(),sourceId:'source-c'});assert.equal(ui.discussionRoot.hidden,true);assert.equal(ui.byId('semantic-context-results').children.length,0);assert.equal(ui.modes.at(-1),false);ui.workspace.dispose();
});

test('classification pending, excluded, abstention and optional metadata failure retain canonical fallback',async()=>{
  for(const value of [context({status:'pending',supportedPath:[],selectedPath:[],topic:null}),context({status:'excluded',supportedPath:[],selectedPath:[],topic:null}),
    context({selectedPath:[],topic:null}),Error('private metadata detail')]){
    const ui=harness();ui.start();await ui.answer('semanticCapabilities',{protocol:'semantic-topics/v1'});await ui.answer('semanticTopics',directory());
    if(value instanceof Error){ui.pending('semanticContext').reject(value);await turn();}else await ui.answer('semanticContext',value);
    assert.equal(ui.discussionRoot.hidden,!(value instanceof Error));assert.equal(ui.modes.at(-1),false);assert.equal(ui.availability.at(-1),'available');assert.equal(ui.discoverRoot.hidden,false);
    if(value instanceof Error){assert.equal(ui.discussionRoot.children.at(-1).hidden,true);assert.match(ui.byId('semantic-workspace-status').textContent,/unavailable/);
      assert.equal(ui.byId('semantic-workspace-retry').hidden,false);ui.click('semantic-workspace-retry');await ui.answer('semanticContext',context());
      assert.equal(ui.byId('semantic-workspace-retry').hidden,true);assert.equal(ui.modes.at(-1),true);}
    if(!(value instanceof Error))assert.equal(ui.calls.some(c=>c.method==='semanticFeed'),false);ui.workspace.dispose();
  }
});

test('an unrelated canonical revision refresh keeps the valid context feed visible until metadata settles',async()=>{
  const ui=harness();await ui.ready();ui.observe({...ui.current(),catalog:{version:{generation:'generation',revision:8}}});
  assert.equal(ui.discussionRoot.hidden,false);assert.equal(ui.modes.at(-1),true);assert.equal(ui.byId('semantic-context-results').children.length,1);
  await ui.answer('semanticContext',context({version:{generation:'generation',revision:9}}));assert.equal(ui.discussionRoot.hidden,false);assert.equal(ui.modes.at(-1),true);ui.workspace.dispose();
});

test('context Refresh rechecks source metadata then refreshes the same original thread without posting',async()=>{
  const ui=harness();await ui.ready();await ui.selectGlobal();await ui.answer('semanticThread',thread('music'));ui.click('semantic-context-refresh');
  assert.deepEqual(ui.pending('semanticContext').args,{sourceId:'source-b'});await ui.answer('semanticContext',context());
  assert.deepEqual(ui.pending('semanticThread').args,{nodeId:'music',rootId:'root-a',limit:20,cursor:null});assert.equal(ui.selections.length,1);ui.workspace.dispose();
});

test('only authenticated exact missing-capability evidence permits legacy fallback',async()=>{
  const local=createLocalServiceClient({getToken:()=> 'synthetic-pairing-token-long-enough',fetchImpl:async()=>new Response('{"error":"not-found"}',{status:404,headers:{'content-type':'application/json'}})});
  const proven=await local.semanticCapabilities().catch(error=>error);
  for(const [error,expected] of [[proven,'legacy'],[Object.assign(Error('looks missing'),{code:'not-found',status:404}),'error'],[Error('outage'),'error']]){
    const ui=harness();ui.start();ui.pending('semanticCapabilities').reject(error);await turn();assert.equal(ui.availability.at(-1),expected);
    assert.equal(ui.discoverRoot.hidden,true);assert.equal(ui.calls.length,1);assert.equal(ui.routing.at(-1),false);ui.workspace.dispose();
  }
});

test('disconnect and disposal abort pending reads and remove panel listeners without late publication',async()=>{
  const ui=harness();ui.start();await ui.answer('semanticCapabilities',{protocol:'semantic-topics/v1'});const contextRead=ui.pending('semanticContext');
  ui.workspace.setConnection(false);assert.equal(contextRead.options.signal.aborted,true);contextRead.resolve(context());await turn();assert.equal(ui.modes.at(-1),false);
  ui.workspace.dispose();ui.workspace.dispose();assert.equal(ui.availability.at(-1),'disconnected');assert.ok(ui.created.every(node=>node.listeners.size===0));
});
