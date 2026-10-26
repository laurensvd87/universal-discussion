// Experimental pure lexical adapter, not production HTML parsing or sanitization.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
const sha=s=>createHash('sha256').update(s).digest('hex');
export const METADATA_PRUNE_VERSION='wikipedia-quoted-transport-metadata-prune/v1';
export const METADATA_PRUNE_LIMITS=Object.freeze({maxBytes:2*1024*1024,maxTokens:100000,maxDepth:256,maxAttributesPerTag:128,maxReportedTags:32});
const REMOVE=new Set(['data-mw','data-parsoid']);
const VOID=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const RAW=new Set(['script','style','textarea','title','xmp','iframe','noembed','noframes','noscript','plaintext']);
const SPACE=/[\t\n\f\r ]/u,RAW_BOUNDARY=/[\t\n\f\r />]/u;
function fail(code){throw Object.assign(new TypeError('Experimental metadata prune refused'),{diagnosticCode:code});}
function inputRecord(value){
  if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==1)fail('input-shape');
  const d=Object.getOwnPropertyDescriptor(value,'html');if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('input-shape');
  if(typeof d.value!=='string'||!d.value.length||!d.value.isWellFormed()||Buffer.byteLength(d.value)>METADATA_PRUNE_LIMITS.maxBytes)fail('html-capacity');return d.value;
}
function frozen(value){if(value&&typeof value==='object'){for(const v of Object.values(value))frozen(v);Object.freeze(value);}return value;}
function tagEnd(html,start){
  let quote=null;
  for(let i=start+1;i<html.length;i++){
    const c=html[i];if(quote){if(c===quote)quote=null;}else if(c==='"'||c==="'")quote=c;else if(c==='>')return i;
  }fail('malformed-tag-quote');
}
function parseAttributes(html,start,end){
  const attributes=[],names=new Set();let i=start;
  while(i<end){
    const whitespaceStart=i;while(i<end&&SPACE.test(html[i]))i++;
    if(i===end||html[i]==='/'&&/^\/[\t\n\f\r ]*$/u.test(html.slice(i,end)))break;
    if(attributes.length&&whitespaceStart===i)fail('malformed-attribute-boundary');
    const nameStart=i;while(i<end&&!/[\t\n\f\r =/>]/u.test(html[i]))i++;
    if(i===nameStart)fail('malformed-attribute');
    const name=html.slice(nameStart,i).toLowerCase();if(names.has(name))fail('duplicate-attribute');names.add(name);
    if(names.size>METADATA_PRUNE_LIMITS.maxAttributesPerTag)fail('attribute-capacity');
    const afterName=i;while(i<end&&SPACE.test(html[i]))i++;
    let quoted=false,valueStart=i,valueEnd=i;
    if(html[i]==='='){
      i++;while(i<end&&SPACE.test(html[i]))i++;
      if(html[i]==='"'||html[i]==="'"){
        quoted=true;const quote=html[i++];valueStart=i;while(i<end&&html[i]!==quote)i++;
        if(i===end)fail('malformed-attribute-quote');valueEnd=i;i++;
      }else{valueStart=i;while(i<end&&!SPACE.test(html[i]))i++;valueEnd=i;}
    }else i=afterName;
    attributes.push({name,start:whitespaceStart,end:i,valueCharacters:valueEnd-valueStart,quoted,remove:quoted&&REMOVE.has(name)});
  }return attributes;
}
export function pruneWikipediaTransportMetadata(value){
  const html=inputRecord(value),lower=html.replace(/[A-Z]/gu,c=>c.toLowerCase()),chunks=[],stack=[],oversizedTags=[];
  let offset=0,count=0,removedAttributes=0,removedCharacters=0,oversizedTagCount=0,raw=null;
  function token(){if(++count>METADATA_PRUNE_LIMITS.maxTokens)fail('token-capacity');}
  while(offset<html.length){
    token();
    if(raw){
      if(raw==='plaintext'){chunks.push(html.slice(offset));offset=html.length;break;}
      let close=lower.indexOf('</'+raw,offset);
      while(close>=0&&!RAW_BOUNDARY.test(html[close+2+raw.length]??''))close=lower.indexOf('</'+raw,close+2);
      if(raw==='script'){
        // Do not approximate HTML's script escaped/double-escaped state machine.
        // Refuse its ambiguous transition rather than treating a literal end tag
        // as markup and accidentally pruning subsequent script text.
        const comment=lower.indexOf('<!--',offset),stop=close<0?html.length:close;
        if(comment>=0&&comment<stop){
          let nested=lower.indexOf('<script',comment+4);
          while(nested>=0&&nested<stop){
            if(RAW_BOUNDARY.test(html[nested+7]??''))fail('ambiguous-script-escaped-state');
            nested=lower.indexOf('<script',nested+7);
          }
        }
      }
      if(close<0){chunks.push(html.slice(offset));offset=html.length;break;}
      chunks.push(html.slice(offset,close));offset=close;raw=null;continue;
    }
    if(html[offset]!=='<'){
      const next=html.indexOf('<',offset),end=next<0?html.length:next;chunks.push(html.slice(offset,end));offset=end;continue;
    }
    if(html.startsWith('<!--',offset)){
      const end=html.indexOf('-->',offset+4);if(end<0)fail('malformed-comment');chunks.push(html.slice(offset,end+3));offset=end+3;continue;
    }
    if(html.startsWith('<![CDATA[',offset)){
      const end=html.indexOf(']]>',offset+9);if(end<0)fail('malformed-cdata');chunks.push(html.slice(offset,end+3));offset=end+3;continue;
    }
    const end=tagEnd(html,offset),source=html.slice(offset,end+1);
    if(/^<!/u.test(source)){
      if(!/^<!doctype\s/iu.test(source)||source.includes('['))fail('unsupported-declaration');
      chunks.push(source);offset=end+1;continue;
    }
    if(/^<\?/u.test(source))fail('unsupported-processing-instruction');
    if(/^<[\s]|^<\/[\s]/u.test(source))fail('ambiguous-tag-prefix');
    const match=/^<(\/?)([A-Za-z][\w:-]*)/u.exec(source);
    if(!match){chunks.push(source);offset=end+1;continue;}
    const closing=Boolean(match[1]),name=match[2].toLowerCase(),sectionStart=offset+match[0].length;
    if(closing){
      const index=stack.lastIndexOf(name);if(index>=0)stack.splice(index);chunks.push(source);offset=end+1;continue;
    }
    if(RAW.has(name)&&/\/\s*>$/u.test(source))fail('ambiguous-self-closing-raw-tag');
    const attrs=parseAttributes(html,sectionStart,end),ranges=attrs.filter(a=>a.remove);
    const sectionCharacters=end-sectionStart;
    if(sectionCharacters>16384){
      oversizedTagCount++;
      if(oversizedTags.length<METADATA_PRUNE_LIMITS.maxReportedTags)oversizedTags.push({tagName:name,attributeSectionCharacters:sectionCharacters,
        attributes:attrs.map(a=>({name:a.name.slice(0,160),nameCharacters:a.name.length,valueCharacters:a.valueCharacters,
          quoted:a.quoted,removed:a.remove}))});
    }
    let cursor=offset;
    for(const a of ranges){chunks.push(html.slice(cursor,a.start));cursor=a.end;removedAttributes++;removedCharacters+=a.end-a.start;}
    chunks.push(html.slice(cursor,end+1));
    if(!VOID.has(name)&&! /\/\s*>$/u.test(source)){
      if(stack.length>=METADATA_PRUNE_LIMITS.maxDepth)fail('depth-capacity');stack.push(name);if(RAW.has(name))raw=name;
    }
    offset=end+1;
  }
  const output=chunks.join('');
  return frozen({html:output,receipt:{version:METADATA_PRUNE_VERSION,originalSha256:sha(html),outputSha256:sha(output),
    originalCharacters:html.length,outputCharacters:output.length,removedAttributes,removedCharacters,tokens:count,
    oversizedTagCount,reportedOversizedTags:oversizedTags.length,experimental:true,productionValidated:false},oversizedTags});
}
