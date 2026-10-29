export function summarizeChildMatchRows(rows){
 const scored=rows.filter(r=>r.status==='scored'),metrics={};
 for(const node of ['video-games','animals','koalas']){
  const parent=node==='video-games'?'games':'nature',inside=r=>node==='koalas'?r.labels.animals===true:r.expectedRootId===parent;
  metrics[node]={knownPositive:scored.filter(r=>r.labels[node]===true).length,knownNegative:scored.filter(r=>r.labels[node]===false).length,
   insideParentNegative:scored.filter(r=>r.labels[node]===false&&inside(r)).length,
   rootGatePositive:scored.filter(r=>r.labels[node]===true&&r.rootPath.includes(parent)).length,
   rootGateNegative:scored.filter(r=>r.labels[node]===false&&inside(r)&&r.rootPath.includes(parent)).length,
   acceptedPositive:scored.filter(r=>r.labels[node]===true&&r.after.includes(node)).length,
   acceptedNegative:scored.filter(r=>r.labels[node]===false&&r.after.includes(node)).length};
 }
 return {declared:rows.length,scored:scored.length,unavailable:rows.filter(r=>r.status==='unavailable').length,
  rootCorrect:scored.filter(r=>r.rootPath.length===1&&r.rootPath[0]===r.expectedRootId).length,
  rootAbstained:scored.filter(r=>r.rootPath.length===0).length,metrics};
}
