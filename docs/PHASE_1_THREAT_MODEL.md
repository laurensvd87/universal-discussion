# Phase 1 Threat Model: Offline Resolver and Read-only Indicator

Status: Proposed

Last reviewed: 2026-09-19

Owners: Orchestrator and trust/security reviewer

## Purpose

This document defines the security and privacy boundary for two ordered Phase 1 increments:

1. an offline source-to-topic resolver spike using checked-in fixtures; and
2. a read-only desktop-browser indicator that looks up an already-known source/topic and displays separately derived human and agent activity counts.

It is a gate for those increments, not approval for a beta, production deployment, extension-store submission, public writes, AI execution, or collection of real-user telemetry.

The safest sequencing is intentional. The offline spike may proceed without browser or network access. The indicator may use a remote service only after its data-egress, retention, extension-permission, and count-semantics decisions are accepted. Until then, the indicator must use a bundled fixture or local mock.

## Security and privacy objectives

- Preserve the core `Content -> Semantic Topic -> Discussion` model without turning resolution into an unlogged or unreviewable URL join.
- Do not create a browsing-history service as a side effect of topic lookup.
- Treat page content, metadata, canonical links, URLs, fixture data, discussion data, and service responses as untrusted input.
- Make detected private, local, and internal-network contexts ineligible; restrict lookup to reviewed public contexts and minimize the residual risk from authenticated or sensitive pages that cannot be detected reliably.
- Do not let a lookup trigger a URL fetch, DNS resolution, source creation, view increment, post, or any other hidden mutation.
- Keep human and agent identities and counts structurally separate and derive counts from authoritative typed contributions.
- Fail closed: unsupported input, uncertain eligibility, malformed responses, or unavailable services produce an unavailable/unsupported state, not a guessed topic or count.
- Require traceable resolver decisions with method/version, confidence, and evidence metadata.
- Use no AI provider, agent tool, user credential, or provider credential in either increment. The current resolver and local/mock indicator have zero external spend; any remote indicator may use only separately owner-approved first-party infrastructure after its connected-use gate, never an unreviewed analytics or AI service.

## Scope and assumptions

### Increment A: offline resolver

In scope:

- synthetic or deliberately selected public test fixtures checked into the repository;
- bounded parsing of URL, title, metadata, and fixture content;
- URL normalization, content fingerprinting, candidate generation, match scoring, and a conservative no-match result;
- local evaluation against manually labeled expected matches;
- a source-topic decision record containing the resolution method/version and confidence;
- local tests and reports.

The resolver must not access the browser, DNS, the network, a remote model, a remote vector store, user profiles, real browsing history, or secrets. A URL in a fixture is data, not permission to retrieve it.

### Increment B: read-only browser indicator

In scope after its gate passes:

- an explicitly user-invoked browser action or trusted browser sidebar on reviewed public HTTP(S) pages;
- local eligibility and normalization checks;
- lookup of an already-known source/topic through a read-only contract;
- display of topic-level `human_count` and `agent_count`, their freshness, and an unavailable/unsupported state;
- a bundled fixture/local mock first, followed by a narrowly scoped remote lookup only after the relevant ADRs are accepted.

"Read-only" means the request does not create a source or topic, increment a view/activity counter, register an identity, set a tracking cookie, enqueue processing, or mutate any application record. Minimal operational security logging is permitted only under an approved field list and retention period.

Passive observation of every visited page is not in scope. It would materially change the privacy and browser-permission model and requires a separate owner decision and threat-model revision.

## Assets and data classification

| Asset | Sensitivity / integrity need | Phase 1 handling |
| --- | --- | --- |
| Address-bar URL, query, fragment, and navigation timing | Restricted browsing data; queries/fragments may contain secrets or personal data | Inspect locally only for eligibility. Never persist. Never send a fragment, URL credentials, or an unreviewed query. |
| Page body, selection, form values, cookies, local storage, referrer, and authentication state | Highly sensitive page/user data | Do not read or transmit. The fixture-only resolver has no access to them. |
| Page title, canonical link, metadata, and visible text | Untrusted and potentially sensitive/copyrighted | Fixture data only in Increment A. Not transmitted by Increment B without a later approved change. |
| Source lookup value | Pseudonymous browsing data even if hashed | Treat like a URL. Send only after explicit invocation and an approved egress/retention ADR. Do not log the request body. |
| Source-topic mapping, confidence, method, and model/version | Integrity-critical resolution data | Record locally in the spike; do not mutate it from a read-only indicator request. |
| Topic/source identifiers and activity counts | Public-intended but integrity-critical | Return through a strict schema; bind to the request and include freshness. Keep human/agent counts separate. |
| Fixture corpus and labels | Repository data; may carry copyright, personal data, or adversarial strings | Prefer synthetic/minimal excerpts. Record provenance and review before commit. Never include credentials or private pages. |
| Extension state/cache | Can reveal browsing history | Use memory/session scope only for this increment, with a bounded TTL and user-clear path. Do not use synced storage. |
| IP address and service metadata | Personal/operational data | Avoid third-party analytics. Minimize fields and define access-log retention before remote lookup. |
| Source code, dependencies, build artifacts, and extension package | Supply-chain and execution integrity | Lock dependencies, prohibit remote code, scan secrets/dependencies, and review packaged permissions. |

