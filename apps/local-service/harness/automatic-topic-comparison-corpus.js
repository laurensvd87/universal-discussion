// Predeclared DEV hard cases. Root saw primary search snippets/text before this
// declaration; this is not independent or prospective final TEST. Annotations
// must never enter encoding, temporal evidence or a runtime matching decision.
export const AUTOMATIC_TOPIC_COMPARISON_DEVELOPMENT=Object.freeze([
 ['physics25-berkeley','nobel-physics-2025-announcement','2025-10-07','berkeley.edu','event','https://news.berkeley.edu/2025/10/07/john-clarke-uc-berkeley-emeritus-professor-awarded-2025-nobel-prize-in-physics/'],
 ['physics25-trinity','nobel-physics-2025-announcement','2025-10-07','cam.ac.uk','event','https://www.trin.cam.ac.uk/news/2025-nobel-prize-in-physics-where-it-all-began/'],
 ['physics25-waterloo','nobel-physics-2025-announcement','2025-10-07','uwaterloo.ca','event','https://uwaterloo.ca/institute-for-quantum-computing/news/iqc-congratulates-winners-2025-nobel-prize-physics'],
 ['physics24-toronto','nobel-physics-2024-announcement','2024-10-08','utoronto.ca','event','https://www.utoronto.ca/news/geoffrey-hinton-wins-nobel-prize'],
 ['hinton-influential23','hinton-toronto-life-2023','2023-11-21','utoronto.ca','event','https://www.utoronto.ca/news/geoffrey-hinton-tops-toronto-life-s-list-most-influential-people'],
 ['hinton-collision23','hinton-collision-2023','2023-06-29','utoronto.ca','event','https://www.utoronto.ca/news/risks-artificial-intelligence-must-be-considered-technology-evolves-geoffrey-hinton'],
 ['baker-engineering26','baker-engineering-academy-2026','2026-03-05','washington.edu','event','https://newsroom.uw.edu/blog/david-baker-elected-to-national-academy-of-engineering'],
 ['baker-profile',null,null,'washington.edu','evergreen-profile','https://www.ipd.uw.edu/david-baker/'],
 ['baker-ceremony24','nobel-chemistry-2024-ceremony','2024-12-10','washington.edu','event','https://mstp.washington.edu/news/mstp-students-in-the-baker-lab-accompany-him-to-stockholm/'],
 ['berkeley-roundup25',null,null,'berkeley.edu','multi-event-roundup','https://news.berkeley.edu/2025/12/15/nobel-wins-psychedelic-lilies-and-a-mission-to-mars-uc-berkeleys-top-stories-of-2025/'],
 ['chemistry25-berkeley','nobel-chemistry-2025-announcement','2025-10-08','berkeley.edu','event','https://news.berkeley.edu/2025/10/08/uc-berkeleys-omar-yaghi-shares-2025-nobel-prize-in-chemistry/'],
 ['chemistry25-ucla','nobel-chemistry-2025-announcement','2025-10-08','ucla.edu','event','https://newsroom.ucla.edu/releases/former-ucla-professor-omar-yaghi-2025-nobel-prize-chemistry'],
].map(([id,eventId,eventDate,publisherKey,documentKind,url])=>Object.freeze({id:'automatic-compare-'+id,eventId,eventDate,publisherKey,documentKind,url,split:'development'})));

export const AUTOMATIC_TOPIC_COMPARISON_PROTOCOL=Object.freeze({
 scope:'DEV12 plus the four already encoded original usable observations; original ten outcomes stay retained. No final quality claim.',
 review:'Root-only primary-source snippets/text visible before declaration. No labels/dates/URLs used to tune or name a runtime cluster.',
 methods:['incremental-complete-link','incremental-centroid','threshold-connected-components'],
 threshold:.9,margin:.01,
 temporal:'Compare embedding-only and publisher-publication evidence; eventDate gold is never an input. Calendar dates retain precision. Missing times stay missing.',
 granularity:'Award announcement and later ceremony are distinct event contexts; evergreen profiles/roundups have no single event gold. A broad subject may include both.',
 unavailable:'Retain all12 outcomes; no replacement, redirect, alternate denied URL, retry or old hierarchy TEST.',
 maximumRequests:28,maximumCaptureMs:240000,minimumRequestSpacingMs:5000,
});
