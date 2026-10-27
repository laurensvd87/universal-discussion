// Pure adapter and mechanical SQL-source checks. No DB/native/model execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanonicalV4RuntimeRepository} from '../canonical-v4/runtime-repository.js';
import {readCommand} from '../../../../spikes/topic-resolution/browser/core/local-service-contract.js';
import {createLocalServiceClient} from '../../../../spikes/topic-resolution/browser/core/local-service-client.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const raw003=await readFile(new URL('../canonical-v4/migrations/003-execute-only-command-boundary.sql',import.meta.url));
const sql=await readFile(new URL('../canonical-v4/migrations/015-semantic-reply-witness.sql',import.meta.url),'utf8');
const original=raw003.toString('utf8').replace(/\r\n/g,'\n').match(/CREATE FUNCTION canonical_v4\.runtime_prepare_command\([\s\S]*?\n\$runtime_prepare_command\$;/)[0];
const current=sql.match(/CREATE OR REPLACE FUNCTION canonical_v4\.runtime_prepare_command\([\s\S]*?\n\$runtime_prepare_command\$;/)[0];
const edits=[
 [
  `CREATE FUNCTION canonical_v4.runtime_prepare_command(`,
  `CREATE OR REPLACE FUNCTION canonical_v4.runtime_prepare_command(`
 ],
 [
  `  v_material jsonb;`,
  `  v_material jsonb;
  v_semantic_target jsonb;`
 ],
 [
  `  IF v_material IS DISTINCT FROM v_expected_material`,
  `  -- Optional semantic provenance is part of the exact command material, never
  -- a selector that rewrites the canonical destination or captured Source.
  IF (v_material->'command') ? 'semanticTarget' THEN
    v_semantic_target := v_material->'command'->'semanticTarget';
    IF p_command_type<>'reply' OR p_reply_to_id IS NULL OR
        jsonb_typeof(v_semantic_target) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid semantic reply witness' USING ERRCODE = 'P1003';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(v_semantic_target))<>4 OR
        NOT (v_semantic_target ?& ARRAY['nodeId','topicId','rootRevision','targetRevision']) OR
        jsonb_typeof(v_semantic_target->'nodeId') IS DISTINCT FROM 'string' OR
        jsonb_typeof(v_semantic_target->'topicId') IS DISTINCT FROM 'string' OR
        jsonb_typeof(v_semantic_target->'rootRevision') IS DISTINCT FROM 'number' OR
        jsonb_typeof(v_semantic_target->'targetRevision') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Invalid semantic reply witness' USING ERRCODE = 'P1003';
    END IF;
    IF NOT canonical_v4.runtime_safe_text(v_semantic_target->>'nodeId',160,false) OR
        NOT canonical_v4.runtime_safe_text(v_semantic_target->>'topicId',128,false) OR
        (v_semantic_target->>'rootRevision')::numeric NOT BETWEEN 1 AND 9007199254740991 OR
        (v_semantic_target->>'targetRevision')::numeric NOT BETWEEN 1 AND 9007199254740991 OR
        trunc((v_semantic_target->>'rootRevision')::numeric)<>(v_semantic_target->>'rootRevision')::numeric OR
        trunc((v_semantic_target->>'targetRevision')::numeric)<>(v_semantic_target->>'targetRevision')::numeric THEN
      RAISE EXCEPTION 'Invalid semantic reply witness' USING ERRCODE = 'P1003';
    END IF;
    v_expected_material := jsonb_set(v_expected_material,'{command,semanticTarget}',v_semantic_target);
  END IF;
  IF v_material IS DISTINCT FROM v_expected_material`
 ],
 [
  `  IF p_origin_source_id IS NOT NULL THEN
    v_historical_origin :=`,
  `  -- Exact receipt replay above precedes this freshness fence. Root/target
  -- locks already protect visibility and body revision counts. Source forget
  -- locks the root before deleting its historical snapshot/edges; no new Source
  -- or current-head locks are taken here, and retired matcher paths remain valid.
  IF v_semantic_target IS NOT NULL THEN
    IF v_root.withdrawn OR v_target.withdrawn OR
        v_root.visibility IS DISTINCT FROM 'local-public' OR v_target.visibility IS DISTINCT FROM 'local-public' OR
        v_root.revision_count IS DISTINCT FROM (v_semantic_target->>'rootRevision')::bigint OR
        v_target.revision_count IS DISTINCT FROM (v_semantic_target->>'targetRevision')::bigint OR
        v_topic.id IS DISTINCT FROM v_semantic_target->>'topicId' OR
        v_root.discussion_id IS DISTINCT FROM v_discussion.id OR v_target.discussion_id IS DISTINCT FROM v_discussion.id OR
        NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_root_snapshots s
          JOIN canonical_v4.semantic_root_edges e ON e.root_id=s.root_id AND e.root_ordinal=s.root_ordinal
          WHERE s.root_id=v_root.id AND s.generation=p_generation AND s.root_ordinal=v_root.ordinal
            AND s.topic_id=v_topic.id AND s.discussion_id=v_discussion.id AND e.node_id=v_semantic_target->>'nodeId') THEN
      RAISE EXCEPTION 'Semantic reply target changed' USING ERRCODE = 'P1001';
    END IF;
  END IF;

  IF p_origin_source_id IS NOT NULL THEN
    v_historical_origin :=`
 ]
];
const header="-- Unregistered optional semantic reply witness. The original003 command\n-- boundary, signature and grants remain; only the witness shape/material and\n-- post-lock historical edge/body-revision fence are additive. No head/Source\n-- locks, canonical retargeting, new worker port or registration is introduced.\n";
function replaceOnce(value,from,to){assert.equal(value.split(from).length,2);return value.replace(from,to);}
const generation='semantic-command-generation';
const witness=()=>({nodeId:'semantic:long-node-'+ 'x'.repeat(141),topicId:'canonical-topic-a',rootRevision:2,targetRevision:3});
const reply=()=>({type:'reply',discussionId:'canonical-discussion-a',rootId:'root-a',replyToId:'reply-a',body:'Invented reply',originSourceId:null});
const request=command=>({actorId:'demo-alex',requestId:'request-a',expected:{generation,revision:1},command});
function fixture({pause=null}={}){
 const calls=[];let transactions=0;
 const database={query:()=>assert.fail('No unscoped query'),transaction:async work=>{transactions++;if(pause)await pause;
  return work({query:async(sql,args)=>{calls.push({sql,args});return {rows:[{response_text:JSON.stringify({version:{generation,revision:9},discussionVersion:2,result:{contributionId:'created-reply'}})}]};}});}};
 return {calls,get transactions(){return transactions;},repo:createCanonicalV4RuntimeRepository({database,nextId:()=> 'invented-contribution',now:()=> '2026-10-27T12:00:00.000Z'})};
}

test('015 mechanically recovers exact003 through only replacement syntax and three additive witness blocks',()=>{
 assert.equal(sha(raw003),'73ad49af4dccc1895ef80a514d4be36de08fda6ab7d71e9cffc43f0c16c69f42');
 let inverse=current;for(const [from,to] of [...edits].reverse())inverse=replaceOnce(inverse,to,from);assert.equal(inverse,original);
 let forward=original;for(const [from,to]of edits)forward=replaceOnce(forward,from,to);assert.equal(forward,current);
 assert.equal(sql,header+current+'\n');assert.doesNotMatch(sql,/GRANT|REVOKE|schema_migrations|set_config\(/u);
});

test('source ordering binds witness before full material/hash checks and replays exact receipts before freshness',()=>{
 const material=current.indexOf("v_expected_material := jsonb_set(v_expected_material,'{command,semanticTarget}',v_semantic_target)");
 const digest=current.indexOf('IF v_material IS DISTINCT FROM v_expected_material');
 const replay=current.indexOf('RETURN QUERY SELECT true,v_receipt.response_text');
 const rootLock=current.indexOf('WHERE id=p_root_id FOR SHARE'),targetLock=current.indexOf('WHERE id=p_reply_to_id FOR SHARE');
 const fresh=current.indexOf('IF v_semantic_target IS NOT NULL THEN');
 assert.ok(material>0&&material<digest&&digest<replay&&replay<rootLock&&rootLock<targetLock&&targetLock<fresh);
 const block=edits[3][1].slice(0,-edits[3][0].length);
 for(const literal of ['v_root.revision_count','v_target.revision_count',"'local-public'",'s.generation=p_generation','s.root_ordinal=v_root.ordinal',
  's.topic_id=v_topic.id','s.discussion_id=v_discussion.id',"e.node_id=v_semantic_target->>'nodeId'"])assert.ok(block.includes(literal),literal);
 assert.doesNotMatch(block,/FOR (SHARE|UPDATE)|FROM canonical_v4\.sources|semantic_installation/u);
});

test('absent witness retains exact legacy request bytes and the unchanged fourteen-argument SQL signature',async()=>{
 const f=fixture(),command=reply();await f.repo.command(request(command));
 const args=f.calls[0].args;assert.equal(args.length,14);assert.equal(args[3],JSON.stringify({generation,command}));assert.equal(args[2],sha(args[3]));
 assert.equal(args[9],'reply-a');assert.equal(args[6],null);assert.equal(Object.hasOwn(JSON.parse(args[3]).command,'semanticTarget'),false);
 assert.deepEqual(readCommand(command),command);
});

test('normalized immutable witness binds every field and exact replay ignores unrelated observed revision growth',async()=>{
 const f=fixture(),command={...reply(),semanticTarget:witness()};await f.repo.command(request(command));
 const material=f.calls[0].args[3];assert.equal(JSON.parse(material).command.semanticTarget.nodeId.length,160);
 const next=request({...reply(),semanticTarget:{targetRevision:3,rootRevision:2,topicId:'canonical-topic-a',nodeId:witness().nodeId}});next.expected.revision=77;
 const outcome=await f.repo.command(next);assert.equal(f.calls[1].args[3],material);assert.equal(f.calls[1].args[2],f.calls[0].args[2]);assert.equal(outcome.result.contributionId,'created-reply');
 for(const change of [{nodeId:'different-semantic-node'},{topicId:'different-canonical-topic'},{rootRevision:4},{targetRevision:4}]){
  await f.repo.command(request({...reply(),semanticTarget:{...witness(),...change}}));assert.notEqual(f.calls.at(-1).args[2],f.calls[0].args[2]);
 }
 const browser=readCommand(command);assert.ok(Object.isFrozen(browser.semanticTarget));command.semanticTarget.topicId='changed-caller';assert.equal(browser.semanticTarget.topicId,'canonical-topic-a');
});

test('caller mutation after normalization cannot change queued material or its witness',async()=>{
 let resolve;const gate=new Promise(done=>{resolve=done;}),f=fixture({pause:gate}),command={...reply(),semanticTarget:witness()};
 const work=f.repo.command(request(command));command.semanticTarget.targetRevision=99;command.body='Changed after normalization';resolve();await work;
 const normalized=JSON.parse(f.calls[0].args[3]).command;assert.equal(normalized.semanticTarget.targetRevision,3);assert.equal(normalized.body,'Invented reply');
});

test('strict optional witness shape and positive numeric revisions reject before SQL in both adapters',async()=>{
 const mutations=[v=>{delete v.topicId;},v=>{v.extra=true;},v=>{v.nodeId='x'.repeat(161);},v=>{v.topicId='x'.repeat(129);},
  v=>{v.rootRevision=0;},v=>{v.rootRevision=-1;},v=>{v.rootRevision=1.5;},v=>{v.targetRevision=NaN;},
  v=>{v.targetRevision=Number.MAX_SAFE_INTEGER+1;},v=>{v.targetRevision='3';},v=>{v.targetRevision=true;}];
 for(const change of mutations){const value=witness();change(value);const command={...reply(),semanticTarget:value},f=fixture();
  assert.throws(()=>readCommand(command),TypeError);await assert.rejects(f.repo.command(request(command)),e=>e.code==='invalid');assert.equal(f.transactions,0);}
 for(const value of [null,undefined,[],4]){const command={...reply(),semanticTarget:value},f=fixture();assert.throws(()=>readCommand(command),TypeError);
  await assert.rejects(f.repo.command(request(command)),e=>e.code==='invalid');assert.equal(f.transactions,0);}
 const implicit={...reply(),replyToId:null,semanticTarget:witness()},f=fixture();assert.throws(()=>readCommand(implicit),TypeError);
 await assert.rejects(f.repo.command(request(implicit)),e=>e.code==='invalid');assert.equal(f.transactions,0);
 const create={type:'create-root',topicId:'canonical-topic-a',body:'Root',semanticTarget:witness()};assert.throws(()=>readCommand(create),TypeError);
 await assert.rejects(f.repo.command(request(create)),e=>e.code==='invalid');
});

test('accessor witnesses are refused without getters; Node witness proxies cannot invoke hooks',async()=>{
 let hooks=0;const value=witness();Object.defineProperty(value,'nodeId',{enumerable:true,get(){hooks++;return 'unsafe';}});
 const command={...reply(),semanticTarget:value},f=fixture();assert.throws(()=>readCommand(command),TypeError);
 await assert.rejects(f.repo.command(request(command)),e=>e.code==='invalid');assert.equal(hooks,0);assert.equal(f.transactions,0);
 const proxy=new Proxy(witness(),{getPrototypeOf(){hooks++;throw Error('Hook');}});
 await assert.rejects(f.repo.command(request({...reply(),semanticTarget:proxy})),e=>e.code==='invalid');assert.equal(hooks,0);
});

test('existing browser command transport forwards only the normalized witness with canonical target IDs',async()=>{
 let sent;const client=createLocalServiceClient({getToken:()=> 'synthetic-semantic-reply-pairing-token',fetchImpl:async(url,options)=>{
  assert.equal(url,'http://127.0.0.1:4174/v1/commands');sent=JSON.parse(options.body);
  return new Response(JSON.stringify({version:{generation,revision:2},result:{contributionId:'created-reply'}}),{headers:{'content-type':'application/json'}});
 }});
 await client.command({generation,revision:1},{...reply(),semanticTarget:witness()},'demo-alex');
 assert.deepEqual(sent.command,{...reply(),semanticTarget:witness()});assert.equal(sent.command.originSourceId,null);
});
