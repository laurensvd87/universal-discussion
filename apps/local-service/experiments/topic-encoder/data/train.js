// Synthetic English-only supervision for the topic-encoder experiment.
//
// This deliberately models a *discussion subject* (a concrete event, release,
// decision, or enduring question), rather than agreement.  Every topic has
// supportive and critical accounts.  The four topics in each family reuse the
// same central entity but describe distinct developments: those are hard
// negatives, not topics to collapse.  Nothing here was collected from users,
// publishers, or the existing local catalogue.

const trainingFamilies = [
  'news-emergency', 'news-public-policy', 'product-device', 'product-vehicle',
  'enduring-question', 'research-clinical', 'research-environment',
  'sports-tournament', 'sports-transfer', 'legal-court', 'legal-regulation',
  'business-merger',
];

const validationFamilies = ['science-space', 'culture-release', 'infrastructure-service'];

const families = [
  ['news-emergency', 'Port Oriole', [
    ['storm evacuation order', 'The Port Oriole mayor ordered residents of the east quay to leave ahead of a severe storm.', 'The evacuation order protected families before the storm reached the coast.', 'The order was issued too broadly and left vulnerable residents without transport.'],
    ['harbor fire investigation', 'Investigators opened a formal inquiry after a warehouse fire at Port Oriole harbor.', 'A transparent inquiry can establish why the harbor fire spread so quickly.', 'The inquiry avoids the agency failures that residents want addressed.'],
    ['drinking-water advisory', 'Port Oriole issued a boil-water advisory after a treatment fault.', 'The quick advisory put public health ahead of reputation.', 'Officials waited too long to explain the treatment fault.'],
    ['flood-barrier repair vote', 'Port Oriole approved emergency repairs to the damaged flood barrier.', 'Emergency repairs are the responsible way to prevent a second breach.', 'The rushed repair vote lacks independent cost scrutiny.'],
  ]],
  ['news-public-policy', 'Linden County', [
    ['late-night bus pilot', 'Linden County approved a six-month late-night bus pilot.', 'The pilot gives shift workers a practical alternative to driving.', 'The pilot spends public money without proving there will be riders.'],
    ['school-phone restriction', 'Linden County schools adopted a daytime restriction on student phones.', 'The restriction gives teachers back a calmer learning environment.', 'The rule treats every student as unable to use a phone responsibly.'],
    ['rental-inspection ordinance', 'Linden County adopted mandatory safety inspections for larger rental buildings.', 'The ordinance gives tenants a clear route to safer homes.', 'The new inspections add paperwork without fixing the housing shortage.'],
    ['public-library Sunday opening', 'Linden County funded Sunday hours for its public libraries.', 'Sunday opening makes study space available to families who need it.', 'The extra hours should not come at the cost of weekday services.'],
  ]],
  ['product-device', 'Aster Note', [
    ['Aster Note 4 battery replacement program', 'Aster launched a battery replacement program for the Aster Note 4 reader.', 'The replacement program extends the useful life of an otherwise capable reader.', 'The program is too expensive to count as meaningful repair support.'],
    ['Aster Note 4 handwriting update', 'Aster released a handwriting-recognition update for the Aster Note 4.', 'The update makes handwritten notes far more useful for everyday work.', 'The recognition update still makes too many errors for serious use.'],
    ['Aster Note 4 screen glare revision', 'Aster revised the Aster Note 4 display coating to reduce outdoor glare.', 'The revised coating solves a real readability problem for commuters.', 'The coating change is minor and does not justify a new purchase.'],
    ['Aster Note 4 cloud sync outage', 'Aster acknowledged a cloud-sync outage affecting Aster Note 4 notebooks.', 'The company identified the sync outage quickly and restored access.', 'The outage shows that notes should not depend on a single cloud service.'],
  ]],
  ['product-vehicle', 'Northstar Eon', [
    ['Northstar Eon winter range software update', 'Northstar released winter-range software for the Eon electric car.', 'The update gives owners a useful improvement without new hardware.', 'The revised estimate still leaves cold-weather drivers guessing.'],
    ['Northstar Eon braking recall', 'Northstar recalled selected Eon cars for a brake-sensor repair.', 'A prompt recall is the right response to a potentially serious fault.', 'The recall raises questions about testing before the cars were sold.'],
    ['Northstar Eon subscription navigation tier', 'Northstar introduced a paid navigation tier for the Eon.', 'The optional tier lets frequent drivers pay for richer route tools.', 'Navigation belongs with the car rather than behind a subscription.'],
    ['Northstar Eon factory-price reduction', 'Northstar reduced the factory price of the Eon electric car.', 'The lower price makes an efficient electric car reachable for more buyers.', 'Existing owners are left carrying the cost of Northstar price changes.'],
  ]],
  ['enduring-question', 'Civic Forum', [
    ['universal basic income debate', 'Civic Forum is debating whether a universal basic income should replace some targeted benefits.', 'A basic income could make support simpler and more secure.', 'A universal payment would divert funds from people with the greatest need.'],
    ['four-day workweek debate', 'Civic Forum is debating whether employers should move to a four-day workweek.', 'A shorter week can improve wellbeing without reducing useful work.', 'A four-day week may shift pressure onto smaller teams and customers.'],
    ['facial-recognition ban debate', 'Civic Forum is debating whether public facial recognition should be banned.', 'A ban protects people from routine identification in public space.', 'A total ban could prevent limited uses with meaningful oversight.'],
    ['ranked-choice voting debate', 'Civic Forum is debating whether local elections should use ranked-choice voting.', 'Ranked ballots can reward candidates with broader support.', 'The counting method risks making elections harder for voters to trust.'],
  ]],
  ['research-clinical', 'Helix Institute', [
    ['Luma migraine prevention trial', 'Helix Institute reported a trial of Luma for preventing migraines in adults.', 'The trial results justify a larger study of Luma for migraine prevention.', 'The reported benefit is too uncertain to establish that Luma works.'],
    ['Luma adolescent migraine trial', 'Helix Institute reported a trial of Luma for preventing migraines in adolescents.', 'The adolescent results offer a promising reason to continue research.', 'The adolescent study is too small to support confident conclusions.'],
    ['Neris sleep study', 'Helix Institute reported a study of Neris for chronic sleep disruption.', 'The sleep findings are encouraging and merit careful replication.', 'The study design does not separate Neris from changes in routine.'],
    ['Neris blood-pressure study', 'Helix Institute reported a study of Neris for mild high blood pressure.', 'The blood-pressure result provides a useful lead for future trials.', 'The reported change is not enough to establish a clinical benefit.'],
  ]],
  ['research-environment', 'Morrow Basin', [
    ['Morrow Basin wetland restoration study', 'Researchers measured bird recovery after restoring wetlands in Morrow Basin.', 'The recovery data show that wetland restoration can deliver visible benefits.', 'The study cannot prove restoration caused every change in bird numbers.'],
    ['Morrow Basin soil-carbon study', 'Researchers measured soil carbon after changing grazing practices in Morrow Basin.', 'The carbon measurements support trying the new grazing approach more widely.', 'Short-term soil readings do not establish a durable carbon benefit.'],
    ['Morrow Basin river-temperature study', 'Researchers measured river temperatures after shade trees were planted in Morrow Basin.', 'The cooler readings suggest riverbank planting can help aquatic habitat.', 'The temperature change may reflect weather rather than the planting project.'],
    ['Morrow Basin pollinator survey', 'Researchers surveyed pollinators after meadow corridors were added in Morrow Basin.', 'The survey gives a practical case for linking fragmented meadow habitat.', 'The pollinator counts do not yet show whether the corridors caused the increase.'],
  ]],
  ['sports-tournament', 'Rivermark FC', [
    ['Rivermark FC cup final', 'Rivermark FC reached the national cup final after a late semifinal goal.', 'The semifinal win shows Rivermark earned its place in the final.', 'The late win owed too much to a disputed officiating decision.'],
    ['Rivermark FC league playoff', 'Rivermark FC qualified for the league promotion playoff.', 'Playoff qualification rewards a season of disciplined performances.', 'The team stumbled too often to inspire confidence in the playoff.'],
    ['Rivermark FC continental qualifier', 'Rivermark FC secured a place in the continental qualifier.', 'The qualifier gives the club a valuable opportunity to test itself abroad.', 'The extra fixtures could expose an already thin Rivermark squad.'],
    ['Rivermark FC derby postponement', 'Rivermark FC postponed its derby because of unsafe weather conditions.', 'Postponing the derby put player and supporter safety first.', 'The late postponement left traveling supporters with avoidable costs.'],
  ]],
  ['sports-transfer', 'Mason Vale', [
    ['Mason Vale joins Harbor United', 'Forward Mason Vale signed for Harbor United from Eastford City.', 'Vale gives Harbor United a proven attacking option for the new season.', 'Harbor United paid too much for a player with an uneven recent record.'],
    ['Mason Vale contract extension', 'Harbor United extended forward Mason Vale’s contract by two years.', 'The extension rewards a player who fits Harbor United’s style.', 'The club should not commit longer before Vale proves consistent form.'],
    ['Mason Vale injury return', 'Mason Vale returned to training after a lengthy ankle injury.', 'Vale’s return gives Harbor United a timely boost before key matches.', 'The club should not rush Vale back before he is fully fit.'],
    ['Mason Vale captaincy appointment', 'Harbor United named Mason Vale as its new captain.', 'Vale has the experience to lead a changing Harbor United squad.', 'The captaincy may distract Vale from recovering his best form.'],
  ]],
  ['legal-court', 'Kestrel Court', [
    ['Kestrel Court tenant-deposit ruling', 'Kestrel Court ruled on how landlords must protect tenant deposits.', 'The ruling gives renters a clearer remedy when deposits are mishandled.', 'The decision imposes costly procedures on small landlords.'],
    ['Kestrel Court algorithmic-hiring ruling', 'Kestrel Court ruled on disclosure duties for algorithmic hiring tools.', 'The ruling gives applicants a fairer chance to challenge automated decisions.', 'The court created uncertainty for employers using ordinary screening tools.'],
    ['Kestrel Court protest-permit ruling', 'Kestrel Court ruled on a city’s protest-permit requirement.', 'The judgment protects public assembly from overly broad restrictions.', 'The decision leaves cities with too little ability to manage crowded events.'],
    ['Kestrel Court recycling-contract ruling', 'Kestrel Court ruled on a dispute over a municipal recycling contract.', 'The judgment clarifies how public contracts should be awarded.', 'The ruling could delay needed services while every contract is challenged.'],
  ]],
  ['legal-regulation', 'Arden Authority', [
    ['Arden Authority data-broker rule', 'The Arden Authority proposed a rule requiring data brokers to offer deletion requests.', 'The rule gives people a practical way to limit data resale.', 'The proposal creates compliance work without stopping harmful collection.'],
    ['Arden Authority food-label rule', 'The Arden Authority proposed clearer front-of-pack food labels.', 'Clear labels can help shoppers compare products quickly.', 'Simplified labels risk treating very different diets as the same.'],
    ['Arden Authority drone-delivery rule', 'The Arden Authority proposed limits for low-altitude drone deliveries.', 'Limits can make drone delivery grow without ignoring neighborhood safety.', 'The restrictions may stop useful delivery services before they mature.'],
    ['Arden Authority app-store rule', 'The Arden Authority proposed new rules for app-store payment choices.', 'Payment choice can give smaller developers a fairer route to customers.', 'The rule could make mobile software less secure and harder to review.'],
  ]],
  ['business-merger', 'Solace Group', [
    ['Solace Group acquires Lantern Maps', 'Solace Group agreed to acquire navigation startup Lantern Maps.', 'Solace can give Lantern Maps the resources to improve its service.', 'The acquisition could remove an independent competitor from mapping.'],
    ['Solace Group sells Meadow Audio', 'Solace Group agreed to sell Meadow Audio to a specialist music company.', 'A specialist owner can give Meadow Audio the attention it lacks inside Solace.', 'The sale risks breaking up a product line that customers rely on.'],
    ['Solace Group opens repair network', 'Solace Group opened an independent repair-partner network.', 'The repair network gives customers more convenient ways to maintain devices.', 'The network may outsource responsibility without lowering repair prices.'],
    ['Solace Group closes regional office', 'Solace Group announced the closure of its Westhaven regional office.', 'Consolidating offices may protect the wider business during a difficult year.', 'The closure abandons workers and customers in Westhaven.'],
  ]],
  ['science-space', 'Orion Survey', [
    ['Orion Survey comet spectrum release', 'The Orion Survey released a spectrum of comet QX-47.', 'The spectrum gives researchers useful clues about the comet’s composition.', 'The first spectrum is too limited to support confident claims about the comet.'],
    ['Orion Survey exoplanet transit result', 'The Orion Survey reported a transit signal around the star Helion-42.', 'The transit result is a promising lead for follow-up observation.', 'One signal is not enough to establish that Helion-42 has a planet.'],
    ['Orion Survey satellite calibration delay', 'The Orion Survey delayed a satellite calibration after a sensor anomaly.', 'Delaying calibration is prudent when the measurement quality is uncertain.', 'The delay shows the mission schedule was not resilient enough.'],
    ['Orion Survey lunar-image archive', 'The Orion Survey released a public archive of lunar surface images.', 'The archive will help researchers and classrooms examine the lunar surface.', 'The release needs clearer documentation before outsiders can use it well.'],
  ]],
  ['culture-release', 'Studio Finch', [
    ['Studio Finch game accessibility patch', 'Studio Finch released an accessibility patch for the game Wild Signal.', 'The patch makes Wild Signal more welcoming without changing its identity.', 'The patch arrived too late after players had already been excluded.'],
    ['Studio Finch film director cut', 'Studio Finch announced a director’s cut of the film Glass Harbor.', 'The new cut can give audiences a fuller version of Glass Harbor.', 'A director’s cut can become a marketing exercise rather than a better film.'],
    ['Studio Finch album rights dispute', 'Studio Finch entered a dispute over streaming rights for the album Paper Atlas.', 'The dispute could clarify how artists are paid for digital releases.', 'Fans should not lose access while companies argue over rights.'],
    ['Studio Finch museum partnership', 'Studio Finch partnered with a museum for an interactive design exhibition.', 'The partnership can bring design history to an audience that rarely visits museums.', 'The exhibition risks turning a museum into a brand showcase.'],
  ]],
  ['infrastructure-service', 'Meridian Line', [
    ['Meridian Line signal upgrade', 'Meridian Line began a signal upgrade on its central rail corridor.', 'The upgrade is necessary to make the corridor safer and more reliable.', 'Passengers deserve clearer service plans during the disruptive work.'],
    ['Meridian Line fare-cap trial', 'Meridian Line started a monthly fare-cap trial for regular riders.', 'A fare cap makes daily travel more predictable for frequent passengers.', 'The trial may shift costs onto riders who travel less often.'],
    ['Meridian Line station-access elevator', 'Meridian Line opened a new elevator at Alder Station.', 'The elevator removes a daily barrier for passengers with limited mobility.', 'One elevator does not solve the wider access problems at Alder Station.'],
    ['Meridian Line overnight-service reduction', 'Meridian Line reduced overnight trains during a staffing shortage.', 'The temporary reduction is preferable to running an unreliable timetable.', 'Night workers are being asked to carry the cost of a staffing failure.'],
  ]],
];

