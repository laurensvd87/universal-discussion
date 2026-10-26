// Invented metadata and paths only. No files, artifacts, classifier or encoder.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCompleteHierarchyPredictions as assess,CompletePathAssessmentError,COMPLETE_PATH_LIMITS} from './assessment.js';
const nodes=[{id:'games',parentId:null},{id:'video',parentId:'games'},{id:'gta',parentId:'video'},
 {id:'gta5',parentId:'gta'},{id:'minecraft',parentId:'video'},{id:'board',parentId:'games'},
 {id:'nature',parentId:null},{id:'animals',parentId:'nature'},{id:'koala',parentId:'animals'}];
const GTA=['games','video','gta'],KOALA=['nature','animals','koala'];
function row(id,kind,path,predicted,status=predicted.length?'assigned':'unresolved',groupId=id,language='en'){
 return {c:{id,groupId,language,gold:{kind,path:[...path]}},p:{id,status,selectedPath:[...predicted]}};
}
function data(rows=[]){return {nodes:nodes.map(n=>({...n})),cases:rows.map(r=>r.c),predictions:rows.map(r=>r.p),trainingGroupIds:[],calibrationGroupIds:[]};}
const error=code=>e=>e instanceof CompletePathAssessmentError&&e.code===code;

test('complete truth distinguishes every safe/wrong path category and internal-node acceptance',()=>{
 const a=data([
  row('exact','complete',GTA,GTA),row('broad','complete',GTA,['games','video']),
  row('wrongroot','complete',GTA,KOALA),row('sibling','complete',GTA,['games','video','minecraft']),
  row('cousin','complete',GTA,['games','board']),row('too-specific','complete',GTA,[...GTA,'gta5']),
  row('none','complete',GTA,[]),row('missing','complete',GTA,[],'unavailable'),
 ]),r=assess(a),c=r.cases;
 assert.deepEqual(r.outcomes.map(o=>o.outcome),['exactDeepest','safeBroader','wrongRoot','wrongSiblingOrCousin','wrongSiblingOrCousin','overSpecific','unresolved','unavailable']);
 assert.equal(c.total,8);assert.equal(c.available,7);assert.equal(c.unavailable,1);assert.equal(c.unresolved,1);
 assert.equal(c.assigned,6);assert.equal(c.determinateSafeAccepted,2);assert.equal(c.wrongAccepted,4);assert.equal(c.determinateAcceptedPrecision,2/6);
 assert.equal(c.belowRootAccepted,6);assert.equal(c.belowRootDeterminateSafe,2);assert.equal(c.belowRootWrong,4);
 assert.equal(c.rootCorrect,5);assert.equal(c.rootWrong,1);assert.equal(c.usefulCoverage,2/8);assert.equal(c.inputAvailability,7/8);
 assert.equal(r.productionValidated,false);assert.equal(r.assignmentAuthority,false);assert.equal(r.releaseGateApplied,false);
 assert.ok(r.work.membershipOperations<=r.work.preflightUpperBound);assert.ok(r.work.preflightUpperBound<=65536);
});
test('prefix endpoint supports only known prefix; strict descendants unchecked, divergences wrong',()=>{
 const r=assess(data([
  row('endpoint','prefix',['games','video'],['games','video']),row('ancestor','prefix',GTA,['games']),
  row('descendant','prefix',['games','video'],GTA),row('inside-divergence','prefix',GTA,['games','video','minecraft']),
  row('crossroot','prefix',GTA,KOALA),row('cousin','prefix',['games','video'],['games','board']),
 ]));
 assert.deepEqual(r.outcomes.map(o=>o.outcome),['knownPrefixSupported','safeBroader','uncheckedDescendant','wrongSiblingOrCousin','wrongRoot','wrongSiblingOrCousin']);
 assert.equal(r.cases.exactDeepest,0);assert.equal(r.cases.knownPrefixSupported,1);assert.equal(r.cases.uncheckedAccepted,1);
 assert.equal(r.cases.assigned,6);assert.equal(r.cases.determinateAccepted,5);assert.equal(r.cases.determinateAcceptedPrecision,2/5);
 assert.equal(r.cases.belowRootAccepted,5);assert.equal(r.cases.belowRootDeterminate,4);assert.equal(r.cases.belowRootUnchecked,1);
 assert.equal(r.outcomes[2].safe,false);assert.equal(r.outcomes[2].wrong,false);assert.equal(r.outcomes[2].unchecked,true);
 assert.equal(r.groups.anyUnchecked,1);assert.equal(r.groups.allViewsSafe,2);
});
test('OUTSIDE false acceptance, actual semantic rejection and unavailable stay separate with full denominators',()=>{
 const r=assess(data([row('accepted','outside',[],GTA),row('rejected','outside',[],[]),row('not-read','outside',[],[],'unavailable')]));
 assert.equal(r.cases.total,3);assert.equal(r.cases.available,2);assert.equal(r.cases.unavailable,1);
 assert.equal(r.cases.outsideTotal,3);assert.equal(r.cases.outsideAvailable,2);assert.equal(r.cases.outsideFalseAccept,1);assert.equal(r.cases.outsideSemanticReject,1);
 assert.equal(r.cases.outsideFalseAcceptanceAllGold,1/3);assert.equal(r.cases.outsideFalseAcceptanceAvailable,1/2);
 assert.equal(r.cases.outsideSemanticRejectionAllGold,1/3);assert.equal(r.cases.usefulCoverage,0);
 assert.equal(r.groups.outsideFalseAccept,1);assert.equal(r.groups.outsideAllViewsSemanticReject,1);assert.equal(r.groups.allViewsSafe,1);
 assert.equal(r.byRoot[0].rootId,null);assert.equal(r.byRoot[0].cases.total,3);
});
test('independent group conservatism: any wrong/unchecked view prevents all-views-safe, translations are not extra votes',()=>{
 const r=assess(data([
  row('a-en','complete',GTA,GTA,'assigned','a','en'),row('a-de','complete',GTA,['games','board'],'assigned','a','de'),
  row('b-en','prefix',['games','video'],['games','video'],'assigned','b','en'),row('b-fr','prefix',['games','video'],GTA,'assigned','b','fr'),
  row('c-en','complete',KOALA,KOALA,'assigned','c','en'),row('c-nl','complete',KOALA,[],'unavailable','c','nl'),
  row('d-en','outside',[],[],'unresolved','d','en'),row('d-es','outside',[],[],'unresolved','d','es'),
 ]));
 assert.equal(r.cases.total,8);assert.equal(r.groups.total,4);assert.equal(r.groups.anyWrong,1);assert.equal(r.groups.anyUnchecked,1);
 assert.equal(r.groups.anyAssigned,3);assert.equal(r.groups.anyAvailable,4);assert.equal(r.groups.allAvailable,3);assert.equal(r.groups.anyUnavailable,1);
 assert.equal(r.groups.allViewsSafe,1);assert.equal(r.groups.belowRootAllViewsSafe,0);
 assert.ok(r.byLanguage.reduce((n,s)=>n+s.groups.total,0)>r.groups.total);assert.equal(r.groupPolicy.sliceGroupTotalsNonAdditive,true);
 assert.equal(r.byLanguage.find(s=>s.language==='de').groups.anyWrong,1);
 assert.equal(r.byLanguage.find(s=>s.language==='en').groups.anyWrong,1); // German wrong view still makes group a wrong group in every membership slice.
 assert.equal(r.groupPolicy.sliceGroupsUseWholeGroupVerdict,true);
});
test('unavailable-only and empty cases use null zero-denominator rates, not perfect precision',()=>{
 const empty=assess(data());assert.equal(empty.cases.total,0);assert.equal(empty.groups.total,0);
 for(const key of ['inputAvailability','assignmentCoverage','determinateAcceptedPrecision','belowRootDeterminatePrecision','outsideFalseAcceptanceAvailable'])assert.equal(empty.cases[key],null);
 const r=assess(data([row('x','outside',[],[],'unavailable')]));assert.equal(r.cases.outsideFalseAcceptanceAllGold,0);
 assert.equal(r.cases.outsideFalseAcceptanceAvailable,null);assert.equal(r.cases.determinateAcceptedPrecision,null);assert.equal(r.groups.allViewsSafe,0);
 const n=assess(data([row('x','complete',GTA,[])]));assert.equal(n.groups.allViewsSafe,0);assert.equal(n.cases.unresolved,1);
});
test('every path contains all ancestors; forest identity, cycles, missing parents and depth are strict',()=>{
 for(const selectedPath of [['gta'],['games','gta'],['nature','video','gta'],['games','video','unknown'],['games','video','gta','gta']]){
  const a=data([row('x','complete',GTA,selectedPath)]);assert.throws(()=>assess(a),CompletePathAssessmentError);
 }
 for(const mutate of [a=>a.nodes.push({...a.nodes[0]}),a=>a.nodes[0].parentId='missing',a=>a.nodes[0].parentId='gta',
  a=>a.cases[0].gold.path=['gta'],a=>a.cases[0].gold.path=[],a=>a.cases[0].gold={kind:'outside',path:GTA}]){
  const a=data([row('x','complete',GTA,GTA)]);mutate(a);assert.throws(()=>assess(a),CompletePathAssessmentError);
 }
 const a=data();a.nodes=Array.from({length:9},(_,i)=>({id:'n'+i,parentId:i?'n'+(i-1):null}));assert.throws(()=>assess(a),error('depth'));
 a.nodes=a.nodes.slice(0,8);assert.equal(assess(a).cases.total,0);
});
test('ordered one prediction per case; unassigned paths and status/extra payloads refused',()=>{
 for(const mutate of [a=>a.predictions.reverse(),a=>a.predictions.pop(),a=>a.predictions.push(a.predictions[0]),
  a=>a.predictions[0].id='unknown',a=>a.predictions[0].id=a.predictions[1].id,
  a=>a.predictions[0].status='unavailable',a=>a.predictions[0].status='unresolved',a=>a.predictions[0].status='maybe',
  a=>a.predictions[0].score=.9,a=>a.predictions[0].body='not allowed',a=>a.cases[0].extra=true,
  a=>a.nodes[0].label='not allowed',a=>a.cases[0].gold.confidence=1]){
  const a=data([row('x','complete',GTA,GTA),row('y','complete',KOALA,KOALA)]);mutate(a);assert.throws(()=>assess(a),CompletePathAssessmentError);
 }
 assert.throws(()=>assess({...data(),extra:true}),CompletePathAssessmentError);assert.throws(()=>assess(data(),{}),CompletePathAssessmentError);
});
test('group truth exact kind/path and train/cal leakage rejected, declared identity not provenance attestation',()=>{
 for(const other of [row('b','prefix',GTA,GTA,'assigned','shared'),row('b','complete',['games','video'],GTA,'assigned','shared')]){
  assert.throws(()=>assess(data([row('a','complete',GTA,GTA,'assigned','shared'),other])),error('group-truth'));
 }
 for(const field of ['trainingGroupIds','calibrationGroupIds']){const a=data([row('x','complete',GTA,GTA)]);a[field]=['x'];assert.throws(()=>assess(a),error('split-overlap'));}
 for(const fields of [{trainingGroupIds:['a','a']},{trainingGroupIds:['a'],calibrationGroupIds:['a']}])assert.throws(()=>assess({...data(),...fields}),error('duplicate-forbidden-group'));
 assert.equal(assess(data()).groupPolicy.declaredGroupIndependenceAttested,false);
});
test('bounded identifiers/languages, closed records and dense arrays reject hostile data without callbacks',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('must not run');};
 for(const make of [()=>new Proxy({},{getPrototypeOf:trap,ownKeys:trap}),()=>{const a=data();Object.defineProperty(a,'cases',{enumerable:true,get:trap});return a;},
  ()=>{const a=data([row('x','complete',GTA,GTA)]);Object.defineProperty(a.cases[0].gold,'path',{enumerable:true,get:trap});return a;},
  ()=>{const a=data([row('x','complete',GTA,GTA)]);Object.defineProperty(a.predictions[0].selectedPath,'0',{enumerable:true,get:trap});return a;},
  ()=>{const a=data();a.nodes=new Proxy([],{getPrototypeOf:trap});return a;},()=>{const a=data();delete a.nodes[0];return a;}])assert.throws(()=>assess(make()));
 assert.equal(calls,0);
 for(const id of ['', 'x'.repeat(161),'x\ud800','x\u0000',' x','x\u202e']){const a=data([row(id,'complete',GTA,GTA)]);assert.throws(()=>assess(a));}
 for(const lang of ['', 'a'.repeat(33),'en_bad','en\ud800']){const a=data([row('x','complete',GTA,GTA,'assigned','x',lang)]);assert.throws(()=>assess(a));}
 const a=data();a.nodes=Object.assign([...a.nodes],{extra:true});assert.throws(()=>assess(a));
});
test('all finite caps and conservative membership preflight fail explicitly before path work',()=>{
 assert.equal(COMPLETE_PATH_LIMITS.membershipOperations,65536);
 for(const [field,value]of [['nodes',Array(513).fill({})],['cases',Array(513).fill({})],['predictions',Array(513).fill({})],['trainingGroupIds',Array(2049).fill('x')],['calibrationGroupIds',Array(2049).fill('x')]]){
  assert.throws(()=>assess({...data(),[field]:value}),error('capacity'));
 }
 const maximum={nodes:Array(512).fill({}),cases:Array(512).fill({}),predictions:Array(512).fill({}),
  trainingGroupIds:Array.from({length:2048},(_,i)=>'t'+i),calibrationGroupIds:Array.from({length:2048},(_,i)=>'c'+i)};
 assert.throws(()=>assess(maximum),error('capacity')); // Before malformed raw node/case records are examined.
 const a=data(Array.from({length:512},(_,i)=>row('case'+i,'complete',GTA,GTA,'assigned','group'+i)));
 const r=assess(a);assert.equal(r.cases.total,512);assert.equal(r.groups.total,512);assert.ok(r.work.membershipOperations<=65536);
 const boundary=data([row('a'.repeat(160),'complete',GTA,GTA,'assigned','g'.repeat(160),'abcdefgh-abcdefgh-abcdefgh-abcde')]);
 boundary.trainingGroupIds=Array.from({length:2048},(_,i)=>'train'+i);boundary.calibrationGroupIds=Array.from({length:2048},(_,i)=>'cal'+i);
 assert.equal(assess(boundary).cases.total,1);
 const forest=data();forest.nodes=Array.from({length:512},(_,i)=>({id:'root'+i,parentId:null}));assert.equal(assess(forest).cases.total,0);
});
test('detached frozen results and metadata hashes reflect inputs without mutating callers',()=>{
 const a=data([row('x','complete',GTA,[...GTA])]),before=structuredClone(a),r=assess(a);assert.deepEqual(a,before);
 a.predictions[0].selectedPath.pop();a.cases[0].gold.path.pop();a.nodes[0].id='changed';
 assert.deepEqual(r.outcomes[0].selectedPath,GTA);assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.outcomes[0].goldPath));
 assert.throws(()=>r.outcomes.push({}));assert.match(r.metadataHashes.nodesSha256,/^[a-f0-9]{64}$/);
 const b=data([row('x','complete',GTA,['games'])]);assert.notEqual(assess(b).metadataHashes.predictionsSha256,r.metadataHashes.predictionsSha256);
});
