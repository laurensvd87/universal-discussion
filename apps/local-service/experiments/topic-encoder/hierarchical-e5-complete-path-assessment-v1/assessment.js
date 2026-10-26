// Pure supplied-decision assessment. No classifier, fitting, IO or authority.
import {types} from 'node:util';
import {createHash} from 'node:crypto';

export const COMPLETE_PATH_LIMITS=Object.freeze({nodes:512,depth:8,cases:512,groups:512,
 trainingGroupIds:2048,calibrationGroupIds:2048,identifierUnits:160,languageUnits:32,membershipOperations:65536});
const L=COMPLETE_PATH_LIMITS,SCHEMA='hierarchy-complete-path-assessment/v1';
export class CompletePathAssessmentError extends TypeError{
 constructor(code){super('Invalid complete hierarchy assessment: '+code);this.name='CompletePathAssessmentError';this.code=code;}
}
const bad=(code='contract')=>{throw new CompletePathAssessmentError(code);};
function record(v,keys){
 if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)bad();
 const own=Reflect.ownKeys(v);if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))bad();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[k]=d.value;}return out;
}
function array(v,max){
 if(!v||typeof v!=='object'||types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype)bad();
 const n=Object.getOwnPropertyDescriptor(v,'length')?.value;if(!Number.isSafeInteger(n)||n>max)bad('capacity');
 if(Reflect.ownKeys(v).length!==n+1)bad();const out=[];
 for(let i=0;i<n;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out.push(d.value);}return out;
}
function identifier(v,max=L.identifierUnits){
 if(typeof v!=='string'||v.length<1||v.length>max||!v.isWellFormed()||v.trim()!==v||/[\p{Cc}\p{Cf}]/u.test(v))bad();return v;
}
function language(v){identifier(v,L.languageUnits);if(!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(v))bad();return v;}
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function freeze(v){const pending=[v];let visited=0;while(pending.length){const x=pending.pop();if(!x||typeof x!=='object'||Object.isFrozen(x))continue;
 if(++visited>32768)bad('capacity');for(const child of Object.values(x))if(child&&typeof child==='object')pending.push(child);Object.freeze(x);}return v;}
const ratio=(n,d)=>d?n/d:null;
const pathEqual=(a,b)=>a.length===b.length&&a.every((id,i)=>id===b[i]);
function counts(){return {total:0,available:0,unavailable:0,assigned:0,unresolved:0,determinateSafeAccepted:0,wrongAccepted:0,uncheckedAccepted:0,
 belowRootAccepted:0,belowRootDeterminateSafe:0,belowRootWrong:0,belowRootUnchecked:0,exactDeepest:0,safeBroader:0,knownPrefixSupported:0,
 wrongRoot:0,wrongSiblingOrCousin:0,overSpecific:0,uncheckedDescendant:0,outsideTotal:0,outsideAvailable:0,outsideFalseAccept:0,outsideSemanticReject:0,
 rootCorrect:0,rootWrong:0};}
