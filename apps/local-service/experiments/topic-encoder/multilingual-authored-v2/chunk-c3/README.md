# Development corpus: C3

This folder contains a synthetic, development-only multilingual corpus. It is not training data, a holdout, or evidence of matcher performance. Every person, organization, place, and event below is fictional.

## Fact sheets written before the reports

### Family C301 — Veldam's low quay flood gate (one evolving story)

These three adjacent atomic events are stages of one evolving municipal works story: a planned closure, a controlled test, and the reopening after inspection. Reports within an event may select different operational details, but the shared facts in that event remain fixed.

- **C301-E1 — closure announced:** On 12 May, Veldam's low quay pedestrian gate closes from 08:00 for replacement of a worn seal. The riverside path remains open via the upper ramp; cyclists must dismount there. Contractor Noordwerk estimates work through 15:00. The city posts a paper notice at both approaches. No water emergency is reported.
- **C301-E2 — controlled test:** On 13 May at 10:20, Noordwerk runs a controlled gate test with the quay still closed. The new seal holds during a 12-minute water-pressure check. A city inspector records one slow hinge and orders lubrication before public use. The upper-ramp detour remains in force; no reopening time is announced.
- **C301-E3 — inspection and reopening:** On 14 May at 09:10, the inspector confirms the hinge moves freely after lubrication and signs the handover. The gate reopens at 09:30. The upper-ramp detour ends, while the riverside path remains open. The city asks users to report seepage at its quay desk; no seepage is observed during handover.

Six distinct viewpoints recur per event: municipal works coordinator, contractor technician, nearby shopkeeper, wheelchair user, river ecologist, and local reporter. Viewpoints rotate among language slots across events; every role is represented in at least two languages in this family. The sixth-report languages are English, English, and Spanish across E1–E3.

### Family C302 — Orilla Mobility service incidents (three independent incidents)

These are independent entity incidents involving the fictional operator Orilla Mobility. They do not form stages of one story and no causal relationship is asserted between them. Shared operator identity is the only family-level link.

- **C302-E1 — Luma terminal baggage belt:** On 6 June, belt 4 stops at 07:42 after a sensor fault at Luma Terminal. Staff move 18 bags to belt 2; all 18 reach their flights before the 08:30 cutoff. A technician replaces the sensor at 08:16. No injury or flight cancellation is reported.
- **C302-E2 — Isla ferry berth ramp:** On 19 June, the passenger ramp at Isla berth 2 jams at 16:05 during a scheduled docking. The crew holds boarding for 21 minutes and uses berth 1 for two passengers who need step-free access. A mechanic clears a trapped rubber guard at 16:26. The sailing departs 24 minutes late; no one is hurt.
- **C302-E3 — Nera tram junction:** On 2 July, a signal at Nera junction stays red at 18:11. Dispatch holds three trams for nine minutes and sends one through a manual authorization after a trackside check. A signal technician resets the relay at 18:24. Service returns to its normal interval by 18:40; no collision or injury occurs.

Each event has six distinct viewpoints: duty dispatcher, frontline worker, affected passenger, accessibility advocate, maintenance specialist, and neighborhood observer. Viewpoints rotate among language slots across events; every role is represented in at least two languages in this family. The sixth-report languages are German, French, and English across E1–E3.

## Record contract

`records.jsonl` has exactly 36 rows, six reports per event, with the exact ordered keys `id`, `family`, `eventKey`, `lang`, `viewpoint`, `title`, `body`. Titles contain at least 20 Unicode characters; bodies contain 220–650 Unicode characters. All report prose is authored in its declared language.

Run `node integrity.test.js` from this directory for structure, length, language-cue, and pinned SHA-256 checks.
