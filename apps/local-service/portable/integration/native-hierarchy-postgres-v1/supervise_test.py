"""Pure joined controller/boundary tests; fake WinAPI only, no child or SQL."""
import json
import hashlib
import os
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import supervise as S
validate_completion = S.validate_completion
from windows_test import FakeAPI, W

def invented_result():
    return {'schema':'native-hierarchy-postgres-result/v1','accepted':True,'primary':None,
      'server':{'port':55433,'version':170011,'ownershipVerified':True},
      'cleanup':{'reason':'verified-own-server-smart-stopped','stopped':True,'childExited':True,'clientsClosed':True,'physicalSettled':True,'directoryRetained':True},
      'proof':{'schema':'native-hierarchy-postgres-proof/v1','status':'passed','nativeExecuted':True,'pendingAssertions':0,
       'cases':[{'name':name,'depth':depth,'status':'passed'} for name,depth in zip(S.CASE_NAMES,[0,0]+[1]*20+[0,1,1])],
       'cleanup':{'status':'passed','used':2,'finished':True,'adminClosed':True,'failureCount':0,'databases':[
        {'name':'murmingle_hierarchy_fixture_20261026_'+('a' if i==0 else 'b'),'oid':str(100+i),'created':True,'closed':True,'dropped':True,'pending':0,'cleanupFailures':0} for i in range(2)]},
       'concurrencyValidated':False,'restrictedRoleValidated':False,'semanticQualityMeasured':False}}

def valid_json():
    return (json.dumps(invented_result(),ensure_ascii=False,separators=(',',':'))+'\n').encode()


class Clock:
    def __init__(self):
        self.value = 0.0
        self.step = 0.01

    def now(self):
        return self.value

    def pause(self, amount):
        assert amount == 0.01
        self.value += self.step


def resources():
    return {'cpu': 0, 'committed': 0,
            'accounting': {'totalProcesses': 0, 'activeProcesses': 0,
                          'totalTerminatedProcesses': 0, 'user100ns': 0, 'kernel100ns': 0},
            'physicalFree': 3072*S.MIB, 'commitFree': 3072*S.MIB,
            'cFree': 3072*S.MIB, 'dFree': 5120*S.MIB}


class JoinedAPI(FakeAPI):
    def __init__(self, clock):
        super().__init__()
        self.clock = clock
        self.exit_at = 0.02
        self.eof_at = 0.04
        self.streams['stdout'].extend(valid_json())
        self.streams['stderr'].extend(b'opaque sqlite warning\xff')
        self.sample_hook = None
        self.stream_order = []
        self.host_row = resources()
        self.before_call = None
        self.stubborn = False

    def call(self, name):
        if self.before_call:
            self.before_call(name)
        super().call(name)

    def resources(self, job):
        self.call('resources')
        row = resources()
        row['accounting']['totalProcesses'] = int(self.assigned)
        row['accounting']['activeProcesses'] = int(self.assigned and self.alive)
        if self.sample_hook:
            self.sample_hook(row)
        return row

    def exited(self, handle):
        self.call('exited')
        if self.clock.value >= self.exit_at:
            self.alive = False
        return not self.alive

    def peek(self, handle):
        stream = self.stream(handle)
        self.stream_order.append(stream)
        if self.clock.value >= self.eof_at and not self.alive:
            self.ends.add(stream)
        return super().peek(handle)

    def terminate_job(self, handle):
        result = super().terminate_job(handle)
        if self.stubborn:
            self.alive = True
        else:
            self.eof_at = self.clock.value
        return result

    def terminate_process(self, handle):
        result = super().terminate_process(handle)
        self.eof_at = self.clock.value
        return result


