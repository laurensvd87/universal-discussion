import assert from "node:assert/strict";
import test from "node:test";
import { mountDiscoveryPanel } from "../browser/chromium/discovery-panel.js";

test("semantic group destinations open the existing public preview without selecting a write destination",async()=>{
  const ui=harness();ui.start("");
  const opened=ui.panel.openDiscussion("topic-from-group");
  assert.equal(ui.calls[0][0],"discussion");assert.equal(ui.calls[0][1],"topic-from-group");
  ui.requests[0].resolve({version,topic:{title:"Public canonical discussion"},roots:[]});await opened;
  assert.equal(ui.byId("discovery-preview").hidden,false);
  assert.ok(ui.all(ui.byId("discovery-preview")).some(node=>node.textContent==="Read-only conversation"));
  ui.panel.observeConnected(false);assert.equal(ui.panel.openDiscussion("topic-from-group"),undefined);
  assert.equal(ui.calls.length,1);ui.panel.dispose();
});

const version = {generation:"fixture",revision:1};
const target = () => ({topicId:"topic-one",discussionId:"discussion-one",rootId:"root-25"});
const contribution = (id,rootId=null) => ({id,rootId,replyToId:null,state:"visible",authorId:"demo-alex",actorType:"human",body:`Fresh ${id}`,createdAt:"2026-10-20T12:00:00.000Z",edited:false,...(rootId===null?{replies:[]}: {})});
const canonicalDiscussion = () => ({version,topic:{id:"topic-one",title:"Canonical topic",kind:"general"},discussionId:"discussion-one",roots:Array.from({length:41},(_,i)=>contribution(`root-${i}`))});
const page = (title="Orchid discussion",cursor=null) => ({version,results:[{topicId:title,discussionId:"discussion",title,
  snippet:"<img src=x> public snippet",visibleCount:2,sources:[{title:"Public page",url:"https://example.org/article"},
    {title:"Unsafe",url:"https://example.org/account/profile"},{title:"Script",url:"javascript:alert(1)"}]}],nextCursor:cursor});
const deferred = () => { let resolve,reject; const promise = new Promise((yes,no) => {resolve=yes;reject=no;}); return {promise,resolve,reject}; };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const currentPage = (id="source-current",title="<img src=x> Next public page") => ({phase:"ready",error:null,
  sourceId:id,topicId:"topic-current",catalog:{sources:[
    {id,url:`https://news.public.org/${id}`,title:"Current",topicId:"topic-current"},
    {id:"source-next",url:"https://news.public.org/next",title,topicId:"topic-current"},
  ]},related:null});

test("preview-only composition has no second search or related pages and survives website navigation",async()=>{
  const transitions=[],ui=harness({previewOnly:true,onPreviewChange:value=>transitions.push(value)});ui.start("");
  assert.equal(ui.root.hidden,true);assert.equal(ui.calls.length,0);
  assert.equal(ui.all(ui.root).some(n=>n.tag==="input" || n.tag==="h2"),false);
  ui.panel.observePage(currentPage());assert.equal(ui.calls.length,0);
  const opening=ui.panel.openDiscussion("global-topic");assert.equal(ui.root.hidden,false);
  ui.panel.observePage(currentPage("new-page"));assert.equal(ui.calls[0][2].signal.aborted,false);
  ui.requests[0].resolve({version,topic:{title:"Global topic preview"},roots:[]});await opening;
  assert.equal(ui.byId("discovery-preview").hidden,false);assert.deepEqual(transitions,[true]);
  ui.click("discovery-back");assert.equal(ui.root.hidden,true);assert.equal(ui.calls.length,1);assert.deepEqual(transitions,[true,false]);
  ui.panel.dispose();
});

