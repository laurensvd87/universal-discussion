import { corpus as legacy } from '../../topic-identity/corpus.js';

// Frozen evaluation subjects. These subjects must never enter model training.
// The three legacy families were frozen in topic-identity before this experiment.
const fresh = [
  ['quay-a1','quay','quay-ferry-fire','Harbor ferry fire prompts safety review','A fire broke out aboard the Quay City ferry on 3 March 2026. Officials praised the crew for evacuating passengers before the vessel reached the pier.'],
  ['quay-a2','quay','quay-ferry-fire','The Quay City ferry crew was not prepared','An inquiry into the 3 March ferry fire in Quay City says the evacuation was too slow. Passengers disagree with officials who praised the crew response.'],
  ['quay-b1','quay','quay-ferry-collision','Quay City ferry collision raises navigation concerns','On 19 September 2026 a Quay City ferry collided with a cargo ship near the pier. Investigators are reviewing navigation procedures.'],
  ['quay-b2','quay','quay-ferry-collision','Pilots defended after Quay City ferry collision','The 19 September collision between a cargo ship and a Quay City ferry did not result from pilot negligence, according to a union.'],
  ['aurora-a1','aurora','aurora-phone-recall','Aurora recalls X4 phones over battery swelling','Aurora announced a recall of its X4 handset on 6 April 2026 after reports of batteries swelling. Consumer groups welcomed the action.'],
  ['aurora-a2','aurora','aurora-phone-recall','Aurora X4 recall came far too late','Critics say Aurora ignored months of battery complaints before recalling its X4 phone in April 2026. They question whether owners were warned promptly.'],
  ['aurora-b1','aurora','aurora-phone-launch','Aurora X5 launch promises a brighter display','Aurora introduced the X5 handset at a September 2026 event. Reviewers praised its new display and camera.'],
  ['aurora-b2','aurora','aurora-phone-launch','The new Aurora X5 is an overpriced upgrade','The September launch of Aurora\'s X5 disappointed reviewers who found its brighter display insufficient reason to replace an older handset.'],
  ['beacon-a1','beacon','beacon-vote','Beacon district votes to close Oak School','The Beacon district board voted on 11 May 2026 to close Oak School. Some parents support combining classes at a newer campus.'],
  ['beacon-a2','beacon','beacon-vote','Oak School closure vote angers Beacon families','Families criticized the Beacon board\'s May 11 vote to close Oak School, citing longer journeys for children.'],
  ['beacon-b1','beacon','beacon-reopening','Oak School reopens after Beacon renovation','Oak School reopened in Beacon on 3 October 2026 following a separate renovation. Teachers welcomed returning pupils.'],
  ['beacon-b2','beacon','beacon-reopening','Beacon rushed Oak School reopening','Parents say the October 3 reopening of renovated Oak School in Beacon happened before safety work was finished.'],
  ['orion-a1','orion','orion-final','Orion defeats Vega in cup final','Orion beat Vega 2–1 in the 2026 cup final. Commentators praised Orion\'s defensive performance.'],
  ['orion-a2','orion','orion-final','Vega deserved more from the cup final','Analysts of Orion\'s 2–1 final win over Vega in 2026 argue Vega created better chances despite losing the trophy.'],
  ['orion-b1','orion','orion-rematch','Vega beats Orion in autumn rematch','In their September 2026 league rematch Vega defeated Orion 3–0. Analysts credited Vega\'s attack.'],
  ['orion-b2','orion','orion-rematch','Orion loss to Vega exaggerates the gap','Commentators say Vega\'s 3–0 September league victory over Orion overstated the teams\' difference in quality.'],
  ['meridian-a1','meridian','meridian-first-ruling','Meridian pollution lawsuit ends in damages award','A district court ordered Meridian Chemical to pay damages on 14 January 2026 for river pollution. Residents welcomed the ruling.'],
  ['meridian-a2','meridian','meridian-first-ruling','Meridian says pollution damages ruling is flawed','Meridian Chemical criticized the district court\'s January damages award for river pollution and disputed the evidence behind it.'],
  ['meridian-b1','meridian','meridian-appeal','Appeals court reverses Meridian pollution award','An appeals court overturned the Meridian Chemical river pollution damages award on 8 August 2026. The company welcomed the new judgment.'],
  ['meridian-b2','meridian','meridian-appeal','Residents condemn reversal of Meridian award','Residents criticized the August appellate ruling that reversed the earlier river pollution damages award against Meridian Chemical.'],
  ['kestrel-a1','kestrel','kestrel-study-one','Kestrel asthma trial A reports fewer attacks','Kestrel Biotech reported results of trial K1 on 7 February 2026, claiming its asthma treatment reduced attacks in adults.'],
  ['kestrel-a2','kestrel','kestrel-study-one','Experts question the Kestrel K1 asthma result','Researchers dispute Kestrel Biotech\'s February K1 trial claim that treated adults had fewer asthma attacks.'],
  ['kestrel-b1','kestrel','kestrel-study-two','Kestrel K2 trial misses asthma target','A second Kestrel Biotech trial, K2, reported on 30 August 2026 that its asthma treatment missed the main outcome target.'],
  ['kestrel-b2','kestrel','kestrel-study-two','Kestrel sees promise despite K2 trial miss','Kestrel Biotech says its August K2 asthma study still showed encouraging secondary results even though the primary target was missed.'],
].map(([id,family,topicLabel,title,body]) => ({id,family,topicLabel,title,body}));

const legacyHeldOut = legacy.documents.filter(d => legacy.split.heldOut.includes(d.family));
export const holdout = Object.freeze({
  schema: 'topic-encoder-holdout/v1',
  provenance: 'project-created-synthetic',
  legacyFamilies: Object.freeze([...legacy.split.heldOut]),
  freshFamilies: Object.freeze(['quay','aurora','beacon','orion','meridian','kestrel']),
  documents: Object.freeze([...legacyHeldOut, ...fresh].map(d => Object.freeze(d))),
});