function rephraseDevelopment(event) {
  const substitutions = [
    [/\bupdate\b/i, 'revision'], [/\btrial\b/i, 'experiment'],
    [/\brevision\b/i, 'design change'], [/\boutage\b/i, 'service incident'],
    [/\bruling\b/i, 'judgment'], [/\bdebate\b/i, 'question'],
    [/\bvote\b/i, 'decision'], [/\border\b/i, 'directive'],
    [/\bprogram\b/i, 'initiative'], [/\btier\b/i, 'option'],
    [/\brecall\b/i, 'repair action'], [/\bextension\b/i, 'renewal'],
    [/\breduction\b/i, 'price cut'], [/\bclosure\b/i, 'shutdown'],
    [/\breopening\b/i, 'return to service'], [/\brelease\b/i, 'publication'],
    [/\bstudy\b/i, 'research report'], [/\bsurvey\b/i, 'field count'],
    [/\bpatch\b/i, 'accessibility release'], [/\bpartnership\b/i, 'collaboration'],
    [/\bupgrade\b/i, 'modernisation'], [/\bpilot\b/i, 'test scheme'],
    [/\bordinance\b/i, 'local rule'], [/\bopening\b/i, 'new hours'],
    [/\bappointment\b/i, 'leadership choice'], [/\bagreement\b/i, 'deal'],
    [/\bacquisition\b/i, 'purchase'], [/\bsale\b/i, 'divestment'],
  ];
  for (const [matcher, replacement] of substitutions) {
    if (matcher.test(event)) return event.replace(matcher, replacement);
  }
  // The fallback deliberately replaces, rather than appends to, a token so a
  // positive document never contains the full canonical event phrase.
  return event.replace(/\S+$/, 'development');
}

