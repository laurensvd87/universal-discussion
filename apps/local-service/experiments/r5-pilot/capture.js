import { createHash } from 'node:crypto';
import { inspectPageUrl, PAGE_CONTENT_EXTRACTOR_VERSIONS } from '../../../../spikes/topic-resolution/browser/core/page-content-policy.js';
import { DIMENSIONS, MODEL_ID, inputText } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const HOSTS = new Set(['en.wikinews.org', 'globalvoices.org', 'www.voanews.com']);
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');

export function pilotUrl(value) {
  if (typeof value !== 'string' || value.includes('#')) throw new TypeError('Ineligible pilot URL');
  const checked = inspectPageUrl(value);
  if (!checked.supported) throw new TypeError('Ineligible public URL');
  const url = new URL(checked.url);
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname) || url.port || url.search ||
      url.hash || url.pathname === '/' || /%(?:2f|5c|2e)/iu.test(url.pathname)) {
    throw new TypeError('Ineligible pilot URL');
  }
  return url.toString();
}

export function validatePilotMetadata({ requestedUrl, publicationValue, publicationPrecision, publisher, rightsEvidenceUrl } = {}) {
  const url = pilotUrl(requestedUrl);
  const day = publicationPrecision === 'day' && typeof publicationValue === 'string' &&
    /^20(?:2[0-6])-[01]\d-[0-3]\d$/u.test(publicationValue) &&
    !Number.isNaN(Date.parse(`${publicationValue}T00:00:00Z`)) &&
    new Date(`${publicationValue}T00:00:00Z`).toISOString().slice(0, 10) === publicationValue;
  const instant = publicationPrecision === 'instant' && typeof publicationValue === 'string' &&
    /^20(?:2[0-6])-[01]\d-[0-3]\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(publicationValue) &&
    !Number.isNaN(Date.parse(publicationValue)) &&
    new Date(publicationValue).toISOString().slice(0, 19) === publicationValue.slice(0, 19);
  if (!day && !instant) throw new TypeError('Publication date or time needs manual verification');
  const expectedPublisher = { 'en.wikinews.org': 'Wikinews', 'globalvoices.org': 'Global Voices',
    'www.voanews.com': 'Voice of America' }[new URL(url).hostname];
  if (publisher !== expectedPublisher || typeof rightsEvidenceUrl !== 'string' ||
      !inspectPageUrl(rightsEvidenceUrl).supported) throw new TypeError('Provenance incomplete');
  return url;
}

// The caller must use the packaged collectPageContent reader in an isolated,
// temporary browser profile. This function cannot navigate or discover pages.
// Any redirect must be checked again by the caller and will fail here unless
// the resulting URL exactly matches the one explicitly supplied.
export async function captureOne({ requestedUrl, finalUrl, reader, embed, publicationValue, publicationPrecision,
  publisher, rightsEvidenceUrl, evidence, accessedAt }) {
  const url = validatePilotMetadata({ requestedUrl, publicationValue, publicationPrecision, publisher, rightsEvidenceUrl });
  if (evidence?.record?.sourceUrl !== url || evidence.record.rightsEvidenceUrl !== rightsEvidenceUrl ||
      evidence.record.disposition !== 'accepted' || !/^[a-f0-9]{64}$/u.test(evidence.sha256))
    throw new TypeError('Evidence incomplete');
  if (finalUrl !== url || typeof reader !== 'function' || typeof embed !== 'function') throw new TypeError('Capture precondition failed');
  const captured = await reader(url);
  if (!captured || captured.contractVersion !== 'page-content/1' || captured.status !== 'collected' ||
      captured.url !== url || typeof captured.title !== 'string' || !captured.title.trim() || captured.title.length > 200 ||
      !PAGE_CONTENT_EXTRACTOR_VERSIONS.includes(captured.extractorVersion)) throw new TypeError('Reader abstained');
  const articlePrefix = inputText(captured.text);
  if (typeof accessedAt !== 'string' || Number.isNaN(Date.parse(accessedAt))) throw new TypeError('Provenance incomplete');
  const result = await embed(articlePrefix);
  if (result?.modelId !== MODEL_ID || !Array.isArray(result.values) || result.values.length !== DIMENSIONS ||
      result.values.some(value => !Number.isFinite(value))) throw new TypeError('Packaged E5 result unavailable');
  return Object.freeze({ schema: 'r5-pilot-source/v1', url, title: captured.title,
    publicationValue, publicationPrecision, language: 'en', publisher, accessedAt, rightsEvidenceUrl,
    evidence: evidence.record, evidenceSha256: evidence.sha256, extractorVersion: captured.extractorVersion,
    modelId: MODEL_ID, inputSha256: digest(articlePrefix), vector: [...result.values] });
}
