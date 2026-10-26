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
from report import validate_completion
from report_test import valid_tap
from windows_test import FakeAPI, W


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
            'physicalFree': 2048*S.MIB, 'commitFree': 2048*S.MIB,
            'cFree': 3072*S.MIB, 'dFree': 5120*S.MIB}


class JoinedAPI(FakeAPI):
    def __init__(self, clock):
        super().__init__()
        self.clock = clock
        self.exit_at = 0.02
        self.eof_at = 0.04
        self.streams['stdout'].extend(valid_tap())
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
        self.api.host_row['commitFree'] = 1632*S.MIB-1
        result = c.run()
        self.assertFalse(result['accepted'])
        self.assertEqual(result['primary'], {'code':'resource-floor', 'counter':'commitFree',
                                            'value':1632*S.MIB-1})
        self.assertEqual(self.api.calls, [])

    def test_authentication_time_is_charged_to_original_epoch(self):
        c = self.setup_controller()
        c.authenticate = lambda: setattr(self.clock, 'value', 120)
        result = c.run()
        self.assertEqual(result['primary']['code'], 'deadline')
        self.assertEqual(self.api.calls, [])

    def test_each_host_floor_refuses_without_child(self):
        for key, floor in (('physicalFree',1632),('commitFree',1632),('cFree',2048),('dFree',4096)):
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
        for cpu, peak, counter in ((60.01,0,'jobCpuSeconds'),(0,512*S.MIB+1,'historicalPeakJobMemoryBytes')):
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
        self.api.exit_at, self.api.eof_at = 119.5, 121
        result = c.run()
        self.assertTrue(result['accepted'], result)
        self.assertEqual(self.clock.value, 121)

    def test_living_child_at120_fails_and_is_not_retried(self):
        c = self.setup_controller()
        self.clock.step = 1
        self.api.exit_at = 200
        result = c.run()
        self.assertEqual(result['primary']['code'], 'deadline')
        self.assertEqual(self.api.calls.count('create-process'), 1)
        self.assertEqual(self.api.calls.count('terminate-job'), 1)
        self.assertTrue(result['endPinsChecked'])

    def test_original_nonzero_exit_never_passes_complete_tap(self):
        c = self.setup_controller()
        self.api.code = 1
        result = c.run()
        self.assertFalse(result['accepted'])
        self.assertEqual(result['completion']['code'], 'exit-status')

    def test_missing_tap_child_and_trailing_data_fail(self):
        for data in (valid_tap()[:-50], valid_tap()+b'private trailing row\n'):
            c = self.setup_controller()
            self.api.streams['stdout'] = bytearray(data)
            result = c.run()
            self.assertEqual(result['primary']['code'], 'completion')
            self.assertNotIn('private', json.dumps(result))

    def test_output_overflow_cannot_pass_or_grow_capture(self):
        c = self.setup_controller()
        self.api.exit_at = 200
        self.api.streams['stdout'] = bytearray(b'x'*(S.CAPS['stdout']+4096))
        result = c.run()
        self.assertFalse(result['accepted'])
        self.assertLessEqual(len(c.buffers['stdout']), S.CAPS['stdout'])
        self.assertIn('terminate-job', self.api.calls)
        self.assertTrue(result['native']['stdoutEof'])

    def test_primary_is_preserved_when_cleanup_resource_guard_fails(self):
        c = self.setup_controller()
        self.api.fail = 'resume'
        self.api.host_row['commitFree'] = 2048*S.MIB
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

    def test_early_cleanup_cannot_silently_expand_to150(self):
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
        self.assertEqual(result['cleanupClassification'], 'unverified-may-use-kill-on-close')

    def test_one_shot_no_retry_or_cap_raise(self):
        c = self.setup_controller()
        self.assertTrue(c.run()['accepted'])
        with self.assertRaises(S.Refusal):
            c.run()
        self.assertEqual(self.api.calls.count('create-process'), 1)
        self.assertEqual(self.api.rows['memory'], 512*S.MIB)


