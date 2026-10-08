# Topic Atlas (local dashboard)

This is a separate, read-only visual program for the owner's local catalog.
From this directory, with Node.js 24 or newer, run:

```powershell
npm start
```

It opens a self-contained HTML dashboard in your default browser. Search for
pages or Topics, click a dot or list entry, inspect its nearest vector
neighbors, and choose **Open original page** to visit the source. The program
does not need the local service to be running and does not open a server port.
Re-run `npm start` after browsing to generate a fresh snapshot. For a headless
export without opening a browser, use `npm start -- --no-open`.

The generated file is
`%LOCALAPPDATA%\Temp\universal-discussion-dashboard\dashboard.html` on a
typical Windows installation; the command prints the exact path. It is
overwritten on the next run, not automatically deleted. It contains retained
public-page URLs and titles, so do not share it casually. Delete that single
file if you no longer want the extra copy. The source SQLite database remains
unchanged.

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
