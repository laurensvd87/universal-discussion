import { createAccountController } from "../core/account-controller.js";
import { createAccountClient } from "../core/account-client.js";
import { createAccountSheet } from "../chromium/account-sheet.js";

// Deliberately inert manual preview. No fetch, Chrome storage, provider or post.
// The QA harness may replace this transport before loading to exercise the real
// in-process account service through CDP interception, without a server listener.
let account = { id: "fixture-reader", username: null, state: "active", replyEmail: false };
let signedIn = false;
const mock = async (url, options) => {
  const path = new URL(url).pathname, body = JSON.parse(options.body ?? "{}");
  let value;
  let status = 200;
  if (path.endsWith("/email/request")) {
    if (!/^[^@\s]+@[^@\s]+\.test$/u.test(body.email ?? "")) { status=400;value={error:"invalid-request"}; }
    else value = {challengeId:"fixture-challenge",expiresIn:600};
  } else if (path.endsWith("/email/verify") || path.endsWith("/session/renew")) {
    if (path.endsWith("/verify") && body.code !== "123456") { status=400;value={error:"verification-failed"}; }
    else { signedIn=true;value={account,session:{accessToken:"a".repeat(43),refreshToken:"r".repeat(43),accessExpiresAt:Date.now()+900000,refreshExpiresAt:Date.now()+2592000000}}; }
  } else if (!signedIn) { status=401;value={error:"authentication-required"}; }
  else if (path.endsWith("/username")) { account={...account,username:body.username};value=account; }
  else if (path.endsWith("/preferences")) { account={...account,replyEmail:body.enabled};value=account; }
  else if (path.endsWith("/logout")) { signedIn=false;value={loggedOut:true}; }
  else value=account;
  return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
};
let saved = null;
const client=createAccountClient({fetchImpl:window.accountFixtureTransport ?? mock,getPairingToken:()=>"synthetic-account-pairing-capability-only"});
const controller=createAccountController({client,capabilities:{chatGPTIdentity:false,emailCode:true},storage:{load:()=>saved,save:value=>{saved={...value};},clear:()=>{saved=null;}},
  readContext:()=>({topicId:"fixture-topic",sourceId:"fixture-source"}),
  renderer:state=>{
    document.querySelector("#preview-account").textContent=state.account?.username?`@${state.account.username}`:"Sign in";
  },onAuthenticated:()=>{
    document.querySelector("#preview-status").textContent="Signed in. Your draft is ready.";
    controller.cancel();document.querySelector("#preview-draft").focus();
  }});
createAccountSheet({document,mount:document.body,controller});
document.querySelector("#preview-account").addEventListener("click",()=>controller.open());
document.querySelector("#preview-reply").addEventListener("click",()=>{controller.open();});
document.querySelector(".preview-composer").addEventListener("submit",event=>{
  event.preventDefault();
  if(!controller.renderSnapshot().account?.username)controller.open();
  else document.querySelector("#preview-status").textContent="Preview only — no message was posted.";
});
const timer=setInterval(()=>controller.tick(),1000);
window.addEventListener("pagehide",()=>{clearInterval(timer);controller.dispose();},{once:true});
// Structural UI only, never exposes credentials or challenge secrets.
window.accountPreview=Object.freeze({state:()=>controller.renderSnapshot(),open:()=>controller.open(),cancel:()=>controller.cancel()});