class ControllerTests(unittest.TestCase):
    def setup_controller(self):
        self.clock = Clock()
        self.api = JoinedAPI(self.clock)
        self.boundary = W.OwnedFixtureProcess(None, self.api)
        self.events = []

        def authenticate():
            self.events.append('authenticate')

        def end_pins():
            self.events.append('end-pins')

        def host():
            self.events.append('host')
            self.assertIn('authenticate', self.events)
            return dict(self.api.host_row)

        def factory():
            self.events.append('factory')
            self.assertIn('host', self.events)
            return self.boundary

        self.controller = S.Controller(authenticate=authenticate, end_pins=end_pins,
            host_sample=host, boundary_factory=factory, validate=validate_completion,
            clock=self.clock.now, pause=self.clock.pause)
        return self.controller

    def test_joined_success_requires25_and_normal_retirement(self):
        result = self.setup_controller().run()
        self.assertTrue(result['accepted'], result)
        self.assertEqual(result['completion']['testPoints'], 25)
        self.assertTrue(result['endPinsChecked'])
        self.assertEqual(result['cleanupClassification'], 'verified-normal')
        self.assertEqual(self.events[0], 'authenticate')
        self.assertLess(self.events.index('host'), self.events.index('factory'))
        self.assertLess(self.api.calls.index('assign'), self.api.calls.index('resume'))
        self.assertNotIn('terminate-job', self.api.calls)
        encoded = json.dumps(result)
        self.assertNotIn('opaque', encoded)
        self.assertNotIn('pid', encoded.lower())
        self.assertLess(len(encoded.encode()), 65536)

    def test_authentication_refusal_precedes_all_native_and_host_calls(self):
        c = self.setup_controller()
        def refuse():
            raise RuntimeError('private authentication detail')
        c.authenticate = refuse
        result = c.run()
        self.assertFalse(result['accepted'])
        self.assertEqual(self.api.calls, [])
        self.assertEqual(self.events, [])
        self.assertFalse(result['endPinsChecked'])
        self.assertNotIn('private', json.dumps(result))

    def test_authentication_return_is_not_truthy_admission(self):
        c = self.setup_controller()
        c.authenticate = lambda: True
        self.assertEqual(c.run()['primary']['code'], 'authentication-return')
        self.assertEqual(self.api.calls, [])

    def test_startup_margin_records_exact_failed_counter(self):
        c = self.setup_controller()
        self.api.host_row['commitFree'] = 2144*S.MIB-1
        result = c.run()
        self.assertFalse(result['accepted'])
        self.assertEqual(result['primary'], {'code':'resource-floor', 'counter':'commitFree',
                                            'value':2144*S.MIB-1})
        self.assertEqual(self.api.calls, [])

    def test_authentication_time_is_charged_to_original_epoch(self):
        c = self.setup_controller()
        c.authenticate = lambda: setattr(self.clock, 'value', 360)
        result = c.run()
        self.assertEqual(result['primary']['code'], 'deadline')
        self.assertEqual(self.api.calls, [])

    def test_each_host_floor_refuses_without_child(self):
        for key, floor in (('physicalFree',2144),('commitFree',2144),('cFree',2048),('dFree',4096)):
            with self.subTest(key=key):
                c = self.setup_controller()
                self.api.host_row[key] = floor*S.MIB-1
                result = c.run()
                self.assertEqual(result['primary']['counter'], key)
                self.assertNotIn('create-process', self.api.calls)

    def test_bad_resource_schema_never_becomes_zero(self):
        for value in (None, True, -1, float('nan'), '99999999999'):
            c = self.setup_controller()
            self.api.host_row['commitFree'] = value
            self.assertEqual(c.run()['primary']['code'], 'resource-shape')

    def test_setup_checkpoint_fault_closes_partial_job_before_launch(self):
        c = self.setup_controller()
        def change(name):
            if name == 'create-job':
                self.api.host_row['physicalFree'] = 1024*S.MIB-1
        self.api.before_call = change
        result = c.run()
        self.assertEqual(result['primary']['counter'], 'physicalFree')
        self.assertNotIn('create-process', self.api.calls)
        self.assertTrue(result['native']['allHandlesClosed'])

    def test_fault_after_creation_terminates_only_original_suspended_process(self):
        c = self.setup_controller()
        def change(name):
            if name == 'create-process':
                self.api.host_row['commitFree'] = 1024*S.MIB-1
        self.api.before_call = change
        result = c.run()
        self.assertFalse(result['accepted'])
        self.assertIn('terminate-process', self.api.calls)
        self.assertNotIn('terminate-job', self.api.calls)
        self.assertNotIn('resume', self.api.calls)
        self.assertTrue(result['native']['allHandlesClosed'])

    def test_fault_after_assignment_terminates_only_owned_job(self):
        c = self.setup_controller()
        def change(name):
            if name == 'assign':
                self.api.host_row['commitFree'] = 1024*S.MIB-1
        self.api.before_call = change
        result = c.run()
        self.assertFalse(result['accepted'])
        self.assertIn('terminate-job', self.api.calls)
        self.assertNotIn('terminate-process', self.api.calls)
        self.assertNotIn('resume', self.api.calls)

    def test_sampled_cpu_and_historical_job_peak_are_separate_limits(self):
        for cpu, peak, counter in ((60.01,0,'jobCpuSeconds'),(0,1024*S.MIB+1,'historicalPeakJobMemoryBytes')):
            c = self.setup_controller()
            def change(row):
                row['cpu'], row['committed'] = cpu, peak
                row['accounting']['user100ns'] = int(cpu*10000000)
            self.api.sample_hook = change
            result = c.run()
            self.assertEqual(result['primary']['counter'], counter)
            self.assertNotIn('create-process', self.api.calls)

    def test_two_pipes_are_serviced_fairly_and_exit_does_not_imply_eof(self):
        c = self.setup_controller()
        result = c.run()
        self.assertTrue(result['accepted'])
        self.assertGreaterEqual(self.clock.value, self.api.eof_at)
        self.assertEqual(self.api.stream_order[:4], ['stdout','stderr','stderr','stdout'])

    def test_late_exit_can_drain_to_normal_epoch_not_active_epoch(self):
        c = self.setup_controller()
        self.clock.step = 0.5
        self.api.exit_at, self.api.eof_at = 359.5, 361
        result = c.run()
        self.assertTrue(result['accepted'], result)
        self.assertEqual(self.clock.value, 361)

    def test_living_child_at360_fails_and_is_not_retried(self):
        c = self.setup_controller()
        self.clock.step = 1
        self.api.exit_at = 500
        result = c.run()
        self.assertEqual(result['primary']['code'], 'deadline')
        self.assertEqual(self.api.calls.count('create-process'), 1)
        self.assertEqual(self.api.calls.count('terminate-job'), 1)
        self.assertTrue(result['endPinsChecked'])

    def test_original_nonzero_exit_never_passes_complete_json(self):
        c = self.setup_controller()
        self.api.code = 1
        result = c.run()
        self.assertFalse(result['accepted'])
        self.assertEqual(result['completion']['code'], 'exit-status')

    def test_missing_json_child_and_trailing_data_fail(self):
        for data in (valid_json()[:-50], valid_json()+b'private trailing row\n'):
            c = self.setup_controller()
            self.api.streams['stdout'] = bytearray(data)
            result = c.run()
            self.assertEqual(result['primary']['code'], 'completion')
            self.assertNotIn('private', json.dumps(result))

    def test_output_overflow_cannot_pass_or_grow_capture(self):
        c = self.setup_controller()
        self.api.exit_at = 500
        self.api.streams['stdout'] = bytearray(b'x'*(S.CAPS['stdout']+4096))
        result = c.run()
        self.assertFalse(result['accepted'])
        self.assertLessEqual(len(c.buffers['stdout']), S.CAPS['stdout'])
        self.assertIn('terminate-job', self.api.calls)
        self.assertTrue(result['native']['stdoutEof'])

    def test_primary_is_preserved_when_cleanup_resource_guard_fails(self):
        c = self.setup_controller()
        self.api.fail = 'resume'
        self.api.host_row['commitFree'] = 3072*S.MIB
        def change(name):
            if name == 'resume':
                self.api.host_row['commitFree'] = 1
        self.api.before_call = change
        result = c.run()
        self.assertEqual(result['primary']['code'], 'execution-failure')
        self.assertTrue(result['native']['exited'])
        self.assertTrue(result['native']['allHandlesClosed'])
        self.assertEqual(result['cleanup']['counter'], 'commitFree')

    def test_unknown_exception_property_cannot_interrupt_owned_cleanup(self):
        c = self.setup_controller()
        class Hostile(RuntimeError):
            @property
            def code(self):
                raise AssertionError('property must not run')
        def change(name):
            if name == 'resume':
                raise Hostile('private raw error')
        self.api.before_call = change
        result = c.run()
        self.assertEqual(result['primary']['code'], 'execution-failure')
        self.assertTrue(result['native']['allHandlesClosed'])

    def test_early_cleanup_cannot_silently_expand_to390(self):
        c = self.setup_controller()
        self.clock.step = 1
        self.api.fail, self.api.stubborn = 'resume', True
        self.api.exit_at, self.api.eof_at = 300, 300
        result = c.run()
        self.assertFalse(result['accepted'])
        self.assertEqual(result['cleanup']['code'], 'cleanup-deadline')
        self.assertEqual(self.clock.value, 30)
        self.assertFalse(result['native']['allHandlesClosed'])

    def test_end_pin_failure_cannot_pass_or_mask_existing_fault(self):
        for bad_exit in (False, True):
            c = self.setup_controller()
            if bad_exit:
                self.api.code = 1
            def changed():
                raise RuntimeError('private changed path')
            c.end_pins = changed
            result = c.run()
            self.assertFalse(result['accepted'])
            self.assertFalse(result['endPinsChecked'])
            self.assertEqual(result['primary']['code'], 'completion' if bad_exit else 'execution-failure')
            self.assertNotIn('private', json.dumps(result))
            self.assertLess(self.clock.value, 1)

    def test_late_cleanup_observation_does_not_start_fresh_emergency_epoch(self):
        c = self.setup_controller()
        self.clock.step = 50
        self.api.fail, self.api.stubborn = 'resume', True
        self.api.exit_at, self.api.eof_at = 300, 300
        result = c.run()
        self.assertEqual(result['cleanup']['code'], 'cleanup-deadline')
        # The first observed clock jump already exceeded the original30s
        # cleanup budget. No additional ten-second lease may start at50s.
        self.assertEqual(self.clock.value, 50)

    def test_completion_projection_is_closed_before_retaining_validator_output(self):
        c = self.setup_controller()
        c.validate = lambda *_: {'accepted': True, 'private': 'must never retain'}
        result = c.run()
        self.assertFalse(result['accepted'])
        self.assertEqual(result['primary']['code'], 'completion-shape')
        self.assertIsNone(result['completion'])
        self.assertNotIn('private', json.dumps(result))

    def test_unverified_empty_job_cannot_claim_normal_cleanup(self):
        c = self.setup_controller()
        original = self.api.members
        def members(job):
            return (19,) if self.boundary.exited else original(job)
        self.api.members = members
        result = c.run()
        self.assertFalse(result['accepted'])
        self.assertEqual(result['cleanupClassification'], 'owned-emergency')
        self.assertTrue(result['native']['emergency'])

    def test_one_shot_no_retry_or_cap_raise(self):
        c = self.setup_controller()
        self.assertTrue(c.run()['accepted'])
        with self.assertRaises(S.Refusal):
            c.run()
        self.assertEqual(self.api.calls.count('create-process'), 1)
        self.assertEqual(self.api.rows['memory'], 1024*S.MIB)

    def test_new_budget_retains_strict_peak_refusal_not_automatic_escalation(self):
        for peak,accepted in ((580931584,True),(1024*S.MIB+1,False)):
            c = self.setup_controller()
            self.api.sample_hook = lambda row:row.update(committed=peak)
            result = c.run()
            self.assertEqual(result['accepted'],accepted)
            if not accepted:
                self.assertEqual(result['primary'],{'code':'resource-limit',
                    'counter':'historicalPeakJobMemoryBytes','value':peak})
            self.assertEqual(self.api.rows['memory'],1024*S.MIB)

    def test_startup_budget_includes_original_floor_and_parent_allowance(self):
        self.assertEqual(1024+1024+96,2144)
        c = self.setup_controller()
        self.api.host_row['physicalFree'] = (1024+1024+96)*S.MIB-1
        result = c.run()
        self.assertEqual(result['primary']['counter'],'physicalFree')
        self.assertNotIn('create-process',self.api.calls)



