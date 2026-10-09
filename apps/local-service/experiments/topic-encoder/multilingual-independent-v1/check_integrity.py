"""Structural-only integrity checks; deliberately performs no model scoring."""
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
records = json.loads((ROOT / "records.json").read_text(encoding="utf-8"))
assert len(records) == 80, f"expected 80 records, got {len(records)}"
assert len({r["id"] for r in records}) == 80, "IDs must be unique"
assert {r["event_id"] for r in records} == {f"E{i:02}" for i in range(1, 9)}
assert {r["family_id"] for r in records} == {f"F{i:02}" for i in range(1, 5)}
assert all((int(r["event_id"][1:]) + 1) // 2 == int(r["family_id"][1:]) for r in records), "event/family mapping"

by_event = defaultdict(list)
for r in records:
    by_event[r["event_id"]].append(r)
    assert r["lang"] in {"en", "de", "nl", "fr", "es"}
    assert r["viewpoint"] in {"supportive", "questioning"}
    assert len(r["text"].split()) >= 35, f"too short: {r['id']}"
    assert r["title"].strip() and r["text"].strip()
for event, rows in by_event.items():
    assert len(rows) == 10, (event, len(rows))
    counts = Counter((r["lang"], r["viewpoint"]) for r in rows)
    assert all(counts[(lang, stance)] == 1 for lang in ("en", "de", "nl", "fr", "es") for stance in ("supportive", "questioning")), event

def norm(s):
    s = unicodedata.normalize("NFKC", s).casefold()
    return re.sub(r"[^\w]+", " ", s, flags=re.UNICODE).strip()

normalized = [norm(r["text"]) for r in records]
assert len(set(normalized)) == 80, "normalized article texts must all differ"
assert all(len(norm(r["text"]).split()) >= 35 for r in records)

# Each adjacent event pair must have distinct localized titles for every language.
for first in ("E01", "E03", "E05", "E07"):
    second = f"E{int(first[1:]) + 1:02}"
    for lang in ("en", "de", "nl", "fr", "es"):
        t1 = next(r["title"] for r in by_event[first] if r["lang"] == lang)
        t2 = next(r["title"] for r in by_event[second] if r["lang"] == lang)
        assert norm(t1) != norm(t2), (first, second, lang)

# No real URLs, quoted page material, or provider/web provenance are in the corpus.
serialized = json.dumps(records, ensure_ascii=False).casefold()
assert "http://" not in serialized and "https://" not in serialized
assert all(not r.get("source_url") for r in records)
assert len({(r["event_id"], r["lang"], r["title"]) for r in records}) == 40, "each event needs one localized title per language"
print("PASS: 80 unique IDs; 8 events; 4 families; 10 records/event; both viewpoints in all 5 languages/event; 80 distinct normalized texts; adjacent developments distinguished; no URLs/source fields.")
