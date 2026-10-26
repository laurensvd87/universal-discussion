# Portable backend and hosting plan

Updated: 2026-10-13.
Status: PostgreSQL is the selected canonical target; implementation remains
offline and grants no deployment or owner-data migration approval.
Decision records: [ADR-092](../decisions/ADR-092-portable-self-hosted-backend-plan.md)
and [ADR-114](../decisions/ADR-114-postgresql-canonical-concurrency-target.md).

Current PostgreSQL checkpoint: the isolated
[`canonical-v4`](../apps/local-service/portable/canonical-v4/README.md) path now
has a checksummed lossless normalized-v2 empty-target importer, coherent bounded
read facade and EXECUTE-only human root/reply command boundary. Independently
reviewed migration 004 is an offline durable admission/lease/fairness,
canonical-request validation and exhaustive exact-double Ridge matcher
foundation with separated app/crawler/worker roles. Portable tests pass 83/83;
004 hashes to
`728CE42C013BE5DD8DF41CB259E08900E1C9B4213AECBACDA9B378DC5B38932F`.
The canonical ingestion apply command is intentionally absent. This code is not loaded by the API, worker, startup,
Compose or live service. Native PostgreSQL permissions/concurrency/recovery/load,
HTTP and identity integration, Source-scoped admission witnesses, complete
ingestion/lifecycle apply, dashboard,
account/private storage, backup/restore and cutover acceptance remain open.
The checked SQLite service, owner stores and active crawler remain untouched;
no restart, deployment, remote listener or PostgreSQL owner-data import follows.

Local canonical checkpoint: [ADR-098](../decisions/ADR-098-normalized-canonical-storage-and-ranked-discovery.md)
implements normalized SQLite and scoped/versioned read/write integration in the
current local application. Aggregate JSON/post ceilings are removed in that
adapter; the approved lossless owner-local conversion is complete under
[ADR-099](../decisions/ADR-099-online-encrypted-canonical-backup-and-cutover.md). This
preserves current exact vectors, Topics, posts and ownership, and is not a second
portable identity or the ADR-114 PostgreSQL migration. Global ingest/regroup and
full-thread UI paths still need scale work. H1's offline synthetic import
foundation exists; native owner import, HTTP/matching/identity/client integration
and operations acceptance remain open. No deployment follows.

Implementation checkpoint: the owner now approves repository preparation under
[ADR-093](../decisions/ADR-093-private-portable-backend-rehearsal.md). The
[synthetic portable package](../apps/local-service/portable/README.md) implements
normalized storage, private API/worker and packaging parts of H1/H2, not their
complete acceptance. H0's bounded Trust review passes. Native image/SQL/permission/
restore evidence, owner import/identity continuity, full ingestion apply and
real-client integration remain open. Docker/WSL are absent on Windows; the
intended private rehearsal host is now the existing Ubuntu 26.04 LTS VLAN
computer. No UDR, remote, deployment, owner-data, mail or provider operation has
occurred.

Latest owner direction: compare low-cost cloud hosting to skip the home-hosting
step, especially Cloudflare versus AWS. The rented pilot recommendation below
is conditional on explicit host/budget/data approval; the Ubuntu/UDR path is not
a prerequisite if the owner selects remote rehearsal instead.

Dormant backup checkpoint (2026-10-12): the portable package now includes a
tested scheduler core with explicit start/stop, serialized real completion,
verified-success/retention gating and fixed safe status. Independent Trust and
52 portable offline checks pass. No runtime/Compose activation follows. Complete
encrypted/off-host adapters, restart/distributed fencing, stalled-work monitoring
and native recovery evidence remain open; the manual plaintext synthetic dump is
not an eligible automatic-backup adapter. See the portable guide and ADR-099.

## Recommendation

Build one portable Node backend with PostgreSQL and pgvector, packaged as Linux
containers. Prepare and test code on Windows; the owner's existing Ubuntu computer
is the selected next private container-rehearsal path. Windows Docker Desktop/
WSL remains an alternative, not an installation assignment. Move the same images
to a suitable Linux host when other people need dependable access. Keep managed
PostgreSQL as a later option rather than a dependency.

This preserves the existing `Content -> Semantic Topic -> Discussion` product
and serves the extension, a web client, Android and iOS through the same API.
Extension rejection would not make the backend disposable. A web client can
accept shared/pasted URLs and display discussions, but cannot automatically
read arbitrary browser tabs; each client still needs its own permitted capture
mechanism and platform review.

