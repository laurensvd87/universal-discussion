// Invented, source-owned bytes only. Never a publisher/TLS permission receipt.
import {createHash} from 'node:crypto';
export const hash=x=>createHash('sha256').update(x).digest('hex');
const p1='An invented observatory follows the quiet motions of painted wooden moons. Its keepers record each turn by hand and compare the marks at the end of every evening.';
const p2='This second invented paragraph describes a paper garden with carefully folded leaves. The garden exists only in this diagnostic and does not describe a public article or an actual place.';
const rows=[
 ['<title>Invented Moon Workshop</title>','<nav>EXCLUDED NAV</nav><main><h1>Moon workshop</h1><p>Wooden moons turn slowly.</p><div hidden>EXCLUDED HIDDEN</div><form>EXCLUDED FORM</form><p>Paper stars remain still.</p></main>','Invented Moon Workshop','Moon workshop Wooden moons turn slowly. Paper stars remain still.','main-text-prefix/v1'],
 ['<title></title>','<div class="article-content"><p>'+p1+'</p><p>'+p2+'</p></div>','',p1+' '+p2,'article-container-prefix/v1'],
 ['<meta name="robots" content="noindex"><meta name="tdm-reservation" content="1"><title>Denied invented article</title>','<main><p>THIS DENIED BODY MUST NOT BE READ.</p></main>',null,null,null],
 ['<title>Mutable Invented Head</title>','<main><p>An invented compass points toward a paper island.</p></main>','Mutable Invented Head','An invented compass points toward a paper island.','main-text-prefix/v1']
];
export const FIXTURES=Object.freeze(rows.map(([head,body,title,text,extractorVersion],i)=>{
 const html='<!doctype html><html><head><meta charset="utf-8">'+head+'</head><body>'+body+'</body></html>';
 return Object.freeze({id:'native-article-dev-'+String(i+1).padStart(3,'0'),ordinal:i+1,url:'http://127.0.0.1:4173/background-fixture/adr168-article-'+(i+1),html,htmlSha256:hash(html),rawTitleSha256:title===null?null:hash(title),effectiveTitleSha256:title===null?null:hash(title.trim()||'127.0.0.1'),bodySha256:text===null?null:hash(text),extractorVersion});
}));
export const FIXED_CASES=Object.freeze(FIXTURES.map(({id,ordinal,url})=>Object.freeze({id,ordinal,url})));
export const HEAD_MUTATION=Object.freeze({name:'robots',content:'noindex'});
export const BAD_DOCUMENT_ID='00000000-0000-4000-8000-000000000168';