function harness(options={}) {
  const created = [], calls = [], requests = [], timers = new Map();
  let timerId = 0;
  const document = { createElement(tag) {
    const item = {tag,textContent:"",children:[],listeners:new Map(),attributes:{},hidden:false,value:"",
      append(...children) {this.children.push(...children);}, replaceChildren(...children) {this.children=[...children];},
      setAttribute(key,value) {this.attributes[key]=value;},addEventListener(type,handler) {this.listeners.set(type,handler);},
      removeEventListener(type,handler) {if(this.listeners.get(type)===handler)this.listeners.delete(type);},focus() {this.focused=true;}};
    created.push(item); return item;
  }};
  const root = document.createElement("section");
  const client = {
    discover(input,options) {const request=deferred();calls.push(["discover",input,options]);requests.push(request);return request.promise;},
    discussion(topicId,options) {const request=deferred();calls.push(["discussion",topicId,options]);requests.push(request);return request.promise;},
  };
  const panel = mountDiscoveryPanel(document,root,{client,...options,messages:{relatedSuggestionsHeading:"Explore related pages",
    relatedSuggestionsEmpty:"No related pages in the library yet.",relatedSuggestionsContext:"Open a page to explore related pages."},
    setTimeout(fn,ms) {assert.equal(ms,250);timers.set(++timerId,fn);return timerId;},
    clearTimeout(id) {timers.delete(id);}});
  const byId = id => created.findLast(item => item.id===id);
  const all = parent => [parent,...parent.children.flatMap(child => all(child))];
  const click = id => byId(id).listeners.get("click")();
  return {root,panel,created,calls,requests,timers,byId,click,all,
    start(query="orchid") {byId("discovery-search").value=query;panel.setActive(true);panel.observeConnected(true);},
    input(value) {const input=byId("discovery-search");input.value=value;input.listeners.get("input")();},
    flush() {const callbacks=[...timers.values()];timers.clear();for(const fn of callbacks)fn();}};
}

test("exact target opens its later root page, focuses the canonical card, and does not force manual paging",async()=>{
  const ui=harness({previewOnly:true});ui.start("");const tuple=target();
  const opening=ui.panel.openDiscussion("topic-one",tuple);tuple.rootId="root-0";
  ui.requests[0].resolve(canonicalDiscussion());await opening;
  const cards=()=>ui.all(ui.byId("discovery-preview")).filter(n=>n.attributes["data-post-id"]);
  assert.deepEqual(cards().map(n=>n.attributes["data-post-id"]),Array.from({length:20},(_,i)=>`root-${20+i}`));
  assert.equal(cards().find(n=>n.attributes["data-post-id"]==="root-25").focused,true);
  ui.click("discovery-preview-previous");ui.requests[1].resolve(canonicalDiscussion());await settle();
  assert.equal(cards()[0].attributes["data-post-id"],"root-0");
  ui.click("discovery-preview-next");const missing=canonicalDiscussion();missing.roots=missing.roots.filter(r=>r.id!=="root-25");
  ui.requests[2].resolve(missing);await settle();assert.match(ui.byId("discovery-status").textContent,/changed/i);ui.panel.dispose();
});

test("targeted previews reject wrong topic, discussion, absent or invisible root and malformed fresh contracts",async()=>{
  for(const change of [d=>{d.topic.id="other";},d=>{d.discussionId="other";},d=>{d.roots=[];},d=>{d.roots[25]={id:"root-25",rootId:null,replyToId:null,state:"deleted",label:"Deleted by user",replies:[]};},d=>{d.roots[25].body=42;}]){
    const ui=harness({previewOnly:true});ui.start("");const opening=ui.panel.openDiscussion("topic-one",target());
    const fresh=canonicalDiscussion();change(fresh);ui.requests[0].resolve(fresh);await opening;
    assert.match(ui.byId("discovery-status").textContent,/changed/i);
    assert.equal(ui.all(ui.root).some(n=>n.textContent==="Fresh root-0"),false);ui.panel.dispose();
  }
});

test("deleted targeted roots with visible replies show only the tombstone and surviving replies",async()=>{
  const ui=harness({previewOnly:true});ui.start("");const opening=ui.panel.openDiscussion("topic-one",target());
  const fresh=canonicalDiscussion();fresh.roots[25]={id:"root-25",rootId:null,replyToId:null,state:"deleted",label:"Deleted by user",replies:[contribution("reply-one","root-25")]};
  ui.requests[0].resolve(fresh);await opening;const nodes=ui.all(ui.root);
  assert.ok(nodes.some(n=>n.textContent==="Fresh reply-one"));assert.ok(nodes.some(n=>n.className==="field-note"&&/deleted/i.test(n.textContent)));
  assert.equal(nodes.some(n=>n.textContent==="Fresh root-25"),false);ui.panel.dispose();
});

