// Single-pass title+lead E5 head. Only CDEC train inventory and frozen Luna
// train/validation JSONL are read. No test or challenge document is opened.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { readCdecArchive } from '../next-eval/cdec-archive.js';
import { embedDocuments } from '../e5-infer.js';
import { encodeSinglePage, trainSingleEncoder } from './single.js';
import { strictValidationThreshold } from './evaluation.js';

const CDEC_SHA='7d5b1790145fc0603913aa24b60ce1bd8104196191289363fb6e2eb73c8d346d';
const LUNA_SHA={train:'2f229a606e9eaad34eb35a6b908d3f3321ba825da8a1e68494f6710f0dd89d27',
  validation:'71bd27e34e48ccc239199559e0fe61c5de556860e9fde74d20f3fd27439cdd3e'};
const BROAD_SHA='155cfb0f16ec5f0de08ab576345f03d5c7e8882b59d70b81c24c0bcaf56db036';
const digest=value=>createHash('sha256').update(value).digest('hex');

async function cdecSplits() {
  const archive=await readFile(new URL('../.work/cdec-wn-dataset.tar.gz',import.meta.url));
  if(archive.length!==573230||digest(archive)!==CDEC_SHA)
    throw new Error('CDEC archive integrity mismatch');
  const files=readCdecArchive(archive);
  const inventory=files.get('dataset_splits/train_subtopics.txt');
  if(!inventory) throw new Error('Missing CDEC train inventory');
  const groups=inventory.toString('utf8').trim().split(/\r?\n/u).map(row=>row.split(' '));
  if(groups.length!==40||groups.some(group=>group.length<3||group.length>4))
    throw new Error('Unexpected CDEC train inventory');
  const train=[],validation=[];
  for(let group=0;group<groups.length;group++) for(const id of groups[group]) {
    if(!/^\d+$/u.test(id)) throw new Error('Invalid CDEC ID');
    const bytes=files.get(`dataset_docs/${id}.json`);
    if(!bytes||bytes.length>100000) throw new Error('Missing CDEC train page');
    const source=JSON.parse(bytes.toString('utf8'));
    if(typeof source.text!=='string'||source.text.length<100||source.text.length>100000)
      throw new Error('Invalid CDEC train page');
    const title=source.text.split(/\r?\n/u,1)[0].trim();
    if(!title||title.length>200) throw new Error('Invalid CDEC title');
    (group%5===0?validation:train).push({id:`cdec:${id}`,
      family:`cdec:group:${group}`,topicLabel:`cdec:story:${group}`,
      title,body:source.text.slice(0,1024)});
  }
  if(train.length!==102||validation.length!==26) throw new Error('Invalid CDEC count');
  return {train,validation};
}

