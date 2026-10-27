import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import vm from 'node:vm';
import path from 'node:path';
import {describeSemanticBoundaryFailure,validateSemanticBrowserSmokeSource,quarantinePausedSemanticTarget} from '../harness/run-semantic-workspace-browser-smoke.js';

// Evaluate the ACTUAL launcher with an in-memory child and pipes. No subprocess,
// network, native API, profile or filesystem write occurs in these tests.
function fakeLauncher(){
  const raw=readFileSync(new URL('../../../spikes/topic-resolution/harness/chromium-pipe.js',import.meta.url),'utf8');
  assert.ok(raw.includes('import { spawn } from "node:child_process";'));
  const instrumented=raw.replace('import { spawn } from "node:child_process";','const spawn=globalThis.fakeSpawn;')
    .replace('export function launchChromiumPipe','function launchChromiumPipe')+'\nglobalThis.launch=launchChromiumPipe;';
  const child=new EventEmitter();child.stdio=[null,null,null,new PassThrough(),new PassThrough()];child.kills=0;
  child.kill=()=>{child.kills++;return true;};
  const context={Buffer,fakeSpawn:()=>child,setTimeout:fn=>{queueMicrotask(fn);return 0;},clearTimeout:()=>{}};
  vm.runInNewContext(instrumented,context);
  return {child,client:context.launch({executable:'fixture-only',profileDirectory:'fixture-only'})};
}
test('owned exit getter changes only on the exact child exit event, never a pipe error',async()=>{
  const {child,client}=fakeLauncher();assert.equal(client.hasExited,false);child.emit('error',Error('synthetic pipe failure'));assert.equal(client.hasExited,false);
  child.emit('exit',0);assert.equal(client.hasExited,true);await client.close();assert.equal(client.hasExited,true);assert.equal(child.kills,0);
});
test('close returning after an unsuccessful owned kill still exposes hasExited false',async()=>{
  const {child,client}=fakeLauncher();child.emit('error',Error('synthetic pipe failure'));await client.close();assert.equal(child.kills,1);assert.equal(client.hasExited,false);
});

const root='D:\\GITProjekts\\universal-discussion-bootstrap',data=path.win32.join(root,'apps/local-service/data');
function pathFixture({dataReal=data,rootReal=root,extra=[]}={}){
  const runner=readFileSync(new URL('../harness/run-semantic-workspace-browser-smoke.js',import.meta.url),'utf8');
  const begin=runner.indexOf('function contained('),end=runner.indexOf('const ELIGIBLE_TARGETS=');assert.ok(begin>=0&&end>begin);
  const source=runner.slice(begin,end)+'\nglobalThis.checked=checkedPath;';
  const entries=new Map([[path.win32.resolve(root),rootReal],[path.win32.resolve(data),dataReal],...extra]);
  const context={assert,path:path.win32,REPO:root,INTENDED_REPO:root,existsSync:value=>entries.has(path.win32.resolve(value)),
    realpathSync:value=>{const found=entries.get(path.win32.resolve(value));assert.ok(found);return found;}};
  vm.runInNewContext(source,context);return context.checked;
}
test('contained metadata permits a fresh owned path under the fixed D workspace',()=>{
  const profile=path.win32.join(data,'semantic-workspace-browser-owned-test');assert.equal(pathFixture()(profile),profile);
});
test('DATA redirected outside the D workspace is refused before writes',()=>{
  assert.throws(()=>pathFixture({dataReal:'E:\\outside-workspace'})(data));
});
test('repository redirected away from the intended D workspace is refused',()=>{
  assert.throws(()=>pathFixture({rootReal:'C:\\outside-workspace'})(data));
});
test('lexically external output or profile targets are refused',()=>{
  assert.throws(()=>pathFixture()('D:\\outside-workspace\\profile'));
});
test('an owned-looking profile redirected to another user directory is refused',()=>{
  const profile=path.win32.join(data,'semantic-workspace-browser-owned-test');
  assert.throws(()=>pathFixture({extra:[[profile,'C:\\Users\\owner']]})(profile));
});
test('closed CDP diagnostic retains only an allowed method and bounded numeric code',()=>{
  assert.deepEqual(describeSemanticBoundaryFailure(Error('Chromium protocol rejected Target.setAutoAttach (code -32601)')),
    {code:'protocol-rejected',method:'Target.setAutoAttach',numericCode:-32601});
  assert.deepEqual(describeSemanticBoundaryFailure(Error('Chromium pipe ended during Network.enable')),{code:'pipe-ended',method:'Network.enable'});
  assert.deepEqual(describeSemanticBoundaryFailure(Error('Executable target already running')),{code:'target-already-executing'});
});
test('unknown diagnostic text, URLs, tokens, methods and accessor messages never enter output',()=>{
  for(const text of ['https://owner.example/private?token=secret','Chromium protocol rejected Secrets.dump (code -32601)',
    'Chromium protocol rejected Target.setAutoAttach (code 9999999999999999999)'])assert.deepEqual(describeSemanticBoundaryFailure(Error(text)),{code:'boundary-failure'});
  const accessor={};Object.defineProperty(accessor,'message',{get(){assert.fail('message getter invoked');}});
  assert.deepEqual(describeSemanticBoundaryFailure(accessor),{code:'boundary-failure'});
  let hooks=0;const proxy=new Proxy({}, {getOwnPropertyDescriptor(){hooks++;throw Error('Do not invoke');}});
  assert.deepEqual(describeSemanticBoundaryFailure(proxy),{code:'boundary-failure'});assert.equal(hooks,0);
  const revoked=Proxy.revocable({},{});revoked.revoke();assert.deepEqual(describeSemanticBoundaryFailure(revoked.proxy),{code:'boundary-failure'});
  for(const value of [null,undefined,'message',1,true])assert.deepEqual(describeSemanticBoundaryFailure(value),{code:'boundary-failure'});
});
test('runner source-check compiles the browser fixture and stays import-inert',()=>{
  assert.deepEqual(validateSemanticBrowserSmokeSource(),{schema:'semantic-workspace-browser-source-check/v1',browserLaunched:false,fixtureCompiles:true});
});