test("invalid target tuples fail before querying and do not execute getters",async()=>{
  let reads=0;const accessor={...target()};Object.defineProperty(accessor,"rootId",{enumerable:true,get(){reads++;return "root-25";}});
  for(const tuple of [null,{}, {...target(),topicId:"other"},{...target(),rootId:"bad id"},{...target(),extra:true},accessor]){
    const ui=harness({previewOnly:true});ui.start("");await ui.panel.openDiscussion("topic-one",tuple);
    assert.equal(ui.calls.length,0);assert.match(ui.byId("discovery-status").textContent,/changed/i);ui.panel.dispose();
  }assert.equal(reads,0);
});

test("target requests obey rapid-click, Back, disconnect and disposal fences",async()=>{
  for(const cancel of [ui=>ui.click("discovery-back"),ui=>ui.panel.observeConnected(false),ui=>ui.panel.dispose()]){
    const ui=harness({previewOnly:true});ui.start("");const opening=ui.panel.openDiscussion("topic-one",target());cancel(ui);
    assert.equal(ui.calls[0][2].signal.aborted,true);ui.requests[0].resolve(canonicalDiscussion());await opening;
    assert.equal(ui.all(ui.root).some(n=>n.textContent==="Fresh root-25"),false);ui.panel.dispose();
  }
  const ui=harness({previewOnly:true});ui.start("");const first=ui.panel.openDiscussion("topic-one",target());
  const second=ui.panel.openDiscussion("topic-one",{...target(),rootId:"root-40"});assert.equal(ui.calls[0][2].signal.aborted,true);
  ui.requests[1].resolve(canonicalDiscussion());await second;ui.requests[0].resolve(canonicalDiscussion());await first;
  assert.ok(ui.all(ui.root).find(n=>n.attributes["data-post-id"]==="root-40").focused);ui.panel.dispose();
});

test("target pagination back to page zero still rejects a changed canonical version",async()=>{
  const ui=harness({previewOnly:true});ui.start("");const opening=ui.panel.openDiscussion("topic-one",target());ui.requests[0].resolve(canonicalDiscussion());await opening;
  ui.click("discovery-preview-previous");ui.requests[1].resolve({...canonicalDiscussion(),version:{...version,revision:2}});await settle();
  assert.match(ui.byId("discovery-status").textContent,/changed/i);ui.panel.dispose();
});

test("explicit preview survives same-page optional projection updates and Back aborts slow reads",async()=>{
  const transitions=[],ui=harness({onPreviewChange:value=>transitions.push(value)});ui.panel.observePage(currentPage());ui.start("");
  const opening=ui.panel.openDiscussion("topic-group");assert.equal(ui.byId("discovery-preview").hidden,false);
  assert.ok(ui.byId("discovery-back").focused);const pending={...currentPage(),enrichmentPending:true};ui.panel.observePage(pending);
  assert.equal(ui.calls[0][2].signal.aborted,false);assert.deepEqual(transitions,[true]);
  ui.click("discovery-back");assert.equal(ui.calls[0][2].signal.aborted,true);assert.deepEqual(transitions,[true,false]);
  ui.requests[0].resolve({version,topic:{title:"Late preview"},roots:[]});await opening;
  assert.equal(ui.byId("discovery-preview").hidden,true);ui.panel.dispose();
});

