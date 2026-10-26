// Authored category policy for a new synthetic frozen-feature feasibility screen.
// These explicit edges do not derive from vectors and confer no canonical runtime
// authority. Synthetic labels do not establish quality on independently sampled web pages.
const definitions = [
  ['games', null, 'Games', 'Rule-based play, including digital games, physical tabletop games and other organised games. General gaming, mixed forms and unrepresented forms stop here.'],
  ['video-games', 'games', 'Video games', 'Games played through software, their design, gameplay and directly dependent fan works. Unknown franchises such as Red Dead Redemption or Cyberpunk stay here; ordinary driving is outside.'],
  ['gta', 'video-games', 'Grand Theft Auto', 'The Grand Theft Auto franchise, its gameplay, missions, mods and dependent fan projects. Toronto acronym uses, real cars and independently themed board games do not qualify.'],
  ['minecraft', 'video-games', 'Minecraft', 'Minecraft gameplay, servers, maps, resource packs and dependent modifications. Block imagery on an independent physical game is insufficient.'],
  ['board-games', 'games', 'Board games', 'Physical games organised around a board, including chess, Go and games mixing boards with dice or cards. Digital-only play belongs to video games.'],
  ['nature', null, 'Nature', 'Natural landscapes, ecosystems and living organisms. General ecosystem accounts covering both vegetation and wildlife stop here.'],
  ['animals', 'nature', 'Animals', 'Animal behaviour, biology, welfare and conservation. Generic zoology, balanced species comparisons and unrepresented species stop here.'],
  ['koalas', 'animals', 'Koalas', 'Koala biology, behaviour, welfare and conservation. A plant or landscape article that merely mentions koalas does not become a koala article.'],
  ['dolphins', 'animals', 'Dolphins', 'Dolphin biology, behaviour, welfare and conservation, including river dolphins. Mascots and incidental illustrations do not qualify.'],
  ['plants', 'nature', 'Plants', 'Plant structure, identification, growth, propagation and botany. Central discussion of eucalyptus stays here despite a passing koala mention.'],
  ['cooking', null, 'Cooking', 'Preparing meals, recipes and general kitchen techniques. Unrepresented dishes and balanced dish comparisons stop here; banking and unrelated craft instructions are outside.'],
  ['kapsalon', 'cooking', 'Kapsalon', 'Preparation of the layered fries, filling, cheese and salad dish, including explicitly identified vegetarian and other recipe variations.'],
  ['pasta', 'cooking', 'Pasta', 'Preparing pasta dough, pasta dishes, sauces in a pasta recipe, stuffed pasta and pasta bakes. General seasoning guidance mentioning pasta in passing stays at Cooking.'],
  ['vehicles', null, 'Vehicles', 'Real motor vehicles, their components, maintenance and product reviews. Tyre advertising and general tyre selection are here; fictional driving inside a game is not.'],
  ['tyre-pressure', 'vehicles', 'Tyre pressure', 'Measuring, setting, interpreting or diagnosing pneumatic tyre inflation on real vehicles. Sales copy, tread reviews and incidental dashboard mentions are insufficient.'],
];

export const NODES = Object.freeze(definitions.map(([id, parentId, label, scope]) => Object.freeze({ id, parentId, label, scope })));
export const TAXONOMY = Object.freeze({
  id: 'hierarchical-e5-linear-synthetic-v1',
  provenance: 'synthetic-authored',
  decisionPolicy: 'Single deepest central subject; supported shared parent for equally central siblings; null for outside or absent captured subject. Never infer missing content or membership from an incidental mention.',
  nodes: NODES,
});
export const taxonomy = TAXONOMY;
export default TAXONOMY;
