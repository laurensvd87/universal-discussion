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

test('author context loads independently of slow classification and late responses are fenced by document navigation',async()=>{
 const ui=harness();ui.start();await ui.answer('semanticCapabilities',{protocol:'semantic-topics/v1',authorContext:'authored-topics/v1'});
 assert.equal(ui.authorModes.at(-1),true);assert(ui.pending('semanticContext'));assert(ui.pending('authorContext'));
 const pageScope={kind:'page',id:'source-b',sourceId:'source-b',caption:'Current page',materialDigest:'a'.repeat(64)};
 const dto={version,sourceId:'source-b',context:{topicId:'canonical-b',pageScope,scope:pageScope}};
 await ui.answer('authorContext',dto);assert.deepEqual(ui.authorContexts,[dto]);assert(ui.pending('semanticContext'));
 ui.workspace.refresh();const late=ui.pending('authorContext');assert(late);ui.observe({...page(),resolution:{...page().resolution,documentId:'new-document'}});
 assert.equal(late.options.signal.aborted,true);late.resolve(dto);await turn();assert.equal(ui.authorContexts.length,1);ui.workspace.dispose();
});

test('explicit v2 capabilities enable the same fenced author workflow for a semantic scope',async()=>{
 const ui=harness();ui.start();await ui.answer('semanticCapabilities',{protocol:'semantic-topics/v2',authorContext:'authored-topics/v2'});
 assert.equal(ui.authorModes.at(-1),true);assert(ui.pending('authorContext'));assert(ui.pending('semanticContext'));
 const pageScope={kind:'page',id:'source-b',sourceId:'source-b',caption:'Current page',materialDigest:'a'.repeat(64)},scope={...pageScope,kind:'semantic',id:'games',caption:'Games'};
 await ui.answer('authorContext',{version,sourceId:'source-b',context:{topicId:'canonical-b',pageScope,scope}});assert.deepEqual(ui.authorContexts.at(-1).context.scope,scope);ui.workspace.dispose();
});

test('the actual workspace forwards global v2 search and its complete path through the panel client',async()=>{
 const ui=harness();ui.start();await ui.answer('semanticCapabilities',{protocol:'semantic-topics/v2',topicSearch:'named-topics/v2'});
 const request=ui.pending('semanticSearch');assert(request,'the workspace must forward search instead of presenting a local unavailable error');
 assert.deepEqual(request.args,{query:'',limit:20,cursor:null});const id='subject-12345678-1234-4123-8123-123456789abc';
 await ui.answer('semanticSearch',{version,topics:[{nodeId:id,label:'Koalas',path:[id],occupied:false,human:false,
  breadcrumbs:{fixed:[{nodeId:'nature',label:'Nature'}],topic:[{nodeId:id,label:'Koalas'}]}}],nextCursor:null});
 assert(ui.all(ui.discoverRoot).some(n=>n.textContent==='Nature › Koalas'));assert.equal(ui.calls.filter(c=>c.method==='semanticSearch').length,1);
 ui.click('semantic-discover-open-'+id);assert.equal(ui.pending('semanticFeed').args.nodeId,id);ui.workspace.dispose();
});

