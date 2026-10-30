// Only used AFTER prediction. A publisher's Nature name is not the nature root.
export const CAPTURED_TOPIC_GOLD=Object.freeze([
 {id:'R1',known:true,paths:[['Technology','Software','Programming languages','Python']],roots:['technology']},
 {id:'R2',known:true,paths:[['Technology','Software','File managers','Dolphin']],roots:['technology']},
 {id:'R3',known:true,paths:[['Nature','Animals','Mammals','Koalas']],roots:['nature']},
 {id:'R4',known:true,paths:[['Food','Dishes','Fast food','Kapsalon']],roots:['cooking']},
 {id:'R5',known:true,paths:[['Games','Video games','Grand Theft Auto','Grand Theft Auto V']],roots:['games']},
 {id:'R6',known:false,paths:[['Technology','Software']],roots:['technology']},
 {id:'R7',known:false,paths:[],roots:['science']},
 {id:'R8',known:false,paths:[['Technology','Software'],['Games','Video games']],roots:['technology','games']},
].map(Object.freeze));
export function scoreCapturedTopicValidation(rows){
 if(!Array.isArray(rows)||rows.length!==8||new Set(rows.map(row=>row.id)).size!==8)throw new TypeError('Invalid captured validation');
 const counts={total:8,captureUnavailable:0,knownExact:0,knownBroader:0,knownUnresolved:0,unknownValidAncestor:0,unknownUnresolved:0,wrong:0,rootCorrect:0,rootUnresolved:0,rootWrong:0};
 const details=rows.map(row=>{const gold=CAPTURED_TOPIC_GOLD.find(g=>g.id===row.id);if(!gold)throw new TypeError('Unknown captured row');
  if(row.status!=='matched'){counts.captureUnavailable++;return{id:row.id,outcome:'captureUnavailable',failure:row.failure};}
  const labels=row.lookup.labels,valid=gold.paths.some(path=>labels.length<=path.length&&labels.every((label,i)=>label===path[i]));let outcome;
  if(!labels.length)outcome=gold.known?'knownUnresolved':'unknownUnresolved';else if(!valid)outcome='wrong';
  else if(!gold.known)outcome='unknownValidAncestor';else outcome=gold.paths.some(path=>labels.length===path.length)?'knownExact':'knownBroader';
  counts[outcome]++;const selected=row.rooted.rootPath;const rootOutcome=!selected.length?'rootUnresolved':gold.roots.includes(selected[0])?'rootCorrect':'rootWrong';counts[rootOutcome]++;
  return{id:row.id,outcome,actual:labels,rootOutcome,actualRoot:selected,expected:gold.paths};
 });return{...counts,details};
}
