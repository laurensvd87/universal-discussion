// Curated before scoring: two English public subjects per root. These are
// root-only labels, not terminal STOP/child labels or a representative web sample.
// Missing crawler observations stay missing; no prediction-dependent replacement.
const subjects = [
  ['games', 'Portal_(video_game)', 'portal-video-game'],
  ['games', 'Mahjong', 'mahjong-tile-game'],
  ['nature', 'Red_panda', 'red-panda'],
  ['nature', 'Orchidaceae', 'orchid-family'],
  ['cooking', 'Ratatouille', 'ratatouille-dish'],
  ['cooking', 'Baklava', 'baklava-pastry'],
  ['vehicles', 'Steam_locomotive', 'steam-locomotive'],
  ['vehicles', 'Steamship', 'steamship'],
  ['science', 'Entropy', 'thermodynamic-entropy'],
  ['science', 'Fibonacci_number', 'fibonacci-number'],
  ['technology', 'Domain_Name_System', 'domain-name-system'],
  ['technology', 'Computer_mouse', 'computer-mouse'],
  ['society', 'Human_rights', 'human-rights'],
  ['society', 'European_Parliament', 'european-parliament'],
  ['history', 'Battle_of_Hastings', 'battle-of-hastings'],
  ['history', 'Byzantine_Empire', 'byzantine-empire'],
  ['culture', 'Don_Quixote', 'don-quixote-novel'],
  ['culture', 'Jazz', 'jazz-music'],
  ['sports', 'Badminton', 'badminton-sport'],
  ['sports', 'Handball', 'handball-sport'],
  ['geography', 'Madagascar', 'madagascar-country'],
  ['geography', 'Rocky_Mountains', 'rocky-mountains'],
  ['health', 'Malaria', 'malaria-disease'],
  ['health', 'Appendicitis', 'appendicitis-disease'],
  ['business', 'Stock_market', 'stock-market'],
  ['business', 'International_trade', 'international-trade'],
  ['languages', 'Basque_language', 'basque-language'],
  ['languages', 'Phonology', 'phonology'],
  ['ideas-beliefs', 'Taoism', 'taoism-tradition'],
  ['ideas-beliefs', 'Determinism', 'determinism-philosophy'],
  ['education', 'Montessori_education', 'montessori-education'],
  ['education', 'University_of_Toronto', 'university-of-toronto'],
];

export const PUBLIC_HIERARCHY_PROBES = Object.freeze(subjects.map(([rootId, article, groupId], index) =>
  Object.freeze({ id: `public-probe-${String(index + 1).padStart(2, '0')}`,
    groupId, rootId, url: `https://en.wikipedia.org/wiki/${article}`,
    labelScope: 'root-only', language: 'en' })));
