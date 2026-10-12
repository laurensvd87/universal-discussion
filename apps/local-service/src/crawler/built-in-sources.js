import { readSeedManifest } from "./url-policy.js";

const HOSTS = Object.freeze([
  "en.wikipedia.org",
  "de.wikipedia.org",
  "fr.wikipedia.org",
  "es.wikipedia.org",
]);

const RIGHTS_BASIS = "Wikimedia public pages; retain only URL, title, fingerprints and embedding. " +
  "Terms: https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use";

function bucket(id, pages) {
  return Object.freeze({
    id,
    rightsBasis: RIGHTS_BASIS,
    maxPages: 1_000,
    allowedHosts: HOSTS,
    allowedQueryKeys: Object.freeze([]),
    seeds: Object.freeze(HOSTS.map((host, index) => `https://${host}/wiki/${pages[index]}`)),
  });
}

// These stable, query-free overview articles are deliberately spread across
// subjects and four language editions. Discovery never leaves their exact
// HTTPS origins, even when a page links to another Wikimedia property.
export const BUILT_IN_SOURCE_MANIFEST = readSeedManifest({
  schema: "murmingle-crawl-manifest/v1",
  rightsAcknowledged: true,
  buckets: [
    bucket("science", ["Science", "Wissenschaft", "Science", "Ciencia"]),
    bucket("technology", ["Technology", "Technik", "Technologie", "Tecnolog%C3%ADa"]),
    bucket("mathematics", ["Mathematics", "Mathematik", "Math%C3%A9matiques", "Matem%C3%A1ticas"]),
    bucket("health", ["Health", "Gesundheit", "Sant%C3%A9", "Salud"]),
    bucket("nature", ["Nature", "Natur", "Nature", "Naturaleza"]),
    bucket("history", ["History", "Geschichte", "Histoire", "Historia"]),
    bucket("geography", ["Geography", "Geographie", "G%C3%A9ographie", "Geograf%C3%ADa"]),
    bucket("society", ["Society", "Gesellschaft_%28Soziologie%29", "Soci%C3%A9t%C3%A9", "Sociedad"]),
    bucket("politics", ["Politics", "Politik", "Politique", "Pol%C3%ADtica"]),
    bucket("economics", ["Economics", "Wirtschaftswissenschaft", "Sciences_%C3%A9conomiques", "Econom%C3%ADa"]),
    bucket("culture", ["Culture", "Kultur", "Culture", "Cultura"]),
    bucket("art", ["Art", "Kunst", "Art", "Arte"]),
    bucket("literature", ["Literature", "Literatur", "Litt%C3%A9rature", "Literatura"]),
    bucket("music", ["Music", "Musik", "Musique", "M%C3%BAsica"]),
    bucket("philosophy", ["Philosophy", "Philosophie", "Philosophie", "Filosof%C3%ADa"]),
    bucket("sport", ["Sport", "Sport", "Sport", "Deporte"]),
  ],
});

export const BUILT_IN_SOURCE_ID = "wikimedia-balanced-v1";

export function isBuiltInSourceUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); }
  catch { return false; }
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || url.search || url.hash ||
      !HOSTS.includes(url.hostname.toLowerCase()) || !url.pathname.startsWith("/wiki/")) return false;
  let title;
  try { title = decodeURIComponent(url.pathname.slice(6)); }
  catch { return false; }
  return Boolean(title) && !title.includes(":") && !/[\p{Cc}\p{Cf}]/u.test(title);
}
