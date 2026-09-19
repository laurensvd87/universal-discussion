import { isIP } from "node:net";
import { Buffer } from "node:buffer";

import { fail } from "./errors.js";

const TRACKING_PARAMETER_NAMES = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "gbraid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "wbraid",
  "_ga",
  "_gl",
]);

const LOCAL_HOST_SUFFIXES = [
  ".example",
  ".home",
  ".home.arpa",
  ".internal",
  ".invalid",
  ".lan",
  ".local",
  ".localhost",
  ".onion",
  ".test",
];

const MAX_URL_BYTES = 8_192;
const MAX_QUERY_SEGMENTS = 100;

function isTrackingParameter(name) {
  const normalizedName = name.toLowerCase();
  return normalizedName.startsWith("utm_") || TRACKING_PARAMETER_NAMES.has(normalizedName);
}

function parseIpv4(hostname) {
  return hostname.split(".").map((part) => Number.parseInt(part, 10));
}

function isNonPublicIpv4(hostname) {
  const [first, second, third] = parseIpv4(hostname);

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function expandIpv6(address) {
  if (address.includes("%")) {
    return null;
  }

  let normalizedAddress = address.toLowerCase();
  const ipv4Match = normalizedAddress.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Match) {
    const ipv4 = ipv4Match[1];
    if (isIP(ipv4) !== 4) {
      return null;
    }
    const octets = parseIpv4(ipv4);
    const replacement = `${((octets[0] << 8) | octets[1]).toString(16)}:${(
      (octets[2] << 8) |
      octets[3]
    ).toString(16)}`;
    normalizedAddress = normalizedAddress.slice(0, -ipv4.length) + replacement;
  }

  const halves = normalizedAddress.split("::");
  if (halves.length > 2) {
    return null;
  }

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;

  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return null;
  }

  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8) {
    return null;
  }

  const parsed = groups.map((group) => Number.parseInt(group || "0", 16));
  if (parsed.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) {
    return null;
  }

  return parsed;
}

function isNonPublicIpv6(hostname) {
  const groups = expandIpv6(hostname);
  if (!groups) {
    return true;
  }

  const isUnspecified = groups.every((group) => group === 0);
  const isLoopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  const isUniqueLocal = (groups[0] & 0xfe00) === 0xfc00;
  const isLinkLocal = (groups[0] & 0xffc0) === 0xfe80;
  const isMulticast = (groups[0] & 0xff00) === 0xff00;
  const isTeredo = groups[0] === 0x2001 && groups[1] === 0;
  const isBenchmark = groups[0] === 0x2001 && groups[1] === 2 && groups[2] === 0;
  const isDocumentation = groups[0] === 0x2001 && groups[1] === 0x0db8;
  const isDocumentationV2 = groups[0] === 0x3fff && (groups[1] & 0xf000) === 0;
  const isFormerSixBone = groups[0] === 0x3ffe;
  const isOrchid =
    groups[0] === 0x2001 &&
    ((groups[1] & 0xfff0) === 0x10 || (groups[1] & 0xfff0) === 0x20);
  const isSixToFour = groups[0] === 0x2002;
  const isIpv4Mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;

  if (isIpv4Mapped) {
    const ipv4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return isNonPublicIpv4(ipv4);
  }

  // Start from the 2000::/3 global-unicast allocation and reject the explicit
  // special-use ranges above. This is not a live registry or route check.
  const isGlobalUnicast = (groups[0] & 0xe000) === 0x2000;
  return (
    isUnspecified ||
    isLoopback ||
    isUniqueLocal ||
    isLinkLocal ||
    isMulticast ||
    isTeredo ||
    isBenchmark ||
    isDocumentation ||
    isDocumentationV2 ||
    isFormerSixBone ||
    isOrchid ||
    isSixToFour ||
    !isGlobalUnicast
  );
}

