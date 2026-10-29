// Complete bounded title probes for existing named subjects. No stemming,
// guessed synonym, model or topic creation. Refuse the entire workload instead
// of dropping a possible competing phrase when a bound is exceeded.
import {createHash} from 'node:crypto';
export const SINGLE_SOURCE_TOPIC_POLICY=Object.freeze({schema:'single-source-topic-match/v1',minimumSimilarity:.88,minimumMargin:.03,
 maximumFocusKeys:512,maximumWords:64,maximumPhraseWords:8,maximumCandidates:64,maximumClosure:64,maximumDepth:8,
 title:'NFKC-Intl.Segmenter-und-wordlike-lowercase-contiguous-phrases',
 choice:'most-specific-confident-branch-with-incomparable-competitor-margin',newIdentities:false,canonicalWrites:false});
export const SINGLE_SOURCE_TOPIC_POLICY_HASH=createHash('sha256').update(JSON.stringify(SINGLE_SOURCE_TOPIC_POLICY)).digest('hex');
const segmenter=new Intl.Segmenter('und',{granularity:'word'}),bad=()=>{throw new TypeError('Invalid single page topic title');};
export function singleSourceTopicFocus(title){
 if(arguments.length!==1||typeof title!=='string'||!title.isWellFormed()||!title.trim()||title.length>200||/[\u0000-\u001f\u007f]/u.test(title))bad();
 const normalized=title.normalize('NFKC');if(normalized.length>512)return Object.freeze({status:'capacity',focusKeys:Object.freeze([])});
 const words=[...segmenter.segment(normalized)].filter(p=>p.isWordLike);
 if(words.length>64)return Object.freeze({status:'capacity',focusKeys:Object.freeze([])});
 const keys=new Set();
 for(let i=0;i<words.length;i++)for(let length=1;length<=8&&i+length<=words.length;length++){
  const span=words.slice(i,i+length);if(span.at(-1).index+span.at(-1).segment.length-span[0].index>80)continue;
  if(!span.some(p=>/\p{L}/u.test(p.segment)))continue;
  keys.add(createHash('sha256').update(JSON.stringify(span.map(p=>p.segment.toLowerCase()))).digest('hex'));
  if(keys.size>512)return Object.freeze({status:'capacity',focusKeys:Object.freeze([])});
 }
 return Object.freeze({status:'ready',focusKeys:Object.freeze([...keys].sort())});
}
