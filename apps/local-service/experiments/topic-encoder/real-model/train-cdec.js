// Reproducible local training on CDEC-WN's TRAIN split only. No test text is
// parsed, emitted, persisted or used for model choice.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { readCdecArchive } from '../next-eval/cdec-archive.js';
import { trainRealEncoder, encodeRealPage } from './model.js';

const ARCHIVE_SHA256='7d5b1790145fc0603913aa24b60ce1bd8104196191289363fb6e2eb73c8d346d';
const digest=value=>createHash('sha256').update(value).digest('hex');

function loadTrain(files) {
  const inventory=files.get('dataset_splits/train_subtopics.txt');
  if (!inventory) throw new Error('Missing CDEC training inventory');
  const groups=inventory.toString('utf8').trim().split(/\r?\n/u).map(row=>row.split(' '));
  if (groups.length!==40 || groups.some(group=>group.length<3||group.length>4||
    group.some(id=>!/^\d+$/u.test(id)))) throw new Error('Unexpected CDEC training inventory');
  const training=[],validation=[];
  for (let group=0;group<groups.length;group++) for (const id of groups[group]) {
    const bytes=files.get(`dataset_docs/${id}.json`);
    if (!bytes||bytes.length>100000) throw new Error('Missing CDEC training page');
    const source=JSON.parse(bytes.toString('utf8'));
    if (typeof source.text!=='string'||source.text.length<100||source.text.length>100000)
      throw new Error('Invalid CDEC page');
    const title=source.text.split(/\r?\n/u,1)[0].trim();
    if (!title||title.length>200) throw new Error('Invalid CDEC title');
    const doc={id,family:`CDEC-train-group-${group}`,
      topicLabel:`CDEC-train-storyline-${group}`,title,body:source.text.slice(0,1024)};
    (group%5===0?validation:training).push(doc);
  }
  if (training.length+validation.length!==128||
    new Set([...training,...validation].map(doc=>doc.id)).size!==128)
    throw new Error('Unexpected CDEC training count');
  return {training,validation};
}

function rank(documents,body,titleLead,model) {
  const vectors=documents.map(doc=>model?
    encodeRealPage(doc,body.get(doc.id),titleLead.get(doc.id),model):titleLead.get(doc.id));
  let hits=0;
  for (let i=0;i<documents.length;i++) {
    let best=-Infinity,label;
    for (let j=0;j<documents.length;j++) if(i!==j) {
      let score=0;
      for (let k=0;k<384;k++) score+=vectors[i][k]*vectors[j][k];
      if(score>best){best=score;label=documents[j].topicLabel;}
    }
    hits+=Number(label===documents[i].topicLabel);
  }
  return {hits,queries:documents.length};
}

async function main() {
  if (process.argv.length!==2) throw new Error('No arguments accepted');
  const archive=await readFile(new URL('../.work/cdec-wn-dataset.tar.gz',import.meta.url));
  if (archive.length!==573230||digest(archive)!==ARCHIVE_SHA256)
    throw new Error('CDEC archive integrity mismatch');
  const {training,validation}=loadTrain(readCdecArchive(archive));
  const documents=[...training,...validation];
  const started=performance.now();
  const {vectors:body,assets}=await embedDocuments(documents,'body');
  const {vectors:titleLead}=await embedDocuments(documents,'title-lead');
  const model=trainRealEncoder(training,body,titleLead,validation,body,titleLead);
  const {trainingMs,...frozen}=model;
  const artifact={...frozen,baseModelSha256:assets.modelSha256,
    archiveSha256:ARCHIVE_SHA256,trainingIdsDigest:digest(JSON.stringify(training.map(d=>d.id))),
    validationIdsDigest:digest(JSON.stringify(validation.map(d=>d.id))),
    provenance:'CDEC-WN CC BY 4.0, Pratapa et al. 2021, train split only'};
  const artifactText=`${JSON.stringify(artifact)}\n`;
  await writeFile(new URL('./model.generated.json',import.meta.url),artifactText);
  process.stdout.write(`${JSON.stringify({schema:model.schema,trainingDocuments:training.length,
    validationDocuments:validation.length,trainingTopics:32,validationTopics:8,
    bestEpoch:model.bestEpoch,epochsRun:model.epochsRun,triplets:model.triplets,
    selectedTitleLeadShare:model.titleLeadShare,validationBaseline:model.validationBaseline,
    validation:model.validation,rawTitleLeadValidation:rank(validation,body,titleLead),
    learnedValidation:rank(validation,body,titleLead,model),
    trainingMs,allMs:performance.now()-started,artifactBytes:Buffer.byteLength(artifactText),
    artifactSha256:digest(artifactText),baseModelSha256:assets.modelSha256},null,2)}\n`);
}
main().catch(error=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1;});
