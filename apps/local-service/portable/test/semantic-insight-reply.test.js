// Pure adapter/source checks, not executable SQL acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanonicalV4LifecycleRepository} from '../canonical-v4/lifecycle-repository.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const original=(await readFile(new URL('../canonical-v4/migrations/006-lifecycle-command-boundary.sql',import.meta.url),'utf8')).replace(/\r\n/g,'\n')
  .match(/CREATE FUNCTION canonical_v4\.runtime_lifecycle_command\([\s\S]*?\n\$runtime_lifecycle_command\$;/)[0];
const sql=(await readFile(new URL('../canonical-v4/migrations/016-semantic-insight-reply.sql',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const publication=()=>({semanticTarget:{nodeId:'games',topicId:'topic-a',rootRevision:2,targetRevision:3},
  evidence:{sourceId:'source-b',sourceVersion:'9223372036854775807',operationId:'operation-b',operationDigest:'a'.repeat(64),sourceStamp:'b'.repeat(64)},
  articleDigest:'c'.repeat(64),rootDigest:'d'.repeat(64),targetDigest:'e'.repeat(64),expiresAt:1800000});
const command=()=>({type:'share-insight-reply',topicId:'topic-a',discussionId:'discussion-a',rootId:'root-a',replyToId:'reply-a',
  body:'Exact generated result',operationId:'job-a',originSourceId:null,semanticPublication:publication()});
const actor={id:'demo-alex',type:'human',demo:true};
const proof=value=>({kind:'generated-insight',operationId:value.operationId,actorId:'demo-alex',topicId:value.topicId,
  originSourceId:value.originSourceId,body:value.body,rootId:value.rootId,replyToId:value.replyToId,discussionId:value.discussionId,
  ...(value.semanticPublication?{semanticPublication:value.semanticPublication}:{})});
function fixture(){const calls=[];return {calls,repo:createCanonicalV4LifecycleRepository({database:{async query(text,args){calls.push({text,args});
  return {rows:[{response_text:JSON.stringify({version:{generation:'generation',revision:8},result:{contributionId:'generated-reply'}})}]};}},
  nextId:()=> 'generated-reply',now:()=> '2026-10-27T12:00:00.000Z'})};}

test('016 inverse is byte-exact006 except five closed additive blocks and CREATE OR REPLACE',()=>{
  const body=sql.match(/CREATE OR REPLACE FUNCTION canonical_v4\.runtime_lifecycle_command\([\s\S]*?\n\$runtime_lifecycle_command\$;/)[0];
  const blocks=[...body.matchAll(/^  -- BEGIN SEMANTIC ([A-Z_]+)\n[\s\S]*?^  -- END SEMANTIC \1\n/gm)];
  assert.deepEqual(blocks.map(match=>match[1]),['DECLARATIONS','MATERIAL','EVIDENCE_LOCKS','TARGET_FENCE','FINAL_EXPIRY']);
  const inverse=body.replace(/^  -- BEGIN SEMANTIC ([A-Z_]+)\n[\s\S]*?^  -- END SEMANTIC \1\n/gm,'').replace('CREATE OR REPLACE FUNCTION','CREATE FUNCTION');
  assert.equal(inverse,original);assert.equal(sha(inverse),sha(original));
  assert.doesNotMatch(body,/CREATE TABLE|ALTER TABLE|GRANT |CREATE POLICY|semantic_installation/);
  assert.match(sql,/REVOKE ALL ON FUNCTION canonical_v4\.semantic_insight_evidence\(text\) FROM PUBLIC/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION canonical_v4\.semantic_insight_evidence\(text\) TO murmingle_app/);
});

test('016 replay precedes evidence locks and revision/membership/expiry fence follows target locks',()=>{
  const replay=sql.indexOf('RETURN v_receipt.response_text;'),evidence=sql.indexOf('-- BEGIN SEMANTIC EVIDENCE_LOCKS'),
    root=sql.indexOf('SELECT * INTO v_root'),target=sql.indexOf('SELECT * INTO v_target'),fence=sql.indexOf('-- BEGIN SEMANTIC TARGET_FENCE');
  assert.ok(replay<evidence&&evidence<root&&root<target&&target<fence);
  const watermark=sql.lastIndexOf('UPDATE canonical_v4.runtime_state'),expiry=sql.indexOf('-- BEGIN SEMANTIC FINAL_EXPIRY'),receipt=sql.lastIndexOf('UPDATE canonical_v4.command_receipts');
  assert.ok(watermark<expiry&&expiry<receipt);
  for(const literal of ['semantic_verify_current_source','v_evidence_source.write_version','v_evidence_operation.operation_digest',
    'v_root.revision_count','v_target.revision_count','semantic_root_snapshots','semantic_root_edges','s.generation=p_generation',
    's.discussion_id=v_discussion.id','clock_timestamp()',"v_publication->>'rootDigest'","v_publication->>'targetDigest'"])
    assert.ok(sql.includes(literal),literal);
});

test('lifecycle binds semantic publication immutably into request, proof and unchanged18 parameters',async()=>{
  const f=fixture(),value=command(),before=structuredClone(value);await f.repo.command({generation:'generation',revision:7},value,actor,proof(value));
  assert.deepEqual(value,before);const args=f.calls[0].args;assert.equal(args.length,18);
  assert.equal(args[2],sha(args[3]));assert.deepEqual(JSON.parse(args[3]).command.semanticPublication,before.semanticPublication);
  assert.deepEqual(JSON.parse(args[17]).semanticPublication,before.semanticPublication);assert.equal(args[12],null);
  const old=command();delete old.semanticPublication;const legacy=fixture();await legacy.repo.command({generation:'generation',revision:7},old,actor,proof(old));
  assert.equal(legacy.calls[0].args[3],JSON.stringify({generation:'generation',revision:7,command:old}));
});

test('lifecycle rejects malformed or mismatched semantic publication before SQL',async()=>{
  for(const mutate of [p=>p.evidence.sourceVersion='01',p=>p.evidence.sourceVersion='9223372036854775808',
    p=>p.semanticTarget.rootRevision=0,p=>p.articleDigest='secret',p=>p.expiresAt=Infinity,p=>p.extra=true]){
    const f=fixture(),value=command();mutate(value.semanticPublication);
    await assert.rejects(f.repo.command({generation:'generation',revision:7},value,actor,proof(value)));assert.equal(f.calls.length,0);
  }
  const f=fixture(),value=command(),forged=proof(value);forged.semanticPublication=structuredClone(value.semanticPublication);forged.semanticPublication.expiresAt++;
  await assert.rejects(f.repo.command({generation:'generation',revision:7},value,actor,forged));assert.equal(f.calls.length,0);
});