const openingFrames = [
  ({ summary }) => summary,
  ({ entity, summary }) => `At ${entity}, ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`,
  ({ summary }) => `The latest report says: ${summary}`,
];

function familyFrameIndex(family) {
  return [...family].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 3;
}

function supportiveBody({ entity, event, support, family }) {
  const development = rephraseDevelopment(event);
  const forms = [
    `Advocates in the ${family} discussion around ${entity} focus on the ${development}. ${support}`,
    `For supporters of ${entity}, the ${development} is the key change. ${support}`,
    `The optimistic reading of ${entity}'s ${development} is straightforward: ${support}`,
  ];
  return forms[familyFrameIndex(family)];
}

function criticalBody({ entity, event, critique, family }) {
  const development = rephraseDevelopment(event);
  const forms = [
    `Skeptics looking at ${entity}'s ${development} take a different view. ${critique} This is not a judgment about every ${family} development.`,
    `The critical account of ${entity} centres on the ${development}. ${critique} It does not settle separate ${family} questions.`,
    `Opponents say the ${development} at ${entity} deserves more caution. ${critique} Their objection is limited to this development.`,
  ];
  return forms[familyFrameIndex(family)];
}

const documentFrames = [
  (context) => `${openingFrames[context.topicIndex % openingFrames.length](context)} This account concerns one concrete development, rather than every issue involving the same entity.`,
  supportiveBody,
  criticalBody,
  ({ event, summary, support, critique, family }) => `The ${family} dispute about ${event} remains unsettled. Supporters say ${support} Critics say ${critique} The reporting basis is that ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`,
];

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function titleFor({ event, entity, family, viewpoint, topicIndex }) {
  const forms = {
    report: [`What changed: ${event}`, `${event}: the latest development`, `A new turn for ${event}`],
    supportive: [`${entity} backers make their case`, `Why supporters welcome ${entity}'s latest move`, `The optimistic reading from ${entity}`],
    critical: [`${entity} critics raise objections`, `Questions about ${entity}'s latest move`, `The skeptical case from ${entity}`],
    contested: [`The case for and against ${event}`, `${family} voices split over ${event}`, `A divided response to ${event}`],
  };
  return forms[viewpoint][topicIndex % forms[viewpoint].length];
}

