import assert from "node:assert/strict";
import test from "node:test";
import { mountPrivateConversationPanel } from "../browser/chromium/private-conversation-panel.js";
import { mountDiscoveryPanel } from "../browser/chromium/discovery-panel.js";

const settle = () => new Promise(resolve => setImmediate(resolve));
function dom() {
  const nodes = [];
  const document = {createElement(tag) {
    const element = {tag,children:[],listeners:new Map(),attributes:{},dataset:{},value:"",textContent:"",scrollTop:0,
      append(...items) {this.children.push(...items);},replaceChildren(...items) {this.children=items;},
      setAttribute(key,value) {this.attributes[key]=value;},addEventListener(key,handler) {this.listeners.set(key,handler);},
      removeEventListener(key) {this.listeners.delete(key);},focus() {},scrollIntoView() {}};
    nodes.push(element); return element;
  }};
  return {document,root:document.createElement("section"),byId:id=>nodes.findLast(element=>element.id===id)};
}
function inbox({streamRecords} = {}) {
  const ui=dom(),calls=[]; let ownerVersion=1,revision=1;
  const records = kind => Array.from({length:61},(_,i)=>({id:`${kind}-${i}`,title:`${kind} ${i}`,
    sourceUrl:"https://example.org/article",createdAt:new Date(2_000_000-(i*2+(kind==="public"?1:0))*1000).toISOString()}));
  const pools=streamRecords ?? {private:records("private"),public:records("public")};
  const list=(kind,payload)=>{
    calls.push({kind,payload});const start=Number(payload.after??0),rows=pools[kind].slice(start,start+payload.limit);
    return {[kind==="private"?"conversations":"chats"]:rows,next:start+payload.limit<pools[kind].length?String(start+payload.limit):null,
      ...(kind==="private"?{ownerVersion}:{version:{generation:"fixture",revision}})};
  };
  const panel=mountPrivateConversationPanel(ui.document,ui.root,{readActor:()=>"owner",readPublicState:()=>({}),showView() {},randomId:()=>"op",
    client:{privateConversation:async(action,payload)=>list("private",payload),accountPublicChats:async(action,payload)=>list("public",payload),
      version:async()=>({version:{generation:"fixture",revision}})}});
  const cards=()=>ui.byId("private-chat-feed").children.filter(element=>element.className==="private-chat-card");
  const ids=()=>cards().map(element=>element.attributes["data-chat-id"]);
  const namespacedIds=()=>cards().map(element=>`${element.attributes["data-chat-kind"]}:${element.attributes["data-chat-id"]}`);
  return {...ui,panel,calls,ids,namespacedIds,changedPrivate(){ownerVersion++;},changedPublic(){revision++;},
    async click(id){ui.byId(id).listeners.get("click")();await settle();}};
}

