import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpus } from '../topic-identity/corpus.js';
import { digest, inputFor, validateCorpus } from '../topic-identity/evaluate.js';
import { prefixTokenInput, poolHidden } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
import { packagedModel } from './title-vector-run.js';
import { comparePairVectors } from './title-vector-core.js';
import { summarizeSplit, REFERENCE_THRESHOLD } from './title-vector-hardneg.js';

const EXPECTED_CORPUS = '0487d1866c1dc115939fc996a363881997921ab49969116337cfabb0135f2950';

export async function runSyntheticHardNegatives() {
  validateCorpus(corpus);
  if (digest(corpus) !== EXPECTED_CORPUS) throw new Error('Frozen synthetic corpus mismatch');
  const { session, tokenizer, ort } = await packagedModel();
  const vectors = new Map();
  try {
    for (const document of corpus.documents) {
      const vector = {};
      for (const [name, mode] of [['body', 'body-prefix'], ['title', 'title-only']]) {
        const encoded = prefixTokenInput(tokenizer, inputFor(document, mode));
        const feeds = {};
        for (const input of session.inputNames) {
          const values = input === 'input_ids' ? encoded.ids : encoded[input];
          feeds[input] = new ort.Tensor('int64', BigInt64Array.from(values, BigInt), [1, encoded.ids.length]);
        }
        const result = await session.run(feeds);
        vector[name] = poolHidden(result.last_hidden_state, encoded.attention_mask);
      }
      vectors.set(document.id, vector);
    }
  } finally { await session.release(); }
  function split(names) {
    return summarizeSplit(names.map(name => {
      const docs = corpus.documents.filter(document => document.family === name);
      const pairs = [];
      for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
        pairs.push({ positive: docs[i].topicLabel === docs[j].topicLabel,
          scores: comparePairVectors(vectors.get(docs[i].id), vectors.get(docs[j].id)) });
      }
      return { name, pairs };
    }));
  }
  return { schema: 'r5-title-vector-hardneg/v1', corpusDigest: EXPECTED_CORPUS,
    referenceThreshold: REFERENCE_THRESHOLD, development: split(corpus.split.development),
    heldOut: split(corpus.split.heldOut) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    process.stderr.write('No arguments accepted.\n'); process.exitCode = 1;
  } else {
    runSyntheticHardNegatives().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
      () => { process.stderr.write('Synthetic hard-negative probe unavailable.\n'); process.exitCode = 1; });
  }
}
