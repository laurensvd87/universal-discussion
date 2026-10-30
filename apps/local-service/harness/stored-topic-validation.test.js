import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {prepareStoredValidation,evaluateStoredValidation,STORED_VALIDATION_SQL,STORED_VALIDATION_PROBES} from './stored-topic-validation.js';
import {main} from './run-stored-topic-validation.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
function vector(angle){const v=Array(384).fill(0);v[0]=Math.cos(angle);v[1]=Math.sin(angle);return v;}
function observation(id,title,angle,path=['technology']){return {sourceId:id,inputHash:hash(id),materialHash:hash('material-'+id),title,
 publisherKey:'example.test',acceptedPath:path,vector:vector(angle)};}
const input=observations=>({representationHash:'a'.repeat(64),matcherHash:'b'.repeat(64),minimumSimilarity:.8,observations});
const annotation=(id,key,labels=['Python'],root='technology')=>({sourceId:id,expectedRootId:root,subjects:key===null?[]:[{key,labels}]});

test('independent score oracle counts a correct merge, one abstention and unknown separately',()=>{
 const rows=[observation('a','Python language introduction',0),observation('b','Python language examples',.2),observation('c','Linux kernel',1),observation('d','Unknown title',2)];
 const gold=[annotation('a','python',['Python language']),annotation('b','python',['Python language']),annotation('c','linux',['Linux']),annotation('d',null)];
 const result=evaluateStoredValidation({input:input(rows),annotations:gold});
 assert.equal(result.counts.reviewed,3);assert.equal(result.counts.unreviewed,1);assert.equal(result.counts.assigned,2);
 assert.equal(result.counts.correctLabel,2);assert.equal(result.counts.wrongLabel,0);assert.equal(result.counts.abstainedReviewed,1);
 assert.equal(result.counts.correctMergedPairs,1);assert.equal(result.counts.correctSeparatedPairs,2);assert.equal(result.counts.wrongMergedPairs,0);
 assert.equal(result.counts.rootCorrect,4);assert.equal(result.scope.endToEndLatency,false);
});
test('gold cannot alter proposals and detects wrong sense merges and incorrect labels',()=>{
 const rows=[observation('a','Python guide',0),observation('b','Python examples',.2)];
 const correct=evaluateStoredValidation({input:input(rows),annotations:[annotation('a','python'),annotation('b','python')]});
 const incorrect=evaluateStoredValidation({input:input(rows),annotations:[annotation('a','python'),annotation('b','snake',['Royal python'],'nature')]});
 assert.deepEqual(correct.algorithmOutput,incorrect.algorithmOutput);
 assert.equal(incorrect.counts.wrongMergedPairs,1);assert.equal(incorrect.counts.wrongLabel,1);assert.equal(incorrect.counts.rootWrong,1);
});
test('null assignments do not masquerade as a merged topic; exact annotation coverage is required',()=>{
 const rows=[observation('a','Different one',0),observation('b','Distinct two',1)];
 const gold=[annotation('a','same',['Different']),annotation('b','same',['Distinct'])];
 assert.equal(evaluateStoredValidation({input:input(rows),annotations:gold}).counts.missedSameSubjectPairs,1);
 for(const annotations of [gold.slice(0,1),[gold[0],gold[0]],[gold[0],{...gold[1],sourceId:'foreign'}]])assert.throws(()=>evaluateStoredValidation({input:input(rows),annotations}));
});
test('specific child selection is scored against the independently annotated ordered subject path',()=>{
 const rows=[observation('a','Python tutorial',0),observation('b','Python language examples',.2),observation('c','Python language reference',.4)];
 const gold=rows.map(r=>({sourceId:r.sourceId,expectedRootId:'technology',subjects:[{key:'python',labels:['Python']},...(r.sourceId==='a'?[]:[{key:'python-language',labels:['Python language']}])]}));
 const result=evaluateStoredValidation({input:input(rows),annotations:gold});
 assert.equal(result.algorithmOutput.proposals.length,2);assert.equal(result.counts.correctLabel,3);
 assert.equal(result.decisions.find(d=>d.sourceId==='b').selectedDepth,1);assert.equal(result.counts.moreSpecificSupportedButNotSelected,0);
});
test('same-name different accepted roots remain separated despite close E5 vectors',()=>{
 // Keep all pairs below the unchanged .995 duplicate threshold, including
 // cross-root pairs. Otherwise duplicate collapsing intentionally abstains.
 const rows=[observation('a','Python',0),observation('b','Python language',.25),observation('c','Python snakes',.125,['nature']),observation('d','Python habitat',.375,['nature'])];
 const result=evaluateStoredValidation({input:input(rows),annotations:[annotation('a','code'),annotation('b','code'),annotation('c','snake',['Python'],'nature'),annotation('d','snake',['Python'],'nature')]});
 assert.equal(result.counts.wrongMergedPairs,0);assert.equal(result.counts.correctMergedPairs,2);assert.equal(result.counts.correctLabel,4);
});
test('stored decoding refuses corrupt coordinates or witnesses instead of silently repairing them',()=>{
 const v=vector(.2),b=Buffer.alloc(20+384*12);b.writeInt32BE(1,0);b.writeUInt32BE(701,8);b.writeInt32BE(384,12);b.writeInt32BE(1,16);
 for(let i=0;i<384;i++){b.writeInt32BE(8,20+12*i);b.writeDoubleBE(v[i],24+12*i);}
 const row={sourceId:'source-1',sourceVersion:'1',operationId:'operation-1',operationDigest:hash('op'),sourceStamp:hash('stamp'),probe:'python',title:'Python',url:'https://example.test/python',
 acceptedPath:['technology'],bodyBase64:b.toString('base64'),titleBase64:b.toString('base64'),bodyWireHash:hash(b),titleWireHash:hash(b)};
 const f=rows=>({rows,inputDefinition:{bodyWeight:.75,titleWeight:.25,encoderHash:'c'.repeat(64)},matcherHash:'b'.repeat(64)});
 assert.equal(prepareStoredValidation(f([row])).observations.length,1);
 for(const patch of [{bodyWireHash:'d'.repeat(64)},{sourceStamp:'invalid'},{probe:'custom'},{url:'https://user:pass@example.test'}])assert.throws(()=>prepareStoredValidation(f([{...row,...patch}])));
 assert.throws(()=>prepareStoredValidation(f([row,row])));
});
test('fixed capture uses exact eligible material before four-row limit and no SQL writes',()=>{
 assert.equal(STORED_VALIDATION_PROBES.length,16);assert.match(STORED_VALIDATION_SQL,/i.semantic_eligible[\s\S]*ORDER BY s.ordinal,s.id LIMIT 4/u);
 assert.match(STORED_VALIDATION_SQL,/st.postable/u);assert.match(STORED_VALIDATION_SQL,/o.operation_digest=r.operation_digest/u);
 assert.match(STORED_VALIDATION_SQL,/LIMIT 64$/u);assert.doesNotMatch(STORED_VALIDATION_SQL,/\b(INSERT|UPDATE|DELETE|CALL|pg_advisory)\b/iu);
});
test('closed command grammar rejects arbitrary sources and paths before opening resources',async()=>{
 for(const args of [null,[],['--capture'],['--capture-fixed-cohort','extra'],['--compare-fixed-cohort','invalid','invalid']])assert.equal(await main(args),2);
});
