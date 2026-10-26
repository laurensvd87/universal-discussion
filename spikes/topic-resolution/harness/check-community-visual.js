import assert from "node:assert/strict";

// UI-only companion evidence: real packaged renderers, invented account/data,
// inert API/provider seams. This does not attest native sidePanel RPC authority.
export async function checkCommunityVisual({ browser, sessionId, evaluate, capture }) {
  const pressEnter = async () => {
    await browser.send("Page.bringToFront",{},sessionId);
    await browser.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,text:"\r"},sessionId);
    await browser.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13},sessionId);
  };
  await evaluate(`(async () => {
    const {mountDiscussionPanel}=await import('./discussion-panel.js');
    const {mountInsightPanel}=await import('./insight-panel.js');
    const {mountPopupShell}=await import('./popup-shell.js');
    const {mountPrivateConversationPanel}=await import('./private-conversation-panel.js');
    const {mountDiscoveryPanel}=await import('./discovery-panel.js');
    window.visualShell?.dispose(); window.visualDiscussionPanel?.dispose(); window.visualInsightPanel?.dispose();
    // The original disposed shell rehomed this node outside the discussion root.
    // Remove that inert duplicate before the synthetic renderer owns the ID.
    for(const stale of document.querySelectorAll('#discussion-connection-settings'))stale.remove();
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
    const ai={available:true,busy:false,status:'prepared',draft:'',preview:null,preferences:{replyLanguage:'en'},
      context:{topic:state.catalog.topics.find(topic=>topic.id===state.topicId),
        currentSource:state.catalog.sources.find(source=>source.id===state.sourceId),sameTopicSources:[],relatedSources:[],discussion:[]},
      ai:{connected:true,planEnabled:true,pending:false,model:'synthetic',models:[{slug:'synthetic',displayName:'Synthetic model'}]}};
    let privatePanel,shell,sequence=0,chat=null,privateMessages=[],ownerVersion=0;
    window.communityListPackets=[];
    window.communityCalls={creates:0,generates:0,sends:0,publicWrites:0,searches:0};
    const publicPanel=mountDiscussionPanel(document,root,{onPrivateSend:body=>privatePanel.start(body),onPrivateInsight:body=>privatePanel.start(body,true)});
    const controller={currentState:()=>state,setDraft:body=>{state.draft={...state.draft,body};publicPanel.render(state)},
      discardDraft:()=>{state.draft={body:'',mode:'root',targetId:null,detached:false};publicPanel.render(state)},
      submitDraft:async()=>{window.communityCalls.publicWrites++;return true}};
    publicPanel.bind(new Proxy(controller,{get:(value,key)=>value[key]??(()=>{})}));
    const insights=mountInsightPanel(document,insightRoot);
    const insightController=new Proxy({currentState:()=>ai,setInsightPreferences:preferences=>{
      ai.preferences={...preferences};insights.render(ai);publicPanel.renderInsightState(ai);privatePanel?.observe();return true;
    }},{get:(value,key)=>value[key]??(()=>{})});
    insights.bind(insightController);publicPanel.bindInsight(insightController);publicPanel.renderInsightState(ai);
    shell=mountPopupShell(document,{onModeChange:mode=>publicPanel.setMode(mode)});
    const addAnswer=human=>{
      window.communityCalls.generates++; human.generation={state:'completed'};
      privateMessages.push({id:'private-answer-'+(++sequence),replyToId:human.id,actorType:'agent',
        body:'Prioritize protected junctions, not just longer routes. The busiest crossings are where the trade-off becomes real.',
        createdAt:'2026-10-11T15:01:00.000Z',citations:[],insight:{operatorId:state.actorId,model:'synthetic'}});
      chat.revision++;ownerVersion++;chat.updatedAt=chat.createdAt;
    };
    const publicChats=[
      {id:'public-owned-human',visibility:'public',topicId:'topic-visual',discussionId:'discussion-visual',title:'Could quieter streets make a better city?',
        sourceId:'source-visual',sourceUrl:'https://example.com/article',createdAt:'2026-10-11T16:00:00.000Z',updatedAt:'2026-10-11T16:30:00.000Z',actorType:'human',ownedHuman:true,ownedAgent:false},
      {id:'public-owned-assistant',visibility:'public',topicId:'topic-visual',discussionId:'discussion-visual',title:'The missing piece is how junctions handle turning traffic.',
        sourceId:'source-related-junctions',sourceUrl:'https://example.org/streets',createdAt:'2026-10-11T16:15:00.000Z',updatedAt:'2026-10-11T16:15:00.000Z',actorType:'agent',ownedHuman:false,ownedAgent:true}];
    window.communityPublicChats=publicChats;
    const matches=(title,query)=>!query||query.toLowerCase().trim().split(/\s+/).every(term=>title.toLowerCase().includes(term));
    const client={
      version:async()=>({version:structuredClone(state.catalog.version)}),
      accountPublicChats:async(action,value)=>{
        if(action==='list'){
          if(!Object.hasOwn(value,'after'))throw Error('Missing public list cursor');
          window.communityListPackets.push({kind:'public',...value});
          const filtered=publicChats.filter(chat=>matches(chat.title,value.query)).sort((a,b)=>
            a.updatedAt===b.updatedAt ? a.id===b.id?0:a.id>b.id?-1:1 : a.updatedAt>b.updatedAt?-1:1);
          const start=value.after?Number(value.after.split('-').at(-1)):0;
          return structuredClone({version:state.catalog.version,chats:filtered.slice(start,start+value.limit),
            next:start+value.limit<filtered.length?'fixture-page-'+(start+value.limit):null});
        }
        if(action==='read'){
          const conversation=publicChats.find(chat=>chat.id===value.rootId);
          if(!conversation)throw Error('Missing fixture public root');
          const allMessages=[
            {id:conversation.id,replyToId:null,actorType:conversation.actorType,state:'visible',body:conversation.title,
              createdAt:conversation.createdAt,authorLabel:'Alex',sourceUrl:conversation.sourceUrl},
            {id:'public-reply-'+conversation.id,replyToId:conversation.id,actorType:'human',state:'visible',
              body:'A quieter route would help, but it still needs safe crossings.',createdAt:conversation.updatedAt,authorLabel:'Blair',sourceUrl:null},
            ...Array.from({length:43},(_,index)=>({id:'public-page-reply-'+index,replyToId:conversation.id,actorType:'human',state:'visible',
              body:'A further bounded reply '+index,createdAt:conversation.updatedAt,authorLabel:'Blair',sourceUrl:null}))];
          const start=Number(value.after??0);
          return structuredClone({version:state.catalog.version,conversation,messages:allMessages.slice(start,start+value.limit),
            next:start+value.limit<allMessages.length?String(start+value.limit):null});
        }
        throw Error('Unexpected fixture public account request');
      },
      privateConversation:async(action,value,actor,options)=>{
        if(options?.beforeDispatch && !await options.beforeDispatch())throw Error('Fixture context changed');
        if(action==='create'){
          window.communityCalls.creates++;
          chat={id:'private-chat-fixture',visibility:'private',sourceId:state.sourceId,
            sourceUrl:state.catalog.sources.find(source=>source.id===state.sourceId).url,title:value.body,
            revision:1,createdAt:'2026-10-11T15:00:00.000Z',updatedAt:'2026-10-11T15:00:00.000Z'};ownerVersion++;
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
          privateMessages.push(human);chat.revision++;ownerVersion++;
          if(parent.actorType==='agent'){if(!value.generation)throw Error('Missing generation');addAnswer(human)}
          return {conversationId:chat.id,messageId:human.id,revision:chat.revision,replayed:false,generation:human.generation};
        }
        if(action==='read'){
          const end=privateMessages.length-Number(value.after??0),start=Math.max(0,end-value.limit);
          return structuredClone({conversation:chat,messages:privateMessages.slice(start,end),next:start>0?String(privateMessages.length-start):null});
        }
        if(action==='list'){
          if(!Object.hasOwn(value,'after'))throw Error('Missing private list cursor');
          window.communityListPackets.push({kind:'private',...value});
          return structuredClone({conversations:chat&&matches(chat.title,value.query)?[chat]:[],next:null,ownerVersion});
        }
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
      client,readActor:()=>state.actorId,readInsightState:()=>ai,setInsightPreferences:preferences=>insightController.setInsightPreferences(preferences),
      requestSignIn:async()=>true,prepareGeneration:async()=>({context:{currentSource:{id:state.sourceId}}}),
      attestStart:async()=>true,readPublicState:()=>state,showView:view=>shell.navigate(view),randomId:()=> 'fixture-operation-'+(++sequence)});
    const discover=mountDiscoveryPanel(document,document.querySelector('#app-view-discover'),{client});
    shell.bindCommunity({private:privatePanel,discovery:discover});
    publicPanel.render(state);shell.render(state);insights.render(ai);publicPanel.renderInsightState(ai);
    document.body.dataset.uiSurface='sidepanel';document.body.dataset.extensionSurface='sidepanel';
    window.communityState=state;window.communityPublic=publicPanel;window.communityPrivate=privatePanel;window.communityShell=shell;window.communityDiscovery=discover;
    window.communityDispose=()=>{privatePanel.dispose();discover.dispose();publicPanel.dispose();insights.dispose();shell.dispose()};
  })()`, sessionId);
  await browser.send("Emulation.setDeviceMetricsOverride", {width:390,height:650,deviceScaleFactor:1,mobile:false}, sessionId);
  assert.equal(await evaluate("document.querySelector('#app-tab-private').textContent", sessionId), "My chats");
  assert.equal(await evaluate("document.querySelector('#discussion-ai-insights-voice-toggle').getClientRects().length>0",sessionId),true);
  await evaluate(`(() => {document.querySelector('#discussion-ai-insights-voice-toggle').click();
    const picker=document.querySelector('#discussion-ai-insights').closest('.assistant-voice-control');
    if(picker.querySelectorAll('[role=menuitemradio]').length!==12)throw Error('Missing fixed voice choices');})()`,sessionId);
  await capture("community-root-voice-menu",sessionId,{fluid:true});
  await evaluate("document.querySelector('#discussion-ai-insights').closest('.assistant-voice-control').querySelector('[data-voice=funny]').click()",sessionId);
  assert.equal(await evaluate("document.querySelector('#insight-voice').value",sessionId),'funny');
  assert.deepEqual(await evaluate("window.communityCalls",sessionId),{creates:0,generates:0,sends:0,publicWrites:0,searches:0},"choosing a voice never calls a provider");
  assert.equal(await evaluate(`(() => {const button=document.querySelector('#discussion-ai-insights'),r=button.getBoundingClientRect();
    return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('button')===button;})()`,sessionId),true,"root generation center stays distinct from the corner voice button");
  assert.equal(await evaluate("document.querySelector('#discussion-related-page-suggestions')===null && document.querySelectorAll('#discussion-feed .related-page-card').length===0",sessionId),true,"Discussion does not offer unrelated page suggestions, even with no posts");
  for(const width of [320,360,390,420,480]) {
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
  assert.equal(await evaluate("document.querySelector('#private-generate-voice-toggle').getAttribute('aria-label').includes('Funny')",sessionId),true);
  await evaluate("document.querySelector('#private-generate-voice-toggle').click()",sessionId);
  await capture("community-private-voice-menu",sessionId,{fluid:true});
  await evaluate("document.querySelector('#private-generate').closest('.assistant-voice-control').querySelector('[data-voice=skeptic]').click()",sessionId);
  assert.equal(await evaluate("document.querySelector('#insight-voice').value",sessionId),'skeptic');
  assert.deepEqual(await evaluate("window.communityCalls",sessionId),{creates:1,generates:0,sends:0,publicWrites:0,searches:0},"private voice menu only changes the preference");
  assert.equal(await evaluate(`(() => {const button=document.querySelector('#private-generate'),r=button.getBoundingClientRect();
    return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('button')===button;})()`,sessionId),true,"private generation center stays distinct from the corner voice button");
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
  for(const width of [320,360,390,420,480]){
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
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.private-chat-card')].map(card=>({id:card.dataset.chatId,kind:card.dataset.chatKind,
    lock:!!card.querySelector('.private-conversation-lock'),sparkle:!!card.querySelector('.private-identity-agent')}))`,sessionId),[
    {id:'public-owned-human',kind:'public',lock:false,sparkle:false},
    {id:'public-owned-assistant',kind:'public',lock:false,sparkle:true},
    {id:'private-chat-fixture',kind:'private',lock:true,sparkle:false}]);
  for(const width of [320,360,390,420,480]) {
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height:650,deviceScaleFactor:1,mobile:false},sessionId);
    await capture(`community-my-chats-${width}`,sessionId,{fluid:true});
  }
  await evaluate("document.querySelector('[data-chat-id=public-owned-assistant]').focus()",sessionId);
  await pressEnter();
  await evaluate("new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  assert.equal(await evaluate("document.activeElement===document.querySelector('#app-view-private h2')",sessionId),true,
    'keyboard opening a saved public conversation moves focus to its persistent heading: '+
      JSON.stringify(await evaluate("({active:document.activeElement?.tagName,id:document.activeElement?.id,preview:document.querySelectorAll('#app-view-private [data-message-id]').length})",sessionId)));
  assert.equal(await evaluate(`(() => {const root=document.querySelector('#app-view-private');return root.querySelector('.private-composer').hidden&&root.querySelector('.private-conversation-lock').hidden&&
    root.querySelectorAll('[data-message-id]').length===20&&!root.querySelector('.private-delete')&&
    !root.querySelector('.private-message-reply')&&!root.querySelector('.private-message-tools .private-spark');})()`,sessionId),true);
  assert.equal(await evaluate("document.querySelector('#private-generate-voice-toggle').getClientRects().length===0",sessionId),true,"public previews expose no assistant controls");
  await evaluate("window.communityPreviewFirst=[...document.querySelectorAll('[data-message-id]')].map(item=>item.dataset.messageId);document.querySelector('#my-chats-next').click();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  assert.equal(await evaluate("document.querySelectorAll('[data-message-id]').length===20&&![...document.querySelectorAll('[data-message-id]')].some(item=>window.communityPreviewFirst.includes(item.dataset.messageId))",sessionId),true);
  await evaluate("document.querySelector('#my-chats-previous').click();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-message-id]')].map(item=>item.dataset.messageId)",sessionId),await evaluate("window.communityPreviewFirst",sessionId));
  for(const width of [320,360,390,420,480]) {
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height:650,deviceScaleFactor:1,mobile:false},sessionId);
    await capture(`community-my-public-chat-${width}`,sessionId,{fluid:true});
  }
  assert.deepEqual(await evaluate(`(() => {const link=document.querySelector('#app-view-private .community-feed>a');return {href:link.href,target:link.target,rel:link.rel,referrerPolicy:link.referrerPolicy};})()`,sessionId),
    {href:'https://example.org/streets',target:'_blank',rel:'noopener noreferrer',referrerPolicy:'no-referrer'});
  await evaluate(`(() => {
    const template=window.communityPublicChats[0];
    window.communityPublicChats.splice(0,window.communityPublicChats.length,...Array.from({length:60},(_,index)=>({...template,
      id:'public-search-'+index,title:index===57?'Needle: a useful conversation beyond the first page':
        'A longer conversation about practical changes, uncertain evidence and the details that matter when comparing several public sources. Thread '+index,
      updatedAt:new Date(Date.parse('2026-10-12T12:00:00.000Z')-index*1000).toISOString()})));
    document.querySelector('#app-view-private .community-heading button').click();
  })();new Promise(resolve=>setTimeout(resolve,30))`,sessionId);
  assert.equal(await evaluate("document.querySelectorAll('.private-chat-card').length",sessionId),20,"twenty combined public/private cards total");
  assert.equal(await evaluate("document.activeElement===document.querySelector('#my-chats-search')",sessionId),true,
    'Back restores focus to the visible My chats search');
  for(const width of [320,360,390,420,480]) {
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height:650,deviceScaleFactor:1,mobile:false},sessionId);
    const metrics=await evaluate(`(() => {
      const feed=document.querySelector('#private-chat-feed');
      feed.scrollTop=0;
      const cards=[...feed.querySelectorAll('.private-chat-card')];
      const boxes=cards.map(card=>card.getBoundingClientRect());
      const contained=cards.every(card=>[...card.querySelectorAll('strong,span')].every(child=>
        child.getBoundingClientRect().bottom<=card.getBoundingClientRect().bottom+1));
      const gaps=boxes.slice(1).every((box,index)=>box.top>=boxes[index].bottom+8);
      const before=document.querySelector('#my-chats-search').getBoundingClientRect().top;
      feed.scrollTop=feed.scrollHeight;
      const fixedSearch=Math.abs(before-document.querySelector('#my-chats-search').getBoundingClientRect().top)<1;
      feed.scrollTop=0;return {contained,gaps,fixedSearch,scrolls:feed.scrollHeight>feed.clientHeight};
    })()`,sessionId);
    assert.deepEqual(metrics,{contained:true,gaps:true,fixedSearch:true,scrolls:true},'long cards contain text without overlap; search stays fixed');
    await capture('community-my-chats-long-list-'+width,sessionId,{fluid:true});
  }
  await evaluate(`(() => {const search=document.querySelector('#my-chats-search');search.focus();search.value='needle';
    search.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#my-chats-search-form').requestSubmit();})();new Promise(resolve=>setTimeout(resolve,30))`,sessionId);
  assert.equal(await evaluate("document.querySelectorAll('.private-chat-card').length===1&&document.querySelector('.private-chat-card').dataset.chatId==='public-search-57'&&document.activeElement===document.querySelector('#my-chats-search')",sessionId),true,"search finds a conversation beyond loaded pages without losing focus");
  await capture('community-my-chats-search',sessionId,{fluid:true});
  await evaluate(`(() => {const search=document.querySelector('#my-chats-search');search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#my-chats-search-form').requestSubmit();})();new Promise(resolve=>setTimeout(resolve,30))`,sessionId);
  await evaluate("window.communityInboxFirst=[...document.querySelectorAll('.private-chat-card')].map(card=>card.dataset.chatId);document.querySelector('#my-chats-next').click();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  assert.equal(await evaluate("document.querySelectorAll('.private-chat-card').length===20&&![...document.querySelectorAll('.private-chat-card')].some(card=>window.communityInboxFirst.includes(card.dataset.chatId))",sessionId),true,"Next replaces the twenty-card window");
  await evaluate("document.querySelector('#my-chats-previous').click();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.private-chat-card')].map(card=>card.dataset.chatId)",sessionId),await evaluate("window.communityInboxFirst",sessionId),"Previous replays a freshly validated window");
  assert.equal(await evaluate("window.communityListPackets.every(packet=>Object.hasOwn(packet,'after')&&[1,20].includes(packet.limit))",sessionId),true);
  await evaluate(`(() => {const style=document.createElement('style');style.id='community-large-type';style.textContent='.private-chat-card strong {font-size:22px}';document.head.append(style);})();new Promise(resolve=>setTimeout(resolve,30))`,sessionId);
  await capture('community-my-chats-large-text',sessionId,{fluid:true});
  assert.equal(await evaluate(`[...document.querySelectorAll('.private-chat-card')].every(card=>card.querySelector('strong').getBoundingClientRect().bottom<=card.getBoundingClientRect().bottom+1)`,sessionId),true);
  await evaluate("document.querySelector('#community-large-type').remove()",sessionId);
  await evaluate("document.querySelector('#app-tab-discover').click();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  for(const width of [320,360,390,420,480]){
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
    const state=window.communityState;
    const extra=Array.from({length:43},(_,index)=>({id:'source-extra-'+index,topicId:state.topicId,
      title:'A further related public page '+index,url:'https://example.org/related-'+index}));
    state.catalog.sources.push(...extra);state.related.results.push(...extra.map(source=>({...source,relationship:'same-topic'})));
    window.communityDiscovery.observePage(state);
    window.communityRelatedFirst=[...document.querySelectorAll('.discovery-related-link')].map(link=>link.href);
  })()`,sessionId);
  assert.equal(await evaluate("document.querySelectorAll('.discovery-related-link').length",sessionId),20,"blank related metadata uses twenty-result pages");
  await evaluate("document.querySelector('#discovery-more').click();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  assert.equal(await evaluate("document.querySelectorAll('.discovery-related-link').length===20&&![...document.querySelectorAll('.discovery-related-link')].some(link=>window.communityRelatedFirst.includes(link.href))",sessionId),true);
  await capture("community-discover-related-page-two",sessionId,{fluid:true});
  await evaluate("document.querySelector('#discovery-more').click();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  assert.equal(await evaluate("document.querySelectorAll('.discovery-related-link').length===5&&document.querySelector('#discovery-more').disabled",sessionId),true);
  await evaluate("document.querySelector('#discovery-previous').click();document.querySelector('#discovery-previous').click();new Promise(resolve=>setTimeout(resolve,30))",sessionId);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.discovery-related-link')].map(link=>link.href)",sessionId),await evaluate("window.communityRelatedFirst",sessionId));
  assert.equal(await evaluate("window.communityCalls.searches",sessionId),0,"paging blank related metadata dispatches no global search");
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
  await evaluate(`(() => {
    const state=window.communityState;
    state.discussion={discussionId:'discussion-visual',roots:[{id:'flat-root',state:'visible',actorType:'human',
      authorId:state.actorId,body:'One inset for this whole conversation',replies:Array.from({length:7},(_,index)=>({
        id:'flat-reply-'+index,rootId:'flat-root',replyToId:index?'flat-reply-'+(index-1):'flat-root',
        state:'visible',actorType:'human',authorId:state.actorId,body:'Reply at depth '+(index+1)}))}]};
    state.draft={mode:'reply',targetId:'flat-reply-6',body:'',detached:false};
    window.communityPublic.render(state);window.communityShell.navigate('discussion');window.communityShell.render(state);
  })()`,sessionId);
  for(const width of [320,360,390,420,480]) {
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height:650,deviceScaleFactor:1,mobile:false},sessionId);
    await capture('community-flat-thread-'+width,sessionId,{fluid:true});
    const flat=await evaluate(`(() => {
      const root=document.querySelector('[data-post-id=flat-root]').getBoundingClientRect();
      return [...document.querySelectorAll('.discussion-reply-post')].map(card=>({
        left:card.getBoundingClientRect().left,right:card.getBoundingClientRect().right,
        rootLeft:root.left,visible:card.getBoundingClientRect().height>0&&!card.closest('[inert]'),
        parent:card.querySelector('.discussion-parent-cue')?.getAttribute('data-reply-to-id'),
        cue:card.querySelector('.discussion-parent-cue')?.textContent}));
    })()`,sessionId);
    assert.equal(flat.length,7,'seven canonical depths render');
    assert.ok(flat.every((card,index)=>card.visible&&card.left>card.rootLeft&&
      Math.abs(card.left-flat[0].left)<0.5&&Math.abs(card.right-flat[0].right)<0.5&&
      card.parent===(index?'flat-reply-'+(index-1):'flat-root')&&card.cue.startsWith('@')),
      'all descendant depths share one inset and identify their exact parent: '+JSON.stringify(flat));
  }
  await evaluate(`(() => {
    const state=window.communityState;
    state.discussion={discussionId:'discussion-visual',roots:[{id:'voice-root',rootId:null,state:'visible',actorType:'human',
      authorId:state.actorId,body:'What would improve the crossing?',createdAt:'2026-10-12T12:00:00.000Z',replies:[
        {id:'voice-reply',rootId:'voice-root',replyToId:'voice-root',state:'visible',actorType:'human',authorId:state.actorId,
          body:'Separate the turning traffic.',createdAt:'2026-10-12T12:01:00.000Z'}]}]};
    state.draft={mode:'reply',targetId:'voice-reply',body:'How would that work here?',detached:false};
    window.communityPublic.render(state);window.communityShell.navigate('discussion');window.communityShell.render(state);
    document.querySelector('#discussion-body').focus();
  })()`,sessionId);
  assert.equal(await evaluate(`(() => {const picker=document.querySelector('[data-contribution-id=voice-reply][data-action=getinsights]')?.closest('.assistant-voice-control');
    return picker?.querySelector('.assistant-voice-toggle').getClientRects().length>0&&document.querySelector('#discussion-model-host').hidden&&
      document.querySelector('#discussion-composer').parentElement!==document.querySelector('#discussion-root-dock');})()`,sessionId),true,"inline reply keeps its message voice arrow visible without model clutter or duplicate composer");
  for(const width of [320,360,390,420,480]) {
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height:650,deviceScaleFactor:1,mobile:false},sessionId);
    await capture('community-inline-reply-voice-'+width,sessionId,{fluid:true});
  }
  await evaluate(`(() => {const picker=document.querySelector('[data-contribution-id=voice-reply][data-action=getinsights]').closest('.assistant-voice-control');
    picker.scrollIntoView({block:'nearest'});picker.querySelector('.assistant-voice-toggle').click();})()`,sessionId);
  await capture('community-inline-reply-voice-menu',sessionId,{fluid:true});
  await evaluate("document.querySelector('[data-contribution-id=voice-reply][data-action=getinsights]').closest('.assistant-voice-control').querySelector('[data-voice=mediator]').click()",sessionId);
  assert.equal(await evaluate("document.querySelector('#discussion-body').value==='How would that work here?'&&document.querySelectorAll('#insight-voice').length===1",sessionId),true);
  await evaluate(`(() => {
    const state=window.communityState;
    state.serviceConnection='connected';state.enrichmentPending=true;state.related=null;state.relatedError=null;
    state.alternateDiscussion=null;state.alternateError=null;state.priorDiscussionsError=null;
    state.topicViewMode='experimental';state.catalog.sources.find(source=>source.id===state.sourceId).provenance='owner-local-page-embedding/v1';
    state.resolution={enabled:true,phase:'ready'};
    window.communityPublic.render(state);window.communityShell.render(state);
  })()`,sessionId);
  const pendingEvidence=await evaluate(`(() => ({
    loadingHidden:document.querySelector('#discussion-loading-scene')?.hidden,
    connection:document.querySelector('#discussion-connection-settings')?.getAttribute('data-connection'),
    cardPresent:!!document.querySelector('[data-post-id=voice-root]'),
    cardVisible:(document.querySelector('[data-post-id=voice-root]')?.getClientRects().length??0)>0,
    phase:window.communityState.phase,mode:window.communityState.topicViewMode,
    discussionVisible:document.querySelector('#app-view-discussion')?.getClientRects().length>0,
    rootCount:window.communityState.discussion.roots.length,
    pending:window.communityState.enrichmentPending
  }))()`,sessionId);
  assert.ok(pendingEvidence.loadingHidden&&pendingEvidence.connection==='connected'&&pendingEvidence.cardVisible,
    'canonical feed stays visible and connected while optional enrichment is pending: '+JSON.stringify(pendingEvidence));
  await capture('community-core-ready-enrichment-pending',sessionId,{fluid:true});
  await evaluate(`(() => {
    const state=window.communityState;state.enrichmentPending=false;
    state.resolution={enabled:true,phase:'error',reason:'unavailable'};
    window.communityPublic.render(state);window.communityShell.render(state);
  })()`,sessionId);
  assert.equal(await evaluate(`document.querySelector('#discussion-connection-settings').getAttribute('data-connection')==='connected'&&
    document.querySelector('#discussion-status').textContent.includes('temporarily busy')&&
    document.querySelector('[data-post-id=voice-root]')?.getClientRects().length>0`,sessionId),true,
    "page matching busy does not hide a verified connection or canonical feed");
  await capture('community-connected-page-matching-busy',sessionId,{fluid:true});
  const staged=await evaluate(`(() => {
    const state=window.communityState;state.phase='loading';state.selection='background';state.busy=false;state.needsFreshRead=false;
    state.discussion={...state.discussion,topic:{id:state.topicId}};state.resolution={enabled:true,phase:'processing'};
    state.draft={mode:'root',targetId:null,body:'',detached:false};
    window.communityPublic.render(state);window.communityShell.navigate('discussion');window.communityShell.render(state);
    const body=document.querySelector('#discussion-body');body.focus();body.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    body.value='@AI Local draft while matching';state.resolution.phase='checking';window.communityPublic.render(state);
    const preserved=document.activeElement===body&&body.value==='@AI Local draft while matching';
    body.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
    const before=JSON.stringify(window.communityCalls);document.querySelector('#discussion-composer').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    return {preserved,typingEnabled:!body.disabled,sendDisabled:document.querySelector('#discussion-submit').disabled,
      insightDisabled:document.querySelector('#discussion-ai-insights').disabled,noAction:before===JSON.stringify(window.communityCalls)};
  })()`,sessionId);
  assert.deepEqual(staged,{preserved:true,typingEnabled:true,sendDisabled:true,insightDisabled:true,noAction:true},
    'real DOM preserves local IME composing while matching; deliberate submit remains fenced before verified Ready');
  await capture('community-local-draft-before-ready',sessionId,{fluid:true});
  for(const width of [320,360,420]) {
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height:650,deviceScaleFactor:1,mobile:false},sessionId);
    await evaluate("document.querySelector('#app-settings-button').focus()",sessionId);
    await pressEnter();
    assert.equal(await evaluate("document.activeElement===document.querySelector('#app-settings-heading')",sessionId),true,
      'Settings receives keyboard focus');
    await capture('community-settings-audit-'+width,sessionId,{fluid:true});
    await evaluate("document.querySelector('#app-settings-back').click()",sessionId);
  }
  const unavailableFocus=await evaluate(`(() => {
    const state=window.communityState;state.phase='disconnected';state.catalog=null;state.discussion=null;state.serviceConnection='disconnected';
    window.communityPublic.render(state);window.communityShell.render(state);
    document.querySelector('#app-settings-button').click();document.querySelector('#app-settings-back').click();
    const active=document.activeElement;
    return {id:active?.id,visible:!!active?.getClientRects().length,disabled:!!active?.disabled};
  })()`,sessionId);
  process.stdout.write('Settings disconnected keyboard evidence: '+JSON.stringify(unavailableFocus)+'\n');
  assert.deepEqual(unavailableFocus,{id:'app-settings-button',visible:true,disabled:false},
    'Back from settings restores visible focus when discussion is unavailable');
  await evaluate("window.communityDispose()",sessionId);
  process.stdout.write("Community Chrome checks: related pages/global search, twenty-result My chats/read-only preview pages, synchronized sparkle voice menus, private replies, keyboard navigation/focus, Settings recovery and 320/360/390/420/480px layouts passed.\n");
}
