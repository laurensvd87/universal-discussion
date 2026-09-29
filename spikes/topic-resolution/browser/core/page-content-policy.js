export const PAGE_CONTENT_LIMITS = Object.freeze({ url: 2048, title: 200, text: 4096 });
export const PAGE_CONTENT_EXTRACTOR_VERSION = "main-text-prefix/v1";
// ADR-021: distinct region-selection provenance, identical E5 input transform.
// Unknown extractors are not implicitly compatible merely because vectors fit.
export const PAGE_CONTENT_EXTRACTOR_VERSIONS = Object.freeze([
  PAGE_CONTENT_EXTRACTOR_VERSION, "article-container-prefix/v1",
]);

// Syntactic eligibility is not DNS resolution, authentication detection, or a
// website-rights grant. The coordinator additionally requires owner site consent.
export function inspectPageUrl(raw) {
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
  for (const [key, value] of parsed.searchParams) {
    if (++queryCount > 64) return reject("invalid-url");
    const normalizedKey = key.toLowerCase().replace(/[-_.]/gu, "");
    if (/^(?:password|passwd|pwd|token|accesstoken|refreshtoken|idtoken|auth|authorization|session|sessionid|sid|apikey|clientsecret|secret|jwt|signature|sig)$/u.test(normalizedKey) ||
        (normalizedKey === "code" && parsed.searchParams.has("state")) ||
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
        /^(?:mail|webmail|inbox|banking|patientportal)\./u.test(host)) return reject("unsupported-host");
  }
  const url = parsed.toString();
  if (url.length > PAGE_CONTENT_LIMITS.url) return reject("invalid-url");
  return Object.freeze({ supported: true, url, origin: parsed.origin });
}
