import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

// Exported verbatim for a separate python -B -c run when the offline guard
// intentionally refuses Node child creation. Only this source is read by Python.
export const PYTHON_AST_TEST=String.raw`
import ast, pathlib, copy, hashlib, unittest
path=pathlib.Path('spikes/topic-resolution/harness/experimental/native-specificity-study-v3/guardian.py')
tree=ast.parse(path.read_text(encoding='utf-8'))
assert all(isinstance(n,(ast.Import,ast.ImportFrom,ast.FunctionDef,ast.ClassDef,ast.Assign,ast.Expr)) for n in tree.body)
assert not any(isinstance(n,ast.Call) for s in tree.body if isinstance(s,ast.Expr) for n in ast.walk(s))
ns={'__name__':'_adr179_guardian_ast_test'}
exec(compile(tree,str(path),'exec'),ns)
G=ns['PhaseGuardian']; F=ns['GuardianFailure']; C=ns['canonical']; D=ns['digest']
class Fixture:
 def __init__(self,phase='test',console=False):
  self.now=0.;self.cpu=0.;self.calls=[];self.member_rows=[];self.recheck_action=lambda:None;self.publish_action=lambda:None;self.resource_action=lambda:None
  self.node={'pid':101,'creationFileTime':'134000000000000001','imagePathHash':'a'*64,'pathEncoding':'win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1'}
  self.console={'pid':102,'creationFileTime':'134000000000000002','imagePathHash':'b'*64,'pathEncoding':'win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1'} if console else None
  self.member_rows=[self.node]+([] if self.console is None else [self.console])
  self.ids=[hashlib.sha256(('batch'+str(i)).encode()).hexdigest() for i in range(24 if phase=='train-cal' else 18)]
  self.config={'phase':phase,'freezeHash':'c'*64,'manifestHash':'d'*64,'nodeIdentityHash':D(self.node),'sourceMapHash':'e'*64,'batchIds':self.ids,'node':self.node,'console':self.console}
  self.r={k:0 for k in ns['RESOURCE_KEYS']};self.r.update(hostPhysicalFree=2**40,hostCommitFree=2**40,cFree=2**40,dFree=2**40)
  self.g=G(self.config,{'clock':lambda:self.now,'resources':self.resources,'members':self.members,'census':self.census,'recheck':self.recheck,'publish':self.publish})
 def resources(self):
  self.resource_action();return dict(self.r,cpuSeconds=self.cpu,jobMembers=len(self.member_rows))
 def members(self):self.calls.append('members');return copy.deepcopy(self.member_rows)
 def census(self):self.calls.append('census');return copy.deepcopy(self.member_rows)
 def recheck(self,b):self.calls.append('recheck');self.recheck_action();return b==self.g.bindings
 def publish(self,kind,raw,before):
  self.calls.append('write-pending');self.publish_action();before();self.calls.append('link-final');return hashlib.sha256(raw).hexdigest()
 def request(self):
  g=self.g;return C({'schema':'native-specificity-batch-drain-request/v1',**g.bindings,'phase':g.phase,'batchId':g.batch_ids[g.index],'batchIndex':g.index+1,'batchCaptureHash':'f'*64,'captureSummaryHash':'1'*64,'previousAckHash':g.previous_ack})
 def batch(self):self.g.begin_batch(self.ids[self.g.index]);self.g.observe_request('batch-drain');return self.g.batch_barrier(self.request())
 def capture(self):
  for _ in self.ids:self.batch()
 def final(self):
  g=self.g;return C({'schema':'native-specificity-cohort-drain-request/v1',**g.bindings,'phase':g.phase,'accounted':g.count*4,'captureHash':'2'*64,'batchReceiptHashes':list(g.receipts),'previousAckHash':g.previous_ack})
 def drain_final(self):self.g.observe_request('cohort-drain');return self.g.cohort_barrier(self.final())
class Checks(unittest.TestCase):
 def refused(self,code,fn):
  with self.assertRaises(F) as caught:fn()
  self.assertEqual(caught.exception.code,code)
 def test_complete_both_phases(self):
  for phase in ['test','train-cal']:
   f=Fixture(phase,True);f.capture();self.assertEqual(f.g.model_started,None);f.now=10;f.drain_final();self.assertEqual(f.g.model_started,10)
   f.g.advance_model('assessment' if phase=='test' else 'fitting');f.g.advance_model('checks');r=f.g.complete();self.assertEqual(len(r['batchReceiptHashes']),len(f.ids));self.assertEqual(r['pending'],0);self.refused('terminal',f.g.check)
 def test_actual_wiring_after_io_and_before_link(self):
  f=Fixture();f.batch();self.assertEqual(f.calls,['members','census','recheck','members','census','write-pending','members','census','link-final'])
 def test_replacement_during_recheck(self):
  f=Fixture(console=True);f.recheck_action=lambda:f.member_rows[1].update(creationFileTime='134000000000000003');self.refused('identity',f.batch);self.assertNotIn('link-final',f.calls)
 def test_replacement_during_pending_write(self):
  f=Fixture(console=True);f.publish_action=lambda:f.member_rows[1].update(imagePathHash='9'*64);self.refused('identity',f.batch);self.assertNotIn('link-final',f.calls)
 def test_gone_console_never_reset(self):
  f=Fixture(console=True);original=copy.deepcopy(f.console);f.member_rows=[f.node];f.batch();f.member_rows.append(original);self.refused('identity',f.batch)
 def test_unknown_transient_cannot_vanish(self):
  f=Fixture();f.member_rows.append(dict(f.node,pid=999));self.refused('identity',f.batch);f.member_rows=[f.node];self.refused('identity',f.g.check)
 def test_no_membership_count_proof(self):
  f=Fixture();f.member_rows=[dict(f.node,creationFileTime='134000000000000009')];self.refused('identity',f.batch)
 def test_exact_census_disagreement(self):
  f=Fixture();f.g.cap['census']=lambda:[];self.refused('census',f.batch)
 def test_census_plain_rows_before_comparison(self):
  touched=[]
  class Hostile:
   def __eq__(self,other):touched.append('eq');raise AssertionError()
  f=Fixture();f.g.cap['census']=lambda:[Hostile()];self.refused('census',f.batch);self.assertEqual(touched,[])
  f=Fixture(console=True);f.g.cap['census']=lambda:copy.deepcopy(list(reversed(f.member_rows)));f.batch()
 def test_resource_post_io_deadline(self):
  f=Fixture();f.recheck_action=lambda:setattr(f,'now',360);self.refused('drain-deadline',f.batch);self.assertNotIn('link-final',f.calls)
 def test_publish_postsettlement_checks(self):
  f=Fixture();old=f.g.cap['publish']
  def late(*a):
   r=old(*a);f.now=360;return r
  f.g.cap['publish']=late;self.refused('drain-deadline',f.batch);self.assertEqual(f.g.index,0)
 def test_drain15_exact(self):
  f=Fixture();f.recheck_action=lambda:setattr(f,'now',15);self.refused('drain-deadline',f.batch)
 def test_batch_order_and_duplicate(self):
  f=Fixture();self.refused('batch-order',lambda:f.g.begin_batch(f.ids[1]))
  f=Fixture();f.batch();self.refused('batch-order',lambda:f.g.begin_batch(f.ids[0]))
 def test_request_fields_and_canonical(self):
  for mutate in [lambda r:r.update(freezeHash='0'*64),lambda r:r.update(previousAckHash='0'*64),lambda r:r.update(batchIndex=True),lambda r:r.update(batchId='0'*64)]:
   f=Fixture();f.g.begin_batch(f.ids[0]);f.g.observe_request('batch-drain');r=ns['json'].loads(f.request());mutate(r);self.refused('batch-request',lambda:f.g.batch_barrier(C(r)))
  for transform in [lambda b:b+b' ',lambda b:b.replace(b'"phase":"test"',b'"phase":"test","phase":"test"'),lambda b:C(dict(reversed(list(ns['json'].loads(b).items()))))]:
   f=Fixture();f.g.begin_batch(f.ids[0]);f.g.observe_request('batch-drain');self.refused('request',lambda:f.g.batch_barrier(transform(f.request())))
 def test_ack_missing_or_wrong(self):
  for bad in [lambda k,r,b:'0'*64,lambda k,r,b:hashlib.sha256(r).hexdigest()]:
   f=Fixture();f.g.cap['publish']=bad;self.refused('publication',f.batch)
 def test_pending_original_not_freed_by_timeout(self):
  f=Fixture();ticket=f.g.start_operation('native');f.now=7005;self.refused('phase-deadline',f.g.check);self.assertIn(ticket,f.g.pending);self.refused('phase-deadline',lambda:f.g.settle_operation(ticket));self.assertEqual(f.g.pending,{})
 def test_pending_forbids_ack(self):
  f=Fixture();f.g.begin_batch(f.ids[0]);f.g.observe_request('batch-drain');f.g.start_operation('native');self.refused('pending',lambda:f.g.batch_barrier(f.request()))
 def test_cpu_exited_and_regression(self):
  f=Fixture();f.cpu=100;f.g.begin_batch(f.ids[0]);f.cpu=161;self.refused('batch-cpu',f.g.check)
  f=Fixture();f.cpu=5;f.g.check();f.cpu=4;self.refused('cpu-regressed',f.g.check)
  for phase,cap in [('test',1395),('train-cal',1920)]:
   f=Fixture(phase);f.cpu=cap+1;self.refused('phase-cpu',f.g.check)
 def test_each_resource_cap(self):
  for field,value,code in [('rssBytes',1536*1048576+1,'memory'),('privateBytes',1536*1048576+1,'memory'),('commitBytes',1536*1048576+1,'memory'),('hostPhysicalFree',0,'headroom'),('hostCommitFree',0,'headroom'),('cFree',0,'headroom'),('dFree',0,'headroom'),('batchBytes',512*1048576+1,'disk'),('batchEntries',8193,'disk'),('studyBytes',8192*1048576+1,'disk'),('studyEntries',344065,'disk'),('evidenceBytes',32*1048576+1,'evidence'),('logBytes',1048577,'evidence'),('resultBytes',524289,'evidence')]:
   f=Fixture();f.r[field]=value;self.refused(code,f.g.check)
 def test_nonfinite_clock_cpu_and_resources(self):
  f=Fixture();f.now=float('nan');self.refused('clock',f.g.check)
  f=Fixture();f.cpu=float('inf');self.refused('resources',f.g.check)
  f=Fixture();f.r['rssBytes']=True;self.refused('resources',f.g.check)
 def test_final_all_receipts_and_rows(self):
  f=Fixture();self.refused('request-observation',lambda:f.g.observe_request('cohort-drain'))
  for key,value in [('accounted',71),('batchReceiptHashes',[]),('previousAckHash',None)]:
   f=Fixture();f.capture();f.g.observe_request('cohort-drain');r=ns['json'].loads(f.final());r[key]=value;self.refused('cohort-request',lambda:f.g.cohort_barrier(C(r)))
 def test_model_origin_includes_ack_io(self):
  f=Fixture();f.capture();f.now=100;f.recheck_action=lambda:setattr(f,'now',104);f.drain_final();self.assertEqual(f.g.model_started,100);self.assertEqual(f.g.stage_started,100);f.now=505;self.refused('model-stage-deadline',f.g.check)
 def test_model_order_and_final_completion(self):
  f=Fixture();f.capture();f.drain_final();self.refused('model-order',lambda:f.g.advance_model('fitting'))
  f=Fixture();f.capture();f.drain_final();self.refused('completion',f.g.complete)
 def test_baseline_config_copied(self):
  f=Fixture();f.config['node']['pid']=999;self.refused('identity',f.batch)
 def test_async_capability_stays_pending(self):
  class Awaitable:
   def __await__(self):return iter(())
  f=Fixture();f.g.cap['members']=lambda:Awaitable();self.refused('async-capability',f.batch);self.assertEqual(len(f.g.pending),1)
 def test_unsafe_capability_result_no_hooks(self):
  touched=[]
  class Unsafe:
   def __getattribute__(self,name):touched.append(name);raise AssertionError('no hook')
  f=Fixture();f.g.cap['members']=lambda:Unsafe();self.refused('async-capability',f.batch);self.assertEqual(touched,[])
 def test_active128_monitor_not_baseline8_claim(self):
  f=Fixture();f.member_rows=[dict(f.node,pid=i+1) for i in range(128)];f.g.check();self.refused('membership',f.batch)
  f=Fixture();f.member_rows=[dict(f.node,pid=i+1) for i in range(129)];self.refused('memory',f.g.check)
 def test_batch_limit_without_drain_and_phase_limit(self):
  f=Fixture();f.g.begin_batch(f.ids[0]);f.now=360;self.refused('batch-deadline',f.g.check)
  f=Fixture();f.now=6480;self.refused('capture-deadline',f.g.check)
 def test_clock_regression_during_resource_call(self):
  f=Fixture();f.now=1;f.resource_action=lambda:setattr(f,'now',0);self.refused('clock',f.g.check)
 def test_source_false_and_io_failure_finite(self):
  f=Fixture();f.g.cap['recheck']=lambda _:False;self.refused('source-stage',f.batch)
  f=Fixture()
  def broken():raise TypeError('private arbitrary detail never retained')
  f.g.cap['members']=broken;self.refused('io-members',f.batch);self.assertEqual(f.g.pending,{})
 def test_fault_never_reset(self):
  f=Fixture();self.refused('physical-unsettled',lambda:f.g.fail('physical-unsettled'));self.refused('physical-unsettled',lambda:f.g.fail('owner-failure'));self.refused('physical-unsettled',f.g.check)
 def test_observation_required_before_read_and_no_renewal(self):
  f=Fixture();f.g.begin_batch(f.ids[0]);self.refused('request-observation',lambda:f.g.batch_barrier(f.request()))
  f=Fixture();f.g.begin_batch(f.ids[0]);f.g.observe_request('batch-drain');f.now=14;self.refused('request-observation',lambda:f.g.observe_request('batch-drain'));self.assertEqual(f.g.drain_started,0)
 def test_request_read_and_residual_probe_consume15(self):
  for spent in [15,16]:
   f=Fixture();f.g.begin_batch(f.ids[0]);f.now=5;f.g.observe_request('batch-drain');f.now=5+spent;self.refused('drain-deadline',lambda:f.g.batch_barrier(f.request()));self.assertEqual(f.calls,[])
  f=Fixture();f.g.begin_batch(f.ids[0]);f.now=5;f.g.observe_request('batch-drain');f.now=19;ack=ns['json'].loads(f.g.batch_barrier(f.request()));self.assertEqual(ack['observedAt'],5)
 def test_final_observation_precedes_read_and_ack(self):
  f=Fixture();f.capture();f.now=100;f.g.observe_request('cohort-drain');self.assertEqual(f.g.model_started,100);f.now=110;f.g.cohort_barrier(f.final());self.assertEqual(f.g.model_started,100);self.assertEqual(f.g.stage_started,100)
  f=Fixture();f.capture();f.now=100;f.g.observe_request('cohort-drain');f.now=115;self.refused('drain-deadline',lambda:f.g.cohort_barrier(f.final()))
 def test_observation_order(self):
  f=Fixture();self.refused('request-observation',lambda:f.g.observe_request('batch-drain'))
  f=Fixture();f.g.begin_batch(f.ids[0]);self.refused('request-observation',lambda:f.g.observe_request('cohort-drain'))
 def test_observation_resource_io_already_consumes_lease(self):
  f=Fixture();f.g.begin_batch(f.ids[0]);f.now=10;f.resource_action=lambda:setattr(f,'now',14);self.assertEqual(f.g.observe_request('batch-drain'),10);self.assertEqual(f.g.drain_started,10)
  f=Fixture();f.capture();f.now=10;f.resource_action=lambda:setattr(f,'now',14);f.g.observe_request('cohort-drain');self.assertEqual(f.g.model_started,10)
 def test_identity_actual_encoding_and_filetime_bounds(self):
  for value in ['0','00','01','18446744073709551616','-1','1.0',' 1','1 ','\u0661']:
   self.refused('identity',lambda:ns['identity'](dict(Fixture().node,creationFileTime=value)))
  for value in ['1','18446744073709551615']:
   self.assertEqual(ns['identity'](dict(Fixture().node,creationFileTime=value))['creationFileTime'],value)
  self.refused('identity',lambda:ns['identity'](dict(Fixture().node,pathEncoding='windows-lexical-path/v1')))
 def test_recheck_registered_physical_blocks_ack(self):
  f=Fixture();tickets=[];f.recheck_action=lambda:tickets.append(f.g.start_operation('native'));self.refused('pending',f.batch);self.assertNotIn('link-final',f.calls);self.assertTrue(all(t in f.g.pending for t in tickets))
 def test_publish_registered_physical_blocks_link(self):
  f=Fixture();tickets=[];f.publish_action=lambda:tickets.append(f.g.start_operation('native'));self.refused('pending',f.batch);self.assertNotIn('link-final',f.calls);self.assertEqual(list(f.g.pending),tickets)
 def test_prelink_census_registered_physical_blocks_link(self):
  for label in ['members','census']:
   f=Fixture();original=f.g.cap[label];seen=[0];tickets=[]
   def reentrant():
    seen[0]+=1
    if seen[0]==3:tickets.append(f.g.start_operation('native'))
    return original()
   f.g.cap[label]=reentrant;self.refused('pending',f.batch);self.assertNotIn('link-final',f.calls);self.assertEqual(list(f.g.pending),tickets)
 def test_post_publish_registered_work_prevents_success(self):
  f=Fixture();original=f.g.cap['publish'];tickets=[]
  def publisher(*args):
   value=original(*args);tickets.append(f.g.start_operation('native'));return value
  f.g.cap['publish']=publisher;self.refused('pending',f.batch);self.assertEqual(f.g.index,0);self.assertEqual(list(f.g.pending),tickets)
 def test_complete_final_io_cannot_add_pending(self):
  f=Fixture();f.capture();f.drain_final();f.g.advance_model('assessment');f.g.advance_model('checks');tickets=[];f.recheck_action=lambda:tickets.append(f.g.start_operation('native'));self.refused('pending',f.g.complete);self.assertEqual(f.g.state,'model');self.assertEqual(list(f.g.pending),tickets)
 def test_capture_cutoff_precedes_model_ack_budget(self):
  f=Fixture();f.capture();f.now=6479;f.g.observe_request('cohort-drain');f.recheck_action=lambda:setattr(f,'now',6490);f.g.cohort_barrier(f.final());self.assertEqual(f.g.model_started,6479);self.assertEqual(f.g.state,'model')
  for now in [6480,6481]:
   f=Fixture();f.capture();f.now=now;links=f.calls.count('link-final');self.refused('capture-deadline',lambda:f.g.observe_request('cohort-drain'));self.assertIsNone(f.g.model_started);self.assertEqual(f.calls.count('link-final'),links)
 def test_capture_cpu_cutoff_and_phase_cpu_after_transition(self):
  f=Fixture();f.capture();f.cpu=1080;f.g.observe_request('cohort-drain');f.cpu=1200;f.g.cohort_barrier(f.final());self.assertEqual(f.g.state,'model');f.cpu=1396;self.refused('phase-cpu',f.g.check)
  f=Fixture();f.capture();f.cpu=1081;self.refused('capture-cpu',lambda:f.g.observe_request('cohort-drain'));self.assertIsNone(f.g.model_started)
 def test_caught_resource_fault_before_link_is_sticky(self):
  f=Fixture();armed=[False];tickets=[]
  def prepare():tickets.append(f.g.start_operation('native'));armed[0]=True
  def resource():
   if armed[0]:
    try:f.g.fail('physical-unsettled')
    except F:pass
  f.publish_action=prepare;f.resource_action=resource;self.refused('physical-unsettled',f.batch);self.assertNotIn('link-final',f.calls);self.assertEqual(list(f.g.pending),tickets)
 def test_caught_clock_fault_dispatches_no_resources(self):
  f=Fixture();resources=[0]
  def badclock():
   try:f.g.fail('physical-unsettled')
   except F:pass
   return f.now
  f.resource_action=lambda:resources.__setitem__(0,resources[0]+1);f.g.cap['clock']=badclock;self.refused('physical-unsettled',f.g.check);self.assertEqual(resources[0],0);self.assertNotIn('link-final',f.calls)
 def test_callback_cannot_change_state_and_catch_away_fault(self):
  f=Fixture();f.resource_action=lambda:setattr(f.g,'state','complete');self.refused('terminal',f.g.check)
 def test_stage_first_observation_includes_resource_and_ack_wait(self):
  f=Fixture('train-cal');f.capture();f.drain_final();f.now=10;f.resource_action=lambda:setattr(f,'now',20);f.g.advance_model('fitting');self.assertEqual(f.g.stage_started,10);f.resource_action=lambda:None;f.now=190;self.refused('model-stage-deadline',f.g.check)
  f=Fixture('train-cal');f.capture();f.drain_final();f.now=10;f.resource_action=lambda:setattr(f,'now',190);self.refused('model-stage-deadline',lambda:f.g.advance_model('fitting'));self.assertEqual(f.g.stage_started,10)
 def test_constructor_original_epoch_not_reset_by_late_creation(self):
  f=Fixture();f.now=6480;self.refused('capture-deadline',lambda:G(f.config,f.g.cap,started_at=0))
  f=Fixture();f.now=7005;self.refused('phase-deadline',lambda:G(f.config,f.g.cap,started_at=0))
  f=Fixture();f.now=100;late=G(f.config,f.g.cap,started_at=0);self.assertEqual(late.started,0)
 def test_constructor_invalid_original_epoch(self):
  for value in [float('nan'),float('inf'),-1,True]:
   f=Fixture();self.assertRaises(F,lambda:G(f.config,f.g.cap,started_at=value))
  f=Fixture();self.refused('clock-start',lambda:G(f.config,f.g.cap,started_at=1))
 def test_resource_markers_preserve_branch_order_and_original_outcome(self):
  cases=[('collect',None),('callback-fence',None),('shape',None),('cpu',None)]+[('counter',key) for key in ns['RESOURCE_KEYS'][1:]]
  for stage,field in cases:
   with self.subTest(stage=stage,field=field):
    f=Fixture();actions=[];original=f.g.cap['resources'];f.g.cap['clock']=lambda:(actions.append('clock') or f.now)
    def resources():
     actions.append('resources')
     if stage=='collect':raise RuntimeError('private secret never retained')
     if stage=='callback-fence':f.g.state='complete'
     result=original()
     if stage=='shape':result['unexpected']=0
     if stage=='cpu':result['cpuSeconds']=float('nan')
     if stage=='counter':result[field]=True
     return result
    f.g.cap['resources']=resources;self.refused('terminal' if stage=='callback-fence' else 'resources',f.g.check)
    d=f.g.resource_diagnostic();self.assertEqual((d['stage'],d['field']),(stage,field));self.assertEqual(actions,['clock','resources']);self.assertNotIn('secret',C(d).decode())
    first=copy.deepcopy(d);self.refused(f.g.fault,f.g.check);self.assertEqual(f.g.resource_diagnostic(),first);self.assertEqual(actions,['clock','resources'])
 def test_resources_success_and_ordinary_cap_refusals_never_record_collection_failure(self):
  f=Fixture();actions=[];f.g.cap['clock']=lambda:(actions.append('clock') or f.now);f.resource_action=lambda:actions.append('resources');f.g.check();self.assertEqual(actions,['clock','resources','clock']);self.assertIsNone(f.g.resource_diagnostic())
  for key,value,code in [('rssBytes',1536*ns['MIB']+1,'memory'),('hostPhysicalFree',0,'headroom'),('studyBytes',8192*ns['MIB']+1,'disk'),('evidenceBytes',32*ns['MIB']+1,'evidence')]:
   f=Fixture();f.r[key]=value;self.refused(code,f.g.check);self.assertIsNone(f.g.resource_diagnostic())
 def test_resource_nominal_projection_is_closed_zero_hooks_and_detached(self):
  hooks=[]
  class Hostile(F):
   def __getattribute__(self,key):hooks.append(key);raise AssertionError('must not inspect')
   def __str__(self):hooks.append('str');raise AssertionError('must not stringify')
  for error in [Hostile('physical-unsettled'),F('private/secret'),RuntimeError('secret')]:
   d=ns['resource_failure_observation'](error,'collect',None);self.assertEqual((d['family'],d['code']),('unclassified','unclassified'))
  d=ns['resource_failure_observation'](F('physical-unsettled'),'callback-fence',None);self.assertEqual((d['family'],d['code']),('guardian','physical-unsettled'));self.assertEqual(hooks,[])
  f=Fixture();f.resource_action=lambda:(_ for _ in ()).throw(F('physical-unsettled'));self.refused('resources',f.g.check);copied=f.g.resource_diagnostic();copied['code']='secret';self.assertEqual(f.g.resource_diagnostic()['code'],'physical-unsettled')
  self.assertRaises(F,lambda:ns['project_resource_guardian_observation']({'stage':'counter','field':'secret','family':'guardian','code':'contract'}))
 def test_resource_projector_failure_never_changes_refusal_or_dispatches_more_callbacks(self):
  original=ns['resource_failure_observation'];f=Fixture();actions=[]
  try:
   ns['resource_failure_observation']=lambda *a:(_ for _ in ()).throw(AssertionError('observer'))
   f.g.cap['clock']=lambda:(actions.append('clock') or f.now)
   f.resource_action=lambda:(_ for _ in ()).throw(RuntimeError('private'))
   self.refused('resources',f.g.check);self.assertIsNone(f.g.resource_diagnostic());self.assertEqual(actions,['clock'])
  finally:ns['resource_failure_observation']=original
result=unittest.main(argv=['guardian-pure'],exit=False)
assert result.result.wasSuccessful()
`;

