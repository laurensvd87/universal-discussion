// Previously exposed synthetic holdouts: diagnostic only, never used to fit.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { holdoutV2, validateHoldoutV2 } from '../data/holdout-v2.js';
import { holdoutV3, validateHoldoutV3 } from '../data/holdout-v3.js';
import { embedDocuments } from '../e5-infer.js';
import { evaluatePairScores } from '../benchmark-v2.js';
import { encodePage, cosine, SCHEMA } from './model.js';

const model = { schema: SCHEMA, lexicalShare: 0.75, titleWeight: 3, secondSentenceWeight: 0.5 };
const raw = { schema: SCHEMA, lexicalShare: 0, titleWeight: 1, secondSentenceWeight: 0 };

async function main() {
  validateHoldoutV2(holdoutV2.documents);
  validateHoldoutV3(holdoutV3);
  const sets = [holdoutV2.documents,
    holdoutV3.documents.map(doc => ({ ...doc, family:doc.familyId,
      topicLabel:doc.topicId, viewpoint:doc.perspective }))];
  const docs = sets.flat();
  const { vectors, elapsedMs } = await embedDocuments(docs);
  const result = [];
  for (const set of sets) {
    const row = {};
    for (const [name, head] of [['rawE5', raw],['assertionEncoder',model]]) {
      const mapped = new Map(set.map(doc => [doc.id, encodePage(doc, vectors.get(doc.id), head)]));
      row[name] = evaluatePairScores(set, mapped, (_a,av,_b,bv) => cosine(av,bv));
    }
    result.push(row);
  }
  process.stdout.write(`${JSON.stringify({ diagnosticOnly:true, e5Ms:elapsedMs,
    v2:result[0], v3:result[1] },null,2)}\n`);
}
main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode=1; });
