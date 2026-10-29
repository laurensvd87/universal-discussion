# Topic Atlas (local dashboard)

This is a separate, read-only visual program for the owner's local catalog.
From this directory, with Node.js 24 or newer, run:

```powershell
npm start
```

It opens the HTML dashboard in your default browser and keeps the terminal
running. Search for
pages or Topics, click a dot or list entry, inspect its nearest vector
neighbors, and choose **Open original page** to visit the source. The program
does not need the local service to be running and does not open a server port.
As new pages reach the SQLite catalog, the running program updates a local
snapshot file and the open dashboard picks it up automatically. **Refresh**
checks that file immediately. Keep the terminal open for new snapshots; Ctrl+C
stops monitoring and leaves the last view readable. For a one-shot export
without opening a browser or monitoring, use `npm start -- --no-open`.

The dashboard follows canonical ingestion, including crawler `-Apply` batches.
A crawler preview stages pages in its separate ledger, so preview progress does
not increase dashboard counts. Startup and revision polling support both legacy
v2/v3 and normalized canonical metadata.

## Catalog growth

The top panel offers **Zeitverlauf** (learned pages and active canonical Topics
over time) and **Topics über Seiten** (pages on x, Topics on y). Choose 1 h,
24 h, seven days or the entire retained history. Current counts, changes and
pages per active Topic appear beside the plot. Active Topics have at least one
linked learned page; the separate total includes empty retained Topics. These
are canonical assignments, not the Ridge1 display groups selected for the map.

The normal service samples on startup and every minute, even without an open
dashboard. Initial dashboard generation also records one baseline; its watcher
only reads history. The separate ignored service file `data/topic-growth.sqlite`
contains timestamps, a hashed catalog generation, revisions and aggregate counts,
never URLs, titles, vectors, discussions, accounts or credentials. It survives
computer restarts. Keep the last 24 hours at minute resolution, older samples at
hour resolution for up to 90 days, with at most 4,096 points. Maintenance runs
when the sampler/store opens and on accepted samples; reads filter expired points.
No samples are invented for time before recording or while the service is off.

Catalog changes and recording gaps break lines. Deletion may decrease counts;
the pages-axis view connects samples in time order, including backward movement.
The chart measures whether growth slows; it cannot promise a Topic plateau.

The generated file is
`%LOCALAPPDATA%\Temp\murmingle-dashboard\dashboard.html` on a
typical Windows installation; the command prints the exact path. A sibling
`snapshot.js` holds the latest view and, when available, its experimental
grouping preview. Both are overwritten on the next run,
not automatically deleted. They contain retained page URLs and titles, so do
not share them casually. Delete both files if you no longer want the extra
copies. The source SQLite database remains unchanged.

The reader supports existing legacy v2/v3 databases and normalized canonical
SQLite. It opens them read-only, without creating a missing file, migrating data,
or changing journal settings. Normalized reads load catalog metadata and retained
vectors into local memory; they do not read contribution bodies or account records.
Exported snapshots contain neither vectors nor discussion/account data. Legacy
files retain their existing document validation limits. This dashboard support
does not authorize a service migration or backend restart.

The counts distinguish all saved Sources from learned pages. Only the
latter are plotted; synthetic demonstration data is omitted from the map.
The original capture policy cannot guarantee that every retained title/URL
is public, so inspect the report before sharing it.
Circle position is approximate 2D PCA; highlighted connections use cosine
scores from the original embeddings. This does not validate provisional Topic
membership. Above 1,000 learned pages the map pauses and the dashboard continues
with aggregate counts and growth history, without loading vectors or silently
sampling pages. This does not limit the catalog's storage count.

Run `npm run test:restricted` for synthetic data, read-only, and safe
HTML-export checks with network/process calls denied. `npm run test:browser`
runs a separate synthetic headless-Chrome smoke when Chrome is installed.
`npm run test:browser:growth` checks the growth views with synthetic histories.
No npm dependencies or model download are needed.

## Topic-Matching and Legacy E5 comparison

The dashboard shares the service's Ridge1 planner and pinned, owner-local
`data/ridge1-topic-adapter-v1.json`. It computes both views from the same
retained-vector snapshot; no page revisit, file upload or browser query is needed.
**Topic-Matching** is the default when valid weights are available. **Legacy E5**
shows the original canonical assignments. Switching keeps the selected page,
and an explicit choice survives snapshot refresh. A new dashboard document
starts with Topic-Matching again. Restart the dashboard program after updating
its code; an already running older watcher does not load new JavaScript.

Colors, groups and membership change with the switch, but positions and nearest
neighbor scores still describe original E5/PCA, not learned geometry. Snapshot
refresh observes Ridge artifact changes as well as database revisions. Missing,
invalid or work-budget-exhausted Ridge previews fall back to Legacy E5 with a
visible availability cue; they cannot activate the failed broad BODY policy.
The separate 1,000-page rendering guard remains, not a backend storage limit.

The preview is saved beside the report as Source IDs and group membership,
without article text, embeddings, fitted parameters, comments, or accounts.
Pinned/manual Sources are displayed as separate preview groups. The preview
does not update SQLite or change the extension's canonical Topic and
discussion routing. The catalog export itself still contains retained page
URLs and titles. Its preview has this shape, with the 64-character
`catalogRevision` from the same snapshot and a complete partition of its
displayed Source IDs:

```json
{
  "schemaVersion": "grouping-preview/v1",
  "catalogRevision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "groups": [
    { "sourceIds": ["synthetic-source-1", "synthetic-source-2"] },
    { "sourceIds": ["synthetic-source-3"] }
  ]
}
```

The example revision and IDs are placeholders. The browser rejects extra
fields, unknown or duplicate IDs, missing displayed Sources, and a stale
revision. Group labels and positions are derived from the current map;
source-page links and nearest-neighbor scores stay attached to their original
Sources. Ridge1 can still group unrelated pages; the owner-approved default
accepts the measured trade-off, not a quality or publication clearance. See
[ADR-073](../../decisions/ADR-073-default-ridge-topic-view-with-legacy-e5.md).
## Assigned pages per topic

The hierarchy dashboard shows the total assigned/pending page counts, a progress
bar and page counts for each configured display topic. Each classified page is
counted once after the owner grouping policy; ancestor rows do not double count
it. All rows come from the same protected PostgreSQL metadata snapshot as the
total. The current hierarchy17 view explicitly states that automatic discovery
of new named subjects is not yet enabled. It must not present those groups as
already activated.

The owner-local read-only watcher is:

```powershell
node .\apps\topic-dashboard\src\local-postgres-watch.mjs --watch
```

It uses the existing Windows-protected app credential, a two-connection
read-only PostgreSQL pool, and the existing dashboard report path. Reload the
already open dashboard once after updating its HTML; data then refreshes
automatically. `--once` instead writes a preview under
`apps/local-service/data/dashboard-topic-counts-preview/` and exits.
Only one dashboard watcher should run. The maintained hierarchy18 cutover must
close this temporary hierarchy17 watcher and replace it with the corresponding
complete release. It does not install migrations or alter the app, crawler or
worker. An owner-created `apps/local-service/data/dashboard-topic-counts.stop`
marker asks this watcher to drain its current work and close; the marker remains
present and must be removed before a deliberate new start.

Validation: four protected-metadata unit checks, five real headless-browser
scenarios (including automatic refresh and preserving the last valid counts),
and a browser check of the actual live PostgreSQL-backed report. These checks
do not establish representative matching accuracy or activate named-topic
discovery.
