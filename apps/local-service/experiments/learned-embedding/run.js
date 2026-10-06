import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { corpus } from '../topic-identity/corpus.js';
import { digest, validateCorpus } from '../topic-identity/evaluate.js';
import { embed, similarity, train } from './model.js';

const EXPECTED_CORPUS = '0487d1866c1dc115939fc996a363881997921ab49969116337cfabb0135f2950';
if (process.argv.length !== 2) throw new Error('No arguments accepted');
validateCorpus(corpus);
if (digest(corpus) !== EXPECTED_CORPUS) throw new Error('Frozen corpus mismatch');
const development = corpus.documents.filter(d => corpus.split.development.includes(d.family));
const heldOut = corpus.documents.filter(d => corpus.split.heldOut.includes(d.family));
const model = train(development);
function evaluate(docs, learned) {
  const vectors = new Map(docs.map(d => [d.id, embed(d, model, learned)]));
  const ranks = docs.map(doc => {
    const others = docs.filter(other => other.id !== doc.id).map(other => ({
      id: other.id, same: other.topicLabel === doc.topicLabel,
      hard: other.family === doc.family && other.topicLabel !== doc.topicLabel,
      score: similarity(vectors.get(doc.id), vectors.get(other.id)),
    })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const partnerRank = others.findIndex(item => item.same) + 1;
    return { id: doc.id, partnerRank, hardFirst: others[0].hard };
  });
  return { queries: docs.length, sameSubjectAt1: ranks.filter(r => r.partnerRank === 1).length,
    sameSubjectAt3: ranks.filter(r => r.partnerRank <= 3).length,
    hardNegativeAt1: ranks.filter(r => r.hardFirst).length,
    ranks };
}
const report = { corpusDigest: EXPECTED_CORPUS, training: {
  documents: model.trainingDocuments, samePairs: model.positivePairs,
  hardNegativePairs: model.hardNegativePairs, dimensions: model.idf.length },
  development: { unweighted: evaluate(development, false), learned: evaluate(development, true) },
  heldOut: { unweighted: evaluate(heldOut, false), learned: evaluate(heldOut, true) } };
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
