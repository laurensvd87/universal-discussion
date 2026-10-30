// Structural inverse and policy identity checks; SQL execution is separate.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {GENERAL_SUBJECT_POLICY_V2_HASH as oldHash,GENERAL_SUBJECT_POLICY_V3_HASH as nextHash} from '../../src/application/automatic-named-subject-plan.js';
const read=file=>readFile(new URL(file,import.meta.url),'utf8');
test('label-quality SQL preserves original publisher body except explicit supported policies and V3 label guard',async()=>{
 const base=await read('../canonical-v4/drafts/automatic-named-subjects.sql'),next=await read('../canonical-v4/drafts/named-subject-label-quality.sql');
 const old=base.slice(base.indexOf('CREATE FUNCTION canonical_v4.named_publish('),base.indexOf('CREATE FUNCTION canonical_v4.named_read_source('));
 const a=next.indexOf('CREATE OR REPLACE FUNCTION canonical_v4.named_publish('),b=next.indexOf('CREATE OR REPLACE FUNCTION canonical_v4.named_match_single_source(');
 const guard="  IF p->>'policyHash'='"+nextHash+"' AND canonical_v4.named_label_has_content(u_->>'label') IS DISTINCT FROM true THEN\n   RAISE EXCEPTION 'Content-free named label' USING ERRCODE='P1283';END IF;\n";
 let copy=next.slice(a,b-1);assert(copy.includes(guard));copy=copy.replace(guard,'').replace('CREATE OR REPLACE FUNCTION canonical_v4.named_publish(','CREATE FUNCTION canonical_v4.named_publish(')
  .replace("(p->>'policyHash' IN ('"+oldHash+"','"+nextHash+"')) IS DISTINCT FROM true","p->>'policyHash' IS DISTINCT FROM '"+oldHash+"'");
 assert.equal(copy,old);
});
test('single-source candidate and captured-candidate recheck support both exact policy identities without changing confidence or work bounds',async()=>{
 const base=await read('../canonical-v4/drafts/single-source-topic-match.sql'),next=await read('../canonical-v4/drafts/named-subject-label-quality.sql');
 const old=base.slice(base.indexOf('CREATE FUNCTION canonical_v4.named_match_single_source('),base.indexOf('END $match$;')+'END $match$;'.length);
 const start=next.indexOf('CREATE OR REPLACE FUNCTION canonical_v4.named_match_single_source('),end=next.indexOf('END $match$;',start)+'END $match$;'.length;
 const copy=next.slice(start,end).replace('CREATE OR REPLACE FUNCTION canonical_v4.named_match_single_source(','CREATE FUNCTION canonical_v4.named_match_single_source(')
  .replaceAll("h.policy_hash IN ('"+oldHash+"','"+nextHash+"')","h.policy_hash='"+oldHash+"'");assert.equal(copy,old);
});
test('SQL function-word vocabulary is exactly the new JS vocabulary and helper does not grant a new execute capability',async()=>{
 const algorithm=await read('../../experiments/automatic-topic-discovery-v3/focus-subjects.js'),sql=await read('../canonical-v4/drafts/named-subject-label-quality.sql'),words=new Set();
 for(const name of ['STOP','GENERIC_NAME_WORDS'])for(const word of new RegExp("const "+name+"=new Set\\('([^']+)'\\.split\\(' '\\)\\);",'u').exec(algorithm)[1].split(' '))words.add(word);
 const actual=[...sql.slice(0,sql.indexOf('$content$;')).matchAll(/'([a-z]+)'/gu)].map(m=>m[1]).filter(w=>w!=='');
 assert.deepEqual(new Set(actual),words);assert(sql.includes('normalize(p_label,NFKC)'));assert(sql.includes('REVOKE ALL ON FUNCTION canonical_v4.named_label_has_content(text) FROM PUBLIC;'));
 assert(!/GRANT\s+EXECUTE/iu.test(sql));
});
