import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createAutomaticAuthorContextRepository as repository} from '../canonical-v4/automatic-author-context-repository.js';
import {createCanonicalV4LifecycleRepository as lifecycle,prepareCanonicalV4LifecycleCommand as prepare} from '../canonical-v4/lifecycle-repository.js';
const generation='invented-generation',actor={id:'demo-alex',type:'human',demo:true},expected={generation,revision:7};
const scope={kind:'named',id:'12345678-1234-4123-8123-123456789abc',caption:'Steam Deck',sourceId:'source-a',materialDigest:'a'.repeat(64)};
const command={type:'share-insight',topicId:'topic-a',body:'Exact generated result',operationId:'operation-a',originSourceId:'source-a'};
const proof={kind:'generated-insight',operationId:command.operationId,actorId:actor.id,topicId:command.topicId,originSourceId:command.originSourceId,body:command.body,rootId:null,replyToId:null,discussionId:null};
const request=()=>structuredClone({expected,command,actor,proof,scope}),dependencies={nextId:()=> 'generated-root',now:()=> '2026-10-29T13:30:00Z'};
const result={version:{generation,revision:8},result:{contributionId:'generated-root'}};
const code=c=>e=>e?.code===c;

test('authored insight has an exact016 inverse except its four closed context blocks and explicit new signature',async()=>{
 const read=async file=>(await readFile(new URL(file,import.meta.url),'utf8')).replace(/\r\n/g,'\n');
 const original=(await read('../canonical-v4/migrations/016-semantic-insight-reply.sql')).match(/CREATE OR REPLACE FUNCTION canonical_v4\.runtime_lifecycle_command\([\s\S]*?\n\$runtime_lifecycle_command\$;/)[0];
 const sql=await read('../canonical-v4/drafts/automatic-author-insight.sql'),body=sql.match(/CREATE FUNCTION canonical_v4\.named_share_insight\([\s\S]*?\n\$named_share_insight\$;/)[0];
 const blocks=[...body.matchAll(/^  +-- BEGIN AUTHOR ([A-Z_]+)\n[\s\S]*?^  +-- END AUTHOR \1\n/gm)];
 assert.deepEqual(blocks.map(m=>m[1]),['DECLARATIONS','SCOPE','REPLAY','COMMIT']);
 const inverse=body.replace(/^  +-- BEGIN AUTHOR ([A-Z_]+)\n[\s\S]*?^  +-- END AUTHOR \1\n/gm,'')
  .replace('CREATE FUNCTION canonical_v4.named_share_insight(','CREATE OR REPLACE FUNCTION canonical_v4.runtime_lifecycle_command(')
  .replace('  p_generated_proof text,\n  p_scope jsonb\n','  p_generated_proof text\n').replaceAll('$named_share_insight$','$runtime_lifecycle_command$');
 assert.equal(inverse,original);assert(body.indexOf('-- BEGIN AUTHOR COMMIT')<body.indexOf('UPDATE canonical_v4.runtime_state SET revision=revision+1'));
 assert(body.indexOf('-- BEGIN AUTHOR REPLAY')<body.indexOf('RETURN v_receipt.response_text'));
 assert.match(sql,/REVOKE ALL ON FUNCTION canonical_v4\.named_share_insight/);assert.match(sql,/TO murmingle_app/);
});

test('new AI scope port reuses the exact normal lifecycle normalization and completed-result proof',async()=>{
 let normal,authored;const legacy=lifecycle({database:{async query(sql,p){normal=p;return {rows:[{response_text:JSON.stringify(result)}]};}},...dependencies});
 await legacy.command(expected,command,actor,proof);
 const repo=repository({database:{async query(sql,p){assert(sql.includes('named_share_insight'));authored=p;return {rows:[{result:JSON.stringify(result)}]};}},...dependencies});
 const r=await repo.shareInsight(JSON.stringify(request()));assert.deepEqual(r,result);assert(Object.isFrozen(r.result));
 assert.deepEqual(authored.slice(0,18),normal);assert.deepEqual(JSON.parse(authored[18]),scope);
});

test('request construction performs no IO, preserves input and produces immutable exact command parameters',()=>{
 const r=request(),before=structuredClone(r),p=prepare(r.expected,r.command,r.actor,r.proof,dependencies);
 assert.deepEqual(r,before);assert(Object.isFrozen(p.parameters));assert(Object.isFrozen(p.command));assert(Object.isFrozen(p.expected));
 assert.equal(p.parameters.length,18);assert.equal(p.parameters[6],'share-insight');assert.equal(p.parameters[15],'generated-root');
});

test('forged completion proof, missing origin and non-root AI commands cannot reach the authored root port',async()=>{
 let calls=0;const repo=repository({database:{async query(){calls++;assert.fail('invalid request reached SQL');}}});
 const forged=request();forged.proof.body+=' changed';await assert.rejects(repo.shareInsight(JSON.stringify(forged)),code('forbidden'));
 for(const change of [{type:'share-insight-reply'},{originSourceId:null},{originSourceId:'different-source'}]){
  const r=request();r.command={...r.command,...change};await assert.rejects(repo.shareInsight(JSON.stringify(r)),code('invalid'));
 }assert.equal(calls,0);
});

test('exact AI replay returns its original response even after unrelated catalog revisions',async()=>{
 const r=request();r.expected.revision=100;
 const repo=repository({database:{async query(){return {rows:[{result:JSON.stringify(result)}]};}}});assert.deepEqual(await repo.shareInsight(JSON.stringify(r)),result);
});

test('scope changes and corrupt generated results are explicit without importing a partial answer',async()=>{
 const conflict=repository({database:{async query(){throw Object.assign(Error('private SQL'),{code:'P1291'});}}});
 await assert.rejects(conflict.shareInsight(JSON.stringify(request())),e=>e.code==='conflict'&&!e.message.includes('private SQL'));
 for(const raw of ['{}',JSON.stringify({...result,version:{generation:'other',revision:8}}),JSON.stringify({...result,partial:true})]){
  const repo=repository({database:{async query(){return {rows:[{result:raw}]};}}});await assert.rejects(repo.shareInsight(JSON.stringify(request())),code('storage-corrupt'));
 }
});
