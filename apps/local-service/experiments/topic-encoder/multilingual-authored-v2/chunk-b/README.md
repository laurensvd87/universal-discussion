# Authored multilingual training corpus — chunk B

Training-only fictional material. This is not an independent holdout, real publisher evidence, or matcher result. Every entity and place below is invented. Each event sheet was written before its six separately composed report views. Adjacent `eventKey` values identify distinct factual stages; that distinction does not make the stages different stories or training negatives.

## Fact sheets

### B01 — Lumehaven harbor

- **B01-E1, 12 March 2025:** Lumehaven's harbor board approved a six-month evening pilot for the Blue Quay passenger ferry, extending its last departure from 20:10 to 22:00 on Fridays and Saturdays. It starts 4 April, uses existing crews, and will be reviewed in October using passenger counts and noise complaints. No fare change was approved.
- **B01-E2, 28 March 2025:** The board postponed the Blue Quay pilot's planned 4 April launch to 18 April after an inspection found a faulty ramp sensor. The schedule and six-month review remain as approved; the delay is not a cancellation and no other route is affected.
- **B01-E3, 9 October 2025:** After the pilot, the board voted to keep the later Friday and Saturday Blue Quay sailings permanently from 1 November. Passenger counts exceeded the board's target; the review also logged three noise complaints. This is a continuation decision, not the launch or delay.

### B02 — Orvelin civic museum

- **B02-E1, 6 February 2025:** Orvelin's civic museum selected architect Sela Venn's proposal to restore the closed north gallery. The work will stabilize its stone roof, retain the original timber cases, and cost at most 1.8 million crowns; reopening is planned for May 2026. This is a design award, not a construction start.
- **B02-E2, 21 April 2025:** Builders began roof stabilization in the north gallery under the already awarded Venn design. The museum moved twelve cases into storage and expects the gallery to remain closed through winter. The opening target remains May 2026; this event marks physical work beginning.
- **B02-E3, 14 May 2026:** The museum reopened its restored north gallery, displaying the twelve returned cases beneath the stabilized roof. Final work cost 1.74 million crowns, below the ceiling, and the first weekend requires timed entry. This is completion and public access, not the award or work start.

### B03 — Velis Vale growers

- **B03-E1, 17 January 2025:** The Velis Vale growers' cooperative voted to replace its shared seed-cleaning line with a low-dust model from fictional maker Brindle Works. The 240,000-lira purchase is scheduled for June and is intended to reduce airborne chaff; no crop or acreage decision accompanied it.
- **B03-E2, 3 June 2025:** Brindle Works installed the cooperative's new seed-cleaning line at the Velis Vale depot. A first batch of rye passed through, while operators adjusted the dust extraction before the autumn rush. This is installation of the January purchase, not a separate equipment vote.
- **B03-E3, 22 September 2025:** The cooperative reported that the new line had reduced measured chaff in the depot by roughly half over its first season, and members voted to publish monthly readings. The vote concerns monitoring and transparency; the machine was installed earlier.

### B04 — Asterfall observatory

- **B04-E1, 11 April 2025:** Asterfall Observatory's council approved a two-night public viewing event for the fictional Kestrel meteor shower on 16–17 August. Tickets will be free but reserved, and the program includes telescope turns and a dark-sky briefing. Weather cancellation rules are unchanged.
- **B04-E2, 15 August 2025:** Observatory staff canceled the first Kestrel-night session because a storm warning made the hilltop unsafe. The second night remains scheduled, subject to a fresh forecast at noon; ticket holders for the canceled session may transfer reservations. This is a safety decision immediately before the event.
- **B04-E3, 18 August 2025:** Asterfall Observatory said 860 visitors attended the surviving Kestrel-night session after the storm cancellation, and donated telescopes were used for longer viewing turns. The council will consider another public night next year; it made no date commitment.

### B05 — Dunmere tram network

- **B05-E1, 5 May 2025:** Dunmere transit authority chose a new Sunday timetable for tram line 4, reducing the midday gap from twenty to fifteen minutes beginning 1 June. The change reallocates existing cars, leaves weekday service untouched, and will be reviewed after eight weeks.
- **B05-E2, 1 June 2025:** Dunmere's line 4 began running every fifteen minutes on Sundays under the timetable approved in May. The first service day had no extra cars available, so the authority asked riders to report crowding before the eight-week review. This is rollout, not the policy vote.
- **B05-E3, 4 August 2025:** Following its eight-week review, Dunmere authority kept the Sunday line 4 timetable and added a short-turn car at midday on busy dates. Rider reports showed the shorter interval helped, though the extra car is conditional rather than a permanent all-day increase.

### B06 — Neralis waterworks

- **B06-E1, 8 February 2025:** Neralis waterworks approved a 90,000-sol trial of acoustic leak sensors in the eastern district, covering 40 kilometres of mains from April through July. The utility will compare alerts with crew inspections before deciding whether to expand; household meters are not part of the trial.
- **B06-E2, 7 April 2025:** Crews began the Neralis eastern-district sensor trial, fitting the first units to accessible mains chambers. The four-month program still covers 40 kilometres and excludes household meters; the utility expects the first alert audit in May.
- **B06-E3, 12 August 2025:** Neralis waterworks published its sensor-trial review: crews confirmed eleven leaks among fourteen high-priority alerts, but maintenance access delayed coverage of six kilometres. The utility approved no expansion yet and will price a second trial after winter.

## Record contract

`records.jsonl` contains 108 hand-authored records: six event developments per family, six distinct report voices per event, and language coverage across English, Dutch, German, French, and Spanish. One language is repeated per event, balanced across the five languages. Language and viewpoint labels are crossed; the recurring reporter, budget-watcher, and skeptical-columnist roles are checked for language coverage and distribution. The integrity test pins the exact file digest as well as record count, keys, ids, and event coverage.

## Tentative story relationships

The following ledger records authorial context only. Within each family, the three separately keyed developments are stages of one evolving fictional story. Keep each `eventKey` atomic for training labels; the shared `storyKey` does not collapse developments, define product Topic membership, or authorize any product behavior.

Keep three label concepts separate:

- **Event identity:** each `eventKey` names one distinct factual development, with its own action, date, and outcome.
- **Direct story relevance:** the ledger tentatively marks the three stages in a family as related positives for the fictional evolving story. This is an authorial relation; it does not assert that every pair is directly relevant for every task. If the product-level boundary is unresolved, treat that pair as neutral for Topic routing rather than as a negative.
- **Topic-routing target:** this corpus does not decide whether separate factual stages should share a product Topic. No model may use within-family B pairs as hard negatives unless a specific target definition is chosen and documented first.

| Tentative storyKey | Event stages | Relationship |
| --- | --- | --- |
| B-story-01 | B01-E1 → B01-E2 → B01-E3 | Blue Quay evening pilot approved, delayed for a ramp repair, then retained after review. |
| B-story-02 | B02-E1 → B02-E2 → B02-E3 | North-gallery design selected, roof work begun, then gallery reopened. |
| B-story-03 | B03-E1 → B03-E2 → B03-E3 | Low-dust seed line approved, installed, then reviewed with a reporting commitment. |
| B-story-04 | B04-E1 → B04-E2 → B04-E3 | Kestrel public nights scheduled, one canceled for a storm, then attendance reported for the surviving night. |
| B-story-05 | B05-E1 → B05-E2 → B05-E3 | Sunday tram interval approved, introduced, then retained with a targeted busy-date car. |
| B-story-06 | B06-E1 → B06-E2 → B06-E3 | Acoustic sensor trial approved, installation started, then results and a possible second trial reviewed. |
