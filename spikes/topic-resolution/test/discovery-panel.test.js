import assert from "node:assert/strict";
import test from "node:test";
import { mountDiscoveryPanel } from "../browser/chromium/discovery-panel.js";

const version = {generation:"fixture",revision:1};
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

function harness() {
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
  const panel = mountDiscoveryPanel(document,root,{client,messages:{relatedSuggestionsHeading:"Explore related pages",
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
  ui.click("discovery-back");assert.equal(preview.hidden,true);assert.equal(ui.calls.length,2);
  assert.equal(ui.byId("discovery-results").children.length,1);assert.equal(ui.byId("discovery-search").focused,true);
  ui.panel.dispose();
});

test("load more appends bounded pages, cursor conflict clears cached text and offers refresh",async () => {
  const ui=harness();ui.start();ui.requests[0].resolve(page("First","cursor-1"));await settle();ui.click("discovery-more");
  assert.equal(ui.calls[1][1].cursor,"cursor-1");ui.requests[1].resolve(page("Second","cursor-2"));await settle();
  assert.equal(ui.byId("discovery-results").children.length,2);ui.click("discovery-more");
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
  assert.equal(ui.byId("discovery-more").hidden,true);ui.panel.dispose();
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
