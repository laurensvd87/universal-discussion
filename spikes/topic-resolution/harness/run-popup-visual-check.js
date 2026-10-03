// Opt-in isolated Chrome visual evidence. No service, real account or page access.
// Run manually: node harness/run-popup-visual-check.js before|after
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
  if (result.exceptionDetails) throw Error("Visual evaluation failed");
  return result.result.value;
}
async function capture(name, sessionId) {
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
  assert.equal(metrics.bodyWidth, metrics.mode === "user" ? 410 : 380, `${name}: popup body width`);
  assert.ok(metrics.scrollWidth <= metrics.clientWidth, `${name}: no horizontal overflow`);
  assert.deepEqual(metrics.escaped, [], `${name}: visible elements stay within popup width`);
  const screenshot = await browser.send("Page.captureScreenshot", { format: "png" }, sessionId);
  const target = path.join(outputRoot, `${stage}-${name}.png`);
  writeFileSync(target, Buffer.from(screenshot.data, "base64"));
  process.stdout.write(`${JSON.stringify({name, target, metrics})}\n`);
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
  await browser.send("Target.createTarget", { url: "about:blank" });
  const tabs = await browser.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }, { exclude: true }] });
  const tab = tabs.targetInfos.find(item => item.type === "tab" && item.url === "about:blank");
  await browser.send("Extensions.triggerAction", { id: loaded.id, targetId: tab.targetId });
  let sessionId;
  for (let attempt = 0; attempt < 100 && !sessionId; attempt++) {
    const targets = await browser.send("Target.getTargets");
    const popup = targets.targetInfos.find(item => item.url === `chrome-extension://${loaded.id}/chromium/popup.html`);
    sessionId = popup && sessions.get(popup.targetId);
    if (!sessionId) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(sessionId);
  await browser.send("Runtime.enable", {}, sessionId);
  await browser.send("Page.enable", {}, sessionId);
  let ready;
  for (let attempt = 0; attempt < 100 && !ready; attempt++) {
    ready = await evaluate("!!document.querySelector('#insight-quick-actions')", sessionId).catch(() => false);
    if (!ready) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready);
  await capture("connection", sessionId);
  if (stage === "after") {
    // Replace only renderers with synthetic states. Their callbacks are inert.
    await evaluate(`(async () => {
      const {mountDiscussionPanel}=await import('./discussion-panel.js');
      const {mountInsightPanel}=await import('./insight-panel.js');
      const {mountPopupShell}=await import('./popup-shell.js');
      const matchingVisual=document.querySelector('#page-matching').cloneNode(true);
      const startVisual=document.querySelector('#app-start-session').cloneNode(true);
      const chooseVisual=document.querySelector('#app-choose-topic').cloneNode(true);
      window.dispatchEvent(new Event('pagehide'));
      document.querySelector('#page-matching').replaceWith(matchingVisual);
      document.querySelector('main').append(startVisual,chooseVisual);
      for (const selector of ['#app-topic-header','#app-welcome-connection','#app-settings-connection','#app-pages-list'])
        document.querySelector(selector).replaceChildren();
      const discussionRoot=document.querySelector('#local-discussion'); discussionRoot.replaceChildren();
      const insightRoot=document.querySelector('#local-insights'); insightRoot.replaceChildren();
      const discussion=mountDiscussionPanel(document,discussionRoot);
      const insights=mountInsightPanel(document,insightRoot);
      const state={phase:'ready',busy:false,error:null,actorId:'demo-alex',topicId:'topic-visual',sourceId:null,selection:'manual',
        catalog:{model:{status:'fixture-only'},actors:[{id:'demo-alex',displayName:'Alex · synthetic'},{id:'demo-blair',displayName:'Blair · synthetic'}],
          topics:[{id:'topic-visual',title:'A quieter, greener city'}],sources:[]},
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
      insights.bind(new Proxy({currentState:()=>insightState,createInsights:()=>{window.visualCreates++;return Promise.resolve(true)}},
        {get:(object,key)=>object[key]??(()=>{})}));
      const shell=mountPopupShell(document,{onModeChange:value=>discussion.setMode(value)});
      window.visualDiscussionPanel=discussion;window.visualDiscussionState=state;
      window.visualInsightPanel=insights;window.visualInsightState=insightState;window.visualShell=shell;
      shell.render(state); scrollTo(0,0);
    })()`, sessionId);
    const assertView = async (selector) => {
      assert.equal(await evaluate(`(() => {
        const target=document.querySelector(${JSON.stringify(selector)});
        return target && !target.hidden && target.getClientRects().length>0 && document.querySelector('#app-welcome').hidden;
      })()`, sessionId), true, `${selector} visible, welcome hidden`);
    };
    await assertView("#app-view-discussion");
    await capture("discussion", sessionId);
    await evaluate("document.querySelector('#app-tab-discussion').focus()", sessionId);
    await tabTo("#app-tab-pages", sessionId);
    await tabTo("#app-tab-insights", sessionId);
    assert.equal(await evaluate("document.querySelector('#app-tab-discussion').getAttribute('aria-current')", sessionId), "page");
    await evaluate("document.querySelector('#app-tab-pages').click();scrollTo(0,0)", sessionId);
    await assertView("#app-view-pages");
    await capture("pages", sessionId);
    assert.equal(await evaluate("document.querySelector('#discussion-related li a')?.getAttribute('rel')", sessionId), "noopener noreferrer");
    await evaluate("window.visualDiscussionState.phase='choose-topic';window.visualDiscussionState.topicId=null;window.visualDiscussionState.discussion=null;window.visualDiscussionState.related={results:[]};window.visualDiscussionPanel.render(window.visualDiscussionState);window.visualShell.render(window.visualDiscussionState);document.querySelector('#app-tab-discussion').click()", sessionId);
    assert.equal(await evaluate("(() => { const start=document.querySelector('#app-start-session'); return !start.hidden && start.getBoundingClientRect().bottom <= innerHeight && document.querySelector('#local-discussion > form').hidden && document.querySelector('#discussion-ai-insights').hidden; })()", sessionId), true,
      "no-topic actions are in the first viewport without empty composer or Create");
    await capture("choose-topic", sessionId);
    await evaluate("window.visualDiscussionState.phase='ready';window.visualDiscussionState.topicId='topic-visual';window.visualDiscussionState.discussion={roots:[{id:'root-1',rootId:null,state:'visible',authorId:'demo-blair',actorType:'human',body:'What would make your neighborhood a better place to spend time?',edited:false,replies:[]}]};window.visualDiscussionState.related={results:[1,2,3,4].map(index=>({title:'Synthetic page '+index,url:'https://example.com/related/'+index,relationship:index===1?'same-topic':'related'}))};window.visualDiscussionPanel.render(window.visualDiscussionState);window.visualShell.render(window.visualDiscussionState)", sessionId);
    await evaluate("document.querySelector('#app-tab-discussion').click();window.visualDiscussionState.discussion={roots:[]};window.visualDiscussionPanel.render(window.visualDiscussionState);scrollTo(0,0)", sessionId);
    await capture("empty-discussion", sessionId);
    await evaluate("window.visualDiscussionState.discussion={roots:[{id:'root-1',rootId:null,state:'visible',authorId:'demo-blair',actorType:'human',body:'Long synthetic comment: '+'neighborhood'.repeat(45),edited:false,replies:[]}]};window.visualDiscussionPanel.render(window.visualDiscussionState);document.querySelector('#selected-topic-title').textContent='A very long synthetic topic about shared public space, neighborhood transport, parks and community gathering places';scrollTo(0,0)", sessionId);
    await capture("long-discussion", sessionId);
    await evaluate("document.querySelector('#selected-topic-title').textContent='A quieter, greener city';document.querySelector('#discussion-ai-insights').click();scrollTo(0,0)", sessionId);
    await assertView("#app-view-insights");
    assert.equal(await evaluate("window.visualCreates", sessionId), 1, "primary Create forwards exactly once");
    assert.equal(await evaluate("document.querySelector('#app-tab-insights').getAttribute('aria-current')", sessionId), "page");
    await capture("insights", sessionId);
    await evaluate("window.visualInsightState.draft='Synthetic private insight draft about shaded gathering places.';window.visualInsightState.ai.status='generated';window.visualInsightState.ai.result={body:window.visualInsightState.draft,model:'synthetic',citations:[]};window.visualInsightPanel.render(window.visualInsightState);document.querySelector('#insight-draft-details').scrollIntoView({block:'start'})", sessionId);
    await capture("private-draft", sessionId);
    await checkReachable("#insight-review", sessionId);
    await checkReachable("#insight-discard", sessionId);
    await evaluate("document.querySelector('#insight-account-details').open=true;document.querySelector('#insight-account-details > summary').focus()", sessionId);
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
    await evaluate("document.querySelector('#app-tab-discussion').click();document.querySelector('#discussion-ai-insights').click()", sessionId);
    assert.equal(await evaluate("window.visualCreates", sessionId), 1, "missing model only opens setup");
    assert.equal(await evaluate("window.visualInsightState.draft === document.querySelector('#insight-body').value", sessionId), true,
      "private draft survives navigation");
    await evaluate("window.visualInsightState.ai.status='usageLimit';window.visualInsightPanel.render(window.visualInsightState);scrollTo(0,0)", sessionId);
    await capture("usage-limit", sessionId);
    await evaluate("document.querySelector('#app-settings-button').click();scrollTo(0,0)", sessionId);
    await assertView("#app-settings-view");
    await capture("settings", sessionId);
    await evaluate("document.querySelector('#ui-mode-developer').click();scrollTo(0,0)", sessionId);
    await capture("developer", sessionId);
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
    document.querySelector('#selected-topic-title').textContent='A very long synthetic topic about shared public space, neighborhood transport, parks and community gathering places that needs several wrapped lines';
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
      ai:{connected:true,planEnabled:true,pending:false,models:[{slug:'synthetic',displayName:'Synthetic model'}],model:'synthetic',articleText:'',article:null,costConsent:false,result:null,status:'generated'}};
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
  await checkReachable("#insight-review", sessionId);
  await checkReachable("#insight-discard", sessionId);
  await evaluate(`(() => {
    document.querySelector('#insight-quick-status').hidden=false;
    document.querySelector('#insight-quick-status').textContent='Synthetic diagnostic status that wraps onto several lines to exercise the full fixed footer height.';
  })()`, sessionId);
  await capture("footer-status", sessionId);
  await checkReachable("#insight-discard", sessionId);
  await evaluate("document.querySelector('#insight-body').scrollIntoView({block:'start'}); document.querySelector('#insight-body').focus();", sessionId);
  await tabTo("#insight-review", sessionId);
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
} finally {
  await browser?.close();
  const target = path.resolve(profileRoot);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.ok(path.basename(target).startsWith("udl-popup-visual-"));
  rmSync(target, { recursive: true, force: true });
}