function add(c,o){
 c.total++;c[o.status==='unavailable'?'unavailable':'available']++;
 if(o.status==='assigned'){
  c.assigned++;c[o.unchecked?'uncheckedAccepted':o.wrong?'wrongAccepted':'determinateSafeAccepted']++;
  if(o.selectedPath.length>1){c.belowRootAccepted++;c[o.unchecked?'belowRootUnchecked':o.wrong?'belowRootWrong':'belowRootDeterminateSafe']++;}
  if(o.goldKind!=='outside')c[o.selectedPath[0]===o.goldPath[0]?'rootCorrect':'rootWrong']++;
 }else if(o.status==='unresolved')c.unresolved++;
 if(!['unavailable','unresolved'].includes(o.outcome)&&Object.hasOwn(c,o.outcome))c[o.outcome]++;
 if(o.goldKind==='outside'){c.outsideTotal++;if(o.status!=='unavailable')c.outsideAvailable++;}
}
function rates(c){return {...c,inputAvailability:ratio(c.available,c.total),assignmentCoverage:ratio(c.assigned,c.total),
 availableAssignmentCoverage:ratio(c.assigned,c.available),usefulCoverage:ratio(c.determinateSafeAccepted,c.total),
 determinateAccepted:c.determinateSafeAccepted+c.wrongAccepted,determinateAcceptedPrecision:ratio(c.determinateSafeAccepted,c.determinateSafeAccepted+c.wrongAccepted),
 belowRootDeterminate:c.belowRootDeterminateSafe+c.belowRootWrong,belowRootDeterminatePrecision:ratio(c.belowRootDeterminateSafe,c.belowRootDeterminateSafe+c.belowRootWrong),
 belowRootCoverage:ratio(c.belowRootAccepted,c.total),outsideFalseAcceptanceAllGold:ratio(c.outsideFalseAccept,c.outsideTotal),
 outsideFalseAcceptanceAvailable:ratio(c.outsideFalseAccept,c.outsideAvailable),outsideSemanticRejectionAllGold:ratio(c.outsideSemanticReject,c.outsideTotal)};}
function groupCounts(){return {total:0,anyAvailable:0,allAvailable:0,noneAvailable:0,anyUnavailable:0,anyAssigned:0,anyWrong:0,anyUnchecked:0,
 allViewsSafe:0,anySafeAssigned:0,belowRootAnyAssigned:0,belowRootAnyWrong:0,belowRootAnyUnchecked:0,belowRootAllViewsSafe:0,
 outsideTotal:0,outsideAnyAvailable:0,outsideFalseAccept:0,outsideAllViewsSemanticReject:0};}
function groupVerdict(rows){
 const available=rows.filter(o=>o.status!=='unavailable'),assigned=rows.filter(o=>o.status==='assigned'),below=assigned.filter(o=>o.selectedPath.length>1);
 const wrong=rows.some(o=>o.wrong),unchecked=rows.some(o=>o.unchecked);
 // Known-topic abstention is not positive safe-assignment credit. An OUTSIDE
 // available unresolved view is safe semantic rejection; unavailable never is.
 const outside=rows[0].goldKind==='outside';
 return {anyAvailable:available.length>0,allAvailable:available.length===rows.length,noneAvailable:available.length===0,
  anyUnavailable:available.length!==rows.length,anyAssigned:assigned.length>0,anyWrong:wrong,anyUnchecked:unchecked,
  allViewsSafe:rows.every(o=>o.safe),anySafeAssigned:assigned.some(o=>o.safe),belowRootAnyAssigned:below.length>0,
  belowRootAnyWrong:below.some(o=>o.wrong),belowRootAnyUnchecked:below.some(o=>o.unchecked),
  belowRootAllViewsSafe:rows.every(o=>o.status==='assigned'&&o.selectedPath.length>1&&o.safe),outsideTotal:outside,
  outsideAnyAvailable:outside&&available.length>0,outsideFalseAccept:outside&&assigned.length>0,
  outsideAllViewsSemanticReject:outside&&rows.every(o=>o.status==='unresolved')};
}
function addGroup(c,verdict){c.total++;for(const [key,value]of Object.entries(verdict))if(value)c[key]++;
}
function groupRates(c){return {...c,inputAnyAvailability:ratio(c.anyAvailable,c.total),inputAllAvailability:ratio(c.allAvailable,c.total),
 anyAssignmentCoverage:ratio(c.anyAssigned,c.total),allViewsSafeRate:ratio(c.allViewsSafe,c.total),
 outsideFalseAcceptanceAllGold:ratio(c.outsideFalseAccept,c.outsideTotal),outsideFalseAcceptanceAnyAvailable:ratio(c.outsideFalseAccept,c.outsideAnyAvailable)};}

/** Exact record schemas are documented in README. Membership preflight is an
 * explicit conservative bound; hash/record copying and serialization are not
 * hidden within that scoped operation counter. No metadata attests provenance. */