test("same-page related hydration cannot erase loaded preview but real page changes close it",async()=>{
  const ui=harness();ui.panel.observePage(currentPage());ui.start("");const opening=ui.panel.openDiscussion("topic-group");
  ui.requests[0].resolve({version,topic:{title:"Read-only group preview"},roots:[]});await opening;
  ui.panel.observePage(currentPage("source-current","New optional page title"));assert.equal(ui.byId("discovery-preview").hidden,false);
  ui.panel.observePage(currentPage("source-different"));assert.equal(ui.byId("discovery-preview").hidden,true);ui.panel.dispose();
});
test("page changes invalidate a pending preview even when neither page projects suggestions",async()=>{
  const ui=harness();ui.panel.observePage({phase:"loading",sourceId:"source-before",topicId:null});ui.start("");
  const opening=ui.panel.openDiscussion("topic-before");ui.panel.observePage({phase:"loading",sourceId:"source-after",topicId:null});
  assert.equal(ui.calls[0][2].signal.aborted,true);ui.requests[0].resolve({version,topic:{title:"Old page preview"},roots:[]});await opening;
  assert.equal(ui.byId("discovery-preview").hidden,true);ui.panel.dispose();
});

test("Discover starts only while active/paired; debounces locally and fences late reads",async () => {
  const ui=harness();assert.equal(ui.calls.length,0);ui.start();
  assert.deepEqual(ui.calls[0][1],{query:"orchid",limit:20,cursor:null});
  assert.equal(ui.root.attributes["aria-busy"],"true");
  ui.input("or");ui.input("orchid");assert.equal(ui.calls.length,1);assert.equal(ui.timers.size,1);
  assert.equal(ui.root.attributes["aria-busy"],"false");assert.equal(ui.calls[0][2].signal.aborted,true);
  ui.requests[0].resolve(page("Old result"));await settle();assert.equal(ui.byId("discovery-results").children.length,0);
  ui.flush();assert.equal(ui.calls.length,2);assert.equal(ui.calls[1][1].query,"orchid");
  ui.requests[1].resolve(page());await settle();assert.equal(ui.byId("discovery-results").children.length,1);
  assert.equal(ui.root.attributes["aria-busy"],"false");ui.panel.dispose();
});

test("Enter immediately searches once and IME Enter keeps the pending debounce",async () => {
  const ui=harness();ui.start();ui.requests[0].resolve(page());await settle();ui.input("orchid");
  const input=ui.byId("discovery-search");let prevented=0;
  input.listeners.get("keydown")({key:"Enter",isComposing:true,preventDefault() {prevented++;}});
  assert.equal(ui.calls.length,1);assert.equal(ui.timers.size,1);
  input.listeners.get("keydown")({key:"Enter",preventDefault() {prevented++;}});
  assert.equal(ui.calls.length,2);assert.equal(ui.timers.size,0);assert.equal(prevented,1);ui.panel.dispose();
});

test("safe text/cards and source links open read-only preview with existing citation renderer",async () => {
  const ui=harness();ui.start();ui.requests[0].resolve(page());await settle();
  const links=ui.all(ui.root).filter(item=>item.tag==="a");assert.equal(links.length,1);
  assert.equal(links[0].rel,"noopener noreferrer");assert.equal(links[0].referrerPolicy,"no-referrer");
  assert.equal(ui.all(ui.root).some(item=>["img","script","iframe","textarea"].includes(item.tag)),false);
  ui.click("discovery-open-Orchid discussion");assert.equal(ui.calls[1][0],"discussion");
  ui.requests[1].resolve({version,topic:{title:"<script>title</script>"},roots:[{
    id:"human",state:"visible",actorType:"human",body:"<img src=x>",replies:[{id:"ai",state:"visible",actorType:"agent",body:"Sources [↗](https://example.org/article)"}]},
    {id:"dead",state:"deleted",replies:[]}]});await settle();
  const preview=ui.byId("discovery-preview");assert.equal(preview.hidden,false);
  assert.ok(ui.all(preview).some(item=>item.textContent==="Read-only conversation"));
  assert.equal(ui.all(preview).filter(item=>item.attributes["data-post-id"]).length,2);
  assert.equal(ui.all(preview).filter(item=>item.tag==="a").length,1);
  assert.equal(ui.all(preview).some(item=>["textarea","form","input"].includes(item.tag)),false);
  ui.click("discovery-back");assert.equal(preview.hidden,true);assert.equal(ui.calls.length,3);
  assert.equal(ui.byId("discovery-results").children.length,0);
  ui.requests[2].resolve(page());await settle();
  assert.equal(ui.byId("discovery-results").children.length,1);assert.equal(ui.byId("discovery-search").focused,true);
  ui.panel.dispose();
});

