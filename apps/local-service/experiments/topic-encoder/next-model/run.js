import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { trainingCorpus, validateTrainingCorpus } from '../data/train.js';
import { embedDocuments } from '../e5-infer.js';
import { trainEncoder, encodePage, cosine } from './model.js';
import { trainLearnedEncoder, encodeLearnedPage } from './learned.js';
import { splits } from '../next-data/corpus.js';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

async function main() {
  if (process.argv.length !== 2) throw new Error('No arguments accepted');
  validateTrainingCorpus(trainingCorpus);
  const trainFamilies = new Set(trainingCorpus.split.training);
  const adapt = doc => ({id:doc.id,family:doc.family,topicLabel:doc.topicId,
    viewpoint:doc.stance,title:doc.title,body:doc.body});
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  if (digest(splits.train) !== '9c5da0e9d9767ba0d7a6343ce6a8bba7ba9a3e651e02e3c27598644b77024093' ||
      digest(splits.validation) !== 'e3ccbe14bf73621f1ae1c083ac08d286eb16d619715008fcb77a06aaf6c0e423')
    throw new Error('New train/validation digest mismatch');
  const train = [...trainingCorpus.documents.filter(doc => trainFamilies.has(doc.family)),
    ...splits.train.map(adapt)];
  const validation = [...trainingCorpus.documents.filter(doc => !trainFamilies.has(doc.family)),
    ...splits.validation.map(adapt)];
  const started = performance.now();
  const { vectors, elapsedMs, assets } = await embedDocuments([...train,...validation]);
  const model = trainEncoder(train, vectors, validation, vectors);
  const learned = trainLearnedEncoder(train,vectors,validation,vectors,model);
  const { trainingMs: _trainingMs, ...trainedWeights } = learned;
  const artifact = { ...trainedWeights, input:'hash-verified packaged E5 body vector plus local title/lead',
    outputDimensions:384, provenance:'project-created synthetic train/validation only',
    trainingDigest:digest(train), validationDigest:digest(validation),
    baseModelSha256:assets.modelSha256 };
  const artifactText = `${JSON.stringify(artifact)}\n`;
  await writeFile(new URL('./model.generated.json',import.meta.url),artifactText,{flag:'w'});
  const raw = { schema: model.schema, lexicalShare: 0, titleWeight: 1, secondSentenceWeight: 0 };
  function rank(documents, head) {
    const embedded = documents.map(doc => encodePage(doc, vectors.get(doc.id), head));
    let correct = 0;
    let eligible=0;
    for (let i = 0; i < documents.length; i++) {
      if (!documents.some((doc,j)=>i!==j&&doc.topicLabel===documents[i].topicLabel)) continue;
      eligible++;
      let best = -Infinity, label;
      for (let j = 0; j < documents.length; j++) if (i !== j) {
        const score = cosine(embedded[i], embedded[j]);
        if (score > best) { best = score; label = documents[j].topicLabel; }
      }
      correct += Number(label === documents[i].topicLabel);
    }
    return { correct, queries: eligible };
  }
  function learnedRank(documents) {
    const embedded=documents.map(doc=>encodeLearnedPage(doc,vectors.get(doc.id),learned));
    let correct=0,eligible=0;
    for (let i=0;i<documents.length;i++) {
      if (!documents.some((doc,j)=>i!==j&&doc.topicLabel===documents[i].topicLabel)) continue;
      eligible++;
      let best=-Infinity,label;
      for (let j=0;j<documents.length;j++) if(i!==j) {
        const score=cosine(embedded[i],embedded[j]);
        if(score>best){best=score;label=documents[j].topicLabel;}
      }
      correct+=Number(label===documents[i].topicLabel);
    }
    return {correct,queries:eligible};
  }
  process.stdout.write(`${JSON.stringify({ model, learned: {
    schema:learned.schema,bestEpoch:learned.bestEpoch,epochsRun:learned.epochsRun,
    triplets:learned.triplets,initialValidation:learned.initialValidation,
    validation:learned.validation,trainingMs:learned.trainingMs,
    parameters:learned.denseWeights.length+learned.lexicalWeights.length,
    artifactSha256:createHash('sha256').update(artifactText).digest('hex'),
    trainRank:learnedRank(train),validationRank:learnedRank(validation) }, rawTrain: rank(train,raw),
    modelTrain: rank(train,model), rawValidation: rank(validation,raw),
    modelValidation: rank(validation,model),
    newValidationOnly: {raw:rank(splits.validation.map(adapt),raw),
      learned:learnedRank(splits.validation.map(adapt))}, e5Ms:elapsedMs,
    totalMs:performance.now()-started, assets },null,2)}\n`);
}
main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode=1; });