class NativeValidationTests(unittest.TestCase):
    def test_real_sql_evidence_is_not_invented_fixture_or_concurrency_claim(self):
        report=S.validate_completion(valid_json(),b'opaque warning',0)
        self.assertTrue(report['accepted']);self.assertEqual(report['testPoints'],25)
    def test_missing_failed_duplicate_skipped_wrong_case_refuse(self):
        for change in (lambda v:v['proof']['cases'].pop(),
                       lambda v:v['proof']['cases'][2].update(status='failed'),
                       lambda v:v['proof']['cases'][2].update(status='skipped'),
                       lambda v:v['proof']['cases'][2].update(name='foreign')):
            value=invented_result();change(value)
            self.assertFalse(S.validate_completion((json.dumps(value)+'\n').encode(),b'',0)['accepted'])
    def test_boolean_numbers_nonzero_pending_oid_alias_and_cleanup_fault_refuse(self):
        mutations=[lambda v:v['server'].update(port=True),
          lambda v:v['server'].update(ownershipVerified=1),
          lambda v:v['proof'].update(pendingAssertions=True),
          lambda v:v['proof']['cleanup'].update(failureCount=True),
          lambda v:v['proof']['cleanup']['databases'][0].update(pending=True),
          lambda v:v['proof']['cleanup']['databases'][1].update(oid='100'),
          lambda v:v['proof']['cleanup']['databases'][1].update(oid='9999999999'),
          lambda v:v['proof']['cleanup']['databases'][1].update(oid='١٠١'),
          lambda v:v['cleanup'].update(physicalSettled=False),
          lambda v:v['proof'].update(concurrencyValidated=True)]
        for change in mutations:
            value=invented_result();change(value)
            self.assertFalse(S.validate_completion((json.dumps(value)+'\n').encode(),b'',0)['accepted'])
    def test_duplicate_json_trailing_output_and_nonfinite_refuse(self):
        for raw in (valid_json()+b'{}',valid_json().replace(b'{',b'{"accepted":false,',1),
                    valid_json().replace(b'170011',b'NaN'),b'['*2000+b']'*2000+b'\n'):
            self.assertFalse(S.validate_completion(raw,b'',0)['accepted'])
    def test_native_lifetime_process_accounting_may_exceed_active32_without_reset(self):
        c=ControllerTests();controller=c.setup_controller()
        c.api.sample_hook=lambda row:row['accounting'].update(totalProcesses=100)
        self.assertTrue(controller.run()['accepted'])
    def test_active33_and_cumulative_cpu_regression_refuse(self):
        c=ControllerTests();controller=c.setup_controller()
        c.api.sample_hook=lambda row:row['accounting'].update(totalProcesses=100,activeProcesses=33)
        self.assertEqual(controller.run()['primary']['code'],'job-accounting')
    def test_root_exit_and_eof_do_not_hide_surviving_descendants(self):
        c=ControllerTests();controller=c.setup_controller();c.clock.step=1
        def before(name):
            if name=='resume':c.api.descendants.add(77)
        c.api.before_call=before
        result=controller.run()
        self.assertFalse(result['accepted']);self.assertTrue(result['native']['emergency'])
        self.assertIn('terminate-job',c.api.calls)
    def test_original_startup_flag_refusal_is_before_native_or_output(self):
        with self.assertRaisesRegex(S.Refusal,'python-flags'):S.execute_fixed_fixture('a'*64)
    def test_actual_epoch_includes_inventory_bootstrap_instead_of_reset_at_controller(self):
        c=ControllerTests();controller=c.setup_controller();c.clock.value=10
        inherited=S.Controller(authenticate=controller.authenticate,end_pins=controller.end_pins,
          host_sample=controller.host_sample,boundary_factory=controller.boundary_factory,validate=controller.validate,
          clock=c.clock.now,pause=c.clock.pause,started_at=0)
        self.assertEqual(inherited.started,0);c.clock.value=360
        self.assertEqual(inherited.run()['primary']['code'],'deadline');self.assertNotIn('create-process',c.api.calls)
        source=(Path(__file__).resolve().parent/'supervise.py').read_text('utf8')
        self.assertLess(source.index('_BOOTSTRAP_STARTED=time.monotonic()'),source.index('I=bootstrap_inventory()'))
        self.assertIn('started_at=_BOOTSTRAP_STARTED',source)

class TreeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='.source-test-',dir=Path(__file__).resolve().parent)
        self.root=Path(self.temp.name);self.parent=self.root/'fresh';self.tree=S.ClusterTree();self.tree.parent=self.parent
    def tearDown(self):self.temp.cleanup()
    def test_empty_baseline_then_single_fresh_tree_and_marker(self):
        self.tree.prepare();self.tree.check();self.parent.mkdir();directory=self.parent/'nhpg1-UNIT01';directory.mkdir()
        value={'schema':'native-hierarchy-postgres/v1','nonce':'a'*48,'runDirectory':str(directory)}
        (directory/'ownership.pending').write_bytes(json.dumps(value).encode());os.link(directory/'ownership.pending',directory/'ownership.json')
        (directory/'pgdata').mkdir();(directory/'pgdata'/'synthetic').write_bytes(b'test')
        self.tree.check();self.assertEqual(self.tree.directory,directory)
        self.tree.check()
    def test_existing_run_or_second_run_is_not_adopted(self):
        self.parent.mkdir();(self.parent/'nhpg1-OLD').mkdir()
        with self.assertRaisesRegex(S.Refusal,'cluster-existing-output'):self.tree.prepare()
    def test_second_fresh_directory_refuses(self):
        self.tree.prepare();self.parent.mkdir();(self.parent/'nhpg1-A').mkdir();(self.parent/'nhpg1-B').mkdir()
        with self.assertRaisesRegex(S.Refusal,'cluster-count'):self.tree.check()
    def test_missing_retained_directory_or_wrong_prefix_refuses(self):
        self.tree.prepare();self.parent.mkdir();directory=self.parent/'wrong';directory.mkdir()
        with self.assertRaisesRegex(S.Refusal,'cluster-name'):self.tree.check()
    def test_marker_drift_and_nonidentical_pending_refuse(self):
        self.tree.prepare();self.parent.mkdir();directory=self.parent/'nhpg1-UNIT01';directory.mkdir()
        value={'schema':'native-hierarchy-postgres/v1','nonce':'a'*48,'runDirectory':str(directory)}
        (directory/'ownership.pending').write_bytes(json.dumps(value).encode());os.link(directory/'ownership.pending',directory/'ownership.json');self.tree.check()
        value['nonce']='b'*48;(directory/'ownership.pending').write_bytes(json.dumps(value).encode())
        with self.assertRaisesRegex(S.Refusal,'cluster-marker-drift'):self.tree.check()
    def test_marker_raced_bytes_must_join_streamed_pin_before_parse(self):
        self.tree.prepare();self.parent.mkdir();directory=self.parent/'nhpg1-UNIT01';directory.mkdir()
        value={'schema':'native-hierarchy-postgres/v1','nonce':'a'*48,'runDirectory':str(directory)}
        (directory/'ownership.pending').write_bytes(json.dumps(value).encode());os.link(directory/'ownership.pending',directory/'ownership.json')
        with patch.object(S,'hash_regular_file',return_value='0'*64):
            with self.assertRaisesRegex(S.Refusal,'cluster-marker'):self.tree.check()
        self.assertIsNone(self.tree.marker)