function harness({selectSemanticTarget,refreshSavedThreads}={}){
  const created=[],calls=[],selections=[],navigation=[],availability=[],modes=[],routing=[],authorModes=[],authorContexts=[];
  const document={createElement(tag){const item={tag,children:[],attributes:{},listeners:new Map(),style:{},hidden:false,textContent:'',value:'',
    append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(k,v){this.attributes[k]=v;},
    addEventListener(event,fn){this.listeners.set(event,fn);},removeEventListener(event,fn){if(this.listeners.get(event)===fn)this.listeners.delete(event);},focus(){this.focused=true;}};created.push(item);return item;},
    querySelector(selector){return selector==='#discussion-body'?composer:null;}};
  const discoverRoot=document.createElement('section'),discussionRoot=document.createElement('section'),composer=document.createElement('textarea'),client={};
  for(const method of ['semanticCapabilities','semanticContext','semanticTopics','semanticFeed','semanticThread','semanticTarget','semanticSearch','authorContext'])client[method]=(args,options)=>{
    const wait=deferred(),call={method,args,options,done:false,resolve(value){call.done=true;wait.resolve(value);},reject(error){call.done=true;wait.reject(error);}};calls.push(call);return wait.promise;};
  const historyReads=[];
  let current=page();const controller={currentState:()=>current,setSemanticTopicsAvailable(value){routing.push(value);},
    setAuthorContextAvailable(value){authorModes.push(value);},setAuthorContext(value){authorContexts.push(value);},
    async refreshSavedThreads(){historyReads.push(current.sourceId);return refreshSavedThreads?refreshSavedThreads():true;},
    async selectSemanticTarget(ids){selections.push(ids);return selectSemanticTarget?selectSemanticTarget(ids):true;}};
  const workspace=mountSemanticTopicWorkspace(document,{discoverRoot,discussionRoot,client,controller,discussionPanel:{setSemanticFeedMode(value){modes.push(value);}},navigate:value=>navigation.push(value),onAvailability:value=>availability.push(value)});
  const all=node=>[node,...node.children.flatMap(all)],byId=id=>all(discoverRoot).concat(all(discussionRoot)).find(node=>node.id===id);
  const pending=method=>calls.findLast(call=>call.method===method&&!call.done);
  return {created,calls,selections,navigation,availability,modes,routing,authorModes,authorContexts,historyReads,document,discoverRoot,discussionRoot,composer,workspace,client,all,byId,pending,
    click(id){const item=byId(id);assert.ok(item,id);item.listeners.get('click')?.();},
    observe(value){current=value;workspace.observePage(value);},current:()=>current,
    start(){workspace.observePage(current);workspace.setActive(true);workspace.setConnection(true);},
    async answer(method,value){const call=pending(method);assert.ok(call,method);call.resolve(value);await turn();return call;},
    async ready(){this.start();await this.answer('semanticCapabilities',{protocol:'semantic-topics/v1'});await this.answer('semanticTopics',directory());await this.answer('semanticContext',context());await this.answer('semanticFeed',feed('games'));},
    async selectGlobal(){this.click('semantic-discover-open-music');await this.answer('semanticFeed',feed('music'));this.click('semantic-discover-reply-root-a');const call=pending('semanticTarget');await this.answer('semanticTarget',target(call.args));},
  };
}

test('pending classification retries automatically at the same canonical revision without changing the draft',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const ui=harness();ui.start();
 await ui.answer('semanticCapabilities',{protocol:'semantic-topics/v1'});await ui.answer('semanticTopics',directory());
 const before=structuredClone(ui.current());await ui.answer('semanticContext',context({status:'pending',supportedPath:[],selectedPath:[],topic:null}));
 assert.equal(ui.modes.at(-1),false);assert.match(ui.byId('semantic-workspace-status').textContent,/Preparing topics/);
 t.mock.timers.tick(499);assert.equal(ui.pending('semanticContext'),undefined);
 t.mock.timers.tick(1);assert.deepEqual(ui.pending('semanticContext').args,{sourceId:'source-b'});
 await ui.answer('semanticContext',context());await ui.answer('semanticFeed',feed('games'));
 assert.deepEqual(ui.current(),before);assert.equal(ui.modes.at(-1),true);assert.equal(ui.byId('semantic-context-heading').textContent,'Games');
 const reads=ui.calls.length;t.mock.timers.tick(10000);assert.equal(ui.calls.length,reads);ui.workspace.dispose();
});

