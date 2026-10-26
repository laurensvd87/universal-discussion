import test from "node:test";
import assert from "node:assert/strict";
import {mountTopicSpacePanel} from "../browser/chromium/topic-space-panel.js";
import {mountDiscoveryPanel,createTopicSpacePreviewOpener} from "../browser/chromium/discovery-panel.js";

const policy=()=>({schema:"topic-space-policy/v1",revision:0,defaultSpecificity:0,topicOverrides:[]});
const page=()=>({schema:"topic-spaces/v1",version:{generation:"generation",revision:2},policy:policy(),state:"ready",total:1,groups:[{
  id:"space-one",policyTopicId:"base-one",parentId:null,title:"<script>Public topic</script>",specificity:0,threadCount:1,humanCount:1,aiCount:0,score:0.9,
  threads:[{rootId:"root-one",topicId:"topic-one",discussionId:"discussion-one",sourceId:"source-one",title:"Public discussion",snippet:"<img src=x>",url:"https://example.org/article",humanCount:1,aiCount:0,updatedAt:null}],
}]});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{resolve,reject,promise};}
function harness({compose=false}={}){
  const created=[],calls=[],opened=[],timers=new Map();let timerId=0;
  const document={createElement(tag){const item={tag,textContent:"",children:[],listeners:new Map(),attributes:{},hidden:false,
    append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];},
    setAttribute(key,value){this.attributes[key]=value;},addEventListener(event,fn){this.listeners.set(event,fn);},removeEventListener(event,fn){if(this.listeners.get(event)===fn)this.listeners.delete(event);},focus(){document.activeElement=this;}};created.push(item);return item;}};
  const root=document.createElement("section"),client={};
  for(const method of ["topicSpaces","topicSpaceOwner","updateTopicSpacePolicy"])client[method]=(...args)=>{const request=deferred();calls.push({method,args,...request});return request.promise;};
  const previewRoot=document.createElement("section"),reads=[];let returnFocus=null;
  const preview=compose?mountDiscoveryPanel(document,previewRoot,{previewOnly:true,client:{discussion(topicId,options){const request=deferred();reads.push({topicId,options,...request});return request.promise;}},onPreviewChange(visible){root.hidden=visible;if(!visible)returnFocus?.focus();}}):null;
  const opener=preview?createTopicSpacePreviewOpener({preview,beforeOpen(){returnFocus=document.activeElement;}}):(...args)=>opened.push(args);
  const panel=mountTopicSpacePanel(document,root,{client,onOpenDiscussion:opener,
    setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId;},clearTimeout(id){timers.delete(id);}});
  const byId=id=>created.findLast(n=>n.id===id),all=n=>[n,...n.children.flatMap(all)];
  return{document,root,previewRoot,preview,reads,created,calls,opened,panel,byId,all,timers,flush(){const pending=[...timers.values()];timers.clear();for(const timer of pending)timer.fn();},click(id){byId(id).focus();byId(id).listeners.get("click")();},
    start(){panel.observe({sourceId:"source-one",actorId:"person-one"});panel.setActive(true);panel.setConnection(true);preview?.setActive(true);preview?.observeConnected(true);},
    async answer(owner=false){calls.find(c=>c.method==="topicSpaceOwner").resolve({policy:policy(),canManage:owner});calls.find(c=>c.method==="topicSpaces").resolve(page());await settle();},
  };
}
test("active connected panel shows safe public previews without personal or unauthorized controls",async()=>{
  const ui=harness();assert.equal(ui.calls.length,0);ui.start();assert.deepEqual(ui.calls[0].args[0],{sourceId:null,query:"",offset:0,limit:20});
  assert.equal(ui.byId("topic-space-heading").textContent,"Search Topics");
  assert.equal(ui.byId("topic-space-search").attributes["aria-label"],"Search Topics");
  assert.equal(ui.all(ui.root).some(n=>n.textContent==="Explore topics"),false);
  await ui.answer();assert.equal(ui.byId("topic-space-owner").hidden,true);
  assert.equal(ui.all(ui.root).some(n=>n.type==="range"),false);
  assert.ok(ui.all(ui.root).some(n=>n.textContent==="<img src=x>"));
  assert.equal(ui.all(ui.root).some(n=>["img","script","textarea"].includes(n.tag)),false);
  const link=ui.all(ui.root).find(n=>n.tag==="a");assert.equal(link.rel,"noopener noreferrer");assert.equal(link.referrerPolicy,"no-referrer");
  ui.click("topic-space-open-root-one");assert.deepEqual(ui.opened[0],["topic-one",page().groups[0].threads[0]]);ui.panel.dispose();
});

