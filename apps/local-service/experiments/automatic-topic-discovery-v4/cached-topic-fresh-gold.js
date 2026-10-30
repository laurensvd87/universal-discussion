// Separate Root review before inference. An emulator can have a valid software
// or gaming ancestor, but never the unrelated KDE file-manager leaf.
export const CACHED_TOPIC_FRESH_GOLD=Object.freeze([
 {id:'F1',known:true,paths:[['Technology','Software','Programming languages','Python']]},
 {id:'F2',known:true,paths:[['Technology','Software','File managers','Dolphin']]},
 {id:'F3',known:true,paths:[['Nature','Animals','Mammals','Koalas']]},
 {id:'F4',known:true,paths:[['Games','Video games','Grand Theft Auto','Grand Theft Auto VI']]},
 {id:'F5',known:true,paths:[['Games','Video games','Grand Theft Auto','Grand Theft Auto V']]},
 {id:'F6',known:true,paths:[['Food','Dishes','Fast food','Kapsalon']]},
 {id:'F7',known:false,paths:[['Nature','Animals']]},
 {id:'F8',known:false,paths:[['Technology','Software']]},
 {id:'F9',known:false,paths:[['Technology','Software'],['Games','Video games']]},
].map(row=>Object.freeze({...row,paths:Object.freeze(row.paths.map(Object.freeze))})));
export function scoreFreshCachedTopicTransfer(rows){
 if(!Array.isArray(rows)||rows.length!==CACHED_TOPIC_FRESH_GOLD.length||new Set(rows.map(row=>row.id)).size!==rows.length)throw new TypeError('Invalid fresh topic results');
 const gold=new Map(CACHED_TOPIC_FRESH_GOLD.map(row=>[row.id,row])),counts={knownExact:0,knownBroader:0,knownUnresolved:0,unknownValidAncestor:0,unknownUnresolved:0,wrong:0};
 const details=rows.map(row=>{const target=gold.get(row.id),labels=row.lookup?.labels;if(!target||!Array.isArray(labels)||!labels.every(label=>typeof label==='string'))throw new TypeError('Invalid fresh selection');
  const valid=target.paths.some(path=>labels.length<=path.length&&labels.every((label,i)=>label===path[i]));let outcome;
  if(!labels.length)outcome=target.known?'knownUnresolved':'unknownUnresolved';else if(!valid)outcome='wrong';
  else if(!target.known)outcome='unknownValidAncestor';else outcome=target.paths.some(path=>path.length===labels.length)?'knownExact':'knownBroader';
  counts[outcome]++;return{id:row.id,outcome,expected:target.paths,actual:labels};});
 return{total:rows.length,...counts,details};
}
