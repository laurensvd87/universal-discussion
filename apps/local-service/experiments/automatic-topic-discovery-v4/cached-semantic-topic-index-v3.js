// Experimental cache builder and local linker. Inputs are proposed semantics,
// not canonical authority. No IO, provider, encoder or Source lookup here.
import {createHash} from 'node:crypto';
import {readSubjectKindsForBank} from './semantic-subject-kinds.js';
const need = value => { if (!value) throw new TypeError('Invalid cached semantic topic index'); };
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const exact = (value,keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const norm = value => value.normalize('NFKC').toLowerCase();
const words = value => [...norm(value).matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:\+\+|#)?/gu)].map(match=>match[0]);
const articles = new Set('a an the der die das ein eine le la les el los las un une het een'.split(' '));
const template = new Set('welcome official how learn guide introduction introducing'.split(' '));
function text(value,maximum,empty=false) {
  need(typeof value === 'string' && value.length <= maximum && (empty || value.trim().length > 0) &&
    value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)); return value;
}
function vector(value) {
  need(Array.isArray(value) && value.length === 384); let norm = 0;
  for (const x of value) { need(Number.isFinite(x) && Math.abs(x) <= 1); norm += x*x; }
  need(Math.abs(norm-1) < 1e-5); return [...value];
}
function freeze(value) { if(value && typeof value === 'object') { for(const v of Object.values(value))freeze(v);Object.freeze(value); }return value; }
function singular(value) {
  if (value.length < 5 || value.endsWith('ss')) return value;
  if (value.endsWith('ies')) return value.slice(0,-3)+'y';
  if (/(?:sses|xes|zes|ches|shes)$/u.test(value)) return value.slice(0,-2);
  return value.endsWith('s') ? value.slice(0,-1) : value;
}
const key = tokens => tokens.map(singular).join('\u001f');
function common(paths) {
  let result = [...(paths[0] ?? [])];
  for (const path of paths.slice(1)) { let n=0; while(n<result.length && result[n]===path[n])n++;result=result.slice(0,n); }
  return result;
}

export function buildCachedSemanticTopicBank(rawJson) {
  need(arguments.length===1 && typeof rawJson==='string' && rawJson.length<=1048576);
  const input=JSON.parse(rawJson);need(exact(input,['teacherHash','cards','nodes','selections']) && /^[a-f0-9]{64}$/u.test(input.teacherHash));
  need(Array.isArray(input.cards) && input.cards.length>0 && input.cards.length<=64 && Array.isArray(input.nodes) &&
    input.nodes.length>0 && input.nodes.length<=512 && Array.isArray(input.selections) && input.selections.length===input.cards.length);
  const cards=new Map(),nodes=new Map(),paths=new Map(),selected=new Map();
  for(const card of input.cards) {
    need(exact(card,['id','title','excerpt','url']) && /^[A-Za-z][A-Za-z0-9_-]{0,47}$/u.test(card.id) && !cards.has(card.id));
    text(card.title,200);text(card.excerpt,512,true);text(card.url,2048);
    const url=new URL(card.url);need(url.protocol==='https:' && !url.username && !url.password);cards.set(card.id,card);
  }
  for(const node of input.nodes) {
    need(exact(node,['key','label','parentKey']) && /^[a-f0-9]{64}$/u.test(node.key) && !nodes.has(node.key));
    text(node.label,64);need(node.parentKey===null || /^[a-f0-9]{64}$/u.test(node.parentKey));nodes.set(node.key,node);
  }
  function pathFor(id,seen=[]) {
    need(nodes.has(id) && !seen.includes(id) && seen.length<8);if(paths.has(id))return paths.get(id);
    const node=nodes.get(id),path=[...(node.parentKey===null ? [] : pathFor(node.parentKey,[...seen,id])),id];paths.set(id,path);return path;
  }
  for(const id of nodes.keys())pathFor(id);
  const assigned=new Set();
  for(const selection of input.selections) {
    need(exact(selection,['id','leafKey']) && cards.has(selection.id) && !assigned.has(selection.id) &&
      (selection.leafKey===null || nodes.has(selection.leafKey)));assigned.add(selection.id);
    if(selection.leafKey!==null) { if(!selected.has(selection.leafKey))selected.set(selection.leafKey,[]);selected.get(selection.leafKey).push(selection.id); }
  }
  const compiled=[];
  for(const [id,node]of nodes) {
    const path=paths.get(id),labels=path.map(id=>nodes.get(id).label),subject=selected.has(id),aliases=new Map();
    const add=(label,basis,cardId=null)=>{const tokens=words(label);if(tokens.length && tokens.length<=8 && !aliases.has(key(tokens)))aliases.set(key(tokens),{label,tokens,basis,cardId});};
    add(node.label,'proposed-label');
    for(const cardId of selected.get(id)??[]) {
      const card=cards.get(cardId),titleWords=words(card.title),labelWords=words(node.label);
      for(let at=0;at+labelWords.length<=titleWords.length;at++)if(key(titleWords.slice(at,at+labelWords.length))===key(labelWords)) {
        if(at>0 && at+labelWords.length<=5 && !template.has(titleWords[0]))
          add(titleWords.slice(0,at+labelWords.length).join(' '),'assigned-title-prefix',cardId);
      }
    }
    // Initialisms are only search candidates when an assigned descendant's
    // public URL actually contains that spelling; never synthesize translations.
    if(words(node.label).length>=2) {
      const tokens=words(node.label),suffix=/^(?:[0-9]+|[ivx]+)$/u.test(tokens.at(-1))?tokens.at(-1):null;
      const base=suffix?tokens.slice(0,-1):tokens,initials=base.map(word=>word[0]).join('');
      if(base.length>=2 && base.length<=6)for(const selection of input.selections)if(selection.leafKey && paths.get(selection.leafKey).includes(id)) {
        const card=cards.get(selection.id),slug=words(decodeURIComponent(new URL(card.url).pathname));
        if(slug.includes(initials) && (!suffix || slug.includes(suffix)))add(initials+(suffix?' '+suffix:''),'assigned-url-initialism',card.id);
      }
    }
    const examples=(selected.get(id)??[]).slice(0,2).map(cardId=>cards.get(cardId)).map(card=>[card.title,card.excerpt].filter(Boolean).join('. '));
    // Structural categories deliberately do not become definitions of only
    // their currently observed children (e.g. Animals is broader than Mammals).
    const descriptor=[node.label,...(path.length>1?['Context: '+labels.slice(0,-1).join(' > ')]:[]),...(subject?examples:[])].filter(Boolean).join('. ');
    need(descriptor.length<=2048 && aliases.size<=16);
    compiled.push({id,label:node.label,parentId:node.parentKey,path,rootId:path[0],kind:subject?'subject':'category',
      descriptor,aliases:[...aliases.values()],trainingCards:selected.get(id)??[]});
  }
  return freeze({schema:'cached-semantic-topic-bank/v1',teacherHash:input.teacherHash,bankHash:sha(compiled),nodes:compiled,
    scope:{proposalOnly:true,canonicalIdsAssigned:false,aliasIdentityProven:false,publication:false,liveChanged:false}});
}

export function compileCachedSemanticTopicIndex(bank,encoded,kindProposal) {
  need(arguments.length===3 && bank?.schema==='cached-semantic-topic-bank/v1' && bank.bankHash===sha(bank.nodes) &&
    Array.isArray(encoded) && encoded.length===bank.nodes.length);
  const subjectKinds=readSubjectKindsForBank(bank,kindProposal);
  const subjectKindsHash=sha([...subjectKinds]),indexHash=sha({revision:'cached-semantic-topic-index-v3/class-aware-v1',bankHash:bank.bankHash,subjectKindsHash});
  const byId=new Map(bank.nodes.map(node=>[node.id,node])),vectors=new Map(),aliases=new Map();
  for(const row of encoded) { need(exact(row,['id','values']) && byId.has(row.id) && !vectors.has(row.id));vectors.set(row.id,vector(row.values)); }
  for(const node of bank.nodes)for(const alias of node.aliases) {
    const k=key(alias.tokens);if(!aliases.has(k))aliases.set(k,[]);aliases.get(k).push({id:node.id,words:alias.tokens.length});
  }
  const dot=(a,b)=>{let sum=0;for(let i=0;i<384;i++)sum+=a[i]*b[i];return Math.max(-1,Math.min(1,sum));};
  return Object.freeze({describe:()=>({bankHash:bank.bankHash,indexHash,subjectKindsHash,nodes:bank.nodes.length,aliasKeys:aliases.size,providerOnLookup:false}),
    lookup(input) {
      need(exact(input,['title','body','titleVector','bodyVector','ownerGrouping']));text(input.title,512);text(input.body,4096,true);
      const titleVector=vector(input.titleVector),bodyVector=vector(input.bodyVector),owner=input.ownerGrouping;
      need(exact(owner,['defaultMaxDepth','overrides']) && Number.isInteger(owner.defaultMaxDepth) && owner.defaultMaxDepth>=1 && owner.defaultMaxDepth<=8 && Array.isArray(owner.overrides) && owner.overrides.length<=512);
      const rules=new Map();for(const rule of owner.overrides) { need(exact(rule,['nodeId','maxDepth']) && byId.has(rule.nodeId) && !rules.has(rule.nodeId) &&
        Number.isInteger(rule.maxDepth) && rule.maxDepth>=byId.get(rule.nodeId).path.length && rule.maxDepth<=8);rules.set(rule.nodeId,rule.maxDepth); }
      const scores=new Map(bank.nodes.map(node=>{const v=vectors.get(node.id),body=dot(bodyVector,v);return[node.id,{body,paired:.5*(body+dot(titleVector,v))}];}));
      const matched=new Map(),sequences=[{tokens:words(input.title),body:false},{tokens:words(input.body.split(/[.!?]/u)[0].slice(0,300)),body:true}];
      for(const sequence of sequences)for(let at=0;at<Math.min(sequence.tokens.length,64);at++)for(let n=1;n<=8 && at+n<=sequence.tokens.length;n++) {
        const matches=aliases.get(key(sequence.tokens.slice(at,at+n)))??[];
        for(const match of matches) {
          const node=byId.get(match.id),focal=sequence.tokens.slice(0,at).every(token=>articles.has(token));
          // Class membership can survive a title qualifier. Proper named
          // identity and nonfocal body mentions retain the original restriction.
          const classInTitle=!sequence.body && subjectKinds.get(node.id)==='common-class';
          if(node.kind==='subject' && n===1 && !focal && !classInTitle)continue;
          const score=scores.get(node.id),subject=node.kind==='subject';
          if(score.paired<.8 || (!subject && input.body.length>=32 && score.body<.8))continue;
          if(subject && input.body.length<32 && n===1)continue;
          // Explicit subject names use both title and body for discrimination.
          // A generic/short paragraph need not identify the named version again.
          // Broad category names retain the stricter body-only contextual gate.
          let other=-1,contradictoryCategory=-1;
          for(const candidate of bank.nodes)if(candidate.rootId!==node.rootId){
            const competitor=scores.get(candidate.id);
            other=Math.max(other,subject?competitor.paired:competitor.body);
            if(candidate.kind==='category')contradictoryCategory=Math.max(contradictoryCategory,competitor.body);
          }
          if((subject?score.paired:score.body)-other<.015)continue;
          if(subject && input.body.length>=32 && score.body+.015<contradictoryCategory)continue;
          matched.set(node.id,node);
        }
      }
      // An explicit name does not resolve two meanings inside the same broad
      // root. Require category evidence or a positive margin over peer types.
      for(const node of [...matched.values()])if(node.kind==='subject') {
        for(let depth=1;depth<node.path.length;depth++) {
          const child=byId.get(node.path[depth]),parentId=node.path[depth-1];
          if(child.kind!=='category' || matched.has(child.id))continue;
          const peers=bank.nodes.filter(other=>other.parentId===parentId && other.kind==='category' && other.id!==child.id);
          if(peers.some(peer=>scores.get(child.id).body-scores.get(peer.id).body<.015)) { matched.delete(node.id);break; }
        }
      }
      const subjects=[...matched.values()].filter(node=>node.kind==='subject'),candidates=subjects.length?subjects:[...matched.values()];
      const leaves=candidates.filter(node=>!candidates.some(other=>other.id!==node.id && other.path.includes(node.id)));
      let supportedPath=common(leaves.map(node=>node.path)),reason=subjects.length?'named-subject':'named-category';
      if(!leaves.length) {
        const roots=bank.nodes.filter(node=>node.parentId===null).sort((a,b)=>scores.get(b.id).body-scores.get(a.id).body);
        const first=roots[0],second=roots[1];
        if(first && scores.get(first.id).body>=.8 && (!second || scores.get(first.id).body-scores.get(second.id).body>=.015))
          supportedPath=[first.id];reason='coarse-context-only';
      }
      if(leaves.length && !supportedPath.length)reason='conflicting-contexts';
      let depth=owner.defaultMaxDepth;for(const id of supportedPath)if(rules.has(id))depth=rules.get(id);
      const selectedPath=supportedPath.slice(0,depth);
      return {schema:'cached-semantic-topic-lookup/v1',bankHash:bank.bankHash,indexHash,subjectKindsHash,groupingHash:sha(owner),supportedPath,selectedPath,
        labels:selectedPath.map(id=>byId.get(id).label),reason:selectedPath.length<supportedPath.length?'owner-depth-cut':reason,
        aliasMatches:matched.size,coordinateProducts:bank.nodes.length*384*2,
        scope:{experimental:true,confidenceCalibrated:false,queryFreshnessVerified:false,assignmentAuthority:false,providerUsed:false,liveChanged:false}};
    }});
}
