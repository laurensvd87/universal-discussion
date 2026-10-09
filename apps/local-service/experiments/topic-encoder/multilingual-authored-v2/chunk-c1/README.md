# Authored multilingual Topic-matching development corpus — chunk C1

This is a fictional, project-authored **development-only** corpus. It is not training data and is not an independent holdout. It contains two families, three adjacent events per family, and six reports per event. All people, institutions and locations are invented. Reports are original prose, not copied from articles.

## Event fact sheets

### C101 — Aster Quay tool library

These three adjacent events are later stages of one evolving story: launch, an access-hours adjustment, then a first-month report about the same service. Each eventKey still names only its dated event.

- C101-E1: On 6 February 2026, Aster Quay's volunteer tool library began lending hand tools from a converted storage room at the East Arcade. Members could borrow up to three tools for seven days after leaving a refundable deposit; opening hours were Saturdays, 09:00–13:00.
- C101-E2: On 20 February 2026, the tool library announced that a Wednesday evening collection window would begin on 25 February, 17:30–19:00, after shift workers said Saturday pickup was difficult. The East Arcade room, three-tool limit, seven-day loan and refundable deposit remained the same.
- C101-E3: On 20 March 2026, the library published a first-month tally of 74 loans across 41 members and said it would keep both weekly collection windows through June. The tally covered hand tools only; no new equipment category or membership rule was announced.

### C102 — Brackenmere clinic shuttle

These three adjacent events are later stages of one evolving story: pilot launch, a pickup-location adjustment, then a pilot tally and temporary continuation of the same route. Each eventKey still names only its dated event.

- C102-E1: On 3 April 2026, Brackenmere Community Transport announced a minibus link that began operating Tuesday, 7 April, between the village hall and Northgate Health Centre, with departures at 08:10 and 10:40. Riders had to reserve by phone before 16:00 on the preceding Monday; the pilot was scheduled for eight weeks.
- C102-E2: On 17 April 2026, the service moved the 08:10 pickup from the village hall entrance to the sheltered bus bay beside it after drivers found the entrance blocked on market mornings. The 10:40 departure, destination, phone reservation rule and eight-week pilot stayed in place.
- C102-E3: On 29 May 2026, the transport group reported 56 passenger journeys during the eight-week pilot and said the Tuesday shuttle would continue until the end of August while it reviewed bookings. The route, two departure times and advance phone reservation remained unchanged.

## Record contract

`records.jsonl` has 36 records, IDs C101-01–C101-18 and C102-01–C102-18. Every event has reports in en, nl, de, fr and es, plus one repeated language; across the six events the repeated language is en, nl, de, fr, es, en. Each event uses six distinct stakeholder viewpoints. Titles are at least 20 characters and bodies are 220–650 characters. Reports state the event in their own labeled language, with locally coherent framing. Within each family, E1, E2 and E3 are separate dated events in the same evolving story.

The focused integrity test checks exact row schema, identifiers, family/event/language/viewpoint coverage, lengths, language cues and a frozen SHA-256. The language check is a deliberately simple leakage tripwire, not a fluency certification.
