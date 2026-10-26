import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCases} from './manifest.js';
function fixture(){
 const nodes=Array.from({length:16},(_,i)=>({id:'r'+i,parentId:null})),training=[],calibration=[],expansion=[];
 for(let i=0;i<16;i++){
  const make=(id,split,extra={})=>({id,entityGroup:'g-'+id,language:'en',publicUrl:'https://en.wikipedia.org/wiki/'+id,
   articleTitle:id,expectedRootId:'r'+i,split,...extra});
  for(let n=0;n<3;n++){training.push(make('old-train-'+i+'-'+n,'training'));calibration.push(make('old-cal-'+i+'-'+n,'calibration'));}
  for(let n=0;n<5;n++)expansion.push(make('new-train-'+i+'-'+n,'training',{supportedPathPrefix:['r'+i],maximumSpecificityKnown:false}));
  for(let n=0;n<2;n++)expansion.push(make('new-test-'+i+'-'+n,'test',{supportedPathPrefix:['r'+i],maximumSpecificityKnown:i<2}));
 }
 return {nodes,training,calibration,expansion};
}
test('normalize complete128/48/32 positive-only labels with no consumed-final loader',()=>{
 const f=fixture(),rows=normalizeCases(f.training,f.calibration,f.expansion,f.nodes);assert.equal(rows.length,208);
 assert.equal(rows.filter(r=>r.specificityPath!==null).length,4);
 assert.ok(rows.filter(r=>r.split==='training').every(r=>r.specificityPath===null));
 assert.ok(!rows.some(r=>'negativeChildren'in r||'expectedTopicId'in r));assert.ok(Object.isFrozen(rows[0].supportedPathPrefix));
});
test('reject missing rows, duplicate entities, wrong origin, foreign root and invented ancestry',()=>{
 for(const mutate of [
 f=>f.training.pop(),f=>{f.expansion[0].entityGroup=f.training[0].entityGroup;},
 f=>{f.expansion[0].publicUrl='https://de.wikipedia.org/wiki/X';},
 f=>{f.expansion[0].expectedRootId='foreign';},f=>{f.expansion[0].supportedPathPrefix=['r0','r1'];},
 f=>{f.expansion[0].publicUrl+='?x=1';}
 ]){const f=fixture();mutate(f);assert.throws(()=>normalizeCases(f.training,f.calibration,f.expansion,f.nodes));}
});
test('normalizer detaches positive-prefix arrays and requires exactly four reviewed final anchors',()=>{
 const f=fixture(),rows=normalizeCases(f.training,f.calibration,f.expansion,f.nodes);f.expansion[0].supportedPathPrefix[0]='foreign';
 assert.equal(rows[96].supportedPathPrefix[0],'r0');
 const g=fixture();g.expansion.find(r=>r.split==='test').maximumSpecificityKnown=false;
 assert.throws(()=>normalizeCases(g.training,g.calibration,g.expansion,g.nodes));
});