class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='.source-test-',dir=Path(__file__).resolve().parent)
        self.root = Path(self.temporary.name)
        self.here = self.root/'fixture'
        self.here.mkdir()
        (self.here/'supervise.py').write_bytes(b'invented fixture, never executed\n')
        self.patchers = (patch.object(S,'REPO',self.root),patch.object(S,'HERE',self.here),
                         patch.object(S,'OWN','fixture/'))
        for item in self.patchers:
            item.start()

    def tearDown(self):
        for item in reversed(self.patchers):
            item.stop()
        self.temporary.cleanup()

    def test_exclusive_fixed_publication_and_original_pending_bytes(self):
        publisher = S.ExclusivePublisher()
        publisher.prepare()
        result = {'schema':'native-hierarchy-postgres-supervisor/v1','accepted':False}
        checks = []
        def checkpoint():
            checks.append(True)
        publisher.publish(result,b'synthetic tap',b'opaque warning',checkpoint)
        self.assertEqual(len(checks),3)
        self.assertEqual((publisher.root/'result.json').read_bytes(),S.canonical_json(result))
        self.assertEqual((publisher.root/'.pending-result.json').read_bytes(),S.canonical_json(result))
        self.assertEqual((publisher.root/'stdout.bin').read_bytes(),b'synthetic tap')
        with self.assertRaisesRegex(S.Refusal,'publication-state'):
            publisher.publish(result,b'',b'',checkpoint)

    def test_existing_output_is_never_adopted_or_reset(self):
        first = S.ExclusivePublisher()
        first.prepare()
        (first.root/'temp'/'keep.txt').write_bytes(b'keep')
        with self.assertRaisesRegex(S.Refusal,'output-fresh'):
            S.ExclusivePublisher().prepare()
        self.assertEqual((first.root/'temp'/'keep.txt').read_bytes(),b'keep')

    def test_total_bound_checked_before_new_physical_write(self):
        publisher = S.ExclusivePublisher()
        publisher.prepare()
        (publisher.root/'temp'/'payload.bin').write_bytes(b'a'*(400*1024))
        with self.assertRaisesRegex(S.Refusal,'output-total'):
            publisher._write('stdout.bin',b'b'*(256*1024),256*1024)
        self.assertFalse((publisher.root/'stdout.bin').exists())

    def test_stdout_limit_cannot_be_truncated_into_success(self):
        publisher = S.ExclusivePublisher()
        publisher.prepare()
        with self.assertRaisesRegex(S.Refusal,'publication-size'):
            publisher.publish({'schema':'native-hierarchy-postgres-supervisor/v1'},b'x'*(S.CAPS['stdout']+1),b'',lambda:None)
        self.assertFalse((publisher.root/'result.json').exists())

    def test_failed_final_checkpoint_never_implies_successful_outer_process(self):
        publisher = S.ExclusivePublisher()
        publisher.prepare()
        calls=[]
        def checkpoint():
            calls.append(True)
            if len(calls)==3:
                raise S.Refusal('deadline')
        with self.assertRaisesRegex(S.Refusal,'deadline'):
            publisher.publish({'schema':'native-hierarchy-postgres-supervisor/v1','accepted':True},b'',b'',checkpoint)
        # Deliberately retained linked artifact, but function raised: callers
        # must require supervisor exit0, not merely a linked accepted field.
        self.assertTrue((publisher.root/'result.json').exists())


if __name__ == '__main__':
    unittest.main()