A digest or deterministic token derived from a URL is not anonymous: common URLs can be enumerated, and request timing plus an IP address can remain identifying.

## Data flows and trust boundaries

### Increment A

```text
checked-in fixtures
       |
       | TB-A1: untrusted bytes enter trusted test process
       v
bounded parser -> normalizer/fingerprinter -> candidate scorer
                                             |
                                             v
                           decision record + evaluation report
```

- **TB-A1, fixture boundary:** malformed, oversized, misleading, or instruction-like fixture content crosses into the resolver. It must remain inert data.
- The entire process is local. Any attempted socket, DNS, browser, credential-store, or external-model access is a test failure.

### Increment B

```text
untrusted public page / address-bar URL
       |
       | TB-B1: page context -> isolated extension collector
       v
eligibility + data minimization gate
       |
       | TB-B2: content context -> extension worker/UI
       v
approved lookup payload
       |
       | TB-B3: local extension -> HTTPS service
       v
read-only lookup API -> existing source/topic/count store
       |
       | TB-B4: service response -> extension parser/renderer
       v
trusted browser action/sidebar
```

- **TB-B1, hostile page boundary:** the page can control DOM text, metadata, canonical links, frames, and visual lookalikes. It cannot be trusted to choose the lookup target, counts, code, or policy.
- **TB-B2, extension isolation boundary:** messages from a page/content context require an exact schema, origin/tab binding, size limits, and rejection of unexpected fields.
- **TB-B3, network/service boundary:** the request reveals timing and at least a pseudonymous source lookup. The service and infrastructure must not retain or enrich it beyond the approved policy.
- **TB-B4, response/rendering boundary:** a compromised or malformed service response must not execute code, inject markup, switch tabs/topics, or fabricate a valid-looking result.
- **Build boundary:** package dependencies, generated assets, extension updates, and manifest permissions cross into trusted execution and require independent verification.

The remote shape is shown so its risks are explicit; it is not approved until the indicator gate below passes.

## Threats and required controls

### T1. URL leakage and construction of browsing history

**Threat:** A passive extension, request URL, application log, CDN, analytics SDK, persistent cache, or stable installation identifier creates a per-user navigation history. URL queries/fragments can contain search terms, document IDs, reset tokens, or personal data.

**Required controls:**

- Require an explicit user action for each lookup in this increment.
- Support only reviewed public HTTP(S) contexts. For the remote pilot, start with a domain allowlist and domain-specific query-normalization rules; if query handling is ambiguous, send no request.
- Strip fragments and URL user information locally. Never put the source lookup in an HTTP path or query string; use an allowlisted request body over HTTPS.
- Do not read or transmit page bodies, form fields, selections, cookies, local storage, referrers, or authentication headers.
- Do not send a stable installation ID, account ID, or cookie for the anonymous read-only spike.
- Set an explicit no-referrer/no-credentials request policy, disable third-party analytics, and prohibit request-body logging.
- Treat any lookup digest/token as restricted browsing data. Define server/access-log fields, retention, deletion, and operator access before remote lookup.
- Avoid persistent local history. Any cache must be memory/session scoped, bounded, short-lived, non-synced, and clearable.

### T2. Leakage from private, authenticated, or internal-network pages

**Threat:** The extension reveals intranet hostnames, local services, router/admin panels, development URLs, private documents, or authenticated-resource identifiers.

**Required controls:**

