// Pure development cut fitting over caller-supplied real local-scorer features.
// No reference acquisition, vector encoding, root fitting or assignment authority.
import {types} from 'node:util';

export const PARTIAL_LOCAL_LIMITS=Object.freeze({nodes:128,rows:128,depth:8,reportedGroups:8,identifierUnits:160,gridWork:4000000});
export const PARTIAL_LOCAL_GRID=Object.freeze({minSimilarity:Object.freeze(Array.from({length:15},(_,i)=>Number((.70+.02*i).toFixed(2)))),
 minRivalMargin:Object.freeze([0,.005,.01,.02,.03,.05]),minNegativeMargin:Object.freeze([0,.01,.03]),minSupport:Object.freeze([2])});
const L=PARTIAL_LOCAL_LIMITS;
const FEATURE_FIELDS=['nodeId','bestSimilarity','positiveSimilarities','positiveGroupCount','support','negativeSimilarity','negativeGroupCount','negativeMargin',
 'bestStopSimilarity','stopSimilarities','stopGroupCount','stopSupport','accepted','plausibleStop','bestIncompatiblePositive','rivalMargin','stopRivalMargin'];
const fail=(code='invalid-input')=>{throw Object.assign(new TypeError('Invalid partial local calibration'),{code});};
function record(value,fields){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==fields.length)fail();
 const result={};for(const key of fields){const field=Object.getOwnPropertyDescriptor(value,key);if(!field?.enumerable||!Object.hasOwn(field,'value'))fail();result[key]=field.value;}return result;
}
function list(value,max){
 if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype)fail();
 const length=value.length;if(length>max)fail('capacity');if(Reflect.ownKeys(value).length!==length+1)fail();
 const result=[];for(let i=0;i<length;i++){const field=Object.getOwnPropertyDescriptor(value,String(i));if(!field?.enumerable||!Object.hasOwn(field,'value'))fail();result.push(field.value);}return result;
}
function id(value){if(typeof value!=='string'||!value.length||value.length>L.identifierUnits||!value.isWellFormed()||value.trim()!==value||/[\p{Cc}\p{Cf}]/u.test(value))fail();return value;}
function integer(value,max){if(!Number.isSafeInteger(value)||value<0||value>max||Object.is(value,-0))fail();return value;}
function scalar(value,max=1.00002){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>max)fail();return value;}
function nullable(value,max=1.00002){return value===null?null:scalar(value,max);}
const prefix=(a,b)=>a.length<=b.length&&a.every((node,index)=>node===b[index]);
function taxonomy(input){
 const nodes=list(input,L.nodes).map(n=>record(n,['id','parentId']));if(!nodes.length)fail();const byId=new Map(),paths=new Map();
 for(const node of nodes){id(node.id);if(node.parentId!==null)id(node.parentId);if(byId.has(node.id))fail();byId.set(node.id,node);}
 for(const node of nodes){const path=[],seen=new Set();let cursor=node;
  while(cursor){if(seen.has(cursor.id))fail();if(path.length>=L.depth)fail('capacity');seen.add(cursor.id);path.unshift(cursor.id);
   if(cursor.parentId===null)break;cursor=byId.get(cursor.parentId);if(!cursor)fail();}
  paths.set(node.id,path);
 }
 nodes.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);return {nodes,paths};
}
function annotation(input,paths){
 const a=record(input,['positivePathPrefix','completeEndpoint','excludedSubtrees']);
 const positivePathPrefix=list(a.positivePathPrefix,L.depth).map(id),excludedSubtrees=list(a.excludedSubtrees,L.nodes).map(id);
 if(typeof a.completeEndpoint!=='boolean'||a.completeEndpoint&&!positivePathPrefix.length||new Set(excludedSubtrees).size!==excludedSubtrees.length)fail();
 if(positivePathPrefix.length&&!samePath(positivePathPrefix,paths.get(positivePathPrefix.at(-1))))fail();
 for(const node of excludedSubtrees){if(!paths.has(node)||positivePathPrefix.includes(node))fail();}
 return {positivePathPrefix,completeEndpoint:a.completeEndpoint,excludedSubtrees};
}
function samePath(a,b){return Array.isArray(b)&&a.length===b.length&&a.every((node,i)=>node===b[i]);}
function truth(a,path){
 if(a.positivePathPrefix.includes(path.at(-1)))return true;
 if(a.excludedSubtrees.some(node=>path.includes(node)))return false;
 if(a.completeEndpoint&&prefix(a.positivePathPrefix,path)&&path.length>a.positivePathPrefix.length)return false;
 return null;
}
export function partialNodeTruth(input){
 if(arguments.length!==1)fail();const a=record(input,['nodes','annotation','nodeId']),t=taxonomy(a.nodes);id(a.nodeId);if(!t.paths.has(a.nodeId))fail();
 return truth(annotation(a.annotation,t.paths),t.paths.get(a.nodeId));
}
function similarities(value,count){
 const groups=list(value,L.reportedGroups).map(g=>record(g,['groupId','similarity']));if(groups.length!==Math.min(count,L.reportedGroups))fail();
 const seen=new Set();for(let i=0;i<groups.length;i++){const group=groups[i];id(group.groupId);scalar(group.similarity);if(seen.has(group.groupId))fail();seen.add(group.groupId);
  const previous=groups[i-1];if(previous&&(previous.similarity<group.similarity||previous.similarity===group.similarity&&previous.groupId>group.groupId))fail();}
 return groups;
}
function feature(input){
 const f=record(input,FEATURE_FIELDS);id(f.nodeId);
 for(const key of ['positiveGroupCount','negativeGroupCount','stopGroupCount'])integer(f[key],2048);
 for(const [key,count] of [['support','positiveGroupCount'],['stopSupport','stopGroupCount']])integer(f[key],f[count]);
 for(const key of ['bestSimilarity','negativeSimilarity','bestStopSimilarity','bestIncompatiblePositive'])nullable(f[key]);
 for(const key of ['negativeMargin','rivalMargin','stopRivalMargin'])nullable(f[key],2.00004);
 if(typeof f.accepted!=='boolean'||typeof f.plausibleStop!=='boolean')fail();
 f.positiveSimilarities=similarities(f.positiveSimilarities,f.positiveGroupCount);f.stopSimilarities=similarities(f.stopSimilarities,f.stopGroupCount);
 if(f.bestSimilarity!==(f.positiveSimilarities[0]?.similarity??null)||f.bestStopSimilarity!==(f.stopSimilarities[0]?.similarity??null)||
  (f.negativeGroupCount===0)!==(f.negativeSimilarity===null)||f.stopGroupCount>f.positiveGroupCount)fail();
 for(const [key,left,right] of [['negativeMargin','bestSimilarity','negativeSimilarity'],['rivalMargin','bestSimilarity','bestIncompatiblePositive'],['stopRivalMargin','bestStopSimilarity','bestIncompatiblePositive']]){
  const expected=f[left]===null||f[right]===null?null:f[left]-f[right];if(f[key]!==expected)fail();
 }
 return f;
}
function accepts(f,cut){
 // Top eight distinct TRAIN groups suffice for the fixed two-group support cut.
 const support=f.positiveSimilarities.filter(group=>group.similarity>=cut.minSimilarity).length;
 return support>=2&&f.bestSimilarity!==null&&f.bestSimilarity>=cut.minSimilarity&&
  (f.negativeSimilarity===null||f.bestSimilarity>f.negativeSimilarity&&f.bestSimilarity-f.negativeSimilarity>=cut.minNegativeMargin)&&
  (f.bestIncompatiblePositive===null||f.bestSimilarity-f.bestIncompatiblePositive>=cut.minRivalMargin);
}
function higher(a,b){for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]>b[i];return false;}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}

