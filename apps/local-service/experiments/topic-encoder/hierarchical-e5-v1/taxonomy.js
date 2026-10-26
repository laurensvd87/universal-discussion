import { CORPUS } from './corpus.js';

// Approved fixture definitions, authored before embedding. These are evaluation
// categories, not canonical Murmingle assignments or a proposed database schema.
const nodeTuples = [
  ['games', null, 'Games', 'Games and organised play, including digital and tabletop games.'],
  ['video-games', 'games', 'Video games', 'Digital games, their play, design and directly dependent fan works.'],
  ['gta', 'video-games', 'Grand Theft Auto', 'The Grand Theft Auto game franchise and directly dependent modifications, guides and fan works; excludes the Greater Toronto Area and real vehicle reports.'],
  ['red-dead-redemption', 'video-games', 'Red Dead Redemption', 'The Red Dead Redemption game franchise, including Online and directly dependent fan works.'],
  ['minecraft', 'video-games', 'Minecraft', 'Minecraft gameplay, servers, maps, mods and other directly dependent works; incidental branding on an independent physical game is insufficient.'],
  ['board-games', 'games', 'Board games', 'Physical tabletop board games, including chess, Go and games combining a board with cards or dice.'],
  ['nature', null, 'Nature', 'Natural ecosystems, landscapes and living organisms, including animals and plants.'],
  ['animals', 'nature', 'Animals', 'Animal biology, behaviour, conservation and welfare across species.'],
  ['koalas', 'animals', 'Koalas', 'Koala biology, behaviour, welfare and conservation; a tree article mentioning koalas incidentally stays about plants.'],
  ['dolphins', 'animals', 'Dolphins', 'Dolphin biology, behaviour, welfare and conservation, including river dolphins.'],
  ['plants', 'nature', 'Plants', 'Plant biology, identification, growth and propagation.'],
];

export const NODES = Object.freeze(nodeTuples.map(([id, parentId, label, definition]) =>
  Object.freeze({ id, parentId, label, definition })));

const internalNodeIds = new Set(NODES.filter(node => NODES.some(child => child.parentId === node.id)).map(node => node.id));
const rootIds = NODES.filter(node => node.parentId === null).map(node => node.id);

// Direct assignments only: the evaluator expands approved ancestry. A generic
// parent row is STOP at that parent, never a fabricated positive leaf example.
export const EXEMPLAR_ROWS = Object.freeze(CORPUS.filter(row => row.split === 'prototype').flatMap(row =>
  row.expectedTopicId === null
    ? rootIds.map(nodeId => Object.freeze({ rowId: row.id, nodeId, kind: 'outside', groupId: row.groupId }))
    : [Object.freeze({ rowId: row.id, nodeId: row.expectedTopicId,
      kind: internalNodeIds.has(row.expectedTopicId) ? 'stop' : 'positive', groupId: row.groupId })]));

export const TAXONOMY = Object.freeze({
  id: 'hierarchical-e5-synthetic-v1',
  provenance: 'independently-authored-synthetic-taxonomy',
  nodes: NODES,
  exemplarRows: EXEMPLAR_ROWS,
});

export const taxonomy = TAXONOMY;
export default TAXONOMY;