- Reject all schemes except `http` and `https`, and reject URLs containing user information.
- Reject loopback, unspecified, private, link-local, multicast, and unique-local IP ranges after parsing with a standards-compliant URL parser, including unusual numeric IPv4 forms and IPv4-mapped IPv6.
- Reject `localhost`, `.localhost`, `.local`, and reviewed internal/special-use suffixes.
- Do not operate in private/incognito browsing in this increment.
- Do not operate inside frames. Bind a request to the active top-level tab and the exact navigation that the user invoked.
- Use a public-domain allowlist for the first remote pilot. Authentication on a public hostname is not reliably detectable, so allowlisting and explicit invocation are necessary but leave a documented residual risk.
- If eligibility is uncertain, show unsupported locally and make no request.

### T3. Prompt injection and instruction-bearing content

**Threat:** Page text, comments, metadata, fixture content, or a service response tells an agent to reveal secrets, change behavior, call tools, fetch a URL, publish content, or bypass policy.

**Required controls:**

- Neither increment invokes an LLM, agent, tool runner, command interpreter, template evaluator, or dynamic code loader.
- Parse only explicitly defined fields. Instruction-like strings remain inert values and never enter a control channel.
- The extension does not expose cookies, credentials, history, arbitrary fetch, file access, or posting capabilities to page messages.
- Never use `eval`, dynamic script construction, remote code, or unsafe HTML rendering. Use text rendering and a restrictive extension content-security policy.
- Any future AI/agent integration requires a separate threat model; prompt wording alone is not an adequate control.

### T4. SSRF, DNS rebinding, and network pivoting

**Threat:** A fixture or client-supplied URL causes the resolver/API to connect to loopback, private services, cloud metadata, redirect targets, or attacker-controlled DNS, potentially exposing data or credentials.

**Required controls:**

- The offline resolver performs no fetch and no DNS lookup.
- The read-only lookup service treats the lookup value only as a key. It performs no HTTP request, DNS lookup, redirect following, preview generation, unfurling, or asynchronous crawl.
- The endpoint cannot enqueue a fetch or create an unknown source as a side effect.
- If server-side retrieval is later required, stop and produce a separate fetcher threat model and approval. Adding a URL allow/deny list to this endpoint is not sufficient authorization to fetch.

### T5. Malicious DOM, metadata, or service response compromises the extension

**Threat:** Oversized/malformed Unicode, HTML, script URLs, prototype-polluting objects, hostile canonical links, or API fields execute in the extension context or redirect the lookup.

**Required controls:**

- Use isolated extension execution, exact message schemas, own-property checks, length/count limits, timeouts, and a standards-compliant URL parser.
- Prefer the browser-observed top-level URL. Treat a document canonical link as an untrusted hint; do not accept a different origin/site in this increment.
- Render response values as text. Do not display service-supplied HTML or open service-supplied URLs.
- Reject unknown response fields where practical and validate identifiers, counts, timestamps, and enum values before state changes.
- Use a restrictive content-security policy with no remote executable code.

### T6. Count spoofing and human/agent misrepresentation

**Threat:** A page supplies fake activity, a client submits a count, a service conflates source and topic activity, AI activity is presented as human activity, or stale/mismatched responses mislead the user.

**Required controls:**

- Ignore all page-provided discussion/count claims. The indicator accepts counts only from the authoritative lookup response.
- Derive counts server-side from contributions with an immutable/validated actor class. Never accept aggregate counts from the client.
- Return `human_count` and `agent_count` separately as bounded non-negative integers. Do not return only an ambiguous total.
- Bind the response to the requested source/topic and include resolution version, scope (`topic` or `source`), and `as_of` freshness.
- Discard late responses after a tab navigates or a newer request wins.
- On malformed, inconsistent, stale-beyond-policy, or unavailable data, show unavailable rather than zero.
- Place the indicator in trusted browser chrome/sidebar where feasible and label its source. A webpage can visually imitate injected UI, so page-injected badges are excluded from this increment.

### T7. Resolver poisoning and unsafe topic merges

**Threat:** Attackers manipulate canonical tags, tracking parameters, titles, metadata, repeated keywords, Unicode confusables, or content length to force unrelated sources into a topic or fragment one topic into many.

**Required controls:**

- Bound and normalize every feature independently; do not let one client-controlled field force a match.
- Keep semantically meaningful query parameters unless a reviewed per-domain rule says otherwise; tracking removal must be explicit and tested.
- Record resolution method/version, feature evidence, confidence, and fixture provenance.
- Use a conservative threshold and return no-match/separate-topic on ambiguity. The spike must not merge production topics.
- Evaluate false merges separately from false splits and prioritize avoiding false merges for the initial gate.
- Include adversarial and near-duplicate negative fixtures, not only obvious positive matches.

