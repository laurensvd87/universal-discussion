// Fixed before this model is loaded. Positive root descriptions, not exclusions
// or held-out page labels. House taxonomy remains an unapproved candidate.
export const ROOT_SUBJECTS=Object.freeze([
  ['games','games, recreational play or video games'],
  ['nature','living organisms, animals, plants, biological evolution or ecosystems'],
  ['cooking','food preparation, cooking techniques or recipes'],
  ['vehicles','real vehicles, their parts, operation or maintenance'],
  ['science','mathematics, physics, chemistry or astronomy'],
  ['technology','computers, software, communication systems or engineering'],
  ['society','society, government, politics, law or civic institutions'],
  ['history','historical events, past societies, warfare or historical interpretation'],
  ['culture','literature, music, films, visual arts or creative expression'],
  ['sports','physical sports, athletes or sporting competitions'],
  ['geography','geography, countries, regions, settlements or geographical places'],
  ['health','human health, medicine, diseases or psychology'],
  ['business','economics, finance, commerce, business operations or employment'],
  ['languages','human languages, linguistics, grammar, phonetics or language use'],
  ['ideas-beliefs','religion, religious traditions, beliefs or philosophy'],
  ['education','education, learning, teaching, schools or universities'],
].map(([nodeId,subject])=>Object.freeze({nodeId,hypothesis:`This text is about ${subject}.`})));
