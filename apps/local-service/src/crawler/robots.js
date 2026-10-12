const PRODUCT_TOKEN = "MurmingleTopicCrawler";
const MAX_ROBOTS_BYTES = 500 * 1_024;
const MAX_ROBOTS_LINES = 20_000;
const MAX_GROUPS = 2_048;
const MAX_RULES = 20_000;
const MAX_PATTERN_BYTES = 2_048;
const MAX_CRAWL_DELAY_MS = 24 * 60 * 60 * 1_000;
const MAX_TDMREP_BYTES = 256 * 1_024;
const MAX_TDMREP_RULES = 2_048;
const MAX_TDM_POLICY_BYTES = 2_048;
const MAX_STORED_POLICY_CHARS = 131_072;

export const ROBOTS_POLICY = Object.freeze({
  productToken: PRODUCT_TOKEN,
  maxBytes: MAX_ROBOTS_BYTES,
  maxLines: MAX_ROBOTS_LINES,
  maxGroups: MAX_GROUPS,
  maxRules: MAX_RULES,
  maxPatternBytes: MAX_PATTERN_BYTES,
  maxCrawlDelayMs: MAX_CRAWL_DELAY_MS
});
export const TDMREP_WELL_KNOWN_PATH = "/.well-known/tdmrep.json";

export class CrawlerPolicyError extends Error {
  constructor(code) {
    super("Invalid crawler policy document");
    this.name = "CrawlerPolicyError";
    this.code = code;
  }
}

