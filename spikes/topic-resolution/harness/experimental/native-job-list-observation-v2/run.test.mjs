import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

// Execute separately with Python -B if the offline guard refuses this child.
// It parses actual source and injects ALL native/filesystem capabilities.
export const PYTHON_AST_TEST=String.raw`
import ast,pathlib,types,unittest,copy
p=pathlib.Path('spikes/topic-resolution/harness/experimental/native-job-list-observation-v2/run.py')
t=ast.parse(p.read_text(encoding='utf8'));ns={'__name__':'_adr183_pure','__file__':str(p.resolve())}
exec(compile(ast.Module(body=[n for n in t.body if not isinstance(n,ast.If)],type_ignores=[]),str(p),'exec'),ns)
F=ns['ProbeFailure'];E=ns['Experiment'];W=ns['WindowsNative']

class Fake:
 def __init__(self,fail=None,previous=1,held=True):
  self.now=0.;self.calls=[];self.processes={};self.next=0;self.last=234;self.fail=fail;self.previous=previous;self.held=held;self.full_override=None;self.overrides={};self.close_calls=[];self.native=W.__new__(W);self.native.k=self;self.cpu=None;self.limit_override={};self.account_override={}
 def CreateJobObjectW(self,*a):self.calls.append(('job',));return 900
 def SetInformationJobObject(self,job,kind,out,size):
  self.calls.append(('limits',));v=out._obj;assert (v.basic.flags,v.basic.activeLimit,v.jobMemory)==(0x2208,8,512*ns['MIB']);return 0 if self.fail=='limits' else 1
 def CreateProcessW(self,application,command,pa,ta,inherit,flags,env,cwd,startup,info):
  self.calls.append(('create',application,command.value,flags,inherit,''.join(env),cwd))
  assert application==ns['PYTHON'];assert flags==0x40c and not flags & (0x08000000|0x10|0x01000000) and inherit is False;assert startup._obj.flags==1 and startup._obj.show==0
  block=''.join(env);assert block.endswith('\0\0') and not block.endswith('\0\0\0')
  pairs=[v.split('=',1) for v in block[:-2].split('\0')];keys=[k for k,v in pairs]
  assert keys==['SystemRoot','TEMP','TMP','WINDIR'] and keys==sorted(keys,key=str.casefold)
  assert dict(pairs)=={'SystemRoot':'C:\\Windows','TEMP':str(ns['OUTPUT']/'temp'),'TMP':str(ns['OUTPUT']/'temp'),'WINDIR':'C:\\Windows'}
  if self.fail=='create':return 0
  self.next+=1;pid=self.next;process=1000+pid;thread=2000+pid
  self.processes[process]={'pid':pid,'thread':thread,'assigned':False,'resumed':False,'exited':False,'processClosed':False,'threadClosed':False,'at':None}
  info._obj.process=process;info._obj.thread=thread;info._obj.pid=pid;return 1
 def AssignProcessToJobObject(self,job,process):
  self.calls.append(('assign',process))
  if self.fail=='assign':return 0
  self.processes[process]['assigned']=True;return 1
 def IsProcessInJob(self,process,job,out):
  self.calls.append(('belongs',process));out._obj.value=self.fail!='membership-false';return 0 if self.fail=='membership-api' else 1
 def ResumeThread(self,thread):
  self.calls.append(('resume',thread));r=next(r for r in self.processes.values() if r['thread']==thread)
  if self.previous==1:r['resumed']=True;r['at']=self.now
  return self.previous
 def WaitForSingleObject(self,process,timeout):
  self.calls.append(('wait',process));r=self.processes[process]
  if r['resumed'] and self.fail!='never-exits' and self.now-r['at']>=.03:r['exited']=True
  if self.fail=='wait':return 0xffffffff
  return 0 if r['exited'] else 258
 def GetExitCodeProcess(self,process,out):
  self.calls.append(('exit',process));out._obj.value=7 if self.fail=='exit' else 0;return 1
 def CloseHandle(self,handle):
  self.calls.append(('close',handle));self.close_calls.append(handle)
  if self.fail=='close':return 0
  if handle in self.processes:self.processes[handle]['processClosed']=True
  else:
   for r in self.processes.values():
    if r['thread']==handle:r['threadClosed']=True
  return 1
 def TerminateProcess(self,process,code):
  self.calls.append(('terminate-process',process));self.processes[process]['exited']=True;return 1
 def TerminateJobObject(self,job,code):
  self.calls.append(('terminate-job',job))
  for r in self.processes.values():
   if r['assigned']:r['exited']=True
  return 1
 def GlobalMemoryStatusEx(self,out):out._obj.availablePhysical=out._obj.availablePageFile=2**40;return 1
 def GetDiskFreeSpaceExW(self,drive,out,*a):out._obj.value=2**40;return 1
 def QueryInformationJobObject(self,job,kind,out,size,returned):
  if kind==1:
   self.calls.append(('accounting',));out._obj.user=int((self.now/10 if self.cpu is None else self.cpu)*10000000);out._obj.kernel=0;out._obj.total=len(self.processes);out._obj.active=sum(not r['exited'] for r in self.processes.values());out._obj.terminated=0
   for key,value in self.account_override.items():setattr(out._obj,key,value)
   return 0 if self.fail=='accounting-api' else 1
  if kind==9:
   out._obj.peakJobMemory=4096
   if returned is not None:
    self.calls.append(('readback',));out._obj.basic.flags=self.limit_override.get('flags',0x2208);out._obj.basic.activeLimit=self.limit_override.get('active',8);out._obj.jobMemory=self.limit_override.get('memory',512*ns['MIB']);returned._obj.value=self.limit_override.get('returned',size)
    return 0 if self.fail=='readback-api' else 1
   return 1
  assert kind==3;cap=(size-8)//8;self.calls.append(('query',cap))
  pids=[r['pid'] for r in self.processes.values() if r['assigned'] and not r['processClosed'] and (self.held or not r['exited'])]
  if cap in self.overrides or self.full_override is not None and cap==128:
   q=self.overrides[cap] if cap in self.overrides else self.full_override;out._obj.assigned=q['assigned'];out._obj.listed=q['listed'];returned._obj.value=q.get('returned',8)
   for i,pid in enumerate(q.get('pids',[])[:cap]):out._obj.pids[i]=pid
   return q.get('ok',True)
  out._obj.assigned=len(pids);out._obj.listed=min(len(pids),cap)
  for i,pid in enumerate(pids[:cap]):out._obj.pids[i]=pid
  returned._obj.value=8+min(len(pids),cap)*8
  if len(pids)>cap:self.last=234;return 0
  return 1
 def cached(self):self.calls.append(('cached',));return self.last
 def pause(self,seconds):self.now+=seconds
 def experiment(self):return E(self.native,0,clock=lambda:self.now,pause=self.pause,metadata=lambda:None)

class Checks(unittest.TestCase):
 def setUp(self):
  self.cached=ns['ctypes'].get_last_error;self.addCleanup(lambda:setattr(ns['ctypes'],'get_last_error',self.cached))
 def use(self,fake):ns['ctypes'].get_last_error=fake.cached;return fake.experiment()
 def refused(self,code,action):
  with self.assertRaises(F) as caught:action()
  self.assertEqual(caught.exception.code,code)
 def test_inert_import_main_and_actual_x64_layout(self):
  self.assertEqual(ns['main']([]),0);self.assertTrue(ns['abi']()['valid']);self.assertEqual(ns['abi']()['fullBufferBytes'],1032)
  self.assertFalse(any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='WinDLL' for s in t.body if not isinstance(s,(ast.ClassDef,ast.FunctionDef,ast.If)) for n in ast.walk(s)))
 def source_fixture(self):
  body={'schema':'native-job-list-reviewed-sources/v1','sourceHashes':{key:ns['sha'](b'invented') for key in ns['SOURCE_KEYS']}};raw=ns['wire'](body);reads=[]
  def read(path,*a):reads.append(path);return raw if path==ns['SOURCE_MAP'] else b'invented'
  return raw,body,reads,read
 def test_external_map_pin_before_parse_and_only_exact_literal_four_paths(self):
  raw,body,reads,read=self.source_fixture();self.refused('source-map-pin',lambda:ns['authenticate_sources']('0'*64,read));self.assertEqual(reads,[ns['SOURCE_MAP']])
  reads.clear();self.assertEqual(ns['authenticate_sources'](ns['sha'](raw),read),(raw,body['sourceHashes']));self.assertEqual(reads,[ns['SOURCE_MAP']]+[ns['REPO']/key for key in ns['SOURCE_KEYS']])
  body['sourceHashes']['apps/local-service/data/forbidden.json']='a'*64;raw=ns['wire'](body);reads.clear()
  def changed(path,*a):reads.append(path);return raw
  self.refused('source-map',lambda:ns['authenticate_sources'](ns['sha'](raw),changed));self.assertEqual(reads,[ns['SOURCE_MAP']])
 def test_python_literal_checks_never_select_caller_executable(self):
  reads=[]
  for path in ('C:/foreign/python.exe',ns['PYTHON']+'x'):
   self.refused('interpreter',lambda:ns['authenticate_python'](lambda *a:reads.append(a),path))
  self.assertEqual(reads,[])
  # Test pin/length through exact fixed target, never read actual binary.
  data=b'x'*ns['PYTHON_BYTES'];old=ns['PYTHON_SHA'];ns['PYTHON_SHA']=ns['sha'](data)
  try:
   ns['authenticate_python'](lambda path,*a:(reads.append(path) or data),ns['PYTHON']);self.assertEqual(reads,[pathlib.Path(ns['PYTHON'])])
  finally:ns['PYTHON_SHA']=old
  f=Fake();e=self.use(f);e.job=900;e.create();call=next(x for x in f.calls if x[0]=='create');self.assertEqual(call[1],ns['PYTHON']);self.assertIn(' -I -S -B ',call[2]);self.assertTrue(call[2].endswith(' --owned-child'));self.assertNotIn('python.exe',call[-1])
 def test_complete_native_adapter_schedule_64_children_and_retained_handles(self):
  for held in (True,False):
   f=Fake(held=held);e=self.use(f);e.execute();r=e.result();self.assertEqual(r['status'],'passed');self.assertEqual(r['createdChildren'],64);self.assertTrue(r['normalEmptyJob']);self.assertFalse(r['emergencyOwnJobTermination']);self.assertEqual(sum(r['counts'].values()),r['queryCount']);self.assertLessEqual(r['queryCount'],2048)
   self.assertEqual(len(f.close_calls),129);self.assertEqual(len(set(f.close_calls)),129);self.assertTrue(all(c['processClosed'] and c['threadClosed'] and c['exited'] for c in e.children));self.assertIsNone(r['failure']);self.assertIsNone(r['cleanupFailure'])
   for child in e.children:
    pid=child['pid'];process=child['process'];thread=child['thread'];calls=f.calls
    self.assertLess(calls.index(('assign',process)),calls.index(('belongs',process)));self.assertLess(calls.index(('belongs',process)),calls.index(('resume',thread)));self.assertLess(calls.index(('exit',process)),calls.index(('close',process)))
   initial=e.children[:8];first_query=f.calls.index(('query',128));self.assertTrue(all(f.calls.index(('belongs',c['process']))<first_query for c in initial));self.assertTrue(all(f.calls.index(('resume',c['thread']))>first_query for c in initial))
   control=next(row for row in r['rows'] if row['stage']=='small-control');self.assertFalse(control['querySucceeded']);self.assertEqual(control['errorCategory'],'more-data');self.assertIsNone(control['knownHeldOnly']);self.assertEqual(e.final_empty['listed'],0)
   self.assertNotIn('pid',set().union(*(set(row) for row in r['rows'])));self.assertLess(len(ns['wire'](r)),64*1024)
   self.assertLess(f.calls.index(('limits',)),f.calls.index(('readback',)));self.assertLess(f.calls.index(('readback',)),next(i for i,c in enumerate(f.calls) if c[0]=='create'))
   self.assertEqual(r['limitReadback'],{'querySucceeded':True,'returnedBytes':144,'bufferBytes':144,'flags':0x2208,'activeProcessLimit':8,'jobMemoryBytes':512*ns['MIB']})
   self.assertTrue(all(list(row['accountingBefore'])==['totalProcesses','activeProcesses','totalTerminatedProcesses','user100ns','kernel100ns'] for row in r['rows']))
 def test_readback_failures_stop_before_first_child(self):
  for changes in ({'flags':0x2200},{'flags':0x2208|0x800},{'flags':0x2208|0x1000},{'active':7},{'memory':512*ns['MIB']-1},{'returned':143},{'returned':145},{'returned':0xffffffff}):
   f=Fake();f.limit_override=changes;e=self.use(f);e.execute();r=e.result();self.assertEqual(r['failure'],{'code':'limit-readback'});self.assertFalse(any(c[0]=='create' for c in f.calls));self.assertIsNotNone(r['limitReadback']);self.assertTrue(r['cleanupPassed'])
  f=Fake(fail='readback-api');e=self.use(f);e.execute();self.assertEqual(e.result()['failure'],{'code':'limit-readback'});self.assertFalse(any(c[0]=='create' for c in f.calls))
 def test_accounting_separate_snapshot_not_list_equality_or_cpu_override(self):
  f=Fake();e=self.use(f);e.job=900;f.account_override={'total':99,'active':17,'terminated':3,'user':123,'kernel':456}
  row=e.query('churn');self.assertEqual(row['listed'],0);self.assertEqual(row['accountingBefore'],{'totalProcesses':99,'activeProcesses':17,'totalTerminatedProcesses':3,'user100ns':123,'kernel100ns':456});self.assertAlmostEqual(e.last_cpu,579/10000000)
  q=f.calls.index(('query',128));self.assertEqual(f.calls[:q].count(('accounting',)),1);self.assertEqual(f.calls[q+1:].count(('accounting',)),1)
  for values in ({'user':-1},{'kernel':-1}):
   f=Fake();f.account_override=values;e=self.use(f);e.job=900;self.refused('resources',lambda:e.query('churn'));self.assertFalse(any(c[0]=='query' for c in f.calls))
  f=Fake(fail='accounting-api');e=self.use(f);e.job=900;self.refused('resources',lambda:e.query('churn'))
  for key,value in [('activeProcesses',True),('totalProcesses',-1),('totalTerminatedProcesses',2**32),('user100ns',2**63),('kernel100ns',1.5)]:
   f=Fake();e=self.use(f);e.job=900;original=f.native.resources
   def resources(job):
    r=original(job);r['accounting'][key]=value;return r
   f.native.resources=resources;self.refused('accounting',lambda:e.query('churn'));self.assertFalse(any(c[0]=='query' for c in f.calls))
 def query_fixture(self,q):
  f=Fake();e=self.use(f);e.job=900;f.full_override=q;return f,e
 def test_exact_original_three_capacity_predicates_remain_distinct(self):
  for q,code in [({'assigned':129,'listed':0},'assigned-capacity'),({'assigned':0,'listed':129},'listed-capacity'),({'assigned':2,'listed':1,'pids':[1],'returned':16},'count-mismatch')]:
   f,e=self.query_fixture(q);self.refused(code,lambda:e.query('churn'));self.assertEqual(e.queries,1);self.assertIsNotNone(e.first_unexpected);self.assertIsNone(e.final_empty)
 def test_false_query_outputs_and_return_sentinel_are_diagnostic_only(self):
  f,e=self.query_fixture({'ok':False,'assigned':0xffffffff,'listed':0xffffffff,'returned':0xffffffff});self.refused('query-failed',lambda:e.query('churn'));r=e.first_unexpected;self.assertIsNone(r['returnedBytes']);self.assertFalse(r['returnLengthWritten']);self.assertIsNone(r['prefixInBounds']);self.assertEqual(f.calls[-1],('cached',))
  for error,label in [(234,'more-data'),(5,'access-denied'),(999999,'other')]:
   f.last=error;out=f.native.query(900,128);self.assertFalse(out['ok']);self.assertEqual(out['error'],label);self.assertIsNone(out['pids'])
  f.full_override={'ok':True,'assigned':0,'listed':0,'returned':0xffffffff};before=f.calls.count(('cached',));e.query('churn');self.assertEqual(f.calls.count(('cached',)),before)
 def test_success_prefix_known_children_and_return_byte_bounds(self):
  for q,code in [({'assigned':1,'listed':1,'pids':[999],'returned':16},'unknown-child'),({'assigned':2,'listed':2,'pids':[1,1],'returned':24},'prefix-contract'),({'assigned':0,'listed':0,'returned':1033},'return-length'),({'assigned':0,'listed':0,'returned':0},'return-length')]:
   f,e=self.query_fixture(q);self.refused(code,lambda:e.query('churn'))
  f,e=self.query_fixture({'assigned':0,'listed':0,'returned':8});self.assertEqual(e.query('churn')['listed'],0)
 def test_assignment_failure_and_membership_latch_prevent_resume(self):
  for failure in ('create','assign','membership-api','membership-false'):
   f=Fake(fail=failure);e=self.use(f);e.execute();r=e.result();self.assertEqual(r['status'],'failed');self.assertFalse(any(x[0]=='resume' for x in f.calls));self.assertEqual(len(f.close_calls),len(set(f.close_calls)))
   if failure=='assign':self.assertTrue(any(x[0]=='terminate-process' for x in f.calls));self.assertFalse(any(x[0]=='terminate-job' for x in f.calls))
   if failure.startswith('membership'):self.assertTrue(e.children[0]['assigned']);self.assertTrue(any(x[0]=='terminate-job' for x in f.calls));self.assertFalse(any(x[0]=='terminate-process' for x in f.calls))
 def test_resume_unexpected_zero_two_and_minus_one_require_owned_job_cleanup(self):
  for previous in (0,2,0xffffffff):
   f=Fake(previous=previous);e=self.use(f);e.execute();r=e.result();self.assertEqual(r['failure'],{'code':'resume'});self.assertEqual(r['status'],'failed');self.assertTrue(r['emergencyOwnJobTermination']);self.assertTrue(all(c['exited'] for c in e.children));self.assertEqual(sum(x[0]=='terminate-job' for x in f.calls),1);self.assertEqual(len(f.close_calls),len(set(f.close_calls)))
 def test_first_mismatch_then_failed_final_query_cannot_claim_empty(self):
  f,e=self.query_fixture({'assigned':2,'listed':1,'pids':[1],'returned':16});self.refused('count-mismatch',lambda:e.query('churn'));first=copy.deepcopy(e.first_unexpected)
  f.full_override={'ok':False,'assigned':0,'listed':0,'returned':8};self.refused('query-failed',lambda:e.query('final-empty',cleanup=True,final=True));self.assertEqual(e.first_unexpected,first);self.assertIsNone(e.final_empty)
 def test_suspended_exact_eight_and_small_control_never_hide_success_corruption(self):
  for q in ({'assigned':0,'listed':0,'pids':[],'returned':8},{'assigned':7,'listed':7,'pids':list(range(1,8)),'returned':64}):
   f=Fake();e=self.use(f);e.job=900
   for _ in range(8):e.create()
   f.full_override=q;self.refused('suspended-set',lambda:e.query('suspended'))
  for q,code in [({'assigned':8,'listed':1,'pids':[999],'returned':16},'unknown-child'),({'assigned':8,'listed':2,'pids':[1,2],'returned':16},'prefix-bounds'),({'assigned':8,'listed':1,'pids':[1],'returned':17},'return-length'),({'assigned':1,'listed':1,'pids':[1],'returned':16},'control-insufficiency')]:
   f=Fake();e=self.use(f);e.job=900
   for _ in range(8):e.create()
   f.overrides[1]=q;self.refused(code,lambda:e.query('small-control',capacity=1))
  for q in ({'ok':True,'assigned':8,'listed':1,'pids':[1],'returned':16},{'ok':False,'assigned':0xffffffff,'listed':0xffffffff,'returned':0xffffffff}):
   f=Fake();e=self.use(f);e.job=900
   for _ in range(8):e.create()
   f.overrides[1]=q;row=e.query('small-control',capacity=1);self.assertTrue(row['expectedControlInsufficiency']);self.assertIsNone(e.final_empty)
  f=Fake();e=self.use(f);e.job=900;f.last=5;f.overrides[1]={'ok':False,'assigned':0,'listed':0,'returned':0};self.refused('query-failed',lambda:e.query('small-control',capacity=1))
 def test_close_failures_attempt_every_handle_once_primary_cleanup_distinct(self):
  f=Fake(fail='close');e=self.use(f);e.execute();r=e.result();self.assertEqual(r['failure'],{'code':'close-handle'});self.assertEqual(r['cleanupFailure'],{'code':'close-handle'});self.assertFalse(r['cleanupPassed']);self.assertFalse(r['normalEmptyJob']);self.assertEqual(len(f.close_calls),len(set(f.close_calls)));self.assertEqual(len(f.close_calls),17)
 def test_cpu_refusal_does_not_prevent_post_emergency_physical_waits(self):
  f=Fake();e=self.use(f);e.job=900;e.create();f.cpu=21;e.remember(F('cpu'));e.cleanup();r=e.result();self.assertTrue(r['emergencyOwnJobTermination']);self.assertTrue(e.children[0]['exited']);self.assertIn(('wait',e.children[0]['process']),f.calls);self.assertEqual(r['failure'],{'code':'cpu'});self.assertFalse(r['normalEmptyJob'])
 def test_cleanup_reserves_physical_drain_and_query_budget_never_frees_children(self):
  f=Fake(fail='never-exits');e=self.use(f);e.job=900;e.create();e.resume_group(e.children);e.remember(F('query-capacity'));e.queries=2048;e.cleanup();r=e.result();self.assertTrue(e.children[0]['exited']);self.assertEqual(sum(x[0]=='terminate-job' for x in f.calls),1);self.assertLess(f.now,60);self.assertGreaterEqual(f.now,55);self.assertEqual(r['failure'],{'code':'query-capacity'});self.assertEqual(r['status'],'failed');self.assertFalse(r['normalEmptyJob']);self.assertTrue(r['allOriginalHandlesClosed'])
 def test_resources_exit_and_native_creation_failures_cannot_be_success(self):
  for failure in ('limits','create','exit','wait'):
   f=Fake(fail=failure);e=self.use(f);e.execute();r=e.result();self.assertEqual(r['status'],'failed');self.assertIsNotNone(r['failure']);self.assertEqual(len(f.close_calls),len(set(f.close_calls)))
  f=Fake();e=self.use(f);e.job=900;e.create();e.resume_group(e.children);f.cpu=21;e.remember(F('cpu'));e.cleanup();self.assertEqual(e.result()['status'],'failed');self.assertEqual(e.result()['failure'],{'code':'cpu'})
 def test_deadlines_guard_before_dispatch_and_same_cleanup_epoch(self):
  f=Fake();e=self.use(f);f.now=45;self.refused('active-deadline',e.schedule);self.assertEqual(f.calls,[])
  f.now=60;self.refused('wall-deadline',lambda:e.guard(True));self.assertEqual(f.calls,[])
  f=Fake();e=self.use(f);e.job=900;e.queries=2048;self.refused('query-capacity',lambda:e.query('churn'));self.assertFalse(any(x[0]=='query' for x in f.calls))
 def test_publication_original_wall_checked_after_pending_close_and_final_scan(self):
  for slow in ('close','final-scan',None):
   now=[0];events=[]
   class Pending:
    def __enter__(self):events.append('open');return self
    def write(self,data):events.append('write');self.data=data
    def __exit__(self,*a):events.append('close');now[0]=60 if slow=='close' else now[0]
   def measure():
    events.append('scan')
    if slow=='final-scan' and events.count('scan')==2:now[0]=60
    return (0,1)
   call=lambda:ns['publish_result'](b'{}',0,clock=lambda:now[0],measure=measure,open_pending=Pending,link_final=lambda:events.append('link'))
   if slow:self.refused('publication',call)
   else:call()
   self.assertEqual('link' in events,slow!='close')
   if slow is None:self.assertEqual(events,['scan','open','write','close','link','scan'])
 def test_row_budget_first_refusal_and_final_slot_reserved(self):
  f=Fake();e=self.use(f);e.job=900
  for _ in range(100):e.query('churn')
  f.full_override={'assigned':2,'listed':1,'pids':[1],'returned':16};self.refused('count-mismatch',lambda:e.query('churn'))
  f.full_override=None;e.query('final-empty',cleanup=True,final=True);r=e.result();self.assertEqual(len(r['rows']),64);self.assertEqual(r['queryCount'],102);self.assertEqual(r['droppedRows'],38);self.assertEqual(r['rows'][-2]['ordinal'],101);self.assertEqual(r['rows'][-1]['ordinal'],102)
 def test_each_declared_stage_survives_ordinary_poll_saturation(self):
  f=Fake();e=self.use(f);e.job=900
  for _ in range(100):e.query('resumed')
  for stage in ('exited-held','handles-closed','churn'):e.query(stage)
  e.query('final-empty',cleanup=True,final=True);r=e.result()
  self.assertEqual(len(r['rows']),64);self.assertEqual(r['queryCount'],104);self.assertEqual(r['droppedRows'],40)
  self.assertEqual({row['stage'] for row in r['rows']},{'resumed','exited-held','handles-closed','churn','final-empty'})
  self.assertEqual([row['ordinal'] for row in r['rows'][-4:]],[101,102,103,104]);self.assertEqual(len({row['ordinal'] for row in r['rows']}),64);self.assertEqual(r['rows'],sorted(r['rows'],key=lambda row:row['ordinal']));self.assertTrue(all('pid' not in row for row in r['rows']))
 def test_unknown_error_and_projection_failure_have_zero_hooks_no_original_replacement(self):
  hooks=[]
  class Hostile(F):
   def __getattribute__(self,key):hooks.append(key);raise AssertionError('no hook')
   def __str__(self):hooks.append('str');raise AssertionError('no hook')
  for error in [Hostile('assignment'),F('secret/private'),RuntimeError('secret')]:self.assertEqual(ns['project_failure'](error),{'code':'unclassified'})
  self.assertEqual(hooks,[]);f=Fake();e=self.use(f);original=RuntimeError('private first');cleanup=RuntimeError('private cleanup');e.remember(original);e.remember(cleanup,True);saved=ns['project_failure']
  try:
   ns['project_failure']=lambda _:(_ for _ in ()).throw(AssertionError('projector'))
   r=e.result();self.assertEqual(r['failure'],{'code':'unclassified'});self.assertEqual(r['cleanupFailure'],{'code':'unclassified'});self.assertIs(e.error,original);self.assertIs(e.cleanup_error,cleanup);self.assertNotIn('private',ns['wire'](r).decode())
  finally:ns['project_failure']=saved
result=unittest.main(argv=['adr183-pure'],exit=False)
assert result.result.wasSuccessful()
`;

