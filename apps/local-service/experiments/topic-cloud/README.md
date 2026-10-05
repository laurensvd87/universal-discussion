# Synthetic Topic cloud shadow

This isolated experiment exercises ADR-044's overlapping-neighbor and four-page
selection mechanics. It imports no service modules, reads no owner data, makes no
network/provider request, writes no database, and changes no production behavior.
All pages, coordinates, domains and labels in `fixtures.js` were invented for
this test. The coordinates simulate an imperfect **single-vector** signal; they
are not E5 measurements. Fixture relevance grades are authored ground truth for
the tests, never an algorithm input or a claim about semantic truth in the wild.

Run from the repository root:

```powershell
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/experiments/topic-cloud/shadow.test.js
```

The query performs an exact scan, unions the top vector and title-overlap
candidates after near-copy collapse, and returns at most 12 scored edges. These
edges are anchored to the queried page; no reachability expansion, Topic ID,
discussion reassignment or transitive merge occurs. The same page can appear
in several neighborhoods. Sorting uses score then stable ID. The total input
catalog has no fixed cap; a 140-node synthetic test checks this, while query
work remains linear and returned edges remain bounded. This does **not** address
the production service's 100-Source limit, its JSON-row state or indexed scale.

Insight selection makes up to four picks from the bounded neighborhood. It
penalizes high vector/title similarity to already picked pages and repeated
domains. Accessibility is a synthetic flag standing in for an accepted excerpt;
a suggested page is not counted as read. There is no stance classifier or
pro/con quota. Duplicate collapse and diversity are heuristics, and a domain is
only a weak independence proxy.

The tests cover an opposing view of one toll proposal, the same harbor actor's
separate bridge event, a page overlapping toll and bus subjects, phone versions
months apart, a German title, duplicate-majority flooding, input-order
invariance, and unrelated catalog growth. The deliberately misleading
`weak-false-friend` scores above a relevant opposing page despite fixture
grade zero. In the base fixture, anchored retrieval has recall 1.0 and NDCG
about 0.906, yet the false friend takes an Insight slot. This is a concrete
limit of vector/title proximity, not evidence that stance-invariant semantic
identity has been solved. No discussion false-join rate is measurable because
this experiment assigns no discussion membership.

Next evidence would require an independently labeled, provenance-approved real
review set, measured current-vector behavior, accepted excerpt counts and query
latency at scale. Those are outside this synthetic shadow and its authorization.