function policyFailure(code) { return new CrawlerPolicyError(code); }

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, expected) {
  return plainObject(value) && Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function validAgentLabel(value, canonical = false) {
  return typeof value === "string" && value.length >= 1 && value.length <= 256 && Buffer.byteLength(value) <= 256 &&
    value.isWellFormed() && value === value.trim() && !/[\p{C}\p{Zl}\p{Zp}]/u.test(value) &&
    (!canonical || value === value.toLowerCase());
}

function storedSize(value, code) {
  let json;
  try { json = JSON.stringify(value); }
  catch { throw policyFailure(code); }
  if (typeof json !== "string" || json.length > MAX_STORED_POLICY_CHARS) throw policyFailure(code);
  return json;
}

function normalizePercentEncoding(value) {
  const encoded = value.replace(/%[0-9a-fA-F]{2}|[^\x00-\x7f]/gu, token =>
    token.startsWith("%") ? token : encodeURIComponent(token));
  return encoded.replace(/%([0-9a-fA-F]{2})/gu, (whole, hex) => {
    const octet = Number.parseInt(hex, 16);
    const character = String.fromCharCode(octet);
    return /[A-Za-z0-9._~-]/u.test(character) ? character : `%${hex.toUpperCase()}`;
  });
}

function normalizeSpecialLiterals(value) {
  return normalizePercentEncoding(value).replace(/\*/gu, "%2A").replace(/\$/gu, "%24");
}

function validPattern(pattern, tdm = false) {
  return typeof pattern === "string" && (pattern.startsWith("/") || !tdm && pattern.startsWith("*")) &&
    Buffer.byteLength(pattern) <= MAX_PATTERN_BYTES &&
    pattern.isWellFormed() && !/[\u0000-\u0020\u007f#\\]/u.test(pattern) && (!tdm || !pattern.includes("?")) &&
    !/%(?![0-9a-fA-F]{2})/u.test(pattern);
}

function patternParts(pattern) {
  const normalized = normalizePercentEncoding(pattern);
  const anchored = normalized.endsWith("$");
  const source = anchored ? normalized.slice(0, -1) : normalized;
  return Object.freeze({ anchored, parts: Object.freeze(source.split("*").map(normalizeSpecialLiterals)) });
}

function patternMatches(pattern, path) {
  const { anchored, parts } = patternParts(pattern);
  if (!path.startsWith(parts[0])) return false;
  let cursor = parts[0].length;
  for (let index = 1; index < parts.length; index += 1) {
    const part = parts[index];
    if (anchored && index === parts.length - 1) {
      const start = path.length - part.length;
      return start >= cursor && path.endsWith(part);
    }
    const found = path.indexOf(part, cursor);
    if (found < 0) return false;
    cursor = found + part.length;
  }
  return !anchored || cursor === path.length;
}

function patternSpecificity(pattern) {
  return patternParts(pattern).parts.reduce((total, part) => total + Buffer.byteLength(part), 0);
}

function pathForMatch(raw) {
  if (typeof raw !== "string" || !raw) throw new TypeError("Invalid policy match URL");
  let path;
  if (raw.startsWith("/")) path = raw.split("#", 1)[0];
  else {
    let url;
    try { url = new URL(raw); }
    catch { throw new TypeError("Invalid policy match URL"); }
    path = `${url.pathname}${url.search}`;
  }
  return normalizeSpecialLiterals(path);
}

function tdmPathForMatch(raw) {
  if (typeof raw !== "string" || !raw) throw new TypeError("Invalid TDMRep match URL");
  if (raw.startsWith("/")) return normalizeSpecialLiterals(raw.split(/[?#]/u, 1)[0]);
  let url;
  try { url = new URL(raw); }
  catch { throw new TypeError("Invalid TDMRep match URL"); }
  return normalizeSpecialLiterals(url.pathname);
}

function freezeGroup(group) {
  return Object.freeze({
    agents: Object.freeze([...group.agents]),
    rules: Object.freeze(group.rules.map(rule => Object.freeze(rule))),
    crawlDelaysMs: Object.freeze([...group.crawlDelaysMs])
  });
}

export function parseRobotsTxt(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_ROBOTS_BYTES || text.includes("\0"))
    throw policyFailure("invalid-robots");
  const lines = text.replace(/^\uFEFF/u, "").split(/\r\n|\n|\r/u);
  if (lines.length > MAX_ROBOTS_LINES) throw policyFailure("invalid-robots");
  const groups = [];
  const sitemaps = [];
  let active = null, totalRules = 0;
  const beginGroup = () => {
    if (groups.length >= MAX_GROUPS) throw policyFailure("invalid-robots");
    active = { agents: [], rules: [], crawlDelaysMs: [], recordsStarted: false };
    groups.push(active);
  };
  for (const rawLine of lines) {
    const uncommented = rawLine.slice(0, rawLine.indexOf("#") < 0 ? rawLine.length : rawLine.indexOf("#")).trim();
    if (!uncommented) continue;
    const match = /^([a-z][a-z-]*)\s*:(.*)$/iu.exec(uncommented);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "user-agent") {
      if (!active || active.recordsStarted) beginGroup();
      const agent = value.toLowerCase();
      if (!validAgentLabel(value) || !validAgentLabel(agent, true) || active.agents.length >= 32)
        throw policyFailure("invalid-robots");
      active.agents.push(agent);
      continue;
    }
    if (field === "sitemap") {
      if (sitemaps.length < 128 && value.length <= 2_048) {
        try {
          const url = new URL(value);
          if (url.protocol === "https:" && (!url.port || url.port === "443") && !url.username && !url.password && !url.hash)
            sitemaps.push(url.href);
        } catch { /* A malformed optional sitemap is ignored. */ }
      }
      continue;
    }
    if (!active || active.agents.length === 0) continue;
    if (field === "allow" || field === "disallow") {
      active.recordsStarted = true;
      if (!value) continue;
      if (!validPattern(value) || ++totalRules > MAX_RULES) throw policyFailure("invalid-robots");
      active.rules.push({ type: field, pattern: value, specificity: patternSpecificity(value) });
    } else if (field === "crawl-delay") {
      if (active.crawlDelaysMs.length >= 32) throw policyFailure("invalid-robots");
      if (!/^[0-9]+(?:\.[0-9]{1,3})?$/u.test(value)) throw policyFailure("invalid-robots");
      const delay = Math.ceil(Number(value) * 1_000);
      if (!Number.isSafeInteger(delay) || delay > MAX_CRAWL_DELAY_MS) throw policyFailure("invalid-robots");
      active.crawlDelaysMs.push(delay);
    }
  }
  const result = Object.freeze({
    kind: "robots-policy/v1",
    groups: Object.freeze(groups.filter(group => group.agents.length).map(freezeGroup)),
    sitemaps: Object.freeze([...new Set(sitemaps)])
  });
  storedSize(result, "invalid-robots");
  ROBOTS_DOCUMENTS.add(result);
  return result;
}

const ROBOTS_DOCUMENTS = new WeakSet();

function validStoredSitemap(value) {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.href === value && url.protocol === "https:" && (!url.port || url.port === "443") &&
      !url.username && !url.password && !url.hash;
  } catch { return false; }
}

/** Return the small canonical DTO intended for the crawler state's JSON column. */
export function serializeRobotsPolicy(policy) {
  if (!ROBOTS_DOCUMENTS.has(policy)) throw new TypeError("Invalid robots policy");
  const value = Object.freeze({
    kind: "robots-policy/v1",
    groups: Object.freeze(policy.groups.map(group => Object.freeze({
      agents: Object.freeze([...group.agents]),
      rules: Object.freeze(group.rules.map(rule => Object.freeze({ ...rule }))),
      crawlDelaysMs: Object.freeze([...group.crawlDelaysMs])
    }))),
    sitemaps: Object.freeze([...policy.sitemaps])
  });
  storedSize(value, "invalid-robots");
  return value;
}

/** Strictly validate and re-brand a policy read back from untrusted persisted JSON. */
export function restoreRobotsPolicy(value) {
  storedSize(value, "invalid-robots");
  if (!exactKeys(value, ["kind", "groups", "sitemaps"]) || value.kind !== "robots-policy/v1" ||
      !Array.isArray(value.groups) || value.groups.length > MAX_GROUPS ||
      !Array.isArray(value.sitemaps) || value.sitemaps.length > 128 || !value.sitemaps.every(validStoredSitemap) ||
      new Set(value.sitemaps).size !== value.sitemaps.length) throw policyFailure("invalid-robots");
  let totalRules = 0;
  const groups = value.groups.map(group => {
    if (!exactKeys(group, ["agents", "rules", "crawlDelaysMs"]) || !Array.isArray(group.agents) ||
        group.agents.length < 1 || group.agents.length > 32 || !group.agents.every(agent =>
          validAgentLabel(agent, true)) ||
        !Array.isArray(group.rules) || !Array.isArray(group.crawlDelaysMs) || group.crawlDelaysMs.length > 32 ||
        !group.crawlDelaysMs.every(delay => Number.isInteger(delay) && delay >= 0 && delay <= MAX_CRAWL_DELAY_MS))
      throw policyFailure("invalid-robots");
    const rules = group.rules.map(rule => {
      if (!exactKeys(rule, ["type", "pattern", "specificity"]) || (rule.type !== "allow" && rule.type !== "disallow") ||
          !validPattern(rule.pattern) || !Number.isInteger(rule.specificity) || rule.specificity !== patternSpecificity(rule.pattern) ||
          ++totalRules > MAX_RULES) throw policyFailure("invalid-robots");
      return Object.freeze({ type: rule.type, pattern: rule.pattern, specificity: rule.specificity });
    });
    return Object.freeze({ agents: Object.freeze([...group.agents]), rules: Object.freeze(rules),
      crawlDelaysMs: Object.freeze([...group.crawlDelaysMs]) });
  });
  const restored = Object.freeze({ kind: "robots-policy/v1", groups: Object.freeze(groups),
    sitemaps: Object.freeze([...value.sitemaps]) });
  ROBOTS_DOCUMENTS.add(restored);
  return restored;
}

function selectedGroups(policy, userAgent) {
  const product = userAgent.toLowerCase();
  const exact = policy.groups.filter(group => group.agents.includes(product));
  return exact.length ? exact : policy.groups.filter(group => group.agents.includes("*"));
}

export function evaluateRobots(policy, rawUrl, { userAgent = PRODUCT_TOKEN } = {}) {
  if (!ROBOTS_DOCUMENTS.has(policy) || typeof userAgent !== "string" || !/^[A-Za-z_-]+$/u.test(userAgent))
    throw new TypeError("Invalid robots evaluation");
  const path = pathForMatch(rawUrl);
  if (path === "/robots.txt") return Object.freeze({ allowed: true, matchedRule: null, crawlDelayMs: 0, userAgent });
  const groups = selectedGroups(policy, userAgent);
  let winner = null;
  for (const group of groups) for (const rule of group.rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    if (!winner || rule.specificity > winner.specificity ||
        (rule.specificity === winner.specificity && rule.type === "allow" && winner.type !== "allow")) winner = rule;
  }
  const crawlDelayMs = groups.reduce((maximum, group) =>
    Math.max(maximum, ...group.crawlDelaysMs, 0), 0);
  return Object.freeze({
    allowed: !winner || winner.type === "allow",
    matchedRule: winner ? Object.freeze({ ...winner }) : null,
    crawlDelayMs,
    userAgent
  });
}

export function isRobotsAllowed(policy, rawUrl, options = undefined) {
  return evaluateRobots(policy, rawUrl, options).allowed;
}

export function parseXRobotsDirectives(input, { userAgent = PRODUCT_TOKEN } = {}) {
  const values = typeof input === "string" ? [input] : input;
  if (!Array.isArray(values) || values.length > 32 || typeof userAgent !== "string")
    throw new TypeError("Invalid X-Robots-Tag value");
  let bytes = 0, noindex = false, nofollow = false, noai = false;
  const applied = new Set();
  for (const value of values) {
    if (typeof value !== "string" || /[\r\n\0]/u.test(value) || (bytes += Buffer.byteLength(value)) > 16_384)
      throw new TypeError("Invalid X-Robots-Tag value");
    let scope = null;
    for (const rawPart of value.split(",")) {
      let part = rawPart.trim().toLowerCase();
      const scoped = /^([a-z_-][a-z0-9_-]*)\s*:\s*(.*)$/u.exec(part);
      if (scoped && scoped[1] !== "unavailable_after") { scope = scoped[1]; part = scoped[2]; }
      if (scope !== null && scope !== "*" && scope !== userAgent.toLowerCase()) continue;
      for (const directive of part.split(/\s+/u).filter(Boolean)) {
        applied.add(directive);
        if (directive === "none") { noindex = true; nofollow = true; }
        else if (directive === "noindex") noindex = true;
        else if (directive === "nofollow") nofollow = true;
        else if (directive === "noai" || directive === "notrain") noai = true;
      }
    }
  }
  return Object.freeze({ noindex, nofollow, noai, blocked: noindex || noai, directives: Object.freeze([...applied]) });
}

const TDMREP_DOCUMENTS = new WeakSet();

function tdmPolicyUrl(value) {
  if (typeof value !== "string" || !value.isWellFormed() || Buffer.byteLength(value) > MAX_TDM_POLICY_BYTES)
    throw policyFailure("invalid-tdmrep");
  let url;
  try { url = new URL(value); }
  catch { throw policyFailure("invalid-tdmrep"); }
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || url.hash)
    throw policyFailure("invalid-tdmrep");
  return url.href;
}

function parseTdmRepSource(source) {
  let offset = 0;
  const fail = () => { throw policyFailure("invalid-tdmrep"); };
  const whitespace = () => { while (/[\u0009\u000a\u000d\u0020]/u.test(source[offset] ?? "")) offset += 1; };
  const expect = character => {
    whitespace();
    if (source[offset] !== character) fail();
    offset += 1;
  };
  const string = () => {
    whitespace();
    if (source[offset] !== "\"") fail();
    const start = offset++;
    while (offset < source.length) {
      const character = source[offset++];
      if (character === "\"") {
        let value;
        try { value = JSON.parse(source.slice(start, offset)); }
        catch { fail(); }
        if (typeof value !== "string" || !value.isWellFormed()) fail();
        return value;
      }
      if (character.charCodeAt(0) < 0x20) fail();
      if (character !== "\\") continue;
      const escape = source[offset++];
      if (escape === "u") {
        if (!/^[0-9a-fA-F]{4}$/u.test(source.slice(offset, offset + 4))) fail();
        offset += 4;
      } else if (!/^["\\/bfnrt]$/u.test(escape ?? "")) fail();
    }
    fail();
  };
  const reservation = () => {
    whitespace();
    const value = source[offset];
    if (value !== "0" && value !== "1") fail();
    offset += 1;
    return Number(value);
  };
  whitespace();
  expect("[");
  const entries = [];
  whitespace();
  if (source[offset] === "]") offset += 1;
  else while (true) {
    if (entries.length >= MAX_TDMREP_RULES) fail();
    expect("{");
    const entry = {};
    const keys = new Set();
    whitespace();
    if (source[offset] === "}") offset += 1;
    else while (true) {
      const key = string();
      if (keys.has(key) || !["location", "tdm-reservation", "tdm-policy"].includes(key)) fail();
      keys.add(key);
      expect(":");
      entry[key] = key === "tdm-reservation" ? reservation() : string();
      whitespace();
      if (source[offset] === "}") { offset += 1; break; }
      if (source[offset] !== ",") fail();
      offset += 1;
    }
    entries.push(entry);
    whitespace();
    if (source[offset] === "]") { offset += 1; break; }
    if (source[offset] !== ",") fail();
    offset += 1;
  }
  whitespace();
  if (offset !== source.length) fail();
  return entries;
}

export function parseTdmRepJson(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_TDMREP_BYTES || text.includes("\0"))
    throw policyFailure("invalid-tdmrep");
  const value = parseTdmRepSource(text);
  if (!Array.isArray(value) || value.length > MAX_TDMREP_RULES) throw policyFailure("invalid-tdmrep");
  const rules = value.map((entry, index) => {
    if (!plainObject(entry)) throw policyFailure("invalid-tdmrep");
    const keys = Object.keys(entry).sort();
    const expected = Object.hasOwn(entry, "tdm-policy")
      ? ["location", "tdm-policy", "tdm-reservation"] : ["location", "tdm-reservation"];
    if (keys.join("\0") !== expected.join("\0") || !validPattern(entry.location, true) ||
        (entry["tdm-reservation"] !== 0 && entry["tdm-reservation"] !== 1)) throw policyFailure("invalid-tdmrep");
    return Object.freeze({
      location: entry.location,
      reservation: entry["tdm-reservation"],
      policy: Object.hasOwn(entry, "tdm-policy") ? tdmPolicyUrl(entry["tdm-policy"]) : null,
      index
    });
  });
  const result = Object.freeze({ kind: "tdmrep-policy/v1", rules: Object.freeze(rules) });
  storedSize(result, "invalid-tdmrep");
  TDMREP_DOCUMENTS.add(result);
  return result;
}

/** Return the canonical DTO intended for the crawler state's JSON column. */
export function serializeTdmRepPolicy(document) {
  if (!TDMREP_DOCUMENTS.has(document)) throw new TypeError("Invalid TDMRep document");
  const value = Object.freeze({ kind: "tdmrep-policy/v1",
    rules: Object.freeze(document.rules.map(rule => Object.freeze({ ...rule }))) });
  storedSize(value, "invalid-tdmrep");
  return value;
}

/** Strictly validate and re-brand a TDMRep policy read back from untrusted persisted JSON. */
export function restoreTdmRepPolicy(value) {
  storedSize(value, "invalid-tdmrep");
  if (!exactKeys(value, ["kind", "rules"]) || value.kind !== "tdmrep-policy/v1" ||
      !Array.isArray(value.rules) || value.rules.length > MAX_TDMREP_RULES) throw policyFailure("invalid-tdmrep");
  const rules = value.rules.map((rule, index) => {
    if (!exactKeys(rule, ["location", "reservation", "policy", "index"]) || !validPattern(rule.location, true) ||
        (rule.reservation !== 0 && rule.reservation !== 1) || rule.index !== index ||
        (rule.policy !== null && tdmPolicyUrl(rule.policy) !== rule.policy)) throw policyFailure("invalid-tdmrep");
    return Object.freeze({ location: rule.location, reservation: rule.reservation, policy: rule.policy, index });
  });
  const restored = Object.freeze({ kind: "tdmrep-policy/v1", rules: Object.freeze(rules) });
  TDMREP_DOCUMENTS.add(restored);
  return restored;
}

export function matchTdmRep(document, rawUrl) {
  if (!TDMREP_DOCUMENTS.has(document)) throw new TypeError("Invalid TDMRep document");
  const path = tdmPathForMatch(rawUrl);
  for (const rule of document.rules) {
    if (!patternMatches(rule.location, path)) continue;
    return Object.freeze({ reservation: rule.reservation, policy: rule.policy, location: rule.location, index: rule.index });
  }
  return Object.freeze({ reservation: null, policy: null, location: null, index: null });
}

export function parseTdmReservation(value) {
  if (value === 0 || value === "0") return 0;
  if (value === 1 || value === "1") return 1;
  return null;
}

export function tdmRepUrlFor(rawUrl) {
  let url;
  try { url = new URL(rawUrl); }
  catch { throw new TypeError("Invalid TDMRep origin"); }
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password)
    throw new TypeError("Invalid TDMRep origin");
  return `${url.origin}${TDMREP_WELL_KNOWN_PATH}`;
}

function originKey(rawUrl) {
  return new URL(tdmRepUrlFor(rawUrl)).origin;
}

export function createTdmRepCache({ maxEntries = 256, ttlMs = 60 * 60 * 1_000, now = Date.now } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 1_024 || !Number.isInteger(ttlMs) ||
      ttlMs < 1_000 || ttlMs > 24 * 60 * 60 * 1_000 || typeof now !== "function")
    throw new TypeError("Invalid TDMRep cache options");
  const entries = new Map();
  return Object.freeze({
    get size() { return entries.size; },
    get(rawUrl) {
      const key = originKey(rawUrl);
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) { entries.delete(key); return undefined; }
      entries.delete(key); entries.set(key, entry);
      return entry.value;
    },
    set(rawUrl, value, entryTtlMs = ttlMs) {
      if ((value !== null && !TDMREP_DOCUMENTS.has(value)) || !Number.isInteger(entryTtlMs) || entryTtlMs < 1_000 || entryTtlMs > ttlMs)
        throw new TypeError("Invalid TDMRep cache entry");
      const key = originKey(rawUrl);
      entries.delete(key);
      entries.set(key, Object.freeze({ value, expiresAt: now() + entryTtlMs }));
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      return value;
    },
    delete(rawUrl) { return entries.delete(originKey(rawUrl)); },
    clear() { entries.clear(); }
  });
}
