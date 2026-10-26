import test from 'node:test';
import assert from 'node:assert/strict';
import {captureStaticHtml} from '../../../src/crawler/static-capture.js';
import {pruneWikipediaTransportMetadata,METADATA_PRUNE_LIMITS} from './prune.js';
const URL='https://en.wikipedia.org/wiki/Synthetic';
const prose='An independently authored public article provides enough meaningful prose to satisfy the existing static extractor. '.repeat(4);
const wrap=body=>'<html><head><title>Fixture</title></head><body><main>'+body+'<p>'+prose+'</p></main></body></html>';
test('only complete quoted metadata attributes removed, no text/comment/doctype changes',()=>{
  const html='<!doctype html><!-- data-mw="keep" -->'+wrap('<div DATA-MW = "opaque <meta name=robots content=noindex>" data-parsoid=unquoted id="stable">Visible data-mw="text"</div>');
  const out=pruneWikipediaTransportMetadata({html});assert.equal(out.receipt.removedAttributes,1);
  assert.equal(out.html,html.replace(' DATA-MW = "opaque <meta name=robots content=noindex>"',''));
  assert(out.html.includes('data-parsoid=unquoted'));assert(Object.isFrozen(out.receipt));assert(Object.isFrozen(out));
});
test('rawtext and RCDATA markup-looking values never rewritten',()=>{
  for(const tag of ['script','style','textarea','title','xmp','iframe','noembed','noframes','noscript']){
    const html=wrap('<'+tag+'>const literal = `<div data-mw="leave">`;</'+tag+'>');
    const out=pruneWikipediaTransportMetadata({html});assert.equal(out.html,html);assert.equal(out.receipt.removedAttributes,0);
  }
  const html='<plaintext><div data-mw="leave">';assert.equal(pruneWikipediaTransportMetadata({html}).html,html);
  const unicode=wrap('İ<script>const x=`<div data-mw="keep">`;</SCRIPT><div data-mw="remove">visible</div>');
  assert.equal(pruneWikipediaTransportMetadata({html:unicode}).html,unicode.replace(' data-mw="remove"',''));
  const nonHtmlSpace='<script>literal</script\u00a0not-end><p data-mw="literal">text</p></script>';
  assert.equal(pruneWikipediaTransportMetadata({html:nonHtmlSpace}).html,nonHtmlSpace);
  assert.throws(()=>pruneWikipediaTransportMetadata({html:'<p data-mw="x"\u00a0hidden>text</p>'}));
});
test('script escaped/double-escaped ambiguity refused rather than rewriting raw text',()=>{
  for(const html of ['<script><!--<script>literal</script><p data-mw="literal">text</p></script>',
    '<SCRIPT><!-- <ScRiPt >literal</SCRIPT><div data-mw="text"></div></SCRIPT>']){
    assert.throws(()=>pruneWikipediaTransportMetadata({html}),error=>error.diagnosticCode==='ambiguous-script-escaped-state');
  }
});
test('self-closing syntax on nonvoid raw tags fails closed',()=>{
  for(const name of ['script','style','textarea','title','noscript','plaintext','iframe','xmp']){
    assert.throws(()=>pruneWikipediaTransportMetadata({html:'<'+name+'/><p data-mw="literal">text</p></'+name+'>'}),
      error=>error.diagnosticCode==='ambiguous-self-closing-raw-tag');
  }
});
test('CDATA bytes preserved whole, unsupported declaration states fail closed',()=>{
  const html='<svg><![CDATA[<p>raw<span data-mw="literal">text</span>]]></svg><p data-mw="remove">visible</p>';
  assert.equal(pruneWikipediaTransportMetadata({html}).html,html.replace(' data-mw="remove"',''));
  for(const value of ['<![CDATA[unclosed','<!DOCTYPE html [<!ENTITY x "<p>">]>','<?pi <p data-mw="literal"> ?>','<!unknown>'])assert.throws(()=>pruneWikipediaTransportMetadata({html:value}));
});
test('legacy-accepted output exactly identical after harmless transport metadata removal',()=>{
  for(const attrs of ['data-mw="opaque"','data-parsoid=\'opaque\'','data-mw="opaque" data-parsoid="metadata"']){
    const html=wrap('<section '+attrs+' id="body" lang="en"><p>'+prose+'</p></section>');
    assert.deepEqual(captureStaticHtml(pruneWikipediaTransportMetadata({html}).html,URL),captureStaticHtml(html,URL));
  }
});
test('oversized metadata pruned without increasing old attribute limit',()=>{
  const html=wrap('<div data-mw="'+('x'.repeat(17000))+'" id="kept"></div>');assert.throws(()=>captureStaticHtml(html,URL));
  const r=pruneWikipediaTransportMetadata({html});assert.equal(r.receipt.removedAttributes,1);assert(captureStaticHtml(r.html,URL).eligible);
  assert.equal(r.oversizedTags[0].tagName,'div');assert.equal(r.oversizedTags[0].attributes[0].valueCharacters,17000);
  assert(!JSON.stringify(r.receipt).includes('xxx'));assert(!JSON.stringify(r.oversizedTags).includes('xxx'));
});
test('other oversized attributes remain unchanged and legacy still refuses',()=>{
  for(const name of ['style','class','hidden','data-other','title']){
    const html=wrap('<div '+name+'="'+('x'.repeat(17000))+'" data-mw="remove"></div>');
    const r=pruneWikipediaTransportMetadata({html});assert(r.html.includes(name+'="'));assert.throws(()=>captureStaticHtml(r.html,URL));
  }
});
test('noindex/TDM directives and visibility preserved even after huge metadata',()=>{
  const huge=' data-mw="'+'x'.repeat(17000)+'"';
  for(const directive of ['<meta name="robots" content="noindex">','<meta name="tdm-reservation" content="1">']){
    const html=wrap('<div'+huge+'></div>'+directive),r=pruneWikipediaTransportMetadata({html}),c=captureStaticHtml(r.html,URL);
    if(directive.includes('robots'))assert(c.directives.noindex);else assert.equal(c.directives.tdmReservation,1);
  }
  const html=wrap('<div'+huge+' hidden style="display:none" aria-hidden="true">NEVERVISIBLE</div>');
  const r=pruneWikipediaTransportMetadata({html});assert(r.html.includes('hidden style="display:none" aria-hidden="true"'));assert(!captureStaticHtml(r.html,URL).text.includes('NEVERVISIBLE'));
});
test('quoted directive-looking metadata cannot create active markup or change Allow text',()=>{
  const html=wrap('<div data-mw=\'<meta name="robots" content="noindex">Allow: /\'>Safe</div>Allow: /text');
  const r=pruneWikipediaTransportMetadata({html});assert(!captureStaticHtml(r.html,URL).directives.noindex);assert(r.html.includes('Allow: /text'));
});
test('malformed quotes, attribute adjacency, duplicate attributes and comments fail closed',()=>{
  for(const html of ['<div data-mw="unterminated>','<div data-mw="x"id="y">','<div data-mw="x"hidden>',
    '<div data-mw="x"style="display:none">','<div id="x"data-mw="y">',
    '< p data-mw="literal">','<\u00a0p data-mw="literal">','</ script>',
    '<div data-mw="x" DATA-MW="y">','<div id="x" id="y">','<!--bad'])assert.throws(()=>pruneWikipediaTransportMetadata({html}));
});
test('all original attrs counted including removed, plus byte/token/depth caps',()=>{
  const attrs=Array.from({length:128},(_,i)=>'a'+i+'="x"').join(' ');
  assert.throws(()=>pruneWikipediaTransportMetadata({html:'<div data-mw="removed" '+attrs+'>'}));
  assert.throws(()=>pruneWikipediaTransportMetadata({html:'x'.repeat(METADATA_PRUNE_LIMITS.maxBytes+1)}));
  assert.throws(()=>pruneWikipediaTransportMetadata({html:'<b>'.repeat(257)}));
  assert.throws(()=>pruneWikipediaTransportMetadata({html:'<br>'.repeat(100001)}));
});
test('plain exact records only; proxies/getters cannot execute and outputs detached',()=>{
  const input={html:wrap('<div data-mw="x">Visible</div>')},out=pruneWikipediaTransportMetadata(input);input.html='changed';assert(out.html.includes('Visible'));
  let called=false;const hostile={};Object.defineProperty(hostile,'html',{enumerable:true,get(){called=true;throw Error();}});
  assert.throws(()=>pruneWikipediaTransportMetadata(hostile));assert.equal(called,false);
  for(const v of [new Proxy(input,{}),{...input,extra:1},Object.assign(Object.create(null),input),{html:[]},{html:'\ud800'}])assert.throws(()=>pruneWikipediaTransportMetadata(v));
});
