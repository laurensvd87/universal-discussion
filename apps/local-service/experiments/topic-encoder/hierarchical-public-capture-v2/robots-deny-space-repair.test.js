import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseRobotsTxt,evaluateRobots,ROBOTS_POLICY} from '../../../src/crawler/robots.js';
import {KNOWN_DENY_SPACE_REPAIR,parseRobotsWithKnownDenySpaceRepair,compileTrustedDenySpaceRepairForOfflineTests} from './robots-deny-space-repair.js';
const sha=x=>createHash('sha256').update(x).digest('hex');
const origin='https://nl.wikipedia.org',line='Disallow: /wiki/Denied page/';
function fixture(text,{body=Buffer.from(text),rule=line}={}){
  const parse=compileTrustedDenySpaceRepairForOfflineTests({origin,rawRobotsSha256:sha(body),decodedRobotsSha256:sha(text),disallowLine:rule,repairId:'synthetic-deny-space/v1'});
  return {parse,input:{origin,text,rawBytes:body}};
}
test('strict valid policy unchanged, even when no repair declaration matches',()=>{
  for(const text of ['', 'User-agent: *\nDisallow: /private/\nAllow: /private/public']){
    const r=parseRobotsWithKnownDenySpaceRepair({origin:'https://en.wikipedia.org',text,rawBytes:Buffer.from(text)});
    assert.deepEqual(r.robots,parseRobotsTxt(text));assert.equal(r.receipt.repairId,null);
    assert.equal(r.receipt.rawRobotsSha256,sha(text));assert.equal(r.receipt.canonicalRobotsSha256,sha(text));assert(Object.isFrozen(r.receipt));
  }
});
test('one exact DENY-space repair preserves groups, rule order, Allow and line endings',()=>{
  const text='User-agent: Other\r\nDisallow: /other/\r\nUser-agent: *\r\n'+line+'\r\nAllow: /wiki/Denied%20page/public\r\nDisallow: /tail/\r\n';
  const {parse,input}=fixture(text),r=parse(input),canonical=text.replace(line,line.replace('Denied page','Denied%20page'));
  assert.deepEqual(r.robots,parseRobotsTxt(canonical));assert.equal(r.robots.groups.length,2);
  assert.equal(r.robots.groups.reduce((n,g)=>n+g.rules.length,0),4);
  assert.equal(r.receipt.canonicalRobotsSha256,sha(canonical));assert.equal(r.receipt.replacedDisallowLines,1);
  assert.equal(evaluateRobots(r.robots,origin+'/wiki/Denied%20page/anything').allowed,false);
  assert.equal(evaluateRobots(r.robots,origin+'/wiki/Denied%20page/public').allowed,true);
  assert.equal(evaluateRobots(r.robots,origin+'/other/').allowed,true); // Other UA remains isolated.
});
test('raw and decoded hashes independently bound without changing transport encoding',()=>{
  const text='User-agent: *\n'+line,body=Buffer.from('different original encoding bytes'),f=fixture(text,{body});
  const r=f.parse(f.input);assert.notEqual(r.receipt.rawRobotsSha256,r.receipt.decodedRobotsSha256);
  assert.equal(r.receipt.rawRobotsSha256,sha(body));assert.equal(r.receipt.decodedRobotsSha256,sha(text));
  assert.throws(()=>f.parse({...f.input,rawBytes:Buffer.from(text)}));
  assert.throws(()=>f.parse({...f.input,text:text+'\n'}));
});
test('default fixed manifest never repairs synthetic/unknown snapshot or origin',()=>{
  const text='User-agent: *\n'+KNOWN_DENY_SPACE_REPAIR.disallowLine;
  assert.throws(()=>parseRobotsWithKnownDenySpaceRepair({origin,text,rawBytes:Buffer.from(text)}));
  const f=fixture(text,{rule:KNOWN_DENY_SPACE_REPAIR.disallowLine});
  assert.throws(()=>f.parse({...f.input,origin:'https://en.wikipedia.org'}));
  assert.throws(()=>f.parse({...f.input,text:text+'# changed'}));
  assert.equal(KNOWN_DENY_SPACE_REPAIR.rawRobotsSha256,'5b208e484c176e5fdcea5ba86f9ba5aa370117b03b706b37da2451baeb4b88b4');
  assert.equal(KNOWN_DENY_SPACE_REPAIR.decodedRobotsSha256,'5bd4fdfe000f3371420eb68a396513fac4a3c75ef5a0c9324ce2eb8be8b6a5dd');
});
test('exact full single rule required; no substring, duplicate, Allow or extra space repair',()=>{
  for(const text of ['User-agent: *\n'+line+'\n'+line,'User-agent: *\n '+line,'User-agent: *\n'+line+' # comment',
    'User-agent: *\nAllow: /wiki/Denied page/','User-agent: *\nDisallow: /wiki/Denied  page/']){
    const f=fixture(text);assert.throws(()=>f.parse(f.input));
  }
  assert.throws(()=>fixture('User-agent: *\nAllow: /wiki/Denied page/',{rule:'Allow: /wiki/Denied page/'}));
});
test('canonical second strict parse still refuses controls, malformed percent and caps',()=>{
  for(const extra of ['Disallow: /bad%escape','Disallow: /bad\tpath','Disallow: /nul\0path',
    'User-agent: '+('a'.repeat(257)), 'Disallow: /'+('x'.repeat(ROBOTS_POLICY.maxPatternBytes)),
    ...[Array.from({length:33},(_,i)=>'User-agent: b'+i).join('\n')]]){
    const f=fixture('User-agent: *\n'+line+'\n'+extra);assert.throws(()=>f.parse(f.input));
  }
  const f=fixture('User-agent: *\n'+line);assert.throws(()=>f.parse({...f.input,rawBytes:Buffer.alloc(ROBOTS_POLICY.maxBytes+1)}));
  assert.throws(()=>f.parse({...f.input,text:'x'.repeat(ROBOTS_POLICY.maxBytes+1)}));
});
test('hostile records/proxies/accessors never execute; trusted declarations privately copied',()=>{
  const text='User-agent: *\n'+line,body=Buffer.from(text),spec={origin,rawRobotsSha256:sha(body),decodedRobotsSha256:sha(text),disallowLine:line,repairId:'synthetic/v1'};
  const parse=compileTrustedDenySpaceRepairForOfflineTests(spec);spec.disallowLine='Allow: /evil';
  const input={origin,text,rawBytes:body};assert.equal(parse(input).receipt.replacedDisallowLines,1);
  let ran=false;const hostile={...input};Object.defineProperty(hostile,'text',{enumerable:true,get(){ran=true;throw Error();}});
  assert.throws(()=>parse(hostile));assert.equal(ran,false);assert.throws(()=>parse(new Proxy(input,{})));
  assert.throws(()=>parse({...input,rawBytes:new Proxy(body,{})}));assert.throws(()=>parse({...input,extra:true}));
  assert.throws(()=>compileTrustedDenySpaceRepairForOfflineTests(new Proxy(spec,{})));
  const coercion={toString(){ran=true;throw Error();}};
  assert.throws(()=>compileTrustedDenySpaceRepairForOfflineTests({...spec,rawRobotsSha256:coercion}));assert.equal(ran,false);
});
test('repair does not bypass line, group, rule or serialized policy capacity',()=>{
  const cases=[
    'User-agent: *\n'+line+'\n'+'#\n'.repeat(ROBOTS_POLICY.maxLines),
    'User-agent: *\n'+line+'\n'+Array.from({length:ROBOTS_POLICY.maxGroups},(_,i)=>'User-agent: bot'+i+'\nDisallow: /x').join('\n'),
    'User-agent: *\n'+line+'\n'+'Disallow: /x\n'.repeat(ROBOTS_POLICY.maxRules),
    'User-agent: *\n'+line+'\n'+Array.from({length:150},(_,i)=>'Disallow: /'+i+'x'.repeat(1000)).join('\n')
  ];
  for(const text of cases){const f=fixture(text);assert.throws(()=>f.parse(f.input));}
});
