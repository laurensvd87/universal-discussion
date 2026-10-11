export const PAGE_CONTENT_LIMITS = Object.freeze({ url: 2048, title: 200, text: 4096 });
export const PAGE_CONTENT_EXTRACTOR_VERSION = "main-text-prefix/v1";
// ADR-021: distinct region-selection provenance, identical E5 input transform.
// Unknown extractors are not implicitly compatible merely because vectors fit.
export const PAGE_CONTENT_EXTRACTOR_VERSIONS = Object.freeze([
  PAGE_CONTENT_EXTRACTOR_VERSION, "article-container-prefix/v1",
]);

// Syntactic eligibility is not DNS resolution, authentication detection, or a
// website-rights grant. The coordinator additionally requires owner site consent.
export function inspectPageUrl(raw) { return inspectUrl(raw, false); }

// Browser navigation only: the full document witness stays ephemeral, while
// matching and discussion receive the strict, minimized Source URL. Canonical
// post, citation and retained-Source gates continue to use their own inspectors.
export function inspectPageNavigationUrl(raw) {
  const reject = (reason) => Object.freeze({ supported: false, reason });
  if (typeof raw !== "string" || !raw || raw.length > PAGE_CONTENT_LIMITS.url ||
      /[\u0000-\u0020\u007f]/u.test(raw)) return reject("invalid-url");
  let parsed;
  try { parsed = new URL(raw); } catch { return reject("invalid-url"); }
  parsed.hash = "";
  const documentUrl = parsed.toString();
  if (documentUrl.length > PAGE_CONTENT_LIMITS.url || [...parsed.searchParams].length > 64) {
    return reject("invalid-url");
  }
  // Some sites use literal semicolons as query separators. Do not reinterpret
  // their functional values, but fail closed when a recognizable credential
  // field could otherwise remain hidden inside an ordinary parameter value.
  // Inspect literal separators only: an encoded %3B remains functional data.
  for (const match of parsed.search.matchAll(/;([^;&=]*)=/gu)) {
    const key = new URLSearchParams(`${match[1]}=`).keys().next().value;
    const normalizedKey = key.toLowerCase().replace(/[-_.]/gu, "");
    if (/^(?:session|sessionid|sid|password|passwd|pwd|token|accesstoken|refreshtoken|idtoken|auth|authorization|apikey|clientsecret|secret|jwt|signature|sig|key|code|state)$/u.test(normalizedKey)) {
      return reject("credential-query");
    }
  }
  // Check the original navigation's structural eligibility before discarding
  // anything. Clearing only the query lets the unchanged strict gate perform
  // credential, scheme, host and path checks without rejecting session keys.
  const structure = new URL(documentUrl);
  structure.search = "";
  const structuralPolicy = inspectPageUrl(structure.toString());
  if (!structuralPolicy.supported) return structuralPolicy;

  const withoutSession = filterNavigationQuery(parsed, (key) =>
    /^(?:session|sessionid|sid)$/u.test(key.toLowerCase().replace(/[-_.]/gu, "")));
  // Inspect before dropping tracking: secret keys and JWT values must not be
  // laundered by a tracking label. Session values alone are deliberately removed.
  const sessionPolicy = inspectPageUrl(withoutSession.toString());
  if (!sessionPolicy.supported) return sessionPolicy;
  const canonical = filterNavigationQuery(withoutSession, (key) => {
    const lower = key.toLowerCase();
    return lower.startsWith("utm_") ||
      /^(?:fbclid|gclid|dclid|msclkid|gbraid|wbraid|mc_cid|mc_eid)$/u.test(lower);
  });
  const canonicalPolicy = inspectPageUrl(canonical.toString());
  if (!canonicalPolicy.supported) return canonicalPolicy;
  return Object.freeze({ supported: true, url: canonicalPolicy.url, documentUrl, origin: canonicalPolicy.origin });
}

function filterNavigationQuery(parsed, shouldRemove) {
  const segments = parsed.search.slice(1).split("&");
  const kept = segments.filter((segment) => {
    const key = new URLSearchParams(segment).keys().next().value;
    return key === undefined || !shouldRemove(key);
  });
  // Assign only when necessary: URLSearchParams serialization would rewrite
  // encoding, spaces and duplicate functional parameters in the Source URL.
  if (kept.length !== segments.length) parsed.search = kept.length ? `?${kept.join("&")}` : "";
  return parsed;
}

// Read-only compatibility for Sources retained before ADR-039. This must not
// be used for capture, post origins, or provider context.
export function inspectRetainedSourceDtoUrl(raw) { return inspectUrl(raw, true); }

function inspectUrl(raw, allowRetainedCredentialHost) {
  const reject = (reason) => Object.freeze({ supported: false, reason });
  if (typeof raw !== "string" || !raw || raw.length > PAGE_CONTENT_LIMITS.url ||
      /[\u0000-\u0020\u007f]/u.test(raw)) return reject("invalid-url");
  let parsed;
  try { parsed = new URL(raw); } catch { return reject("invalid-url"); }
  if (parsed.username || parsed.password) return reject("credentials");
  parsed.hash = "";
  let path;
  try { path = decodeURIComponent(parsed.pathname).toLowerCase(); }
  catch { return reject("invalid-url"); }
  if (/(?:^|\/)(?:login|log-in|signin|sign-in|signup|auth|oauth|account|accounts|dashboard|inbox|mail|messages|private|admin|banking|patient|patients|medical-records|checkout)(?:\/|$)/u.test(path)) {
    return reject("sensitive-context");
  }
  let queryCount = 0;
  const hasState = [...parsed.searchParams.keys()].some((key) => key.toLowerCase().replace(/[-_.]/gu, "") === "state");
  for (const [key, value] of parsed.searchParams) {
    if (++queryCount > 64) return reject("invalid-url");
    const normalizedKey = key.toLowerCase().replace(/[-_.]/gu, "");
    if (/^(?:password|passwd|pwd|token|accesstoken|refreshtoken|idtoken|auth|authorization|session|sessionid|sid|apikey|clientsecret|secret|jwt|signature|sig)$/u.test(normalizedKey) ||
        (normalizedKey === "code" && hasState) ||
        (normalizedKey === "key" && value.length >= 16) ||
        /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value)) return reject("credential-query");
  }
  const fixture = parsed.protocol === "http:" && parsed.hostname === "127.0.0.1" && parsed.port === "4173" &&
    /^\/background-fixture\/[a-z0-9][a-z0-9._/-]*$/u.test(parsed.pathname) && !path.includes("..") &&
    !/%(?:2f|5c|2e)/iu.test(parsed.pathname);
  if (!fixture) {
    if (parsed.protocol !== "https:" || (parsed.port && parsed.port !== "443")) return reject("unsupported-scheme-or-port");
    const host = parsed.hostname.toLowerCase();
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(host) ||
        /(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|corp|invalid|test|example|onion)$/u.test(host) ||
        /(?:^|\.)(?:localtest\.me|lvh\.me|nip\.io|sslip\.io)$/u.test(host) ||
        (!allowRetainedCredentialHost && /(?:^|\.)(?:password|passwords|account|accounts|auth|login|signin|sign-in|sso)\./u.test(host)) ||
        /^(?:mail|webmail|inbox|banking|patientportal)\./u.test(host)) return reject("unsupported-host");
  }
  const url = parsed.toString();
  if (url.length > PAGE_CONTENT_LIMITS.url) return reject("invalid-url");
  return Object.freeze({ supported: true, url, origin: parsed.origin });
}