A Windows PC is appropriate for development and, after a separate access review,
a small private pilot. It is not the recommended public launch host: sleep,
reboots, home connectivity and physical loss interrupt the service. Containers
make installation repeatable, not the machine highly available. Prefer a small
rented Linux server before promising access to strangers; self-hosting can mean
operating our own software on rented hardware, not necessarily at home.

Docker supports WSL-backed Linux containers on Windows, and Compose can reuse a
deployment definition across development and a single production server.
[Windows installation](https://docs.docker.com/desktop/setup/install/windows-install/),
[Compose production guidance](https://docs.docker.com/compose/how-tos/production/).

## Low cost cloud pilot

Checked 2026-10-11. A small rented EU Linux server can run the prepared Node API,
worker and PostgreSQL/pgvector without a platform rewrite. Two shared x86 vCPU
and 4 GB RAM are a plausible starting target, not measured capacity. No GPU or
server-side embedding inference is required by the present design. Domain,
separate database-backup storage, mail and provider usage are additional costs.

Hetzner CX23 has 4 GB RAM and 40 GB NVMe. Current EU server price is EUR 5.49
excluding VAT, IPv4 is EUR 0.50, and provider disk backups add 20% of the server
price. With 19% VAT this is approximately EUR 8.44/month. Hourly billing has a
server monthly cap; traffic overage and other resources are not covered by that
cap. The cheapest plan's availability must be checked before purchase: the public
page has blank dynamic prices and unavailable labels, not verified stock.
[Current price](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/),
[resources](https://www.hetzner.com/cloud/cost-optimized/),
[IPv4](https://docs.hetzner.com/cloud/servers/primary-ips/overview/),
[billing and backups](https://docs.hetzner.com/cloud/billing/faq/).

Netcup VPS Lite 1 G12.5s offers 2 vCore, 4 GB RAM, 80 GB SSD and IPv4/IPv6 for
EUR 5.86/month including 19% VAT. Its six-month minimum and billing period imply
approximately EUR 35.16 upfront. Included snapshots do not establish automatic
off-server database backups.
[Exact plan](https://www.netcup.com/de/server/vps/vps-lite-1-g12.5s-6m).

Both are self-managed: OS patching, access controls, database backups, restoration
and monitoring remain our responsibility. Provider disk backups do not replace
the database backup/restore rehearsal. Prefer the cancellable Hetzner option for
a short experiment if available; a six-month contract needs its own approval.

### Cloudflare versus AWS

Both can scale, but AWS is the more direct backend fit for the existing Linux
containers. A small Lightsail VM is a simple starting path: USD 12/month for 2 GB
RAM or USD 24/month for 4 GB, public IPv4 included, before tax/backups/domain.
The cheaper USD 5 plan has only 0.5 GB RAM and is not our proposed full-stack
target. Larger deployments can move container workloads to ECS/Fargate and the
database to managed PostgreSQL; that requires an operational/database cutover,
not just an automatic Lightsail setting.
[Lightsail pricing](https://aws.amazon.com/lightsail/pricing/),
[ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html).

Cloudflare Workers can serve an API and Hyperdrive connects to an existing
PostgreSQL database; Hyperdrive does not host the database. Adapting the current
API/worker lifecycle is additional work. Containers are also available, but
their disks are ephemeral by default; point-in-time snapshots are not a live
durable PostgreSQL design. Workers Paid starts at USD 5/month, with container
usage and an external database beyond that baseline. Cheap request execution
does not establish a USD 5 total backend.
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Hyperdrive](https://developers.cloudflare.com/hyperdrive/),
[container lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/),
[container pricing](https://developers.cloudflare.com/containers/platform/pricing/).

Cloudflare's DNS/CDN/DDoS front can complement a backend at AWS or a rented EU
server; it is not an either/or infrastructure choice.
[Cloudflare plans](https://www.cloudflare.com/plans/).
Railway is another lower-operations candidate, but its USD 5 Hobby minimum
includes only USD 5 resource usage, not unlimited application/database resources.
[Railway pricing](https://railway.com/pricing).

For a few-euro pilot, prefer the existing containers on an inexpensive EU VPS.
If choosing specifically between Cloudflare and AWS for the backend, prefer AWS
for compatibility and accept the higher starting budget; Cloudflare is optional
at the edge. Neither selection makes the current synthetic package public-ready.
Finish native container/restore tests, real client/auth/matching integration and
the scoped hosting/privacy/security gates first. No provider or budget is selected
and no purchase, remote listener, migration or public access is authorized.

## Firebase fit

Keep the portable backend recommendation. Firebase is a credible managed-service
alternative when reducing operations matters more than self-hosting, not a Linux
container distribution of our backend. Google explicitly excludes its local
emulators from production self-hosting.
[Emulator scope](https://firebase.google.com/docs/emulator-suite).

Firebase Authentication is the most useful optional part: email/password,
email-link login, social login and recovery can integrate with our own backend.
App usernames, post ownership and authorization still belong to our domain.
Replacing the current identity adapter needs reviewed identity continuity;
do not link existing users by matching email alone.
[Authentication](https://firebase.google.com/docs/auth),
[email-link login](https://firebase.google.com/docs/auth/web/email-link-auth).
This is not general reply-notification delivery: Firebase's Trigger Email needs
a separately configured SMTP service.
[Email delivery](https://firebase.google.com/docs/extensions/official/firestore-send-email).

Firestore does support nearest-neighbor vector search, including our current
384-dimensional vectors. It stores/searches embeddings, not our same-Topic
policy. Standard-edition queries return at most 1,000 neighbors per query;
this is not a total catalog limit. Vector queries lack real-time snapshot
listeners. Document writes/reads and vector index reads contribute to usage
charges beyond applicable free quotas. Continuous browsing ingestion therefore
needs a measured workload, not an assumption of free hosting.
[Vector search](https://firebase.google.com/docs/firestore/vector-search),
[billing](https://firebase.google.com/docs/firestore/pricing).

Firebase SQL Connect (the current destination of the Data Connect documentation)
offers managed PostgreSQL and vector search, so Firebase is not exclusively
NoSQL. It adds Google-managed query/schema/SDK integration rather than running
the prepared Node API unchanged. Its service and Cloud SQL database are separate
billable components, with limited trials rather than permanently free PostgreSQL.
[SQL Connect](https://firebase.google.com/docs/sql-connect),
[pricing](https://firebase.google.com/docs/sql-connect/pricing).

For this project, retain Node/PostgreSQL/pgvector and consider a managed Auth
adapter later if its operating benefit outweighs the added dependency. This
evaluation selects no Firebase provider, opens no project and authorizes no data
transfer, identity migration, spending or deployment.

## Current prototype limits

Keep the working local service unchanged while building the portable path.
Its separation into domain, application, transport and storage modules is useful,
but its current adapters deliberately target one local owner:

- SQLite stores the entire canonical catalog and discussion state in one JSON
  row. Each write validates and rewrites the aggregate under one global revision.
  The 8 MiB document, 1 MiB catalog response and planner work guards remain.
  Moving that same JSON row into PostgreSQL would not solve the bottleneck.
- The CLI requires an interactive terminal; the listener enforces
  `127.0.0.1:4174` and one exact extension Origin. It is not an unattended,
  reverse-proxied public server. Preserve these checks in local mode.
- Accounts now have real local ownership, but provider connection, resumable
  Insight jobs and inference concurrency still target one owner. Account deletion
  is staged across two SQLite stores, not one atomic transaction.
- Windows-protected provider credentials and the account HMAC key are not
  portable container configuration. Local approvals do not authorize uploading
  the owner's catalog, accounts, drafts or credentials to a hosted service.

Evidence: [SQLite adapter](../apps/local-service/src/adapters/sqlite-repository.js),
[repository contract](../apps/local-service/src/domain/repository-contract.js),
[CLI](../apps/local-service/src/cli.js),
[ADR-049](../decisions/ADR-049-remove-prototype-catalog-count-ceiling.md) and
[ADR-091](../decisions/ADR-091-connected-chatgpt-local-accounts.md).

## Target components

```text
Extension / web / Android / iOS
              |
        HTTPS gateway                 Local provider companion
              |                       (optional, separately authorized)
          Node API
              |
         PostgreSQL + pgvector
              |
         Node worker
```

The companion is not an Internet gateway or a second discussion backend. Its
eventual connection to hosted accounts needs a reviewed identity/publication
protocol; local pairing or a caller-supplied account ID cannot establish remote
write authority.

- **One modular Node application.** Reuse existing JavaScript domain rules;
  avoid a language/framework rewrite. Run API and worker commands from the same
  versioned image. Modules cover Sources/matching, discussions, accounts,
  moderation, notifications and provider adapters, not separate microservices.
- **PostgreSQL as the canonical store.** Normalize Sources, the currently approved
  embeddings, canonical Topics/links, discussions, contributions/revisions,
  accounts/identities/sessions, command receipts and job/outbox records. Use
  foreign keys, object versions and transactions. Separate private account data
  logically and through restricted database roles, while keeping post ownership,
  notification intent and deletion transitions transactionally consistent.
- **pgvector for retrieval.** Exact vector search is the initial correctness
  reference. Add an approximate index only when measured need and recall tests
  justify it. pgvector documents that approximation trades recall for speed;
  filters and scan limits also affect results.
  [pgvector documentation](https://github.com/pgvector/pgvector).
- **Database-backed jobs first.** Matching/index maintenance and, when approved,
  reply-mail delivery use durable jobs with leases, unique operation IDs and
  bounded backoff. Workers may redeliver; transactional receipts prevent duplicate
  posts and notification intents. Do not claim exactly-once external mail delivery
  without provider support. Provider-generation retries remain governed by their
  existing approvals, not by this generic job policy.
- **Caddy at the hosted edge.** Terminate HTTPS and proxy to a private API port;
  PostgreSQL and worker ports stay private. Automatic certificates need the
  corresponding domain/network setup. TLS does not replace authorization,
  application rate limits or abuse controls.
  [Caddy HTTPS documentation](https://caddyserver.com/docs/automatic-https).

Start without Kubernetes, Redis, Kafka, a dedicated vector service, multi-region
database writes or purchased AI capacity. Add a component only for a demonstrated
bottleneck or security requirement. Compose is the initial single-host launcher,
not an automatic multi-host scaling system.

## Client and data boundaries

The shared API keeps Source, Topic, discussion and contribution identifiers stable
across platforms. Define its contract with OpenAPI and executable compatibility
tests. Keep versioned `/v1` semantics where compatible; introduce explicit endpoint
versions for changed snapshot/concurrency contracts. Do not silently reinterpret
existing extension requests.

Reads use cursor pagination and bounded discussion/source lookups, not download
of the full catalog. Future guest reads expose only explicitly public discussion
records and safe source links. They never return vectors, private identity/contact
data, provider grants, private jobs, drafts or the owner's complete browsing catalog.
Public reading needs no account; posting and private account operations require
server-derived app authority. Local device pairing remains a separate mechanism.

Embedding generation stays on the user device by default. Remote ingestion would receive
only separately approved URL/title/vector/model metadata, not raw page bodies or
a per-user navigation-history table. Vectors and URLs are potentially sensitive,
not anonymous merely because text was transformed. Review query-string handling,
exclusions, account linkage, access controls, retention and deletion before any
remote transfer. Access logs must not accidentally reconstruct that history.

Preserve the current distinction between canonical discussion/write authority and
Ridge1's Source-scoped read projection. An E5 nearest-neighbor index is not Ridge1
grouping. Record model/extractor/policy versions and keep rollback/comparison
available; do not retune on closed cohorts or introduce extra retained vectors
under a hosting change. Provision the frozen policy/coefficient artifacts with
verified version/hash manifests; ignored local service data does not automatically
accompany an image. Shipping those artifacts still requires the applicable
distribution review, separate from using them in a private rehearsal.

Preserve the local ChatGPT companion for the current desktop PoC. Do not move its
single owner's grant into a shared server. Official OpenAI documentation covers
same-user self-hosted runtimes, but directs remotely hosted/paid apps to a separate
interest process; website identity sign-in is currently a limited partner trial.
Therefore hosted identity and hosted plan usage remain separate eligibility/design
decisions, not promised capabilities of the container.
[Plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source),
[website sign-in](https://developers.openai.com/siwc/website).

Keep email/code app login independent of AI availability, with replaceable mail
delivery and no live mail activation yet. Provider identity migration must preserve
verified `(issuer, clientId, subject)` mappings or require explicit verified linking;
matching email/username is not proof. Prefer fresh authentication on a new host,
invalidate old app sessions and handle account-key changes explicitly. Never copy
Windows DPAPI blobs into Linux and assume they remain usable. Reading/posting
should continue when AI is disconnected or ineligible; mobile AI needs its own
supported secure adapter rather than a mandatory Windows companion.
Re-key identity verifiers through a trusted, validated import and test that a
returning verified identity resolves to its existing account. Session invalidation
alone is not ownership migration; a changed namespace needs verified linking.

## Implementation sequence

Each slice must leave the existing local PoC usable. Synthetic data comes first;
an actual owner-data cutover is a later, separately reviewed operation.

| Slice | Deliverable | Acceptance |
| --- | --- | --- |
| H0 Contract and threat model | Hosted/local separation, public projection, API/concurrency contract, data inventory and migration map | No implicit publication or identity inheritance; preserve Source anchors, canonical authority and legacy ownership |
| H1 Relational backend | Async query/transaction repositories, PostgreSQL migrations, normalized records, exact matching reference, paginated reads | Same domain/rights tests; unrelated concurrent writes succeed; replay cannot duplicate a post; synthetic v2/v3 imports, key/identity continuity and crash recovery pass |
| H2 Portable package | Pinned Linux images, unattended API/worker entrypoints, Compose, sample config, health/readiness, migration and backup/restore commands | Same synthetic suite on Windows/WSL and Linux; development ingress bound to host loopback; no owner databases/grants mounted; AI/mail off |
| H3 Incremental matching and jobs | Affected-neighborhood planning, durable jobs/outbox, versioned caches and bounded retrieval | Exact-vs-index comparison on frozen evidence; no silent canonical rerouting; deletion invalidates indexes/jobs; worker crashes do not duplicate writes |
| H4 Private pilot readiness | Real app authentication, client endpoint support, TLS, abuse/moderation, rights, monitoring, automated online backups and restore rehearsal | Cross-account access denied; report/block/admin scope tested; limits enforced; approved audience/data/host/budget, unattended backup/failure-alert evidence and actual restore evidence before access |
| H5 Hosting migration | Same images on Linux host or compatible managed PostgreSQL; rehearsed cutover/runbook | IDs, ownership, replies, withdrawals and model versions preserved; no stale dual writers; verified backups and rollback after new writes |
| H6 Measured scaling | Additional workers/API replicas, connection pooling, database/index tuning or managed database | Shared sessions/leases/idempotency work across processes; measured latency, recall and recovery targets; spending changes explicitly approved |

H1 and H2 may overlap after H0 review; a container shell alone is not completion
of H1. These are future R4 engineering slices, not a replacement for completed
Phase 0 or the owner's 6/6 review. They do not interrupt current local usability
work or activate new infrastructure merely by being listed.

For the Windows rehearsal, keep PostgreSQL data in a Linux named volume, not a
live database folder synchronized through OneDrive or a Windows network share.
Bind development ingress only to Windows loopback and use an alternate test
port so the current service remains running. Local/container listeners need
distinct composition: preserve the current loopback transport rather than making
its strict Host/Origin checks accept arbitrary proxies.

Choose maintained compatible Node/PostgreSQL/pgvector versions and pin image
digests at implementation time. Build for the actual CPU architecture; ARM64
portability requires its own image/test, not an assumption that an AMD64 binary
runs everywhere. Docker Desktop is free for personal use and qualifying small
businesses, with other uses subject to its terms.
[Docker Desktop licensing](https://docs.docker.com/subscription-billing/desktop-license/).

## Growth and cost controls

Start with one API, one worker and one PostgreSQL instance on one machine. Increase
CPU/RAM or worker capacity when measurements identify the constraint. Add stateless
API replicas behind a gateway only after sessions, job ownership, rate limits and
write receipts are shared; adding replicas to the current in-memory runtime is unsafe.
Move the database to a separate or managed host when operations or resource contention
justify it. Extra API replicas do not make the database highly available.

Avoid a fixed page/Topic-member limit. Bound request sizes and per-job work instead,
expand candidate retrieval where necessary, and make capacity failures explicit
without deleting old data. Dense Topics must still paginate all members; the five
Insight-source limit is not a catalog limit. Work queues need fair per-account
limits and backpressure so bursts cannot starve discussion reads or cause
uncontrolled provider/spending activity.

Matching must not re-plan the entire internet-sized catalog on each visit. Fast
known-URL lookup and ingestion acknowledgment precede bounded asynchronous matching;
clients can show pending/loading and poll with backoff. This plan neither changes
current Topic thresholds nor promises identical results from approximate retrieval.
No LLM is required for matching. Measure candidate recall, false joins, index/update
lag and behavior for multilingual/dense/same-event sources before activation.

Size from measured ingestion rate, live connections, hot discussions, disk/index
growth and backup time, not registered-user count. As a raw lower-bound calculation,
one million 384-dimensional float32 vectors use 1.536 GB for coordinates alone;
database rows, indexes, posts, replicas and backups are additional. Thousands of
new pages per second is a different operating budget, not a home-PC promise.

Before buying anything, refresh the cost worksheet for current background capture
and real measured load. Its historical two-new-Sources-per-MAU assumption is not
this workload. Early costs include power/storage or server rental, domain, backup
storage and eventually mail; operator time, patching and incidents are real costs
too. Do not hire a large server or several managed services simply to be
"scalable". No current price, monthly spend or user capacity is committed.

## Migration and operations

Rehearse migration into a fresh synthetic target first. Validate row counts and
exact Source/Topic/discussion/contribution IDs, ownership, parent trees, revisions,
withdrawals and vector/model metadata. Preserve unclaimed legacy actors. A public
target receives only specifically approved records, not a wholesale dump of the
owner's local browsing-derived data.

For cutover, pause writes, take a consistent final export, import and validate,
switch the client endpoint, and keep the old database read-only. Never run two
independent canonical writers. After target writes begin, rollback requires a
forward-compatible export/import or recovery procedure that preserves those new
writes; returning to an old SQLite backup would lose them. Reissue app sessions
and verify identity continuity separately from discussion-data migration.

Use application-consistent encrypted backups on storage independent of the
computer/server, protect decryption keys separately, and perform a restore drill
before a pilot. PostgreSQL logical dumps support cross-machine migration; a
container image or named volume alone is not a backup.
[PostgreSQL backup documentation](https://www.postgresql.org/docs/current/backup-dump.html).

**Owner requirement (2026-10-12): hosted backups must be automated from the first
hosted pilot, not depend on someone running a command.** Routine backup creation
and expiry must keep the service and sessions connected. Include a scheduler,
encrypted off-host storage, retention cleanup, backup-age/failure alerts and
periodic tested restoration as deployment acceptance. Define recoverable coverage
for canonical data, accounts, private conversations, necessary configuration and
separately protected keys; the current Windows canonical-only recovery file is
not sufficient. Exact cadence, retention, destination, keys and costs must be
agreed in the hosting activation package. This records a future requirement,
not permission to start a local schedule, transfer data or buy hosting now.

Start a private-pilot recovery proposal at at most 24 hours of data loss and
restoration within four hours, subject to demonstrated restore results and owner
acceptance; tighten the target before making public reliability promises.

Provide simple start/stop/update/status/backup/restore commands and a small
operator status page, with safe defaults and no secret printing. Health/readiness
must distinguish a running process from a migrated, reachable database. Log
bounded error codes and request IDs; redact tokens, OAuth codes, page text, private
drafts and identity data. Existing explicit raw-debug approval stays owner-local
and does not apply to hosted logs. Restrict admin endpoints and database roles,
authenticate status access, patch dependencies, rotate secrets and document who
receives alerts and can restore the service.

Deletion must cover live records, revisions, jobs, indexes and caches while
preserving other users' reply topology. Backups need a defined expiry and an
erasure replay procedure before a restored service accepts traffic. Encryption
does not by itself fulfill erasure. Real launch additionally needs reviewed
moderation/takedown/report/block flows and applicable privacy/store requirements;
containerization supplies none of that clearance.

## Next step and approval boundaries

H0 review and synthetic H1/H2 repository preparation are complete under ADR-093.
The next implementation work is the remaining native container/restore and
real-client/account/matching readiness, not repeated foundation work or opening
the current port. A private rental-based rehearsal can replace home rehearsal
only after the owner selects its exact host, budget and data/activation scope.

Before external access, resolve the specific audience, host/region, transmitted
data, retention/backups, domain, budget, real authentication and abuse/operations
package with the owner. Mail activation and hosted provider eligibility are
separate decisions. Remote data migration, invitations/publication and each
platform/store submission remain explicit gates. None is pre-approved by this
plan, a model switch or the standing Git permission.