test("actual Search Topics and preview composition forwards the exact root and preserves global search and owner drafts on Back",async()=>{
  const ui=harness({compose:true});ui.start();const paged={...page(),total:40};
  ui.calls[0].resolve(paged);ui.calls[1].resolve({policy:policy(),canManage:true});await settle();
  const search=ui.byId("topic-space-search"),slider=ui.byId("topic-space-default");search.value="kapsalon";slider.value="75";
  ui.click("topic-space-next");assert.equal(ui.calls[2].args[0].offset,20);ui.calls[2].resolve(paged);await settle();
  const trigger=ui.byId("topic-space-open-root-one");ui.click(trigger.id);
  assert.equal(ui.root.hidden,true);assert.equal(ui.reads.length,1);assert.equal(ui.reads[0].topicId,"topic-one");
  const roots=Array.from({length:26},(_,i)=>({id:i===25?"root-one":`other-${i}`,rootId:null,replyToId:null,state:"visible",authorId:"demo-alex",actorType:"human",body:i===25?"Fresh authoritative conversation":`Other ${i}`,createdAt:"2026-10-20T12:00:00.000Z",edited:false,replies:[]}));
  ui.reads[0].resolve({version:{generation:"generation",revision:2},topic:{id:"topic-one",title:"Canonical",kind:"general"},discussionId:"discussion-one",roots});await settle();
  const card=ui.all(ui.previewRoot).find(n=>n.attributes["data-post-id"]==="root-one");assert.ok(card);assert.equal(ui.document.activeElement,card);
  assert.ok(ui.all(card).some(n=>n.textContent==="Fresh authoritative conversation"));
  assert.equal(ui.all(ui.previewRoot).some(n=>n.textContent==="<img src=x>"),false);
  assert.equal(ui.all(ui.previewRoot).some(n=>n.tag==="textarea"||n.type==="submit"),false);
  ui.preview.observePage({sourceId:"different-page"});assert.equal(ui.reads[0].options.signal.aborted,false);
  ui.click("discovery-back");assert.equal(ui.root.hidden,false);assert.equal(search.value,"kapsalon");assert.equal(slider.value,"75");
  assert.equal(ui.document.activeElement,trigger);assert.equal(ui.byId("topic-space-open-root-one"),trigger);assert.equal(ui.calls.length,3);
  assert.equal(ui.byId("topic-space-previous").disabled,false);ui.panel.dispose();ui.preview.dispose();
});
test("owner sliders save only deliberately and use stable base topic IDs",async()=>{
  const ui=harness();ui.start();await ui.answer(true);
  assert.equal(ui.all(ui.root).filter(n=>n.textContent==="Broad").length,2);
  assert.equal(ui.all(ui.root).filter(n=>n.textContent==="Specific").length,2);
  const slider=ui.byId("topic-space-override-space-one");assert.equal(slider.step,"25");slider.value="75";
  ui.panel.observe({sourceId:"source-one",actorId:"person-one",version:{revision:99}});
  assert.equal(ui.byId("topic-space-override-space-one"),slider);assert.equal(ui.calls.length,2);
  ui.click("topic-space-save-space-one");const save=ui.calls.find(c=>c.method==="updateTopicSpacePolicy");
  assert.deepEqual(save.args[0],{expectedRevision:0,defaultSpecificity:0,topicOverrides:[{spaceId:"base-one",specificity:75,title:null}]});
  save.resolve({policy:{...policy(),revision:1,topicOverrides:save.args[0].topicOverrides},canManage:true});await settle();
  assert.equal(ui.calls.filter(c=>c.method==="topicSpaces").length,2);ui.panel.dispose();
});
test("a slow public read preserves an already edited owner default slider and its listener",async()=>{
  const ui=harness();ui.start();ui.calls[1].resolve({policy:policy(),canManage:true});await settle();
  const slider=ui.byId("topic-space-default");slider.value="50";
  ui.calls[0].resolve(page());await settle();assert.equal(ui.byId("topic-space-default"),slider);assert.equal(slider.value,"50");
  ui.click("topic-space-save-default");assert.equal(ui.calls.at(-1).args[0].defaultSpecificity,50);ui.panel.dispose();
});
test("owner labels are bounded drafts and share the deliberate per-topic save",async()=>{
  const ui=harness();ui.start();await ui.answer(true);const title=ui.byId("topic-space-title-space-one");
  assert.equal(title.maxLength,200);title.value="  <img src=x> BBQ  ";ui.panel.observe({sourceId:"source-one",actorId:"person-one"});
  assert.equal(ui.byId("topic-space-title-space-one"),title);assert.equal(ui.calls.length,2);
  ui.click("topic-space-save-space-one");assert.equal(ui.calls.at(-1).args[0].topicOverrides[0].title,"<img src=x> BBQ");ui.panel.dispose();
});
test("unsafe owner label drafts fail locally without dispatching or leaking a rejection",async()=>{
  const ui=harness();ui.start();await ui.answer(true);ui.byId("topic-space-title-space-one").value="unsafe\u0000label";
  ui.click("topic-space-save-space-one");await settle();assert.equal(ui.calls.length,2);assert.match(ui.byId("topic-space-status").textContent,/unavailable/);ui.panel.dispose();
});
test("account switch and logout abort and reject late public and owner responses",async()=>{
  const ui=harness();ui.start();const old=ui.calls.slice();ui.panel.observe({sourceId:"source-two",actorId:"person-two"});
  assert.equal(old[0].args[1].signal.aborted,true);assert.equal(old[1].args[0].signal.aborted,true);
  old[0].resolve(page());old[1].resolve({policy:policy(),canManage:true});await settle();
  assert.equal(ui.byId("topic-space-results").children.length,0);assert.equal(ui.byId("topic-space-owner").hidden,true);
  const recent=ui.calls.slice(2);ui.panel.setConnection(false);for(const c of recent)c.resolve(c.method==="topicSpaces"?page():{policy:policy(),canManage:true});await settle();
  assert.equal(ui.byId("topic-space-results").children.length,0);assert.equal(ui.byId("topic-space-owner").hidden,true);
  ui.panel.dispose();ui.panel.dispose();assert.equal(ui.root.children.length,0);assert.equal(ui.byId("topic-space-search").listeners.size,0);
});

