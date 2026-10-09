# Development corpus subchunk C2

This is a development-only, fully fictional authored corpus. It is neither training data nor a holdout. The rows are original stakeholder reports in English, Dutch, German, French, and Spanish. Each event has six distinct viewpoints; its sixth report repeats a language rotated across events. Posts describe only their own event.

## Fact sheets and tentative story relationships

These fact sheets were established before the reports. Dates, locations, measurements, and outcomes below are the shared event facts; each narrator may select the details relevant to their role.

### C201 — one evolving story: restoration of the Lethen canal at Alder Reach

Tentative relationship: all three atomic events are stages in one evolving restoration story at the same fictional canal and East Gate. They are not three independent entity incidents.

| Event | Shared facts |
|---|---|
| C201-E1 | At 17:40 on 12 May 2026, East Gate's pressure reading dropped. Inspection found a split downstream pressure hose. Shallow water covered 2.4 hectares of adjacent reed meadow. No homes flooded and nobody was injured. Water samples showed no oil sheen. The crew isolated the inlet at 18:05. |
| C201-E2 | On 19 May 2026 at 10:00, a new pressure transducer and braided hose were tested at East Gate. The test used the maintenance stop while the side channel stayed open; it caused no spill. A simulated close completed in 46 seconds, within the 60-second service limit. An independent inspector observed the test. |
| C201-E3 | Automatic operation resumed at East Gate at 09:00 on 2 June 2026, with an alarm set for a 12% pressure drop. A survey of 40 reed-meadow quadrats found reed shoots in 34; no oil sheen was seen. The next manual inspection was scheduled for 2 July 2026. |

### C202 — three independent entity incidents

Tentative relationship: these are separate incidents at unrelated fictional organizations. They share no entity, location, operational cause, or unfolding story; their grouping is only a corpus family label.

| Event | Shared facts |
|---|---|
| C202-E1 | At 06:15 on 18 August 2026, the daily inspection at Brindle Quay found the public ferry pier's boarding-ramp hinge-pin retainer missing. Staff locked out that ramp. Eleven sailings used the inner berth, where step-free transfer was unavailable; no passenger used the defective ramp. A replacement retainer was installed at 13:30 and passed a 1.2-tonne load test. |
| C202-E2 | At 02:10 on 4 September 2026, the basement dehumidifier at Valeholt Civic Archive stopped. At 08:00, relative humidity was 68%, against a target no higher than 55%. Staff moved 12 cartons upstairs; no papers were wet. A contractor replaced a capacitor at 15:20, and humidity reached 54% by 20:00. |
| C202-E3 | At 11:25 on 14 September 2026, a falling branch severed the rainfall-gauge cable at Fallow Point bird observatory's weather mast. The mast lost three hours of readings. A backup sensor 1.8 km away recorded 6.2 mm during that window. A replacement cable was fitted at 16:40, and a 17:00 calibration check differed by 0.3 mm. |

## Files and integrity

`records.jsonl` contains 36 JSON objects, one per line. Each object has exactly `id`, `family`, `eventKey`, `lang`, `viewpoint`, `title`, and `body`. Titles contain at least 20 Unicode code points; bodies contain 220–650 Unicode code points. The direct Node check verifies exact bytes by SHA-256, schema, row/event/language/viewpoint counts, lengths, and language-specific writing cues.

Run from this directory with `node integrity.test.js`. The expected SHA-256 of `records.jsonl` is `44ac29625dfbd86f7af2c278eab991e042d0e6e0fa64a92d95d3b1f7951bbf6f`.