test("Next replaces bounded pages, cursor conflict clears cached text and offers refresh",async () => {
  const ui=harness();ui.start();ui.requests[0].resolve(page("First","cursor-1"));await settle();ui.click("discovery-more");
  assert.equal(ui.calls[1][1].cursor,"cursor-1");ui.requests[1].resolve(page("Second","cursor-2"));await settle();
  assert.equal(ui.byId("discovery-results").children.length,1);ui.click("discovery-more");
  ui.requests[2].reject({code:"conflict"});await settle();assert.equal(ui.byId("discovery-results").children.length,0);
  assert.equal(ui.byId("discovery-refresh").hidden,false);assert.match(ui.byId("discovery-status").textContent,/changed/);
  ui.click("discovery-refresh");assert.equal(ui.calls[3][1].cursor,null);ui.panel.dispose();
});

test("disconnection clears results/preview, aborts requests and refuses late content",async () => {
  const ui=harness();ui.start();ui.requests[0].resolve(page());await settle();ui.click("discovery-open-Orchid discussion");
  ui.panel.observeConnected(false);assert.equal(ui.calls[1][2].signal.aborted,true);
  ui.requests[1].resolve({version,topic:{title:"Late"},roots:[]});await settle();
  assert.equal(ui.byId("discovery-results").children.length,0);assert.equal(ui.byId("discovery-preview").hidden,true);
  assert.match(ui.byId("discovery-status").textContent,/Connect/);
  ui.panel.observeConnected(true);assert.equal(ui.calls.length,3);ui.panel.setActive(false);
  assert.equal(ui.calls[2][2].signal.aborted,true);ui.panel.dispose();ui.panel.dispose();assert.equal(ui.root.children.length,0);
  assert.equal(ui.byId("discovery-search").listeners.size,0);
});

test("returning from a newer conversation refreshes rather than restoring stale search text",async () => {
  const ui=harness();ui.start();ui.requests[0].resolve(page());await settle();ui.input("orchid");ui.flush();
  ui.requests[1].resolve(page());await settle();ui.click("discovery-open-Orchid discussion");
  ui.requests[2].resolve({version:{...version,revision:2},topic:{title:"Updated"},roots:[]});await settle();
  ui.click("discovery-back");assert.equal(ui.calls.length,4);assert.equal(ui.calls[3][1].query,"orchid");
  assert.equal(ui.byId("discovery-results").children.length,0);ui.panel.dispose();
  ui.requests[3].resolve(page("Disposed result"));await settle();assert.equal(ui.root.children.length,0);
});

test("blank and whitespace input never dispatch library reads, including submit and refresh",() => {
  const ui=harness();ui.start("");
  assert.equal(ui.calls.length,0);
  assert.equal(ui.byId("discovery-heading").textContent,"Explore related pages");
  assert.equal(ui.byId("discovery-status").textContent,"Open a page to explore related pages.");
  ui.input(" \t ");ui.flush();
  ui.byId("discovery-search").listeners.get("keydown")({key:"Enter",preventDefault() {}});
  ui.click("discovery-refresh");
  assert.equal(ui.calls.length,0);assert.equal(ui.timers.size,0);
  assert.equal(ui.byId("discovery-more").disabled,true);ui.panel.dispose();
});

test("clearing a query aborts global search and rejects its late result",async () => {
  const ui=harness();ui.start();ui.input("  ");
  assert.equal(ui.calls[0][2].signal.aborted,true);
  ui.requests[0].resolve(page("Late library result"));await settle();
  assert.equal(ui.byId("discovery-results").children.length,0);
  assert.equal(ui.byId("discovery-heading").textContent,"Explore related pages");
  assert.equal(ui.byId("discovery-refresh").hidden,true);assert.equal(ui.timers.size,0);ui.panel.dispose();
});

