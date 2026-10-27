import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ServiceError, fail } from "../domain/errors.js";
import { frozenClone, readExpectedVersion, readId, readRecord, readText } from "../domain/validation.js";
import { isAccountActor, isAccountPrincipal, ACCOUNT_COMMANDS } from "../accounts/account-principal.js";
import { normalizeMyChatsQuery } from "./account-public-chats.js";
import { MAX_RESPONSE_BYTES } from "../domain/discussion-view.js";
import { REFERENCE_TOPIC_POLICY_VERSION } from "../domain/reference-topic-membership.js";
import { RIDGE_TOPIC_SCHEMA } from "../domain/ridge-topic-adapter.js";
import { createPostgresPublicReadFlights } from "./postgres-public-read-flights.js";
import { inspectPageNavigationUrl } from "../../../../spikes/topic-resolution/browser/core/page-content-policy.js";

const PAGE_LIMIT = 100;
const PAGE_BYTES = MAX_RESPONSE_BYTES - 4096;
const CURSOR_SCHEMA = "account-public-chats/v1";
const encoder = new TextEncoder();

export const POSTGRES_DEMO_ACTORS = Object.freeze([
  Object.freeze({ id: "demo-alex", displayName: "Alex · synthetic", type: "human", demo: true }),
  Object.freeze({ id: "demo-blair", displayName: "Blair · synthetic", type: "human", demo: true }),
]);

function sameVersion(left, right) {
  return left?.generation === right?.generation && left?.revision === right?.revision;
}

function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function newestFirst(left, right) {
  return compareText(right.createdAt, left.createdAt) || compareText(right.id, left.id);
}
function oldestFirst(left, right) {
  return compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id);
}

function dtoSize(value, label) {
  if (encoder.encode(JSON.stringify(value)).byteLength > PAGE_BYTES) fail("capacity", `${label} capacity reached`);
  return frozenClone(value);
}

function commandRequestId(actorId, expected, command) {
  const material = JSON.stringify({ actorId, expected, command });
  return `http-command-${createHash("sha256").update(material).digest("hex")}`;
}

function publicActors(readAccountActors) {
  return [...POSTGRES_DEMO_ACTORS, ...readAccountActors().filter(isAccountPrincipal)]
    .map(({ id, displayName, type }) => ({ id, displayName, type }));
}

function catalogDto(value, model, readAccountActors, topics = value.topics, sources = value.sources) {
  return frozenClone({ version: value.version, model, actors: publicActors(readAccountActors), topics, sources });
}

function discussionFromItems(page, items) {
  const replies = new Map();
  for (const item of items) {
    if (item.rootId === null) continue;
    const list = replies.get(item.rootId) ?? [];
    list.push(item); replies.set(item.rootId, list);
  }
  const roots = items.filter((item) => item.rootId === null).sort(newestFirst).flatMap((root) => {
    const children = (replies.get(root.id) ?? []).sort(oldestFirst);
    if (root.state === "deleted" && children.every((item) => item.state === "deleted")) return [];
    return [{ ...root, replies: children }];
  });
  return { version: page.version, topic: page.topic, discussionId: page.discussionId, roots };
}

function accountCursorKey(key) {
  if (key === undefined) return randomBytes(32);
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) throw new TypeError("Invalid account cursor key");
  return Buffer.from(key);
}

function encodeAccountCursor(key, value) {
  if (value === null) return null;
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}

function decodeAccountCursor(key, value, expected) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 2048 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(value)) fail("invalid", "Invalid request");
  const [payload, signature] = value.split(".");
  const wanted = createHmac("sha256", key).update(payload).digest("base64url");
  const suppliedBytes = Buffer.from(signature), wantedBytes = Buffer.from(wanted);
  if (suppliedBytes.length !== wantedBytes.length || !timingSafeEqual(suppliedBytes, wantedBytes))
    fail("conflict", "Chats changed");
  let decoded;
  try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(payload, "base64url"))); }
  catch { fail("invalid", "Invalid request"); }
  const cursor = readRecord(decoded, ["schema", "actorId", "route", "rootId", "limit", "version", "query", "after"]);
  if (cursor.schema !== CURSOR_SCHEMA || cursor.actorId !== expected.actorId || cursor.route !== expected.route ||
      cursor.rootId !== expected.rootId || cursor.limit !== expected.limit || cursor.query !== expected.query ||
      !sameVersion(readExpectedVersion(cursor.version), expected.version)) fail("conflict", "Chats changed");
  const after = readRecord(cursor.after, expected.route === "list" ? ["updatedAt", "id"] : ["createdAt", "id"]);
  readText(expected.route === "list" ? after.updatedAt : after.createdAt, 64); readId(after.id);
  return after;
}

