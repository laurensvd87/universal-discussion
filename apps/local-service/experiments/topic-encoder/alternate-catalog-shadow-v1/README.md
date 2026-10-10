# Owner-local alternate Topic shadow check

Run from the repository root:

`node apps/local-service/experiments/topic-encoder/alternate-catalog-shadow-v1/run.js`

The runner opens the fixed `apps/local-service/data/demo.sqlite` with SQLite's read-only option and `query_only`, validates the saved state, loads the ignored local diagonal adapter, and computes a candidate partition and discussion projection in memory. It accepts no path or policy arguments, makes no network request, and does not alter SQLite, the adapter, canonical Topic assignments or posts.

Output is one JSON line with counts and three booleans: whether both owner-provided De Standaard translation URLs exist, whether they share a candidate group, and whether the actual service projection displays the same root IDs from both pages. It prints no other URL, title, page text, vector, post or account value. This is exploratory catalog evidence; it does not activate the alternate policy in the service or extension and is not a precision measurement.