test("clearing query/context rejects late preview and preserves blank mode on reconnect",async () => {
  const ui=harness();ui.start();ui.requests[0].resolve(page());await settle();
  ui.click("discovery-open-Orchid discussion");ui.input("");ui.panel.observePage(null);
  assert.equal(ui.calls[1][2].signal.aborted,true);
  ui.requests[1].resolve({version,topic:{title:"Late preview"},roots:[]});await settle();
  assert.equal(ui.byId("discovery-preview").hidden,true);
  assert.equal(ui.byId("discovery-results").children.length,0);
  ui.panel.observeConnected(false);ui.panel.observeConnected(true);
  assert.equal(ui.calls.length,2);assert.equal(ui.byId("discovery-heading").textContent,"Explore related pages");
  ui.panel.dispose();
});

test("default cards show public page links without counts or discussion actions and update with page context",() => {
  const ui=harness();ui.panel.observePage(currentPage());ui.start("");
  assert.equal(ui.calls.length,0);
  const list=ui.byId("discovery-results");assert.equal(list.children.length,1);
  const links=ui.all(list).filter(item=>item.tag==="a");assert.equal(links.length,1);
  assert.equal(links[0].href,"https://news.public.org/next");assert.equal(links[0].target,"_blank");
  assert.equal(links[0].rel,"noopener noreferrer");assert.equal(links[0].referrerPolicy,"no-referrer");
  assert.ok(ui.all(links[0]).some(item=>item.textContent==="<img src=x> Next public page"));
  assert.ok(ui.all(links[0]).some(item=>item.textContent==="news.public.org"));
  assert.equal(ui.all(list).some(item=>["button","img","script"].includes(item.tag)),false);
  ui.panel.observePage(currentPage("source-new","Updated suggestion"));
  assert.ok(ui.all(list).some(item=>item.textContent==="Updated suggestion"));
  ui.panel.observePage({phase:"reading",sourceId:null,topicId:null});
  assert.equal(list.children.length,0);assert.equal(ui.byId("discovery-status").textContent,"Open a page to explore related pages.");
  ui.panel.observePage(currentPage());ui.panel.observeConnected(false);
  assert.equal(list.children.length,0);assert.equal(ui.root.attributes["aria-busy"],"false");
  ui.panel.observeConnected(true);assert.equal(list.children.length,1);assert.equal(ui.calls.length,0);ui.panel.dispose();
});

test("empty related pages and loading use compact status/spinner, with no library read",() => {
  const ui=harness();const state=currentPage();state.catalog.sources.pop();
  ui.panel.observePage(state);ui.start("");
  assert.equal(ui.byId("discovery-status").textContent,"No related pages in the library yet.");
  ui.panel.observePage({...state,phase:"loading"});
  assert.equal(ui.root.attributes["aria-busy"],"true");assert.equal(ui.byId("discovery-status").textContent,"");
  assert.equal(ui.calls.length,0);
  ui.panel.observePage(null);assert.equal(ui.root.attributes["aria-busy"],"false");ui.panel.dispose();
});

test("page polling and navigation preserve typed global results, query, focus and in-flight searches",async () => {
  const ui=harness();ui.panel.observePage(currentPage());ui.start();
  const input=ui.byId("discovery-search");input.focus();
  for(let i=0;i<3;i++)ui.panel.observePage(currentPage());
  ui.panel.observePage(null);ui.panel.observePage(currentPage("source-new"));
  assert.equal(ui.calls.length,1);assert.equal(ui.calls[0][2].signal.aborted,false);
  assert.equal(input.value,"orchid");assert.equal(input.focused,true);
  ui.requests[0].resolve(page());await settle();
  const result=ui.byId("discovery-results").children[0];
  ui.panel.observePage(currentPage("source-third"));
  assert.equal(ui.byId("discovery-results").children[0],result);assert.equal(ui.calls.length,1);
  ui.input("");assert.equal(ui.calls.length,1);assert.equal(ui.byId("discovery-results").children.length,1);
  assert.equal(ui.all(ui.byId("discovery-results")).some(item=>item.tag==="button"),false);ui.panel.dispose();
});
