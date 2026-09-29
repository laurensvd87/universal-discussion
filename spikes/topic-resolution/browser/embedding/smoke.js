import { embedText } from './e5-browser.js';

// Fixed owned descriptor only. CDP can invoke this explicit function; the page
// never starts inference on import and exposes no arbitrary URL/text interface.
globalThis.runEmbeddingSmoke = async () => {
  const result = await embedText('Cedar Slate 2 launches in September 2026. The tablet has an ink screen and a removable battery.');
  return { modelId: result.modelId, dimensions: result.values.length,
    norm: Math.hypot(...result.values), finite: result.values.every(Number.isFinite) };
};