test('pending retries stop after twenty reads and resume only on explicit retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const ui=harness();ui.start();
 await ui.answer('semanticCapabilities',{protocol:'semantic-topics/v1'});await ui.answer('semanticTopics',directory());
 const pending=context({status:'pending',supportedPath:[],selectedPath:[],topic:null});await ui.answer('semanticContext',pending);
 for(let i=0;i<20;i++){t.mock.timers.tick(500);await ui.answer('semanticContext',pending);}
 assert.equal(ui.calls.filter(c=>c.method==='semanticContext').length,21);assert.equal(ui.byId('semantic-workspace-retry').hidden,false);
 t.mock.timers.tick(60000);assert.equal(ui.pending('semanticContext'),undefined);assert.equal(ui.modes.at(-1),false);
 ui.click('semantic-workspace-retry');await ui.answer('semanticContext',context());ui.workspace.dispose();
});

test('navigation, account revocation, disconnect and disposal cancel pending retries and fence late results',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const change of [ui=>ui.observe({...ui.current(),sourceId:'source-c'}),ui=>ui.observe({...ui.current(),actorId:'demo-blair'}),
  ui=>ui.workspace.setConnection(false),ui=>ui.workspace.dispose()]){
  const ui=harness();ui.start();await ui.answer('semanticCapabilities',{protocol:'semantic-topics/v1'});await ui.answer('semanticTopics',directory());
  await ui.answer('semanticContext',context({status:'pending',supportedPath:[],selectedPath:[],topic:null}));
  change(ui);const count=ui.calls.length;t.mock.timers.tick(10000);assert.equal(ui.calls.length,count);ui.workspace.dispose();
 }
});

test('saved-thread toggle immediately restores canonical view without changing Page B or its draft',async()=>{
  const gate=deferred(),ui=harness({refreshSavedThreads:()=>gate.promise});await ui.ready();
  ui.observe({...ui.current(),draft:{mode:'root',body:'Unsent Page B draft',semantic:false}});const before=structuredClone(ui.current());
  const calls=ui.calls.length,toggle=ui.byId('semantic-workspace-saved-toggle');assert.equal(toggle.hidden,false);
  assert.equal(toggle.textContent,'This page\u2019s saved threads');ui.click(toggle.id);
  assert.equal(ui.modes.at(-1),false);assert.equal(ui.discussionRoot.children.at(-1).hidden,true);
  assert.equal(toggle.textContent,'Topic discussions');assert.notEqual(toggle.disabled,true); // Never disabled by pending history.
  await turn();assert.deepEqual(ui.historyReads,['source-b']);assert.deepEqual(ui.current(),before);
  assert.match(ui.byId('semantic-workspace-history-status').textContent,/Loading saved threads/);
  ui.click(toggle.id);assert.equal(ui.modes.at(-1),true);assert.equal(ui.discussionRoot.children.at(-1).hidden,false);
  ui.click(toggle.id);await turn();assert.equal(ui.historyReads.length,1);
  gate.resolve(true);await turn();assert.equal(ui.calls.length,calls);assert.deepEqual(ui.current(),before);
  assert.equal(ui.byId('semantic-workspace-history-status').textContent,'');ui.workspace.dispose();
});

test('saved-thread retry is separate from metadata refresh and retains canonical fallback on finite failure',async()=>{
  let attempts=0;const ui=harness({refreshSavedThreads:()=>{attempts++;if(attempts===1)throw Error('private failure');return true;}});await ui.ready();
  const contexts=ui.calls.filter(call=>call.method==='semanticContext').length;
  ui.click('semantic-workspace-saved-toggle');await turn();assert.equal(ui.modes.at(-1),false);
  assert.equal(ui.byId('semantic-workspace-history-retry').hidden,false);
  assert.equal(ui.byId('semantic-workspace-history-status').textContent,'Saved threads are unavailable. Try again.');
  ui.click('semantic-workspace-history-retry');await turn();assert.equal(attempts,2);
  assert.equal(ui.byId('semantic-workspace-history-retry').hidden,true);
  assert.equal(ui.calls.filter(call=>call.method==='semanticContext').length,contexts);
  ui.observe({...ui.current(),catalog:{version:{...version,revision:8}}});
  assert.equal(ui.byId('semantic-workspace-saved-toggle').hidden,false);assert.equal(ui.modes.at(-1),false);
  ui.pending('semanticContext').reject(Error('metadata failure'));await turn();
  assert.equal(ui.byId('semantic-workspace-saved-toggle').hidden,false);assert.equal(ui.modes.at(-1),false);
  assert.equal(ui.byId('semantic-workspace-history-retry').hidden,true);ui.workspace.dispose();
});