export function assessCompleteHierarchyPredictions(input){
 if(arguments.length!==1)bad();const a=record(input,['nodes','cases','predictions','trainingGroupIds','calibrationGroupIds']);
 const rawNodes=array(a.nodes,L.nodes),rawCases=array(a.cases,L.cases),rawPredictions=array(a.predictions,L.cases),
  train=array(a.trainingGroupIds,L.trainingGroupIds),cal=array(a.calibrationGroupIds,L.calibrationGroupIds);
 if(!rawNodes.length||rawPredictions.length!==rawCases.length)bad();
 // Per-node lineage build/check18; per-case gold/prediction comparisons, group
 // and three aggregate memberships88; prediction path copy/check8; forbidden
 // group insertion/check2. Fixed128 covers bounded setup memberships. This
 // deliberately can refuse a simultaneous all-caps request before path work.
 const preflight=128+18*rawNodes.length+88*rawCases.length+8*rawPredictions.length+2*(train.length+cal.length);
 if(preflight>L.membershipOperations)bad('capacity');let operations=0;
 function work(n=1){operations+=n;if(operations>preflight||operations>L.membershipOperations)bad('capacity');}
 const forbidden=new Set();
 for(const value of [...train,...cal]){const id=identifier(value);work(2);if(forbidden.has(id))bad('duplicate-forbidden-group');forbidden.add(id);}
 const nodes=rawNodes.map(v=>{const n=record(v,['id','parentId']);return {id:identifier(n.id),parentId:n.parentId===null?null:identifier(n.parentId)};});
 const byId=new Map();for(const n of nodes){work();if(byId.has(n.id))bad('duplicate-node');byId.set(n.id,n);}
 const paths=new Map();for(const n of nodes){let cursor=n;const path=[],seen=new Set();
  while(cursor){work(2);if(seen.has(cursor.id))bad('cycle');seen.add(cursor.id);path.unshift(cursor.id);if(path.length>L.depth)bad('depth');
   if(cursor.parentId===null)break;cursor=byId.get(cursor.parentId);if(!cursor)bad('unknown-parent');}
  paths.set(n.id,path);
 }
 function checkedPath(value,empty){const p=array(value,L.depth).map(v=>identifier(v));if(!empty&&!p.length)bad('empty-path');
  if(p.length){work();const expected=paths.get(p.at(-1));if(!expected||expected.length!==p.length)bad('invalid-path');
   for(let i=0;i<p.length;i++){work();if(p[i]!==expected[i])bad('invalid-path');}}
  return p;
 }
 const ids=new Set(),truths=new Map();
 const cases=rawCases.map(v=>{const c=record(v,['id','groupId','language','gold']),id=identifier(c.id),groupId=identifier(c.groupId),lang=language(c.language);
  work(3);if(ids.has(id))bad('duplicate-case');ids.add(id);if(forbidden.has(groupId))bad('split-overlap');
  const g=record(c.gold,['kind','path']);if(!['complete','prefix','outside'].includes(g.kind))bad('gold-kind');
  const path=checkedPath(g.path,g.kind==='outside');if(g.kind==='outside'&&path.length)bad('outside-path');
  const gold={kind:g.kind,path},prior=truths.get(groupId);work();if(prior&&(prior.kind!==g.kind||!pathEqual(prior.path,path)))bad('group-truth');
  work(path.length);truths.set(groupId,gold);if(truths.size>L.groups)bad('capacity');return {id,groupId,language:lang,gold};
 });
 const predictions=rawPredictions.map((v,i)=>{const p=record(v,['id','status','selectedPath']);identifier(p.id);
  if(p.id!==cases[i].id)bad('prediction-order');if(!['assigned','unresolved','unavailable'].includes(p.status))bad('prediction-status');
  const selectedPath=checkedPath(p.selectedPath,p.status!=='assigned');if(p.status!=='assigned'&&selectedPath.length)bad('unassigned-path');
  return {id:p.id,status:p.status,selectedPath};});
 const prefix=(p,q)=>{if(p.length>q.length)return false;for(let i=0;i<p.length;i++){work();if(p[i]!==q[i])return false;}return true;};
 const total=counts(),byLanguage=new Map(),byRoot=new Map(),groups=new Map();
 const outcomes=cases.map((c,i)=>{const p=predictions[i],gold=c.gold;let outcome,safe=false,wrong=false,unchecked=false;
  if(p.status==='unavailable')outcome='unavailable';
  else if(p.status==='unresolved'){outcome=gold.kind==='outside'?'outsideSemanticReject':'unresolved';safe=gold.kind==='outside';}
  else if(gold.kind==='outside'){outcome='outsideFalseAccept';wrong=true;}
  else if(p.selectedPath[0]!==gold.path[0]){outcome='wrongRoot';wrong=true;}
  else if(prefix(p.selectedPath,gold.path)){
   safe=true;outcome=p.selectedPath.length<gold.path.length?'safeBroader':gold.kind==='complete'?'exactDeepest':'knownPrefixSupported';
  }else if(prefix(gold.path,p.selectedPath)){
   outcome=gold.kind==='complete'?'overSpecific':'uncheckedDescendant';wrong=gold.kind==='complete';unchecked=gold.kind==='prefix';
  }else{outcome='wrongSiblingOrCousin';wrong=true;}
  const o={id:c.id,groupId:c.groupId,language:c.language,goldKind:gold.kind,goldPath:[...gold.path],status:p.status,
   selectedPath:[...p.selectedPath],outcome,safe,wrong,unchecked};
  work(4);add(total,o);const root=gold.path[0]??null;
  for(const [map,key]of [[byLanguage,c.language],[byRoot,root]]){
   work(2);if(!map.has(key))map.set(key,{counts:counts(),groups:new Map()});const slice=map.get(key);add(slice.counts,o);
   work(2);if(!slice.groups.has(c.groupId))slice.groups.set(c.groupId,[]);slice.groups.get(c.groupId).push(o);
  }
  work(2);if(!groups.has(c.groupId))groups.set(c.groupId,[]);groups.get(c.groupId).push(o);return o;
 });
 // Compute each conservative whole-group verdict ONCE. A group appearing in a
 // language slice retains its global any-wrong/unchecked verdict, not a safer
 // verdict manufactured by discarding another language's failing view.
 const groupVerdicts=new Map();for(const [groupId,rows]of groups){work(rows.length*6);groupVerdicts.set(groupId,groupVerdict(rows));}
 function summarizeGroups(map){const c=groupCounts();for(const groupId of map.keys()){work();addGroup(c,groupVerdicts.get(groupId));}return groupRates(c);}
 const slices=(map,key)=>[...map].map(([value,s])=>({[key]:value,cases:rates(s.counts),groups:summarizeGroups(s.groups)}));
 const result={schema:SCHEMA,cases:rates(total),groups:summarizeGroups(groups),byLanguage:slices(byLanguage,'language'),byRoot:slices(byRoot,'rootId'),outcomes,
  groupPolicy:{truth:'identical-kind-and-path',anyWrongViewMakesGroupWrong:true,anyUncheckedPreventsAllViewsSafe:true,
   allViewsSafeRequiresEveryViewAvailableAndKnownSafe:true,knownTopicUnresolvedNotSafeAssignmentCredit:true,
   sliceGroupTotalsNonAdditive:true,sliceGroupsUseWholeGroupVerdict:true,declaredGroupIndependenceAttested:false},
  metadataHashes:{nodesSha256:digest(nodes),casesSha256:digest(cases),predictionsSha256:digest(predictions),
   forbiddenGroupIdsSha256:digest({trainingGroupIds:train,calibrationGroupIds:cal})},
  work:{membershipOperations:operations,preflightUpperBound:preflight,limit:L.membershipOperations,
   scope:'bounded path comparisons and group/map membership; not all validation, copying, hash or serialization work'},
  experimental:true,productionValidated:false,assignmentAuthority:false,representativePopulationClaim:false,
  probabilityClaim:false,releaseGateApplied:false};
 return freeze(result);
}
