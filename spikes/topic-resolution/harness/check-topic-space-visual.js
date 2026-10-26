import assert from "node:assert/strict";

// Real packaged DOM/CSS with invented public content and inert client methods.
// This fixture does not connect to an account, service, crawler or provider.
export async function checkTopicSpaceVisual({browser,sessionId,evaluate,capture}) {
  await evaluate(`(async()=>{
    const {mountTopicSpacePanel}=await import('./topic-space-panel.js');
    for(const view of document.querySelectorAll('[id^="app-view-"]'))view.hidden=view.id!=='app-view-discover';
    const root=document.querySelector('#app-view-discover');root.replaceChildren();
    const section=document.createElement('section');section.className='topic-space-panel';root.append(section);
    document.body.dataset.uiMode='user';
    window.topicSpaceFixture={owner:false,queries:[],saves:[],opens:[],policy:{schema:'topic-space-policy/v1',revision:0,defaultSpecificity:0,topicOverrides:[]}};
    const fixture=window.topicSpaceFixture;
    const client={topicSpaces:async request=>{
      fixture.queries.push(structuredClone(request));const override=fixture.policy.topicOverrides[0];
      return {schema:'topic-spaces/v1',version:{generation:'synthetic',revision:1},policy:structuredClone(fixture.policy),state:'ready',total:1,
        groups:[{id:'refined-grilling',parentId:'base-cooking',policyTopicId:'base-cooking',title:override?.title??'Cooking and outdoor meals',
          specificity:override?.specificity??fixture.policy.defaultSpecificity,threadCount:1,humanCount:2,aiCount:1,score:0.9,
          threads:[{rootId:'root-grilling',topicId:'canonical-grilling',discussionId:'discussion-grilling',sourceId:'public-source',
            title:'How do you keep vegetables tender on a hot grill?',snippet:'<img src=x> A synthetic public preview with a long safe page link.',
            url:'https://example.org/a-long-public-grilling-article-for-layout-checks',humanCount:2,aiCount:1,updatedAt:'2026-10-18T00:00:00.000Z'}]}]};
    },topicSpaceOwner:async()=>({policy:structuredClone(fixture.policy),canManage:fixture.owner}),
    updateTopicSpacePolicy:async request=>{fixture.saves.push(structuredClone(request));fixture.policy={schema:'topic-space-policy/v1',revision:fixture.policy.revision+1,
      defaultSpecificity:request.defaultSpecificity,topicOverrides:structuredClone(request.topicOverrides)};return {policy:structuredClone(fixture.policy),canManage:true};}};
    fixture.client=client;
    window.topicSpaceFixturePanel=mountTopicSpacePanel(document,section,{client,onOpenDiscussion:(...args)=>fixture.opens.push(args)});
    window.topicSpaceFixturePanel.observe({sourceId:'public-source',actorId:null,sessionRevision:0});
    window.topicSpaceFixturePanel.setActive(true);window.topicSpaceFixturePanel.setConnection(true);
    await new Promise(resolve=>setTimeout(resolve,0));
  })()`,sessionId);
  assert.deepEqual(await evaluate(`({controls:document.querySelectorAll('#app-view-discover input[type=range]').length,
    ownerHidden:document.querySelector('#topic-space-owner').hidden,unsafe:document.querySelectorAll('#app-view-discover img,#app-view-discover script').length})`,sessionId),
  {controls:0,ownerHidden:true,unsafe:0},"guest sees text-only public groups with no grouping controls");
  for(const width of [420,360,320]) {
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height:720,deviceScaleFactor:1,mobile:false},sessionId);
    await capture("topic-space-guest-"+width,sessionId);
  }
  await evaluate(`(async()=>{window.topicSpaceFixture.owner=true;
    window.topicSpaceFixturePanel.observe({sourceId:'public-source',actorId:'synthetic-owner',sessionRevision:1});
    await new Promise(resolve=>setTimeout(resolve,0));
    const slider=document.querySelector('#topic-space-override-refined-grilling');slider.value='75';slider.dispatchEvent(new Event('input',{bubbles:true}));
    const label=document.querySelector('#topic-space-title-refined-grilling');label.value='<img src=x> BBQ';label.focus();
    window.topicSpaceFixturePanel.observe({sourceId:'public-source',actorId:'synthetic-owner',sessionRevision:1,catalog:{version:{revision:99}}});
    window.topicSpaceDraftPreserved=document.activeElement===label&&slider.value==='75'&&label.value==='<img src=x> BBQ';
  })()`,sessionId);
  assert.equal(await evaluate("window.topicSpaceDraftPreserved&&window.topicSpaceFixture.saves.length===0",sessionId),true,"polling preserves owner focus and unsaved label/specificity without writes");
  for(const width of [420,360,320]) {
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height:720,deviceScaleFactor:1,mobile:false},sessionId);
    await capture("topic-space-owner-"+width,sessionId);
  }
  await evaluate(`(async()=>{document.querySelector('#topic-space-save-refined-grilling').click();await new Promise(resolve=>setTimeout(resolve,0));})()`,sessionId);
  assert.deepEqual(await evaluate("window.topicSpaceFixture.saves",sessionId),[{expectedRevision:0,defaultSpecificity:0,topicOverrides:[{spaceId:"base-cooking",specificity:75,title:"<img src=x> BBQ"}]}],"one deliberate Save changes the stable base topic setting");
  assert.equal(await evaluate("document.querySelector('#topic-space-results h3').textContent==='<img src=x> BBQ'&&document.querySelectorAll('#app-view-discover img').length===0",sessionId),true,"owner label is rendered as text");
  await evaluate("document.querySelector('#topic-space-open-root-grilling').click()",sessionId);
  assert.equal(await evaluate("window.topicSpaceFixture.opens[0][0]",sessionId),"canonical-grilling","group action retains the canonical read-only destination");
  await evaluate(`(async()=>{window.topicSpaceFixture.owner=false;window.topicSpaceFixturePanel.observe({sourceId:'another-public-source',actorId:null,sessionRevision:2});await new Promise(resolve=>setTimeout(resolve,0));})()`,sessionId);
  assert.equal(await evaluate("document.querySelector('#topic-space-owner').hidden&&document.querySelectorAll('#app-view-discover input[type=range]').length===0&&window.topicSpaceFixture.queries.every(query=>query.sourceId===null)",sessionId),true,"logout removes owner controls while discovery stays page-independent");
  await evaluate("window.topicSpaceFixturePanel.dispose()",sessionId);
  await evaluate(`(async()=>{
    const {mountTopicSpacePanel}=await import('./topic-space-panel.js'),{mountDiscoveryPanel}=await import('./discovery-panel.js');
    const root=document.querySelector('#app-view-discover');root.replaceChildren();
    const groups=document.createElement('section'),library=document.createElement('section');groups.className='topic-space-panel';root.append(groups,library);
    const fixture=window.topicSpaceFixture;let trigger=null;
    const state={phase:'ready',sourceId:'public-source',topicId:'canonical-grilling',catalog:{sources:[{id:'public-source',topicId:'canonical-grilling',title:'Current page',url:'https://example.org/current'}]},related:null};
    const libraryPanel=mountDiscoveryPanel(document,library,{previewOnly:true,client:{discussion:()=>new Promise(resolve=>fixture.resolvePreview=resolve)},onPreviewChange:visible=>{
      groups.hidden=visible;if(!visible)queueMicrotask(()=>trigger?.isConnected&&trigger.focus());
    }});
    const panel=mountTopicSpacePanel(document,groups,{client:{...fixture.client,topicSpaces:async request=>{
      const result=await fixture.client.topicSpaces(request);result.total=20;result.groups=Array.from({length:20},(_,i)=>({...result.groups[0],id:'many-'+i,policyTopicId:'base-'+i,
        threads:result.groups[0].threads.map(thread=>({...thread,rootId:'many-root-'+i}))}));return result;
    }},onOpenDiscussion:topicId=>{trigger=document.activeElement;return libraryPanel.openDiscussion(topicId);}});
    libraryPanel.observePage(state);libraryPanel.setActive(true);libraryPanel.observeConnected(true);
    panel.observe(state);panel.setActive(true);panel.setConnection(true);await new Promise(resolve=>setTimeout(resolve,0));
    window.topicSpaceIntegrated={panel,libraryPanel,state,groups,library};
    document.querySelector('#topic-space-search').value='kapsalon';
    fixture.queriesBeforeNavigation=fixture.queries.length;
    panel.observe({...state,sourceId:'another-page',currentUrl:'https://example.org/another'});
    document.querySelector('#topic-space-open-many-root-19').focus();document.querySelector('#topic-space-open-many-root-19').click();
  })()`,sessionId);
  assert.equal(await evaluate("document.querySelector('#topic-space-heading').textContent==='Search Topics'&&document.querySelectorAll('#app-view-discover input[type=search]').length===1&&!document.querySelector('#discovery-search')&&window.topicSpaceFixture.queries.length===window.topicSpaceFixture.queriesBeforeNavigation&&document.querySelector('#topic-space-search').value==='kapsalon'",sessionId),true,"one global Search Topics field, no second search or page-dependent refresh");
  assert.equal(await evaluate("window.topicSpaceIntegrated.groups.hidden&&!document.querySelector('#discovery-preview').hidden&&document.activeElement.id==='discovery-back'",sessionId),true,"twenty groups cannot bury an explicitly opened slow preview; Back is immediately focused");
  await evaluate(`(() => {window.topicSpaceIntegrated.libraryPanel.observePage({...window.topicSpaceIntegrated.state,sourceId:'new-page',enrichmentPending:true});})()`,sessionId);
  assert.equal(await evaluate("window.topicSpaceIntegrated.groups.hidden&&!document.querySelector('#discovery-preview').hidden",sessionId),true,"optional matching hydration keeps the deliberate pending preview");
  await evaluate(`(async()=>{window.topicSpaceFixture.resolvePreview({version:{generation:'synthetic',revision:1},topic:{title:'Canonical public preview'},roots:[]});await new Promise(resolve=>setTimeout(resolve,0));})()`,sessionId);
  for(const width of [420,360,320]) {
    await browser.send("Emulation.setDeviceMetricsOverride",{width,height:720,deviceScaleFactor:1,mobile:false},sessionId);
    await capture("topic-space-integrated-preview-"+width,sessionId);
  }
  await evaluate(`(async()=>{document.querySelector('#discovery-back').click();await new Promise(resolve=>setTimeout(resolve,0));})()`,sessionId);
  assert.equal(await evaluate("!window.topicSpaceIntegrated.groups.hidden&&window.topicSpaceIntegrated.library.hidden&&document.activeElement.id==='topic-space-open-many-root-19'&&document.querySelector('#topic-space-search').value==='kapsalon'",sessionId),true,"Back restores global search and exact trigger focus without related-page clutter");
  await evaluate("window.topicSpaceIntegrated.panel.dispose();window.topicSpaceIntegrated.libraryPanel.dispose()",sessionId);
  process.stdout.write("Topic space Chrome checks: guest/owner controls, unchanged-poll focus, explicit base-topic policy save, safe labels, canonical preview callback, context/logout and 420/360/320px layouts passed.\n");
}
