// Pinned, synthetic-only independent challenge. Read only these three frozen
// JSONL files; report aggregates and write model weights, never article text.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { runLunaExperiment } from './luna-core.js';

const SPLITS=Object.freeze({
  train:{count:80,sha256:'2f229a606e9eaad34eb35a6b908d3f3321ba825da8a1e68494f6710f0dd89d27'},
  validation:{count:20,sha256:'71bd27e34e48ccc239199559e0fe61c5de556860e9fde74d20f3fd27439cdd3e'},
  test:{count:20,sha256:'9cd55f9431bb916c6ba2d4d5d3bd23fe3f233950e266a91889b7d71c3c94a433'},
});
const digest=value=>createHash('sha256').update(value).digest('hex');
const BROAD_FAMILY_SHA256='155cfb0f16ec5f0de08ab576345f03d5c7e8882b59d70b81c24c0bcaf56db036';

async function readSplit(name,spec) {
  const bytes=await readFile(new URL(`../luna-corpus/${name}.jsonl`,import.meta.url));
  if (bytes.length>512*1024||digest(bytes)!==spec.sha256)
    throw new Error(`Frozen Luna ${name} digest mismatch`);
  const lines=bytes.toString('utf8').trim().split(/\r?\n/u);
  if (lines.length!==spec.count) throw new Error(`Frozen Luna ${name} count mismatch`);
  const documents=lines.map(line=>JSON.parse(line));
  if (documents.some(doc=>doc.split!==name)) throw new Error(`Frozen Luna ${name} split mismatch`);
  return documents;
}

async function applyFrozenBroadFamilies(splits) {
  const bytes=await readFile(new URL('../luna-corpus/broad-families.json',import.meta.url));
  if (bytes.length>32768||digest(bytes)!==BROAD_FAMILY_SHA256)
    throw new Error('Frozen Luna broad-family digest mismatch');
  const metadata=JSON.parse(bytes.toString('utf8'));
  if (metadata?.schemaVersion!==1||!Array.isArray(metadata.groups))
    throw new Error('Invalid Luna broad-family map');
  const mapping=new Map(),broadSplits=new Map();
  for (const group of metadata.groups) {
    if (!Object.hasOwn(SPLITS,group.split)||typeof group.broadFamily!=='string'||
      !group.broadFamily||!Array.isArray(group.topicFamilies)||group.topicFamilies.length<1)
      throw new Error('Invalid Luna broad-family group');
    if (broadSplits.has(group.broadFamily)&&broadSplits.get(group.broadFamily)!==group.split)
      throw new Error('Broad family crosses splits');
    broadSplits.set(group.broadFamily,group.split);
    for (const family of group.topicFamilies) {
      if (typeof family!=='string'||!family||mapping.has(family))
        throw new Error('Duplicate or invalid original family mapping');
      mapping.set(family,{split:group.split,broadFamily:group.broadFamily});
    }
  }
  const seen=new Set();
  const transformed=Object.fromEntries(Object.entries(splits).map(([split,documents])=>[split,
    documents.map(doc=>{
      const mapped=mapping.get(doc.family);
      if (!mapped||mapped.split!==split) throw new Error('Missing or cross-split original family mapping');
      seen.add(doc.family);
      return {...doc,topicFamily:doc.family,family:mapped.broadFamily};
    })]));
  if (seen.size!==mapping.size) throw new Error('Unused broad-family mapping');
  for (const [split,documents] of Object.entries(transformed)) {
    let hard=0;
    for (let i=0;i<documents.length;i++) for (let j=i+1;j<documents.length;j++)
      hard+=Number(documents[i].family===documents[j].family&&
        documents[i].topicFamily!==documents[j].topicFamily);
    if (!hard) throw new Error(`No same-entity different-topic hard negatives in ${split}`);
  }
  return transformed;
}

async function main() {
  if (process.argv.length!==2) throw new Error('No arguments accepted');
  const rawSplits=Object.fromEntries(await Promise.all(Object.entries(SPLITS).map(async ([name,spec])=>
    [name,await readSplit(name,spec)])));
  const splits=await applyFrozenBroadFamilies(rawSplits);
  const {artifact,report}=await runLunaExperiment(splits);
  const frozen={...artifact,trainingFileSha256:SPLITS.train.sha256,
    validationFileSha256:SPLITS.validation.sha256,
    heldOutFileSha256:SPLITS.test.sha256};
  const artifactText=`${JSON.stringify(frozen)}\n`;
  await writeFile(new URL('./model.luna.generated.json',import.meta.url),artifactText);
  process.stdout.write(`${JSON.stringify({schema:'luna-hard-article-dual-view-evaluation/v1',
    provenance:'project-created synthetic English article corpus; labels never sent externally',
    corpusSha256:Object.fromEntries(Object.entries(SPLITS).map(([name,spec])=>[name,spec.sha256])),
    broadFamilyMapSha256:BROAD_FAMILY_SHA256,
    artifactSha256:digest(artifactText),artifactBytes:Buffer.byteLength(artifactText),
    ...report},null,2)}\n`);
}
main().catch(error=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1;});
