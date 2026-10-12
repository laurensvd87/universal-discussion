import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { fail } from "../domain/errors.js";
import { assertExpected } from "../domain/repository-contract.js";
import { MAX_RESPONSE_BYTES } from "../domain/discussion-view.js";
import { frozenClone, readExpectedVersion, readId, readRecord, readText } from "../domain/validation.js";
import { isAccountActor } from "../accounts/account-principal.js";
import { inspectPageUrl } from "../../../../spikes/topic-resolution/browser/core/page-content-policy.js";

const owned = (entry,actorId) => !entry.withdrawn && entry.visibility === "local-public" &&
  (entry.actorType === "human" ? entry.authorId === actorId : entry.actorType === "agent" && entry.insight?.operatorId === actorId);
const compare = (a,b) => a<b ? -1 : a>b ? 1 : 0;
const position = entry => ({createdAt:entry.createdAt,id:entry.id});
const safeUrl = source => source && inspectPageUrl(source.url).supported && inspectPageUrl(source.url).url === source.url ? source.url : null;

export function normalizeMyChatsQuery(value) {
  if (typeof value !== "string" || value.length > 256 ||
    /[\u0000-\u0008\u000b\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]|[\uD800-\uDFFF]/u.test(value)) fail("invalid", "Invalid request");
  return value.replace(/\s+/gu," ").trim();
}

