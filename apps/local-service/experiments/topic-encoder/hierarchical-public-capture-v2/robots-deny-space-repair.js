// ADR137 experiment-only adapter. Never installed in the production crawler.
// Strict parsing first; one fingerprinted published DENY preserves its space as %20.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {parseRobotsTxt,CrawlerPolicyError,ROBOTS_POLICY} from '../../../src/crawler/robots.js';

const sha=value=>createHash('sha256').update(value).digest('hex');
const HEX=/^[a-f0-9]{64}$/u;
function refuse(){throw new TypeError('Invalid bounded robots repair input');}
function record(value,keys){
  if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)refuse();
  const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))refuse();out[key]=d.value;}return out;
}
const KNOWN=Object.freeze({origin:'https://nl.wikipedia.org',
  rawRobotsSha256:'5b208e484c176e5fdcea5ba86f9ba5aa370117b03b706b37da2451baeb4b88b4',
  decodedRobotsSha256:'5bd4fdfe000f3371420eb68a396513fac4a3c75ef5a0c9324ce2eb8be8b6a5dd',
  disallowLine:"Disallow: /wiki/Overleg wikipedia:Te_beoordelen_pagina's/",
  repairId:'adr137-nl-wikipedia-known-disallow-space-percent20/v1'});

function compileTrusted(spec){
  const m=record(spec,['origin','rawRobotsSha256','decodedRobotsSha256','disallowLine','repairId']);
  if(typeof m.origin!=='string'||!/^https:\/\/[a-z0-9.-]+$/u.test(m.origin)||
    typeof m.rawRobotsSha256!=='string'||!HEX.test(m.rawRobotsSha256)||
    typeof m.decodedRobotsSha256!=='string'||!HEX.test(m.decodedRobotsSha256)||
    typeof m.disallowLine!=='string'||m.disallowLine.length>2048||!m.disallowLine.startsWith('Disallow: /')||
    typeof m.repairId!=='string'||!/^[a-z0-9/._-]{1,160}$/u.test(m.repairId))refuse();
  const path=m.disallowLine.slice('Disallow: '.length);
  if((path.match(/ /gu)??[]).length!==1||/[\u0000-\u001f\u007f#\\]/u.test(path)||path.endsWith(' '))refuse();
  const canonicalLine='Disallow: '+path.replace(' ','%20');
  // Even the trusted fixture seam cannot declare a repair that leaves invalid syntax.
  parseRobotsTxt('User-agent: *\n'+canonicalLine);
  const repairManifestHash=sha(JSON.stringify(m));
  return input=>{
    const a=record(input,['origin','text','rawBytes']);
    if(typeof a.origin!=='string'||a.origin.length>256||typeof a.text!=='string'||Buffer.byteLength(a.text)>ROBOTS_POLICY.maxBytes||
      types.isProxy(a.rawBytes)||!Buffer.isBuffer(a.rawBytes)||a.rawBytes.length>ROBOTS_POLICY.maxBytes)refuse();
    const rawRobotsSha256=sha(a.rawBytes),decodedRobotsSha256=sha(a.text);
    let robots;
    try{robots=parseRobotsTxt(a.text);}
    catch(error){
      if(!(error instanceof CrawlerPolicyError)||error.code!=='invalid-robots')throw error;
      if(a.origin!==m.origin||rawRobotsSha256!==m.rawRobotsSha256||decodedRobotsSha256!==m.decodedRobotsSha256)throw error;
      const lines=a.text.split(/\r\n|\n|\r/u);
      if(lines.filter(line=>line===m.disallowLine).length!==1)throw error;
      // A full-line fingerprint, not a substring rewrite. Keep every other byte
      // of the decoded text, including line endings, order, Allow and UA records.
      const pattern=/(^|\r\n|\n|\r)([^\r\n]*)(?=\r\n|\n|\r|$)/gu;
      let replacements=0;
      const canonical=a.text.replace(pattern,(whole,boundary,line)=>line===m.disallowLine?(replacements++,boundary+canonicalLine):whole);
      if(replacements!==1)throw error;
      robots=parseRobotsTxt(canonical); // All original strict bounds still apply.
      return Object.freeze({robots,receipt:Object.freeze({rawRobotsSha256,decodedRobotsSha256,
        canonicalRobotsSha256:sha(canonical),repairId:m.repairId,repairManifestHash,replacedDisallowLines:1})});
    }
    return Object.freeze({robots,receipt:Object.freeze({rawRobotsSha256,decodedRobotsSha256,
      canonicalRobotsSha256:decodedRobotsSha256,repairId:null,repairManifestHash:null,replacedDisallowLines:0})});
  };
}
export const KNOWN_DENY_SPACE_REPAIR=KNOWN;
export const parseRobotsWithKnownDenySpaceRepair=compileTrusted(KNOWN);
// Trusted author-controlled geometric/synthetic fixture seam ONLY. The capture
// library never accepts this function or a caller-supplied repair declaration.
export function compileTrustedDenySpaceRepairForOfflineTests(spec){return compileTrusted(spec);}
