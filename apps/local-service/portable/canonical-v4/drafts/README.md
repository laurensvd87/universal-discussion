# Public named-subject registry building block

This SQL is intentionally **not a registered migration/profile**. It is executed
only by the maintained owned native PostgreSQL fixture. Ordinary startup, HTTP,
the crawler and the live schema17 database do not install it. Migrations1-17 stay
unchanged. It must join the complete additive hierarchy18 profile before rollout.

`../public-subject-registry.js` validates public Wikidata entity metadata through
the measured exact-sitelink resolver, then calls one protected import function.
There is no provider request in this adapter. Imports allocate UUIDs by provider
entity ID, never by a name, embedding or a disposable proposal hash. Label updates
retain that UUID and immutable earlier records. Repeated identical revisions can
arrive in different API batches without changing first-response provenance.
Older revisions, conflicting same-revision meaning and reassigned sitelinks are
explicit conflicts. The entire function call rolls back on a batch conflict.

Sorted advisory lock numbers serialize overlapping imports only. Lookup uses one
ordinary MVCC SELECT joining the exact site/title to the current metadata version.
The app role can execute that read; app, worker and crawler cannot import or read
or mutate underlying tables. The importing owner retains its ordinary owner
authority. These are public metadata permissions, not Source or posting proof.

The real native fixture separately requires eight new metadata assertions and
the original25 semantic cases. It uses the same owned lifecycle, eight physical
clients,1GiB Job/64MiB Node and original resource floors. Role assertions use
transaction-local role changes on the existing owner connection, not additional
untracked connections. Its frozen transport retains25/3 counters; the eight new
cases remain an additional exact required array in the child result. Neither
metadata quality nor simultaneous metadata-writer throughput is inferred from
the original bounded head-switch contention test.

No ancestry, embedding, Source binding, membership, contribution, canonical route
or public topic search is created here. Upcoming integration must include exact
Source/version/receipt fences, erasure, the context actually seen by the author,
indexed paginated discovery and a complete profile/role/recovery/UI check. The
external public-data record must not become a reason to export private browsing
inventory. General-page contextual linking and novel-event grouping still need
their own prospective evidence; exact Wikipedia identity does not solve them.