export function fitPartialHierarchyLocalCuts(input){
 if(arguments.length!==1)fail();const a=record(input,['nodes','rows']),t=taxonomy(a.nodes),rawRows=list(a.rows,L.rows);if(!rawRows.length)fail();
 // Conservative original 15*6*3*2-support grid bound; support-one candidates
 // are excluded here, so only 270 admissible cuts are evaluated per node.
 const preflightGridWork=t.nodes.length*rawRows.length*540;if(preflightGridWork>L.gridWork)fail('capacity');
 const ids=new Set(),groups=new Set();
 const rows=rawRows.map(value=>{const row=record(value,['id','groupId','split','annotation','features']);id(row.id);id(row.groupId);
  if(row.split!=='calibration'||ids.has(row.id)||groups.has(row.groupId))fail();ids.add(row.id);groups.add(row.groupId);
  const gold=annotation(row.annotation,t.paths),features=new Map();for(const raw of list(row.features,L.nodes)){const f=feature(raw);if(!t.paths.has(f.nodeId)||features.has(f.nodeId))fail();features.set(f.nodeId,f);}
  if(features.size!==t.nodes.length)fail();return {gold,features};
 });
 // Reject visible self/reference leakage. Hidden references and real editorial
 // independence remain the caller's provenance obligation, not an attestation.
 for(const row of rows)for(const f of row.features.values())for(const group of [...f.positiveSimilarities,...f.stopSimilarities])if(groups.has(group.groupId))fail();
 const policies=[],audit=[];let countedGridWork=0;
 for(const node of t.nodes){
  const observed=rows.map(row=>({truth:truth(row.gold,t.paths.get(node.id)),feature:row.features.get(node.id)}));
  const knownPositiveGroups=observed.filter(row=>row.truth===true).length,knownNegativeGroups=observed.filter(row=>row.truth===false).length,unknownGroups=observed.length-knownPositiveGroups-knownNegativeGroups;
  let best=null;
  for(const minSimilarity of PARTIAL_LOCAL_GRID.minSimilarity)for(const minRivalMargin of PARTIAL_LOCAL_GRID.minRivalMargin)for(const minNegativeMargin of PARTIAL_LOCAL_GRID.minNegativeMargin){
   const cut={minSimilarity,minRivalMargin,minNegativeMargin,minSupport:2};let acceptedKnownPositiveGroups=0,acceptedKnownNegativeGroups=0,acceptedUnknownGroups=0;
   for(const row of observed){countedGridWork++;if(accepts(row.feature,cut)){if(row.truth===true)acceptedKnownPositiveGroups++;else if(row.truth===false)acceptedKnownNegativeGroups++;else acceptedUnknownGroups++;}}
   if(knownNegativeGroups<3||acceptedKnownNegativeGroups||acceptedKnownPositiveGroups<3)continue;
   const rank=[acceptedKnownPositiveGroups,minSimilarity,minRivalMargin,minNegativeMargin];
   if(best===null||higher(rank,best.rank))best={cut,rank,acceptedKnownPositiveGroups,acceptedUnknownGroups};
  }
  const cut=best?.cut??{minSimilarity:1,minRivalMargin:2,minNegativeMargin:2,minSupport:2};policies.push({nodeId:node.id,enabled:best!==null,...cut});
  audit.push({nodeId:node.id,enabled:best!==null,knownPositiveGroups,knownNegativeGroups,unknownGroups,
   acceptedKnownPositiveGroups:best?.acceptedKnownPositiveGroups??0,acceptedKnownNegativeGroups:0,acceptedUnknownGroups:best?.acceptedUnknownGroups??0,
   acceptedGroups:(best?.acceptedKnownPositiveGroups??0)+(best?.acceptedUnknownGroups??0),
   minimumAcceptedKnownPositiveGroups:3,minimumKnownNegativeGroups:3,minimumObservedTrainSupport:2,validatedPrecision:null});
 }
 if(countedGridWork>preflightGridWork||countedGridWork>L.gridWork)fail('capacity');
 return freeze({policies,audit,preflightGridWork,countedGridWork,
  gridWorkUnit:'row-cut-evaluations-not-all-scalar-comparisons-or-CPU',limits:L,grid:PARTIAL_LOCAL_GRID,
  scope:'caller-supplied-local-scorer-features-provenance-not-attested',developmentOptimizationOnly:true,independentValidation:false,
  unknownAcceptedIsNotCorrect:true,productionValidated:false,assignmentAuthority:false});
}
