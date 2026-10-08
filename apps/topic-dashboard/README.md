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
`snapshot.js` holds the latest view. Both are overwritten on the next run,
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