function accountOwns(entry, actorId) {
  return entry.state === "visible" && (entry.actorType === "human"
    ? entry.authorId === actorId : entry.insight?.operatorId === actorId);
}

function chatTitle(root, topic) {
  return (root.state === "visible" ? root.body : topic.title).replace(/\s+/gu, " ").trim().slice(0, 200);
}

/**
 * HTTP/application projection over the canonical-v4 PostgreSQL read and command
 * boundaries. All canonical operations are asynchronous; account and private
 * repositories remain separate and are supplied only actor projections.
 */
export function createPostgresCanonicalService({ reads, urlSelectionReads = reads, runtime, ingestion = null, lifecycle = null,
  model = Object.freeze({ id: "hand-authored-demo-vectors/1", status: "fixture-only" }),
  resolveAccountActor = null, readAccountActors = () => [], accountCursorSecret, semanticDiscussions = false } = {}) {
  if (!reads || typeof reads.version !== "function" || typeof reads.catalogContext !== "function" ||
      typeof reads.catalogPage !== "function" || typeof reads.discussionPage !== "function" ||
      typeof reads.exactSource !== "function" || !runtime || typeof runtime.command !== "function" ||
      typeof readAccountActors !== "function" || !urlSelectionReads ||
      typeof urlSelectionReads.urlSelection !== "function")
    throw new TypeError("Invalid PostgreSQL canonical service dependencies");
  if (typeof semanticDiscussions !== "boolean" || semanticDiscussions &&
      (["semanticFeed", "semanticThread", "semanticTarget", "semanticTopics", "semanticContext", "semanticStamp"].some(name => typeof reads[name] !== "function")))
    throw new TypeError("Invalid PostgreSQL semantic discussion dependencies");
  const cursorKey = accountCursorKey(accountCursorSecret);
  const publicFlights = createPostgresPublicReadFlights();
  const urlFlights = createPostgresPublicReadFlights({ maxTasks: 8 });
  // Full-catalog optional work has a separate finite memory/CPU bulkhead.
  // It must never consume all core-read admissions as callers/revisions grow.
  const optionalFlights = createPostgresPublicReadFlights({ maxTasks: 2 });

  function actorFor(actorId) {
    const actor = isAccountActor(actorId) && typeof resolveAccountActor === "function"
      ? resolveAccountActor(actorId.slice("account-".length))
      : POSTGRES_DEMO_ACTORS.find((entry) => entry.id === actorId);
    if (!actor || isAccountActor(actorId) && (!isAccountPrincipal(actor) || actor.id !== actorId))
      fail("forbidden", "Actor unavailable");
    return actor;
  }

  function semanticActors(view) {
    const ids = new Set();
    const add = entry => {
      if (entry?.state !== "visible") return;
      const id = entry.actorType === "agent" ? entry.insight?.operatorId : entry.authorId;
      if (id) ids.add(readId(id));
    };
    for (const card of view.roots ?? []) add(card.root);
    if (view.root) { add(view.root); for (const reply of view.root.replies ?? []) add(reply); }
    if (ids.size > 104) fail("capacity", "Semantic actor capacity reached");
    return [...ids].sort().map(id => {
      const principal = isAccountActor(id) && typeof resolveAccountActor === "function"
        ? resolveAccountActor(id.slice("account-".length)) : POSTGRES_DEMO_ACTORS.find(actor => actor.id === id);
      // Account deletion may have completed since the canonical snapshot. A
      // fresh read observes withdrawal; never invent or substitute a username.
      if (!principal || principal.id !== id || principal.type !== "human" ||
          isAccountActor(id) && !isAccountPrincipal(principal)) fail("unavailable", "Semantic author unavailable");
      return { id, displayName: readText(principal.displayName, 80), type: "human" };
    });
  }

  function semanticDto(view) { return dtoSize({ ...view, actors: semanticActors(view) }, "Semantic discussion"); }

  async function allCatalog() {
    if (typeof reads.fullCatalog === "function") return reads.fullCatalog();
    const topics = [], sources = [];
    let version = null, catalogVersion = null;
    for (const kind of ["topics", "sources"]) {
      let cursor = null;
      do {
        const page = await reads.catalogPage({ kind, limit: PAGE_LIMIT, cursor });
        if (catalogVersion !== null && (page.version.generation !== version.generation ||
            page.catalogVersion !== catalogVersion)) fail("conflict", "State changed");
        version = page.version; catalogVersion ??= page.catalogVersion;
        (kind === "topics" ? topics : sources).push(...page.items);
        cursor = page.nextCursor;
      } while (cursor !== null);
    }
    version ??= await reads.version();
    return { version, topics, sources };
  }

  async function context(value) {
    const result = await reads.catalogContext(value);
    return catalogDto(result, model, readAccountActors);
  }

  async function discussion(topicId) {
    topicId = readId(topicId);
    if (typeof reads.fullDiscussion === "function") {
      const full = await reads.fullDiscussion(topicId);
      return frozenClone(discussionFromItems(full, full.items));
    }
    let cursor = null, header = null;
    const items = [];
    do {
      const page = await reads.discussionPage({ topicId, limit: PAGE_LIMIT, cursor });
      if (header && (page.discussionId !== header.discussionId ||
          page.version.generation !== header.version.generation || page.discussionVersion !== header.discussionVersion))
        fail("conflict", "State changed");
      header = header === null ? page : { ...header, version: page.version };
      items.push(...page.items); cursor = page.nextCursor;
      if (encoder.encode(JSON.stringify(items)).byteLength > MAX_RESPONSE_BYTES) fail("capacity", "Use paged discussion reads");
    } while (cursor !== null);
    return frozenClone(discussionFromItems(header, items));
  }

  async function selection(value) {
    const input = readRecord(value, ["sourceId", "topicId"]);
    const sourceId = input.sourceId === null ? null : readId(input.sourceId);
    const topicId = readId(input.topicId);
    if (typeof reads.selectionBundle !== "function") fail("unavailable", "Selection unavailable");
    const bundle = await reads.selectionBundle({ sourceId, topicId });
    const catalog = catalogDto(bundle.catalog, model, readAccountActors);
    const selectedDiscussion = frozenClone(discussionFromItems(bundle.discussion, bundle.discussion.items));
    if (!sameVersion(catalog.version, selectedDiscussion.version)) fail("unavailable", "Selection unavailable");
    return dtoSize({ catalog, discussion: selectedDiscussion }, "Selection");
  }

  async function urlSelection(value) {
    const input = readRecord(value, ["url"]);
    const inspected = inspectPageNavigationUrl(input.url);
    if (!inspected.supported || inspected.url !== input.url || inspected.documentUrl !== input.url)
      fail("invalid", "Invalid request");
    // This exact, authenticated recovery projection may be composed over a
    // small independent PostgreSQL pool. Keeping it off the bulk public-read
    // pool prevents timed-out catalog/version waves from monopolizing every
    // connection while preserving the same read-only snapshot validation.
    const bundle = await urlSelectionReads.urlSelection({ url: input.url });
    const catalog = catalogDto(bundle.catalog, model, readAccountActors);
    const selectedDiscussion = frozenClone(discussionFromItems(bundle.discussion, bundle.discussion.items));
    const selected = catalog.sources.filter((source) => source.url === input.url &&
      source.provenance === "owner-local-page-embedding/v1");
    if (selected.length !== 1 || !selected[0].topicId ||
        selectedDiscussion.topic.id !== selected[0].topicId ||
        !sameVersion(catalog.version, selectedDiscussion.version))
      fail("unavailable", "Selection unavailable");
    return dtoSize({ catalog, discussion: selectedDiscussion }, "Selection");
  }

  async function catalogPage(value) {
    const bundled = typeof reads.catalogPageWithContexts === "function"
      ? await reads.catalogPageWithContexts(value) : null;
    const page = bundled?.page ?? await reads.catalogPage(value);
    const topics = new Map(), sources = page.kind === "sources" ? page.items : [];
    if (page.kind === "topics") for (const topic of page.items) topics.set(topic.id, topic);
    else {
      const closures = bundled?.contexts ?? await Promise.all(page.items.map((source) =>
        reads.catalogContext({ sourceId: source.id, topicId: source.topicId })));
      for (const closure of closures) {
        if (closure.version.generation !== page.version.generation ||
            closure.catalogVersion !== page.catalogVersion) fail("conflict", "State changed");
        for (const topic of closure.topics) topics.set(topic.id, topic);
      }
    }
    return dtoSize({ catalog: catalogDto(page, model, readAccountActors, [...topics.values()], sources),
      nextCursor: page.nextCursor }, "Catalog page");
  }

  async function sourceUrlPage(value) {
    const input = readRecord(value, ["limit", "cursor"]);
    if (input.limit !== PAGE_LIMIT || input.cursor !== null && typeof input.cursor !== "string")
      fail("invalid", "Invalid request");
    // Crawler deduplication needs exact retained URLs only. The existing scoped
    // reader still validates Source/link/membership/receipt mirrors and binds
    // the opaque cursor to catalogVersion, without hydrating Topic contexts.
    const page = await reads.catalogPage({ kind: "sources", limit: PAGE_LIMIT, cursor: input.cursor });
    const urls = page.items.map(source => {
      const text = source.url;
      if (typeof text !== "string" || !text.length || text.length > 2048 || /[\p{Cc}\p{Cf}]/u.test(text))
        fail("unavailable", "Source URLs unavailable");
      let url;
      try { url = new URL(text); } catch { fail("unavailable", "Source URLs unavailable"); }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
        fail("unavailable", "Source URLs unavailable");
      return text;
    });
    return dtoSize({ version: page.version, urls, nextCursor: page.nextCursor }, "Source URL page");
  }

  function alternateFromBundle(bundle) {
    const source = bundle.source;
    if (!Array.isArray(source.topicIds) || !source.topicId || !source.topicIds.includes(source.topicId))
      fail("not-found", "Object unavailable");
    const views = bundle.discussions.map((view) => discussionFromItems(view, view.items));
    const seen = new Set(), roots = [];
    for (const view of views) for (const root of view.roots) {
      if (seen.has(root.id)) fail("unavailable", "Duplicate membership discussion");
      seen.add(root.id); roots.push({ ...root, canonicalTopicId: view.topic.id, canonicalDiscussionId: view.discussionId });
    }
    roots.sort(newestFirst);
    if (!Array.isArray(bundle.sourceIds)) fail("unavailable", "Alternate discussion unavailable");
    const sourceIds = bundle.sourceIds.map((id) => readId(id));
    if (!sourceIds.includes(source.id) || sourceIds.some((id, index) =>
      index > 0 && compareText(sourceIds[index - 1], id) >= 0))
      fail("unavailable", "Alternate discussion unavailable");
    return dtoSize({ policyVersion: REFERENCE_TOPIC_POLICY_VERSION, representation: RIDGE_TOPIC_SCHEMA,
      version: bundle.version, sourceId: source.id,
      canonical: { topic: views.find((view) => view.topic.id === source.topicId).topic,
        discussionId: views.find((view) => view.topic.id === source.topicId).discussionId },
      mode: "alternate-provisional", sourceIds, roots, pinnedRoots: [] }, "Discussion");
  }

  async function alternateDiscussion(sourceId) {
    sourceId = readId(sourceId);
    if (typeof reads.alternateBundle === "function")
      return alternateFromBundle(await reads.alternateBundle(sourceId));
    const source = await reads.exactSource(sourceId);
    const discussions = [];
    for (const topicId of source.topicIds ?? []) {
      const view = await discussion(topicId);
      discussions.push({ ...view, items: view.roots.flatMap((root) => [root, ...root.replies]) });
    }
    const catalog = await allCatalog();
    const sourceIds = catalog.sources.filter((entry) => entry.topicIds?.some((id) => source.topicIds.includes(id)))
      .map((entry) => entry.id).sort(compareText);
    return alternateFromBundle({ source, discussions, sourceIds,
      version: discussions[0]?.version ?? catalog.version });
  }

  async function optional(name, work, expected, errors) {
    try {
      const value = await work();
      if (!sameVersion(value.version, expected)) fail("conflict", "State changed");
      return value;
    } catch (error) {
      errors[name] = ["capacity", "conflict", "unavailable"].includes(error?.code) ? error.code : "invalid-response";
      return null;
    }
  }

  async function enrichment(value) {
    const input = readRecord(value, ["sourceId", "topicId", "includeAlternate"]);
    const sourceId = readId(input.sourceId), topicId = readId(input.topicId);
    if (typeof input.includeAlternate !== "boolean") fail("invalid", "Invalid request");
    if (typeof reads.enrichmentBundle === "function") {
      const bundle = await reads.enrichmentBundle(input);
      const catalog = catalogDto(bundle.catalog, model, readAccountActors);
      const canonical = frozenClone(discussionFromItems(bundle.discussion, bundle.discussion.items));
      const alternate = bundle.alternate === null ? null : alternateFromBundle(bundle.alternate);
      return dtoSize({ catalog, discussion: canonical, related: bundle.related,
        priorDiscussions: bundle.priorDiscussions, alternateDiscussion: alternate,
        errors: bundle.errors }, "Enrichment");
    }
    const catalog = await context({ sourceId, topicId }), expected = catalog.version;
    const canonical = await discussion(topicId);
    if (!sameVersion(canonical.version, expected)) fail("conflict", "State changed");
    const errors = { related: null, prior: null, alternate: null };
    const related = typeof reads.relatedSources === "function"
      ? await optional("related", () => reads.relatedSources(sourceId, 20), expected, errors) : null;
    if (related === null && errors.related === null) errors.related = "unavailable";
    const priorDiscussions = typeof reads.priorDiscussions === "function"
      ? await optional("prior", () => reads.priorDiscussions(sourceId), expected, errors) : null;
    if (priorDiscussions === null && errors.prior === null) errors.prior = "unavailable";
    const alternate = input.includeAlternate
      ? await optional("alternate", () => alternateDiscussion(sourceId), expected, errors) : null;
    return dtoSize({ catalog, discussion: canonical, related, priorDiscussions,
      alternateDiscussion: alternate, errors }, "Enrichment");
  }

  function bundledDiscussion(value) {
    if (Array.isArray(value?.items)) return frozenClone(discussionFromItems(value, value.items));
    if (!value?.version || !value?.topic || typeof value.discussionId !== "string")
      fail("unavailable", "Insight context unavailable");
    return frozenClone({ version: value.version, topic: value.topic, discussionId: value.discussionId, roots: [] });
  }

  async function insightBundle(value) {
    if (typeof reads.insightBundle !== "function") fail("unavailable", "Insight context unavailable");
    const bundle = await reads.insightBundle(value);
    const catalog = catalogDto(bundle.catalog, model, readAccountActors);
    const selectedDiscussion = bundledDiscussion(bundle.discussion);
    const followupDiscussion = bundle.followupDiscussion === null
      ? null : bundledDiscussion(bundle.followupDiscussion);
    for (const component of [catalog, selectedDiscussion, bundle.related, bundle.anchor, followupDiscussion])
      if (component !== null && !sameVersion(bundle.version, component.version))
        fail("unavailable", "Insight context unavailable");
    return dtoSize({ version: bundle.version, catalog, discussion: selectedDiscussion,
      related: bundle.related, anchor: bundle.anchor, followupDiscussion }, "Insight context");
  }

  async function insightJobBundle(value) {
    if (typeof reads.insightJobBundle !== "function") fail("unavailable", "Insight context unavailable");
    const bundle = await reads.insightJobBundle(value);
    const followupDiscussion = bundle.followupDiscussion === null
      ? null : bundledDiscussion(bundle.followupDiscussion);
    for (const component of [bundle.anchor, followupDiscussion])
      if (component !== null && !sameVersion(bundle.version, component.version))
        fail("unavailable", "Insight context unavailable");
    return dtoSize({ version: bundle.version, anchor: bundle.anchor,
      followupDiscussion }, "Insight context");
  }

  async function readPublic(method, input = null, guards = {}) {
    // A caller arriving after a mutation must never join an older snapshot.
    // The small revision query also keeps the coalescing key independent of
    // accounts, credentials, and caller-provided version claims.
    let expected = method === "urlSelection" && typeof urlSelectionReads.version === "function"
      ? await urlSelectionReads.version() : await reads.version();
    if (semanticDiscussions && ["semanticFeed", "semanticThread", "semanticTarget", "semanticTopics", "semanticContext"].includes(method)) {
      const stamp = await reads.semanticStamp();
      if (stamp.generation !== expected.generation || typeof stamp.revision !== "string" || !/^[a-f0-9]{64}$/u.test(stamp.revision))
        fail("unavailable", "Semantic read unavailable");
      expected = { ...expected, semanticRevision: stamp.revision };
    }
    const flights = method === "urlSelection" ? urlFlights :
      ["enrichment", "related"].includes(method) ? optionalFlights : publicFlights;
    return flights(method, { input, expected }, admitted => performPublicRead(method, admitted.input), guards);
  }

  async function performPublicRead(method, input) {
    if (method === "catalog") return catalogDto(await allCatalog(), model, readAccountActors);
    if (method === "catalogContext") return context(input);
    if (method === "selection") return selection(input);
    if (method === "urlSelection") return urlSelection(input);
    if (method === "catalogPage") return catalogPage(input);
    if (method === "sourceUrlPage") return sourceUrlPage(input);
    if (method === "discussion") return discussion(input);
    if (method === "discussionPage") {
      const page = await reads.discussionPage(input);
      const { discussionVersion: _discussionVersion, ...dto } = page;
      return frozenClone(dto);
    }
    if (method === "exactSource") return reads.exactSource(input);
    if (method === "alternateDiscussion") return alternateDiscussion(input);
    if (method === "priorDiscussions" && typeof reads.priorDiscussions === "function") return reads.priorDiscussions(input);
    if (method === "related" && typeof reads.relatedSources === "function") return reads.relatedSources(input.sourceId, input.limit);
    if (method === "enrichment") return enrichment(input);
    if (method === "discover" && typeof reads.discover === "function") return reads.discover(input);
    if (semanticDiscussions && method === "semanticFeed") return semanticDto(await reads.semanticFeed(input));
    if (semanticDiscussions && method === "semanticThread") return semanticDto(await reads.semanticThread(input));
    if (semanticDiscussions && method === "semanticTarget") return semanticDto(await reads.semanticTarget(input));
    if (semanticDiscussions && method === "semanticTopics") return reads.semanticTopics(input);
    if (semanticDiscussions && method === "semanticContext") return reads.semanticContext(input);
    fail("unavailable", "Read unavailable");
  }

  async function accountThreads(actorId) {
    if (typeof reads.accountContributions !== "function") fail("unavailable", "Account history unavailable");
    if (typeof reads.accountThreads === "function") {
      const collected = await reads.accountThreads(actorId);
      return { version: collected.version, threads: collected.threads.map(({ topic, discussionId, root }) => ({
        topic, root, view: { version: collected.version, topic, discussionId, roots: [root] },
      })) };
    }
    const owned = await reads.accountContributions(actorId), rootIds = new Set();
    for (const entry of owned.items) if (accountOwns(entry, actorId)) rootIds.add(entry.rootId ?? entry.id);
    const catalog = await allCatalog(), topicById = new Map(catalog.topics.map((topic) => [topic.id, topic]));
    const threads = [];
    for (const topic of catalog.topics) {
      const view = await discussion(topic.id);
      for (const root of view.roots) if (rootIds.has(root.id)) threads.push({ view, topic: topicById.get(topic.id), root });
    }
    const version = await reads.version();
    if (!sameVersion(version, owned.version) || !sameVersion(version, catalog.version) ||
        threads.some(({ view }) => !sameVersion(view.version, version))) fail("conflict", "State changed");
    return { version, threads };
  }

  async function accountPublicChats(actorId, value, route) {
    if (!isAccountActor(actorId)) fail("forbidden", "Actor unavailable");
    const allowed = route === "list" ? ["after", "limit", "query"] : ["rootId", "after", "limit"];
    const required = route === "list" ? ["after", "limit"] : allowed;
    const input = readRecord(value, allowed, required), limit = input.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) fail("invalid", "Invalid request");
    const rootId = route === "list" ? null : readId(input.rootId);
    const query = route === "list" && Object.hasOwn(input, "query") ? normalizeMyChatsQuery(input.query) : "";
    const collected = await accountThreads(actorId);
    const after = decodeAccountCursor(cursorKey, input.after, { schema: CURSOR_SCHEMA, actorId, route, rootId,
      limit, version: collected.version, query });
    let entries = collected.threads.map(({ view, topic, root }) => {
      const messages = [root, ...root.replies], own = messages.filter((entry) => accountOwns(entry, actorId));
      const updatedAt = messages.filter((entry) => entry.state === "visible").map((entry) => entry.createdAt).sort(compareText).at(-1) ?? root.createdAt;
      return { view, topic, root, messages, updatedAt, ownedHuman: own.some((entry) => entry.actorType === "human"),
        ownedAgent: own.some((entry) => entry.actorType === "agent") };
    });
    if (route === "list") {
      const terms = query.split(" ").filter(Boolean).map((term) => term.toLowerCase());
      entries = entries.filter((entry) => terms.every((term) => [entry.topic.title, ...entry.messages
        .filter((message) => message.state === "visible").map((message) => message.body)].some((text) => text.toLowerCase().includes(term))))
        .sort((a, b) => compareText(b.updatedAt, a.updatedAt) || compareText(b.root.id, a.root.id))
        .filter((entry) => after === null || entry.updatedAt < after.updatedAt ||
          entry.updatedAt === after.updatedAt && entry.root.id < after.id);
      const items = entries.slice(0, limit), chats = items.map((entry) => ({ id: entry.root.id, visibility: "public",
        topicId: entry.topic.id, discussionId: entry.view.discussionId, title: chatTitle(entry.root, entry.topic),
        sourceId: entry.root.origin?.sourceId ?? null, sourceUrl: entry.root.origin?.url ?? null,
        createdAt: entry.root.createdAt, updatedAt: entry.updatedAt, actorType: entry.root.actorType,
        ownedHuman: entry.ownedHuman, ownedAgent: entry.ownedAgent }));
      const last = items.at(-1), next = entries.length > items.length && last ? encodeAccountCursor(cursorKey,
        { schema: CURSOR_SCHEMA, actorId, route, rootId, limit, version: collected.version, query,
          after: { updatedAt: last.updatedAt, id: last.root.id } }) : null;
      return dtoSize({ version: collected.version, chats, next }, "Chat page");
    }
    const entry = entries.find((item) => item.root.id === rootId);
    if (!entry) fail("not-found", "Object unavailable");
    let messages = entry.messages.sort(oldestFirst).filter((item) => after === null ||
      item.createdAt > after.createdAt || item.createdAt === after.createdAt && item.id > after.id);
    const page = messages.slice(0, limit), projected = page.map((item) => ({ id: item.id,
      replyToId: item.replyToId ?? item.rootId, actorType: item.actorType, state: item.state,
      body: item.state === "visible" ? item.body : "", createdAt: item.createdAt,
      authorLabel: item.state === "visible" ? actorFor(item.actorType === "agent" ? item.insight.operatorId : item.authorId).displayName : "Deleted by user",
      sourceUrl: item.origin?.url ?? null }));
    const last = page.at(-1), next = messages.length > page.length && last ? encodeAccountCursor(cursorKey,
      { schema: CURSOR_SCHEMA, actorId, route, rootId, limit, version: collected.version, query,
        after: { createdAt: last.createdAt, id: last.id } }) : null;
    const conversation = { id: entry.root.id, visibility: "public", topicId: entry.topic.id,
      discussionId: entry.view.discussionId, title: chatTitle(entry.root, entry.topic),
      sourceId: entry.root.origin?.sourceId ?? null, sourceUrl: entry.root.origin?.url ?? null,
      createdAt: entry.root.createdAt, updatedAt: entry.updatedAt, actorType: entry.root.actorType,
      ownedHuman: entry.ownedHuman, ownedAgent: entry.ownedAgent };
    return dtoSize({ version: collected.version, conversation, messages: projected, next }, "Chat page");
  }

  const service = {
    coherentSnapshotReads: true,
    // Startup enables this only after the semantic schema/model are installed.
    ...(semanticDiscussions ? {
      semanticFeed: input => readPublic("semanticFeed", input),
      semanticThread: input => readPublic("semanticThread", input),
      semanticTarget: input => readPublic("semanticTarget", input),
      semanticTopics: input => readPublic("semanticTopics", input),
      semanticContext: input => readPublic("semanticContext", input),
    } : {}),
    ...(typeof reads.discover === "function" ? {
      discover: Object.freeze({ search: (input) => reads.discover(input) }),
    } : {}),
    actor: actorFor,
    version: () => reads.version(),
    readPublic,
    catalog: () => readPublic("catalog"),
    catalogContext: context,
    selection,
    urlSelection,
    catalogPage,
    exactSource: (sourceId) => reads.exactSource(sourceId),
    discussion,
    discussionPage: (input) => readPublic("discussionPage", input),
    sourceUrlPage: (input) => readPublic("sourceUrlPage", input),
    alternateDiscussion,
    priorDiscussions: (sourceId) => readPublic("priorDiscussions", sourceId),
    related: (sourceId, limit = 5) => readPublic("related", { sourceId, limit }),
    enrichment: value => readPublic("enrichment", value),
    insightBundle,
    insightJobBundle,
    insightAnchor(topicId, sourceId) {
      if (typeof reads.insightAnchor !== "function") fail("unavailable", "Insight context unavailable");
      return reads.insightAnchor(topicId, sourceId);
    },
    insightDiscussion(topicId, includeDiscussion) {
      if (typeof includeDiscussion !== "boolean") fail("invalid", "Invalid request");
      return includeDiscussion ? discussion(topicId) : reads.topicDiscussion(topicId).then((value) => frozenClone({
        version: value.version, topic: value.topic, discussionId: value.discussionId, roots: [],
      }));
    },
    async discussionForContribution(topicId, contributionId) {
      const view = await discussion(topicId), id = readId(contributionId);
      if (!view.roots.some((root) => root.id === id || root.replies.some((reply) => reply.id === id)))
        fail("not-found", "Object unavailable");
      return view;
    },
    ingest(value, guards = {}) {
      if (!ingestion || typeof ingestion.ingest !== "function") fail("unavailable", "Ingestion unavailable");
      return ingestion.ingest(value, guards);
    },
    async command(expectedValue, command, actorId, generatedProof = null) {
      const expected = readExpectedVersion(expectedValue), actor = actorFor(actorId);
      const typeDescriptor = command && Object.getOwnPropertyDescriptor(command, "type");
      if (!typeDescriptor?.enumerable || !Object.hasOwn(typeDescriptor, "value")) fail("invalid", "Invalid request");
      const type = typeDescriptor.value;
      if (isAccountPrincipal(actor) && !ACCOUNT_COMMANDS.has(type)) fail("forbidden", "Action unavailable");
      if (!["create-root", "reply"].includes(type)) {
        if (!lifecycle || typeof lifecycle.command !== "function") fail("unavailable", "Action unavailable");
        return lifecycle.command(expected, command, actor, generatedProof);
      }
      if (generatedProof !== null) fail("invalid", "Invalid request");
      const result = await runtime.command({ actorId, requestId: commandRequestId(actorId, expected, command),
        expected, command });
      return frozenClone({ version: result.version, result: result.result });
    },
    async accountContributions(actorId) {
      if (!isAccountActor(actorId) || typeof reads.accountContributions !== "function")
        fail("unavailable", "Account history unavailable");
      const result = await reads.accountContributions(actorId);
      return frozenClone(result.items.filter((entry) => accountOwns(entry, actorId)));
    },
    accountPublicChats: (actorId, input) => accountPublicChats(actorId, input, "list"),
    accountPublicChat: (actorId, input) => accountPublicChats(actorId, input, "read"),
    withdrawAccountContributions(actorId) {
      if (!isAccountActor(actorId) || !lifecycle || typeof lifecycle.withdrawAccountContributions !== "function")
        fail("unavailable", "Account deletion unavailable");
      return lifecycle.withdrawAccountContributions(actorId);
    },
  };
  return Object.freeze(service);
}
