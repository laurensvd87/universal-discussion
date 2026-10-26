// Isolated packaged Chromium companion, never a user profile/provider session.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromiumPipe } from "./chromium-pipe.js";
import { checkCommunityVisual } from "./check-community-visual.js";
import { checkTopicSpaceVisual } from "./check-topic-space-visual.js";

const profileRoot=mkdtempSync(path.join(os.tmpdir(),"murmingle-community-visual-"));
const outputRoot=path.join(os.tmpdir(),"murmingle-popup-design-review");
mkdirSync(outputRoot,{recursive:true});
let browser,sessionId;
const exceptions=[];
async function evaluate(expression,session=sessionId){
  const result=await browser.send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true},session);
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??"Community evaluation failed");
  return result.result.value;
}
async function capture(name,session){
  await evaluate("new Promise(resolve=>setTimeout(resolve,100))",session);
  const metrics=await evaluate(`(() => {
    const root=document.documentElement;
    const escaped=[...document.querySelectorAll('body *')].filter(element=>{
      if(!element.getClientRects().length)return false;
      if(element.closest('#discussion-reply-context'))return false;
      const r=element.getBoundingClientRect();return r.left < -1||r.right>root.clientWidth+1;
    }).map(element=>element.id||element.tagName).slice(0,5);
    return {width:innerWidth,clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,escaped};
  })()`,session);
  assert.ok(metrics.scrollWidth<=metrics.clientWidth,`${name}: no horizontal overflow`);
  assert.deepEqual(metrics.escaped,[],`${name}: visible controls fit the panel`);
  const result=await browser.send("Page.captureScreenshot",{format:"png"},session,20000);
  const target=path.join(outputRoot,`after-${name}.png`);
  writeFileSync(target,Buffer.from(result.data,"base64"));
  process.stdout.write(JSON.stringify({name,target,metrics})+"\n");
}
try{
  browser=launchChromiumPipe({executable:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",profileDirectory:path.join(profileRoot,"profile")});
  await browser.send("Browser.getVersion");
  const loaded=await browser.send("Extensions.loadUnpacked",{path:fileURLToPath(new URL("../browser/",import.meta.url))});
  const target=await browser.send("Target.createTarget",{url:`chrome-extension://${loaded.id}/chromium/popup.html`});
  ({sessionId}=await browser.send("Target.attachToTarget",{targetId:target.targetId,flatten:true}));
  browser.on("Runtime.exceptionThrown",({exceptionDetails},session)=>{if(session===sessionId)exceptions.push(exceptionDetails.text)});
  await browser.send("Runtime.enable",{},sessionId);await browser.send("Page.enable",{},sessionId);
  await browser.send("Page.reload",{ignoreCache:true},sessionId);
  for(let attempt=0;attempt<100;attempt++){
    if(await evaluate("document.readyState==='complete'&&!!document.querySelector('#insight-model')").catch(()=>false))break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal(await evaluate("!!document.querySelector('#insight-model')"),true);
  await evaluate("window.dispatchEvent(new Event('pagehide'))");
  await checkCommunityVisual({browser,sessionId,evaluate,capture});
  await checkTopicSpaceVisual({browser,sessionId,evaluate,capture});
  assert.deepEqual(exceptions,[],"packaged community UI has no uncaught errors");
}finally{
  await browser?.close();
  assert.equal(path.dirname(path.resolve(profileRoot)),path.resolve(os.tmpdir()));
  assert.ok(path.basename(profileRoot).startsWith("murmingle-community-visual-"));
  rmSync(profileRoot,{recursive:true,force:true});
}
