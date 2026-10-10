// Opt-in isolated Chrome visual evidence for the shared popup/panel UI.
// This normal extension tab is a synthetic visual companion, not native sidePanel trust evidence.
// No service, real account, provider or webpage access.
// Run manually: node harness/run-popup-visual-check.js after
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromiumPipe } from "./chromium-pipe.js";

const stage = process.argv[2] ?? "after";
assert.ok(["before", "after"].includes(stage));
const executable = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const extensionRoot = fileURLToPath(new URL("../browser/", import.meta.url));
const profileRoot = mkdtempSync(path.join(os.tmpdir(), "udl-popup-visual-"));
const outputRoot = path.join(os.tmpdir(), "udl-popup-design-review");
mkdirSync(outputRoot, { recursive: true });
let browser;
async function evaluate(expression, sessionId) {
  const result = await browser.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (result.exceptionDetails) throw Error(`Visual evaluation failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
  return result.result.value;
}
async function capture(name, sessionId, { fluid = false } = {}) {
  const metrics = await evaluate(`(() => {
    const root=document.documentElement, body=document.body;
    const clientWidth=root.clientWidth;
    const escaped=[...document.querySelectorAll('body *')].filter(element => {
      if (!element.getClientRects().length) return false;
      const rect=element.getBoundingClientRect();
      return rect.left < -1 || rect.right > clientWidth + 1;
    }).slice(0, 8).map(element => element.id || element.tagName.toLowerCase());
    return {mode:body.dataset.uiMode,width:innerWidth,height:innerHeight,
      bodyWidth:body.getBoundingClientRect().width,scrollWidth:root.scrollWidth,
      clientWidth,escaped};
  })()`, sessionId);
  if (fluid) assert.equal(metrics.bodyWidth, metrics.clientWidth, `${name}: panel surface fills available width`);
  else assert.equal(metrics.bodyWidth, Math.min(metrics.mode === "user" ? 390 : 380, metrics.clientWidth),
    `${name}: companion popup body width follows the scrollbar-reduced viewport`);
  assert.ok(metrics.scrollWidth <= metrics.clientWidth, `${name}: no horizontal overflow`);
  assert.deepEqual(metrics.escaped, [], `${name}: visible elements stay within popup width`);
  const screenshot = await browser.send("Page.captureScreenshot", { format: "png" }, sessionId);
  const target = path.join(outputRoot, `${stage}-${name}.png`);
  writeFileSync(target, Buffer.from(screenshot.data, "base64"));
  process.stdout.write(`${JSON.stringify({name, target, metrics})}\n`);
}
async function checkWelcomeFirstViewport(sessionId, width) {
  const result = await evaluate(`(() => {
    const welcome=document.querySelector('#app-welcome');
    const order=[...welcome.children].map(element=>element.id);
    const controls=['#discussion-token','#discussion-token-help','#discussion-pair'].map(selector=>{
      const element=document.querySelector(selector), rect=element.getBoundingClientRect();
      return {selector,visible:element.getClientRects().length>0,top:rect.top,bottom:rect.bottom,
        left:rect.left,right:rect.right,height:rect.height};
    });
    return {width:innerWidth,height:innerHeight,scrollY,scrollWidth:document.documentElement.scrollWidth,
      clientWidth:document.documentElement.clientWidth,welcomeVisible:!welcome.hidden,order,controls};
  })()`, sessionId);
  assert.equal(result.width, width);
  assert.equal(result.height, 510);
  assert.equal(result.scrollY, 0, "first-run welcome starts at the top");
  assert.equal(result.welcomeVisible, true);
  assert.deepEqual(result.order, ["app-welcome-kicker", "app-welcome-heading", "app-welcome-connection", "app-welcome-intro"]);
  assert.ok(result.scrollWidth <= result.clientWidth, `${width}px welcome has no horizontal overflow`);
  for (const control of result.controls) {
    assert.ok(control.visible && control.top >= 0 && control.bottom <= 510 &&
      control.left >= 0 && control.right <= width && control.height > 0,
    `${width}px ${control.selector} fits the first viewport: ${JSON.stringify(control)}`);
  }
  process.stdout.write(`${JSON.stringify({name:`welcome-${width}`,result})}\n`);
}
async function checkReachable(selector, sessionId) {
  const result = await evaluate(`(() => {
    const target=document.querySelector(${JSON.stringify(selector)});
    target.scrollIntoView({block:'start'});
    target.focus({preventScroll:true});
    const rect=target.getBoundingClientRect();
    return {visible:target.getClientRects().length>0,focused:document.activeElement===target,
      focusVisible:target.matches(':focus-visible'),outline:getComputedStyle(target).outlineStyle,
      top:rect.top,bottom:rect.bottom};
  })()`, sessionId);
  assert.ok(result.visible && result.focused && result.focusVisible && result.outline !== "none",
    `${selector}: keyboard focus visible ${JSON.stringify(result)}`);
  assert.ok(result.top >= -1 && result.bottom <= await evaluate("innerHeight", sessionId) + 1,
    `${selector}: reachable in scroll viewport ${JSON.stringify(result)}`);
  return result;
}
async function tabTo(selector, sessionId) {
  await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }, sessionId);
  const result = await evaluate(`(() => {
    const target=document.querySelector(${JSON.stringify(selector)}), rect=target.getBoundingClientRect();
    return {active:document.activeElement===target,focusVisible:target.matches(':focus-visible'),
      top:rect.top,bottom:rect.bottom};
  })()`, sessionId);
  assert.ok(result.active && result.focusVisible && result.top >= -1 && result.bottom <= await evaluate("innerHeight", sessionId) + 1,
    `Tab reaches ${selector} in scroll viewport ${JSON.stringify(result)}`);
}
async function pressEnter(sessionId) {
  await browser.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, sessionId);
  await browser.send("Input.dispatchKeyEvent", { type: "char", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 }, sessionId);
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
}
try {
  assert.ok(existsSync(executable));
  browser = launchChromiumPipe({ executable, profileDirectory: path.join(profileRoot, "profile") });
  await browser.send("Browser.getVersion");
  const loaded = await browser.send("Extensions.loadUnpacked", { path: extensionRoot });
  const sessions = new Map();
  browser.on("Target.attachedToTarget", ({ sessionId, targetInfo }) => sessions.set(targetInfo.targetId, sessionId));
  await browser.send("Target.setDiscoverTargets", { discover: true });
  await browser.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true,
    filter: [{ type: "page", exclude: false }, { type: "other", exclude: false }, { exclude: true }] });
  const companion = await browser.send("Target.createTarget", { url: `chrome-extension://${loaded.id}/chromium/popup.html` });
  let sessionId;
  for (let attempt = 0; attempt < 100 && !sessionId; attempt++) {
    sessionId = sessions.get(companion.targetId);
    if (!sessionId) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(sessionId);
  await browser.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 600, deviceScaleFactor: 1, mobile: false }, sessionId);
  const popupExceptions = [];
  browser.on("Runtime.exceptionThrown", ({ exceptionDetails }, eventSessionId) => {
    if (eventSessionId !== sessionId) return;
    popupExceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text);
  });
  await browser.send("Runtime.enable", {}, sessionId);
  await browser.send("Page.enable", {}, sessionId);
  // Reload after Runtime.enable so uncaught startup errors cannot precede the listener.
  await browser.send("Page.reload", { ignoreCache: true }, sessionId);
  let ready;
  for (let attempt = 0; attempt < 100 && !ready; attempt++) {
    ready = await evaluate("document.readyState === 'complete' && !!document.querySelector('#insight-quick-actions')", sessionId).catch(() => false);
    if (!ready) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready);
  assert.deepEqual(popupExceptions, [], "popup startup has no uncaught runtime exceptions");
  await capture("connection", sessionId);
  let welcomeMarkup = await evaluate("document.body.innerHTML", sessionId);
  if (stage === "after") {
    // Replace only renderers with synthetic states. Their callbacks are inert.
    await evaluate(`(async () => {
      const {mountDiscussionPanel}=await import('./discussion-panel.js');
      const {mountInsightPanel}=await import('./insight-panel.js');
      const {mountPopupShell}=await import('./popup-shell.js');
      const matchingVisual=document.querySelector('#page-matching').cloneNode(true);
      window.dispatchEvent(new Event('pagehide'));
      document.querySelector('#page-matching').replaceWith(matchingVisual);
      const insightRoot=document.querySelector('#local-insights')??document.createElement('section');
      insightRoot.id='local-insights';insightRoot.className='action-panel';
      const settingsInsightHost=document.querySelector('#app-settings-insights');
      if (!settingsInsightHost) throw Error('Missing remount target: settings host');
      document.querySelector('#app-view-insights').append(insightRoot);
      for (const selector of ['#app-welcome-connection','#app-settings-connection','#app-pages-list'])
        document.querySelector(selector).replaceChildren();
      const discussionRoot=document.querySelector('#local-discussion'); discussionRoot.replaceChildren();
      const insightHost=document.createElement('div'); insightHost.id='app-discussion-insights-host'; discussionRoot.append(insightHost);
      settingsInsightHost.replaceChildren();
      const settingsInsightHeading=document.createElement('h3'); settingsInsightHeading.id='app-settings-insights-heading'; settingsInsightHost.append(settingsInsightHeading);
      insightRoot.replaceChildren();
      const discussion=mountDiscussionPanel(document,discussionRoot);
      const insights=mountInsightPanel(document,insightRoot);
      const state={phase:'ready',busy:false,error:null,actorId:'demo-alex',topicId:'topic-visual',sourceId:'source-visual',selection:'background',
        catalog:{model:{status:'fixture-only'},actors:[{id:'demo-alex',displayName:'Alex · synthetic'},{id:'demo-blair',displayName:'Blair · synthetic'}],
          topics:[{id:'topic-visual',title:'A quieter, greener city'}],sources:[{id:'source-visual',topicId:'topic-visual',title:'Synthetic public article',url:'https://example.com/article'}]},
        discussion:{roots:[{id:'root-1',rootId:null,state:'visible',authorId:'demo-blair',actorType:'human',
          body:'What would make your neighborhood a better place to spend time?',edited:false,replies:[]}]},
        related:{results:[1,2,3,4].map(index=>({title:'Synthetic page '+index,
          url:'https://example.com/related/'+index,relationship:index===1?'same-topic':'related'}))},
        draft:{body:'',detached:false,mode:'root',targetId:null}};
      const insightState={available:true,busy:false,status:'prepared',draft:'',preview:null,
        context:{topic:{id:'topic-visual',title:'A quieter, greener city'},currentSource:{id:'source-visual',title:'Synthetic public article',url:'https://example.com/article'},sameTopicSources:[],relatedSources:[],discussion:[]},
        ai:{connected:true,planEnabled:true,pending:false,models:[{slug:'synthetic',displayName:'Synthetic model'}],model:'synthetic',
          articleText:'',article:null,costConsent:false,result:null,status:'connected'}};
      window.visualCreates=0;
      discussion.bind(new Proxy({currentState:()=>state},{get:(object,key)=>object[key]??(()=>{})}));
      const insightController=new Proxy({currentState:()=>insightState,createInsights:()=>{window.visualCreates++;return Promise.resolve(true)}},
        {get:(object,key)=>object[key]??(()=>{})});
      insights.bind(insightController);discussion.bindInsight(insightController);
      const shell=mountPopupShell(document,{onModeChange:value=>discussion.setMode(value)});
      window.visualDiscussionPanel=discussion;window.visualDiscussionState=state;
      window.visualInsightPanel=insights;window.visualInsightState=insightState;window.visualShell=shell;
      const disconnected={...state,phase:'disconnected',catalog:null,sourceId:null,discussion:null};
      discussion.render(disconnected); shell.render(disconnected);
      window.visualWelcomeMarkup=document.body.innerHTML;
      discussion.render(state); shell.render(state); scrollTo(0,0);
    })()`, sessionId);
    welcomeMarkup = await evaluate("window.visualWelcomeMarkup", sessionId);
    const assertView = async (selector) => {
      assert.equal(await evaluate(`(() => {
        const target=document.querySelector(${JSON.stringify(selector)});
        return target && !target.hidden && target.getClientRects().length>0 && document.querySelector('#app-welcome').hidden;
      })()`, sessionId), true, `${selector} visible, welcome hidden`);
    };
    await assertView("#app-view-discussion");
    assert.equal(await evaluate("(() => document.body.dataset.topicState==='ready' && document.querySelector('#app-source-title').textContent==='Synthetic public article' && document.querySelector('#app-source-domain').textContent==='example.com' && getComputedStyle(document.body,'::before').display==='none')()", sessionId), true,
      "resolved Source appears in the compact header without an ambient layer");
    await capture("discussion", sessionId);
    assert.equal(await evaluate(`(() => {
      const state = window.visualDiscussionState, panel = window.visualDiscussionPanel;
      const reply = document.querySelector('[data-action="reply"][data-contribution-id="root-1"]');
      reply.focus({preventScroll:true});
      if (document.activeElement !== reply) return false;
      state.busy = true; panel.render(state);
      const during = document.querySelector('.discussion-thread').contains(document.activeElement) &&
        document.activeElement !== document.body && !document.activeElement.disabled;
      state.busy = false; panel.render(state);
      const after = document.querySelector('.discussion-thread').contains(document.activeElement) &&
        document.activeElement !== document.body;
      return during && after;
    })()`, sessionId), true, "focused thread control remains inside the thread across busy and ready renders");
    await evaluate(`(() => {
      const root = window.visualDiscussionState.discussion.roots[0];
      root.createdAt = '2026-10-06T10:00:00.000Z';
      root.origin = {sourceId:'source-visual',title:'Synthetic public article',url:'https://example.com/article'};
      root.replies = [
        {id:'reply-child',rootId:'root-1',replyToId:'reply-1',state:'visible',authorId:'demo-alex',actorType:'human',
          body:'A nested reply to the first answer.',createdAt:'2026-10-06T10:01:00.000Z',edited:false,
          origin:{sourceId:'source-visual',title:'Synthetic public article',url:'https://example.com/article'}},
        {id:'reply-1',rootId:'root-1',replyToId:'root-1',state:'visible',authorId:'demo-blair',actorType:'human',
          body:'I would start with quieter streets and more shade.',createdAt:'2026-10-06T10:01:00.000Z',edited:false},
        {id:'reply-2',rootId:'root-1',replyToId:'root-1',state:'visible',authorId:'demo-alex',actorType:'human',
          body:'More places to meet would help too.',createdAt:'2026-10-06T10:02:00.000Z',edited:false}
      ];
      window.visualDiscussionPanel.render(window.visualDiscussionState);
      document.querySelector('[data-action="expand"][data-contribution-id="root-1"]').click();
      document.querySelector('[data-action="expand"][data-contribution-id="reply-1"]').click();
      document.querySelector('.discussion-thread-card')?.scrollIntoView({block:'start'});
    })()`, sessionId);
    assert.equal(await evaluate("(() => {const toggle=document.querySelector('[data-action=expand][data-contribution-id=reply-1]');return toggle?.getAttribute('aria-expanded')==='true' && document.querySelectorAll('.discussion-reply-branch').length===3 && document.querySelectorAll('.discussion-source-link').length===2})()", sessionId), true,
      "nested reply bubbles preserve out-of-order parent lineage and per-post source links");
    await new Promise((resolve) => setTimeout(resolve, 240));
    await capture("nested-replies", sessionId);
    await evaluate("window.visualDiscussionState.discussion.roots[0].replies=[];window.visualDiscussionPanel.render(window.visualDiscussionState);scrollTo(0,0)", sessionId);
    await evaluate("window.visualDiscussionState.draft={body:'A thoughtful reply',detached:false,mode:'reply',targetId:'root-1'};window.visualDiscussionPanel.render(window.visualDiscussionState);scrollTo(0,0)", sessionId);
    assert.equal(await evaluate("(() => { const cue=document.querySelector('#discussion-reply-context'); return cue && !cue.hidden && cue.textContent.includes('Blair') && document.querySelector('#discussion-submit').textContent === 'Post reply'; })()", sessionId), true,
      "reply composer identifies its exact target before submission");
    await capture("reply", sessionId);
    await evaluate("window.visualDiscussionState.draft={body:'',detached:false,mode:'root',targetId:null};window.visualDiscussionPanel.render(window.visualDiscussionState)", sessionId);
    assert.equal(await evaluate("(() => document.querySelector('#app-navigation').hidden && document.querySelector('#app-view-pages').hidden)()", sessionId), true,
      "User Mode has one Discussion view and no visible related-pages list");
    await evaluate("window.visualDiscussionState.phase='choose-topic';window.visualDiscussionState.topicId=null;window.visualDiscussionState.discussion=null;window.visualDiscussionState.related={results:[]};window.visualDiscussionPanel.render(window.visualDiscussionState);window.visualShell.render(window.visualDiscussionState);document.querySelector('#app-tab-discussion').click()", sessionId);
    assert.equal(await evaluate("(() => { const status=document.querySelector('#discussion-status');return !document.querySelector('#app-topic-header') && !document.querySelector('#app-start-session') && !document.querySelector('#app-choose-topic') && status.textContent.includes('see its discussions') && document.body.dataset.topicState==='idle' && document.querySelector('#discussion-composer').hidden && document.querySelector('#discussion-ai-insights').hidden; })()", sessionId), true,
      "no-topic view explains automatic discovery without manual controls or empty composer");
    await capture("awaiting-topic", sessionId);
    await evaluate("window.visualDiscussionState.phase='loading';window.visualDiscussionState.topicId='topic-visual';window.visualDiscussionState.sourceId='source-visual';window.visualDiscussionState.selection='background';window.visualDiscussionState.catalog.sources=[{id:'source-visual',topicId:'topic-visual',title:'Synthetic public article',url:'https://example.com/article'}];window.visualDiscussionState.related=null;window.visualDiscussionState.draft={body:'A draft while discussions load',detached:false,mode:'root',targetId:null};window.visualDiscussionPanel.render(window.visualDiscussionState);window.visualShell.render(window.visualDiscussionState);scrollTo(0,0)", sessionId);
    assert.equal(await evaluate("(() => {const status=document.querySelector('#discussion-status'),scene=document.querySelector('#discussion-loading-scene'),composer=document.querySelector('#discussion-composer'),body=document.querySelector('#discussion-body'),thread=document.querySelector('.discussion-thread'),post=document.querySelector('#discussion-submit'),insight=document.querySelector('#discussion-ai-insights');return status.textContent==='Loading discussions…' && status.getAttribute('role')==='status' && getComputedStyle(status).width==='1px' && !scene.hidden && scene.getAttribute('aria-hidden')==='true' && scene.getClientRects().length>0 && scene.querySelectorAll('.discussion-loading-card').length===2 && !composer.hidden && !body.disabled && body.value==='A draft while discussions load' && thread.hidden && thread.getClientRects().length===0 && post.disabled && getComputedStyle(post).backgroundColor==='rgb(41, 44, 54)' && !insight.hidden && insight.disabled && getComputedStyle(insight).backgroundColor==='rgb(41, 44, 54)'})()", sessionId), true,
      "loading scene replaces visible copy while status remains accessible, draft stays editable, and Post and Insight stay disabled");
    await capture("loading-discussions", sessionId);
    await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    assert.equal(await evaluate("(() => getComputedStyle(document.querySelector('.discussion-loading-avatar')).animationName)()", sessionId), "none",
      "loading scene respects reduced motion");
    await browser.send("Emulation.setEmulatedMedia", { features: [] }, sessionId);
    await evaluate("window.visualDiscussionState.phase='ready';window.visualDiscussionState.sourceId=null;window.visualDiscussionState.selection='manual';window.visualDiscussionState.draft={body:'',detached:false,mode:'root',targetId:null};window.visualDiscussionState.discussion={roots:[{id:'root-1',rootId:null,state:'visible',authorId:'demo-blair',actorType:'human',body:'What would make your neighborhood a better place to spend time?',edited:false,replies:[]}]};window.visualDiscussionState.related={results:[1,2,3,4].map(index=>({title:'Synthetic page '+index,url:'https://example.com/related/'+index,relationship:index===1?'same-topic':'related'}))};window.visualDiscussionPanel.render(window.visualDiscussionState);window.visualShell.render(window.visualDiscussionState)", sessionId);
    await evaluate("document.querySelector('#app-tab-discussion').click();window.visualDiscussionState.discussion={roots:[]};window.visualDiscussionPanel.render(window.visualDiscussionState);scrollTo(0,0)", sessionId);
    await capture("empty-discussion", sessionId);
    await evaluate("window.visualDiscussionState.discussion={roots:[{id:'root-1',rootId:null,state:'visible',authorId:'demo-blair',actorType:'human',body:'Long synthetic comment: '+'neighborhood'.repeat(45),edited:false,replies:[]}]};window.visualDiscussionPanel.render(window.visualDiscussionState);scrollTo(0,0)", sessionId);
    await capture("long-discussion", sessionId);
    await evaluate("document.querySelector('#discussion-ai-insights').click();scrollTo(0,0)", sessionId);
    await assertView("#app-view-discussion");
    assert.equal(await evaluate("window.visualCreates", sessionId), 1, "primary Create forwards exactly once");
    assert.equal(await evaluate("document.querySelector('#app-view-insights').hidden", sessionId), true);
    await capture("compose-insight", sessionId);
    await evaluate("window.visualInsightState.draft='Synthetic private insight draft about shaded gathering places.';window.visualInsightState.relatedExcerptCount=2;window.visualInsightState.ai.status='generated';window.visualInsightState.ai.result={body:window.visualInsightState.draft,model:'synthetic',citations:[]};window.visualInsightPanel.render(window.visualInsightState);document.querySelector('#insight-draft-details').scrollIntoView({block:'start'})", sessionId);
    assert.equal(await evaluate("(() => { const note=document.querySelector('#insight-related-excerpt-indicator');const summary=document.querySelector('#insight-related-excerpt-summary');return note.hidden && !summary.hidden && summary.textContent === 'Linked pages read: 2' && !/verified|used/i.test(summary.textContent); })()", sessionId), true,
      "Settings disclose linked excerpt count without claiming verification in the private card");
    await capture("private-draft", sessionId);
    await checkReachable("#insight-share", sessionId);
    await checkReachable("#insight-discard", sessionId);
    await evaluate("document.querySelector('#app-settings-button').click();document.querySelector('#insight-account-details').open=true;document.querySelector('#insight-account-details > summary').focus()", sessionId);
    await tabTo("#insight-checkConnection", sessionId);
    await tabTo("#insight-disconnect", sessionId);
    await evaluate("document.querySelector('#insight-account-details > summary').scrollIntoView({block:'start'})", sessionId);
    await capture("account-ready-switch", sessionId);
    await evaluate("window.visualInsightState.ai.model='';window.visualInsightPanel.render(window.visualInsightState);document.querySelector('#insight-account-details > summary').focus()", sessionId);
    await evaluate("document.querySelector('#insight-account-details > summary').focus()", sessionId);
    await tabTo("#insight-checkConnection", sessionId);
    await tabTo("#insight-disconnect", sessionId);
    await evaluate("document.querySelector('#insight-account-details > summary').scrollIntoView({block:'start'})", sessionId);
    await capture("account-no-model", sessionId);
    await evaluate("document.querySelector('#app-settings-back').click();document.querySelector('#discussion-ai-insights').click()", sessionId);
    assert.equal(await evaluate("window.visualCreates", sessionId), 1, "missing model only opens setup");
    assert.equal(await evaluate("window.visualInsightState.draft === document.querySelector('#insight-citations').textContent", sessionId), true,
      "private draft survives navigation");
    await evaluate("window.visualInsightState.ai.status='usageLimit';window.visualInsightPanel.render(window.visualInsightState);window.visualDiscussionPanel.renderInsightState(window.visualInsightState);document.querySelector('#app-settings-back').click();scrollTo(0,0)", sessionId);
    await capture("usage-limit", sessionId);
    await evaluate("document.querySelector('#app-settings-button').click();scrollTo(0,0)", sessionId);
    await assertView("#app-settings-view");
    await capture("settings", sessionId);
    await evaluate("document.querySelector('#capture-settings').open=true;document.querySelector('#matching-how').open=false;document.querySelector('#capture-settings').scrollIntoView({block:'start'})", sessionId);
    assert.equal(await evaluate("document.querySelector('#matching-how').open === false && document.querySelector('#matching-user-status').getClientRects().length > 0", sessionId), true,
      "User matching surface shows compact status with technical detail collapsed");
    await capture("matching-settings", sessionId);
    await evaluate("document.querySelector('#ui-mode-developer').click();scrollTo(0,0)", sessionId);
    await capture("developer", sessionId);
    await evaluate("document.querySelector('#ui-mode-user').click();document.querySelector('#app-settings-back').click();window.visualInsightState.draft='';window.visualInsightState.ai.result=null;window.visualInsightState.ai.status='prepared';window.visualInsightPanel.render(window.visualInsightState);window.visualDiscussionState.discussion={roots:[{id:'root-compact',rootId:null,state:'visible',authorId:'demo-blair',actorType:'human',body:'A deliberately long synthetic neighborhood contribution with uninterruptedword'.repeat(18),edited:false,replies:[]}]};window.visualDiscussionPanel.render(window.visualDiscussionState);window.visualDiscussionPanel.renderInsightState(window.visualInsightState);window.visualShell.render(window.visualDiscussionState);scrollTo(0,0)", sessionId);
    await new Promise(resolve => setTimeout(resolve, 250));
    // Exercise the same inert UI as a panel-width extension page. This is a
    // layout check; it does not attest native sidePanel window binding.
    const syntheticMarkup = await evaluate("document.body.innerHTML", sessionId);
    const compactTarget = await browser.send("Target.createTarget", { url: `chrome-extension://${loaded.id}/chromium/popup.html` });
    let compactSession;
    for (let attempt = 0; attempt < 100 && !compactSession; attempt++) {
      compactSession = sessions.get(compactTarget.targetId);
      if (!compactSession) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(compactSession, "isolated compact extension tab attached");
    await browser.send("Runtime.enable", {}, compactSession);
    await browser.send("Page.enable", {}, compactSession);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate("document.readyState === 'complete' && !!document.body", compactSession).catch(() => false)) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await evaluate(`window.dispatchEvent(new Event('pagehide'));document.body.innerHTML=${JSON.stringify(syntheticMarkup)};document.body.dataset.uiMode='user';document.body.dataset.uiSurface='sidepanel';document.body.dataset.extensionSurface='sidepanel';document.querySelectorAll('.is-new').forEach(node=>node.classList.remove('is-new'));scrollTo(0,0)`, compactSession);
    for (const width of [320, 360, 400, 480]) {
      await browser.send("Emulation.setDeviceMetricsOverride", { width, height: 600, deviceScaleFactor: 1, mobile: false }, compactSession);
      await capture(`panel-long-${width}`, compactSession, { fluid: true });
    }
    // 160 CSS pixels at DPR 2 represents a 320-pixel panel at 200% zoom.
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 160, height: 300, deviceScaleFactor: 2, mobile: false }, compactSession);
    await capture("panel-long-320-zoom200", compactSession, { fluid: true });
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 600, deviceScaleFactor: 1, mobile: false }, compactSession);
    await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, compactSession);
    assert.equal(await evaluate("(() => { const card=document.querySelector('.discussion-contribution');card.classList.add('is-new');const button=document.querySelector('#discussion-ai-insights');return getComputedStyle(card).animationDuration==='0s' && getComputedStyle(button).transitionDuration==='0s' && getComputedStyle(document.body,'::before').display==='none' && getComputedStyle(document.body,'::after').display==='none'; })()", compactSession), true,
      "reduced motion suppresses entrance, hover and ambient effects");
    await capture("panel-long-320-reduced-motion", compactSession, { fluid: true });
    await evaluate(`document.body.innerHTML=${JSON.stringify(welcomeMarkup)};document.body.dataset.uiMode='user';document.body.style.zoom='';scrollTo(0,0)`, compactSession);
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 510, deviceScaleFactor: 1, mobile: false }, compactSession);
    await checkWelcomeFirstViewport(compactSession, 390);
    await capture("welcome-390", compactSession, { fluid: true });
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 510, deviceScaleFactor: 1, mobile: false }, compactSession);
    await checkWelcomeFirstViewport(compactSession, 320);
    await capture("welcome-320", compactSession, { fluid: true });
  } else {
  // Remount only the discussion renderer with invented state for visual review.
  // Controller callbacks are inert: this fixture cannot post or call a provider.
  await evaluate(`(async () => {
    const {mountDiscussionPanel}=await import('./discussion-panel.js');
    const root=document.querySelector('#local-discussion'); root.replaceChildren();
    const panel=mountDiscussionPanel(document,root);
    const state={phase:'ready',busy:false,error:null,actorId:'demo-alex',topicId:'topic-visual',sourceId:null,selection:'manual',
      catalog:{model:{status:'fixture-only'},actors:[{id:'demo-alex',displayName:'Alex · synthetic'},{id:'demo-blair',displayName:'Blair · synthetic'}],
        topics:[{id:'topic-visual',title:'A quieter, greener city'}],sources:[]},
      discussion:{roots:[{id:'root-1',rootId:null,state:'visible',authorId:'demo-blair',actorType:'human',body:'What would make your neighborhood a better place to spend time?',edited:false,replies:[]}]},
      related:{results:[1,2,3,4].map(index=>({title:'Related synthetic page '+index,
        url:'https://example.com/related/'+index,relationship:index===1?'same-topic':'related'}))},
      draft:{body:'',detached:false,mode:'root',targetId:null}};
    window.visualDiscussionPanel=panel;window.visualDiscussionState=state;
    panel.bind(new Proxy({currentState:()=>state},{get:(object,key)=>object[key]??(()=>{})})); panel.render(state);
    const status=document.querySelector('#connection-status');status.textContent='Synthetic design preview';status.dataset.state='connected';
    document.querySelector('#insight-account-details').setAttribute('data-ready','true');
    scrollTo(0,0);
  })()`, sessionId);
  await capture("discussion", sessionId);
  assert.equal(await evaluate("document.querySelector('#discussion-related > summary').textContent", sessionId), "Related pages (4)");
  await evaluate("document.querySelector('#discussion-related > summary').scrollIntoView({block:'start'});document.querySelector('#discussion-related > summary').focus();", sessionId);
  await pressEnter(sessionId);
  assert.equal(await evaluate("document.querySelector('#discussion-related').open", sessionId), true);
  await capture("related-pages", sessionId);
  await pressEnter(sessionId);
  assert.equal(await evaluate("document.querySelector('#discussion-related').open", sessionId), false);
  await evaluate("window.visualDiscussionState.discussion={roots:[]};window.visualDiscussionPanel.render(window.visualDiscussionState);scrollTo(0,0);", sessionId);
  await capture("empty-discussion", sessionId);
  await evaluate("window.visualDiscussionState.discussion={roots:[{id:'root-1',rootId:null,state:'visible',authorId:'demo-blair',actorType:'human',body:'What would make your neighborhood a better place to spend time?',edited:false,replies:[]}]};window.visualDiscussionPanel.render(window.visualDiscussionState);document.querySelector('#discussion-related').open=false;scrollTo(0,0);", sessionId);
  await checkReachable("#discussion-body", sessionId);
  await evaluate(`(() => {
    document.querySelector('.discussion-body').textContent='A synthetic discussion comment with a very long unbroken word: ' + 'neighborhood'.repeat(45);
    scrollTo(0,0);
  })()`, sessionId);
  await capture("long-discussion", sessionId);
  await checkReachable("#discussion-body", sessionId);
  await evaluate("document.querySelector('#insight-workspace').open=true; document.querySelector('#insight-workspace').scrollIntoView({block:'start'});", sessionId);
  await capture("insights", sessionId);
  await evaluate(`(async () => {
    const {mountInsightPanel}=await import('./insight-panel.js');
    const root=document.querySelector('#local-insights');root.replaceChildren();
    const panel=mountInsightPanel(document,root);
    const draft='Synthetic design example: A small shaded gathering place could help neighbors spend more time outside. Which streets need it most?';
    const state={available:true,busy:false,status:'prepared',draft,preview:null,
      context:{topic:{id:'topic-visual',title:'A quieter, greener city'},currentSource:{id:'source-visual',title:'Synthetic neighborhood article',url:'https://example.com/article'},sameTopicSources:[],relatedSources:[],discussion:[]},
      ai:{connected:true,planEnabled:true,pending:false,models:[{slug:'synthetic',displayName:'Synthetic model'}],model:'synthetic',articleText:'',article:null,costConsent:false,result:{body:draft,model:'synthetic',citations:[]},status:'generated'}};
    window.visualInsightPanel=panel;window.visualInsightState=state;
    panel.bind(new Proxy({currentState:()=>state},{get:(object,key)=>object[key]??(()=>{})}));
    const workspace=document.querySelector('#insight-workspace');workspace.open=true;workspace.scrollIntoView({block:'start'});
  })()`, sessionId);
  await capture("private-draft", sessionId);
  await evaluate("document.querySelector('#insight-account-details > summary').scrollIntoView({block:'start'});document.querySelector('#insight-account-details > summary').focus();", sessionId);
  await pressEnter(sessionId);
  assert.equal(await evaluate("document.querySelector('#insight-account-details').open", sessionId), true);
  await tabTo("#insight-checkConnection", sessionId);
  await tabTo("#insight-disconnect", sessionId);
  await capture("account-ready-switch", sessionId);
  await evaluate("window.visualInsightState.ai={...window.visualInsightState.ai,model:'',models:[],status:'connected'};window.visualInsightPanel.render(window.visualInsightState);document.querySelector('#insight-account-details').open=false;document.querySelector('#insight-account-details > summary').focus();", sessionId);
  await pressEnter(sessionId);
  assert.equal(await evaluate("document.querySelector('#insight-account-details').open", sessionId), true);
  await tabTo("#insight-checkConnection", sessionId);
  await tabTo("#insight-disconnect", sessionId);
  await capture("account-missing-model-switch", sessionId);
  await evaluate("window.visualInsightState.ai={...window.visualInsightState.ai,model:'synthetic',models:[{slug:'synthetic',displayName:'Synthetic model'}],status:'generated'};window.visualInsightPanel.render(window.visualInsightState);", sessionId);
  await checkReachable("#insight-share", sessionId);
  await checkReachable("#insight-discard", sessionId);
  await evaluate(`(() => {
    document.querySelector('#insight-quick-status').hidden=false;
    document.querySelector('#insight-quick-status').textContent='Synthetic diagnostic status that wraps onto several lines to exercise the full fixed footer height.';
  })()`, sessionId);
  await capture("footer-status", sessionId);
  await checkReachable("#insight-discard", sessionId);
  await evaluate("document.querySelector('#insight-citations').scrollIntoView({block:'start'}); document.querySelector('#insight-share').focus();", sessionId);
  await tabTo("#insight-discard", sessionId);
  await evaluate("document.querySelector('#popup-preferences > summary').scrollIntoView({block:'start'});document.querySelector('#popup-preferences > summary').focus();", sessionId);
  await pressEnter(sessionId);
  assert.equal(await evaluate("document.querySelector('#popup-preferences').open", sessionId), true);
  await capture("settings", sessionId);
  await tabTo("#ui-mode-user", sessionId);
  await capture("settings-focus", sessionId);
  await tabTo("#ui-mode-developer", sessionId);
  await pressEnter(sessionId);
  assert.equal(await evaluate("document.body.dataset.uiMode", sessionId), "developer");
  await evaluate("scrollTo(0,0)", sessionId);
  await capture("developer", sessionId);
  await checkReachable("#discussion-body", sessionId);
  }
  assert.deepEqual(popupExceptions, [], "popup rendering has no uncaught runtime exceptions");
} finally {
  await browser?.close();
  const target = path.resolve(profileRoot);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.ok(path.basename(target).startsWith("udl-popup-visual-"));
  rmSync(target, { recursive: true, force: true });
}