test('guardian source is default-inert, native/IO-free and literal scope only',async()=>{
 const source=await readFile(new URL('./guardian.py',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:ctypes|subprocess|pathlib|os|socket)\b|__main__|open\(/u);
 assert.match(source,/class PhaseGuardian/u);assert.match(source,/self\._baseline\(\)  # IO may have allowed/u);
});
test('fixed protocol phase/resource values match the pure guardian contract',async()=>{
 const p=JSON.parse(await readFile(new URL('./protocol.json',import.meta.url),'utf8'));
 assert.deepEqual([p.phases.trainCal.activeSeconds,p.phases.test.activeSeconds,p.phases.trainCal.cpuSeconds,p.phases.test.cpuSeconds],[9420,7005,1920,1395]);
 assert.deepEqual([p.capture.batchActiveSeconds,p.capture.batchCpuSeconds,p.capture.batchAllocationsSeconds.drain],[360,60,15]);
 assert.deepEqual([p.resources.jobCommitRssPrivateMiB,p.resources.minimumCFreeMiB,p.resources.minimumDFreeMiB],[1536,2048,4096]);
});
test('actual guardian Python AST injected state/resource/barrier regressions',t=>{
 let child;try{child=spawnSync('python',['-B','-c',PYTHON_AST_TEST],{encoding:'utf8',maxBuffer:131072});}
 catch(error){if(error?.code==='OFFLINE_CAPABILITY_DENIED'){t.skip('offline guard refuses child; run exported identical AST script separately');return;}throw error;}
 if(child.error&&/EPERM|EACCES/u.test(child.error.code??'')){t.skip('offline guard refuses child; run exported identical AST script separately');return;}
 assert.equal(child.status,0,child.stdout+'\n'+child.stderr);assert.match(child.stderr,/OK/u);assert.doesNotMatch(child.stderr,/FAILED|ERROR:/u);
});
