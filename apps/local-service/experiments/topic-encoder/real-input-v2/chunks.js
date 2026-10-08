import { safeDiagnostic } from '../real-event-eval/core.js';
import { InferenceStageError } from '../e5-infer.js';

export const LONG_VIEW_CHUNK = 80;
const STAGES = new Set(['arguments', 'input', 'parse', 'selection', 'short-embed',
  'long-embed', 'preflight-long', 'training', 'validation']);
const INFERENCE_CODES = new Set(['TOKENIZE', 'SESSION_RUN', 'POOL', 'CLEANUP']);

export const fixedFailure = (stage, error) => ({
  stage: STAGES.has(stage) ? stage : 'validation',
  ...(error instanceof InferenceStageError && INFERENCE_CODES.has(error.code)
    ? { phase: 'inference', code: error.code } : safeDiagnostic(error)),
});

// Each call uses the unchanged E5 inference function and releases its session.
// Only vectors remain in process memory, in original document order.
export async function embedChunks(documents, embedDocuments, maximum = LONG_VIEW_CHUNK) {
  if (!Array.isArray(documents) || !documents.length ||
      !Number.isInteger(maximum) || maximum < 1 || maximum > LONG_VIEW_CHUNK ||
      new Set(documents.map(d => d?.id)).size !== documents.length ||
      documents.some(d => typeof d?.id !== 'string' || !d.id))
    throw new Error('Invalid chunk input');
  const vectors = new Map();
  let assets = null, elapsedMs = 0;
  for (let start = 0; start < documents.length; start += maximum) {
    const slice = documents.slice(start, start + maximum);
    const result = await embedDocuments(slice, 'title-lead');
    if (!(result?.vectors instanceof Map) || result.vectors.size !== slice.length ||
        !result.assets || !Number.isFinite(result.elapsedMs))
      throw new Error('Invalid chunk output');
    const current = result.assets;
    if (!assets) assets = current;
    else if (current.modelSha256 !== assets.modelSha256 ||
        current.tokenizerSha256 !== assets.tokenizerSha256 || current.runtime !== assets.runtime)
      throw new Error('Chunk asset mismatch');
    for (const document of slice) {
      const vector = result.vectors.get(document.id);
      if (!vector || vector.length !== 384 || [...vector].some(x => !Number.isFinite(x)))
        throw new Error('Invalid chunk vector');
      vectors.set(document.id, vector);
    }
    elapsedMs += result.elapsedMs;
  }
  return { vectors, assets, elapsedMs };
}