class CatalogTests(unittest.TestCase):
    def fixture(self, keys=('a.js','folder/b.sql')):
        self.body = {key: ('fixture '+key).encode() for key in keys}
        self.calls = []
        value = {'schema':'native-hierarchy-fixture-catalog/v1', 'files':[
            {'key':key, 'bytes':len(self.body[key]), 'sha256':hashlib.sha256(self.body[key]).hexdigest()}
            for key in sorted(keys)]}
        return value

    def run_catalog(self, value, expected=None, raw=None, pin=None):
        data = S.canonical_json(value) if raw is None else raw
        expected = frozenset(self.body) if expected is None else expected
        def hash_file(key, size):
            self.calls.append(key)
            self.assertEqual(size, len(self.body[key]))
            return hashlib.sha256(self.body[key]).hexdigest()
        return S.authenticate_catalog(data, hashlib.sha256(data).hexdigest() if pin is None else pin,
                                      expected, hash_file)

    def test_exact_canonical_catalog_and_fixed_logical_binary_keys(self):
        value = self.fixture(('@node','@python','a.js'))
        self.assertEqual(self.run_catalog(value), value)
        self.assertEqual(self.calls, sorted(self.body))

    def test_external_file_sha_precedes_json_parse_and_any_body_follow(self):
        value = self.fixture()
        with self.assertRaisesRegex(S.Refusal, 'catalog-file-pin'):
            self.run_catalog(value, raw=b'not even JSON', pin='0'*64)
        self.assertEqual(self.calls, [])

    def test_noncanonical_and_duplicate_json_refused_before_body_reads(self):
        value = self.fixture()
        variants = [json.dumps(value).encode(), S.canonical_json(value)+b'\n',
                    S.canonical_json(value).replace(b'{',b'{"schema":"duplicate",',1),
                    S.canonical_json(value).replace(b'"bytes":',b'"bytes":NaN,"other":',1)]
        for data in variants:
            with self.subTest(data=data[:30]):
                with self.assertRaises(S.Refusal):
                    self.run_catalog(value, raw=data)
                self.assertEqual(self.calls, [])

    def test_order_missing_extra_and_case_aliases_fail_before_body_reads(self):
        value = self.fixture()
        value['files'].reverse()
        with self.assertRaisesRegex(S.Refusal, 'catalog-key-set'):
            self.run_catalog(value)
        value = self.fixture(('A.js','a.js'))
        with self.assertRaisesRegex(S.Refusal, 'catalog-key-set'):
            self.run_catalog(value)
        value = self.fixture(('a.js','a.js/b.sql'))
        with self.assertRaisesRegex(S.Refusal, 'catalog-key-set'):
            self.run_catalog(value)
        value = self.fixture()
        with self.assertRaises(S.Refusal):
            self.run_catalog(value, expected=frozenset({'other.js'}))
        self.assertEqual(self.calls, [])

    def test_path_grammar_rejects_windows_escape_devices_and_unsafe_components(self):
        for key in ('../a','a/../b','/a','C:/a','a\\b','a:b','//server/a','a//b',
                    'a/./b','a.','a ','CON','nul.txt','a/LPT1.js','a/COM9','a/\x00b','a/é.js'):
            with self.subTest(key=key):
                self.assertFalse(S.safe_key(key))
        self.assertTrue(S.safe_key('apps/package-name/@scope/a.js'))

    def test_closed_schema_entry_types_and_byte_limits(self):
        for size in (True,0,-1,128*S.MIB+1,1.0,'1'):
            value = self.fixture()
            value['files'][0]['bytes'] = size
            with self.assertRaisesRegex(S.Refusal, 'catalog-entry'):
                self.run_catalog(value)
            self.assertEqual(self.calls, [])
        value = self.fixture()
        value['files'][0]['command'] = 'not executable authority'
        with self.assertRaisesRegex(S.Refusal, 'catalog-shape'):
            self.run_catalog(value)

    def test_body_pin_mismatch_fails_without_accepting_subset(self):
        value = self.fixture()
        value['files'][0]['sha256'] = '0'*64
        with self.assertRaisesRegex(S.Refusal, 'catalog-content-pin'):
            self.run_catalog(value)
        self.assertEqual(len(self.calls),1)

    def test_raw_and_total_bounds_precede_follow(self):
        value = self.fixture()
        with self.assertRaisesRegex(S.Refusal, 'catalog-input'):
            self.run_catalog(value, raw=b' '*(S.CATALOG_LIMIT+1))
        value = self.fixture(('a','b','c'))
        for row in value['files']:
            row['bytes'] = 128*S.MIB
        with self.assertRaisesRegex(S.Refusal, 'catalog-total'):
            self.run_catalog(value)
        self.assertEqual(self.calls, [])

    def test_streamed_regular_file_hash_and_changed_size(self):
        with tempfile.TemporaryDirectory(prefix='.source-test-', dir=Path(__file__).resolve().parent) as temporary:
            root = Path(temporary)
            path = root/'fixture.dat'
            data = b'a'*140000
            with path.open('wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            self.assertEqual(S.hash_regular_file(root,'fixture.dat',len(data)),hashlib.sha256(data).hexdigest())
            with self.assertRaisesRegex(S.Refusal, 'file-size'):
                S.hash_regular_file(root,'fixture.dat',len(data)-1)
            with self.assertRaises(S.Refusal):
                S.checked_path(root,'../fixture.dat')

    def test_directory_and_symlink_cannot_be_regular_input(self):
        with tempfile.TemporaryDirectory(prefix='.source-test-', dir=Path(__file__).resolve().parent) as temporary:
            root = Path(temporary)
            (root/'directory').mkdir()
            with self.assertRaisesRegex(S.Refusal, 'file-kind'):
                S.checked_path(root,'directory')
            # Simulate the Windows reparse attribute without requiring symbolic
            # link privileges or creating host junctions in a pure test.
            class Info:
                st_mode = 0o100644
                st_file_attributes = 0x400
            self.assertFalse(S.no_reparse(Info()))

    def test_windows_cross_api_ctime_difference_keeps_each_namespace_fenced(self):
        def row(ctime=10,**changes):
            values = dict(st_dev=1,st_ino=2,st_size=3,st_mtime_ns=5,st_birthtime_ns=7,st_ctime_ns=ctime)
            values.update(changes)
            return SimpleNamespace(**values)
        with patch.object(S.os,'name','nt'):
            S.verify_file_identity(row(10),row(20),row(20),row(10),3,3)
            for before,opened,after_open,after in (
                (row(10),row(20),row(21),row(10)),
                (row(10),row(20),row(20),row(11)),
                (row(10),row(20,st_ino=9),row(20),row(10)),
                (row(10),row(20,st_birthtime_ns=8),row(20),row(10)),
                (row(10),row(20),row(20,st_mtime_ns=6),row(10)),
                (row(10),row(20),row(20),row(10,st_size=4))):
                with self.assertRaisesRegex(S.Refusal,'file-identity'):
                    S.verify_file_identity(before,opened,after_open,after,3,3)


class FixedInventoryTests(unittest.TestCase):
    def test_literal_scope_and_package_inventory_without_app_import(self):
        self.assertEqual(len(S.LOCAL_JS),53)
        self.assertEqual(len(S.SQL_KEYS),11)
        self.assertEqual(len(S.scope_absences()),29)
        self.assertEqual(len(S.fixed_package_inventory(S.REPO)),456)
        catalog = S.FileCatalog('0'*64)
        self.assertIsNone(catalog.value)
        keys = catalog._inventory()
        self.assertTrue(S.HARNESS_KEYS <= keys)
        self.assertTrue(frozenset(S.RUNTIME_PINS) <= keys)
        self.assertEqual(len(keys),544)

    def test_fixed_composition_refuses_nonisolated_test_interpreter_before_native(self):
        # This test interpreter intentionally lacks -I/-S. The SOURCE runner
        # must refuse before catalog/output/native construction.
        with self.assertRaisesRegex(S.Refusal,'python-flags'):
            S.execute_fixed_fixture('0'*64)

    def test_authenticated_pure_module_loader_refuses_bad_pin_and_unknown_name(self):
        key = S.OWN+'report.py'
        data = (S.REPO/key).read_bytes()
        pins = {key:{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}}
        module = S.load_fixed_module('report',pins)
        self.assertTrue(module.validate_completion(valid_tap(),b'',0)['accepted'])
        pins[key]['sha256'] = '0'*64
        with self.assertRaisesRegex(S.Refusal,'module-pin'):
            S.load_fixed_module('report',pins)
        with self.assertRaisesRegex(S.Refusal,'module-name'):
            S.load_fixed_module('../arbitrary',pins)

    def test_actual_composition_with_only_fake_native_catalog_and_publisher(self):
        clock, events = Clock(), []
        api = JoinedAPI(clock)
        boundary = W.OwnedFixtureProcess(None,api)
        def host():
            self.assertIn('authenticate',events)
            events.append('host')
            return resources()
        baseline = SimpleNamespace(abi=lambda:{'valid':True},
                                   WindowsNative=lambda:SimpleNamespace(resources=lambda _:host()))
        def factory(_):
            self.assertIn('host',events)
            events.append('boundary')
            return boundary
        modules = {'baseline':baseline,'report':SimpleNamespace(validate_completion=validate_completion),
                   'windows':SimpleNamespace(REPO=S.REPO,TEMP=S.HERE/'output'/'temp',OwnedFixtureProcess=factory)}
        class Catalog:
            def __init__(self,pin):
                self.value = None
            def authenticate(self):
                events.append('authenticate')
                self.value = {'files':[]}
            def end_pins(self):
                events.append('end-pins')
        class Publisher:
            prepared = False
            def prepare(self):
                events.append('prepare')
                self.prepared = True
            def check(self):
                return 0
            def publish(self,result,stdout,stderr,checkpoint):
                self_outer.assertTrue(result['accepted'])
                self_outer.assertEqual(stdout,valid_tap())
                checkpoint()
                events.append('publish')
        self_outer = self
        with patch.object(S,'FileCatalog',Catalog),patch.object(S,'ExclusivePublisher',Publisher),\
             patch.object(S,'load_fixed_module',lambda name,pins:modules[name]),\
             patch('sys.flags',SimpleNamespace(isolated=True,no_site=True,dont_write_bytecode=True)),\
             patch('time.monotonic',clock.now),patch('time.sleep',clock.pause):
            result = S.execute_fixed_fixture('0'*64)
        self.assertTrue(result['accepted'])
        self.assertLess(events.index('authenticate'),events.index('prepare'))
        self.assertLess(events.index('prepare'),events.index('host'))
        self.assertLess(events.index('end-pins'),events.index('publish'))
        self.assertEqual(api.calls.count('create-process'),1)

    def test_cli_has_only_external_hash_selector_and_no_accidental_default_run(self):
        for args in ([],['--help'],['0'*64,'other'],['C:/other.exe'],['F'*64]):
            with patch.object(S,'execute_fixed_fixture') as execute,patch('sys.stderr',io.StringIO()):
                self.assertEqual(S.main(args),2)
                execute.assert_not_called()
        for accepted in (True,False):
            with patch.object(S,'execute_fixed_fixture',return_value={'accepted':accepted}) as execute,\
                 patch('sys.stdout',io.StringIO()) as output:
                self.assertEqual(S.main(['0'*64]),0 if accepted else 1)
                self.assertEqual(json.loads(output.getvalue())['accepted'],accepted)
                execute.assert_called_once_with('0'*64)
        with patch.object(S,'execute_fixed_fixture',side_effect=RuntimeError('private raw data')),\
             patch('sys.stderr',io.StringIO()) as error:
            self.assertEqual(S.main(['0'*64]),1)
            self.assertNotIn('private',error.getvalue())


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
        result = {'schema':'native-hierarchy-fixture-supervisor/v1','accepted':False}
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
            publisher.publish({'schema':'native-hierarchy-fixture-supervisor/v1'},b'x'*(S.CAPS['stdout']+1),b'',lambda:None)
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
            publisher.publish({'schema':'native-hierarchy-fixture-supervisor/v1','accepted':True},b'',b'',checkpoint)
        # Deliberately retained linked artifact, but function raised: callers
        # must require supervisor exit0, not merely a linked accepted field.
        self.assertTrue((publisher.root/'result.json').exists())


if __name__ == '__main__':
    unittest.main()