function assertPublicHostname(rawHostname) {
  if (rawHostname.endsWith(".")) {
    fail("AMBIGUOUS_HOST", "Absolute DNS names with a trailing dot are not supported");
  }

  const hostname = rawHostname.replace(/^\[|\]$/g, "").toLowerCase();
  const ipVersion = isIP(hostname);

  if (ipVersion === 4 && isNonPublicIpv4(hostname)) {
    fail("NON_PUBLIC_HOST", "URL host must not be a local or non-public IPv4 address");
  }

  if (ipVersion === 6 && isNonPublicIpv6(hostname)) {
    fail("NON_PUBLIC_HOST", "URL host must not be a local or non-public IPv6 address");
  }

  if (ipVersion !== 0) {
    return hostname;
  }

  if (
    !hostname.includes(".") ||
    hostname === "localhost" ||
    LOCAL_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    fail("NON_PUBLIC_HOST", "URL host must be a public, fully qualified hostname");
  }

  const labels = hostname.split(".");
  const validDnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (labels.some((label) => !validDnsLabel.test(label))) {
    fail("INVALID_HOST", "URL host contains an invalid DNS label");
  }

  return hostname;
}

function decodedQueryParameterName(segment) {
  const equalsAt = segment.indexOf("=");
  const rawName = equalsAt === -1 ? segment : segment.slice(0, equalsAt);

  try {
    return decodeURIComponent(rawName.replace(/\+/g, " "));
  } catch {
    // Preserve malformed-but-parseable query data instead of decoding it
    // lossily or guessing that it is a tracking key.
    return null;
  }
}

function uppercasePercentEscapes(value) {
  return value.replace(/%[0-9a-f]{2}/gi, (escape) => escape.toUpperCase());
}

function removeApprovedTrackingParameters(rawSearch) {
  if (rawSearch === "") {
    return "";
  }

  const segments = rawSearch.slice(1).split("&");
  if (segments.length > MAX_QUERY_SEGMENTS) {
    fail("INPUT_TOO_LARGE", `URL query must contain at most ${MAX_QUERY_SEGMENTS} segments`);
  }

  const retained = segments.filter((segment) => {
    const decodedName = decodedQueryParameterName(segment);
    return decodedName === null || !isTrackingParameter(decodedName);
  });

  if (retained.length === 1 && retained[0] === "") {
    fail("AMBIGUOUS_QUERY", "Tracking removal must not leave a bare query delimiter");
  }

  return retained.length === 0
    ? ""
    : `?${retained.map(uppercasePercentEscapes).join("&")}`;
}

/**
 * Normalize an absolute, public HTTP(S) URL without making a network request.
 */
export function normalizePublicHttpUrl(input) {
  if (typeof input !== "string") {
    fail("INVALID_URL", "URL must be a non-empty string");
  }
  if (input.length > MAX_URL_BYTES) {
    fail("INPUT_TOO_LARGE", `URL must be at most ${MAX_URL_BYTES} UTF-8 bytes`);
  }
  if (Buffer.byteLength(input, "utf8") > MAX_URL_BYTES) {
    fail("INPUT_TOO_LARGE", `URL must be at most ${MAX_URL_BYTES} UTF-8 bytes`);
  }
  if (input.trim() === "") {
    fail("INVALID_URL", "URL must be a non-empty string");
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    fail("INVALID_URL", "URL must be an absolute URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail("UNSUPPORTED_SCHEME", "Only http and https URLs are supported");
  }

  if (url.username !== "" || url.password !== "") {
    fail("CREDENTIALS_NOT_ALLOWED", "Credentialed URLs are not supported");
  }

  const fragmentAt = url.href.indexOf("#");
  const hrefWithoutFragment = fragmentAt === -1 ? url.href : url.href.slice(0, fragmentAt);
  if (url.search === "" && hrefWithoutFragment.endsWith("?")) {
    fail("AMBIGUOUS_QUERY", "URLs with a bare query delimiter are not supported");
  }

  const publicHostname = assertPublicHostname(url.hostname);
  url.hostname = publicHostname;
  url.hash = "";
  url.pathname = uppercasePercentEscapes(url.pathname);
  url.search = removeApprovedTrackingParameters(url.search);

  return url.href;
}
