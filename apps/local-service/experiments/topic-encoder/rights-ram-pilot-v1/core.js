// Research-only, dependency-injected RAM path. There is deliberately no CLI,
// network implementation, persistence, logger, or export of row-level results.
export const MAX_PAIRS = 250;
export const MAX_ITEMS = 500;
export const MAX_TEXT_BYTES = 100_000;
export const FETCH_TIMEOUT_MS = 5_000;
const DAY_MS = 86_400_000;
const itemId = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const safePageErrors = new Set(['PAGE_UNAVAILABLE', 'PAGE_CONTENT_TYPE', 'PAGE_TOO_LARGE',
  'PAGE_TOO_SMALL', 'PAGE_INVALID_BYTES', 'PAGE_REDIRECTED', 'PAGE_TIMEOUT']);

function fail(code) { throw new Error(code); }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys) {
  if (!record(value) || Object.keys(value).some(key => !keys.includes(key)) ||
      keys.some(key => !Object.hasOwn(value, key))) fail('INVALID_SCHEMA');
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('INVALID_DATE');
  return Date.parse(value);
}
function field(value, max = 300) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value))
    fail('INVALID_FIELD');
}
function sourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) fail('INVALID_URL');
  let url;
  try { url = new URL(value); } catch { fail('INVALID_URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.search || url.hash || url.pathname === '/') fail('INVALID_URL');
  const host = url.hostname.toLowerCase();
  if (['commission.europa.eu', 'consilium.europa.eu', 'www.consilium.europa.eu',
    'europarl.europa.eu', 'www.europarl.europa.eu'].includes(host)) return 'eu_institution';
  if (host === 'globalvoices.org' || /^[a-z]{2,3}\.globalvoices\.org$/.test(host)) return 'global_voices';
  if (host === 'en.wikinews.org' || /^[a-z]{2,3}\.wikinews\.org$/.test(host)) return 'wikinews';
  fail('SOURCE_OUT_OF_SCOPE');
}
function noticeUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('INVALID_EVIDENCE_URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash)
    fail('INVALID_EVIDENCE_URL');
}
function validateReview(review, now) {
  exact(review, ['version', 'createdAt', 'items', 'pairs']);
  if (review.version !== 1 || !Array.isArray(review.items) || !Array.isArray(review.pairs) ||
      review.items.length < 2 || review.items.length > MAX_ITEMS ||
      review.pairs.length < 1 || review.pairs.length > MAX_PAIRS) fail('INVALID_SIZE');
  const created = date(review.createdAt);
  if (created > now || now >= created + 30 * DAY_MS) fail('RETENTION_EXPIRED');
  const ids = new Set();
  const urls = new Set();
  const kinds = { eu_institution: 0, global_voices: 0, wikinews: 0 };
  for (const item of review.items) {
    exact(item, ['id', 'url', 'publisher', 'language', 'publishedAt', 'rights']);
    if (typeof item.id !== 'string' || !itemId.test(item.id) || ids.has(item.id) || urls.has(item.url))
      fail('DUPLICATE_ITEM');
    const kind = sourceUrl(item.url);
    const canonical = new URL(item.url).href.replace(/\/$/, '');
    if (urls.has(canonical)) fail('DUPLICATE_ITEM');
    ids.add(item.id); urls.add(canonical);
    kinds[kind]++;
    field(item.publisher, 120);
    if (typeof item.language !== 'string' || !/^[a-z]{2,3}$/.test(item.language)) fail('INVALID_LANGUAGE');
    if (date(item.publishedAt) > now) fail('INVALID_DATE');
    exact(item.rights, ['noticeUrl', 'license', 'pageOwner', 'attribution', 'reviewer', 'reviewedAt',
      'localResearchAllowed', 'collectionAllowed', 'thirdPartyMaterialExcluded']);
    noticeUrl(item.rights.noticeUrl);
    for (const key of ['license', 'pageOwner', 'attribution', 'reviewer']) field(item.rights[key], 500);
    const reviewed = date(item.rights.reviewedAt);
    if (reviewed < created || reviewed > now) fail('INVALID_RIGHTS_REVIEW');
    for (const key of ['localResearchAllowed', 'collectionAllowed', 'thirdPartyMaterialExcluded'])
      if (item.rights[key] !== true) fail('RIGHTS_NOT_CLEARED');
  }
  const keys = new Set();
  const paired = new Set();
  const labels = { same: 0, different: 0, uncertain: 0 };
  for (const pair of review.pairs) {
    exact(pair, ['left', 'right', 'label', 'evidence', 'reviewer', 'reviewedAt']);
    if (!ids.has(pair.left) || !ids.has(pair.right) || pair.left === pair.right) fail('INVALID_PAIR');
    const key = [pair.left, pair.right].sort().join('|');
    if (keys.has(key)) fail('DUPLICATE_PAIR');
    keys.add(key); paired.add(pair.left); paired.add(pair.right);
    if (!Object.hasOwn(labels, pair.label)) fail('INVALID_LABEL');
    labels[pair.label]++;
    field(pair.evidence, 1000); field(pair.reviewer, 120);
    const reviewed = date(pair.reviewedAt);
    if (reviewed < created || reviewed > now) fail('INVALID_PAIR_REVIEW');
  }
  if (paired.size !== ids.size) fail('UNPAIRED_ITEM');
  return { labels, kinds, expiresAt: created + 30 * DAY_MS };
}

function reviewedSnapshot(review) {
  let copy;
  try { copy = structuredClone(review); }
  catch { fail('INVALID_SCHEMA'); }
  // Freeze only after schema validation; the cloned tree contains plain
  // primitives, arrays and records. No caller object is used after await.
  return copy;
}

function freezeReview(review) {
  for (const item of review.items) { Object.freeze(item.rights); Object.freeze(item); }
  for (const pair of review.pairs) Object.freeze(pair);
  Object.freeze(review.items); Object.freeze(review.pairs);
  return Object.freeze(review);
}

function plainProse(text) {
  if (typeof text !== 'string' || text.trim().length < 50 || Buffer.byteLength(text, 'utf8') > 4096 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) || /<\s*(?:!doctype|\/?[a-z][^>]*>)/i.test(text) ||
      /(?:^|\n)\s*(?:accept all cookies|cookie settings|skip to content|sign in|subscribe now|navigation)\s*(?:\n|$)/i.test(text))
    fail('PAGE_EXTRACT_INVALID');
}

