import { createHash } from 'node:crypto';

// This file is intentionally self-contained.  It is an unseen, synthetic-only
// evaluation set and must not be changed after the digest is recorded.
const rows = [
  // News: one city, two separate developments.
  ['harbor-dredging', 'port-aurora-deepening-permit', 'Port Aurora wins permit to deepen cargo channel', 'The coastal regulator approved a three-metre deepening of Port Aurora’s cargo channel after a year-long habitat review.', 'industry briefing', 'approval'],
  ['harbor-dredging', 'port-aurora-deepening-permit', 'Environmental groups call Aurora channel decision a costly gamble', 'Critics say the newly approved Port Aurora dredging plan could disturb eelgrass, while the port says mitigation is funded.', 'environmental critique', 'criticism'],
  ['harbor-dredging', 'port-aurora-crane-strike', 'Dock crane crews walk out at Port Aurora over night shifts', 'Operators at Port Aurora began a forty-eight-hour strike after talks on overnight crane staffing failed.', 'labor report', 'strike'],
  ['harbor-dredging', 'port-aurora-crane-strike', 'Aurora shipping delays blamed on crane staffing dispute', 'Shipping lines rerouted two vessels as dock workers and managers disputed the new crane rota.', 'business report', 'disruption'],

  // Product: similar names, incompatible generations.
  ['orbit-devices', 'orbit-tab-4-battery-recall', 'Orbit Tab 4 battery recall covers early production units', 'Orbit Devices recalled a batch of Tab 4 tablets after reports of overheating during rapid charging.', 'consumer warning', 'recall'],
  ['orbit-devices', 'orbit-tab-4-battery-recall', 'Why the Orbit Tab 4 recall should not be ignored', 'Repair advocates say the Tab 4 battery replacement program needs clearer serial-number guidance.', 'consumer critique', 'recall'],
  ['orbit-devices', 'orbit-tab-5-launch', 'Orbit Tab 5 adds matte display and longer claimed runtime', 'Orbit Devices unveiled the Tab 5 tablet, promising a redesigned screen and a new efficiency chip.', 'product launch', 'launch'],
  ['orbit-devices', 'orbit-tab-5-launch', 'Tab 5 looks polished, but Orbit still has to earn trust', 'A review argues that the new Orbit Tab 5 cannot erase concerns raised by last year’s Tab 4 recall.', 'skeptical review', 'launch'],

  // Science: same observatory, separate observations.
  ['lumen-observatory', 'lumen-exoplanet-rainfall', 'Lumen telescope detects mineral rain on distant giant planet', 'Spectral readings from the Lumen Observatory suggest silicate particles fall through the atmosphere of Kepler-191c.', 'science report', 'discovery'],
  ['lumen-observatory', 'lumen-exoplanet-rainfall', 'What mineral rain on Kepler-191c can and cannot tell us', 'Planetary scientists caution that the Lumen result is an atmospheric model, not a direct weather observation.', 'scientific caution', 'interpretation'],
  ['lumen-observatory', 'lumen-asteroid-defense', 'Lumen Observatory receives grant for asteroid tracking network', 'A public grant will fund new wide-field cameras at Lumen to improve early warnings for near-Earth objects.', 'funding news', 'grant'],
  ['lumen-observatory', 'lumen-asteroid-defense', 'Asteroid warning grant is useful but leaves southern skies uncovered', 'Researchers welcome Lumen’s new tracking money but note that the planned cameras do not close every coverage gap.', 'policy analysis', 'grant'],

  // Policy: same program, phase one versus phase two.
  ['ridge-transit', 'ridge-bus-fares-free-weekends', 'Ridge County votes for free weekend buses this summer', 'The county council approved a three-month pilot removing fares on local buses every Saturday and Sunday.', 'civic news', 'pilot'],
  ['ridge-transit', 'ridge-bus-fares-free-weekends', 'Free weekend buses may help workers, not just tourists', 'A transit coalition argues Ridge County’s weekend fare pilot should be judged by access for shift workers.', 'advocacy', 'pilot'],
  ['ridge-transit', 'ridge-bus-lane-enforcement', 'Cameras begin enforcing Ridge bus lanes on Monday', 'Ridge County will issue warnings before fining drivers who enter newly marked bus-only lanes.', 'service notice', 'enforcement'],
  ['ridge-transit', 'ridge-bus-lane-enforcement', 'Bus-lane cameras need an appeal path for delivery drivers', 'Small businesses ask Ridge County to clarify loading exceptions before automated bus-lane fines begin.', 'business critique', 'enforcement'],

  // Sports: one club, different competitions.
  ['northbridge-fc', 'northbridge-cup-semifinal', 'Northbridge FC reaches cup semifinal on late header', 'Northbridge beat Ashford 2–1 in the national cup quarterfinal after scoring in stoppage time.', 'match report', 'cup'],
  ['northbridge-fc', 'northbridge-cup-semifinal', 'Northbridge’s cup run masks a familiar defensive flaw', 'A columnist says the semifinal place does not solve the team’s vulnerability on set pieces.', 'sports analysis', 'cup'],
  ['northbridge-fc', 'northbridge-league-coach-dismissal', 'Northbridge dismisses coach after sixth league loss', 'Northbridge FC fired its manager following a home defeat that left the club near the league relegation line.', 'club news', 'league'],
  ['northbridge-fc', 'northbridge-league-coach-dismissal', 'Sacking the coach will not fix Northbridge’s recruitment errors', 'Former players say the club’s league problems began with summer transfers rather than tactics alone.', 'opinion', 'league'],

  // Legal: same company, different proceeding.
  ['solace-health', 'solace-data-settlement', 'Solace Health settles patient portal data lawsuit', 'Solace Health agreed to a settlement over claims that analytics code exposed appointment metadata.', 'legal news', 'settlement'],
  ['solace-health', 'solace-data-settlement', 'Data settlement leaves Solace patients asking who was notified', 'Privacy advocates argue the Solace agreement should explain outreach to people whose portal details were involved.', 'privacy critique', 'settlement'],
  ['solace-health', 'solace-patent-appeal', 'Appeals court revives Solace Health sensor patent case', 'A federal appeals panel sent Solace Health’s dispute over a wearable sensor patent back for further review.', 'court report', 'appeal'],
  ['solace-health', 'solace-patent-appeal', 'Patent appeal is about a sensor design, not the portal breach', 'A legal explainer separates Solace’s revived device patent case from its unrelated patient-data settlement.', 'legal explainer', 'appeal'],

  // Culture: same artist, catalogue versus live performance.
  ['mira-vale', 'mira-vale-archive-release', 'Mira Vale releases restored demos from her first album', 'Singer Mira Vale issued a digital collection of home demos recorded before her 2008 debut.', 'music news', 'archive'],
  ['mira-vale', 'mira-vale-archive-release', 'The Mira Vale demos reveal craft, not a lost masterpiece', 'A critic finds the restored recordings intimate but argues the released album remains the stronger work.', 'review', 'archive'],
  ['mira-vale', 'mira-vale-festival-walkout', 'Mira Vale ends festival set early after sound failure', 'Mira Vale left the Harbor Lights stage after repeated monitor failures interrupted three songs.', 'live report', 'performance'],
  ['mira-vale', 'mira-vale-festival-walkout', 'Festival’s sound problem should not become a Mira Vale feud', 'Fans debate the abrupt set ending, while organizers say a technical review is underway.', 'fan commentary', 'performance'],

  // Enduring question: same broad question, distinct propositions.
  ['home-energy', 'home-energy-heat-pumps-renters', 'Can renters install a heat pump without replacing the whole system?', 'A housing guide explains portable and landlord-approved heat-pump options for renters in older apartments.', 'practical guide', 'renters'],
  ['home-energy', 'home-energy-heat-pumps-renters', 'Renters need heat-pump rights, not just product advice', 'Tenant groups argue that appliance guides cannot substitute for rules requiring landlords to permit efficient heating.', 'advocacy', 'renters'],
  ['home-energy', 'home-energy-solar-battery-sizing', 'How large should a home solar battery be for evening use?', 'An energy calculator compares battery capacity with a household’s typical evening demand and solar output.', 'practical guide', 'sizing'],
  ['home-energy', 'home-energy-solar-battery-sizing', 'Bigger home batteries are not always greener', 'Energy researchers say oversized residential batteries can add cost and materials without reducing much grid demand.', 'analysis', 'sizing'],

  // Public health: same institute, separate interventions.
  ['cedar-health', 'cedar-flu-vaccine-clinic', 'Cedar Health opens walk-in flu vaccine clinics', 'Cedar Health will offer no-appointment influenza vaccination at four neighborhood clinics through November.', 'health notice', 'clinic'],
  ['cedar-health', 'cedar-flu-vaccine-clinic', 'Walk-in flu clinics help, but hours miss night workers', 'Community groups welcomed Cedar Health’s vaccine sites while asking for evening appointments.', 'access critique', 'clinic'],
  ['cedar-health', 'cedar-antibiotic-guidance', 'Cedar Health asks doctors to reduce routine antibiotic use for colds', 'New Cedar Health guidance advises clinicians to explain why viral colds do not benefit from antibiotics.', 'medical guidance', 'guidance'],
  ['cedar-health', 'cedar-antibiotic-guidance', 'Antibiotic guidance needs better support for rushed clinics', 'Primary-care doctors say Cedar Health’s new cold guidance is sensible but needs patient materials and staffing.', 'professional response', 'guidance'],

  // Economics: same company, earnings versus acquisition.
  ['quarry-finance', 'quarry-q2-earnings', 'Quarry Finance posts higher second-quarter lending income', 'Quarry Finance reported stronger Q2 income after small-business lending grew faster than expected.', 'earnings report', 'earnings'],
  ['quarry-finance', 'quarry-q2-earnings', 'Quarry’s Q2 profit does not settle concerns about delinquent loans', 'Analysts note that Quarry Finance’s improved quarter came alongside a rise in late repayments.', 'market analysis', 'earnings'],
  ['quarry-finance', 'quarry-credit-union-deal', 'Quarry Finance to acquire Meadow Credit Union', 'Quarry Finance announced a proposed purchase of Meadow Credit Union, pending competition review.', 'deal report', 'acquisition'],
  ['quarry-finance', 'quarry-credit-union-deal', 'Meadow acquisition could reduce local banking choice', 'Consumer groups urge regulators to scrutinize Quarry Finance’s plan to buy Meadow Credit Union.', 'competition critique', 'acquisition'],

  // Technology: same standard, different revision.
  ['arcmesh', 'arcmesh-v3-security-patch', 'ArcMesh 3.2 patch closes mesh-routing flaw', 'ArcMesh released version 3.2.1 to address a routing vulnerability affecting some enterprise mesh networks.', 'security bulletin', 'patch'],
  ['arcmesh', 'arcmesh-v3-security-patch', 'ArcMesh patch fixes a flaw, but customers need a clearer upgrade map', 'Administrators say the ArcMesh 3.2.1 security update is welcome but migration documentation is incomplete.', 'admin critique', 'patch'],
  ['arcmesh', 'arcmesh-v4-protocol-draft', 'ArcMesh 4 protocol draft proposes lower-power relay mode', 'The ArcMesh consortium published a draft for version 4, including an optional power-saving relay feature.', 'standards news', 'draft'],
  ['arcmesh', 'arcmesh-v4-protocol-draft', 'Relay mode in ArcMesh 4 is promising, not ready for deployment', 'Engineers caution that the proposed ArcMesh 4 relay feature remains a draft and lacks interoperability tests.', 'technical caution', 'draft'],

  // Education: same university, different rule changes.
  ['elm-university', 'elm-ai-exam-policy', 'Elm University permits declared AI use in take-home exams', 'Elm University will let instructors allow generative tools in take-home assessments if students document their use.', 'education policy', 'assessment'],
  ['elm-university', 'elm-ai-exam-policy', 'Elm’s AI disclosure rule may punish students who need accessibility tools', 'Student advocates ask the university to distinguish assistive writing technology from undeclared answer generation.', 'student critique', 'assessment'],
  ['elm-university', 'elm-library-hours-cuts', 'Elm University shortens late-night library hours', 'Budget cuts will close Elm’s central library at midnight rather than 2 a.m. during the coming term.', 'campus news', 'budget'],
  ['elm-university', 'elm-library-hours-cuts', 'Library hour cuts move the cost of saving money onto students', 'Elm students say reduced late-night access makes it harder for commuters and working students to study.', 'student critique', 'budget'],

  // Agriculture: same crop, disease versus pricing.
  ['northvale-orchards', 'northvale-apple-blight', 'Northvale growers report early signs of apple leaf blight', 'Orchards in Northvale are monitoring a fungal leaf disease after a wet spring increased infection risk.', 'agriculture report', 'disease'],
  ['northvale-orchards', 'northvale-apple-blight', 'Apple blight advice should reach small Northvale farms sooner', 'Small growers say extension warnings about leaf blight arrived after preventive treatment windows narrowed.', 'farmer critique', 'disease'],
  ['northvale-orchards', 'northvale-apple-export-prices', 'Northvale apple exporters gain from stronger overseas prices', 'Export contracts for Northvale apples rose after a poor harvest reduced supply in competing regions.', 'market report', 'prices'],
  ['northvale-orchards', 'northvale-apple-export-prices', 'Higher apple export prices may not reach Northvale pickers', 'Labor groups say stronger orchard revenues do not automatically improve wages for seasonal workers.', 'labor critique', 'prices'],

  // Climate: same river, restoration versus flooding.
  ['silver-river', 'silver-river-wetland-restoration', 'Silver River wetland project begins removing old drainage ditches', 'Conservation crews started restoring floodplain wetlands along the Silver River to improve bird habitat.', 'environment news', 'restoration'],
  ['silver-river', 'silver-river-wetland-restoration', 'Wetland restoration needs a plan for neighboring farms', 'Farmers support healthier Silver River habitat but want clearer drainage protections during construction.', 'local critique', 'restoration'],
  ['silver-river', 'silver-river-spring-flood-warning', 'Silver River residents warned of spring flood crest', 'Emergency officials issued a flood warning as rapid snowmelt pushed the Silver River toward its banks.', 'emergency report', 'flood'],
  ['silver-river', 'silver-river-spring-flood-warning', 'Flood alerts came too late for some Silver River households', 'Residents say warning messages arrived after low-lying roads were already closed by rising water.', 'accountability critique', 'flood'],

  // Transport: same railway, different timetable decisions.
  ['metroline', 'metroline-night-service', 'MetroLine adds Friday night trains on the green route', 'MetroLine will run later green-line trains on Fridays during a six-month nightlife service trial.', 'transit news', 'service'],
  ['metroline', 'metroline-night-service', 'Friday night MetroLine trains are welcome but leave shift workers behind', 'Riders note the new late service does not operate on weeknights when many hospital staff finish work.', 'rider critique', 'service'],
  ['metroline', 'metroline-fare-zone-redraw', 'MetroLine proposes new fare zones for outer suburbs', 'MetroLine’s draft map would combine two outer fare zones and change some monthly pass prices.', 'policy proposal', 'fares'],
  ['metroline', 'metroline-fare-zone-redraw', 'New MetroLine zones could make commuting less predictable', 'Suburban commuters say the proposed fare map needs clearer examples before consultation closes.', 'rider critique', 'fares'],

  // Consumer safety: same food brand, batches differ.
  ['harvest-mill', 'harvest-mill-oat-recall', 'Harvest Mill recalls oat bars after undeclared sesame finding', 'Harvest Mill pulled a specific oat-bar batch because the wrapper failed to list sesame as an ingredient.', 'recall notice', 'allergen'],
  ['harvest-mill', 'harvest-mill-oat-recall', 'Allergen recall shows why Harvest Mill needs better packaging checks', 'Food safety advocates say Harvest Mill should explain how the sesame label error reached stores.', 'safety critique', 'allergen'],
  ['harvest-mill', 'harvest-mill-grain-contracts', 'Harvest Mill signs long-term contracts with regional grain co-ops', 'Harvest Mill agreed to multi-year grain purchases from three farmer-owned cooperatives.', 'supply-chain news', 'contracts'],
  ['harvest-mill', 'harvest-mill-grain-contracts', 'Grain contracts could stabilize farms, if Harvest Mill shares the terms', 'Farm groups welcome the buyer’s co-op agreements but seek transparency on price floors.', 'farmer critique', 'contracts'],

  // International affairs: same country pair, different issue.
  ['norland-esteria', 'norland-esteria-fisheries-talks', 'Norland and Esteria resume fisheries quota negotiations', 'Delegations from Norland and Esteria reopened talks on annual fishing quotas in the Coldwater Strait.', 'diplomacy report', 'fisheries'],
  ['norland-esteria', 'norland-esteria-fisheries-talks', 'Fisheries talks need coastal communities at the table', 'Fishing cooperatives say Norland and Esteria should publish more detail from quota negotiations.', 'community critique', 'fisheries'],
  ['norland-esteria', 'norland-esteria-border-rail', 'Norland and Esteria agree to study cross-border rail link', 'The two governments commissioned a feasibility study for a passenger rail connection between their capitals.', 'infrastructure news', 'rail'],
  ['norland-esteria', 'norland-esteria-border-rail', 'Rail feasibility study is not a construction promise', 'Transport analysts welcome Norland and Esteria’s rail study but warn that financing remains unresolved.', 'analysis', 'rail'],

  // Entertainment: same game, sequel versus live-service update.
  ['skyforge-studios', 'skyforge-emberfall-sequel', 'Skyforge Studios announces Emberfall sequel for next autumn', 'Skyforge Studios revealed Emberfall: Ashwake, a sequel with a new protagonist and planned autumn release.', 'game announcement', 'sequel'],
  ['skyforge-studios', 'skyforge-emberfall-sequel', 'Emberfall sequel trailer sells mood before mechanics', 'A preview says Ashwake’s announcement offers strong atmosphere but little evidence of how its combat will change.', 'game critique', 'sequel'],
  ['skyforge-studios', 'skyforge-rift-season-update', 'Skyforge deploys Rift season update with ranked reset', 'Skyforge Studios launched a new Rift Arena season, resetting ranked ladders and adding two maps.', 'live-service update', 'season'],
  ['skyforge-studios', 'skyforge-rift-season-update', 'Rift ranked reset frustrates veteran players again', 'Competitive players argue the latest Skyforge seasonal reset repeats matchmaking issues from last season.', 'player critique', 'season'],

  // Civil rights: same law, different litigation stages.
  ['brighton-voting-law', 'brighton-voter-id-injunction', 'Judge temporarily blocks Brighton voter ID requirement', 'A state judge paused Brighton’s new photo-identification rule while a challenge proceeds.', 'court report', 'injunction'],
  ['brighton-voting-law', 'brighton-voter-id-injunction', 'Voter ID injunction protects access but case is far from over', 'Civil-rights groups say the Brighton ruling is temporary and urge voters to check current requirements.', 'advocacy', 'injunction'],
  ['brighton-voting-law', 'brighton-mail-ballot-audit', 'Brighton orders audit of mailed-ballot processing times', 'Election officials will review delays in Brighton’s mailed-ballot tracking system after the last municipal vote.', 'election administration', 'audit'],
  ['brighton-voting-law', 'brighton-mail-ballot-audit', 'Mail-ballot audit should examine communication failures too', 'Voters say Brighton’s processing review must include confusing status messages, not only internal timing.', 'voter critique', 'audit'],

  // Architecture: same building, renovation versus ownership.
  ['aster-hall', 'aster-hall-roof-restoration', 'Aster Hall restoration begins with copper roof replacement', 'Preservation crews started replacing damaged copper panels on the century-old roof of Aster Hall.', 'heritage news', 'restoration'],
  ['aster-hall', 'aster-hall-roof-restoration', 'Aster Hall roof work should preserve public access', 'Local historians support the restoration but ask for clearer plans for visitor access during the closure.', 'heritage critique', 'restoration'],
  ['aster-hall', 'aster-hall-ownership-sale', 'City considers selling Aster Hall to arts cooperative', 'The city council will consider transferring Aster Hall to a nonprofit arts cooperative under a long lease.', 'civic proposal', 'ownership'],
  ['aster-hall', 'aster-hall-ownership-sale', 'Aster Hall sale debate is about stewardship, not roof repairs', 'A public forum distinguishes the proposed arts-cooperative transfer from the ongoing building restoration.', 'civic explainer', 'ownership'],
];