test("page changes do not abort global search, reset pagination, or discard search/owner drafts",async()=>{
  const ui=harness();ui.start();const initial=ui.calls.slice();
  ui.panel.observe({sourceId:"source-two",topicId:"topic-two",currentUrl:"https://example.org/other",actorId:"person-one",catalog:{version:{generation:"other-page"}}});
  assert.equal(ui.calls.length,2);assert.equal(initial[0].args[1].signal.aborted,false);assert.equal(initial[1].args[0].signal.aborted,false);
  const response=page();response.total=40;initial[0].resolve(response);initial[1].resolve({policy:policy(),canManage:true});await settle();
  const search=ui.byId("topic-space-search"),slider=ui.byId("topic-space-default");search.value="kapsalon";slider.value="75";
  ui.click("topic-space-next");const next=ui.calls.at(-1);assert.deepEqual(next.args[0],{sourceId:null,query:"kapsalon",offset:20,limit:20});
  ui.panel.observe({phase:"loading",sourceId:null,actorId:"person-one"});
  assert.equal(ui.calls.at(-1),next);assert.equal(next.args[1].signal.aborted,false);assert.equal(search.value,"kapsalon");assert.equal(slider.value,"75");
  next.resolve(response);await settle();assert.equal(ui.byId("topic-space-previous").disabled,false);
  ui.panel.dispose();
});
test("late policy save cannot recreate controls or groups in a new account context",async()=>{
  const ui=harness();ui.start();await ui.answer(true);ui.click("topic-space-save-default");const saved=ui.calls.at(-1);
  ui.panel.observe({sourceId:"source-one",actorId:"person-two"});assert.equal(saved.args[1].signal.aborted,true);
  saved.resolve({policy:{...policy(),revision:1},canManage:true});await settle();
  assert.equal(ui.byId("topic-space-owner").hidden,true);assert.equal(ui.byId("topic-space-results").children.length,0);ui.panel.dispose();
});
test("malformed backend previews fail closed and disposal removes every handler",async()=>{
  const ui=harness();ui.start();const response=page();response.groups[0].threads[0].url="javascript:alert(1)";
  ui.calls[0].resolve(response);ui.calls[1].resolve({policy:policy(),canManage:false});await settle();
  assert.equal(ui.byId("topic-space-results").children.length,0);assert.match(ui.byId("topic-space-status").textContent,/unavailable/);
  ui.panel.dispose();assert.equal(ui.created.some(n=>n.listeners.size),false);
});
test("building retries are read-only, capped at five attempts and preserve a live owner slider",async()=>{
  const ui=harness();ui.start();ui.calls[1].resolve({policy:policy(),canManage:true});await settle();
  const building=()=>({...page(),state:"building"});ui.calls[0].resolve(building());await settle();
  const slider=ui.byId("topic-space-override-space-one");slider.value="75";
  const waits=[];
  for(let i=0;i<4;i++){waits.push([...ui.timers.values()][0].ms);ui.flush();ui.calls.at(-1).resolve(building());await settle();assert.equal(ui.byId("topic-space-override-space-one"),slider);}
  assert.deepEqual(waits,[250,500,1000,2000]);assert.equal(ui.timers.size,0);assert.equal(ui.calls.filter(c=>c.method==="topicSpaces").length,5);
  assert.equal(ui.calls.some(c=>c.method==="updateTopicSpacePolicy"),false);ui.panel.dispose();
});
test("session renewal cancels scheduled building recovery and old owner replies",async()=>{
  const ui=harness();ui.start();ui.calls[0].resolve({...page(),state:"building"});await settle();assert.equal(ui.timers.size,1);
  ui.panel.observe({sourceId:"source-one",actorId:"person-one",sessionRevision:1});assert.equal(ui.timers.size,0);
  ui.calls[1].resolve({policy:policy(),canManage:true});await settle();assert.equal(ui.byId("topic-space-owner").hidden,true);
  ui.panel.dispose();assert.equal(ui.timers.size,0);
});
