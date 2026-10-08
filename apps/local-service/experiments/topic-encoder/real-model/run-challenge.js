// One-shot, frozen-artifact comparison. No training, tuning or model writing.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { encodeRealPage } from './model.js';
import { strictValidationThreshold, evaluateLabeled } from './evaluation.js';

const SHA={
  validation:'71bd27e34e48ccc239199559e0fe61c5de556860e9fde74d20f3fd27439cdd3e',
  lunaMap:'155cfb0f16ec5f0de08ab576345f03d5c7e8882b59d70b81c24c0bcaf56db036',
  challenge:'3037887840d52e38c397eea20d0032d8c77343bb146a6ad65c69db890d804006',
  challengeMap:'0219fc75502c53f91b35a2d7490362b39549c05c3df4229420c9103f404deaee',
  cdecModel:'b0b803608a21d810c9342fcf2c52893772361fb139d12679420dc4ef9c24b9e7',
  lunaModel:'2a8386063640f46895a34abdd2f218819c3c73e83e82cb94c1748a7d6aebcab0',
};
const digest=value=>createHash('sha256').update(value).digest('hex');
async function pinned(url,sha,maxBytes) {
  const bytes=await readFile(new URL(url,import.meta.url));
  if(bytes.length>maxBytes||digest(bytes)!==sha) throw new Error(`Pinned input mismatch: ${url}`);
  return bytes;
}
function parseLines(bytes,count,prefix) {
  const lines=bytes.toString('utf8').trim().split(/\r?\n/u);
  if(lines.length!==count) throw new Error('Unexpected frozen article count');
  const ids=new Set();
  return lines.map(line=>{
    const doc=JSON.parse(line);
    if(typeof doc.id!=='string'||!doc.id||ids.has(doc.id)||
      typeof doc.title!=='string'||!doc.title.trim()||doc.title.length>200||
      typeof doc.body!=='string'||doc.body.length<40||doc.body.length>4096||
      typeof doc.family!=='string'||!doc.family||
      typeof doc.topicLabel!=='string'||!doc.topicLabel||
      typeof doc.viewpoint!=='string'||!doc.viewpoint)
      throw new Error('Invalid frozen article');
    ids.add(doc.id);return {...doc,id:`${prefix}:${doc.id}`};
  });
}
function mapped(docs,body,titleLead,model) {
  return new Map(docs.map(doc=>[doc.id,
    encodeRealPage(doc,body.get(doc.id),titleLead.get(doc.id),model)]));
}
async function main() {
  if(process.argv.length!==2) throw new Error('No arguments accepted');
  const [validationBytes,lunaMapBytes,challengeBytes,challengeMapBytes,
    cdecBytes,lunaBytes]=await Promise.all([
      pinned('../luna-corpus/validation.jsonl',SHA.validation,512*1024),
      pinned('../luna-corpus/broad-families.json',SHA.lunaMap,32768),
      pinned('../luna-corpus/challenge.jsonl',SHA.challenge,512*1024),
      pinned('../luna-corpus/challenge-broad-families.json',SHA.challengeMap,32768),
      pinned('./model.generated.json',SHA.cdecModel,256*1024),
      pinned('./model.luna.generated.json',SHA.lunaModel,256*1024),
    ]);
  const validation=parseLines(validationBytes,20,'validation');
  const challenge=parseLines(challengeBytes,56,'challenge');
  const lunaMap=JSON.parse(lunaMapBytes.toString('utf8'));
  const challengeMap=JSON.parse(challengeMapBytes.toString('utf8'));
  if(lunaMap?.schemaVersion!==1||!Array.isArray(lunaMap.groups)||
    challengeMap?.schemaVersion!==1||!Array.isArray(challengeMap.groups))
    throw new Error('Invalid broad-family metadata');
  const mapping=new Map();
  for(const group of lunaMap.groups) if(group.split==='validation') {
    for(const family of group.topicFamilies??[]) {
      if(mapping.has(family)) throw new Error('Duplicate validation family map');
      mapping.set(family,group.broadFamily);
    }
  }
  const validationMapped=validation.map(doc=>{
    const broad=mapping.get(doc.family);
    if(typeof broad!=='string'||!broad) throw new Error('Missing validation broad family');
    return {...doc,family:broad};
  });
  // Challenge rows already contain broad family; the separately frozen map is
  // integrity checked and must cover the named broad families.
  const challengeFamilies=new Set(challenge.map(doc=>doc.family));
  const challengeGroups=new Map();
  for(const group of challengeMap.groups) {
    if(typeof group.family!=='string'||!group.family||challengeGroups.has(group.family)||
      !Array.isArray(group.topicLabels)||group.topicLabels.length<1)
      throw new Error('Invalid challenge broad-family group');
    challengeGroups.set(group.family,new Set(group.topicLabels));
  }
  if([...challengeFamilies].some(family=>!challengeGroups.has(family))||
    challenge.some(doc=>!challengeGroups.get(doc.family)?.has(doc.topicLabel)))
    throw new Error('Challenge broad-family map does not cover rows');
  if(validationMapped.some(doc=>challengeFamilies.has(doc.family)))
    throw new Error('Challenge/validation family leakage');
  const cdecModel=JSON.parse(cdecBytes.toString('utf8'));
  const lunaModel=JSON.parse(lunaBytes.toString('utf8'));
  const docs=[...validationMapped,...challenge],started=performance.now();
  const {vectors:body,elapsedMs:bodyMs,assets}=await embedDocuments(docs,'body');
  const {vectors:titleLead,elapsedMs:titleLeadMs}=await embedDocuments(docs,'title-lead');
  if(cdecModel.baseModelSha256!==assets.modelSha256||
    lunaModel.baseModelSha256!==assets.modelSha256)
    throw new Error('Frozen model base E5 mismatch');
  const methods={rawE5Body:body,rawE5TitleLead:titleLead,
    cdecTrained:mapped(docs,body,titleLead,cdecModel),
    lunaTrained:mapped(docs,body,titleLead,lunaModel)};
  const results={};
  for(const [name,vectors] of Object.entries(methods)) {
    const selected=strictValidationThreshold(validationMapped,vectors);
    results[name]={validation:selected,
      challenge:evaluateLabeled(challenge,vectors,selected.threshold)};
  }
  process.stdout.write(`${JSON.stringify({schema:'frozen-luna-independent-challenge/v1',
    inputSha256:SHA,articles:{validation:validationMapped.length,challenge:challenge.length},
    timingMs:{e5Body:bodyMs,e5TitleLead:titleLeadMs,total:performance.now()-started},
    results},null,2)}\n`);
}
main().catch(error=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1;});
