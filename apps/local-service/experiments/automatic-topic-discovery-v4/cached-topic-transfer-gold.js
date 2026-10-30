// Root annotations fixed before predictions. This module never enters the bank,
// descriptor generation, alias generation, encoder input or lookup function.
export const CACHED_TOPIC_TRANSFER_GOLD = Object.freeze([
 {id:'H1',known:true,path:['Technology','Software','Programming languages','Python']},
 {id:'H2',known:true,path:['Technology','Software','File managers','Dolphin']},
 {id:'H3',known:true,path:['Nature','Animals','Mammals','Koalas']},
 {id:'H4',known:true,path:['Food','Dishes','Fast food','Kapsalon']},
 {id:'H5',known:true,path:['Games','Video games','Grand Theft Auto','Grand Theft Auto VI']},
 {id:'H6',known:true,path:['Games','Video games','Grand Theft Auto','Grand Theft Auto V']},
 {id:'H7',known:false,path:['Technology','Software','Programming languages']},
 {id:'H8',known:false,path:['Nature','Animals']},
 {id:'H9',known:false,path:['Nature','Animals']},
 {id:'H10',known:false,path:['Food','Dishes']},
 {id:'H11',known:false,path:[]},
 {id:'H12',known:false,path:['Technology','Software']},
].map(row=>Object.freeze({...row,path:Object.freeze(row.path)})));

export function scoreCachedTopicTransfer(rows,gold=CACHED_TOPIC_TRANSFER_GOLD) {
 if(!Array.isArray(rows)||rows.length!==gold.length||new Set(rows.map(row=>row.id)).size!==gold.length)
  throw new TypeError('Invalid cached topic transfer results');
 const expected=new Map(gold.map(row=>[row.id,row]));
 const counters={knownExact:0,knownBroader:0,knownUnresolved:0,unknownValidAncestor:0,unknownUnresolved:0,wrong:0};
 const details=rows.map(row=>{
  const g=expected.get(row.id),labels=row.lookup?.labels;
  if(!g||!Array.isArray(labels)||labels.some(label=>typeof label!=='string'))throw new TypeError('Invalid transfer selection');
  const prefix=labels.length<=g.path.length&&labels.every((label,i)=>label===g.path[i]);
  let outcome;
  if(!labels.length)outcome=g.known?'knownUnresolved':'unknownUnresolved';
  else if(!prefix)outcome='wrong';
  else if(g.known)outcome=labels.length===g.path.length?'knownExact':'knownBroader';
  else outcome='unknownValidAncestor';
  counters[outcome]++;return {id:row.id,outcome,expected:g.path,actual:labels};
 });
 return {total:rows.length,...counters,details};
}