export const documents = Object.freeze(rows.map(([family, topicLabel, title, body, viewpoint, development], index) => Object.freeze({
  id: `holdout-v2-${String(index + 1).padStart(3, '0')}`,
  family,
  topicLabel,
  title,
  body,
  viewpoint,
  development,
})));

function stablePayload(items) {
  return items.map(({ id, family, topicLabel, title, body, viewpoint, development }) =>
    [id, family, topicLabel, title, body, viewpoint, development].join('\u001f')).join('\n');
}

export const digest = createHash('sha256').update(stablePayload(documents), 'utf8').digest('hex');

export function validateHoldoutV2(items = documents) {
  if (!Array.isArray(items) || items.length < 80) throw new Error('expected at least 80 synthetic holdout documents');
  const ids = new Set();
  const byFamily = new Map();
  const byTopic = new Map();
  for (const item of items) {
    for (const key of ['id', 'family', 'topicLabel', 'title', 'body', 'viewpoint', 'development']) {
      if (typeof item[key] !== 'string' || item[key].trim() === '') throw new Error(`missing ${key}`);
    }
    if (ids.has(item.id)) throw new Error(`duplicate id ${item.id}`);
    ids.add(item.id);
    const familyTopics = byFamily.get(item.family) ?? new Set();
    familyTopics.add(item.topicLabel);
    byFamily.set(item.family, familyTopics);
    const topicItems = byTopic.get(item.topicLabel) ?? [];
    topicItems.push(item);
    byTopic.set(item.topicLabel, topicItems);
  }
  if (byFamily.size < 16 || byFamily.size > 24) throw new Error('expected 16–24 families');
  for (const [family, labels] of byFamily) {
    if (labels.size < 2 || labels.size > 3) throw new Error(`family ${family} must have 2–3 atomic topics`);
  }
  for (const [label, topicItems] of byTopic) {
    if (topicItems.length !== 2) throw new Error(`topic ${label} must have exactly two documents`);
    if (topicItems[0].viewpoint === topicItems[1].viewpoint) throw new Error(`topic ${label} needs distinct viewpoints`);
  }
  const computedDigest = createHash('sha256').update(stablePayload(items), 'utf8').digest('hex');
  return Object.freeze({
    schema: 'topic-encoder-holdout-v2/v1',
    provenance: 'project-created-synthetic',
    documents: items.length,
    families: byFamily.size,
    topicLabels: byTopic.size,
    digest: computedDigest,
  });
}

export const holdoutV2 = Object.freeze({
  schema: 'topic-encoder-holdout-v2/v1',
  provenance: 'project-created-synthetic',
  documents,
});

// Backwards-friendly alias for stand-alone corpus tooling.
export const corpus = holdoutV2;
