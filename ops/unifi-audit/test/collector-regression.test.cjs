'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../export-browser.js');
const uuid = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const reply = data => new Response(JSON.stringify(data), {headers:{'content-type':'application/json'}});
const page = (data, offset=0, totalCount=data.length) => ({data,count:data.length,offset,limit:200,totalCount});
const policy = () => ({id:uuid(4),index:0,enabled:true,metadata:{origin:'USER_DEFINED'},
  action:{type:'BLOCK'},source:{zoneId:uuid(2)},destination:{zoneId:uuid(3)},
  ipProtocolScope:{ipVersion:'IPV4_AND_IPV6'},loggingEnabled:false});
test('record budget applies across resources, not independently per list', async () => {
  let calls = 0;
  const env = {location:{origin:'https://10.24.0.1'},AbortController,fetch:async url => {
    calls++;
    const u = new URL(url), offset=Number(u.searchParams.get('offset')??0);
    if(u.pathname.endsWith('/info')) return reply({applicationVersion:api.VERSION});
    if(u.pathname.endsWith('/sites')) return reply(page([{id:uuid(1)}]));
    if(u.pathname.endsWith('/firewall/zones') || u.pathname.endsWith('/traffic-matching-lists')) {
      const lists=u.pathname.endsWith('/traffic-matching-lists');
      return reply(page(Array.from({length:Math.min(200,3000-offset)},(_,i)=>lists
        ? {id:uuid(4000+offset+i),type:'PORTS',items:[{type:'PORT_NUMBER',value:443}]}
        : {id:uuid(2+offset+i),metadata:{origin:'SYSTEM_DEFINED'},name:'Internal',networkIds:[]}),offset,3000));
    }
    return reply(page([]));
  }};
  const result=await api.collect(env,'synthetic-regression-key',0);
  assert.equal(result.collectionStatus,'PARTIAL');
  assert.equal(result.coverage.trafficMatchingLists.code,'record-limit');
  assert.deepEqual(result.trafficMatchingLists,[]);
  assert.ok(result.recordsRead<=api.LIMITS.records); assert.ok(calls<api.LIMITS.requests);
});
test('universal subnets keep their meaning and broad ranges never masquerade as private', () => {
  const s=api.createSanitizer();
  assert.equal(s.address('0.0.0.0/0'),'0.0.0.0/0');
  assert.equal(s.address('::/0'),'::/0');
  assert.match(s.address('172.16.0.0/11'),/^external-address-/);
  assert.equal(s.address('172.16.0.0/12'),'172.16.0.0/12');
});
test('simultaneous contradictory selector fields remain incomplete', () => {
  const p=policy(); p.source.trafficFilter={type:'PORT',portFilter:{type:'PORTS',matchOpposite:false,
    items:[{type:'PORT_NUMBER',value:22}]},ipAddressFilter:{type:'IP_ADDRESSES',matchOpposite:false,items:[]}};
  assert.equal(api.createSanitizer().policy(p).semanticStatus,'INCOMPLETE');
});
test('empty or duplicate connection-state filters remain incomplete', () => {
  for(const values of [[],['NEW','NEW']]) {
    const p=policy();p.connectionStateFilter=values;
    assert.equal(api.createSanitizer().policy(p).semanticStatus,'INCOMPLETE');
  }
});
test('unknown network references stay explicit after all resources are collected', async () => {
  const p=policy();p.source.trafficFilter={type:'NETWORK',networkFilter:{matchOpposite:false,networkIds:[uuid(90)]}};
  const result=await api.collect({location:{origin:'https://10.24.0.1'},AbortController,fetch:async url=>{
    const u=new URL(url);
    if(u.pathname.endsWith('/info'))return reply({applicationVersion:api.VERSION});
    if(u.pathname.endsWith('/sites'))return reply(page([{id:uuid(1)}]));
    if(u.pathname.endsWith('/firewall/policies/ordering'))return reply({orderedFirewallPolicyIds:{beforeSystemDefined:[uuid(4)],afterSystemDefined:[]}});
    if(u.pathname.endsWith('/firewall/policies'))return reply(page([p]));
    if(u.pathname.endsWith('/firewall/zones'))return reply(page([2,3].map(n=>({id:uuid(n),name:'Internal',metadata:{origin:'SYSTEM_DEFINED'},networkIds:[]}))));
    return reply(page([]));
  }},'synthetic-regression-key',0);
  assert.equal(result.policies[0].semanticStatus,'INCOMPLETE');
  assert.ok(result.semanticsIssues['unresolved-resource-reference']>0);
});
