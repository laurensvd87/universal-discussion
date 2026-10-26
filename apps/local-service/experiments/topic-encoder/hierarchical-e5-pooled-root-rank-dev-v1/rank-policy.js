// DEVELOPMENT ONLY: pooled empirical root-rank cuts, not probability/calibrated
// per-class guarantees. A unique winner is required before score/gap cuts apply.
import {types} from 'node:util';
import {createHash} from 'node:crypto';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HEX=/^[a-f0-9]{64}$/u;
export const RANK_LIMITS=Object.freeze({maxNodes:16,maxCalibrationRows:48,maxDiagnosticRows:32,maxWork:1000000,minimumAcceptedGroups:20});
const handles=new WeakMap(),lex=(a,b)=>a<b?-1:a>b?1:0;
function fail(){throw new TypeError('Invalid bounded development rank input');}
function record(v,keys){if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)fail();
  const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();out[k]=d.value;}return out;}
function array(v,max){if(types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype)fail();const n=Object.getOwnPropertyDescriptor(v,'length').value;
  if(n>max||Reflect.ownKeys(v).length!==n+1)fail();return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();return d.value;});}
function id(v){if(typeof v!=='string'||!v.length||v.length>160||v.trim()!==v||!v.isWellFormed()||/[\u0000-\u001f\u007f]/u.test(v))fail();return v;}
function hash(v){if(typeof v!=='string'||!HEX.test(v))fail();return v;}
function finite(v){if(typeof v!=='number'||!Number.isFinite(v))fail();return v;}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function roots(v){const out=array(v,16).map(id).sort(lex);if(out.length<2||new Set(out).size!==out.length)fail();return out;}
function scores(v,nodes){const out=array(v,16).map(v=>{const r=record(v,['nodeId','score']);id(r.nodeId);finite(r.score);return r;}).sort((a,b)=>lex(a.nodeId,b.nodeId));
  if(out.length!==nodes.length||out.some((r,i)=>r.nodeId!==nodes[i]))fail();return out;}
function rank(rows,work){let best=null,second=null,tied=false;for(const r of rows){work.units+=4;if(best===null||r.score>best.score){second=best;best=r;tied=false;}
    else if(r.score===best.score){second=r;tied=true;}else if(second===null||r.score>second.score)second=r;}
  const gap=best.score-second.score;if(!Number.isFinite(gap))fail();return {winnerId:tied?null:best.nodeId,winnerScore:best.score,winnerGap:gap,tied};}
export function rankRootScores(input){const a=record(input,['nodeIds','scores']),nodes=roots(a.nodeIds),work={units:0};return freeze({...rank(scores(a.scores,nodes),work),comparisonWork:work.units});}
export function pooledRankWorkUpperBound(rowCount,nodeCount){
  if(!Number.isInteger(rowCount)||rowCount<0||rowCount>48||!Number.isInteger(nodeCount)||nodeCount<2||nodeCount>16)fail();
  return rowCount*nodeCount*4+rowCount*rowCount*4+rowCount*64+256;
}
export function fitPooledRootRankPolicy(input){
  const a=record(input,['modelHash','representationHash','inputConstructionHash','nodeIds','rows']);
  for(const k of ['modelHash','representationHash','inputConstructionHash'])hash(a[k]);const nodeIds=roots(a.nodeIds),work={units:0};
  const sourceRows=array(a.rows,48),preflightUpperBound=pooledRankWorkUpperBound(sourceRows.length,nodeIds.length);if(preflightUpperBound>RANK_LIMITS.maxWork)fail();
  const ids=new Set(),groups=new Set(),rows=sourceRows.map(v=>{const r=record(v,['id','groupId','expectedRootId','scores']);id(r.id);id(r.groupId);id(r.expectedRootId);
    if(ids.has(r.id)||groups.has(r.groupId)||!nodeIds.includes(r.expectedRootId))fail();ids.add(r.id);groups.add(r.groupId);
    return {id:r.id,groupId:r.groupId,expectedRootId:r.expectedRootId,scores:scores(r.scores,nodeIds)};}).sort((a,b)=>lex(a.id,b.id));
  const ranked=rows.map(r=>({...r,...rank(r.scores,work)})),valid=ranked.filter(r=>!r.tied);
  const gaps=[...new Set([0,...valid.map(r=>r.winnerGap)])].sort((a,b)=>a-b);
  const ordered=[...valid].sort((a,b)=>{work.units++;return b.winnerScore-a.winnerScore||lex(a.id,b.id);});
  let chosen=null;
  for(const gap of gaps){let accepted=0,correct=0;
    for(let i=0;i<ordered.length;){const score=ordered[i].winnerScore;let j=i;
      while(j<ordered.length&&ordered[j].winnerScore===score){work.units++;const r=ordered[j++];if(r.winnerGap>=gap){accepted++;if(r.winnerId===r.expectedRootId)correct++;}}
      // Score ties are included as a whole, never split to hide a CAL error.
      work.units++;if(accepted>=20&&accepted===correct&&(!chosen||accepted>chosen.acceptedGroups||accepted===chosen.acceptedGroups&&
        (gap>chosen.minWinnerGap||gap===chosen.minWinnerGap&&score>chosen.minWinnerScore)))chosen={minWinnerScore:score,minWinnerGap:gap,acceptedGroups:accepted,correctGroups:correct};
      i=j;
    }
  }
  if(work.units>preflightUpperBound)fail();
  const body={schema:'pooled-root-rank-development-policy/v1',modelHash:a.modelHash,representationHash:a.representationHash,inputConstructionHash:a.inputConstructionHash,
    nodeIds,calibrationHash:sha(rows),minimumAcceptedGroups:20,enabled:chosen!==null,minWinnerScore:chosen?.minWinnerScore??0,minWinnerGap:chosen?.minWinnerGap??0,
    acceptedGroups:chosen?.acceptedGroups??0,correctGroups:chosen?.correctGroups??0,work:{countedUnits:work.units,preflightUpperBound},
    developmentOnly:true,perClassPrecisionGuaranteed:false,productionValidated:false,assignmentAuthority:false};
  return freeze({...body,policyHash:sha(body)});
}
const POLICY_FIELDS=['schema','modelHash','representationHash','inputConstructionHash','nodeIds','calibrationHash','minimumAcceptedGroups','enabled','minWinnerScore','minWinnerGap',
  'acceptedGroups','correctGroups','work','developmentOnly','perClassPrecisionGuaranteed','productionValidated','assignmentAuthority','policyHash'];
