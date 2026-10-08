// Ephemeral offline experiment: outputs aggregate metrics only.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { embedDocuments } from '../e5-infer.js';
import { loadTrainValidation } from './corpus.js';
import { compareTrainValidation, focusInputs } from './experiment.js';

async function main() {
  if (process.argv.length !== 2) throw new Error('No arguments accepted');
  const splits = await loadTrainValidation();
  const documents = [...splits.train, ...splits.validation];
  const body = await embedDocuments(documents, 'body');
  const focus = await embedDocuments(focusInputs(splits), 'title-lead');
  if (body.assets.modelSha256 !== focus.assets.modelSha256)
    throw new Error('Embedding base model mismatch');
  const results = await compareTrainValidation(splits, body.vectors, focus.vectors);
  process.stdout.write(`${JSON.stringify({ dataset: 'frozen-Luna-train-validation-only',
    modelSha256: body.assets.modelSha256,
    timingMs: { bodyEmbedding: body.elapsedMs, focusEmbedding: focus.elapsedMs },
    results }, null, 2)}\n`);
}
main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
