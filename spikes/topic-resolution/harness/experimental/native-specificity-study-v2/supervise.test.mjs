import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

export const PYTHON_AST_TEST=String.raw`
import ast,pathlib,unittest,types,stat,hashlib,copy
path=pathlib.Path('spikes/topic-resolution/harness/experimental/native-specificity-study-v2/supervise.py')
tree=ast.parse(path.read_text(encoding='utf8'))
# Never execute its __main__ or call native/IO setup. Literal module definitions
# and injected tests only. __file__ preserves fixed repository derivation.
body=[n for n in tree.body if not isinstance(n,ast.If)]
ns={'__name__':'_adr179_supervisor_ast_test','__file__':str(path.resolve())}
exec(compile(ast.Module(body=body,type_ignores=[]),str(path),'exec'),ns)
class Pure(unittest.TestCase):
 def refused(self,code,fn):
  with self.assertRaises(RuntimeError) as e:fn()
  self.assertEqual(str(e.exception),code)
 def test_default_inert(self):self.assertEqual(ns['main']([]),0)
 def test_source_pin_before_valid_forbidden_literal(self):
  forbidden='apps/local-service/data/private.json';raw=('export const SOURCE_PATHS=Object.freeze('+ns['json'].dumps([forbidden])+');').encode();reads=[]
  def read(path,cap):reads.append(str(path));return raw
  self.refused('source-literal-pin',lambda:ns['authenticate_sources']('0'*64,{},read,lambda:self.fail('must not walk package')))
  self.assertEqual(reads,[str(ns['HERE']/'source-paths.js')]);self.assertFalse(any(forbidden in p for p in reads))
 def pinned_package_fixture(self,envelope):
  names=sorted(set(ns['HELPERS'].values())|{ns['OWN']+p for p in ('source-paths.js','execute.mjs','supervise.py','supervise.test.mjs','protocol.json')})
  literal=('export const SOURCE_PATHS=Object.freeze('+ns['json'].dumps(names,separators=(',',':'))+');').encode();code={name:(literal if name==ns['OWN']+'source-paths.js' else b'// invented source') for name in names}
  members=[ns['PACKAGE_PREFIX']+'synthetic-'+str(i).zfill(3)+'.js' for i in range(115)];q,r=divmod(13656167,115);small=b'x'*q;large=b'x'*(q+1);packages={key:(large if i<r else small) for i,key in enumerate(members)}
  body={'schema':'playwright-route-burst-dev-freeze/v1','sourceHashes':{key:ns['sha'](value) for key,value in packages.items()},'protocolSha256':'a'*64,'freezeHash':'b'*64};compact=ns['wire'](body);baseline=envelope(compact);reads=[];baseline_reads=[0];drift=[False]
  def read(where,cap):
   reads.append(where)
   if where==ns['REPO']/ns['PACKAGE_BASELINE']:
    baseline_reads[0]+=1;return baseline+b'\n' if drift[0] and baseline_reads[0]>1 else baseline
   if where==ns['HERE']/'source-paths.js':return literal
   for key,value in code.items():
    if where==ns['REPO']/key:return value
   for key,value in packages.items():
    if where==ns['PACKAGE']/key[len(ns['PACKAGE_PREFIX']):]:self.assertLessEqual(len(value),cap);return value
   self.fail('unexpected read')
  run=lambda pin=None:ns['authenticate_sources'](ns['sha'](literal),{k:ns['sha'](v) for k,v in code.items()},read,lambda:members,baseline_pin=ns['sha'](baseline) if pin is None else pin)
  return run,baseline,reads,drift
 def test_actual_source_auth_accepts_only_pinned_single_lf_baseline_envelope(self):
  run,baseline,reads,drift=self.pinned_package_fixture(lambda raw:raw+b'\n');hashes,buffers=run();self.assertEqual(len(hashes),len(buffers)+115);self.assertEqual(reads.count(ns['REPO']/ns['PACKAGE_BASELINE']),2);self.assertTrue(baseline.endswith(b'\n'));self.assertFalse(baseline.endswith(b'\n\n'))
  run,_,_,drift=self.pinned_package_fixture(lambda raw:raw+b'\n');drift[0]=True;self.refused('package-baseline-drift',run)
 def test_baseline_pin_precedes_lf_parse_and_other_envelopes_stay_strict(self):
  run,_,_,_=self.pinned_package_fixture(lambda raw:raw+b'\n');original=ns['strict']
  try:
   ns['strict']=lambda _:self.fail('FILE pin must precede parse');self.refused('package-baseline-pin',lambda:run('0'*64))
  finally:ns['strict']=original
  for wrap in [lambda raw:raw+b'\n\n',lambda raw:raw+b'\r\n',lambda raw:b' '+raw+b'\n',lambda raw:raw+b' \n',lambda raw:raw+b'\t',lambda raw:b'{"schema":"playwright-route-burst-dev-freeze/v1","sourceHashes":{},"sourceHashes":{}}\n']:
   run,_,_,_=self.pinned_package_fixture(wrap);self.assertRaises(RuntimeError,run)
 def test_literal_rejects_private_traversal_and_missing_helpers(self):
  for names in [['apps/local-service/data/private.json'],['../private.js'],['x.js']]:
   raw=('export const SOURCE_PATHS=Object.freeze('+ns['json'].dumps(names)+');').encode()
   self.assertRaises(RuntimeError,lambda:ns['literal_paths'](raw))
 def test_verified_modules_pin_before_any_exec(self):
  buffers={p:b'marker=1' for p in ns['HELPERS'].values()};hashes={p:ns['sha'](b) for p,b in buffers.items()};hashes[list(hashes)[-1]]='0'*64;called=[];original=ns.get('exec')
  ns['exec']=lambda *a:called.append(a)
  try:self.refused('helper-pin',lambda:ns['verified_modules'](buffers,hashes));self.assertEqual(called,[])
  finally:
   if original is None:del ns['exec']
   else:ns['exec']=original
 def test_verified_modules_private_original_file_no_main(self):
  buffers={p:b'marker=1\nif __name__ == "__main__": raise AssertionError()' for p in ns['HELPERS'].values()};hashes={p:ns['sha'](b) for p,b in buffers.items()}
  modules=ns['verified_modules'](buffers,hashes)
  for name,m in modules.items():self.assertEqual(m.marker,1);self.assertEqual(m.__file__,str(ns['REPO']/ns['HELPERS'][name]));self.assertTrue(m.__name__.startswith('_adr179_'))
 def test_assignment_latched_before_failed_membership_no_release(self):
  calls=[]
  class Kernel:
   def OpenProcess(self,access,inherit,pid):calls.append(('open',access,pid));return 7
   def AssignProcessToJobObject(self,job,handle):calls.append(('assign',handle));return 1
   def IsProcessInJob(self,*args):calls.append(('membership',));return 0
  held=[];self.refused('assignment-membership',lambda:ns['guarded_assignment'](Kernel(),8,types.SimpleNamespace(pid=9),lambda h,a:held.append((h,a))))
  self.assertEqual(held,[(7,False),(7,True)]);self.assertEqual(calls[0][1],0x1101)
 def test_duplicate_and_noncanonical_json(self):
  for raw in [b'{"a":1,"a":2}',b'{"a":NaN}',b'{"a": 1}']:
   self.assertRaises((RuntimeError,ValueError),lambda:ns['strict'](raw))
 def test_walk_discovered_scratch_may_disappear_not_required_root(self):
  directory=stat.S_IFDIR|0o700;file=stat.S_IFREG|0o600
  def meta(mode,size=0):return types.SimpleNamespace(st_mode=mode,st_size=size,st_file_attributes=0)
  class Entry:
   path='root/child'
   def stat(self,**kw):return meta(directory)
  class Scan:
   def __enter__(self):return iter([Entry()])
   def __exit__(self,*a):return False
  def inspect(path):
   if path!='root':raise FileNotFoundError()
   return meta(directory)
  self.assertEqual(ns['owned_usage']('root',100,2,inspect,lambda _:Scan()),(0,1))
  self.assertRaises(FileNotFoundError,lambda:ns['owned_usage']('root',100,2,lambda _:(_ for _ in ()).throw(FileNotFoundError()),lambda _:Scan()))
 def test_walk_reparse_and_capacities(self):
  meta=types.SimpleNamespace(st_mode=stat.S_IFDIR|0o700,st_file_attributes=0x400)
  self.refused('owned-tree',lambda:ns['owned_usage']('root',100,2,lambda _:meta,lambda _:None))
 def test_actual_parent_metadata_walk_counts_chrome_spaces_without_byte_reads(self):
  directory=stat.S_IFDIR|0o700;file=stat.S_IFREG|0o600;inspected=[]
  tree={'root':[('root/profile',directory,0)],'root/profile':[('root/profile/Local State',file,37),('root/profile/Default',directory,0)],'root/profile/Default':[('root/profile/Default/Network Persistent State',file,53)]}
  def meta(mode,size=0):return types.SimpleNamespace(st_mode=mode,st_size=size,st_file_attributes=0)
  class Entry:
   def __init__(self,item):self.path,self.mode,self.size=item
   def stat(self,**kw):self.assertion=kw;inspected.append(self.path);return meta(self.mode,self.size)
   def read_bytes(self):raise AssertionError('profile byte reads forbidden')
  class Scan:
   def __init__(self,where):self.where=where
   def __enter__(self):return iter(Entry(v) for v in tree[self.where])
   def __exit__(self,*a):return False
  self.assertEqual(ns['owned_usage']('root',100,4,lambda _:meta(directory),Scan),(90,4));self.assertIn('root/profile/Local State',inspected)
  self.assertEqual(ns['owned_usage']('root/profile',100,3,lambda _:meta(directory),Scan),(90,3))
  self.refused('owned-bytes',lambda:ns['owned_usage']('root',89,4,lambda _:meta(directory),Scan))
 def test_native_no_reparse_is_allowlisted_sampled_and_closes(self):
  opened=[];closed=[];paths={};guarded=[]
  def op(path):
   h=len(opened)+1;opened.append(h);paths[h]=path;return h
  def info(h):return {'attributes':0x10 if paths[h]!=pathlib.Path('owned/file') else 0x20,'identity':{'fileIndex':str(h)}}
  native={'attributes':lambda p:0x20 if p==pathlib.Path('owned/file') else 0x10,'open':op,'info':info,'close':lambda h:closed.append(h)}
  proof=ns['inspect_fixed_path']('fixed',{'fixed':pathlib.Path('owned/file')},native,lambda:guarded.append(True));self.assertFalse(proof['atomic']);self.assertEqual(proof['identity'],{'fileIndex':str(opened[-1])});self.assertEqual(closed,list(reversed(opened)));self.assertTrue(guarded)
  self.refused('proof-path',lambda:ns['inspect_fixed_path']('private',{'fixed':pathlib.Path('owned/file')},native,lambda:None))
 def test_native_reparse_or_swapped_handle_rejects_and_closes(self):
  for which in ['reparse','drift']:
   opened=[];closed=[];reads={}
   def op(p):opened.append(len(opened)+1);return opened[-1]
   def info(h):
    reads[h]=reads.get(h,0)+1;return {'attributes':0x10,'identity':{'fileIndex':str(h+(1 if which=='drift' and reads[h]>1 else 0))}}
   native={'attributes':lambda p:0x400 if which=='reparse' else 0x10,'open':op,'info':info,'close':lambda h:closed.append(h)}
   self.refused('proof-failed',lambda:ns['inspect_fixed_path']('fixed',{'fixed':pathlib.Path('owned/file')},native,lambda:None));self.assertEqual(closed,list(reversed(opened)))
 def test_proof_frames_caps_queue_partial_and_compact_chain(self):
  p=ns['ProofFrames']();p.feed(b'{"x":1}\n');self.assertEqual(p.next(),b'{"x":1}');self.assertIsNone(p.next());self.assertEqual(p.count,1);self.assertEqual(p.maximum,8);self.assertNotEqual(p.chain,'0'*64);p.end();self.assertIsNone(p.failure)
  p=ns['ProofFrames']();p.feed(b'x');p.end();self.assertEqual(p.failure,'pipe-partial')
  p=ns['ProofFrames']();self.refused('pipe-queue',lambda:p.feed(b'x\n'*9))
  p=ns['ProofFrames']()
  for _ in range(3):p.feed(b'x'*4096)
  self.refused('pipe-frame',lambda:p.feed(b'x'*4096))
 def test_proof_service_existing_and_newchild_namespace(self):
  allowed={'parent':pathlib.Path('root/dir'),'child':pathlib.Path('root/dir/file')}
  def prove(key):return {'pathKey':key,'ancestorsChecked':True,'openedIdentityChecked':True,'attributes':0x10 if key=='parent' else 0x20,'identity':{'volumeSerial':'1','fileIndex':'2' if key=='parent' else '3','creationFiletime':'4','size':'0','fileType':'directory' if key=='parent' else 'file'},'atomic':False}
  service=ns['ProofService']('prepare','a'*64,allowed,prove,lambda:None)
  def raw(seq,key,edge,nonce,parent=None):return ns['wire']({'schema':'native-specificity-fs-request/v1','sequence':seq,'phase':'prepare','sourceIdentityHash':'a'*64,'pathKey':key,'operationNonce':nonce,'edge':edge,'parentPathKey':parent,'priorChainHash':service.chain})
  def exchange(raw):
   ack=service.answer(raw);self.assertIsNotNone(service.prepared);service.commit_written(ack);return ack
  a=ns['strict'](exchange(raw(1,'parent','before','new')));self.assertFalse(a['atomic']);exchange(raw(2,'child','after','new','parent'));self.assertEqual(service.before,{})
  exchange(raw(3,'child','before','read'));exchange(raw(4,'child','after','read'));self.assertEqual(service.sequence,4);self.assertEqual(service.before,{})
  self.refused('proof-channel',lambda:service.answer(raw(5,'parent','before','new')))
 def test_source_map_pin_precedes_parse(self):
  self.refused('reviewed-sources-pin',lambda:ns['decode_reviewed_sources'](b'not JSON','0'*64,'a'*64))
  raw=ns['wire']({'schema':'native-specificity-reviewed-sources/v1','sourcePathsSha256':'a'*64,'sourceHashes':{'never/followed.js':'b'*64}})
  self.assertEqual(ns['decode_reviewed_sources'](raw,ns['sha'](raw),'a'*64)['sourceHashes'],{'never/followed.js':'b'*64})
 def test_report_reserves_whole_tree_evidence_and_two_entries(self):
  length=100
  inspect=lambda root:types.SimpleNamespace(st_mode=stat.S_IFDIR)
  for total,evidence,entries in [(8192*ns['MIB']-199,0,0),(0,32*ns['MIB']-199,0),(0,0,344063)]:
   def usage(root,cap,entrycap,**kw):return (0,0) if root==ns['LEGACY_WORKSPACE'] else (evidence,entries) if kw else (total,entries)
   self.refused('report-capacity',lambda:ns['report_reserve'](length,usage,inspect))
  calls=[]
  def usage(root,cap,entrycap,**kw):calls.append(kw);return (0,0)
  ns['report_reserve'](length,usage,inspect);self.assertEqual(len(calls),4);self.assertEqual(len(calls[-1]['exclude_directories']),87)
 def test_old_and_new_workspaces_share_caps_not_individual_budgets(self):
  roots=[]
  original=ns['checked'];ns['checked']=lambda *a:types.SimpleNamespace(st_mode=stat.S_IFDIR);self.addCleanup(lambda:ns.update(checked=original))
  def usage(root,cap,countcap,**kwargs):roots.append((root,kwargs));return (5000*ns['MIB'],1)
  self.refused('combined-workspace-capacity',lambda:ns['study_usage'](8192*ns['MIB'],344064,usage=usage));self.assertEqual([r for r,k in roots],list(ns['STUDY_WORKSPACES']))
  self.refused('combined-workspace-capacity',lambda:ns['study_usage'](32*ns['MIB'],344064,evidence=True,usage=lambda *a,**k:(18*ns['MIB'],1)))
  self.refused('combined-workspace-capacity',lambda:ns['study_usage'](8192*ns['MIB'],344064,usage=lambda *a,**k:(1,200000)))
  roots.clear()
  self.assertEqual(ns['study_usage'](32*ns['MIB'],344064,evidence=True,usage=lambda root,*a,**k:(roots.append((root,k)) or (1,2))),(2,4))
  for root,kwargs in roots:self.assertTrue(all(p.startswith(str(root)) for p in kwargs['exclude_directories']))
 def test_workspace_ancestry_checked_before_and_after_each_walk(self):
  calls=[]
  def inspect(root):calls.append(('check',root));return types.SimpleNamespace(st_mode=stat.S_IFDIR)
  def usage(root,*a,**k):calls.append(('walk',root));return (0,0)
  ns['study_usage'](10,10,usage=usage,inspect_root=inspect)
  self.assertEqual(calls,[(kind,root) for root in ns['STUDY_WORKSPACES'] for kind in ['check','walk','check']])
  for error in [FileNotFoundError(),RuntimeError('reparse'),PermissionError()]:
   scanned=[]
   def denied(root):raise error
   self.assertRaises(type(error),lambda:ns['study_usage'](10,10,usage=lambda *a,**k:scanned.append(1),inspect_root=denied));self.assertEqual(scanned,[])
  self.refused('workspace-directory',lambda:ns['study_usage'](10,10,usage=usage,inspect_root=lambda root:types.SimpleNamespace(st_mode=stat.S_IFREG)))
 def test_checkpoint_bad_shape_is_sticky_and_recent_history_is_bounded(self):
  for value in [{'sequence':0,'chainHash':'a'*64},{'sequence':True,'chainHash':None},{'sequence':0,'chainHash':None,'extra':1}]:
   service=ns['ProofService']('prepare','a'*64,{},lambda _:None,lambda:None)
   self.refused('proof-checkpoint',lambda:service.checkpoint_matches(value));self.assertEqual(service.failure,'proof-checkpoint')
   self.refused('proof-checkpoint',lambda:service.checkpoint_matches({'sequence':0,'chainHash':None}))
  service=ns['ProofService']('prepare','a'*64,{},lambda _:None,lambda:None)
  for i in range(1,65):service.checkpoints.append({'sequence':i,'chainHash':'b'*64})
  self.assertEqual(len(service.checkpoints),64);self.refused('proof-checkpoint',lambda:service.accept_checkpoint('result',{'sequence':0,'chainHash':None}))
 def test_actual_phase_control_all24_and18_batches(self):
  gpath=path.parent/'guardian.py';g_ns={'__name__':'_supervisor_guardian_join'};exec(compile(ast.parse(gpath.read_text(encoding='utf8')),str(gpath),'exec'),g_ns)
  for phase,count in [('train-cal',24),('test',18)]:
   clock=[0.];node={'pid':1,'creationFileTime':'1','imagePathHash':'a'*64,'pathEncoding':'win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1'}
   ids=[hashlib.sha256(str(i).encode()).hexdigest() for i in range(count)];published=[]
   resources={k:0 for k in g_ns['RESOURCE_KEYS']};resources.update(hostPhysicalFree=2**40,hostCommitFree=2**40,cFree=2**40,dFree=2**40,jobMembers=1)
   def publish(name,data,before):before();published.append(name);return ns['sha'](data)
   g=g_ns['PhaseGuardian']({'phase':phase,'freezeHash':'b'*64,'manifestHash':'c'*64,'nodeIdentityHash':g_ns['digest'](node),'sourceMapHash':'d'*64,'batchIds':ids,'node':node,'console':None},
    {'clock':lambda:clock[0],'resources':lambda:dict(resources),'members':lambda:[dict(node)],'census':lambda:[dict(node)],'recheck':lambda _:True,'publish':publish})
   def read(name,maximum):
    base={**g.bindings,'phase':phase}
    if '.start.' in name:return ns['wire']({'schema':'native-specificity-batch-start-request/v1',**base,'batchId':ids[g.index],'batchIndex':g.index+1,'previousAckHash':g.previous_ack})
    if name.startswith('batch-'):return ns['wire']({'schema':'native-specificity-batch-drain-request/v1',**base,'batchId':ids[g.index],'batchIndex':g.index+1,'batchCaptureHash':'e'*64,'captureSummaryHash':'f'*64,'previousAckHash':g.previous_ack})
    if name.startswith('cohort.'):return ns['wire']({'schema':'native-specificity-cohort-drain-request/v1',**base,'accounted':count*4,'captureHash':'e'*64,'batchReceiptHashes':list(g.receipts),'previousAckHash':g.previous_ack})
    return ns['wire']({'schema':'native-specificity-model-stage-request/v1',**base,'stage':g.model_stage,'captureHash':g.capture_hash,'encodingHash':'f'*64,'previousAckHash':g.previous_ack})
   control=ns['PhaseControl'](g,lambda _:True,read,publish,lambda:None,lambda:[1],lambda:True,lambda:None,lambda _:None,lambda:clock[0])
   result=control.run();self.assertEqual(len(result['controlPairs']),count+2);self.assertEqual(g.index,count);self.assertEqual(g.model_stage,'checks');self.assertEqual(len(published),count*2+3)
   self.assertEqual(control.model_clock(),(g.model_started,'checks',g.stage_started))
 def test_postcomplete_held_model_and_checks_clocks_never_reset(self):
  ns['held_model_deadline']('test',(0.,'checks',10.),69.999)
  self.refused('model-stage-deadline',lambda:ns['held_model_deadline']('test',(0.,'checks',10.),70.))
  self.refused('model-deadline',lambda:ns['held_model_deadline']('test',(0.,'checks',500.),525.))
  self.refused('model-deadline',lambda:ns['held_model_deadline']('train-cal',(0.,'checks',760.),780.))
 def test_actual_postcomplete_late_checks_blocks_finish_link_and_exit(self):
  session=ns['NativeSession'].__new__(ns['NativeSession']);clock=[60.9];events=[];old_time=ns['time'];old_publish=ns['publish']
  session.phase='test';session.model_clock=(0.,'checks',1.);session.started=0.;session.phase_active=7005;session.failure=None;session.job=None;session.frame_until=None;session.guardian=types.SimpleNamespace(state='complete');session._confirming_exit=False;session.sample=lambda:events.append('census')
  session.raw_resources=lambda:{'studyBytes':0,'studyEntries':0,'evidenceBytes':0};session.child=types.SimpleNamespace(poll=lambda:0);session.exit_confirmed=False
  def publish(path,data,before):events.append('pending');clock[0]=61.;before();events.append('linked');return ns['sha'](data)
  try:
   ns['time']=types.SimpleNamespace(monotonic=lambda:clock[0]);ns['publish']=publish
   self.refused('model-stage-deadline',lambda:session.parent_publish('invented-finish.ack.json',b'{}',session.raw_guard));self.assertNotIn('linked',events)
   self.refused('model-stage-deadline',session.exit_proof);self.assertFalse(session.exit_confirmed)
  finally:ns['time']=old_time;ns['publish']=old_publish
 def test_actual_wait_observes_before_read_or_post_exists_tick(self):
  events=[]
  class G:
   def check(self):events.append('guard')
  c=ns['PhaseControl'](G(),lambda _:(events.append('exists') or True),lambda *a:(events.append('read') or b'x'),None,lambda:None,None,None,lambda:None,None,None)
  self.assertEqual(c.wait('fixed',lambda:events.append('observed')),b'x');self.assertLess(events.index('observed'),events.index('read'));self.assertEqual(events[events.index('exists')+1],'observed')
 def test_pipe_original_remains_charged_after_caller_timeout(self):
  pending=set();threads=[];now=[0.];actions=[]
  class Held:
   def __init__(self,**kw):self.target=kw['target'];self.alive=True
   def start(self):pass
   def join(self,**kw):pass
   def is_alive(self):return self.alive
  self.refused('pipe-write-deadline',lambda:ns['tracked_pipe_write'](lambda:actions.append('settled'),pending,lambda:None,1,threads.append,lambda:now[0],lambda _:now.__setitem__(0,1),Held))
  self.assertEqual(len(pending),1);self.assertEqual(actions,[]);threads[0].target();threads[0].alive=False;self.assertEqual(pending,set());self.assertEqual(actions,['settled'])
 def test_pipe_original_settlement_before_success(self):
  pending=set();threads=[];actions=[]
  class Immediate:
   def __init__(self,**kw):self.target=kw['target']
   def start(self):self.target()
   def join(self,**kw):pass
   def is_alive(self):return False
  ns['tracked_pipe_write'](lambda:actions.append('physical'),pending,lambda:None,1,threads.append,lambda:0,lambda _:None,Immediate);self.assertEqual(actions,['physical']);self.assertEqual(pending,set())
 def test_actual_pump_two_frames_no_forced_sleep_then_bounded_idle(self):
  session=ns['NativeSession'].__new__(ns['NativeSession']);events=[];queued=[b'{}',b'{}',None]
  session.guarded=lambda:events.append('guard');session.frames=types.SimpleNamespace(next=lambda:queued.pop(0));session.writers=[];session.pending_physical=set();session.allowed={};session.output=pathlib.Path('invented-node-owned')
  session.child=types.SimpleNamespace(stdin=types.SimpleNamespace(write=lambda value:events.append('write'),flush=lambda:events.append('flush')))
  session.service=types.SimpleNamespace(answer=lambda raw:(events.append('answer') or b'{}'),commit_written=lambda raw:events.append('commit'),allowed={})
  original=ns['tracked_pipe_write']
  try:
   ns['tracked_pipe_write']=lambda action,*args:action()
   handled=[]
   for _ in range(3):
    value=session.pump();handled.append(value);ns['pause_if_idle'](value,lambda seconds:events.append(('sleep',seconds)),session.guarded)
  finally:ns['tracked_pipe_write']=original
  self.assertEqual(handled,[True,True,False]);self.assertEqual(events.count('commit'),2);self.assertEqual(events.count('write'),2);self.assertEqual([v for v in events if type(v) is tuple],[('sleep',.002)])
 def test_actual_control_wait_handled_frames_no_sleep_idle_has_finite_wait(self):
  ticks=[True,True];events=[];observations=[];exists=[False,False,True]
  class G:
   def check(self):events.append('guard')
  control=ns['PhaseControl'](G(),lambda name:exists.pop(0),lambda *a:b'fixed',None,lambda:None,None,None,lambda:ticks.pop(0) if ticks else False,lambda seconds:events.append(('sleep',seconds)),lambda:0)
  self.assertEqual(control.wait('known.request.json',lambda:observations.append('first')),b'fixed');self.assertEqual(observations,['first']);self.assertEqual([v for v in events if type(v) is tuple],[('sleep',.002)])
 def test_main_release_gate_no_native_runner(self):
  raw=ns['wire']({'schema':'native-specificity-reviewed-sources/v1','sourcePathsSha256':'a'*64,'sourceHashes':{'invented/code.js':'b'*64}});ran=[]
  def authenticate(*args):return {'invented/code.js':'b'*64},{ns['OWN']+'execute.mjs':b'// pure-only no release'}
  self.refused('execution-wire-not-released',lambda:ns['main'](['--prepare','--source-paths-sha256','a'*64,'--source-map-sha256',ns['sha'](raw)],read=lambda *a:raw,packages=lambda:[],run=lambda *a:ran.append(a),clock=lambda:0,authenticate=authenticate));self.assertEqual(ran,[])
 def test_fixed_prepared_freeze_and_prepare_never_reads_future_freeze(self):
  expected=ns['HERE']/'output'/'prepare-r3'/'node-owned'/'freeze.json';self.assertEqual(ns['PREPARED_FREEZE'],expected);self.assertEqual(ns['PREPARE_LEAF'],'prepare-r3')
  reads=[];raw=ns['wire']({'schema':'native-specificity-reviewed-sources/v1','sourcePathsSha256':'a'*64,'sourceHashes':{'invented/code.js':'b'*64}})
  def read(where,cap):reads.append(where);return raw
  def authenticate(*args):return {},{ns['OWN']+'execute.mjs':b'// not released'}
  self.refused('execution-wire-not-released',lambda:ns['main'](['--prepare','--source-paths-sha256','a'*64,'--source-map-sha256',ns['sha'](raw)],read=read,authenticate=authenticate,clock=lambda:0))
  self.assertEqual(reads,[ns['REVIEWED_SOURCE_MAP']]);self.assertEqual(ns['REVIEWED_SOURCE_MAP'],ns['HERE']/'reviewed-sources-r3.json');self.assertNotIn(expected,reads)
  old=ns['decode_freeze'];reads.clear()
  try:
   ns['decode_freeze']=lambda *args:{'sourceHashes':{},'freezeHash':'c'*64}
   self.refused('execution-wire-not-released',lambda:ns['main'](['--run-test','--source-paths-sha256','a'*64,'--freeze-sha256','b'*64,'--selection-audit-sha256','c'*64],read=read,authenticate=authenticate,clock=lambda:0))
  finally:ns['decode_freeze']=old
  self.assertEqual(reads,[expected])
 def test_control_source_keys_are_phase_specific_not_generic(self):
  saved={key:ns[key] for key in ('verified_modules','fixed_catalog')}
  try:
   ns['verified_modules']=lambda *a:{k:object() for k in ('native','baseline','census')}
   ns['fixed_catalog']=lambda *a:({}, {})
   for phase in ('prepare','train-cal','test'):
    sources={ns['PACKAGE_PREFIX']+'file-'+str(i).zfill(3)+'.js':'f'*64 for i in range(115)}
    s=ns['NativeSession'](phase,0,sources, {ns['OWN']+'source-paths.js':b''},'a'*64,'b'*64,{},'e'*64 if phase=='test' else None)
    self.assertEqual(s.phase_root,ns['WORKSPACE']/('prepare-r3' if phase=='prepare' else phase))
    self.assertIn(ns['PACKAGE_PREFIX'][:-1],s.allowed)
    if phase=='prepare':
     self.assertEqual(s.allowed['control:reviewed-sources'],ns['REVIEWED_SOURCE_MAP']);self.assertNotIn('control:freeze',s.allowed)
    else:
     self.assertEqual(s.allowed['control:freeze'],ns['PREPARED_FREEZE']);self.assertNotIn('control:reviewed-sources',s.allowed)
    self.refused('proof-control-phase',lambda:s.native_proof('control:freeze' if phase=='prepare' else 'control:reviewed-sources'))
    self.refused('proof-control-phase',lambda:s.native_proof('control:arbitrary'))
    self.assertEqual(set(k for k in s.allowed if k.startswith('audit:')),set(ns['TEST_AUDIT_PATHS']) if phase=='test' else set())
    if phase!='test':self.refused('proof-audit-phase',lambda:s.native_proof('audit:selection-audit'))
    self.refused('proof-audit-phase',lambda:s.native_proof('audit:arbitrary'))
  finally:ns.update(saved)
 def test_package_directory_closure_exact_ancestors_and_collisions(self):
  prefix=ns['PACKAGE_PREFIX'];base=[prefix+'file-'+str(i).zfill(3)+'.js' for i in range(115)]
  keys=sorted([prefix+'lib/client/a.js',prefix+'lib/server/b.js']+base[2:]);self.assertEqual(ns['package_directory_closure'](keys),(prefix[:-1],prefix+'lib',prefix+'lib/client',prefix+'lib/server'))
  for changed in [base[:-1],base+[prefix+'extra.js'],list(reversed(base)),[prefix+'../bad.js']+base[1:],[prefix+'a/'*9+'bad.js']+base[1:],['node_modules/foreign/a.js']+base[1:]]:
   self.assertRaises(RuntimeError,lambda:ns['package_directory_closure'](sorted(changed) if changed!=list(reversed(base)) else changed))
  for head in [[prefix+'A.js',prefix+'a.js'],[prefix+'LIB/a.js',prefix+'lib/b.js'],[prefix+'lib',prefix+'lib/a.js'],[prefix+'LIB',prefix+'lib/a.js']]:
   self.refused('package-directory-collision',lambda:ns['package_directory_closure'](sorted(head+base[2:])))
 def test_r3_evidence_excludes_only_new_prepare_temp_not_old_output(self):
  exclusions=ns['evidence_exclusions']();self.assertIn(str(ns['WORKSPACE']/'prepare-r3'/'temp'),exclusions);self.assertNotIn(str(ns['WORKSPACE']/'prepare'/'temp'),exclusions);self.assertEqual(len(exclusions),87)
  raw=ast.unparse(next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='NativeSession'))
  self.assertIn("('prepare', PREPARE_LEAF, 'train-cal', 'test')",raw)
 def test_actual_io_walk_trace_uses_actual_parent_closure_and_proofservice(self):
  source=(path.parent/'io.test.mjs').read_text(encoding='utf8');matched=ns['re'].search(r'export const PACKAGE_DIRECTORY_PROOF_FIXTURE=Object\.freeze\((\[[\s\S]*?\])\);',source);self.assertIsNotNone(matched)
  trace=ns['json'].loads(matched.group(1));self.assertEqual(len(trace),240)
  files=sorted(e['pathKey'] for e in trace if e['edge']=='before' and e['fileType']=='file');self.assertEqual(len(files),115)
  directories=ns['package_directory_closure'](files);self.assertEqual(len(directories),5);self.assertEqual(set(directories),{e['pathKey'] for e in trace if e['fileType']=='directory'})
  allowed={key:pathlib.Path('invented-package')/(key[len(ns['PACKAGE_PREFIX']):] if key.startswith(ns['PACKAGE_PREFIX']) else '') for key in [*files,*directories]};indices={key:str(i+1) for i,key in enumerate(sorted(allowed))};calls=[]
  def prove(key):
   calls.append(key);is_dir=key in directories
   return {'pathKey':key,'ancestorsChecked':True,'openedIdentityChecked':True,'attributes':0x10 if is_dir else 0x20,'identity':{'volumeSerial':'1','fileIndex':indices[key],'creationFiletime':'2','size':'0' if is_dir else '10','fileType':'directory' if is_dir else 'file'},'atomic':False}
  service=ns['ProofService']('prepare','a'*64,allowed,prove,lambda:None)
  for event in trace:
   self.assertEqual(event['fileType'],'directory' if event['pathKey'] in directories else 'file')
   request={'schema':'native-specificity-fs-request/v1','sequence':service.sequence+1,'phase':'prepare','sourceIdentityHash':'a'*64,'pathKey':event['pathKey'],'operationNonce':'walk-'+str(event['pair']),'edge':event['edge'],'parentPathKey':None,'priorChainHash':service.chain};ack=service.answer(ns['wire'](request));service.commit_written(ack)
  self.assertEqual(service.sequence,240);self.assertEqual(service.before,{});self.assertEqual(calls,[e['pathKey'] for e in trace])
  for unknown in ['node_modules/playwright-core-foreign','node_modules/foreign','node_modules/playwright-core/unlisted','node_modules/playwright-core/lib/unlisted']:
   denied=ns['ProofService']('prepare','a'*64,allowed,lambda _:self.fail('unknown key reached native inspector'),lambda:None)
   request={'schema':'native-specificity-fs-request/v1','sequence':1,'phase':'prepare','sourceIdentityHash':'a'*64,'pathKey':unknown,'operationNonce':'unknown','edge':'before','parentPathKey':None,'priorChainHash':None}
   self.refused('proof-channel',lambda:denied.answer(ns['wire'](request)))
 def test_actual_raw_guard_enforces_combined_and_study_caps_after_complete(self):
  session=ns['NativeSession'].__new__(ns['NativeSession']);session.phase='test';session.model_clock=(0.,'checks',1.);session.started=0.;session.phase_active=7005;session.phase_cpu=1395;session.failure=None;session.job=1;session.last_cpu=0.;session.guardian=types.SimpleNamespace(state='complete')
  r={key:0 for key in ('cpuSeconds','rssBytes','privateBytes','commitBytes','jobMembers','batchBytes','batchEntries','studyBytes','studyEntries','evidenceBytes','logBytes','resultBytes')};r.update(hostPhysicalFree=2**40,hostCommitFree=2**40,cFree=2**40,dFree=2**40)
  session.raw_resources=lambda:dict(r);old_time=ns['time'];ns['time']=types.SimpleNamespace(monotonic=lambda:2.)
  try:
   session.raw_guard()
   for key,value in [('batchBytes',300*ns['MIB']+300*ns['MIB']),('batchEntries',5000+5000),('studyBytes',8192*ns['MIB']+1),('studyEntries',344065)]:
    r[key]=value;self.refused('disk-capacity',session.raw_guard);r[key]=0
  finally:ns['time']=old_time
 def test_prepare_result_authenticates_pending_final_freeze_inside_node_owned(self):
  session=ns['NativeSession'].__new__(ns['NativeSession']);session.phase='prepare';session.source_identity='a'*64;session.literal_pin='b'*64
  class Absent:
   def __truediv__(self,key):return self
   def exists(self):return False
  session.output=Absent();session.guarded=lambda:None;bindings={k:'c'*64 for k in ('sourceMapHash','nodeIdentityHash','readySha256','startupAckSha256','baselineHash')};session.startup_bindings=lambda:bindings
  result={'schema':'native-specificity-study-prepared/v1','phase':'prepare','sourceIdentityHash':'a'*64,**bindings,'freezeSha256':'d'*64,'fsProofCheckpoint':{'sequence':0,'chainHash':None},'sourceAssetEndchecksPassed':True,'productionValidated':False,'assignmentAuthority':False}
  calls=[];raw=ns['wire'](result);session.read_control=lambda name,cap:(calls.append((name,cap)) or (raw if name=='result.json' else b'invented-freeze'))
  session.read_file=lambda *a:self.fail('no outside workspace freeze read');session.service=types.SimpleNamespace(accept_checkpoint=lambda *a:None)
  old=ns['decode_freeze']
  try:
   ns['decode_freeze']=lambda data,pin,literal:(self.assertEqual((data,pin,literal),(b'invented-freeze','d'*64,'b'*64)) or {})
   self.assertEqual(session.read_result(),(raw,None))
  finally:ns['decode_freeze']=old
  self.assertEqual(calls,[('result.json',524288),('freeze.json',262144)])
 def test_main_released_invented_source_calls_only_injected_runner(self):
  raw=ns['wire']({'schema':'native-specificity-reviewed-sources/v1','sourcePathsSha256':'a'*64,'sourceHashes':{'invented/code.js':'b'*64}});ran=[]
  def authenticate(*args):return {'invented/code.js':'b'*64},{ns['OWN']+'execute.mjs':ns['RELEASE_LITERAL']+b'\n'}
  status=ns['main'](['--prepare','--source-paths-sha256','a'*64,'--source-map-sha256',ns['sha'](raw)],read=lambda *a:raw,packages=lambda:[],run=lambda *a:(ran.append(a) or 7),clock=lambda:0,authenticate=authenticate);self.assertEqual(status,7);self.assertEqual(ran[0][0],'prepare');self.assertIsNone(ran[0][-1])
 def diagnostic_modules(self):
  modules={}
  for key,relative in [('guardian','guardian.py'),('census','../growing-owned-job-census-v1/census.py')]:
   source=path.parent/relative;module=types.ModuleType('_pure_diagnostic_'+key)
   exec(compile(ast.parse(source.read_text(encoding='utf8')),str(source),'exec'),module.__dict__);modules[key]=module
  return modules
 def test_genuine_finite_failure_preserves_primary_and_cleanup(self):
  modules=self.diagnostic_modules()
  primary,cleanup=ns['failure_projection'](modules['guardian'].GuardianFailure('physical-unsettled'),modules)
  self.assertEqual(primary,{'family':'guardian','code':'physical-unsettled'});self.assertIsNone(cleanup)
  primary,cleanup=ns['failure_projection'](modules['census'].CensusFailure('policy-unknown-member',[],'census-close-failed'),modules)
  self.assertEqual(primary,{'family':'census','code':'policy-unknown-member'});self.assertEqual(cleanup,{'family':'census','code':'census-close-failed'})
 def test_fake_subclass_unknown_and_secretlike_failure_never_stringified(self):
  modules=self.diagnostic_modules();hooks=[];generic=({'family':'supervisor','code':'supervisor-failed'},None)
  class Fake(RuntimeError):
   code='physical-unsettled'
   def __str__(self):hooks.append('str');raise AssertionError()
  class Sub(modules['guardian'].GuardianFailure):pass
  altered=modules['census'].CensusFailure('census-deadline',[]);altered.code='https://secret.invalid/token'
  for error in [Fake('secret'),Sub('physical-unsettled'),modules['guardian'].GuardianFailure('private/path'),altered,RuntimeError('https://secret.invalid/token')]:
   self.assertEqual(ns['failure_projection'](error,modules),generic)
  self.assertEqual(hooks,[])
  self.assertEqual(ns['failure_projection'](RuntimeError('headroom'),modules),({'family':'supervisor','code':'headroom'},None))
 def test_run_session_cleanup_does_not_overwrite_primary(self):
  modules=self.diagnostic_modules();reports=[];reserves=[]
  class Root:
   def exists(self):return True
   def __truediv__(self,key):return 'invented-owned-'+key
  class Session:
   def __init__(self,*args):self.modules=modules;self.emergency=False;self.policy=None;self.child=None;self.stats={};self.phase_root=Root();self.phase_active=100
   def run(self):raise modules['guardian'].GuardianFailure('physical-unsettled')
   def close(self):raise modules['census'].CensusFailure('policy-unknown-member',[],'census-close-failed')
  saved={key:ns[key] for key in ('NativeSession','publish','report_reserve')}
  def publish(where,data,before):before();reports.append(ns['strict'](data))
  try:
   ns['NativeSession']=Session;ns['publish']=publish;ns['report_reserve']=lambda n:reserves.append(n)
   self.assertEqual(ns['run_session']('prepare',ns['time'].monotonic(),{}, {},'a'*64,'b'*64,None),1)
  finally:ns.update(saved)
  self.assertEqual(reports[0]['failure'],{'family':'guardian','code':'physical-unsettled'});self.assertEqual(reports[0]['cleanupFailure'],{'family':'census','code':'census-close-failed'});self.assertTrue(reserves);self.assertFalse(reports[0]['normalExit'])
 def audit_fixture(self):
  h=lambda text:hashlib.sha256(text.encode()).hexdigest();frozen={k:h(k) for k in ('freezeHash','panelIdentity','manifestHash','recipeHash')};freeze_sha=h('freeze-file');source_map=h('source-map');node=h('train-node')
  selected={'schema':'native-specificity-selected-detail/v1','panelIdentity':frozen['panelIdentity'],'manifestHash':frozen['manifestHash'],'producerRecipeHash':frozen['recipeHash'],'rootReuseReceiptHash':h('root-reuse'),'rootTransferHash':h('root-transfer'),'inputLedgerHash':h('input-ledger'),'referencePacket':{'packetHash':h('packet'),'artifactHash':h('artifact')}}
  selected['selectionIdentity']=ns['sha'](ns['wire'](selected));selection_raw=ns['wire'](selected)
  composition={'schema':'native-specificity-phase-composition/v1','phase':'train-cal','manifestHash':frozen['manifestHash'],'sourceAssetEndchecksPassed':True,'normalEncoderClosed':True,'productionValidated':False,'assignmentAuthority':False,'capture':{'accounted':96,'captureHash':h('capture')},'encoding':{'encoderCalls':192,'rawTextRetained':False},'receipts':[h('batch'+str(i)) for i in range(24)]}
  result={'schema':'native-specificity-study-result/v1','phase':'train-cal','freezeHash':frozen['freezeHash'],'sourceMapHash':source_map,'nodeIdentityHash':node,'readySha256':h('ready'),'startupAckSha256':h('startupACK'),'baselineHash':h('baseline'),'result':composition,'selectionSha256':ns['sha'](selection_raw),'fsProofCheckpoint':{'sequence':0,'chainHash':None},'sourceAssetEndchecksPassed':True,'productionValidated':False,'assignmentAuthority':False};result_raw=ns['wire'](result)
  supervisor={'schema':'native-specificity-study-supervisor/v1','phase':'train-cal','sourceIdentityHash':freeze_sha,'sourceIdentityKind':'freeze-file','freezeHash':frozen['freezeHash'],'sourceMapHash':source_map,'nodeIdentityHash':node,'normalExit':True,'exitCode':0,'normalEmptyJob':True,'endchecksPassed':True,'resultSha256':ns['sha'](result_raw),'selectionSha256':ns['sha'](selection_raw),'guardianComplete':{'phase':'train-cal','pending':0},'stats':{},'emergencyOwnJobTermination':False,'ownCleanupPassed':True,'failure':None,'cleanupFailure':None,'productionValidated':False,'assignmentAuthority':False};supervisor['supervisorHash']=ns['sha'](ns['wire'](supervisor));supervisor_raw=ns['wire'](supervisor)
  train_files={'supervisorSha256':ns['sha'](supervisor_raw),'resultSha256':ns['sha'](result_raw),'selectionSha256':ns['sha'](selection_raw)}
  audit={'schema':'native-specificity-independent-selection-audit/v1','phase':'train-cal','freezeFileSha256':freeze_sha,'freezeHash':frozen['freezeHash'],'sourceMapHash':source_map,'panelIdentity':frozen['panelIdentity'],'manifestHash':frozen['manifestHash'],'producerRecipeHash':frozen['recipeHash'],'rootReuseReceiptHash':selected['rootReuseReceiptHash'],'rootTransferHash':selected['rootTransferHash'],'trainFiles':train_files,'trainNodeIdentityHash':node,'selectionIdentity':selected['selectionIdentity'],'packetHash':h('packet'),'artifactHash':h('artifact'),'inputLedgerHash':h('input-ledger'),'review':{'selectedPolicyAndBindingsChecked':True,'fullGridReplay':False,'omittedQueryFeaturesNotRecomputed':True,'testPermitted':True,'scope':'fixed-168-specificity/v1'}};audit['auditIdentity']=ns['sha'](ns['wire'](audit))
  data={'audit:selection-audit':ns['wire'](audit),'audit:train-supervisor':supervisor_raw,'audit:train-result':result_raw,'audit:train-selection':selection_raw}
  return frozen,freeze_sha,source_map,audit,data
 def test_audit_bundle_all_file_pins_before_any_train_parse_and_fixed_paths_only(self):
  frozen,freeze_sha,source_map,audit,data=self.audit_fixture();events=[];original=ns['strict']
  by_path={value:key for key,value in ns['TEST_AUDIT_PATHS'].items()}
  def read(where,cap):key=by_path[where];events.append(('read',key));return data[key]
  def strict(raw):events.append(('parse',next(k for k,v in data.items() if raw==v)));return original(raw)
  try:
   ns['strict']=strict;retained=ns['authenticate_test_bundle'](ns['sha'](data['audit:selection-audit']),frozen,freeze_sha,source_map,read)
  finally:ns['strict']=original
  self.assertEqual(retained,data)
  first_train_parse=next(i for i,e in enumerate(events) if e[0]=='parse' and e[1]!='audit:selection-audit')
  for key in ('audit:train-supervisor','audit:train-result','audit:train-selection'):self.assertLess(events.index(('read',key)),first_train_parse)
 def test_audit_external_pin_fails_before_parse_or_any_train_read(self):
  frozen,freeze_sha,source_map,audit,data=self.audit_fixture();reads=[];original=ns['strict']
  try:
   ns['strict']=lambda _:self.fail('must pin before parse')
   self.refused('test-audit-pin',lambda:ns['authenticate_test_bundle']('0'*64,frozen,freeze_sha,source_map,lambda path,cap:(reads.append(path) or data['audit:selection-audit'])))
  finally:ns['strict']=original
  self.assertEqual(reads,[ns['TEST_AUDIT_PATHS']['audit:selection-audit']])
 def test_audit_tampered_train_bytes_never_parsed(self):
  frozen,freeze_sha,source_map,audit,data=self.audit_fixture();data['audit:train-selection']=b'not JSON private-value';original=ns['strict'];parses=[];by_path={v:k for k,v in ns['TEST_AUDIT_PATHS'].items()}
  try:
   ns['strict']=lambda raw:(parses.append(raw) or original(raw))
   self.refused('test-train-file-pin',lambda:ns['authenticate_test_bundle'](ns['sha'](data['audit:selection-audit']),frozen,freeze_sha,source_map,lambda p,c:data[by_path[p]]))
  finally:ns['strict']=original
  self.assertEqual(parses,[data['audit:selection-audit']])
 def test_file_pinned_v8_numeric_spellings_result_and_selection_are_not_python_digests(self):
  frozen,freeze_sha,source_map,audit,data=self.audit_fixture()
  selected=ns['strict'](data['audit:train-selection']);body={k:v for k,v in selected.items() if k!='selectionIdentity'}
  # Literal V8 JSON spellings: JSON.stringify(1e-6) is 0.000001 and
  # JSON.stringify(1e-7) is 1e-7, unlike CPython's 1e-06 and 1e-07.
  js_body=ns['wire'](body)[:-1]+b',"calibrationAudit":{"gap":0.000001,"epsilon":1e-7}}'
  js_identity=ns['sha'](js_body);self.assertNotEqual(js_identity,ns['sha'](ns['wire'](ns['strict_node_json'](js_body))))
  selection_raw=js_body[:-1]+b',"selectionIdentity":"'+js_identity.encode()+b'"}';data['audit:train-selection']=selection_raw
  result=ns['strict'](data['audit:train-result']);result['selectionSha256']=ns['sha'](selection_raw);result['result']['semantic']={'calibrationMs':'V8_FINITE_NUMBER'}
  data['audit:train-result']=ns['wire'](result).replace(b'"V8_FINITE_NUMBER"',b'0.000001')
  self.refused('noncanonical-json',lambda:ns['strict'](data['audit:train-result']))
  sup=ns['strict'](data['audit:train-supervisor']);sup['resultSha256']=ns['sha'](data['audit:train-result']);sup['selectionSha256']=ns['sha'](selection_raw);sup['supervisorHash']=ns['sha'](ns['wire']({k:v for k,v in sup.items() if k!='supervisorHash'}));data['audit:train-supervisor']=ns['wire'](sup)
  audit['trainFiles']={name:ns['sha'](data[key]) for name,key in [('supervisorSha256','audit:train-supervisor'),('resultSha256','audit:train-result'),('selectionSha256','audit:train-selection')]};audit['selectionIdentity']=js_identity;audit['auditIdentity']=ns['sha'](ns['wire']({k:v for k,v in audit.items() if k!='auditIdentity'}));data['audit:selection-audit']=ns['wire'](audit)
  by_path={v:k for k,v in ns['TEST_AUDIT_PATHS'].items()}
  self.assertEqual(ns['authenticate_test_bundle'](ns['sha'](data['audit:selection-audit']),frozen,freeze_sha,source_map,lambda p,c:data[by_path[p]]),data)
 def test_node_parser_keeps_duplicate_nonfinite_depth_and_closed_outer_contracts(self):
  for raw in [b'{"x":1,"x":2}',b'{"x":NaN}',b'{"x":Infinity}',b'{"x":1e400}']:
   self.assertRaises(RuntimeError,lambda:ns['strict_node_json'](raw))
  self.refused('node-json-depth',lambda:ns['strict_node_json'](b'['*65+b'0'+b']'*65))
  self.assertEqual(ns['strict_node_json'](b'{"x":0.000001}'),{'x':.000001})
  frozen,_,_,_,data=self.audit_fixture();value=ns['strict'](data['audit:train-result']);startup={k:value[k] for k in ('sourceMapHash','nodeIdentityHash','readySha256','startupAckSha256','baselineHash')};value['unexpected']=1
  self.refused('schema',lambda:ns['validate_phase_result'](ns['wire'](value),'train-cal',frozen,startup,value['selectionSha256']))
 def test_cli_audit_pin_is_required_only_test_before_any_read(self):
  for args in [['--run-test','--source-paths-sha256','a'*64,'--freeze-sha256','b'*64],['--prepare','--source-paths-sha256','a'*64,'--source-map-sha256','b'*64,'--selection-audit-sha256','c'*64],['--run-train-cal','--source-paths-sha256','a'*64,'--freeze-sha256','b'*64,'--selection-audit-sha256','c'*64]]:
   self.refused('arguments',lambda:ns['main'](args,read=lambda *a:self.fail('invalid audit CLI must not read'),clock=lambda:0))
 def test_audit_context_review_and_success_flags_are_not_hash_only_authority(self):
  for changed,expected in [('context','test-audit-context'),('review','test-audit-review'),('failed-supervisor','test-train-supervisor'),('false-pending','test-train-supervisor')]:
   frozen,freeze_sha,source_map,audit,data=self.audit_fixture()
   if changed=='context':audit['sourceMapHash']='0'*64
   elif changed=='review':audit['review']['selectedPolicyAndBindingsChecked']=1
   else:
    sup=ns['strict'](data['audit:train-supervisor'])
    if changed=='failed-supervisor':sup['normalEmptyJob']=False
    else:sup['guardianComplete']['pending']=False
    sup['supervisorHash']=ns['sha'](ns['wire']({k:v for k,v in sup.items() if k!='supervisorHash'}));data['audit:train-supervisor']=ns['wire'](sup);audit['trainFiles']['supervisorSha256']=ns['sha'](data['audit:train-supervisor'])
   audit['auditIdentity']=ns['sha'](ns['wire']({k:v for k,v in audit.items() if k!='auditIdentity'}));data['audit:selection-audit']=ns['wire'](audit);by_path={v:k for k,v in ns['TEST_AUDIT_PATHS'].items()}
   self.refused(expected,lambda:ns['authenticate_test_bundle'](ns['sha'](data['audit:selection-audit']),frozen,freeze_sha,source_map,lambda p,c:data[by_path[p]]))
 def test_actual_recheck_retains_bootstrap_and_audited_bundle_original_bytes(self):
  session=ns['NativeSession'].__new__(ns['NativeSession']);session.phase='test';session.phase_root=pathlib.Path('invented-phase');session.sources={};session.literal_pin='a'*64;session.source_identity=ns['sha'](b'freeze');session.bootstrap_bytes=b'bootstrap';session.test_bundle={k:('invented-'+k).encode() for k in ns['TEST_AUDIT_PATHS']};session.guardian=None;session.guarded=lambda:None;reads=[];drift=[None]
  def read(where,cap):
   reads.append(where)
   if where==ns['PREPARED_FREEZE']:return b'freeze'
   if where==session.phase_root/'bootstrap.json':return b'changed' if drift[0]=='bootstrap' else session.bootstrap_bytes
   key=next(k for k,v in ns['TEST_AUDIT_PATHS'].items() if v==where);return b'changed' if drift[0]==key else session.test_bundle[key]
  session.read_file=read;old=ns['authenticate_sources']
  try:
   ns['authenticate_sources']=lambda *a,**kw:({}, {})
   self.assertTrue(session.recheck());self.assertIn(session.phase_root/'bootstrap.json',reads)
   for where in ns['TEST_AUDIT_PATHS'].values():self.assertIn(where,reads)
   drift[0]='audit:train-selection';self.refused('test-bundle-drift',session.recheck)
   drift[0]='bootstrap';self.refused('bootstrap-drift',session.recheck)
  finally:ns['authenticate_sources']=old
 def test_startup_audit_pin_is_bound_only_by_existing_startup_records(self):
  cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='NativeSession');start=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='start')
  records={}
  for node in ast.walk(start):
   if isinstance(node,ast.Assign) and isinstance(node.value,ast.Dict):
    for target in node.targets:
     if isinstance(target,ast.Name) and target.id in ('bootstrap','expected','ack'):records[target.id]=node.value
  self.assertEqual(set(records),{'bootstrap','expected','ack'})
  for value in records.values():
   pairs={key.value:val for key,val in zip(value.keys,value.values) if isinstance(key,ast.Constant)}
   self.assertEqual(ast.unparse(pairs['testAuditSha256']),'self.test_audit_sha')
  bindings=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='startup_bindings');self.assertNotIn('testAuditSha256',ast.unparse(bindings))
result=unittest.main(argv=['supervisor-pure'],exit=False)
assert result.result.wasSuccessful()
`;