### T8. Resource exhaustion and abuse of the read endpoint

**Threat:** Oversized documents/fields, pathological Unicode, repeated requests, topic enumeration, or crafted candidate sets exhaust local or service resources or scrape activity data.

**Required controls:**

- Enforce byte, character, field, candidate-count, recursion, and execution-time limits.
- Reject rather than truncate identity-bearing fields when truncation could change their meaning.
- Apply endpoint rate limits independent of client cooperation and cap response size.
- Return only the minimum indicator data; do not include comments, user identities, or resolver internals.
- Use generic unsupported/not-found behavior where detailed errors would enable enumeration.

### T9. Logging, telemetry, cache, and error-report leakage

**Threat:** Debug logs, exception traces, crash reports, browser sync, analytics, or caches retain URLs, lookup values, page data, IP correlations, or secrets.

**Required controls:**

- Use structured logging with an explicit field allowlist. Do not log request bodies, raw URLs, DOM content, fixture contents, tokens, headers, or response payloads.
- Disable analytics, session replay, third-party crash reporting, and synced storage for these increments.
- Sanitize errors at the collection point; do not rely on later log scrubbing.
- Document and test cache location, TTL, capacity, and clearing. Prefer no persistent cache.
- Keep operational logs short-lived and access-controlled; the exact period is an ADR input and a remote-lookup gate.

### T10. Excessive browser privilege or supply-chain compromise

**Threat:** Broad host/history/tab/cookie/web-request permissions or a compromised dependency/update turns a narrow indicator into a browsing surveillance or credential-exfiltration tool.

**Required controls:**

- Begin with user-gesture-scoped access and the smallest reviewed manifest. Do not request browsing history, cookies, web request interception, private browsing, or broad all-site access for this increment.
- Limit network permission to the exact development/approved API origin. A need for broader host access stops the increment for review.
- Use pinned/locked dependencies, review transitive additions, prohibit remote code, and generate a reproducible inventory of the packaged extension.
- Run secret and dependency scanning and inspect the final package/manifest rather than only source configuration.

### T11. Network tampering, response mix-up, and failure ambiguity

**Threat:** A network attacker or service bug modifies counts, associates a response with the wrong navigation, or turns an error into a credible-looking zero/activity result.

**Required controls:**

- Use HTTPS to one allowlisted service origin and reject redirects to other origins.
- Correlate the response with a locally generated request nonce and the active tab/navigation without sending a stable installation identifier.
- Validate a versioned response schema and the returned source/topic binding.
- Cancel or ignore results after navigation and use explicit loading, unavailable, unsupported, and found states.
- Do not silently fall back to page-provided data.

## Required verification

Every control relevant to the increment must have an automated check or documented inspection result. The following checks are the minimum gate.

### Increment A1 kernel checks

- **A-NET-01:** Run the full resolver test suite with socket, DNS, subprocess, and external-model access blocked; any attempt fails the test.
- **A-DATA-01:** Inventory fixtures and verify each is synthetic or has recorded public provenance, contains no secret/private URL, and is the minimum excerpt needed.
- **A-PARSE-01:** Exercise empty, malformed, oversized, deeply nested, mixed-encoding, Unicode-confusable, HTML/script-like, instruction-like, and duplicate inputs under explicit limits.
- **A-URL-01:** Table-test non-HTTP schemes, URL credentials, fragments, default ports, case rules, percent encoding, internationalized names, tracking parameters, and semantically meaningful query parameters.
- **A-URL-02:** Property-test deterministic/idempotent normalization and verify distinct security origins do not collapse accidentally.
- **A-RESOLVE-01:** Require every successful link to contain source/topic identifiers, method/version, confidence, and evidence/audit metadata.
- **A-RESOLVE-02:** Verify below-threshold and conflicting evidence returns no-match/separate-topic and does not mutate another topic.
- **A-SECRET-01:** Run secret scanning and verify the spike requires no environment credential or paid service.

Current technical evidence (2026-09-20): all eight Increment A1 checks pass on
Node 24.19.0. The restricted suite enforces process-level capability denial;
fixture provenance is checked from its manifest; the parser tests cover deep,
cyclic, mixed-encoding, hostile-text, duplicate, and exact-boundary cases; the
URL tests include 216 bounded query combinations plus a 768-case origin and
idempotence matrix; and the self-testing package scanner reports zero findings.
One independent read-only audit issued Trust and Quality ACCEPT dispositions
for this technical evidence at code commit `d33f010`, and the Lead marked
offline P1.1 complete. The provenance and outcome are recorded in
`research/P1_1_GATE_REVIEW.md`, ADR-001, and `plans/STATUS.md`; they do not
authorize a browser, network, real-data, provider, correction-execution, or
semantic-quality claim.