test('Source, document and actor revocation reset saved view and fence late history completion',async()=>{
  for(const change of [value=>({...value,sourceId:'source-c'}),value=>({...value,resolution:{...value.resolution,documentId:'new-doc'}}),value=>({...value,actorId:'demo-blair'})]){
    const gate=deferred(),ui=harness({refreshSavedThreads:()=>gate.promise});await ui.ready();
    ui.click('semantic-workspace-saved-toggle');await turn();ui.observe(change(ui.current()));
    assert.equal(ui.byId('semantic-workspace-saved-toggle').hidden,true);
    gate.reject(Error('old private failure'));await turn();assert.equal(ui.byId('semantic-workspace-history-retry').hidden,true);
    assert.equal(ui.byId('semantic-workspace-history-status').textContent,'');ui.workspace.dispose();
  }
});

test('saved view and Topic discussions preserve explicit Root A and private semantic draft on Page B',async()=>{
  const ui=harness();await ui.ready();await ui.selectGlobal();await ui.answer('semanticThread',thread('music'));
  ui.observe({...ui.current(),draft:{mode:'reply',body:'Private selected reply',semantic:true}});const before=structuredClone(ui.current());
  const threads=ui.calls.filter(call=>call.method==='semanticThread').length,selections=ui.selections.length;
  ui.click('semantic-workspace-saved-toggle');await turn();assert.equal(ui.modes.at(-1),false);
  ui.click('semantic-workspace-saved-toggle');assert.equal(ui.modes.at(-1),true);
  assert.equal(ui.byId('semantic-context-heading').textContent,'Original topic A');assert.deepEqual(ui.current(),before);
  assert.equal(ui.selections.length,selections);assert.equal(ui.calls.filter(call=>call.method==='semanticThread').length,threads);ui.workspace.dispose();
});

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

test('accepted semantic AI reply refreshes its thread after busy settles without changing an unsent draft',async()=>{
  const ui=harness();await ui.ready();await ui.selectGlobal();await ui.answer('semanticThread',thread('music'));
  const draft={mode:'root',body:'Still typing a different human message'},accepted={id:'generated-accepted',actorId:'demo-alex',sourceId:'source-b',
    semantic:{nodeId:'music',rootId:'root-a',targetId:'generated-accepted'}};
  const during={...ui.current(),draft,busy:true,createdPost:accepted};ui.observe(during);
  assert.equal(ui.pending('semanticThread'),undefined);
  const settled={...during,busy:false},before=structuredClone(settled);ui.observe(settled);
  assert.deepEqual(ui.pending('semanticThread').args,{nodeId:'music',rootId:'root-a',limit:20,cursor:null});
  assert.deepEqual(ui.current(),before);await ui.answer('semanticThread',thread('music'));ui.observe(settled);
  assert.equal(ui.pending('semanticThread'),undefined,'the same accepted cue cannot repeatedly refresh');
  ui.observe({...settled,createdPost:{...accepted,id:'other-root',semantic:{...accepted.semantic,rootId:'another-root'}}});
  assert.equal(ui.pending('semanticThread'),undefined);assert.equal(ui.current().draft.body,draft.body);ui.workspace.dispose();
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
    assert.equal(ui.discussionRoot.hidden,!(value instanceof Error)&&value.status!=='pending');assert.equal(ui.modes.at(-1),false);assert.equal(ui.availability.at(-1),'available');assert.equal(ui.discoverRoot.hidden,false);
    assert.equal(ui.byId('semantic-workspace-saved-toggle').hidden,true); // Already canonical; no duplicate view switch.
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
