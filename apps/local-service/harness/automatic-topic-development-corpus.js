// Primary-publisher DEV only. New news-event discovery, not the old consumed
// hierarchy TEST. Labels/dates are evaluation annotations, never model inputs.
export const AUTOMATIC_TOPIC_DEVELOPMENT=Object.freeze([
 {id:'automatic-dev-physics-01',eventId:'nobel-physics-2024-announcement',eventDate:'2024-10-08',publisherKey:'nobelprize.org',url:'https://www.nobelprize.org/prizes/physics/2024/press-release/'},
 {id:'automatic-dev-physics-02',eventId:'nobel-physics-2024-announcement',eventDate:'2024-10-08',publisherKey:'princeton.edu',url:'https://www.princeton.edu/news/2024/10/08/princetons-john-hopfield-receives-nobel-prize-physics'},
 {id:'automatic-dev-physics-03',eventId:'nobel-physics-2024-announcement',eventDate:'2024-10-08',publisherKey:'aps.org',url:'https://www.aps.org/about/news/2024/10/nobel-physics-2024-winners'},
 {id:'automatic-dev-chemistry-01',eventId:'nobel-chemistry-2024-announcement',eventDate:'2024-10-09',publisherKey:'nobelprize.org',url:'https://www.nobelprize.org/prizes/chemistry/2024/press-release/'},
 {id:'automatic-dev-chemistry-02',eventId:'nobel-chemistry-2024-announcement',eventDate:'2024-10-09',publisherKey:'washington.edu',url:'https://www.washington.edu/33rd-president/2024/10/09/david-baker-nobel-prize/'},
 {id:'automatic-dev-chemistry-03',eventId:'nobel-chemistry-2024-announcement',eventDate:'2024-10-09',publisherKey:'royalsociety.org',url:'https://royalsociety.org/news/2024/10/demis-hassabis-nobel-prize/'},
].map(p=>Object.freeze({...p,split:'development'})));
export const AUTOMATIC_TOPIC_DEVELOPMENT_PROTOCOL=Object.freeze({
 review:'Root-only primary-source event/date review; search snippets and some primary text were visible before declaration. No independent reviewer or population claim.',
 subject:'Two distinct announcements one day apart, both Nobel awards involving AI; check same-event grouping versus similar but different events.',
 unavailable:'Retain every declared outcome; no replacement, redirect-following or automatic retry. Primary-site403 was already observed through browsing before this collector.',
 dates:'eventDate is a gold annotation only. The capture currently exports no publication metadata; do not substitute the visit date or the gold date as an event-matcher input.',
 validation:'This is DEV, not final validation. Freeze a selected policy before declaring and capturing prospective unseen events/sites. Old hierarchy TEST is not tuning data.',
 maximumRequests:16,maximumCaptureMs:240000,minimumRequestSpacingMs:5000,
});
// Separate additional DEV documents after only1/6 originals was usable. The
// first six outcomes remain counted, including access/policy refusals. No
// alternate URL on a denied publisher, replacement or TEST access is admitted.
export const AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT=Object.freeze([
 {id:'automatic-extra-physics-01',eventId:'nobel-physics-2024-announcement',eventDate:'2024-10-08',publisherKey:'cam.ac.uk',url:'https://www.cam.ac.uk/research/news/university-of-cambridge-alumnus-awarded-2024-nobel-prize-in-physics'},
 {id:'automatic-extra-physics-02',eventId:'nobel-physics-2024-announcement',eventDate:'2024-10-08',publisherKey:'caltech.edu',url:'https://www.caltech.edu/about/news/caltech-professor-emeritus-john-hopfield-wins-nobel-prize-in-physics'},
 {id:'automatic-extra-chemistry-01',eventId:'nobel-chemistry-2024-announcement',eventDate:'2024-10-09',publisherKey:'ucl.ac.uk',url:'https://www.ucl.ac.uk/news/2024/oct/ucl-alumnus-and-ai-innovator-awarded-nobel-prize-chemistry'},
 {id:'automatic-extra-chemistry-02',eventId:'nobel-chemistry-2024-announcement',eventDate:'2024-10-09',publisherKey:'berkeley.edu',url:'https://news.berkeley.edu/2024/10/09/david-baker-a-uc-berkeley-ph-d-awarded-2024-nobel-prize-in-chemistry/'},
].map(p=>Object.freeze({...p,split:'development'})));

// New same-response metadata observation on the four previously usable DEV
// pages only. No denied publisher, alternate URL, replacement or TEST is fetched.
export const AUTOMATIC_TOPIC_METADATA_DEVELOPMENT=Object.freeze([
 AUTOMATIC_TOPIC_DEVELOPMENT[4],AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT[0],
 AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT[1],AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT[3],
].map((p,i)=>Object.freeze({...p,priorObservationId:p.id,id:'automatic-metadata-dev-0'+(i+1)})));
