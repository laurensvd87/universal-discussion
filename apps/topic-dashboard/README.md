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

The generated file is
`%LOCALAPPDATA%\Temp\universal-discussion-dashboard\dashboard.html` on a
typical Windows installation; the command prints the exact path. A sibling
`snapshot.js` holds the latest view and, when available, its experimental
grouping preview. Both are overwritten on the next run,
not automatically deleted. They contain retained page URLs and titles, so do
not share them casually. Delete both files if you no longer want the extra
copies. The source SQLite database remains unchanged.

The counts distinguish all saved Sources from learned pages. Only the
latter are plotted; synthetic demonstration data is omitted from the map.
The original capture policy cannot guarantee that every retained title/URL
is public, so inspect the report before sharing it.
Circle position is approximate 2D PCA; highlighted connections use cosine
scores from the original embeddings. This does not validate provisional Topic
membership. The program currently refuses a snapshot over 1,000 learned
pages rather than silently dropping them. This does not limit the catalog's
storage count.

Run `npm run test:restricted` for synthetic data, read-only, and safe
HTML-export checks with network/process calls denied. `npm run test:browser`
runs a separate synthetic headless-Chrome smoke when Chrome is installed.
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