const viewpoints = ['report', 'supportive', 'critical', 'contested'];

// Audit-only mapping. The runner must never include this in the embedding text.
export const trainingTopicEvents = Object.fromEntries(families.flatMap(([family, , topics]) =>
  topics.map(([event]) => [`${family}:${slug(event)}`, event]),
));

export const trainingCorpus = {
  schema: 'topic-encoder-training-corpus/v1',
  provenance: 'project-created-synthetic; invented English-only content; no user, publisher, or local-catalogue data',
  split: { training: trainingFamilies, validation: validationFamilies },
  documents: families.flatMap(([family, entity, topics]) => topics.flatMap(([event, summary, support, critique], topicIndex) => {
    const topicLabel = `${family}:${slug(event)}`;
    return viewpoints.map((viewpoint, documentIndex) => ({
      id: `train-${family}-${topicIndex + 1}-${viewpoint}`,
      family,
      topicLabel,
      title: titleFor({ event, entity, family, viewpoint, topicIndex }),
      body: documentFrames[documentIndex]({ event, summary, support, critique, entity, family, topicIndex }),
      viewpoint,
      // Metadata below is training-only audit context. The embedding input must
      // use title/body, never labels, entity names, or split membership.
      entity,
      eventKind: family,
    }));
  })),
};