test("combined inbox uses exactly twenty total cards and replays Previous with fresh versions and bounded reads",async()=>{
  const ui=inbox();ui.panel.setActive(true);await settle();const first=ui.ids();
  assert.equal(first.length,20);assert.deepEqual(first.slice(0,4),["private-0","public-0","private-1","public-1"]);
  ui.byId("private-chat-feed").scrollTop=123;
  await ui.click("my-chats-next");const second=ui.ids();assert.equal(second.length,20);assert.ok(second.every(id=>!first.includes(id)));
  await ui.click("my-chats-next");assert.equal(ui.ids().length,20);
  await ui.click("my-chats-previous");assert.deepEqual(ui.ids(),second);
  await ui.click("my-chats-previous");assert.deepEqual(ui.ids(),first);assert.equal(ui.byId("private-chat-feed").scrollTop,123);
  assert.ok(ui.calls.every(call=>[1,20].includes(call.payload.limit)));
  assert.ok(ui.calls.every(call=>Object.hasOwn(call.payload,"after")));
  assert.ok(ui.calls.filter(call=>call.kind==="private").every(call=>call.payload.order==="recent"));ui.panel.dispose();
});
for(const legacy of [false,true]) test(`twenty-card merge preserves SQL descending IDs and ${legacy ? "legacy timestamp text" : "equal timestamp ties"} across pools/pages`,async()=>{
  const pools={};
  for(const kind of ["private","public"]) pools[kind]=Array.from({length:40},(_,index)=>({id:`shared-${String(index).padStart(3,"0")}`,
    title:`${kind} ${index}`,sourceUrl:"https://example.org/article",
    createdAt:legacy && index < 20 ? "2026-10-12T11:00:00Z" : "2026-10-12T12:00:00+02:00"}));
  const sqlCompare=(a,b)=>a.createdAt===b.createdAt ? a.id===b.id ? 0 : a.id>b.id?-1:1 : a.createdAt>b.createdAt?-1:1;
  for(const rows of Object.values(pools)) rows.sort(sqlCompare);
  const expected=[...pools.private.map(row=>({...row,kind:"private"})),...pools.public.map(row=>({...row,kind:"public"}))]
    .sort((a,b)=>sqlCompare(a,b)||(a.kind===b.kind?0:a.kind==="private"?-1:1)).map(row=>`${row.kind}:${row.id}`);
  const ui=inbox({streamRecords:pools});ui.panel.setActive(true);await settle();
  for(let page=0;page<4;page++) {
    assert.deepEqual(ui.namespacedIds(),expected.slice(page*20,(page+1)*20));
    if(page<3) await ui.click("my-chats-next");
  }
  await ui.click("my-chats-previous");assert.deepEqual(ui.namespacedIds(),expected.slice(40,60));ui.panel.dispose();
});
for(const kind of ["Private","Public"]) test(`${kind} revision change clears cached inbox titles before Previous`,async()=>{
  const ui=inbox();ui.panel.setActive(true);await settle();await ui.click("my-chats-next");ui[`changed${kind}`]();
  await ui.click("my-chats-previous");assert.deepEqual(ui.ids(),[]);assert.equal(ui.byId("my-chats-previous").disabled,true);ui.panel.dispose();
});

test("fresh inbox activation binds a changed canonical version and resets old page history",async()=>{
  const ui=inbox();ui.panel.setActive(true);await settle();const first=ui.ids();await ui.click("my-chats-next");
  ui.panel.setActive(false);ui.changedPublic();ui.panel.setActive(true);await settle();
  assert.deepEqual(ui.ids(),first);assert.equal(ui.byId("my-chats-previous").disabled,true);
  await ui.click("my-chats-next");assert.equal(ui.ids().length,20);ui.panel.dispose();
});

test("Back after an accepted private reply binds the new owner version without a false conflict",async()=>{
  const ui=dom();let ownerVersion=1;
  const conversation={id:"private",title:"Private conversation",sourceId:"source",sourceUrl:"https://example.org/article",revision:1};
  const messages=[{id:"agent",actorType:"agent",body:"Answer",createdAt:"2026-10-12T10:00:00Z"}];
  const panel=mountPrivateConversationPanel(ui.document,ui.root,{readActor:()=>"owner",readPublicState:()=>({sourceId:"source"}),
    prepareGeneration:async()=>({model:"fixture"}),showView() {},randomId:()=>"operation",
    client:{version:async()=>({version:{generation:"fixture",revision:1}}),
      async privateConversation(action,payload) {
        if(action==="list")return {conversations:[{...conversation}],next:null,ownerVersion};
        if(action==="read")return {conversation:{...conversation},messages:[...messages],next:null};
        if(action==="send") {ownerVersion++;conversation.revision++;messages.push({id:"human",actorType:"human",body:payload.body,
          createdAt:"2026-10-12T10:01:00Z",generation:{state:"none"}});return {messageId:"human",revision:conversation.revision};}
        assert.fail(`Unexpected ${action}`);
      }}});
  panel.setActive(true);await settle();ui.byId("private-chat-feed").children.find(item=>item.className==="private-chat-card").listeners.get("click")();await settle();
  ui.byId("private-message-body").value="Private reply";
  const composer=ui.root.children.find(item=>item.className==="private-composer");await composer.listeners.get("submit")({preventDefault(){}});
  assert.equal(ownerVersion,2);ui.root.children[0].children[0].listeners.get("click")();await settle();
  assert.equal(ui.byId("private-chat-feed").children.filter(item=>item.className==="private-chat-card").length,1);
  assert.equal(ui.root.children.find(item=>item.className==="community-status").textContent,"");panel.dispose();
});