test('supervisor import/default entry is inert; native work is explicit',async()=>{
 const text=await readFile(new URL('./supervise.py',import.meta.url),'utf8');
 assert.match(text,/if __name__ == '__main__'/u);assert.doesNotMatch(text,/\.load_modules\(|\.normal_job_drain\(|\.owned_tree_metadata\(/u);
 assert.match(text,/0x1000 \| 0x0100 \| 0x0001/u);
});
test('parent batch stage/profile prefixes match actual driver fixed workspace source',async()=>{
 const [parent,driver]=await Promise.all(['supervise.py','driver.mjs'].map(name=>readFile(new URL('./'+name,import.meta.url),'utf8')));
 assert.match(driver,/const relative=b=>'batch-'\+String\(b\.batchIndex\)\.padStart\(2,'0'\)/u);
 assert.match(driver,/stageExtension\(\{directory:name\+'\/extension'/u);
 assert.match(driver,/stagedExtensionPath:path\.join\(workspaceRoot,name,'extension'\)/u);
 assert.match(driver,/profilePath:path\.join\(workspaceRoot,name,'profile'\)/u);
 assert.match(parent,/stage_layout\(self\.output \/ \('batch-' \+ str\(i \+ 1\)\.zfill\(2\)\) \/ 'extension'/u);
 assert.match(parent,/root \/ phase \/ 'node-owned' \/ \('batch-' \+ str\(i\)\.zfill\(2\)\) \/ name/u);
 assert.match(parent,/for name in \('profile', 'temp'\)/u);assert.doesNotMatch(parent,/staged-extension/u);
});
test('actual supervisor AST injected regressions, no WinDLL/native/source inventory',t=>{
 let result;try{result=spawnSync('python',['-B','-c',PYTHON_AST_TEST],{encoding:'utf8',maxBuffer:131072});}
 catch(error){if(error?.code==='OFFLINE_CAPABILITY_DENIED'){t.skip('run identical exported AST separately; offline guard denies child');return;}throw error;}
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stderr,/OK/u);assert.doesNotMatch(result.stderr,/FAILED|ERROR:/u);
});