export function compilePooledRootRankPolicy(input){
  const p=record(input,POLICY_FIELDS);for(const k of ['modelHash','representationHash','inputConstructionHash','calibrationHash','policyHash'])hash(p[k]);p.nodeIds=roots(p.nodeIds);
  p.work=record(p.work,['countedUnits','preflightUpperBound']);for(const n of Object.values(p.work))if(!Number.isSafeInteger(n)||n<0||n>1000000)fail();
  if(p.work.countedUnits>p.work.preflightUpperBound||p.schema!=='pooled-root-rank-development-policy/v1'||p.minimumAcceptedGroups!==20||typeof p.enabled!=='boolean'||
    p.developmentOnly!==true||p.perClassPrecisionGuaranteed!==false||p.productionValidated!==false||p.assignmentAuthority!==false)fail();
  finite(p.minWinnerScore);finite(p.minWinnerGap);if(p.minWinnerGap<0)fail();
  if(!Number.isInteger(p.acceptedGroups)||p.acceptedGroups<0||p.acceptedGroups>48||p.correctGroups!==p.acceptedGroups||
    p.enabled!==(p.acceptedGroups>=20)||!p.enabled&&(p.acceptedGroups!==0||p.minWinnerGap!==0||p.minWinnerScore!==0))fail();
  const {policyHash,...body}=p;if(sha(body)!==policyHash)fail();const h=Object.freeze({});handles.set(h,freeze(p));return h;
}
export function classifyPooledRootRankPolicy(handle,input){
  const p=handles.get(handle);if(!p)fail();const a=record(input,['modelHash','representationHash','inputConstructionHash','sourceId','sourceVersion','scores']);id(a.sourceId);id(a.sourceVersion);
  for(const k of ['modelHash','representationHash','inputConstructionHash'])if(a[k]!==p[k])fail();
  const work={units:0},r=rank(scores(a.scores,p.nodeIds),work),accepted=p.enabled&&!r.tied&&r.winnerScore>=p.minWinnerScore&&r.winnerGap>=p.minWinnerGap;
  return freeze({schema:'pooled-root-rank-development-decision/v1',sourceId:a.sourceId,sourceVersion:a.sourceVersion,policyHash:p.policyHash,
    selectedPath:accepted?[r.winnerId]:[],...r,reason:r.tied?'rank-tie':!p.enabled?'disabled':accepted?'accepted':'below-pooled-cut',comparisonWork:work.units,
    developmentOnly:true,productionValidated:false,assignmentAuthority:false});
}