test("Discover Previous freshly requests its incoming cursor and replaces the twenty-result window",async()=>{
  const ui=dom(),calls=[],version={generation:"fixture",revision:1};
  const panel=mountDiscoveryPanel(ui.document,ui.root,{client:{async discover(payload){calls.push(payload);
    const start=Number(payload.cursor??0);return {version,results:Array.from({length:20},(_,i)=>({topicId:`topic-${start+i}`,
      title:`Title ${start+i}`,snippet:"Snippet",visibleCount:1,sources:[]})),nextCursor:start<40?String(start+20):null};}}});
  ui.byId("discovery-search").value="query";panel.setActive(true);panel.observeConnected(true);await settle();
  ui.byId("discovery-more").listeners.get("click")();await settle();assert.equal(ui.byId("discovery-results").children.length,20);
  ui.byId("discovery-previous").listeners.get("click")();await settle();
  assert.deepEqual(calls.map(call=>call.cursor),[null,"20",null]);assert.equal(ui.byId("discovery-results").children.length,20);panel.dispose();
});

test("Discover preview limits roots and replies to twenty, validates reply pages and clears withdrawn text",async()=>{
  const ui=dom();let revision=1;
  const message = id=>({id,state:"visible",actorType:"human",body:id});
  const client={version:async()=>({version:{generation:"fixture",revision}}),
    discover:async()=>({version:{generation:"fixture",revision},results:[{topicId:"topic",title:"Topic",snippet:"",visibleCount:1,sources:[]}],nextCursor:null}),
    discussion:async()=>({version:{generation:"fixture",revision},topic:{title:"Topic"},roots:Array.from({length:21},(_,i)=>({...message(`root-${i}`),
      replies:i===0?Array.from({length:21},(_,r)=>message(`reply-${r}`)):[]}))})};
  const panel=mountDiscoveryPanel(ui.document,ui.root,{client});ui.byId("discovery-search").value="query";
  panel.setActive(true);panel.observeConnected(true);await settle();ui.byId("discovery-open-topic").listeners.get("click")();await settle();
  const all=node=>[node,...node.children.flatMap(all)];
  const ids=()=>all(ui.byId("discovery-preview")).filter(node=>node.attributes["data-post-id"]).map(node=>node.attributes["data-post-id"]);
  assert.equal(ids().filter(id=>id.startsWith("root")).length,20);assert.equal(ids().filter(id=>id.startsWith("reply")).length,20);
  ui.byId("discovery-replies-next-root-0").listeners.get("click")();await settle();
  assert.deepEqual(ids().filter(id=>id.startsWith("reply")),["reply-20"]);
  revision++;ui.byId("discovery-replies-previous-root-0").listeners.get("click")();await settle();
  assert.deepEqual(ids(),[]);assert.equal(ui.byId("discovery-results").children.length,0);panel.dispose();
});

test("two rapid Discover reply Next clicks share one fresh version check and cannot skip to an empty page",async()=>{
  const ui=dom(),version={generation:"fixture",revision:1};let release,checks=0;
  const message=id=>({id,state:"visible",actorType:"human",body:id});
  const panel=mountDiscoveryPanel(ui.document,ui.root,{client:{
    version:()=>{checks++;return new Promise(resolve=>{release=()=>resolve({version});});},
    discover:async()=>({version,results:[{topicId:"topic",title:"Topic",snippet:"",visibleCount:1,sources:[]}],nextCursor:null}),
    discussion:async()=>({version,topic:{title:"Topic"},roots:[{...message("root"),replies:Array.from({length:21},(_,i)=>message(`reply-${i}`))}]})}});
  ui.byId("discovery-search").value="query";panel.setActive(true);panel.observeConnected(true);await settle();
  ui.byId("discovery-open-topic").listeners.get("click")();await settle();
  const next=ui.byId("discovery-replies-next-root");next.listeners.get("click")();next.listeners.get("click")();
  assert.equal(checks,1);assert.equal(next.disabled,true);release();await settle();
  const all=node=>[node,...node.children.flatMap(all)];
  assert.deepEqual(all(ui.byId("discovery-preview")).filter(node=>node.attributes["data-post-id"]?.startsWith("reply"))
    .map(node=>node.attributes["data-post-id"]),["reply-20"]);
  assert.equal(next.disabled,true);panel.dispose();
});
