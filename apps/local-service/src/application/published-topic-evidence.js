// Public discussion inputs only. Imports do no IO; no Source data or model is
// retained here. The database must independently check the current public root.
import {createHash} from 'node:crypto';
const fail=()=>{throw new TypeError('Invalid published topic evidence');};
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const PUBLISHED_TOPIC_INPUT=Object.freeze({schema:'published-topic-input/v1',bodyNormalization:'NFKC-whitespace-single-space',
 bodyMaximumUtf16Units:2000,boundary:'drop-trailing-unpaired-surrogate',titleNormalization:'NFKC',
 focus:'Intl.Segmenter-und-wordlike-lowercase-array-sha256',minimumPublicWords:6,wordSegmentation:'Intl.Segmenter-und-letter-containing',
 publicDigest:'sha256-utf8-JSON-array-rootId-topicId-exact-caption-exact-current-body'});
export const PUBLISHED_TOPIC_INPUT_HASH=sha(PUBLISHED_TOPIC_INPUT);
const words=new Intl.Segmenter('und',{granularity:'word'});
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(v);
const text=(v,max)=>typeof v==='string'&&v.isWellFormed()&&v.trim()===v&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(v);
export function publishedTopicInput(rawJson){
 if(arguments.length!==1||typeof rawJson!=='string'||Buffer.byteLength(rawJson)>65536)fail();let a;
 try{a=JSON.parse(rawJson);}catch{fail();}
 if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).sort().join(',')!=='body,caption,rootId,topicId'||!id(a.rootId)||!id(a.topicId)||!text(a.caption,200)||
   typeof a.body!=='string'||!a.body.isWellFormed()||!a.body.trim()||a.body.length>8000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(a.body))fail();
 const titleInput=a.caption.normalize('NFKC');if(!text(titleInput,512))fail();
 const tokens=[...words.segment(titleInput)].filter(w=>w.isWordLike).map(w=>w.segment.toLowerCase());if(!tokens.length||tokens.length>64)fail();
 let bodyInput=a.body.normalize('NFKC').replace(/\s+/gu,' ').trim().slice(0,2000);if(!bodyInput.isWellFormed())bodyInput=bodyInput.slice(0,-1);
 return Object.freeze({rootId:a.rootId,topicId:a.topicId,caption:a.caption,publicDigest:sha([a.rootId,a.topicId,a.caption,a.body]),focusKey:sha(tokens),titleInput,bodyInput,
  meaningful:[...words.segment(bodyInput)].filter(w=>w.isWordLike&&/\p{L}/u.test(w.segment)).length>=6});
}
