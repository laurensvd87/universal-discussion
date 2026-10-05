import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeCapture } from './browser-capture.js';
import { captureOne, validatePilotMetadata } from './capture.js';
import { makeEvidence } from './evidence.js';
import { checkPilotCapacity, savePilotRecord } from './save-record.js';

const DEFAULT_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FIELDS = new Set(['--url', '--published', '--publication-precision', '--publisher', '--rights-url', '--chrome',
  '--metadata-origin', '--evidence-at', '--license-id', '--rights-basis', '--title-rights',
  '--originality', '--attribution-url', '--disposition', '--rationale']);

export function parseArguments(args) {
  if (!Array.isArray(args)) throw new TypeError('Invalid arguments');
  const parsed = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--english-reviewed' && !Object.hasOwn(parsed, flag)) { parsed[flag] = true; continue; }
    if (!FIELDS.has(flag) || Object.hasOwn(parsed, flag) || typeof args[index + 1] !== 'string' ||
        args[index + 1].startsWith('--')) throw new TypeError('Invalid arguments');
    parsed[flag] = args[++index];
  }
  if (!parsed['--url'] || !parsed['--rights-url'] || !parsed['--metadata-origin'] || !parsed['--evidence-at'] ||
      !parsed['--license-id'] || !parsed['--rights-basis'] || !parsed['--title-rights'] ||
      !parsed['--originality'] || !parsed['--attribution-url'] || !parsed['--disposition'] ||
      !parsed['--rationale']) throw new TypeError('Missing evidence arguments');
  if (parsed['--disposition'] === 'accepted' && (!parsed['--published'] || !parsed['--publication-precision'] || !parsed['--publisher'] ||
      !parsed['--english-reviewed'])) throw new TypeError('Missing accepted-page arguments');
  return parsed;
}

export async function runOneUrl(args, { browser = runChromeCapture, save = savePilotRecord,
  check = checkPilotCapacity } = {}) {
  const options = parseArguments(args);
  const requestedUrl = options['--url'];
  const evidence = makeEvidence({ sourceUrl: requestedUrl, metadataOriginUrl: options['--metadata-origin'],
    rightsEvidenceUrl: options['--rights-url'], rightsEvidenceObservedAt: options['--evidence-at'],
    licenseId: options['--license-id'], rightsBasis: options['--rights-basis'],
    titleRights: options['--title-rights'], publisherOriginality: options['--originality'],
    attributionUrl: options['--attribution-url'], disposition: options['--disposition'],
    rationale: options['--rationale'] });
  if (evidence.record.disposition === 'accepted') validatePilotMetadata({ requestedUrl,
    publicationValue: options['--published'], publicationPrecision: options['--publication-precision'],
    publisher: options['--publisher'],
    rightsEvidenceUrl: options['--rights-url'] });
  await check(evidence.record.sourceUrl);
  if (evidence.record.disposition === 'rejected') {
    await save({ schema: 'r5-pilot-rejection/v1', url: evidence.record.sourceUrl,
      evidence: evidence.record, evidenceSha256: evidence.sha256, accessedAt: new Date().toISOString() });
    return { status: 'recorded' };
  }
  const { captured, embedding, finalUrl } = await browser({
    executable: options['--chrome'] ?? DEFAULT_CHROME, url: requestedUrl,
  });
  const record = await captureOne({ requestedUrl, finalUrl,
    reader: async () => captured, embed: async () => embedding,
    publicationValue: options['--published'], publicationPrecision: options['--publication-precision'],
    publisher: options['--publisher'],
    rightsEvidenceUrl: options['--rights-url'], evidence,
    accessedAt: new Date().toISOString(),
  });
  await save(record);
  return { status: 'saved' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runOneUrl(process.argv.slice(2)).then(status => process.stdout.write(`${JSON.stringify(status)}\n`))
    .catch(() => { process.stderr.write('Pilot capture failed; no record saved.\n'); process.exitCode = 1; });
}
