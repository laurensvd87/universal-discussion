import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
export const PYTHON_AST_TEST=String.raw`
import ast,pathlib,types
path=pathlib.Path('spikes/topic-resolution/harness/experimental/growing-owned-job-census-v1/census.py')
code=path.read_text();tree=ast.parse(code)
m=types.ModuleType('_invented_census');exec(compile(tree,'census.py','exec'),m.__dict__)
assert not any(isinstance(n,(ast.Import,ast.ImportFrom)) and any(x.name not in {'re','time'} for x in n.names) for n in tree.body)
class Fake:
 def __init__(self,ids=(1,)):
  self.ids=list(ids);self.closed=[];self.opened=[];self.calls={};self.rows=[];self.time=0;self.birth=None;self.change=False;self.badjob=False;self.openfail=None;self.gone_allowed=set();self.reject=set();self.closefail=False
 def listing(self,job):return list(self.ids)
 def opening(self,pid):
  if self.openfail==pid:
   if pid in self.gone_allowed:self.ids.remove(pid)
   raise RuntimeError('SECRET arbitrary args must not escape')
  h=(pid,len(self.opened));self.opened.append(h);return h
 def member(self,h,job):return not self.badjob
 def ident(self,h):
  pid=h[0];self.calls[pid]=self.calls.get(pid,0)+1
  if self.birth and self.calls[pid]==1:self.birth(self,pid)
  creation='18446744073709551614'
  if self.change and self.calls[pid]>1:creation='18446744073709551613'
  return dict(pid=pid,creationFiletime=creation,imageBasename='node.exe' if pid==1 else 'conhost.exe',imagePathSha256=('a' if pid==1 else 'b')*64,imagePathHashEncoding=m.ENCODING)
 def close(self,h):
  self.closed.append(h)
  if self.closefail:raise RuntimeError('SECRET close details')
 def policy(self,row):
  self.rows.append(dict(row))
  if row['pid'] in self.reject:raise m.PolicyFailure('policy-unknown-member')
  if row['inspectionStatus']=='gone' and row['pid'] not in self.gone_allowed:raise m.PolicyFailure('policy-gone-unknown')
 def run(self):
  return m.inspect_growing_job('own',list_members=self.listing,open_member=self.opening,belongs=self.member,identity=self.ident,close_member=self.close,validate_row=self.policy,clock=lambda:self.time)
def fails(f,expected):
 try:f.run()
 except m.CensusFailure as e:
  assert e.code==expected,(e.code,expected)
  assert str(e)==expected and 'SECRET' not in str(e)
  assert len(e.partialRows)<=32
 else:raise AssertionError('expected fatal')
 assert len(f.closed)==len(f.opened) and len(set(f.closed))==len(f.closed)
# Stable and born-between-snapshot cases; all current rows exact, handle reused.
f=Fake();r=f.run();assert r['livePids']==[1] and len(r['currentRows'])==1 and f.closed==f.opened
f=Fake();f.birth=lambda f,p:f.ids.append(2) if p==1 else None
r=f.run();assert r['livePids']==[1,2] and r['rounds']==2 and len(f.opened)==2 and f.closed==f.opened
# Successive growth to the bounded union, not a retry loop.
f=Fake();f.birth=lambda f,p:f.ids.append(p+1) if p<8 else None
r=f.run();assert r['livePids']==list(range(1,9)) and r['rounds']==8 and len(f.closed)==8
# Immediate unknown rejection, even if a later snapshot would hide it.
f=Fake((1,2));f.reject={2};fails(f,'policy-unknown-member');assert any(x['pid']==2 and x['inspectionStatus']=='confirmed' for x in f.rows)
# Exact creation and membership are rechecked on the SAME retained handle.
f=Fake();f.change=True;fails(f,'census-identity-changed')
f=Fake();f.badjob=True;fails(f,'census-job-live-failed')
f=Fake();old=f.ident
def numeric(h):v=old(h);v['creationFiletime']=18446744073709551614;return v
f.ident=numeric;fails(f,'census-identity-contract')
# Failed-open live is fatal without retry; fresh absence is explicit policy input.
f=Fake((1,2));f.openfail=2;fails(f,'census-open-live-failed');assert len(f.opened)==1
f=Fake((1,2));f.openfail=2;f.gone_allowed={2};r=f.run();assert r['livePids']==[1] and any(x['pid']==2 and x['inspectionStatus']=='gone' for x in r['historicalRows'])
f=Fake((1,2));f.openfail=2
def unknown_absent(pid):
 if pid==2:f.ids.remove(2);raise RuntimeError('SECRET')
 return Fake.opening(f,pid)
f.opening=unknown_absent;fails(f,'policy-gone-unknown')
# Confirmed process vanishing remains historical, never a current row.
f=Fake((1,2));f.gone_allowed={2};old=f.ident
def vanish(h):
 v=old(h)
 if h[0]==2 and 2 in f.ids:f.ids.remove(2)
 return v
f.ident=vanish;r=f.run();assert r['livePids']==[1] and all(x['pid']==1 for x in r['currentRows']) and any(x['pid']==2 and x['inspectionStatus']=='confirmed' for x in r['historicalRows'])
# Deadline/capacity, nonfinite callback exceptions and close-all behavior.
f=Fake();old=f.ident
def expire(h):v=old(h);f.time=2;return v
f.ident=expire;fails(f,'census-deadline')
f=Fake(tuple(range(1,10)));fails(f,'census-capacity')
f=Fake();f.birth=lambda f,p:f.ids.extend(range(2,10));fails(f,'census-capacity')
f=Fake((1,2));f.closefail=True;fails(f,'census-close-failed');assert len(f.closed)==2
for return_value in (False,0,0.0):
 f=Fake((1,2));old=f.close
 def close_false(h):old(h);return return_value
 f.close=close_false
 try:f.run()
 except m.CensusFailure as e:assert e.code=='census-close-failed' and e.cleanupCode=='census-close-failed'
 else:raise AssertionError('false/zero close accepted')
 assert f.closed==f.opened and len(f.closed)==2
for mode in ('exception','false'):
 f=Fake((1,2));f.reject={2};old=f.close
 def failed_close(h):
  old(h)
  if mode=='exception':raise RuntimeError('SECRET cleanup failure')
  return False
 f.close=failed_close
 try:f.run()
 except m.CensusFailure as e:
  assert e.code=='policy-unknown-member' and e.cleanupCode=='census-close-failed'
  assert str(e)=='policy-unknown-member' and any(r['pid']==2 for r in e.partialRows)
 else:raise AssertionError('policy/cleanup failure hidden')
 assert f.closed==f.opened and len(f.closed)==2
f=Fake();old=f.close
def close_success(h):old(h);return 1
f.close=close_success;assert f.run()['livePids']==[1] and f.closed==f.opened
f=Fake((1,2));shared=(1,0)
def alias(pid):
 if not f.opened:f.opened.append(shared)
 return shared
f.opening=alias;fails(f,'census-handle-alias');assert f.closed==[shared]
f=Fake();f.policy=lambda row:(_ for _ in ()).throw(ValueError('SECRET arbitrary callback text'));fails(f,'policy-rejected')
f=Fake();f.listing=lambda job:(_ for _ in ()).throw(ValueError('SECRET membership'));fails(f,'census-membership-unverifiable')
f=Fake();f.time=float('nan');fails(f,'census-deadline')
f=Fake();old=f.close
def slow_close(h):old(h);f.time=2
f.close=slow_close;fails(f,'census-deadline')
# Caller mutation cannot modify retained evidence.
f=Fake();f.policy=lambda row:row.update(imagePathSha256='f'*64);r=f.run();assert r['currentRows'][0]['imagePathSha256']=='a'*64
assert m.PolicyFailure('SECRET').code=='policy-rejected'
print('ADR157 invented census regressions passed')
`;
test('injected growing census: identity/growth/absence/deadline/close-once',t=>{
 let child;try{child=spawnSync('python',['-c',PYTHON_AST_TEST],{encoding:'utf8'});}catch(e){if(e.code==='OFFLINE_CAPABILITY_DENIED'){t.skip('Subprocess guard; execute identical pure AST script separately.');return;}throw e;}
 assert.equal(child.status,0,child.stderr||child.stdout);
});
test('library remains pure and all budgets are explicit',async()=>{
 const source=await readFile(new URL('./census.py',import.meta.url),'utf8');
 for(const forbidden of ['ctypes','subprocess','open(','sleep(','__main__','WinDLL','listdir','read_bytes'])assert.ok(!source.includes(forbidden));
 assert.match(source,/until=now\(\)\+2/u);assert.match(source,/range\(1,10\)/u);assert.match(source,/len\(observed\)>=8/u);assert.match(source,/len\(rows\)>=32/u);
});
