import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

export const PYTHON_AST_TEST=String.raw`
import ast,pathlib,unittest,types,stat,hashlib,copy
path=pathlib.Path('spikes/topic-resolution/harness/experimental/native-specificity-study-v15/supervise.py')
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
   def usage(root,cap,entrycap,**kw):return (0,0) if root!=ns['WORKSPACE'] else (evidence,entries) if kw else (total,entries)
   self.refused('report-capacity',lambda:ns['report_reserve'](length,usage,inspect,exists=lambda _:True))
  calls=[]
  def usage(root,cap,entrycap,**kw):calls.append(kw);return (0,0)
  ns['report_reserve'](length,usage,inspect,exists=lambda _:True);self.assertEqual(len(calls),34);self.assertEqual(len(calls[-1]['exclude_directories']),87)
 def test_old_and_new_workspaces_share_caps_not_individual_budgets(self):
  roots=[]
  original=ns['checked'];ns['checked']=lambda *a:types.SimpleNamespace(st_mode=stat.S_IFDIR);self.addCleanup(lambda:ns.update(checked=original))
  def usage(root,cap,countcap,**kwargs):roots.append((root,kwargs));return (5000*ns['MIB'],1)
  self.refused('combined-workspace-capacity',lambda:ns['study_usage'](8192*ns['MIB'],344064,usage=usage));self.assertEqual([r for r,k in roots],list(ns['STUDY_WORKSPACES'])[:2])
  self.refused('combined-workspace-capacity',lambda:ns['study_usage'](32*ns['MIB'],344064,evidence=True,usage=lambda *a,**k:(18*ns['MIB'],1)))
  self.refused('combined-workspace-capacity',lambda:ns['study_usage'](8192*ns['MIB'],344064,usage=lambda *a,**k:(1,200000)))
  roots.clear()
  self.assertEqual(ns['study_usage'](32*ns['MIB'],344064,evidence=True,usage=lambda root,*a,**k:(roots.append((root,k)) or (1,2)),exists=lambda _:True),(17,34))
  for root,kwargs in roots:self.assertTrue(all(p.startswith(str(root)) for p in kwargs['exclude_directories']))
 def test_workspace_ancestry_checked_before_and_after_each_walk(self):
  calls=[]
  def inspect(root):calls.append(('check',root));return types.SimpleNamespace(st_mode=stat.S_IFDIR)
  def usage(root,*a,**k):calls.append(('walk',root));return (0,0)
  ns['study_usage'](10,10,usage=usage,inspect_root=inspect,exists=lambda _:True)
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
   def lstat(self):raise FileNotFoundError()
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
   def __init__(self,*args):self.modules=modules;self.emergency=False;self.policy=None;self.child=None;self.stats={};self.phase_root=Root();self.phase_active=100;self.resource_observer=ns['ResourceObserver']()
   def run(self):raise modules['guardian'].GuardianFailure('physical-unsettled')
   def close(self):raise modules['census'].CensusFailure('policy-unknown-member',[],'census-close-failed')
  saved={key:ns[key] for key in ('NativeSession','publish','report_reserve')}
  def publish(where,data,before):before();reports.append(ns['strict'](data))
  try:
   ns['NativeSession']=Session;ns['publish']=publish;ns['report_reserve']=lambda n,**kw:reserves.append(n)
   self.assertEqual(ns['run_session']('prepare',ns['time'].monotonic(),{}, {},'a'*64,'b'*64,None),1)
  finally:ns.update(saved)
  self.assertEqual(reports[0]['failure'],{'family':'guardian','code':'physical-unsettled','resourceObservation':{'collectorPrimary':None,'collectorCleanup':None,'guardian':None}});self.assertEqual(reports[0]['cleanupFailure'],{'family':'census','code':'census-close-failed'});self.assertTrue(reserves);self.assertFalse(reports[0]['normalExit'])
 def test_run_session_observation_failed_only_and_projection_failure_noninterference(self):
  modules=self.diagnostic_modules();reports=[];real=ns['NativeSession'];mode=['failure']
  class Root:
   def exists(self):return True
   def __truediv__(self,key):return 'invented-owned-'+key
  class Session:
   def __init__(self,*args):
    self.modules=modules;self.emergency=False;self.policy=None;self.child=None;self.stats={};self.phase_root=Root();self.phase_active=100;self.guardian=None;self.resource_observer=ns['ResourceObserver']()
   def run(self):
    if mode[0]=='success':return {'resultSha256':'a'*64,'selectionSha256':None,'guardianComplete':None,'stats':{}}
    self.resource_observer.retain(self.resource_observer.candidate(RuntimeError('owned-tree'),'walk-entry','workspace-v3','entry-stat'))
    raise modules['guardian'].GuardianFailure('resources')
   def close(self):
    self.resource_observer.in_cleanup=True
    if mode[0]!='success':self.resource_observer.retain(self.resource_observer.candidate(RuntimeError('cpu-accounting'),'job-cpu','own-job','cpu-accounting'))
    return True
   def resource_diagnostic(self):
    if mode[0]=='projector-failed':raise AssertionError('private observation failure')
    return real.resource_diagnostic(self)
  saved={key:ns[key] for key in ('NativeSession','publish','report_reserve')}
  def publish(where,data,before):before();reports.append(ns['strict'](data))
  try:
   ns['NativeSession']=Session;ns['publish']=publish;ns['report_reserve']=lambda *a,**kw:None
   for current,exit_code in [('failure',1),('projector-failed',1),('success',0)]:
    mode[0]=current;self.assertEqual(ns['run_session']('prepare',ns['time'].monotonic(),{}, {},'a'*64,'b'*64,None),exit_code)
  finally:ns.update(saved)
  failed=reports[0]['failure'];self.assertEqual((failed['family'],failed['code']),('guardian','resources'));d=failed['resourceObservation'];self.assertEqual(d['collectorPrimary']['code'],'owned-tree');self.assertEqual(d['collectorCleanup']['code'],'cpu-accounting');self.assertIsNone(d['guardian']);self.assertLessEqual(len(ns['wire'](d)),1024)
  self.assertEqual(reports[1]['failure'],{'family':'guardian','code':'resources','resourceObservation':{'collectorPrimary':None,'collectorCleanup':None,'guardian':None}})
  self.assertIsNone(reports[2]['failure']);self.assertIsNone(reports[2]['cleanupFailure']);self.assertTrue(reports[2]['normalExit']);self.assertNotIn('resourceObservation',reports[2]);self.assertEqual(set(reports[0]),set(reports[2]))
 def resource_fixture(self,failure=None,absent=False,membership_false=False,deny_vmread=False):
  # Only authenticated helper CODE definitions are parsed. No load_windows,
  # __main__, inventory, outputs, real WinAPI, package or process is touched.
  source=ns['REPO']/ns['HELPERS']['native'];t=ast.parse(source.read_text(encoding='utf8'))
  names={'MemoryStatus','ProcessMemory','BasicLimits','IoCounters','ExtendedLimits','JobPids','job_members','sampled_member_absent','tree_memory'}
  h=types.ModuleType('_resource_fake_native');h.__dict__.update(ctypes=ns['ctypes'],wintypes=__import__('ctypes.wintypes',fromlist=['BOOL']))
  exec(compile(ast.Module(body=[n for n in t.body if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name in names],type_ignores=[]),str(source),'exec'),h.__dict__)
  calls=[];lists=[0];closed=[];sentinel=PermissionError('private/never-persisted');sentinel.winerror=5
  def query(job,kind,out,size,needed):
   calls.append(('query',kind))
   if kind==3:
    lists[0]+=1
    if failure=='members' or failure=='resample' and lists[0]>1:return 0
    pids=[] if absent and lists[0]>1 else [101]
    out._obj.assigned=out._obj.listed=len(pids)
    for i,pid in enumerate(pids):out._obj.pids[i]=pid
   elif kind==1:
    if failure=='cpu':return 0
    out._obj.TotalUserTime=10000000;out._obj.TotalKernelTime=0
   elif kind==9:
    if failure=='commit':return 0
    out._obj.peakJobMemoryUsed=4096
   else:self.fail('unexpected native operation')
   return 1
  def host(out):calls.append(('host',));out._obj.availablePhysical=out._obj.availablePageFile=2**40;return 0 if failure=='host' else 1
  def opened(mask,inherit,pid):calls.append(('open',mask));return 0 if failure in ('open','resample') or deny_vmread and mask&0x10 else 7
  def belongs(handle,job,out):calls.append(('belongs',));out._obj.value=not membership_false;return 0 if failure=='membership' else 1
  def memory(handle,out,size):
   calls.append(('memory',))
   if failure=='memory':return 0
   out._obj.workingSet=11;out._obj.privateUsage=13;return 1
  def close(handle):
   calls.append(('close',));closed.append(handle)
   if failure=='close':raise sentinel
   return 1
  h.kernel=types.SimpleNamespace(GlobalMemoryStatusEx=host,QueryInformationJobObject=query,OpenProcess=opened,IsProcessInJob=belongs,CloseHandle=close)
  h.psapi=types.SimpleNamespace(GetProcessMemoryInfo=memory)
  def cached():calls.append(('cached-error',));return 299
  directory=types.SimpleNamespace(st_mode=stat.S_IFDIR,st_file_attributes=0,st_size=0)
  regular=types.SimpleNamespace(st_mode=stat.S_IFREG,st_file_attributes=0,st_size=3)
  class Entry:
   path='invented/child'
   def stat(self,**kw):
    if failure=='entry':raise sentinel
    return regular
  class Scan:
   def __enter__(self):return iter([Entry()] if failure=='entry' else [])
   def __exit__(self,*a):return False
  def inspect_root(root):
   calls.append(('root-check',))
   if failure=='root':raise sentinel
   return directory
  def inspect(path):
   calls.append(('walk-stat',))
   if failure=='stat':raise sentinel
   return directory
  def scan(path):
   calls.append(('walk-scan',))
   if failure=='scan':raise sentinel
   return Scan()
  def walk(root,bytes,entries,**kw):
   kw.setdefault('observer',session.resource_observer);kw.setdefault('scope','workspace-v1' if root==ns['LEGACY_WORKSPACE'] else 'workspace-v2' if root==ns['SECOND_WORKSPACE'] else 'workspace-v3')
   return ns['owned_usage'](root,bytes,entries,inspect,scan,**kw)
  def study(bytes,entries,**kw):return ns['study_usage'](bytes,entries,usage=walk,inspect_root=inspect_root,**kw)
  def checked(path,root):
   calls.append(('checked',))
   if failure in ('log','result'):raise sentinel
   return regular
  def exists(path):return failure=='log' and path.name=='stderr.log' or failure=='result' and path.name=='result.json'
  def disk(path):
   calls.append(('disk',path))
   if failure==('drive-C' if path=='C:/' else 'drive-D'):raise sentinel
   return types.SimpleNamespace(free=2**40)
  session=ns['NativeSession'].__new__(ns['NativeSession']);session.helper=h;session.job=1;session.guardian=None
  session.phase_root=ns['WORKSPACE']/'train-cal';session.output=session.phase_root/'node-owned';session.workspace_snapshot=None;session.workspace_sampled_at=None
  session.resource_observer=ns['ResourceObserver']();session.stats={k:0 for k in ('peakRssBytes','peakPrivateBytes','peakJobMembers','peakCpuSeconds','peakStudyBytes','peakStudyEntries')}
  session.stats['jobEnumeration']=ns['enumeration_stats']();session.enumerator=ns['CompleteJobEnumeration'](h,lambda **kw:None,session.stats['jobEnumeration'])
  caps={'last_error':cached,'clock':lambda:0,'study_usage':study,'owned_usage':walk,'checked':checked,'exists':exists,'disk_usage':disk}
  return session,caps,calls,closed,sentinel,h
 def test_actual_assembled_resource_collector_success_and_exact_native_call_order(self):
  s,c,calls,closed,_,_=self.resource_fixture();r=s.raw_resources(c)
  self.assertEqual(set(r),set(self.diagnostic_modules()['guardian'].RESOURCE_KEYS));self.assertEqual((r['rssBytes'],r['privateBytes'],r['jobMembers']),(11,13,1));self.assertEqual(closed,[7]);self.assertIsNone(s.resource_observer.primary)
  self.assertEqual(calls[:7],[('host',),('query',3),('open',0x1000),('belongs',),('memory',),('close',),('query',1)]);self.assertEqual(calls[7],('query',9))
  self.assertEqual(sum(x==('query',3) for x in calls),1);self.assertNotIn(('cached-error',),calls)
  # Compare original exact helper algorithm API sequence; ONLY reviewed access
  # mask changes, and observations add no process/exit native calls.
  s,c,calls,closed,_,h=self.resource_fixture();old=h.tree_memory(1);old_calls=list(calls);calls.clear();closed.clear();new=ns['observed_tree_memory'](h,1,s.resource_observer,c['last_error'])
  self.assertEqual(old,new);self.assertEqual(old_calls,[('query',3),('open',0x1010),('belongs',),('memory',),('close',)]);self.assertEqual(calls,[('query',3),('open',0x1000),('belongs',),('memory',),('close',)])
 def test_query_limited_memory_permission_succeeds_without_vmread_fallback(self):
  s,c,calls,closed,_,h=self.resource_fixture(deny_vmread=True);self.refused('job-member-memory-unverifiable',lambda:h.tree_memory(1));self.assertEqual([x for x in calls if x[0]=='open'],[('open',0x1010)])
  calls.clear();self.assertEqual(ns['observed_tree_memory'](h,1,s.resource_observer,c['last_error']),(11,13,1));self.assertEqual([x for x in calls if x[0]=='open'],[('open',0x1000)]);self.assertIsNone(s.resource_observer.primary)
 def test_owned_memory_copy_preserves_original_native_error_sequences_and_absence_predicates(self):
  def outcome(action):
   try:return ('value',action())
   except Exception as error:return ('error',type(error),object.__getattribute__(error,'args'))
  def native_calls(rows):return [('open',0x1000) if row[0]=='open' else row for row in rows if row[0]!='cached-error']
  for failure in (None,'members','open','membership','memory','resample','close'):
   for absent in (False,True):
    a,ac,al,_,_,ah=self.resource_fixture(failure,absent=absent);b,bc,bl,_,_,bh=self.resource_fixture(failure,absent=absent)
    self.assertEqual(outcome(lambda:ah.tree_memory(1)),outcome(lambda:ns['observed_tree_memory'](bh,1,b.resource_observer,bc['last_error'])));self.assertEqual(native_calls(al),native_calls(bl))
  a,ac,al,_,_,ah=self.resource_fixture(membership_false=True);b,bc,bl,_,_,bh=self.resource_fixture(membership_false=True)
  self.assertEqual(outcome(lambda:ah.tree_memory(1)),outcome(lambda:ns['observed_tree_memory'](bh,1,b.resource_observer,bc['last_error'])));self.assertEqual(native_calls(al),native_calls(bl));self.assertNotIn(('cached-error',),bl)
 def test_assembled_resource_failures_label_actual_operation_and_preserve_original(self):
  rows={'host':('host-memory','global-memory'),'members':('job-members','job-members'),'open':('job-member-open','open-process'),'membership':('job-member-membership','membership'),'memory':('job-member-memory','process-memory'),'cpu':('job-cpu','cpu-accounting'),'commit':('job-commit','job-commit'),'root':('root-before','root-check'),'stat':('walk-stat','stat'),'scan':('walk-scan','scandir'),'entry':('walk-entry','entry-stat'),'log':('log-stat','stat'),'result':('result-stat','stat'),'drive-C':('drive-space','disk-usage'),'drive-D':('drive-space','disk-usage'),'close':('job-member-close','close-handle')}
  for kind,expected in rows.items():
   with self.subTest(kind=kind):
    s,c,calls,closed,sentinel,_=self.resource_fixture(kind)
    with self.assertRaises(Exception) as caught:s.raw_resources(c)
    d=s.resource_observer.primary;self.assertIsNotNone(d);self.assertEqual((d['stage'],d['operation']),expected);self.assertNotIn('private',ns['wire'](d).decode());self.assertLessEqual(len(ns['wire'](s.resource_diagnostic())),1024)
    if kind in ('root','stat','scan','entry','log','result','drive-C','drive-D','close'):self.assertIs(caught.exception,sentinel)
    if kind in ('open','membership','memory'):
     i=calls.index(('cached-error',));self.assertEqual(calls[i+1],('query',3));self.assertEqual(d['code'],'partial-copy')
    if kind in ('membership','memory','close'):self.assertEqual(closed,[7])
 def test_membership_false_is_semantic_no_cached_error_and_absence_only_skip(self):
  s,c,calls,closed,_,_=self.resource_fixture(membership_false=True);self.refused('opened-process-not-confirmed-in-own-job',lambda:s.raw_resources(c));self.assertEqual(s.resource_observer.primary['code'],'membership-false');self.assertNotIn(('cached-error',),calls);self.assertEqual(closed,[7])
  for kind in ('open','membership','memory'):
   s,c,calls,closed,_,_=self.resource_fixture(kind,absent=True);r=s.raw_resources(c);self.assertEqual((r['rssBytes'],r['privateBytes']),(0,0));self.assertIsNone(s.resource_observer.primary);self.assertEqual(sum(x==('query',3) for x in calls),2);self.assertEqual(closed,[] if kind=='open' else [7])
  s,c,calls,closed,_,_=self.resource_fixture('resample');self.refused('job-pid-list-unverifiable-or-overflow',lambda:s.raw_resources(c));self.assertEqual(s.resource_observer.primary,{'stage':'job-members','scope':'own-job','operation':'resample-members','family':'runtime','code':'job-pid-list-unverifiable-or-overflow'});self.assertEqual(calls[:5],[('host',),('query',3),('open',0x1000),('cached-error',),('query',3)])
 def test_resource_primary_cleanup_slots_unknown_hooks_and_projector_failures(self):
  s,c,calls,closed,_,_=self.resource_fixture('memory');self.refused('job-member-memory-unverifiable',lambda:s.raw_resources(c));first=copy.deepcopy(s.resource_observer.primary)
  s.resource_observer.in_cleanup=True;s.helper.kernel.GlobalMemoryStatusEx=lambda _:0;self.refused('host-memory',lambda:s.raw_resources(c));self.assertEqual(s.resource_observer.primary,first);self.assertEqual(s.resource_observer.cleanup['stage'],'host-memory');self.assertLessEqual(len(ns['wire'](s.resource_diagnostic())),1024)
  hooks=[]
  class Hostile(RuntimeError):
   def __getattribute__(self,key):hooks.append(key);raise AssertionError('no attributes')
   def __str__(self):hooks.append('str');raise AssertionError('no strings')
  class SubPermission(PermissionError):pass
  for error in (Hostile('secret'),RuntimeError('secret'),RuntimeError('owned-tree','secret'),SubPermission('secret')):self.assertEqual(ns['resource_error'](error),('unclassified','unclassified'))
  self.assertEqual(hooks,[])
  for code,label in ns['RESOURCE_OS_CODES'].items():
   e=PermissionError('secret');e.winerror=code;self.assertEqual(ns['resource_error'](e),('os',label))
  for code in (True,'5',2**40):
   e=OSError('secret');e.winerror=code;self.assertEqual(ns['resource_error'](e),('os','other'))
  original=ns['project_collector_observation'];sentinel=RuntimeError('secret')
  try:
   ns['project_collector_observation']=lambda _:(_ for _ in ()).throw(AssertionError('projection'))
   o=ns['ResourceObserver']()
   with self.assertRaises(RuntimeError) as caught:o.call('walk-stat','workspace-v3','stat',lambda:(_ for _ in ()).throw(sentinel))
   self.assertIs(caught.exception,sentinel);self.assertIsNone(o.primary)
  finally:ns['project_collector_observation']=original
 def test_actual_collector_guardian_join_and_total_closed_observation_bound(self):
  s,c,_,_,_,_=self.resource_fixture('memory');module=self.diagnostic_modules()['guardian']
  node={'pid':101,'creationFileTime':'134000000000000001','imagePathHash':'a'*64,'pathEncoding':'win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1'}
  good={k:0 for k in module.RESOURCE_KEYS};good.update(hostPhysicalFree=2**40,hostCommitFree=2**40,cFree=2**40,dFree=2**40)
  config={'phase':'train-cal','freezeHash':'c'*64,'manifestHash':'d'*64,'nodeIdentityHash':module.digest(node),'sourceMapHash':'e'*64,'batchIds':[hashlib.sha256(str(i).encode()).hexdigest() for i in range(24)],'node':node,'console':None}
  g=module.PhaseGuardian(config,{'clock':lambda:0,'resources':lambda:good,'members':lambda:[node],'census':lambda:[node],'recheck':lambda _:True,'publish':lambda *a:None})
  s.guardian=g;g.cap['resources']=lambda:s.raw_resources(c)
  with self.assertRaises(module.GuardianFailure) as caught:g.check()
  self.assertEqual(caught.exception.code,'resources');d=s.resource_diagnostic();self.assertEqual(d['collectorPrimary']['stage'],'job-member-memory');self.assertEqual(d['guardian'],{'stage':'collect','field':None,'family':'unclassified','code':'unclassified'});self.assertIsNone(d['collectorCleanup']);self.assertLessEqual(len(ns['wire'](d)),1024)
  d['collectorPrimary']['code']='secret';self.assertEqual(s.resource_observer.primary['code'],'partial-copy')
  row={'stage':max(ns['RESOURCE_STAGES'],key=len),'scope':max(ns['RESOURCE_SCOPES'],key=len),'operation':max(ns['RESOURCE_OPERATIONS'],key=len),'family':'runtime','code':max(ns['RESOURCE_RUNTIME_CODES'],key=len)}
  s.resource_observer.primary=dict(row);s.resource_observer.cleanup=dict(row);self.assertLessEqual(len(ns['wire'](s.resource_diagnostic())),1024)
 def test_tolerated_disappearing_descendants_do_not_consume_observer(self):
  o=ns['ResourceObserver']();directory=types.SimpleNamespace(st_mode=stat.S_IFDIR,st_file_attributes=0)
  class Entry:
   path='root/gone'
   def stat(self,**kw):raise FileNotFoundError()
  class Scan:
   def __enter__(self):return iter([Entry()])
   def __exit__(self,*a):return False
  self.assertEqual(ns['owned_usage']('root',100,10,lambda _:directory,lambda _:Scan(),observer=o),(0,1));self.assertIsNone(o.primary)
  self.assertEqual(tuple(ns['STUDY_WORKSPACES']),(ns['LEGACY_WORKSPACE'],ns['SECOND_WORKSPACE'],ns['THIRD_WORKSPACE'],ns['FOURTH_WORKSPACE'],ns['FIFTH_WORKSPACE'],ns['SIXTH_WORKSPACE'],ns['SEVENTH_WORKSPACE'],ns['EIGHTH_WORKSPACE'],ns['NINTH_WORKSPACE'],ns['TENTH_WORKSPACE'],ns['ELEVENTH_WORKSPACE'],ns['TWELFTH_WORKSPACE'],ns['THIRTEENTH_WORKSPACE'],ns['FOURTEENTH_WORKSPACE'],ns['DIAGNOSTIC_V1_WORKSPACE'],ns['DIAGNOSTIC_V2_WORKSPACE'],ns['WORKSPACE']))
 def audit_fixture(self):
  h=lambda text:hashlib.sha256(text.encode()).hexdigest();frozen={k:h(k) for k in ('freezeHash','panelIdentity','manifestHash','recipeHash')};freeze_sha=h('freeze-file');source_map=h('source-map');node=h('train-node')
  selected={'schema':'native-specificity-selected-detail/v1','panelIdentity':frozen['panelIdentity'],'manifestHash':frozen['manifestHash'],'producerRecipeHash':frozen['recipeHash'],'rootReuseReceiptHash':h('root-reuse'),'rootTransferHash':h('root-transfer'),'inputLedgerHash':h('input-ledger'),'referencePacket':{'packetHash':h('packet'),'artifactHash':h('artifact')}}
  selected['selectionIdentity']=ns['sha'](ns['wire'](selected));selection_raw=ns['wire'](selected)
  composition={'schema':'native-specificity-phase-composition/v1','phase':'train-cal','manifestHash':frozen['manifestHash'],'sourceAssetEndchecksPassed':True,'normalEncoderClosed':True,'productionValidated':False,'assignmentAuthority':False,'capture':{'accounted':96,'captureHash':h('capture')},'encoding':{'encoderCalls':192,'rawTextRetained':False},'receipts':[h('batch'+str(i)) for i in range(24)],'semantic':{'status':'selected-pending-independent-audit','accounted':96,'referenceCount':1,'calibrationSelections':1,'selectionIdentity':selected['selectionIdentity'],'packetHash':h('packet'),'artifactHash':h('artifact'),'testAllowed':False}}
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
  result=ns['strict'](data['audit:train-result']);result['selectionSha256']=ns['sha'](selection_raw);result['result']['numericDiagnostic']={'calibrationMs':'V8_FINITE_NUMBER'}
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
 def enum_fixture(self,rows):
  s,c,calls,closed,_,h=self.resource_fixture();events=[];queue=list(rows);fences=[]
  class Buffer(h.JobPids):
   def __getattribute__(self,key):
    if key=='pids':
     if self.assigned!=self.listed:raise AssertionError('incomplete prefix read')
     events.append('prefix')
    return super().__getattribute__(key)
  h.JobPids=Buffer
  def query(job,kind,out,size,returned):
   self.assertEqual((job,kind,size,returned),(1,3,1032,None));events.append('query');row=queue.pop(0);out._obj.assigned=row.get('assigned',0);out._obj.listed=row.get('listed',0)
   for i,pid in enumerate(row.get('pids',[])):
    ns['ctypes'].c_size_t.from_address(ns['ctypes'].addressof(out._obj)+8+i*8).value=pid
   if 'after' in row:row['after']()
   return row.get('ok',1)
  h.kernel.QueryInformationJobObject=query
  def fence(**kw):events.append('fence');fences.append(kw)
  stats=ns['enumeration_stats']();adapter=ns['CompleteJobEnumeration'](h,fence,stats)
  return adapter,stats,events,fences,queue
 def test_complete_adapter_retries_only_discarded_incomplete_samples(self):
  for rows,physical in [([{'assigned':2,'listed':1,'pids':[999]},{'assigned':1,'listed':1,'pids':[7]}],2),([{'assigned':1,'listed':2},{'assigned':3,'listed':1},{'assigned':0,'listed':0}],3)]:
   adapter,stats,events,fences,queue=self.enum_fixture(rows);value=adapter.query(1,until=9.)
   self.assertEqual(stats,{'schema':'native-specificity-job-enumeration/v1','logicalObservations':1,'physicalQueries':physical,'retryQueries':physical-1,'firstMismatch':{'assigned':rows[0]['assigned'],'listed':rows[0]['listed']}})
   self.assertEqual(events,['fence','query','fence']*physical+['prefix']);self.assertTrue(all(v=={'cleanup':False,'until':9.} for v in fences));self.assertEqual(queue,[])
 def test_complete_adapter_terminal_cases_sticky_no_retry_or_prefix(self):
  for row,code in [({'ok':0},'job-pid-list-unverifiable-or-overflow'),({'assigned':129,'listed':0},'job-pid-capacity'),({'assigned':128,'listed':127},'job-pid-capacity'),({'assigned':127,'listed':128},'job-pid-capacity'),({'assigned':1,'listed':1,'pids':[0]},'job-pid-prefix'),({'assigned':2,'listed':2,'pids':[1,1]},'job-pid-prefix')]:
   a,stats,events,_,q=self.enum_fixture([row]);self.refused(code,lambda:a.query(1));first=a.failure;before=list(events);self.refused(code,lambda:a.query(1));self.assertIs(a.failure,first);self.assertEqual(events,before);self.assertEqual(stats['physicalQueries'],1)
  a,stats,events,_,q=self.enum_fixture([{'assigned':2,'listed':1}]*3);self.refused('job-pid-capacity',lambda:a.query(1));self.assertEqual(stats['physicalQueries'],3);self.assertEqual(stats['retryQueries'],2);self.assertNotIn('prefix',events)
  a,stats,events,_,q=self.enum_fixture([{'assigned':128,'listed':128,'pids':list(range(1,129))}]);self.assertEqual(a.query(1).listed,128);self.assertIsNone(stats['firstMismatch']);self.assertEqual(stats['retryQueries'],0)
 def test_complete_adapter_fences_before_after_and_preserves_single_deadline(self):
  a,stats,events,_,q=self.enum_fixture([{'assigned':2,'listed':1}]);now=[0.]
  def fence(**kw):
   events.append('fence');ns['require'](now[0]<1.,'census-deadline')
  a.fence=fence;q[0]['after']=lambda:now.__setitem__(0,1.)
  self.refused('census-deadline',lambda:a.query(1));self.assertEqual(stats['physicalQueries'],1);self.assertEqual(events,['fence','query','fence']);self.assertNotIn('prefix',events)
  a,stats,events,_,q=self.enum_fixture([{}]);a.fence=lambda **kw:ns['refuse']('phase-deadline');self.refused('phase-deadline',lambda:a.query(1));self.assertEqual(stats['logicalObservations'],0);self.assertEqual(events,[])
 def test_complete_adapter_cleanup_can_query_after_sticky_work_failure(self):
  a,stats,events,_,q=self.enum_fixture([{'ok':0},{'assigned':0,'listed':0}]);self.refused('job-pid-list-unverifiable-or-overflow',lambda:a.query(1));first=a.failure
  self.assertEqual(a.query(1,cleanup=True,until=4.).listed,0);self.assertIs(a.failure,first);self.assertEqual(stats['logicalObservations'],2)
 def test_noncollecting_fence_all_applicable_deadlines_and_cleanup_lane(self):
  s=ns['NativeSession'].__new__(ns['NativeSession']);s.started=0.;s.phase_active=9420;s.phase='train-cal';s.failure=None;s.enumeration_until=None;s.bootstrap_until=None;s.cleanup_until=None;s.frame_until=None;s.guardian=None;s.model_clock=None
  s.raw_guard=lambda *a,**k:self.fail('recursive guard');s.raw_resources=lambda:self.fail('recursive resource');old=ns['time'];now=[1.];ns['time']=types.SimpleNamespace(monotonic=lambda:now[0]);self.addCleanup(lambda:ns.update(time=old))
  s.enumeration_fence();s.enumeration_until=1.;self.refused('census-deadline',s.enumeration_fence);s.failure='owner-failure';s.frame_until=0.;s.bootstrap_until=0.;s.cleanup_until=3.;s.enumeration_fence(cleanup=True)
  now[0]=3.;self.refused('own-cleanup-deadline',lambda:s.enumeration_fence(cleanup=True));s.cleanup_until=None;now[0]=9480.;self.refused('phase-deadline',lambda:s.enumeration_fence(cleanup=True))
  s.failure=None;s.frame_until=None;s.bootstrap_until=None;s.enumeration_until=None;now[0]=2.;s.model_clock=(0.,'checks',0.);now[0]=60.;self.refused('model-stage-deadline',s.enumeration_fence)
 def test_actual_memory_absence_and_census_consumers_use_complete_adapter(self):
  s,c,calls,closed,_,h=self.resource_fixture('open',absent=True);s.raw_resources(c);self.assertEqual(s.stats['jobEnumeration']['logicalObservations'],2);self.assertIsNone(s.resource_observer.primary)
  s,c,calls,closed,_,h=self.resource_fixture();s.raw_guard=lambda:None;s.enumeration_until=None;s.policy=types.SimpleNamespace(accept=lambda row:None,final=lambda result:None)
  def census(job,**kw):
   self.assertIs(kw['list_members'].__self__,s);self.assertEqual(kw['list_members'](job),[101]);self.assertIsNotNone(s.enumeration_until);return {'livePids':[101]}
  s.helper.process_belongs=lambda *a:True;s.census=types.SimpleNamespace(inspect_growing_job=census);self.assertEqual(s.sample(),{'livePids':[101]});self.assertIsNone(s.enumeration_until)
 def test_assembled_resource_retry_discards_unknown_prefix_before_open(self):
  s,c,calls,closed,_,h=self.resource_fixture();original=h.kernel.QueryInformationJobObject;opened=h.kernel.OpenProcess;counts=[0];pids=[]
  def query(job,kind,out,size,returned):
   if kind==3 and counts[0]==0:
    counts[0]+=1;calls.append(('incomplete',));out._obj.assigned=2;out._obj.listed=1;out._obj.pids[0]=999;return 1
   return original(job,kind,out,size,returned)
  h.kernel.QueryInformationJobObject=query;h.kernel.OpenProcess=lambda mask,inherit,pid:(pids.append(pid) or opened(mask,inherit,pid));s.raw_resources(c)
  self.assertEqual(pids,[101]);self.assertEqual(s.stats['jobEnumeration'],{'schema':'native-specificity-job-enumeration/v1','logicalObservations':1,'physicalQueries':2,'retryQueries':1,'firstMismatch':{'assigned':2,'listed':1}})
 def cleanup_fixture(self,lists):
  s=ns['NativeSession'].__new__(ns['NativeSession']);events=[];queue=list(lists);s.started=0.;s.phase_active=60;s.resource_observer=ns['ResourceObserver']();s.helper=types.SimpleNamespace(kernel=types.SimpleNamespace(TerminateJobObject=lambda *a:(events.append('kill') or 1),CloseHandle=lambda h:(events.append(('close',h)) or 1)))
  s.job=1;s.assigned=True;s.emergency=False;s.original=2;s.launch_handle=None;s.reader=None;s.writers=[];s.pending_physical=set();s.output_handles=[]
  child=types.SimpleNamespace(stdin=None,stdout=None,returncode=0,poll=lambda:0,wait=lambda **kw:events.append('wait'));s.child=child
  def members(job,**kw):
   self.assertTrue(kw['cleanup']);events.append('members');v=queue.pop(0)
   if isinstance(v,Exception):raise v
   return v
  s.member_ids=members;return s,events
 def test_cleanup_unknown_list_cannot_bypass_own_job_termination_and_closes(self):
  old=ns['time'];ns['time']=types.SimpleNamespace(monotonic=lambda:1.,sleep=lambda _:None);self.addCleanup(lambda:ns.update(time=old))
  fault=RuntimeError('job-pid-capacity');s,events=self.cleanup_fixture([fault,[],[]]);self.refused('job-pid-capacity',s.close);self.assertTrue(s.emergency);self.assertLess(events.index('kill'),events.index('wait'));self.assertEqual(events[-2:],[('close',2),('close',1)]);self.assertIsNone(s.job)
  s,events=self.cleanup_fixture([[],fault,[]]);self.refused('job-pid-capacity',s.close);self.assertIn('kill',events);self.assertIn('wait',events)
 def test_detached_actual_popen_and_no_old_enumerator_default_calls(self):
  cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='NativeSession');start=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='start');call=next(n for n in ast.walk(start) if isinstance(n,ast.Call) and ast.unparse(n.func)=='subprocess.Popen')
  self.assertEqual(ast.literal_eval(next(k.value for k in call.keywords if k.arg=='creationflags')),8);self.assertIs(ast.literal_eval(next(k.value for k in call.keywords if k.arg=='shell')),False)
  self.assertNotIn('self.helper.member_ids(',ast.unparse(cls));self.assertNotIn('h.member_ids(',ast.unparse(cls));self.assertNotIn('sampled_member_absent(',ast.unparse(cls));self.assertNotIn('OpenProcess',ast.unparse(next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='CompleteJobEnumeration')))
 def test_actual_read_result_no_reference_null_and_file_presence_contract(self):
  frozen,_,_,_,data=self.audit_fixture();value=ns['strict_node_json'](data['audit:train-result']);startup={k:value[k] for k in ('sourceMapHash','nodeIdentityHash','readySha256','startupAckSha256','baselineHash')};value['selectionSha256']=None;value['result']['semantic']={'status':'no-reference-set','accounted':96,'referenceCount':0,'calibrationSelections':0,'testAllowed':False};raw=ns['wire'](value)
  s=ns['NativeSession'].__new__(ns['NativeSession']);s.phase='train-cal';s.frozen=frozen;s.guarded=lambda:None;s.startup_bindings=lambda:startup;s.service=types.SimpleNamespace(accept_checkpoint=lambda *a:None)
  class Output:
   def __init__(self,present=()):self.present=present
   def __truediv__(self,name):
    def lstat():
     if name not in self.present:raise FileNotFoundError()
     return types.SimpleNamespace(st_mode=stat.S_IFLNK,st_file_attributes=0x400)
    return types.SimpleNamespace(lstat=lstat,exists=lambda:False)
  s.output=Output();s.read_control=lambda name,cap:raw if name=='result.json' else self.fail('no selection read');self.assertEqual(s.read_result(),(raw,None));self.assertEqual(len(value['result']['receipts']),24)
  for name in ('selection.json','selection.json.pending'):
   s.output=Output((name,));self.refused('unexpected-selection',s.read_result)
  class Denied:
   def __truediv__(self,name):return types.SimpleNamespace(lstat=lambda:(_ for _ in ()).throw(PermissionError('never persist')))
  s.output=Denied();self.assertRaises(PermissionError,s.read_result)
  for key,bad in [('referenceCount',1),('calibrationSelections',1),('accounted',95),('testAllowed',True),('referenceCount',False)]:
   semantic=dict(value['result']['semantic']);semantic[key]=bad;r={**value['result'],'semantic':semantic};self.refused('selection-semantic',lambda:ns['validate_selection_semantics'](r,'train-cal',None))
  r=copy.deepcopy(value['result']);r['semantic']['extra']=True;self.refused('schema',lambda:ns['validate_selection_semantics'](r,'train-cal',None));self.refused('selection-semantic',lambda:ns['validate_selection_semantics'](value['result'],'train-cal','a'*64))
 def test_selected_semantics_file_hash_identity_packet_and_artifact_join(self):
  frozen,_,_,_,data=self.audit_fixture();value=ns['strict_node_json'](data['audit:train-result']);selected=ns['strict_node_json'](data['audit:train-selection']);semantic=value['result']['semantic'];ns['validate_selection_semantics'](value['result'],'train-cal',value['selectionSha256'],selected)
  for key in ('selectionIdentity','packetHash','artifactHash'):
   altered=copy.deepcopy(selected)
   if key=='selectionIdentity':altered[key]='f'*64
   else:altered['referencePacket'][key]='f'*64
   self.refused('selection-semantic',lambda:ns['validate_selection_semantics'](value['result'],'train-cal',value['selectionSha256'],altered))
  self.refused('selection-semantic',lambda:ns['validate_selection_semantics'](value['result'],'train-cal',None,selected));self.refused('selection-phase',lambda:ns['validate_selection_semantics']({},'test','a'*64))
 def test_final_report_enumeration_includes_cleanup_after_outcome_snapshot(self):
  saved={k:ns[k] for k in ('NativeSession','publish')};reports=[]
  class Session:
   def __init__(self,*a):
    self.modules={};self.failure=None;self.emergency=False;self.policy=None;self.child=None;self.stats={'jobEnumeration':ns['enumeration_stats']()};self.phase_active=60;self.phase_root=types.SimpleNamespace(exists=lambda:False);self.resource_observer=ns['ResourceObserver']()
   def run(self):return {'resultSha256':None,'selectionSha256':None,'guardianComplete':None,'stats':{'jobEnumeration':ns['enumeration_stats']()}}
   def close(self):self.stats['jobEnumeration'].update(logicalObservations=2,physicalQueries=3,retryQueries=1,firstMismatch={'assigned':2,'listed':1});return True
  ns['NativeSession']=Session
  old_wire=ns['wire']
  def wire(value):
   if type(value) is dict and value.get('schema')=='native-specificity-study-supervisor/v1':reports.append(copy.deepcopy(value))
   return old_wire(value)
  ns['wire']=wire
  try:
   self.assertEqual(ns['run_session']('prepare',0,{}, {},'a'*64,'b'*64,None),0);self.assertEqual(reports[-1]['stats']['jobEnumeration']['physicalQueries'],3);self.assertEqual(reports[-1]['stats']['jobEnumeration']['retryQueries'],1)
  finally:ns.update(saved);ns['wire']=old_wire
 def test_adr200_assignment_binds_original_before_assign_and_retains_edges(self):
  for changed in ('none','pid','creation','image','fence'):
   s=ns['NativeSession'].__new__(ns['NativeSession']);s.launch_handle=42;s.child=types.SimpleNamespace(pid=7);s.job=1;s.original=None;s.assigned=False;calls=[]
   def identity(handle):
    d={'pid':7,'creationFiletime':'1','imagePathSha256':'a'*64,'imagePathHashEncoding':'fixed'}
    if handle==43:
     if changed=='pid':d['pid']=8
     if changed=='creation':d['creationFiletime']='2'
     if changed=='image':d['imagePathSha256']='b'*64
    return d
   s.identify=identity
   fence_calls=[0]
   def fence():
    fence_calls[0]+=1
    if changed=='fence' and fence_calls[0]==2:raise RuntimeError('original-fence')
   s.bootstrap_guard=fence
   def belongs(handle,job,value):value._obj.value=1;return 1
   k=types.SimpleNamespace(OpenProcess=lambda *a:43,AssignProcessToJobObject=lambda *a:calls.append('assign') or 1,IsProcessInJob=belongs)
   action=lambda:s.assign_owned_original(k,{'imagePathSha256':'a'*64})
   if changed=='none':self.assertEqual(action(),identity(42));self.assertTrue(s.assigned);self.assertEqual(calls,['assign'])
   else:self.assertRaises(RuntimeError,action);self.assertFalse(s.assigned);self.assertEqual(calls,[])
   self.assertEqual(s.original,43);self.assertEqual(s.launch_handle,42)
  cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='NativeSession');start=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='start');body=ast.unparse(start)
  self.assertLess(body.index('self.child = subprocess.Popen'),body.index('self.launch_handle = self.child._handle'))
  self.assertLess(body.index('self.launch_handle = self.child._handle'),body.index('self.assign_owned_original'))
  self.assertNotIn('CloseHandle(self.launch_handle)',ast.unparse(cls));self.assertNotIn('self.launch_handle.Detach',ast.unparse(cls))
 def test_adr200_cleanup_joins_before_any_buffer_close(self):
  old=ns['time'];ns['time']=types.SimpleNamespace(monotonic=lambda:1.,sleep=lambda _:None);self.addCleanup(lambda:ns.update(time=old))
  s,events=self.cleanup_fixture([[],[],[]]);s.child.stdin=types.SimpleNamespace(close=lambda:events.append('stdin-close'));s.child.stdout=types.SimpleNamespace(close=lambda:events.append('stdout-close'))
  s.reader=types.SimpleNamespace(join=lambda **kw:events.append('reader-join'),is_alive=lambda:False)
  s.writers=[types.SimpleNamespace(join=lambda **kw:events.append('writer-join'),is_alive=lambda:False)]
  self.assertTrue(s.close());self.assertLess(events.index('reader-join'),events.index('stdin-close'));self.assertLess(events.index('writer-join'),events.index('stdout-close'))
 def test_adr200_unsettled_reader_writer_or_original_never_closes_streams(self):
  old=ns['time'];ns['time']=types.SimpleNamespace(monotonic=lambda:1.,sleep=lambda _:None);self.addCleanup(lambda:ns.update(time=old))
  for pending in ('reader','writer','physical'):
   s,events=self.cleanup_fixture([[],[],[]]);s.child.stdin=types.SimpleNamespace(close=lambda:events.append('stdin-close'));s.child.stdout=types.SimpleNamespace(close=lambda:events.append('stdout-close'))
   thread=types.SimpleNamespace(join=lambda **kw:events.append('join'),is_alive=lambda:True)
   if pending=='reader':s.reader=thread
   elif pending=='writer':s.writers=[thread]
   else:s.pending_physical.add(object())
   self.assertRaises(RuntimeError,s.close);self.assertNotIn('stdin-close',events);self.assertNotIn('stdout-close',events)
 def test_adr200_preassignment_cleanup_terminates_only_original_popen(self):
  old=ns['time'];ns['time']=types.SimpleNamespace(monotonic=lambda:1.,sleep=lambda _:None);self.addCleanup(lambda:ns.update(time=old))
  s,events=self.cleanup_fixture([[],[],[]]);s.assigned=False;s.original=43;alive=[True]
  class OwnerHandle(int):
   def Close(self):events.append(('owner-close',int(self)))
  s.launch_handle=OwnerHandle(42)
  s.child.poll=lambda:None if alive[0] else 0
  def kill():events.append(('kill-original',s.launch_handle));alive[0]=False
  s.child.kill=kill
  self.assertTrue(s.close());self.assertIn(('kill-original',42),events);self.assertIn(('close',43),events);self.assertNotIn(('close',42),events);self.assertEqual(events.count(('owner-close',42)),1)
 def test_adr200_dead_original_with_live_job_still_terminates_job(self):
  old=ns['time'];ns['time']=types.SimpleNamespace(monotonic=lambda:1.,sleep=lambda _:None);self.addCleanup(lambda:ns.update(time=old))
  s,events=self.cleanup_fixture([[99],[],[]]);self.assertTrue(s.close());self.assertTrue(s.emergency);self.assertIn('kill',events)
 def test_adr201_seventeen_roots_fresh_absence_and_diagnostic_labels(self):
  walked=[];directory=types.SimpleNamespace(st_mode=stat.S_IFDIR)
  self.assertEqual(ns['study_usage'](100,100,usage=lambda root,*a,**k:(walked.append(root) or (1,1)),inspect_root=lambda root:directory,exists=lambda root:root!=ns['WORKSPACE'],allow_fresh_absent=True),(16,16))
  self.assertEqual(walked,list(ns['STUDY_WORKSPACES'])[:-1])
  self.assertEqual(len(ns['STUDY_WORKSPACES']),17);self.assertEqual(ns['workspace_scope'](ns['FOURTEENTH_WORKSPACE']),'workspace-v14');self.assertEqual(ns['workspace_scope'](ns['WORKSPACE']),'workspace-v15')
  def missing_old(root):
   if root==ns['FOURTEENTH_WORKSPACE']:raise FileNotFoundError()
   return directory
  self.assertRaises(FileNotFoundError,lambda:ns['study_usage'](100,100,usage=lambda *a,**k:(0,0),inspect_root=missing_old,exists=lambda root:root!=ns['WORKSPACE'],allow_fresh_absent=True))
  for root,label in [(ns['DIAGNOSTIC_V1_WORKSPACE'],'diagnostic-v1'),(ns['DIAGNOSTIC_V2_WORKSPACE'],'diagnostic-v2')]:
   self.assertEqual(ns['workspace_scope'](root),label);self.assertEqual(len(ns['evidence_exclusions'](root)),8)
   def inspect(path):
    if path==root:raise FileNotFoundError()
    return directory
   self.assertRaises(FileNotFoundError,lambda:ns['study_usage'](100,100,usage=lambda *a,**k:(0,0),inspect_root=inspect,exists=lambda root:False,allow_fresh_absent=True))
 def test_adr200_fresh_absence_grant_never_applies_to_default_active_or_reserve(self):
  directory=types.SimpleNamespace(st_mode=stat.S_IFDIR)
  def inspect(root):
   if root==ns['WORKSPACE']:raise FileNotFoundError()
   return directory
  args={'usage':lambda *a,**k:(0,0),'inspect_root':inspect,'exists':lambda root:root!=ns['WORKSPACE']}
  self.assertRaises(FileNotFoundError,lambda:ns['study_usage'](100,100,**args))
  self.assertEqual(ns['study_usage'](100,100,**args,allow_fresh_absent=True),(0,0))
  self.assertRaises(FileNotFoundError,lambda:ns['report_reserve'](1,**args))
  for value in (0,1,None,'true'):
   self.refused('workspace-absence-grant',lambda:ns['study_usage'](100,100,**args,allow_fresh_absent=value))
  s,c,*rest=self.resource_fixture()
  c['study_usage']=lambda *a,**kw:ns['study_usage'](*a,**kw,**args)
  self.assertRaises(FileNotFoundError,lambda:s.raw_resources(c))
 def test_adr200_owner_launch_close_after_joins_handles_and_latched_exit(self):
  old=ns['time'];ns['time']=types.SimpleNamespace(monotonic=lambda:1.,sleep=lambda _:None);self.addCleanup(lambda:ns.update(time=old))
  for fail in (False,True):
   s,events=self.cleanup_fixture([[],[],[]])
   class OwnerHandle:
    def Close(self):
     events.append('owner-close')
     if fail:raise RuntimeError('owned-launch-close')
   s.launch_handle=OwnerHandle();s.reader=types.SimpleNamespace(join=lambda **kw:events.append('join'),is_alive=lambda:False)
   if fail:self.refused('owned-launch-close',s.close)
   else:self.assertTrue(s.close());self.assertIsNone(s.launch_handle)
   self.assertEqual(events.count('owner-close'),1);self.assertLess(events.index('join'),events.index('owner-close'));self.assertLess(events.index(('close',1)),events.index('owner-close'))
  report=ast.unparse(next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='run_session'))
  self.assertNotIn('session.child.poll()',report);self.assertIn('session.child.returncode',report)
 def test_adr200_later_unknown_membership_is_independent_of_emergency_flag(self):
  old=ns['time'];ns['time']=types.SimpleNamespace(monotonic=lambda:1.,sleep=lambda _:None);self.addCleanup(lambda:ns.update(time=old))
  s,events=self.cleanup_fixture([[],RuntimeError('unknown'),[]]);s.assigned=False;alive=[True]
  s.child.poll=lambda:None if alive[0] else 0
  def original_kill():events.append('kill-original');alive[0]=False
  s.child.kill=original_kill
  self.refused('unknown',s.close);self.assertLess(events.index('kill-original'),events.index('kill'));self.assertTrue(s.emergency)
 def test_adr200_original_cleanup_deadline_rechecked_after_join(self):
  old=ns['time'];now=[1.];ns['time']=types.SimpleNamespace(monotonic=lambda:now[0],sleep=lambda _:None);self.addCleanup(lambda:ns.update(time=old))
  for phase in ('before','after'):
   now[0]=1.;s,events=self.cleanup_fixture([[],[],[]]);s.child.stdin=types.SimpleNamespace(close=lambda:events.append('stdin-close'))
   members=s.member_ids;calls=[0]
   def sampled(*a,**k):
    result=members(*a,**k);calls[0]+=1
    if phase=='before' and calls[0]==3:now[0]=62.
    return result
   s.member_ids=sampled
   def join(**kw):events.append('join');now[0]=62.
   s.reader=types.SimpleNamespace(join=join,is_alive=lambda:False)
   self.refused('own-cleanup-deadline',s.close);self.assertNotIn('stdin-close',events);self.assertEqual('join' in events,phase=='after')
 def test_adr200_missing_inspection_still_requires_original_exit_and_owner_close(self):
  old=ns['time'];ns['time']=types.SimpleNamespace(monotonic=lambda:1.,sleep=lambda _:None);self.addCleanup(lambda:ns.update(time=old))
  s,events=self.cleanup_fixture([[],[],[]]);s.original=None;s.assigned=False;alive=[True];s.child.returncode=None
  s.child.poll=lambda:None if alive[0] else 0
  s.child.kill=lambda:(events.append('kill-original'),alive.__setitem__(0,False))
  s.child.wait=lambda **kw:(events.append('wait'),setattr(s.child,'returncode',0))
  class OwnerHandle:
   def Close(self):events.append('owner-close')
  s.launch_handle=OwnerHandle();self.assertTrue(s.close());self.assertLess(events.index('kill-original'),events.index('wait'));self.assertLess(events.index('wait'),events.index('owner-close'))
 def test_adr200_late_owner_close_cannot_claim_cleanup_success(self):
  old=ns['time'];now=[1.];ns['time']=types.SimpleNamespace(monotonic=lambda:now[0],sleep=lambda _:None);self.addCleanup(lambda:ns.update(time=old))
  s,events=self.cleanup_fixture([[],[],[]])
  class OwnerHandle:
   def Close(self):events.append('owner-close');now[0]=62.
  s.launch_handle=OwnerHandle();self.refused('own-cleanup-deadline',s.close);self.assertIsNone(s.launch_handle);self.assertEqual(events.count('owner-close'),1)
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
