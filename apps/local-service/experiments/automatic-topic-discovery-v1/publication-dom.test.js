import test from 'node:test';
import assert from 'node:assert/strict';
import {collectArticlePublicationClaims as capture} from './publication-dom.js';
import {normalizeArticlePublicationClaims as normalize} from './publication-metadata.js';
const URL_FIXED='https://news.example.org/article';
function element(tag,attrs={},patch={}){return {tagName:tag,getAttribute:key=>attrs[key]??null,...patch};}
function script(value){return element('SCRIPT',{type:'application/ld+json'},{childNodes:[{nodeType:3,length:value.length,data:value}]});}
function harness(nodes,{url=URL_FIXED,declared=url,primaryArticle=null,queryThrow=false}={}){
 const before=['document','location'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
 if(primaryArticle)primaryArticle.closest=()=>null;
 globalThis.document={URL:declared,head:{contains:n=>n.inHead!==false},querySelectorAll(){if(queryThrow)throw Error('PRIVATE_ERROR');return nodes;},querySelector:()=>primaryArticle?{tagName:'MAIN',querySelectorAll:()=>[primaryArticle]}:null};globalThis.location={href:url};
 try{return capture(URL_FIXED);}finally{for(const[k,d]of before)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
}
const article=(patch={})=>({'@type':'NewsArticle',url:URL_FIXED,datePublished:'2024-10-08T12:00:00Z',...patch});

test('head publication claims and current article JSON-LD normalize together without reading modified metadata',()=>{
 const modified=element('META',{property:'article:modified_time'});modified.getAttribute=k=>{if(k==='content')throw Error('must-not-read');return k==='property'?'article:modified_time':null;};
 const r=harness([element('META',{property:'article:published_time',content:'2024-10-08T12:00:00Z'}),modified,script(JSON.stringify(article()))]);assert.equal(r.status,'captured');const n=normalize(r.claimsJson);assert.equal(n.status,'known');assert.deepEqual(n.claimKinds,['jsonld-datepublished','meta-article-published-time']);
});
test('explicit other-article dates and author/related/comment graph fields do not become current publication claims',()=>{
 const graph={'@graph':[article(),article({url:'https://news.example.org/another',datePublished:'2020-01-01'}),{'@type':'Person',datePublished:'1900-01-01'}, {'@type':'WebPage',author:article({datePublished:'2000-01-01'})}]};
 const r=harness([script(JSON.stringify(graph))]);assert.equal(r.status,'captured');assert.equal(JSON.parse(r.claimsJson).length,1);assert.equal(normalize(r.claimsJson).value,'2024-10-08T12:00:00.000Z');
});
test('a single unscoped article is allowed but multiple unscoped articles cannot silently select a date',()=>{
 const a=article();delete a.url;assert.equal(normalize(harness([script(JSON.stringify(a))]).claimsJson).status,'known');
 const r=harness([script(JSON.stringify([a,{...a,datePublished:'2024-10-09'}]))]);assert.equal(r.status,'unavailable');assert.equal(r.reason,'ambiguous-article-scope');
});
test('a current URL-bound article wins over an unscoped related article while head conflicts stay conflicts',()=>{
 const unscoped=article({datePublished:'2000-01-01'});delete unscoped.url;
 const r=harness([script(JSON.stringify([article(),unscoped])),element('META',{property:'article:published_time',content:'2024-10-09T12:00:00Z'})]);assert.equal(r.status,'captured');assert.equal(normalize(r.claimsJson).status,'conflict');
});
test('only the primary article time node supplies microdata and body meta is ignored',()=>{
 const primary={},other={},nodes=[element('TIME',{itemprop:'datePublished',datetime:'2024-10-08'},{closest:()=>primary}),element('TIME',{itemprop:'datePublished',datetime:'2000-01-01'},{closest:()=>other}),element('META',{name:'datePublished',content:'1999-01-01'},{inHead:false})];
 const r=harness(nodes,{primaryArticle:primary});assert.equal(r.status,'captured');assert.equal(JSON.parse(r.claimsJson).length,1);assert.equal(normalize(r.claimsJson).kind,'calendar-date');
});
test('document mismatch, mid-read navigation and DOM failure expose no raw claim or exception',()=>{
 for(const options of [{url:'https://news.example.org/other'},{declared:'https://news.example.org/other'},{queryThrow:true}]){const r=harness([] ,options);assert.equal(r.status,'unavailable');assert.equal(r.claimsJson,null);assert.equal(JSON.stringify(r).includes('PRIVATE_ERROR'),false);}
 const node=element('META',{name:'datePublished',content:'2024-10-08'});const get=node.getAttribute;node.getAttribute=k=>{const v=get(k);if(k==='content')globalThis.location.href='https://news.example.org/changed';return v;};assert.equal(harness([node]).reason,'document-mismatch');
});
test('JSON text is bounded by native node lengths before accessing its data',()=>{
 let reads=0;const child={nodeType:3,length:16385,get data(){reads++;throw Error('too-large');}};
 const r=harness([element('SCRIPT',{type:'application/ld+json'},{childNodes:[child]})]);assert.equal(r.reason,'json-text-bound');assert.equal(reads,0);
});
test('node, claim and structured graph bounds fail closed without returning partial dates',()=>{
 assert.equal(harness(Array(257).fill(element('META'))).reason,'node-bound');
 assert.equal(harness(Array.from({length:17},()=>element('META',{name:'datePublished',content:'2024-10-08'}))).reason,'claim-count');
 let v=article();for(let i=0;i<10;i++)v={'@graph':[v]};assert.equal(harness([script(JSON.stringify(v))]).reason,'json-work-bound');
});
test('scripts and JSON-LD are parsed as data and malformed input cannot execute code or publish a partial known date',()=>{
 globalThis.__publicationExecutionMarker=0;try{const r=harness([script('globalThis.__publicationExecutionMarker=1')]);assert.equal(r.reason,'json-invalid');assert.equal(globalThis.__publicationExecutionMarker,0);}finally{delete globalThis.__publicationExecutionMarker;}
});
