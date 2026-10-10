import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createJointEncoder } from './infer.js';
async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--asset-dir') throw new Error('ARGUMENTS');
  const encoder = await createJointEncoder(process.argv[3]);
  const a = { title: 'The council approved the Northport rail extension.' };
  const b = { title: 'Le conseil a approuvé le prolongement ferroviaire de Northport.' };
  const c = { title: 'The council canceled the Northport hospital extension.' };
  const start = performance.now();
  try {
    const same = await encoder.pair(a, b), different = await encoder.pair(a, c), reversed = await encoder.pair(b, a);
    console.log(JSON.stringify({ fictionalSmoke: true, featureDimensions: same.hidden.length,
      symmetric: same.rankMean === reversed.rankMean && same.hidden.every((value, i) => value === reversed.hidden[i]),
      finite: [...same.hidden, same.rankMean, different.rankMean].every(Number.isFinite),
      elapsedMs: Math.round(performance.now() - start), diagnostics: encoder.diagnostics(),
      inferenceOnly: true, privateCorpusOpened: false }));
  } finally { await encoder.release(); }
}
main().catch(() => { console.error('Joint encoder smoke failed: fixed-contract-error'); process.exitCode = 1; });
