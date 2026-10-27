// Read-only, bounded canonical pages. These rows never form a posting graph.
import {record,readId,readActorId,readVersion,readPostOrigin,freeze} from './local-service-contract.js';
import {readDiscovery} from './community-contract.js';

const fail=()=>{throw new TypeError('Invalid canonical history page');};
const text=(v,max,multiline=false)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(multiline?v.replace(/[\r\n\t]/gu,''):v))fail();return v;};
const count=v=>{if(!Number.isSafeInteger(v)||v<0)fail();return v;};
const nullableId=v=>v===null?null:readId(v);
const cursor=v=>{if(v===null)return null;if(typeof v!=='string'||!v.length||v.length>2048||!/^[A-Za-z0-9_-]+$/u.test(v))fail();return v;};
function array(v,project){
 if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>20)fail();
 const descriptors=Object.getOwnPropertyDescriptors(v);if(Reflect.ownKeys(descriptors).length!==v.length+1)fail();
 return Array.from({length:v.length},(_,i)=>{const d=descriptors[i];if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();return project(d.value);});
}
function post(value){
 const state=Object.getOwnPropertyDescriptor(value??{},'state')?.value;
 const fields=['id','rootId','replyToId','state',...(state==='deleted'?['label']:['authorId','actorType','body','createdAt','edited'])];
 if(state==='visible')for(const key of ['origin','insight','regrouped'])if(Object.hasOwn(value,key))fields.push(key);
 const a=record(value,fields),out={id:readId(a.id),rootId:nullableId(a.rootId),replyToId:nullableId(a.replyToId),state:a.state};
 if(out.id===out.rootId||out.id===out.replyToId||out.rootId===null&&out.replyToId!==null)fail();
 if(state==='deleted'){if(a.label!=='Deleted by user')fail();return {...out,label:a.label};}
 if(state!=='visible'||!['human','agent'].includes(a.actorType)||typeof a.edited!=='boolean'||typeof a.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(a.createdAt)||!Number.isFinite(Date.parse(a.createdAt)))fail();
 if(a.actorType==='agent'){
  const insight=record(a.insight,['kind','operatorId']);if(a.authorId!=='demo-imported-ai'||!['manual-import','generated'].includes(insight.kind)||out.rootId!==null&&insight.kind!=='generated')fail();
  out.insight={kind:insight.kind,operatorId:readActorId(insight.operatorId)};
 }else{readActorId(a.authorId);if(Object.hasOwn(a,'insight'))fail();}
 Object.assign(out,{actorType:a.actorType,authorId:a.authorId,body:text(a.body,8000,true),createdAt:a.createdAt,edited:a.edited});
 if(Object.hasOwn(a,'origin'))readPostOrigin(a.origin); // Validate, then omit related-page metadata from history.
 if(Object.hasOwn(a,'regrouped')){if(out.rootId!==null||a.regrouped!==true)fail();out.regrouped=true;}
 return out;
}
export function readCanonicalHistoryRequest(value){const a=record(value,['topicId','limit','cursor']);if(a.limit!==20)fail();return {topicId:readId(a.topicId),limit:20,cursor:cursor(a.cursor)};}
export function readCanonicalHistoryPage(value,expected){
 const a=record(value,['version','discussionVersion','topic','discussionId','items','nextCursor']),topic=record(a.topic,['id','title','kind']);
 const topicId=readId(topic.id),discussionId=readId(a.discussionId);if(expected&&(topicId!==expected.topicId||expected.discussionId&&discussionId!==expected.discussionId))fail();
 if(!['general','event','product','claim'].includes(topic.kind))fail();
 const items=array(a.items,post);if(new Set(items.map(p=>p.id)).size!==items.length)fail();
 // A selected reply's parent/root may be on another page. Do not hydrate it.
 return freeze({version:readVersion(a.version),discussionVersion:count(a.discussionVersion),topic:{id:topicId,title:text(topic.title,200),kind:topic.kind},discussionId,items,nextCursor:cursor(a.nextCursor)});
}
export function readCanonicalHistoryListing(value){
 const a=readDiscovery(value);if(a.query!=='')fail();
 const results=array(a.results,row=>({topicId:readId(row.topicId),discussionId:readId(row.discussionId),title:text(row.title,200),visibleCount:count(row.visibleCount)}));
 if(new Set(results.map(r=>r.topicId)).size!==results.length)fail();
 return freeze({version:readVersion(a.version),results,nextCursor:cursor(a.nextCursor)});
}