test('fixed source-only entry, literal child process and separate negative control',async()=>{
 const source=await readFile(new URL('./run.py',import.meta.url),'utf8');
 assert.match(source,/C:\/Users\/Laurens\/AppData\/Local\/Programs\/Python\/Python312\/python\.exe/u);
 assert.match(source,/self\.k\.CreateProcessW\(PYTHON,/u);assert.doesNotMatch(source,/Popen|subprocess|OpenProcess|WinDLL\([^)]*shell|TerminateProcess\([^)]*pid/u);
 assert.match(source,/0x8 \| 0x4 \| 0x400/u);assert.doesNotMatch(source,/0x08000000/u);assert.match(source,/time\.sleep\(2\)/u);assert.match(source,/range\(7\)/u);
 assert.match(source,/self\.queries < 2048/u);assert.match(source,/self\.created < 64/u);assert.match(source,/self\.first_unexpected = row/u);
});

test('actual Python AST injected native/source/lifecycle regressions',t=>{
 let result;try{result=spawnSync('python',['-B','-c',PYTHON_AST_TEST],{encoding:'utf8',maxBuffer:131072});}
 catch(error){if(error?.code==='OFFLINE_CAPABILITY_DENIED'){t.skip('run identical exported AST separately; offline guard denies child');return;}throw error;}
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stderr,/OK/u);assert.doesNotMatch(result.stderr,/FAILED|ERROR:/u);
});
