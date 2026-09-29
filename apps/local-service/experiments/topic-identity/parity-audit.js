// Tokenization only. No model initialization or inference, input mutation or network.
import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { corpus } from './corpus.js';
import { digest, validateCorpus, inputFor } from './evaluate.js';
import { buildTopicInput } from '../../../../spikes/topic-resolution/experiments/topic-input/browser/core/topic-input.js';
import { readAssetManifest, prefixTokenInput } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const expectedDigest='0487d1866c1dc115939fc996a363881997921ab49969116337cfabb0135f2950';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function bytes(relative,max) {
  const url=new URL(relative,import.meta.url), info=await lstat(url);
  if(!info.isFile() || info.isSymbolicLink() || info.size>max) throw new Error('Invalid parity audit file');
  const value=await readFile(url);
  if(value.length>max) throw new Error('Parity audit file bound');
  return value;
}
if(process.argv.length!==2) throw new Error('No parity audit arguments accepted');
validateCorpus(corpus);
if(digest(corpus)!==expectedDigest) throw new Error('Frozen corpus mismatch');
const base='../../../../spikes/topic-resolution/browser/embedding/.assets/';
const manifest=readAssetManifest(JSON.parse(await bytes(base+'manifest.json',16384)));
const verified=new Map();
for(const filename of ['tokenizers.mjs','tokenizer.json','tokenizer_config.json']) {
  const spec=manifest.get(filename), value=await bytes(base+filename,spec.bytes);
  if(value.length!==spec.bytes || sha(value)!==spec.sha256) throw new Error('Pinned tokenizer integrity mismatch');
  verified.set(filename,value);
}
const {Tokenizer}=await import('../../../../spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs');
const tokenizer=new Tokenizer(JSON.parse(verified.get('tokenizer.json')),JSON.parse(verified.get('tokenizer_config.json')));
const rows=corpus.documents.map(doc=>{
  const experiment=inputFor(doc,'title-lead');
  const production=buildTopicInput({title:doc.title,text:doc.body,extractorVersion:'article-title-lead/v1'});
  const a=prefixTokenInput(tokenizer,experiment), b=prefixTokenInput(tokenizer,production);
  return {id:doc.id,stringIdentical:experiment===production,tokenIdsIdentical:JSON.stringify(a.ids)===JSON.stringify(b.ids),
    experimentTokens:a.ids.length,productionTokens:b.ids.length};
});
process.stdout.write(JSON.stringify({corpusDigest:expectedDigest,
  productionHelperSha256:sha(await bytes('../../../../spikes/topic-resolution/experiments/topic-input/browser/core/topic-input.js',16384)),
  productionPolicySha256:sha(await bytes('../../../../spikes/topic-resolution/experiments/topic-input/browser/core/page-content-policy.js',16384)),
  tokenizerSha256:manifest.get('tokenizer.json').sha256,
  documentCount:rows.length,stringIdenticalCount:rows.filter(r=>r.stringIdentical).length,
  tokenIdsIdenticalCount:rows.filter(r=>r.tokenIdsIdentical).length,
  modelLoads:0,inferences:0,rows})+'\n');