async function lunaSplits() {
  const [trainBytes,valBytes,mapBytes]=await Promise.all([
    readFile(new URL('../luna-corpus/train.jsonl',import.meta.url)),
    readFile(new URL('../luna-corpus/validation.jsonl',import.meta.url)),
    readFile(new URL('../luna-corpus/broad-families.json',import.meta.url)),
  ]);
  if(digest(trainBytes)!==LUNA_SHA.train||digest(valBytes)!==LUNA_SHA.validation||
    digest(mapBytes)!==BROAD_SHA) throw new Error('Frozen Luna train/validation integrity mismatch');
  const map=JSON.parse(mapBytes.toString('utf8'));
  if(map?.schemaVersion!==1||!Array.isArray(map.groups)) throw new Error('Invalid broad map');
  const families=new Map();
  for(const group of map.groups) {
    if(!['train','validation'].includes(group.split)) continue;
    if(typeof group.broadFamily!=='string'||!Array.isArray(group.topicFamilies))
      throw new Error('Invalid broad group');
    for(const family of group.topicFamilies) {
      if(families.has(family)) throw new Error('Duplicate broad family');
      families.set(family,{split:group.split,broadFamily:group.broadFamily});
    }
  }
  function parse(bytes,split,count) {
    const lines=bytes.toString('utf8').trim().split(/\r?\n/u);
    if(lines.length!==count) throw new Error('Invalid Luna split count');
    return lines.map(line=>{
      const doc=JSON.parse(line),assigned=families.get(doc.family);
      if(doc.split!==split||!assigned||assigned.split!==split||
        typeof doc.title!=='string'||typeof doc.body!=='string')
        throw new Error('Invalid Luna split or broad label');
      return {id:`luna:${doc.id}`,family:`luna:${assigned.broadFamily}`,
        topicLabel:`luna:${doc.topicLabel}`,title:doc.title,body:doc.body};
    });
  }
  const train=parse(trainBytes,'train',80),validation=parse(valBytes,'validation',20);
  const all=[...train,...validation];
  if(new Set(all.map(doc=>doc.id)).size!==all.length) throw new Error('Duplicate Luna ID');
  const broadTrain=new Set(train.map(doc=>doc.family));
  if(validation.some(doc=>broadTrain.has(doc.family))) throw new Error('Broad-family split leakage');
  return {train,validation};
}

function mapped(documents,vectors,model) {
  return new Map(documents.map(doc=>[doc.id,encodeSinglePage(doc,vectors.get(doc.id),model)]));
}

async function main() {
  if(process.argv.length!==2) throw new Error('No arguments accepted');
  const [cdec,luna]=await Promise.all([cdecSplits(),lunaSplits()]);
  const train=[...cdec.train,...luna.train],validation=[...cdec.validation,...luna.validation];
  const {vectors,elapsedMs,assets}=await embedDocuments([...train,...validation],'title-lead');
  const model=trainSingleEncoder(train,vectors,[
    {documents:cdec.validation,vectors},{documents:luna.validation,vectors}]);
  const {trainingMs,...frozen}=model;
  const artifact={...frozen,baseModelSha256:assets.modelSha256,
    cdecTrainArchiveSha256:CDEC_SHA,lunaTrainSha256:LUNA_SHA.train,
    lunaValidationSha256:LUNA_SHA.validation,broadFamilyMapSha256:BROAD_SHA,
    provenance:'CDEC-WN train groups and frozen Luna synthetic train/validation only'};
  const mappedVectors=mapped(validation,vectors,artifact);
  const cutoffs={};
  for(const [name,docs] of [['cdec',cdec.validation],['luna',luna.validation]])
    cutoffs[name]={rawTitleLead:strictValidationThreshold(docs,vectors),
      trained:strictValidationThreshold(docs,mappedVectors)};
  const baseline=model.validationBaseline,selected=model.validation;
  const improved=selected.every((row,i)=>row.hits>=baseline[i].hits)&&
    (cutoffs.cdec.trained.validationAccepted>=cutoffs.cdec.rawTitleLead.validationAccepted)&&
    (cutoffs.luna.trained.validationAccepted>cutoffs.luna.rawTitleLead.validationAccepted);
  const artifactText=`${JSON.stringify({...artifact,promotionGatePassed:improved})}\n`;
  await writeFile(new URL('./model.single.generated.json',import.meta.url),artifactText);
  process.stdout.write(`${JSON.stringify({schema:model.schema,trainingDocuments:train.length,
    validationDocuments:validation.length,baseE5Ms:elapsedMs,trainingMs,
    artifactSha256:digest(artifactText),artifactBytes:Buffer.byteLength(artifactText),
    bestEpoch:model.bestEpoch,epochsRun:model.epochsRun,triplets:model.triplets,
    validationBaseline:baseline,validation:model.validation,cutoffs,
    promotionGatePassed:improved,
    decision:improved?'eligible for one frozen challenge score':'validation did not beat raw title+lead E5; do not promote'},null,2)}\n`);
}
main().catch(error=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1;});
