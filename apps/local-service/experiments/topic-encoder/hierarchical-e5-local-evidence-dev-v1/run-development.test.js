import test from 'node:test';
import assert from 'node:assert/strict';
// Importing is inert: no saved data reads, output claims or model execution.
import {summarizeDevelopmentOutcomes} from './run-development.mjs';

test('development summary distinguishes correct root from wrong sibling and unscored children',()=>{
  const rows=[{id:'one',expectedRootId:'games',completePath:['games','board-games']},
    {id:'two',expectedRootId:'nature',completePath:null},
    {id:'three',expectedRootId:'games',completePath:['games','gta']},
    {id:'four',expectedRootId:'nature',completePath:['nature','koala']},
    {id:'five',expectedRootId:'nature',completePath:['nature','plants']}];
  const outputs=[{id:'one',path:['games','video-games']},{id:'two',path:['nature','invented-child']},
    {id:'three',path:[]},{id:'four',path:['nature']},{id:'five',path:['nature','plants']}];
  const s=summarizeDevelopmentOutcomes(rows,outputs);
  assert.deepEqual(s,{rows:5,assigned:4,correctRoot:4,wrongRoot:0,unresolved:1,
    specificity:{annotated:4,unscored:1,exact:1,safeBroader:1,wrong:1,unresolved:1},
    developmentOnly:true,independentValidation:false});
});
test('over-specific descendants and wrong roots are not counted as safe prefixes',()=>{
  const rows=[{id:'one',expectedRootId:'games',completePath:['games']},
    {id:'two',expectedRootId:'games',completePath:null}];
  const s=summarizeDevelopmentOutcomes(rows,[{id:'one',path:['games','gta']},{id:'two',path:['nature']}]);
  assert.equal(s.specificity.wrong,1);assert.equal(s.wrongRoot,1);assert.equal(s.specificity.unscored,1);
  assert.throws(()=>summarizeDevelopmentOutcomes(rows,[{id:'bad',path:[]}])) ;
});
