import assert from "node:assert/strict";

// UI-only companion evidence: real packaged renderers, invented account/data,
// inert API/provider seams. This does not attest native sidePanel RPC authority.
export async function checkCommunityVisual({ browser, sessionId, evaluate, capture }) {
  await evaluate(`(async () => {
    const {mountDiscussionPanel}=await import('./discussion-panel.js');
    const {mountInsightPanel}=await import('./insight-panel.js');
    const {mountPopupShell}=await import('./popup-shell.js');
    const {mountPrivateConversationPanel}=await import('./private-conversation-panel.js');
    const {mountDiscoveryPanel}=await import('./discovery-panel.js');
    window.visualShell?.dispose(); window.visualDiscussionPanel?.dispose(); window.visualInsightPanel?.dispose();
    const root=document.querySelector('#local-discussion');root.replaceChildren();
    const host=document.createElement('div');host.id='app-discussion-insights-host';root.append(host);
    const insightRoot=document.querySelector('#local-insights')??document.createElement('section');
    insightRoot.id='local-insights';insightRoot.replaceChildren();document.querySelector('#app-view-insights').append(insightRoot);
    const state=structuredClone(window.visualDiscussionState??{
      sourceId:'source-visual',topicId:'topic-visual',selection:'background',catalog:{version:{generation:'fixture',revision:1},model:{status:'fixture-only'},
        actors:[],topics:[{id:'topic-visual',title:'Safer streets',kind:'general'}],
        sources:[{id:'source-visual',topicId:'topic-visual',title:'Synthetic public article',url:'https://example.com/article'}]},
      discussion:{discussionId:'discussion-visual',roots:[]},related:{results:[]}});
    state.actorId='account-community-fixture';state.phase='ready';state.busy=false;state.error=null;state.needsFreshRead=false;
    state.catalog.actors.push({id:state.actorId,displayName:'Alex',accountId:'community-fixture'});
    state.draft={body:'',mode:'root',targetId:null,detached:false};
    state.discussion={...state.discussion,roots:[]};
    const recommendationPages=[
      {id:'source-related-junctions',topicId:state.topicId,title:'Designing safe intersections',url:'https://example.org/streets'},
      {id:'source-related-neighborhood',topicId:'topic-related-urban',title:'A calmer city center',url:'https://example.com/neighborhood'}];
    state.catalog.sources.push(...recommendationPages);
    state.catalog.topics.push({id:'topic-related-urban',title:'Calmer city centers',kind:'general'});
    state.related={version:state.catalog.version,results:recommendationPages.map(source=>({...source,
      relationship:source.topicId===state.topicId?'same-topic':'related'}))};
    const ai={available:true,busy:false,status:'prepared',draft:'',preview:null,
      context:{topic:state.catalog.topics.find(topic=>topic.id===state.topicId),
        currentSource:state.catalog.sources.find(source=>source.id===state.sourceId),sameTopicSources:[],relatedSources:[],discussion:[]},
      ai:{connected:true,planEnabled:true,pending:false,model:'synthetic',models:[{slug:'synthetic',displayName:'Synthetic model'}]}};
    let privatePanel,shell,sequence=0,chat=null,privateMessages=[];
    window.communityCalls={creates:0,generates:0,sends:0,publicWrites:0,searches:0};
    const publicPanel=mountDiscussionPanel(document,root,{onPrivateSend:body=>privatePanel.start(body),onPrivateInsight:body=>privatePanel.start(body,true)});
    const controller={currentState:()=>state,setDraft:body=>{state.draft={...state.draft,body};publicPanel.render(state)},
      discardDraft:()=>{state.draft={body:'',mode:'root',targetId:null,detached:false};publicPanel.render(state)},
      submitDraft:async()=>{window.communityCalls.publicWrites++;return true}};
    publicPanel.bind(new Proxy(controller,{get:(value,key)=>value[key]??(()=>{})}));
    const insights=mountInsightPanel(document,insightRoot);
    const insightController=new Proxy({currentState:()=>ai},{get:(value,key)=>value[key]??(()=>{})});
    insights.bind(insightController);publicPanel.bindInsight(insightController);publicPanel.renderInsightState(ai);
    shell=mountPopupShell(document,{onModeChange:mode=>publicPanel.setMode(mode)});
    const addAnswer=human=>{
      window.communityCalls.generates++; human.generation={state:'completed'};
      privateMessages.push({id:'private-answer-'+(++sequence),replyToId:human.id,actorType:'agent',
        body:'Prioritize protected junctions, not just longer routes. The busiest crossings are where the trade-off becomes real.',
        createdAt:'2026-10-11T15:01:00.000Z',citations:[],insight:{operatorId:state.actorId,model:'synthetic'}});
      chat.revision++;
    };
    const client={
      privateConversation:async(action,value,actor,options)=>{
        if(options?.beforeDispatch && !await options.beforeDispatch())throw Error('Fixture context changed');
        if(action==='create'){
          window.communityCalls.creates++;
          chat={id:'private-chat-fixture',visibility:'private',sourceId:state.sourceId,
            sourceUrl:state.catalog.sources.find(source=>source.id===state.sourceId).url,title:value.body,
            revision:1,createdAt:'2026-10-11T15:00:00.000Z'};
          privateMessages=[{id:'private-opener',replyToId:null,actorType:'human',body:value.body,
            citations:[],createdAt:chat.createdAt,generation:{state:'none'}}];
          return {conversationId:chat.id,messageId:'private-opener',revision:chat.revision,replayed:false,generation:{state:'none'}};
        }
        if(action==='generate'){addAnswer(privateMessages.find(message=>message.id===value.messageId));return {generation:{state:'completed'}}}
        if(action==='send'){
          window.communityCalls.sends++;
          const parent=privateMessages.find(message=>message.id===value.replyToId);
          const human={id:'private-human-'+(++sequence),replyToId:parent.id,actorType:'human',body:value.body,
            citations:[],createdAt:'2026-10-11T15:02:00.000Z',generation:{state:'none'}};
          privateMessages.push(human);chat.revision++;
          if(parent.actorType==='agent'){if(!value.generation)throw Error('Missing generation');addAnswer(human)}
          return {conversationId:chat.id,messageId:human.id,revision:chat.revision,replayed:false,generation:human.generation};
        }
        if(action==='read')return structuredClone({conversation:chat,messages:privateMessages,next:null});
        if(action==='list')return structuredClone({conversations:chat?[chat]:[],next:null});
        throw Error('Unexpected fixture private request');
      },
      discover:async input=>{window.communityCalls.searches++;window.communityLastSearch=input;return {version:{generation:'community',revision:1},query:'cycling',nextCursor:null,
        results:[{topicId:'topic-community-search',discussionId:'discussion-search',title:'Safer streets, better bike routes',kind:'general',
          snippet:'Protected junctions matter more than the length of a cycle lane. What would make your neighborhood easier to ride through?',
          visibleCount:12,updatedAt:'2026-10-11T15:00:00.000Z',sources:[
            {id:'source-cycling',title:'Designing safe intersections',url:'https://example.org/streets'},
            {id:'source-neighborhood',title:'A calmer city center',url:'https://example.com/neighborhood'}]}]};},
      discussion:async()=>({version:{generation:'community',revision:1},topic:{id:'topic-community-search',title:'Safer streets, better bike routes'},roots:[
        {id:'search-root',state:'visible',actorType:'human',body:'A separated lane is great, but how do we make the junctions safer?',
          origin:{url:'https://example.org/streets',title:'Designing safe intersections'},replies:[
            {id:'search-answer',state:'visible',actorType:'agent',body:'Try separating turning traffic from the cycle crossing. That addresses the conflict at its source.',
              origin:{url:'https://example.com/neighborhood',title:'A calmer city center'}}]}]})
    };
    privatePanel=mountPrivateConversationPanel(document,document.querySelector('#app-view-private'),{
      client,readActor:()=>state.actorId,requestSignIn:async()=>true,prepareGeneration:async()=>({context:{currentSource:{id:state.sourceId}}}),
      attestStart:async()=>true,readPublicState:()=>state,showView:view=>shell.navigate(view),randomId:()=> 'fixture-operation-'+(++sequence)});
    const discover=mountDiscoveryPanel(document,document.querySelector('#app-view-discover'),{client});
    shell.bindCommunity({private:privatePanel,discovery:discover});
    publicPanel.render(state);shell.render(state);insights.render(ai);publicPanel.renderInsightState(ai);
    document.body.dataset.uiSurface='sidepanel';document.body.dataset.extensionSurface='sidepanel';
    window.communityState=state;window.communityPublic=publicPanel;window.communityPrivate=privatePanel;window.communityShell=shell;
    window.communityDispose=()=>{privatePanel.dispose();discover.dispose();publicPanel.dispose();insights.dispose();shell.dispose()};
  })()`, sessionId);
  await browser.send("Emulation.setDeviceMetricsOverride", {width:390,height:650,deviceScaleFactor:1,mobile:false}, sessionId);
  assert.equal(await evaluate("document.querySelector('#app-tab-private').textContent", sessionId), "My chats");
  assert.equal(await evaluate("!document.querySelector('#discussion-related-page-suggestions').hidden && document.querySelectorAll('#discussion-related-page-suggestions .related-page-card').length===2",sessionId),true);
  for(const width of [390,320,480]) {
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height:650,deviceScaleFactor:1,mobile:false},sessionId);
    await capture(`community-empty-discussion-pages-${width}`,sessionId,{fluid:true});
  }
  await evaluate(`(() => {
    const body=document.querySelector('#discussion-body');body.value='What would make cycling here safer?';body.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#discussion-private-toggle').click();
  })()`, sessionId);
  assert.equal(await evaluate("document.querySelector('#discussion-private-toggle').getAttribute('aria-pressed')", sessionId), "true");
  await capture("community-lock-before-send",sessionId,{fluid:true});
  await evaluate("document.querySelector('#discussion-composer').requestSubmit();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  assert.deepEqual(await evaluate("window.communityCalls",sessionId),{creates:1,generates:0,sends:0,publicWrites:0,searches:0});
  assert.equal(await evaluate("!document.querySelector('#app-view-private').hidden && document.querySelectorAll('.private-bubble').length===1",sessionId),true);
  assert.deepEqual(await evaluate(`(() => {
    const icon=document.querySelector('#app-view-private .community-heading .private-conversation-lock');
    return {label:icon.getAttribute('aria-label'),role:icon.getAttribute('role'),visible:icon.getClientRects().length>0,
      packagedMask:getComputedStyle(icon).maskImage.includes('/icons/lock.svg')};
  })()`,sessionId), {label:"Private conversation",role:"img",visible:true,packagedMask:true});
  await evaluate("document.querySelector('.private-message-tools .private-spark').click();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  assert.equal(await evaluate("document.querySelectorAll('.private-bubble-agent').length",sessionId),1);
  await evaluate(`(() => {
    const body=document.querySelector('#private-message-body');body.focus();body.value='What about the busiest crossings?';
    body.dispatchEvent(new Event('input',{bubbles:true}));
  })()`,sessionId);
  assert.equal(await evaluate("document.activeElement===document.querySelector('#private-message-body')",sessionId),true);
  await evaluate("document.querySelector('.private-composer').requestSubmit();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  assert.equal(await evaluate("window.communityCalls.generates===2 && window.communityCalls.sends===1 && window.communityCalls.publicWrites===0 && document.querySelectorAll('.private-bubble-agent').length===2",sessionId),true);
  for(const width of [390,320,480]){
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height:650,deviceScaleFactor:1,mobile:false},sessionId);
    await capture(`community-private-${width}`,sessionId,{fluid:true});
    assert.equal(await evaluate("(() => {const r=document.querySelector('.private-composer').getBoundingClientRect();return r.bottom<=innerHeight+1&&r.top>=0})()",sessionId),true);
  }
  await evaluate("document.querySelector('#app-tab-discussion').click();document.querySelector('#app-tab-private').click();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  assert.equal(await evaluate("window.communityCalls.generates",sessionId),2,"reopening never generates again");
  await evaluate("document.querySelector('#app-view-private .community-heading button').click();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  assert.deepEqual(await evaluate(`(() => {
    const root=document.querySelector('#app-view-private');
    const icon=root.querySelector('.private-chat-card .private-conversation-lock');
    return {heading:root.querySelector('h2').textContent,label:icon.getAttribute('aria-label'),visible:icon.getClientRects().length>0,
      headerLockHidden:root.querySelector('.community-heading .private-conversation-lock').getClientRects().length===0};
  })()`,sessionId), {heading:"My chats",label:"Private conversation",visible:true,headerLockHidden:true});
  for(const width of [390,320,480]) {
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height:650,deviceScaleFactor:1,mobile:false},sessionId);
    await capture(`community-my-chats-${width}`,sessionId,{fluid:true});
  }
  await evaluate("document.querySelector('#app-tab-discover').click();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  for(const width of [390,320,480]){
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height:650,deviceScaleFactor:1,mobile:false},sessionId);
    await capture(`community-discover-${width}`,sessionId,{fluid:true});
  }
  const discovery=await evaluate(`(() => {
    const input=document.querySelector('#discovery-search');input.focus();
    return {focused:document.activeElement===input,links:[...document.querySelectorAll('.discovery-related-link')].map(a=>({url:a.href,rel:a.rel,target:a.target})),
      stable:window.communityState.sourceId==='source-visual',privateVisible:document.querySelector('#app-view-private').getClientRects().length>0};
  })()`,sessionId);
  assert.ok(discovery.focused&&discovery.stable&&!discovery.privateVisible);
  assert.ok(discovery.links.length===2&&discovery.links.every(link=>link.rel==='noopener noreferrer'&&link.target==='_blank'));
  assert.equal(await evaluate("window.communityCalls.searches",sessionId),0,"blank Discover shows pages without a global browse request");
  await evaluate(`(() => {
    const input=document.querySelector('#discovery-search');input.value='cycling';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('.discovery-search-form').requestSubmit();
  })();new Promise(resolve=>setTimeout(resolve,30))`,sessionId);
  assert.deepEqual(await evaluate("window.communityLastSearch",sessionId),{query:"cycling",limit:20,cursor:null},"typed search uses the global query contract, without a current-page filter");
  await capture("community-discover-library-search",sessionId,{fluid:true});
  await evaluate("document.querySelector('.discovery-title').click();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  await capture("community-discovery-preview",sessionId,{fluid:true});
  assert.equal(await evaluate("!document.querySelector('#discovery-preview').hidden && document.querySelectorAll('.discovery-message').length===2 && window.communityState.sourceId==='source-visual'",sessionId),true);
  await evaluate("window.communityDispose()",sessionId);
  process.stdout.write("Community Chrome checks: empty Discussion/blank Discover related pages, typed global search, My chats/private lock labels, private replies, source links/focus and 320/390/480px layouts passed.\n");
}