### Increment A2 evaluator check

- **A-EVAL-01:** Before the P1.2/P1.4 evaluation gate, report false-merge and false-split rates on held-out labeled positive, near-duplicate, adversarial, and unrelated fixtures. Freeze the threshold and minimum evidence/coverage rules before reading held-out results. This check does not block completion of the smaller deterministic P1.1 kernel.

The dependency-block validator under `spikes/topic-resolution/evaluation/`
tests corpus binding and rejects split leakage, but its current manifest is a
retrospective structural dry run. It does not satisfy A-EVAL-01 and cannot be
used to describe either pilot partition as held out. The separate future-corpus
contract now rejects unsafe shapes, excludes unresolved disagreements, checks
the declared P1.2 collection minimums, and supplies a resolved-label projection
to the strict split wrapper. It contains generated test data only; the actual
corpus, external provenance acceptance, pre-result policy freeze, and held-out
evaluation remain open.

### Increment B checks

- **B-MANIFEST-01:** Inspect the built manifest/package and fail on unapproved permissions or origins, including browsing history, cookies, web-request interception, private-browsing support, broad all-site access, or remote code.
- **B-ELIG-01:** In browser integration tests, make zero requests for `file:`, `data:`, browser-internal, extension, FTP, non-top-level frame, private/incognito, credential-bearing, localhost, special-use, and private/link-local/loopback IP test cases.
- **B-ELIG-02:** Test unusual IP spellings, IPv4-mapped IPv6, `.local`/`.localhost`, cross-origin canonical links, query-token examples, and navigation races. Ambiguity must make no request.
- **B-EGRESS-01:** Capture all extension traffic and assert the exact approved origin, method, headers, and body schema. Assert absence of fragment, user information, raw/unapproved query, page text/title, referrer, cookies, auth headers, account/install ID, and unexpected fields.
- **B-PRIV-01:** Inspect extension storage, browser sync, service/application/access logs, error output, and caches after a lookup; no raw URL, lookup body, DOM data, or stable user identifier may appear.
- **B-SSRF-01:** Instrument service HTTP and DNS clients and submit loopback, private, link-local, metadata-service, redirect, and attacker-DNS values. Assert zero outbound lookup/fetch/DNS calls and zero queued work.
- **B-SIDEFX-01:** Snapshot application state before and after supported, unsupported, and repeated lookups. Assert no source/topic creation, view counter, activity event, identity, cookie, job, or other mutation.
- **B-INJECT-01:** Use a hostile page/fixture that asks the extension to reveal cookies, fetch an attacker URL, change policy, or publish. Assert the strings remain data, no privileged API is called, and no extra field leaves the device.
- **B-RENDER-01:** Fuzz service responses with markup, script/data URLs, prototype keys, invalid identifiers, negative/fractional/huge counts, wrong topics, unknown fields, and stale/out-of-order responses. Assert no execution/navigation and an unavailable state.
- **B-COUNT-01:** Have the page claim a large fake count while the service returns known typed contributions. Assert the page value is ignored and the displayed human/agent counts exactly match independent server aggregation.
- **B-COUNT-02:** Verify source-scoped and topic-scoped counts cannot be interchanged, an agent contribution never increments `human_count`, and malformed/unavailable counts are not rendered as zero.
- **B-NAV-01:** Navigate or switch tabs during lookup and verify late responses cannot update the new page's indicator.
- **B-ABUSE-01:** Verify request/response size limits, timeouts, server-side rate limiting, generic not-found behavior, and bounded memory/cache growth.
- **B-SUPPLY-01:** Run secret/dependency scans, verify the lockfile, inventory the packaged files, check the content-security policy, and confirm there is no remote executable code.

Passing a test with a local mock does not establish that production infrastructure logging and retention are safe. That evidence is required again when a real service is introduced.

## Explicit non-goals

The following are not authorized by this threat model:

- passive/background observation of browsing or a global browsing history;
- operation on incognito/private, local, intranet, document, mail, banking, health, administration, or other deliberately excluded contexts; authenticated/sensitive use on an otherwise public allowlisted host remains a warned residual because it cannot be detected perfectly;
- sending page body text, selections, form values, cookies, storage, referrers, or unreviewed URL queries;
- server-side URL fetching, unfurling, crawling, screenshotting, DNS resolution, or source creation from a lookup;
- accounts, authentication, user profiles, public comments, votes, reactions, reports, moderation actions, or any write endpoint;
- LLM calls, embeddings from an external provider, BYO credentials, agent tools, AI generation, or publication of AI output;
- third-party or autonomous agent posting;
- production telemetry, analytics, growth metrics, or persistent client identifiers;
- automatic topic merge/split or modification of production topic data;
- mobile clients, cross-browser parity, production deployment, extension-store submission, or public beta;
- a final GDPR/legal/store-policy determination or protection against a compromised browser/operating system.

Adding any of these requires an explicit scope change and, where trust boundaries change, a revised threat model and owner approval.

## Required decisions before remote indicator lookup

The browser UI may be implemented against a bundled fixture/local mock while these decisions remain open. A real remote lookup requires accepted records for:

1. exact supported page contexts and user activation/consent;
2. canonicalization and per-domain query handling;
3. the precise egress payload and why each field is necessary;
4. local cache, application log, infrastructure access-log, backup, and deletion/retention policy;
5. extension permissions and current browser/store-policy compatibility;
6. lookup API schema, source/topic binding, count definitions, freshness, and rate limits;
7. fixture/data licensing and handling;
8. operator access and incident response for any retained operational data.

## Residual risks requiring owner acceptance

- Even without a raw URL, a remote service can correlate IP address, timing, user agent, and an enumerable lookup token to infer browsing.
- Explicit invocation and a public-domain allowlist reduce but cannot perfectly identify authenticated or personally sensitive pages on public hosts.
- A malicious page can imitate an in-page indicator visually; trusted browser chrome/sidebar reduces this risk but cannot prevent general phishing.
- Semantic resolution can still be wrong or manipulated. Audit data and conservative fallback limit impact but do not eliminate error.
- A remote service or extension update can later change logging/behavior; release controls and repeat verification are required outside this spike.

## Stop/go security gate

### Go: offline resolver

Proceed only when:

- its implementation is limited to the Increment A scope;
- the test process has enforced zero-network/zero-DNS behavior;
- fixtures have provenance/privacy review;
- resolver decisions are deterministic, bounded, auditable, and conservative on ambiguity;
- all applicable Increment A1 checks pass; and
- the implementation plan defines the evaluation threshold before results are used for a go decision.

P1.2/P1.4 may claim an evaluated resolver only after A-EVAL-01 also passes; P1.1 alone makes no clustering-quality claim.

Stop if the spike needs live browsing data, a credential, a paid/remote model, remote storage, or automatic production-topic mutation.

### Go: read-only indicator with fixture/local mock

Proceed after the offline contracts are stable if:

- the extension is user-invoked, read-only, minimally privileged, and outside private/sensitive contexts;
- it uses only a bundled fixture or local mock with no real browsing-data egress;
- it displays authoritative human and agent counts separately and fails closed; and
- applicable manifest, eligibility, injection, rendering, navigation, and count checks pass.

### Go: read-only indicator with remote lookup

Proceed only when all of the following are true:

- every decision in “Required decisions before remote indicator lookup” is accepted;
- the exact egress and retention behavior is visible to the user and approved by privacy/security review;
- the service performs no fetch, DNS lookup, hidden mutation, telemetry enrichment, or body logging;
- the built extension has the minimum reviewed permissions and passes current platform/store-policy research;
- all applicable `B-*` checks pass against the real service and infrastructure, including log/storage inspection; and
- residual risks are explicitly accepted by the owner.

### Stop

Do not advance the affected increment if any of these is true:

- a raw URL/query, page content, private/internal target, credential, stable user identifier, or lookup body appears in an unapproved request, log, cache, analytics system, or synced storage;
- the extension needs passive all-page observation, broad host/history/cookie/web-request access, or private-browsing operation without a new decision and threat-model review;
- any supplied URL can trigger server-side DNS, fetch, redirect, job, source creation, or another mutation;
- human and agent counts are conflated, client/page-supplied, unauditable, or displayed under the wrong source/topic;
- untrusted content can execute code, reach an agent/tool/control channel, or access extension privileges;
- required tests/scans fail, required retention/permission decisions remain open, or the implementation exceeds the explicit non-goals; or
- work would require deployment, purchase, public announcement, store submission, or real-user collection without the separately required owner approval.
