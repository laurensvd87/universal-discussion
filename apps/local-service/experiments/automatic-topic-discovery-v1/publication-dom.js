// Serializable isolated-world experiment. Caller still owns public-page consent,
// native document/account fences and final Source-input binding. No new grant.
// Bounded raw claims are ephemeral bridge data: normalize before any persistence.
export function collectArticlePublicationClaims(expectedDocumentUrl){
 const schema='article-publication-claims-capture/v1',errors=new WeakMap(),started=performance.now();
 const stop=reason=>{const error=new Error('Publication metadata unavailable');errors.set(error,reason);throw error;};
 const check=()=>{if(performance.now()-started>20)stop('time-budget');};
 const attr=(node,key)=>{check();const v=node.getAttribute(key);if(v!==null&&(typeof v!=='string'||v.length>1024))stop('attribute-bound');return v??'';};
 const claims=[],bound=[],unbound=[];let visited=0,jsonCharacters=0,articleObjects=0;
 const add=(target,kind,value)=>{check();if(typeof value!=='string'||value.length>80)stop('claim-value-bound');if(target.length>=16||claims.length+bound.length+unbound.length>=16)stop('claim-count');target.push({kind,value});};
 let documentUrl=null;
 try{
  if(typeof expectedDocumentUrl!=='string'||!expectedDocumentUrl||expectedDocumentUrl.length>2048)stop('document-mismatch');
  const expected=new URL(expectedDocumentUrl),here=new URL(location.href),declared=new URL(document.URL);here.hash='';declared.hash='';
  if(expected.protocol!=='https:'||expected.username||expected.password||expected.hash||expected.href!==expectedDocumentUrl||here.href!==expected.href||declared.href!==expected.href)stop('document-mismatch');
  documentUrl=expected.href;
  const nodes=document.querySelectorAll('meta[property],meta[name],[itemprop~="datePublished"],script[type]');
  if(nodes.length>256)stop('node-bound');check();
  let primaryArticle,articleSelected=false;
  function selectPrimaryArticle(){
   if(articleSelected)return primaryArticle;articleSelected=true;
   const root=document.querySelector('main,[role="main"]')??document.body;if(!root)return null;
   const articles=root.tagName==='ARTICLE'?[root]:root.querySelectorAll('article');if(articles.length>64)stop('article-bound');
   for(let i=0;i<articles.length;i++){check();const a=articles[i];if(!a.closest('header,footer,aside,nav,template,[role="complementary"],[role="navigation"]')){primaryArticle=a;break;}}
   return primaryArticle??null;
  }
  function currentArticle(node){
   for(const key of ['url','mainEntityOfPage','@id']){
    if(!Object.hasOwn(node,key))continue;let value=node[key];
    if(value&&typeof value==='object'&&!Array.isArray(value))value=value['@id'];
    if(key==='@id'&&typeof value==='string'&&value.startsWith('_:'))continue;
    if(typeof value!=='string'||value.length>2048)return false;
    let u;try{u=new URL(value,documentUrl);}catch{return false;}u.hash='';
    if(u.username||u.password||u.href!==documentUrl)return false;
   }return true;
  }
  function visitJson(raw){
   let value;try{value=JSON.parse(raw);}catch{stop('json-invalid');}
   const stack=[{value,depth:0}];
   while(stack.length){check();const {value:v,depth}=stack.pop();if(++visited>128||depth>8)stop('json-work-bound');
    if(!v||typeof v!=='object')continue;
    if(Array.isArray(v)){if(v.length>128)stop('json-work-bound');for(let i=v.length-1;i>=0;i--)stack.push({value:v[i],depth:depth+1});continue;}
    const type=v['@type'],types=typeof type==='string'?[type]:Array.isArray(type)&&type.length<=8?type:[];
    if(types.some(t=>['Article','NewsArticle','BlogPosting','ReportageNewsArticle'].includes(t))&&Object.hasOwn(v,'datePublished')&&currentArticle(v)){
     articleObjects++;const scoped=['url','mainEntityOfPage','@id'].some(k=>Object.hasOwn(v,k)&&!(k==='@id'&&typeof v[k]==='string'&&v[k].startsWith('_:')));
     add(scoped?bound:unbound,'jsonld-datepublished',v.datePublished);
    }
    // Only schema containers that may describe the current article are walked.
    // Author/comments/related-item graphs are not generic recursive extraction.
    for(const key of ['@graph','mainEntity'])if(Object.hasOwn(v,key))stack.push({value:v[key],depth:depth+1});
   }
  }
  for(let i=0;i<nodes.length;i++){
   check();const node=nodes[i],tag=node.tagName;
   if(tag==='META'&&document.head?.contains(node)){
    const property=attr(node,'property').trim().toLowerCase(),name=attr(node,'name').trim().toLowerCase();
    const kind=property==='article:published_time'?'meta-article-published-time':name==='datepublished'?'meta-datepublished':name==='citation_publication_date'?'meta-citation-publication-date':null;
    if(kind)add(claims,kind,attr(node,'content')); // Never read modified/unknown values.
   }
   if(tag==='TIME'&&attr(node,'itemprop').split(/\s+/u).includes('datePublished')){
    const article=selectPrimaryArticle();if(article&&node.closest('article')===article)add(claims,'time-datepublished',attr(node,'datetime'));
   }
   if(tag!=='SCRIPT'||attr(node,'type').split(';')[0].trim().toLowerCase()!=='application/ld+json')continue;
   const children=node.childNodes;if(children.length>8)stop('json-text-bound');let raw='';
   for(let j=0;j<children.length;j++){
    const child=children[j];if(child.nodeType!==3&&child.nodeType!==4)stop('json-text-node');
    const length=child.length;if(!Number.isSafeInteger(length)||length<0||length>16384||raw.length+length>16384||jsonCharacters+length>32768)stop('json-text-bound');
    const data=child.data;if(typeof data!=='string'||data.length!==length)stop('json-text-node');raw+=data;jsonCharacters+=length;
   }visitJson(raw);
  }
  if(bound.length)claims.push(...bound);
  else if(unbound.length===1)claims.push(...unbound);
  else if(unbound.length>1&&!claims.length)stop('ambiguous-article-scope');
  if(claims.length>16)stop('claim-count');
  check();const last=new URL(location.href),lastDocument=new URL(document.URL);last.hash='';lastDocument.hash='';
  if(last.href!==documentUrl||lastDocument.href!==documentUrl)stop('document-mismatch');
  const claimsJson=JSON.stringify(claims);if(claimsJson.length>8192)stop('claim-bytes');
  return {schema,status:'captured',reason:null,documentUrl,claimsJson,articleObjects};
 }catch(error){return {schema,status:'unavailable',reason:errors.has(error)?errors.get(error):'dom-unavailable',documentUrl:null,claimsJson:null,articleObjects:0};}
}
