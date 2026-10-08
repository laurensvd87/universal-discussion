import cdecArtifact from './model.generated.json' with { type:'json' };
import { embedDocuments } from '../e5-infer.js';
import { encodeRealPage, trainRealEncoder } from './model.js';
import { evaluateLabeled, strictValidationThreshold } from './evaluation.js';

export function validateLunaSplits(splits) {
  const names=['train','validation','test'];
  if (!splits || names.some(name=>!Array.isArray(splits[name])||splits[name].length<8))
    throw new TypeError('Invalid Luna splits');
  const ids=new Set(),families=new Map();
  for (const name of names) for (const doc of splits[name]) {
    if (typeof doc?.id!=='string'||!doc.id||ids.has(doc.id)||
      typeof doc.title!=='string'||!doc.title.trim()||doc.title.length>200||
      typeof doc.body!=='string'||doc.body.length<40||doc.body.length>4096||
      typeof doc.family!=='string'||!doc.family||
      typeof doc.topicLabel!=='string'||!doc.topicLabel)
      throw new TypeError(`Invalid Luna ${name} page`);
    ids.add(doc.id);
    if (families.has(doc.family)&&families.get(doc.family)!==name)
      throw new TypeError('Luna family leakage');
    families.set(doc.family,name);
  }
  if (ids.size>700) throw new TypeError('Too many Luna pages');
  return names;
}

function mapEncoder(documents,body,titleLead,artifact) {
  return new Map(documents.map(doc=>[doc.id,
    encodeRealPage(doc,body.get(doc.id),titleLead.get(doc.id),artifact)]));
}

// The caller verifies the frozen corpus SHA before invoking this function.
// The newly trained model is finalized from train/validation, then scored once
// on test without a code path to adjust weights from test outcomes.
export async function runLunaExperiment(splits) {
  const names=validateLunaSplits(splits);
  const documents=names.flatMap(name=>splits[name]);
  const started=performance.now();
  const {vectors:body,elapsedMs:bodyMs,assets}=await embedDocuments(documents,'body');
  const {vectors:titleLead,elapsedMs:titleLeadMs}=await embedDocuments(documents,'title-lead');
  if (assets.modelSha256!==cdecArtifact.baseModelSha256)
    throw new Error('Packaged base E5 differs from frozen CDEC model');
  const luna=trainRealEncoder(splits.train,body,titleLead,
    splits.validation,body,titleLead);
  const {trainingMs,...artifact}=luna;
  const cdecVectors=mapEncoder(documents,body,titleLead,cdecArtifact);
  const lunaVectors=mapEncoder(documents,body,titleLead,artifact);
  const methods={rawE5Body:body,rawE5TitleLead:titleLead,
    cdecTrained:cdecVectors,lunaTrained:lunaVectors};
  const results={};
  for (const [name,vectors] of Object.entries(methods)) {
    const selected=strictValidationThreshold(splits.validation,vectors);
    results[name]={validation:selected,
      test:evaluateLabeled(splits.test,vectors,selected.threshold)};
  }
  return {artifact:{...artifact,baseModelSha256:assets.modelSha256,
    trainingProvenance:'frozen Luna synthetic train/validation only'},
    report:{splits:Object.fromEntries(names.map(name=>[name,splits[name].length])),
      timingMs:{e5Body:bodyMs,e5TitleLead:titleLeadMs,training:trainingMs,
        total:performance.now()-started},
      training:{bestEpoch:luna.bestEpoch,epochsRun:luna.epochsRun,
        triplets:luna.triplets,validationBaseline:luna.validationBaseline,
        validation:luna.validation},results}};
}
