// Invented clocks/policies/fetches only; original collector/parser remain used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpecificityPacing} from './pacing.mjs';
import {collectOriginPolicies} from './origin-policy.js';
import {ControlUnavailable} from '../../current-producer-final-v2/policy.js';
import {PublicFetchError} from '../../../../../apps/local-service/src/crawler/public-fetch.js';
import {evaluateRobots} from '../../../../../apps/local-service/src/crawler/robots.js';
import {parseRobotsWithKnownDenySpaceRepair} from '../../../../../apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js';
const origins=['https://publisher.org'];
const cases=Array.from({length:4},(_,i)=>({id:'case'+i,groupId:'group'+i,url:origins[0]+'/'+i,language:'en'}));
function setup({seed=null,delay=3,tdmFailure=false}={}){
 let time=0,healthy=true;const events=[],sleeps=[];
 const config={origins,seed,clock:()=>time,guard:()=>{assert.equal(healthy,true);return true;},sleep:async ms=>{sleeps.push(ms);time+=ms;},parseRobots:parseRobotsWithKnownDenySpaceRepair,evaluateRobots,unavailable:()=>new ControlUnavailable('origin-policy-budget')};
 const pacing=createSpecificityPacing(config);
 const options={cases,browser:true,batch:1,guard:()=>true,signal:undefined,collect:collectOriginPolicies,fetchPublic:async(url,opts)=>{
  events.push({url,time});assert.ok(opts.timeoutMs<=5000);
  if(tdmFailure&&url.includes('tdmrep'))throw new PublicFetchError('timeout');
  const text=url.endsWith('robots.txt')?'User-agent: *\nAllow: /\nCrawl-delay: '+delay+'\n':'[{"location":"/","tdm-reservation":0}]';
  return {kind:'content',finalUrl:url,status:200,text,body:Buffer.from(text)};
 }};
 return {pacing,options,events,sleeps,config,time:()=>time,setTime:n=>{time=n;},fail:()=>{healthy=false;}};
}
test('phase-wide pacing preserves declared delay across fresh batches and real collector page calls',async()=>{
 const s=setup(),first=await s.pacing.collect(s.options);assert.equal(first.entries.size,4);assert.equal(s.events.length,2);
 assert.equal(s.events[1].time-s.events[0].time,3000);
 await first.beforePage(cases[0].url);const lastPage=s.time();
 const second=await s.pacing.collect({...s.options,batch:2});assert.ok(s.events[2].time-lastPage>=3000);await second.beforePage(cases[1].url);
 assert.deepEqual(s.pacing.snapshot(),{schema:'native-specificity-origin-pacing/v1',originDelays:[{origin:origins[0],maximumDelayMs:3000}],clockCarried:false});
});
test('robots delay survives later TDM unavailability and still spaces next batch',async()=>{
 const s=setup({delay:7,tdmFailure:true}),first=await s.pacing.collect(s.options);assert.ok([...first.entries.values()].every(e=>e.status==='unavailable'));
 assert.equal(s.pacing.snapshot().originDelays[0].maximumDelayMs,7000);
 const last=s.events.at(-1).time;await s.pacing.collect({...s.options,batch:2});assert.ok(s.events[2].time-last>=7000);
});
test('closed-batch stamp covers late browser contacts and policy-only unavailable origins',async()=>{
 for(const tdmFailure of [false,true]){
  const s=setup({delay:7,tdmFailure});await s.pacing.collect(s.options);s.setTime(s.time()+20000);const retiredAt=s.time();
  assert.equal(s.pacing.closedBatch(origins),true);await s.pacing.collect({...s.options,batch:2});assert.ok(s.events[2].time>=retiredAt+7000);
 }
});
test('TEST seed carries only authenticated delays and waits a full own-clock delay, never old monotonic values',async()=>{
 const seed={schema:'native-specificity-origin-pacing/v1',originDelays:[{origin:origins[0],maximumDelayMs:9000}],clockCarried:false};
 const s=setup({seed,delay:3});await s.pacing.collect(s.options);assert.equal(s.events[0].time,9000);assert.equal(s.events[1].time-s.events[0].time,9000);assert.equal(s.pacing.snapshot().originDelays[0].maximumDelayMs,9000);
 assert.throws(()=>setup({seed:{...seed,clockCarried:true}}));assert.throws(()=>setup({seed:{...seed,originDelays:[{origin:'https://extra.org',maximumDelayMs:9000}]}}));
});
test('known delay beyond original60s policy budget makes unavailable without a request or delay reset',async()=>{
 const seed={schema:'native-specificity-origin-pacing/v1',originDelays:[{origin:origins[0],maximumDelayMs:86400000}],clockCarried:false},s=setup({seed});
 const p=await s.pacing.collect(s.options);assert.equal(s.events.length,0);assert.ok([...p.entries.values()].every(e=>e.status==='unavailable'));
 assert.equal(s.pacing.snapshot().originDelays[0].maximumDelayMs,86400000);
});
test('batch guard failure blocks policy dispatch and remains fatal, not unavailable',async()=>{
 const s=setup();s.options.guard=()=>{throw new Error('invented batch deadline');};await assert.rejects(s.pacing.collect(s.options));assert.equal(s.events.length,0);assert.throws(()=>s.pacing.snapshot());
});
test('original sleep stays charged through failure until actual settlement',async()=>{
 const seed={schema:'native-specificity-origin-pacing/v1',originDelays:[{origin:origins[0],maximumDelayMs:3000}],clockCarried:false};let reject;
 const s=setup({seed}),original=new Promise((_,no)=>{reject=no;});s.config.sleep=()=>original;
 // A fresh factory captures this explicit capability before any dispatch.
 const p=createSpecificityPacing(s.config),running=p.collect(s.options);for(let i=0;i<8;i++)await Promise.resolve();s.fail();reject(Error('invented late sleep'));
 await assert.rejects(running);assert.equal(s.events.length,0);assert.throws(()=>p.snapshot());
});