export const trainingPairStats = (() => {
  const topicGroups = new Map();
  const familyGroups = new Map();
  for (const document of trainingCorpus.documents) {
    const topicDocuments = topicGroups.get(document.topicLabel) ?? [];
    topicDocuments.push(document);
    topicGroups.set(document.topicLabel, topicDocuments);
    const familyDocuments = familyGroups.get(document.family) ?? [];
    familyDocuments.push(document);
    familyGroups.set(document.family, familyDocuments);
  }
  const choose2 = (count) => (count * (count - 1)) / 2;
  const positivePairs = [...topicGroups.values()].reduce((sum, documents) => sum + choose2(documents.length), 0);
  const hardNegativePairs = [...familyGroups.values()].reduce((sum, documents) => {
    const allPairs = choose2(documents.length);
    const sameTopicPairs = [...new Set(documents.map((document) => document.topicLabel))]
      .reduce((topicSum, topicLabel) => topicSum + choose2(topicGroups.get(topicLabel).length), 0);
    return sum + allPairs - sameTopicPairs;
  }, 0);
  return {
    documents: trainingCorpus.documents.length,
    topics: topicGroups.size,
    documentsPerTopic: 4,
    positivePairs,
    hardNegativePairs,
    trainingTopics: [...topicGroups.keys()].filter((label) => trainingFamilies.includes(label.split(':')[0])).length,
    validationTopics: [...topicGroups.keys()].filter((label) => validationFamilies.includes(label.split(':')[0])).length,
  };
})();

