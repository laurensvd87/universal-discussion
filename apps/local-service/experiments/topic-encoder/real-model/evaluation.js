// Label-aware offline evaluation. Labels choose thresholds on validation only;
// inference still maps each page independently to one vector.
function cosine(a,b) {
  if (!a || !b || a.length!==b.length) throw new TypeError('Invalid vectors');
  let value=0;
  for (let k=0;k<a.length;k++) value+=a[k]*b[k];
  return value;
}

function rows(documents,vectors) {
  if (!Array.isArray(documents)||documents.length<4||!(vectors instanceof Map))
    throw new TypeError('Invalid evaluation set');
  const seen=new Set(),pairs=[];
  for (const doc of documents) {
    if (typeof doc?.id!=='string'||!doc.id||seen.has(doc.id)||
      typeof doc.topicLabel!=='string'||typeof doc.family!=='string'||!vectors.has(doc.id))
      throw new TypeError('Invalid evaluation record');
    seen.add(doc.id);
  }
  for (let i=0;i<documents.length;i++) for (let j=i+1;j<documents.length;j++) {
    const score=cosine(vectors.get(documents[i].id),vectors.get(documents[j].id));
    if (!Number.isFinite(score)) throw new TypeError('Non-finite pair score');
    pairs.push({i,j,score,positive:documents[i].topicLabel===documents[j].topicLabel,
      hard:documents[i].family===documents[j].family});
  }
  return pairs;
}

export function strictValidationThreshold(documents,vectors) {
  const pairs=rows(documents,vectors);
  const negative=pairs.filter(row=>!row.positive);
  if (!negative.length||!pairs.some(row=>row.positive))
    throw new TypeError('Validation needs positive and negative pairs');
  const maxNegative=Math.max(...negative.map(row=>row.score));
  return {threshold:maxNegative+1e-6,maximumNegative:maxNegative,
    validationPositivePairs:pairs.filter(row=>row.positive).length,
    validationAccepted:pairs.filter(row=>row.positive&&row.score>=maxNegative+1e-6).length};
}

export function evaluateLabeled(documents,vectors,threshold) {
  if (!Number.isFinite(threshold)) throw new TypeError('Invalid threshold');
  const pairs=rows(documents,vectors);
  const positives=pairs.filter(row=>row.positive),
    negatives=pairs.filter(row=>!row.positive),
    hard=negatives.filter(row=>row.hard);
  if (!positives.length||!hard.length) throw new TypeError('Need positive and same-family negative pairs');
  const scoreMap=new Map(pairs.map(row=>[`${row.i}:${row.j}`,row.score]));
  const scoreAt=(i,j)=>scoreMap.get(`${Math.min(i,j)}:${Math.max(i,j)}`);
  let matchedQueries=0,top1=0,top3=0,singletons=0,singletonAbstentions=0;
  let crossViewQueries=0,crossViewTop1=0;
  for (let i=0;i<documents.length;i++) {
    const ranked=documents.map((doc,j)=>({doc,j,score:i===j?-Infinity:scoreAt(i,j)}))
      .filter(row=>row.j!==i)
      .sort((a,b)=>b.score-a.score||a.doc.id.localeCompare(b.doc.id));
    const bestPositive=ranked.findIndex(row=>row.doc.topicLabel===documents[i].topicLabel);
    const otherView=ranked.findIndex(row=>row.doc.topicLabel===documents[i].topicLabel&&
      row.doc.viewpoint!==documents[i].viewpoint);
    if(otherView!==-1){crossViewQueries++;crossViewTop1+=Number(otherView===0);}
    if (bestPositive===-1) {
      singletons++;
      singletonAbstentions+=Number(ranked[0].score<threshold);
    } else {
      matchedQueries++;
      top1+=Number(bestPositive===0);
      top3+=Number(bestPositive<3);
    }
  }
  let hardWins=0;
  for (const positive of positives) for (const negative of hard)
    hardWins+=Number(positive.score>negative.score)+0.5*Number(positive.score===negative.score);
  return {documents:documents.length,matchedQueries,top1,top3,
    crossViewQueries,crossViewTop1,
    sameTopicPairs:positives.length,hardNegativePairs:hard.length,
    hardPairAuc:hardWins/(positives.length*hard.length),
    strictThreshold:threshold,truePairsAccepted:positives.filter(row=>row.score>=threshold).length,
    crossViewTruePairsAccepted:positives.filter(row=>row.score>=threshold&&
      documents[row.i].viewpoint!==documents[row.j].viewpoint).length,
    crossViewSameTopicPairs:positives.filter(row=>
      documents[row.i].viewpoint!==documents[row.j].viewpoint).length,
    falsePairsAccepted:negatives.filter(row=>row.score>=threshold).length,
    hardFalsePairs:hard.filter(row=>row.score>=threshold).length,
    singletonQueries:singletons,singletonAbstentions};
}
