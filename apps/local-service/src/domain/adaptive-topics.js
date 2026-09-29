export const ADAPTIVE_TOPIC_POLICY = Object.freeze({ version: 'adaptive-supported-partitions/v1',
  floor: 0.90, tight: 0.94, competingMargin: 0.04, duplicateSimilarity: 0.995, minimumSupport: 2 });
const LEARNED = 'owner-local-page-embedding/v1';
const MODEL = 'e5-small-q8-browser-main-prefix-v1';
// Exact current input transform space; an unrelated future extractor must not
// become comparable just because another validation allowlist grows.
const EXTRACTORS = new Set(['main-text-prefix/v1','article-container-prefix/v1']);
const EPSILON = 1e-12;
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const validId = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/u.test(value);
const key = part => part.sourceIds.join('\0');
const invalid = () => { throw new TypeError('Invalid adaptive Topic planner input'); };
const dot = (a,b) => Math.max(-1,Math.min(1,a.reduce((sum,value,i)=>sum+value*b[i],0)));

// No IDs, writes, clocks, inference or semantic claims. Caller owns transactional
// Topic reuse and must preserve Topic-root/manual/legacy containers independently.
// retainTight is one bounded sticky signal: persist it with the caller's Topic
// partition metadata to prevent support removal immediately undoing a split.
export function planAdaptiveTopics({ sources, sourceLinks, previousPartitions = [] }) {
  if (!Array.isArray(sources) || sources.length > 100 || !Array.isArray(sourceLinks) || sourceLinks.length > 100 ||
      !Array.isArray(previousPartitions) || previousPartitions.length > 100) invalid();
  const allIds = new Set();
  for (const source of sources) {
    if (!source || !validId(source.id) || allIds.has(source.id)) invalid();
    allIds.add(source.id);
  }
  const eligible = sources.filter(source=>source.provenance===LEARNED).sort((a,b)=>compare(a.id,b.id));
  for (const source of eligible) {
    const vector=source.embedding?.values;
    if (source.embedding?.modelId!==MODEL || !EXTRACTORS.has(source.extractorVersion) ||
        typeof source.url!=='string' || source.url.length>2048 || !Array.isArray(vector) || vector.length!==384 ||
        vector.some(value=>typeof value!=='number' || !Number.isFinite(value)) ||
        Math.abs(Math.hypot(...vector)-1)>1e-6) invalid();
  }
  const byId=new Map(eligible.map(source=>[source.id,source]));
  const links=new Map();
  for (const link of sourceLinks) {
    if (!link || !validId(link.sourceId) || !validId(link.topicId) || links.has(link.sourceId) || !allIds.has(link.sourceId)) invalid();
    links.set(link.sourceId,link);
    if (byId.has(link.sourceId) && !['learned-provisional','manual-confirmed'].includes(link.method)) invalid();
  }
  const retained=new Set();
  const priorIds=new Set();
  for (const part of previousPartitions) {
    if (!part || !Array.isArray(part.sourceIds) || part.sourceIds.length>100 ||
        typeof part.retainTight!=='boolean' || !(part.pinnedTopicId===null || validId(part.pinnedTopicId))) invalid();
    for (const id of part.sourceIds) {
      if (!validId(id) || priorIds.has(id)) invalid();
      priorIds.add(id);
      if (part.retainTight && byId.has(id)) retained.add(id);
    }
  }
  const similarities=new Map();
  function similarity(a,b) {
    if(a===b)return 1;
    const pair=compare(a,b)<0 ? `${a}\0${b}` : `${b}\0${a}`;
    if(!similarities.has(pair)) similarities.set(pair,dot(byId.get(a).embedding.values,byId.get(b).embedding.values));
    return similarities.get(pair);
  }
  const minimum=(a,b)=>Math.min(...a.flatMap(id=>b.map(other=>similarity(id,other))));
  const maximum=(a,b)=>Math.max(...a.flatMap(id=>b.map(other=>similarity(id,other))));
  const cohesion=ids=>ids.length<2 ? 1 : Math.min(...ids.flatMap((id,i)=>ids.slice(i+1).map(other=>similarity(id,other))));
  function support(ids) {
    const representatives=[];
    for(const id of [...ids].sort(compare)) if(!representatives.some(other=>byId.get(id).url===byId.get(other).url ||
        similarity(id,other)+EPSILON>=ADAPTIVE_TOPIC_POLICY.duplicateSimilarity)) representatives.push(id);
    return representatives.length;
  }
  // Intrinsic complete-link neighborhood structure, independent of existing
  // Topic count/partition labels. Lexical IDs break numeric ties deterministically.
  const intrinsic=eligible.map(source=>({sourceIds:[source.id]}));
  for (;;) {
    const candidates=[];
    for(let i=0;i<intrinsic.length;i++)for(let j=i+1;j<intrinsic.length;j++) {
      const score=minimum(intrinsic[i].sourceIds,intrinsic[j].sourceIds);
      if(score+EPSILON>=ADAPTIVE_TOPIC_POLICY.tight)candidates.push({i,j,score,key:key(intrinsic[i])+'\0'+key(intrinsic[j])});
    }
    candidates.sort((a,b)=>b.score-a.score || compare(a.key,b.key));
    if(!candidates.length)break;
    const {i,j}=candidates[0];
    intrinsic[i]={sourceIds:[...intrinsic[i].sourceIds,...intrinsic[j].sourceIds].sort(compare)};
    intrinsic.splice(j,1); intrinsic.sort((a,b)=>compare(key(a),key(b)));
  }
  const supported=intrinsic.filter(part=>support(part.sourceIds)>=ADAPTIVE_TOPIC_POLICY.minimumSupport);
  const boundaries=[];
  const markedBlocks=new Map();
  for(let i=0;i<supported.length;i++)for(let j=i+1;j<supported.length;j++) {
    const a=supported[i].sourceIds,b=supported[j].sourceIds;
    if(Math.min(cohesion(a),cohesion(b))-maximum(a,b)+EPSILON>=ADAPTIVE_TOPIC_POLICY.competingMargin) {
      boundaries.push([new Set(a),new Set(b)]);
      for(const id of a)markedBlocks.set(id,key(supported[i]));
      for(const id of b)markedBlocks.set(id,key(supported[j]));
    }
  }
  const crossesBoundary=ids=>boundaries.some(([a,b])=>ids.some(id=>a.has(id)) && ids.some(id=>b.has(id)));
  const decisions=[];
  const initial=new Map();
  for(const source of eligible) {
    const group=links.has(source.id)?`topic:${links.get(source.id).topicId}`:`new:${source.id}`;
    if(!initial.has(group))initial.set(group,[]);
    initial.get(group).push(source.id);
  }
  const partitions=[];
  function append(ids,tight=false) {
    const pins=[...new Set(ids.filter(id=>links.get(id)?.method==='manual-confirmed').map(id=>links.get(id).topicId))];
    if(pins.length>1)invalid();
    partitions.push({sourceIds:[...ids].sort(compare),pinnedTopicId:pins[0]??null,
      retainTight:tight || ids.some(id=>retained.has(id))});
  }
  function floorComponents(ids) {
    if(cohesion(ids)+EPSILON>=ADAPTIVE_TOPIC_POLICY.floor)return [ids];
    const pinned=ids.filter(id=>links.get(id)?.method==='manual-confirmed');
    const components=[...(pinned.length ? [pinned] : []),
      ...ids.filter(id=>!pinned.includes(id)).map(id=>[id])];
    for (;;) {
      const candidates=[];
      for(let i=0;i<components.length;i++)for(let j=i+1;j<components.length;j++) {
        // Multiple manual pins may be intentionally incoherent. Preserve them,
        // but never use that incoherent pinned set to absorb provisional members.
        if(cohesion(components[i])+EPSILON<ADAPTIVE_TOPIC_POLICY.floor ||
            cohesion(components[j])+EPSILON<ADAPTIVE_TOPIC_POLICY.floor)continue;
        const score=minimum(components[i],components[j]);
        if(score+EPSILON>=ADAPTIVE_TOPIC_POLICY.floor)candidates.push({i,j,score,key:components[i].join('\0')+'\0'+components[j].join('\0')});
      }
      candidates.sort((a,b)=>b.score-a.score || compare(a.key,b.key));
      if(!candidates.length)break;
      const {i,j}=candidates[0];
      components[i]=[...components[i],...components[j]].sort(compare);
      components.splice(j,1); components.sort((a,b)=>compare(a.join('\0'),b.join('\0')));
    }
    return components;
  }
  for(const original of initial.values()) for(const ids of floorComponents(original)) {
    if(!crossesBoundary(ids)) { append(ids); continue; }
    const pinned=ids.filter(id=>links.get(id)?.method==='manual-confirmed');
    if(crossesBoundary(pinned)) {
      append(ids); decisions.push({reason:'manual-pin-preserved',sourceIds:[...ids]}); continue;
    }
    const blocks=new Map();
    for(const id of ids) {
      const block=markedBlocks.get(id)??'unsupported';
      if(!blocks.has(block))blocks.set(block,[]);
      blocks.get(block).push(id);
    }
    for(const block of blocks.values())append(block,true);
    decisions.push({reason:'supported-tight-split',sourceIds:[...ids]});
  }
  for(const original of initial.values()) if(cohesion(original)+EPSILON<ADAPTIVE_TOPIC_POLICY.floor &&
      !original.every(id=>links.get(id)?.method==='manual-confirmed')) {
    decisions.push({reason:'incompatible-representation-split',sourceIds:[...original]});
  }
  partitions.sort((a,b)=>compare(key(a),key(b)));
  for (;;) {
    const candidates=[];
    for(let i=0;i<partitions.length;i++)for(let j=i+1;j<partitions.length;j++) {
      const a=partitions[i],b=partitions[j],ids=[...a.sourceIds,...b.sourceIds];
      // A manually anchored Topic is owner-selected, not an automatic expansion
      // target, even when the other partition has a high-scoring vector.
      if(a.pinnedTopicId!==null || b.pinnedTopicId!==null)continue;
      if(crossesBoundary(ids))continue;
      const score=minimum(a.sourceIds,b.sourceIds);
      const threshold=a.retainTight || b.retainTight ? ADAPTIVE_TOPIC_POLICY.tight : ADAPTIVE_TOPIC_POLICY.floor;
      if(cohesion(a.sourceIds)+EPSILON<threshold || cohesion(b.sourceIds)+EPSILON<threshold)continue;
      if(score+EPSILON<threshold)continue;
      const outside=eligible.map(source=>source.id).filter(id=>!ids.includes(id));
      if(outside.length && score-maximum(ids,outside)+EPSILON<ADAPTIVE_TOPIC_POLICY.competingMargin)continue;
      candidates.push({i,j,score,key:key(a)+'\0'+key(b)});
    }
    candidates.sort((a,b)=>b.score-a.score || compare(a.key,b.key));
    if(!candidates.length)break;
    const {i,j}=candidates[0],a=partitions[i],b=partitions[j];
    partitions[i]={sourceIds:[...a.sourceIds,...b.sourceIds].sort(compare),
      pinnedTopicId:a.pinnedTopicId??b.pinnedTopicId,retainTight:a.retainTight || b.retainTight};
    partitions.splice(j,1); partitions.sort((a,b)=>compare(key(a),key(b)));
  }
  return {policyVersion:ADAPTIVE_TOPIC_POLICY.version,partitions,decisions};
}
