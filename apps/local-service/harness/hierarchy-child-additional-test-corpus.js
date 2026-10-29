// Declared after one original TEST capture was unavailable, before ANY new
// candidate TEST prediction. Original eleven outcomes remain counted. No fit.
export const ADDITIONAL_CHILD_TEST_PROBES=Object.freeze([
 {id:'diversity-extra-test-01',groupId:'harmonies-physical-board-game',url:'https://www.libellud.com/game/harmonies/',
  rationale:'Primary publisher identifies wooden tokens, animal cards and physical boards; nature theme is contextual gameplay.'},
 {id:'diversity-extra-test-02',groupId:'seasons-physical-card-dice-game',url:'https://www.libellud.com/game/seasons/',
  rationale:'Primary publisher describes physical drafting, cards, dice and game boards.'},
].map(p=>Object.freeze({...p,split:'test',language:'en',publisher:'Libellud',expectedRootId:'games',labels:{'video-games':false,animals:false,koalas:false}})));