// Account-authenticated read projections. These pages grant no write/AI authority.
export function createAccountPublicChats({repository,authorLabel}) {
  const cursorKey=randomBytes(32);
  const normalized=typeof repository.readAccountPublicChats === "function";
  const version=() => {
    if(typeof repository.version === "function") return readExpectedVersion(repository.version());
    const state=repository.load();return readExpectedVersion({generation:state.generation,revision:state.revision});
  };
  function encode(actorId,route,rootId,limit,version,after,query) {
    if(after===null) return null;
    const payload=Buffer.from(JSON.stringify({schema:"account-public-chats/v1",actorId,route,rootId,limit,version,after,query})).toString("base64url");
    return `${payload}.${createHmac("sha256",cursorKey).update(payload).digest("base64url")}`;
  }
  function decode(value,actorId,route,rootId,limit,expected,query) {
    if(value===null) return null;
    if(typeof value!=="string" || value.length>2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(value)) fail("invalid","Invalid request");
    const [payload,signature]=value.split(".");
    const wanted=createHmac("sha256",cursorKey).update(payload).digest();
    const supplied=Buffer.from(signature,"base64url");
    if(supplied.length!==wanted.length || !timingSafeEqual(supplied,wanted)) fail("conflict","Chats changed");
    let cursor;
    try { cursor=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.from(payload,"base64url"))); }
    catch { fail("invalid","Invalid request"); }
    cursor=readRecord(cursor,["schema","actorId","route","rootId","limit","version","after","query"]);
    if(cursor.schema!=="account-public-chats/v1" || cursor.actorId!==actorId || cursor.route!==route ||
      cursor.rootId!==rootId || cursor.limit!==limit || cursor.query!==query) fail("conflict","Chats changed");
    assertExpected(expected,readExpectedVersion(cursor.version));
    if(route==="list") {
      const after=readRecord(cursor.after,["updatedAt","id"]);
      return {updatedAt:readText(after.updatedAt,64),id:readId(after.id)};
    }
    const after=readRecord(cursor.after,["createdAt","id"]);
    return {createdAt:readText(after.createdAt,64),id:readId(after.id)};
  }
  function chat(header,sources) {
    const {root,topic}=header;
    const source=root.withdrawn ? null : sources.find(entry=>entry.id===root.originSourceId);
    return {id:root.id,visibility:"public",topicId:topic.id,discussionId:root.discussionId,
      title:(root.withdrawn ? topic.title : root.revisions.at(-1)?.body || topic.title).replace(/\s+/gu," ").trim().slice(0,200),
      sourceId:safeUrl(source)===null ? null : source.id,sourceUrl:safeUrl(source),
      createdAt:root.createdAt,updatedAt:header.updatedAt,actorType:root.actorType,
      ownedHuman:header.ownedHuman,ownedAgent:header.ownedAgent};
  }
  function message(entry,sources) {
    const source=entry.withdrawn ? null : sources.find(source=>source.id===entry.originSourceId);
    return {id:entry.id,replyToId:entry.replyToId ?? entry.rootId,actorType:entry.actorType,
      state:entry.withdrawn ? "deleted" : "visible",body:entry.withdrawn ? "" : entry.revisions.at(-1).body,
      createdAt:entry.createdAt,authorLabel:entry.withdrawn ? "Deleted by user" : authorLabel(entry.actorType==="agent" ? entry.insight.operatorId : entry.authorId).slice(0,200),
      sourceUrl:safeUrl(source)};
  }
  function legacy(actorId,rootId,after,limit,expected,query) {
    const state=repository.load();assertExpected(state,expected);
    const ownedEntries=state.contributions.filter(entry=>owned(entry,actorId));
    const rootIds=new Set(ownedEntries.map(entry=>entry.rootId??entry.id));
    function header(id) {
      const root=state.contributions.find(entry=>entry.id===id && entry.rootId===null);
      const topic=state.topics.find(topic=>state.discussions.some(discussion=>discussion.id===root?.discussionId && discussion.topicId===topic.id));
      if(!root || !topic) fail("not-found","Object unavailable");
      const own=ownedEntries.filter(entry=>(entry.rootId??entry.id)===id);
      const thread=state.contributions.filter(entry=>entry.id===id || entry.rootId===id);
      return {root,topic,ownedHuman:own.some(entry=>entry.actorType==="human"),ownedAgent:own.some(entry=>entry.actorType==="agent"),
        updatedAt:thread.map(entry=>entry.revisions.at(-1)?.createdAt??entry.createdAt).sort(compare).at(-1)};
    }
    if(rootId===null) {
      const roots=[...rootIds].map(header).filter(item=>!query || query.split(" ").every(term=> {
        const source=!item.root.withdrawn && state.sources.find(source=>source.id===item.root.originSourceId);
        const texts=[item.topic.title,...(safeUrl(source)?[source.title]:[]),...state.contributions.filter(entry=>
          (entry.id===item.root.id || entry.rootId===item.root.id) && !entry.withdrawn && entry.visibility==="local-public").map(entry=>entry.revisions.at(-1)?.body??"")];
        const fold=text=>text.replace(/[A-Z]/gu,char=>char.toLowerCase());
        return texts.some(text=>fold(text).includes(fold(term)));
      })).sort((a,b)=>compare(b.updatedAt,a.updatedAt)||compare(b.root.id,a.root.id))
        .filter(item=>after===null || item.updatedAt<after.updatedAt || item.updatedAt===after.updatedAt && item.root.id<after.id);
      const items=roots.slice(0,limit);
      return {version:expected,items,sources:state.sources,next:roots.length>limit ? {updatedAt:items.at(-1).updatedAt,id:items.at(-1).root.id}:null};
    }
    if(!rootIds.has(rootId)) fail("not-found","Object unavailable");
    const thread=state.contributions.filter(entry=>entry.id===rootId || entry.rootId===rootId);
    const byId=new Map(thread.map(entry=>[entry.id,entry]));const retained=new Set();
    for(const entry of thread.filter(entry=>!entry.withdrawn)) {
      let ancestor=entry;
      while(ancestor && !retained.has(ancestor.id)) { retained.add(ancestor.id);ancestor=byId.get(ancestor.replyToId??ancestor.rootId); }
    }
    const selected=thread.filter(entry=>retained.has(entry.id)).sort((a,b)=>compare(a.createdAt,b.createdAt)||compare(a.id,b.id))
      .filter(entry=>after===null || compare(entry.createdAt,after.createdAt)>0 || entry.createdAt===after.createdAt && entry.id>after.id);
    const items=selected.slice(0,limit);
    return {version:expected,conversation:header(rootId),items,sources:state.sources,next:selected.length>limit?position(items.at(-1)):null};
  }
  function page(actorId,value,route) {
    if(!isAccountActor(actorId)) fail("forbidden","Actor unavailable");
    const fields=route==="list" ? ["after","limit"]:["rootId","after","limit"];
    const input=readRecord(value,route==="list" ? [...fields,"query"]:fields,fields);
    const query=route==="list" && Object.hasOwn(input,"query") ? normalizeMyChatsQuery(input.query):"";
    const rootId=route==="list" ? null:readId(input.rootId),limit=input.limit;
    if(!Number.isInteger(limit)||limit<1||limit>25) fail("invalid","Invalid request");
    const expected=version(),after=decode(input.after,actorId,route,rootId,limit,expected,query);
    const page=normalized ? route==="list" ? repository.readAccountPublicChats(actorId,{after,limit,expectedVersion:expected,query})
      :repository.readAccountPublicChat(actorId,rootId,{after,limit,expectedVersion:expected}) :legacy(actorId,rootId,after,limit,expected,query);
    assertExpected(page.version,expected);
    const result=route==="list" ? {version:expected,chats:[],next:null}:
      {version:expected,conversation:chat(page.conversation,page.sources),messages:[],next:null};
    const key=route==="list" ? "chats":"messages";
    for(let index=0;index<page.items.length;index++) {
      const entry=page.items[index],projected=route==="list" ? chat(entry,page.sources):message(entry,page.sources);
      const next=index<page.items.length-1 || page.next!==null ? encode(actorId,route,rootId,limit,expected,route==="list" ? {updatedAt:entry.updatedAt,id:entry.root.id}:position(entry),query):null;
      const candidate={...result,[key]:[...result[key],projected],next};
      if(Buffer.byteLength(JSON.stringify(candidate))>MAX_RESPONSE_BYTES-4096) {
        if(!result[key].length) fail("capacity","Chat page capacity reached");
        break;
      }
      result[key].push(projected);result.next=next;
    }
    assertExpected(version(),expected);
    return frozenClone(result);
  }
  return Object.freeze({list:(actorId,value)=>page(actorId,value,"list"),read:(actorId,value)=>page(actorId,value,"read")});
}