const paused=()=>({waiting:true,originClass:'extension',ready:false,resumeIssued:false,recursiveAttachInstalled:true,offlineInstalled:true,fetchInstalled:true});
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {resolve,promise};};
test('foreign target remains paused and unready after containment and exact identity verification',async()=>{
  const entry=paused(),gate=deferred(),calls=[];let settled=false;
  const pending=quarantinePausedSemanticTarget(entry,{verifyIdentity:async()=>{calls.push('identity');return gate.promise;},
    closeTarget:async()=>{assert.fail('quarantine must not close a target');},resume:async()=>{assert.fail('quarantine must not resume a target');}}).then(()=>{settled=true;});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,['identity']);assert.equal(settled,false);assert.equal(entry.quarantined,undefined);
  gate.resolve(true);await pending;assert.equal(entry.quarantined,true);assert.equal(entry.stage,'quarantined-paused');assert.equal(entry.resumeIssued,false);assert.equal(entry.ready,false);
});
test('quarantine refuses executing, resumed, non-extension or incompletely contained targets without closing',async()=>{
  for(const patch of [{waiting:false},{resumeIssued:true},{ready:true},{originClass:'blank'},{recursiveAttachInstalled:false},{offlineInstalled:false},{fetchInstalled:false}]){
    let calls=0;await assert.rejects(quarantinePausedSemanticTarget({...paused(),...patch},{verifyIdentity:async()=>{calls++;return true;}}),/Quarantine precondition refused/);
    assert.equal(calls,0);
  }
});
test('identity mismatch never qualifies a paused target as quarantined',async()=>{
  const entry=paused();await assert.rejects(quarantinePausedSemanticTarget(entry,{verifyIdentity:async()=>false}),/Quarantine identity refused/);
  assert.equal(entry.quarantined,undefined);assert.equal(entry.resumeIssued,false);assert.equal(entry.ready,false);
});
test('a late resume or boundary loss during identity verification prevents quarantine qualification',async()=>{
  for(const patch of [{resumeIssued:true},{offlineInstalled:false}]){const gate=deferred(),entry=paused();
    const pending=quarantinePausedSemanticTarget(entry,{verifyIdentity:()=>gate.promise});Object.assign(entry,patch);gate.resolve(true);
    await assert.rejects(pending,/Quarantine precondition refused/);assert.equal(entry.quarantined,undefined);
  }
});