export function validateTrainingCorpus(value = trainingCorpus) {
  const errors = [];
  const allowedFamilies = new Set([...trainingFamilies, ...validationFamilies]);
  const seenIds = new Set();
  const topics = new Map();
  for (const document of value.documents) {
    for (const field of ['id', 'family', 'topicLabel', 'title', 'body', 'viewpoint']) {
      if (typeof document[field] !== 'string' || document[field].trim().length === 0) {
        errors.push(`invalid ${field} on ${document.id ?? 'unknown'}`);
      }
    }
    if (seenIds.has(document.id)) errors.push(`duplicate id ${document.id}`);
    seenIds.add(document.id);
    if (!allowedFamilies.has(document.family)) errors.push(`unknown family ${document.family}`);
    const documents = topics.get(document.topicLabel) ?? [];
    documents.push(document);
    topics.set(document.topicLabel, documents);
  }
  if (new Set(value.split.training).size !== value.split.training.length) errors.push('duplicate training family');
  if (new Set(value.split.validation).size !== value.split.validation.length) errors.push('duplicate validation family');
  for (const family of value.split.training) if (value.split.validation.includes(family)) errors.push(`split overlap ${family}`);
  for (const [label, documents] of topics) {
    if (documents.length !== 4) errors.push(`topic ${label} has ${documents.length} documents, expected 4`);
    if (new Set(documents.map((document) => document.viewpoint)).size !== 4) errors.push(`topic ${label} lacks viewpoint diversity`);
    const supportiveDocument = documents.find((document) => document.viewpoint === 'supportive');
    const canonicalEvent = trainingTopicEvents[label];
    if (canonicalEvent && `${supportiveDocument.title} ${supportiveDocument.body}`.toLowerCase().includes(canonicalEvent.toLowerCase())) {
      errors.push(`supportive document repeats canonical event phrase for ${label}`);
    }
  }
  for (const family of allowedFamilies) {
    const topicCount = [...topics.keys()].filter((label) => label.startsWith(`${family}:`)).length;
    if (topicCount < 2) errors.push(`family ${family} has ${topicCount} topics, expected at least 2`);
  }
  if (topics.size < 60) errors.push(`only ${topics.size} topics, expected at least 60`);
  if (errors.length > 0) throw new Error(`topic training corpus invalid: ${errors.join('; ')}`);
  return { documents: value.documents.length, topics: topics.size };
}