async function readBody(response) {
  if (response.status !== 200 || response.redirected || !response.body ||
      typeof response.body.getReader !== 'function') fail('PAGE_UNAVAILABLE');
  const type = response.headers?.get?.('content-type')?.toLowerCase() ?? '';
  if (!/^text\/(html|plain)(?:\s*;|\s*$)/.test(type)) fail('PAGE_CONTENT_TYPE');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_TEXT_BYTES)) fail('PAGE_TOO_LARGE');
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) fail('PAGE_INVALID_BYTES');
      size += value.byteLength;
      if (size > MAX_TEXT_BYTES) fail('PAGE_TOO_LARGE');
      parts.push(Uint8Array.from(value));
    }
    if (size < 50) fail('PAGE_TOO_SMALL');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    if (bytes.includes(0)) fail('PAGE_INVALID_BYTES');
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), type }; }
    catch { fail('PAGE_INVALID_BYTES'); }
    finally { bytes.fill(0); }
  } finally {
    for (const part of parts) part.fill(0);
    await reader.cancel().catch(() => {});
  }
}

async function fetchText(url, fetchPage) {
  const controller = new AbortController();
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('PAGE_TIMEOUT')); }, FETCH_TIMEOUT_MS);
    });
    return await Promise.race([timeout, (async () => {
      // The injected transport must honor redirect:manual and the abort signal.
      const response = await fetchPage(url, { redirect: 'manual', signal: controller.signal });
      if (response?.url !== url) fail('PAGE_REDIRECTED');
      return readBody(response);
    })()]);
  } catch (error) {
    if (error instanceof Error && safePageErrors.has(error.message)) fail(error.message);
    fail('PAGE_FETCH_FAILED');
  } finally { clearTimeout(timer); controller.abort(); }
}

// Trust boundary: embedders and comparators must be reviewed local code. They
// receive transient text/vectors and can violate RAM-only handling if malicious.
export async function runRamPilot({ review, fetchPage, extractArticle, methods, now = Date.now }) {
  if (typeof fetchPage !== 'function' || typeof now !== 'function' || !Array.isArray(methods) ||
      (extractArticle !== undefined && typeof extractArticle !== 'function') ||
      methods.length !== 2 || methods[0]?.id !== 'e5' || methods[1]?.id !== 'candidate' ||
      methods.some(method => typeof method.embed !== 'function' || typeof method.sameTopic !== 'function'))
    fail('INVALID_RUNNER');
  const snapshot = reviewedSnapshot(review);
  const current = now();
  const checked = validateReview(snapshot, current);
  freezeReview(snapshot);
  const localMethods = methods.map(method => Object.freeze({ id: method.id,
    embed: method.embed, sameTopic: method.sameTopic }));
  const vectors = localMethods.map(() => new Map());
  try {
    for (const item of snapshot.items) {
      if (now() >= checked.expiresAt) fail('RETENTION_EXPIRED');
      const page = await fetchText(item.url, fetchPage);
      let text = page.text;
      if (page.type.startsWith('text/html')) {
        if (!extractArticle) fail('PAGE_EXTRACTOR_REQUIRED');
        try { text = await extractArticle(page.text); }
        catch { fail('PAGE_EXTRACT_FAILED'); }
      }
      plainProse(text);
      for (let i = 0; i < localMethods.length; i++) {
        let vector;
        try { vector = await localMethods[i].embed(text); }
        catch { fail('EMBED_FAILED'); }
        if (!(vector instanceof Float32Array) || vector.length !== 384 ||
            vector.some(value => !Number.isFinite(value))) {
          if (vector instanceof Float32Array) vector.fill(0);
          fail('INVALID_VECTOR');
        }
        vectors[i].set(item.id, Float32Array.from(vector));
        vector.fill(0);
      }
    }
    const scores = localMethods.map(method => ({ method: method.id, truePositive: 0, falsePositive: 0,
      trueNegative: 0, falseNegative: 0, uncertain: 0 }));
    for (const pair of snapshot.pairs) {
      for (let i = 0; i < localMethods.length; i++) {
        let matched;
        const left = Float32Array.from(vectors[i].get(pair.left));
        const right = Float32Array.from(vectors[i].get(pair.right));
        try { matched = await localMethods[i].sameTopic(left, right); }
        catch { fail('COMPARE_FAILED'); }
        finally { left.fill(0); right.fill(0); }
        if (typeof matched !== 'boolean') fail('INVALID_PREDICTION');
        const key = pair.label === 'uncertain' ? 'uncertain' : pair.label === 'same' ?
          matched ? 'truePositive' : 'falseNegative' : matched ? 'falsePositive' : 'trueNegative';
        scores[i][key]++;
      }
    }
    if (now() >= checked.expiresAt) fail('RETENTION_EXPIRED');
    return { scope: 'reviewed-pairs-only', items: snapshot.items.length, pairs: snapshot.pairs.length,
      labels: checked.labels, sourceClasses: checked.kinds, methods: scores };
  } finally {
    for (const map of vectors) {
      for (const vector of map.values()) vector.fill(0);
      map.clear();
    }
  }
}
