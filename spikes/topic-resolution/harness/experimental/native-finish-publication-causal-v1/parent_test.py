"""Offline SOURCE coupling only; no parent import, __init__, CLI or native helper.

The Node-ms and Python-seconds schedules share cases.json, not a concurrent pipe.
Every OS-facing capability reachable by the selected methods is replaced.
"""
import ast
from collections import deque
import ctypes
import hashlib
import json
import math
from pathlib import Path
import queue
import re
import types
import unittest

REPO = Path(__file__).resolve().parents[5]
ROOT = 'spikes/topic-resolution/harness/experimental/native-specificity-study-v20/'
BASE = REPO / ROOT
LIST_PIN = '42b2ec9b72d211faae5675d426f610a3771ba31a68fe5562840e89292a0dc10c'
MAP_PIN = '4b93a7cba660846d09197d6c1f28da6c3a668e416eaab68d80233bf4a250053f'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
list_raw = (BASE / 'source-paths.js').read_bytes()
assert sha(list_raw) == LIST_PIN
map_raw = (BASE / 'reviewed-sources-r3.json').read_bytes()
assert sha(map_raw) == MAP_PIN
keys = json.loads(re.search(r'export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\);', list_raw.decode()).group(1))
pins = json.loads(map_raw)['sourceHashes']
assert len(keys) == 128 and list(pins) == keys
sources = {}
for key in keys:
    raw = (REPO / key).read_bytes()
    assert sha(raw) == pins[key]
    sources[key] = raw
baseline = REPO / 'spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/freeze.json'
baseline_pin = '908ed69a9b1e42ed6fb0de7ac0d0862ffb5fe8964cf368701cb442085e1091bb'
baseline_raw = baseline.read_bytes()
assert sha(baseline_raw) == baseline_pin
package_pins = {key: value for key, value in json.loads(baseline_raw.removesuffix(b'\n'))['sourceHashes'].items()
                if key.startswith('node_modules/playwright-core/')}
assert len(package_pins) == 115
package_bytes = 0
for key, value in package_pins.items():
    assert re.fullmatch(r'node_modules/playwright-core/[A-Za-z0-9._/-]+', key)
    assert all(part and part not in ('.', '..') for part in key.split('/'))
    raw = (REPO / 'spikes/topic-resolution/harness/experimental/playwright-dev-v1' / key).read_bytes()
    assert len(raw) <= 4194304 and sha(raw) == value
    package_bytes += len(raw)
assert package_bytes == 13656167
cases_path = Path(__file__).with_name('cases.json')
cases_raw = cases_path.read_bytes()
CASES = json.loads(cases_raw)
assert CASES['schema'] == 'native-finish-publication-causal-cases/v1'
assert CASES['physicalCrossLanguageIpc'] is False


def forbidden(*_args, **_kwargs):
    raise AssertionError('unexpected actual capability')


class Clock:
    def __init__(self):
        self.now = 0
        self.on_pause = None

    def pause(self, seconds):
        self.now += seconds
        if self.on_pause is not None:
            self.on_pause()


def selected(clock):
    # Exact AST definitions, not rewritten bodies or a complete module import.
    wanted = {'refuse', 'sha', 'wire', 'strict', 'strict_node_json', 'exact',
              'require', 'hash_value', 'integer', 'ProofFrames', 'ProofService',
              'NativeSession', 'tracked_pipe_write', 'pause_if_idle',
              'inspect_fixed_path', 'failure_projection', 'run_session', 'enumeration_stats'}
    constants = {'SUPERVISOR_FAILURE_CODES', 'CENSUS_FAILURE_CODES', 'GUARDIAN_FAILURE_CODES'}
    tree = ast.parse(sources[ROOT + 'supervise.py'])
    nodes = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in wanted:
            nodes.append(node)
        elif isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in constants for t in node.targets):
            nodes.append(node)
    assert {n.name for n in nodes if isinstance(n, (ast.FunctionDef, ast.ClassDef))} == wanted
    ns = {'__name__': '_selected_actual_parent', 'Path': Path, 'REPO': Path('/invented-repo'),
          'WORKSPACE': Path('/invented-workspace'), 'MIB': 1048576,
          'json': json, 'hashlib': hashlib, 'math': math, 're': re,
          'deque': deque, 'queue': queue, 'ctypes': ctypes,
          'time': types.SimpleNamespace(monotonic=lambda: clock.now, sleep=clock.pause),
          'threading': types.SimpleNamespace(Thread=forbidden)}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), '<authenticated-selected-parent>', 'exec'), ns)
    return ns


class FakePath:
    def __init__(self, fixture, name=''):
        self.fixture, self.name = fixture, name

    def __truediv__(self, name):
        return FakePath(self.fixture, name)

    def exists(self):
        return self.name == 'finish.request.json' and self.fixture.visible

    def lstat(self):
        raise FileNotFoundError()


class Thread:
    def __init__(self, target, mode):
        self.target, self.mode, self.alive = target, mode, False

    def start(self):
        self.alive = True
        if self.mode == 'immediate':
            self.settle()

    def settle(self):
        assert self.alive
        try:
            self.target()
        finally:
            self.alive = False

    def is_alive(self):
        return self.alive

    def join(self, timeout):
        assert timeout >= 0


class Fixture:
    def __init__(self, *, delay=True, writer='immediate', exit_after_reply=False):
        self.clock = Clock()
        self.ns = ns = selected(self.clock)
        self.events = []
        self.visible = True
        self.writer_mode = writer
        self.write_failure = False
        self.exit_after_reply = exit_after_reply
        self.finished_reply = False
        self.exit_status = None
        self.delayed = delay
        self.drifts = False
        self.result_drift = False
        self.extra_frame = None
        self.caught = None
        self.nonce_index = 0
        self.active_nonce = None
        self.session = s = ns['NativeSession'].__new__(ns['NativeSession'])
        s.phase = 'prepare'
        s.source_identity = 'a' * 64
        s.literal_pin = 'b' * 64
        s.output = FakePath(self)
        s.guardian = None
        s.started = 0
        s.phase_active = 360
        s.failure = None
        s.job = None
        s.frame_until = None
        s.allowed = {'workspace:finish.request.json': Path('/invented/final')}
        s.pending_physical = set()
        s.writers = []
        s.frames = ns['ProofFrames']()
        # Actual guarded/raw_guard run without a Job; no OS resource query can
        # occur. Their ORIGINAL phase/frame clock checks remain executable.
        s.sample = lambda: None
        s.startup_bindings = lambda: {k: 'c' * 64 for k in ('sourceMapHash', 'nodeIdentityHash', 'readySha256', 'startupAckSha256', 'baselineHash')}
        proof = lambda key: {'pathKey': key, 'ancestorsChecked': True, 'openedIdentityChecked': True,
                             'attributes': 0, 'identity': {'volumeSerial': '7', 'fileIndex': '9', 'creationFiletime': '9', 'size': '20', 'fileType': 'file'}, 'atomic': False}
        s.service = ns['ProofService']('prepare', s.source_identity, s.allowed, proof, s.guarded)
        # Test-capability adapter only: original tracked_pipe_write executes its
        # unmodified target/pending/deadline/join logic with a fake thread.
        original_writer = ns['tracked_pipe_write']
        ns['tracked_pipe_write'] = lambda action, pending, guard, until, retain: original_writer(
            action, pending, guard, until, retain, lambda: self.clock.now,
            self.clock.pause, self.thread_factory)
        fixture = self

        class Stream:
            def write(self, _data):
                fixture.event('response-write')
                if fixture.write_failure:
                    raise BrokenPipeError()

            def flush(self):
                fixture.event('response-flush')
                fixture.finished_reply = True

            def close(self):
                fixture.event('cleanup')

        class Process:
            stdin = Stream()
            stdout = Stream()
            returncode = None

            def poll(self):
                if fixture.exit_after_reply and fixture.finished_reply:
                    fixture.exit_status = 1
                return fixture.exit_status

            def kill(self):
                fixture.exit_status = 1

            def wait(self, timeout):
                assert timeout > 0
                self.returncode = fixture.exit_status

        s.child = Process()
        cp = {'sequence': 0, 'chainHash': None}
        self.result = {'schema': 'native-specificity-study-prepared/v1', 'phase': 'prepare',
                       'sourceIdentityHash': s.source_identity, **s.startup_bindings(),
                       'freezeSha256': 'd' * 64, 'fsProofCheckpoint': cp,
                       'sourceAssetEndchecksPassed': True, 'productionValidated': False, 'assignmentAuthority': False}
        self.result_raw = ns['wire'](self.result)
        self.request = {'schema': 'native-specificity-finish-request/v1', 'phase': 'prepare',
                        'sourceIdentityHash': s.source_identity, **s.startup_bindings(),
                        'resultSha256': ns['sha'](self.result_raw), 'selectionSha256': None,
                        'finalDrainAckHash': None, 'fsProofCheckpoint': cp}
        self.controls = {'result.json': self.result_raw, 'freeze.json': b'invented-freeze',
                         'finish.request.json': ns['wire'](self.request)}

        def read_control(name, _cap):
            if name == 'result.json':
                self.event('parent-result')
                return ns['wire']({**self.result, 'phase': 'test'}) if self.result_drift else self.result_raw
            return self.controls[name]

        s.read_control = read_control
        # Deliberately fake freeze validation, not a claim about actual assets,
        # saved controls or decode_freeze. Other result predicates are actual.
        ns['decode_freeze'] = lambda raw, pin, literal: ns['require'](
            raw == b'invented-freeze' and pin == 'd' * 64 and literal == s.literal_pin)

        def recheck():
            self.event('parent-recheck')
            if self.delayed:
                self.clock.now += CASES['validationMilliseconds'] / 1000
            if self.drifts:
                ns['refuse']('source-drift')
            return True

        s.recheck = recheck

        def publish(_path, raw, before_link):
            before_link()
            assert not s.pending_physical and not s.service.before and s.service.prepared is None
            self.event('finish-ack')
            return ns['sha'](raw)

        s.parent_publish = publish
        # Seed a genuine before exchange by the actual pump. It is physically
        # written/committed before the invented final file becomes visible.
        self.queue_request('before')
        s.pump()
        assert s.service.sequence == 1 and s.service.before
        self.before_committed_at = self.clock.now
        self.events.clear()
        self.finished_reply = False
        self.queue_request('after')
        self.after_queued_at = self.clock.now
        assert self.before_committed_at == self.after_queued_at == 0
        # The SAME invented epoch as Node: pending exchange born0; parent sees
        # the visible file at6; expensive validation ends16. No lease is reset.
        self.clock.now = CASES['parentEntryMilliseconds'] / 1000

    def event(self, value):
        assert value in CASES['events'] and len(self.events) < CASES['maximumTraceEvents']
        self.events.append(value)

    def thread_factory(self, *, target, daemon, name):
        assert daemon is True and name == 'adr179-owned-proof-writer'
        return Thread(target, self.writer_mode)

    def queue_request(self, edge):
        s = self.session
        if edge == 'before':
            self.nonce_index += 1
            self.active_nonce = 'invented-original-' + str(self.nonce_index)
        raw = self.ns['wire']({'schema': 'native-specificity-fs-request/v1', 'sequence': s.service.sequence + 1,
                              'phase': 'prepare', 'sourceIdentityHash': s.source_identity,
                              'pathKey': 'workspace:finish.request.json', 'operationNonce': self.active_nonce,
                              'edge': edge, 'parentPathKey': None, 'priorChainHash': s.service.chain})
        s.frames.feed(raw + b'\n')

    def cleanup(self):
        s = self.session
        s.resource_observer = types.SimpleNamespace(in_cleanup=False)
        s.started = 0
        s.phase_active = 360
        s.helper = types.SimpleNamespace(kernel=types.SimpleNamespace(CloseHandle=forbidden, TerminateJobObject=forbidden))
        s.job = s.original = s.launch_handle = None
        s.assigned = False
        s.emergency = False
        s.reader = None
        s.output_handles = []
        return s.close()


class Causal(unittest.TestCase):
    def refused(self, code, action):
        with self.assertRaises(RuntimeError) as caught:
            action()
        self.assertEqual(caught.exception.args, (code,))
        return caught.exception

    def test_visible_parent_validates_before_queued_proof_and_can_ack_at16(self):
        f = Fixture()
        self.assertEqual((f.before_committed_at, f.after_queued_at, f.clock.now), (0, 0, 6))
        f.session.finish()
        self.assertLess(f.events.index('parent-recheck'), f.events.index('response-write'))
        self.assertEqual(f.clock.now, 16)
        self.assertEqual(f.session.service.sequence, 2)
        self.assertEqual(f.session.pending_physical, set())
        self.assertIn('finish-ack', f.events)
        # This is the actual parent's permitted ACK, NOT phase success. The
        # independent Node case fails its SAME original at16 against epoch0+15.
        # No synthetic exit is used to force these component outcomes to match.
        self.assertTrue(f.cleanup())

    def test_contrast_preservices_same_exchange_before_unchanged_finish(self):
        f = Fixture()
        previous = f.session.service.sequence
        f.session.pump()
        self.assertEqual(f.session.service.sequence, previous + 1)
        self.assertIsNone(f.session.service.prepared)
        self.assertFalse(f.session.pending_physical)
        self.assertEqual(f.events, ['response-write', 'response-flush'])
        # Checked observation of the actual completed pump, not a state setter.
        f.event('service-commit')
        f.session.finish()
        self.assertLess(f.events.index('response-flush'), f.events.index('parent-recheck'))
        self.assertLess(f.events.index('service-commit'), f.events.index('finish-ack'))
        self.assertEqual(f.clock.now, 16)
        f.exit_status = 0
        self.assertTrue(f.cleanup())

    def test_original_finish_and_phase_deadlines_are_not_renewed(self):
        for preservice in (False, True):
            with self.subTest(preservice=preservice):
                f = Fixture(delay=False)
                if preservice:
                    f.session.pump()
                def expired_validation():
                    f.event('parent-recheck')
                    f.clock.now += 16
                    return True
                f.session.recheck = expired_validation
                self.refused('finish-deadline', f.session.finish)
                self.assertNotIn('finish-ack', f.events)
                self.assertTrue(f.cleanup())
        f = Fixture()
        f.session.phase_active = 10
        self.refused('phase-deadline', f.session.finish)
        self.assertNotIn('finish-ack', f.events)
        self.assertTrue(f.cleanup())

    def test_actual_finish_can_ack_while_final_read_frame_arrives_after_empty_snapshot(self):
        f = Fixture(delay=False)
        injected = [False]
        def sampled_late_frame():
            if not injected[0]:
                self.assertTrue(f.session.frames.frames.empty())
                self.assertFalse(f.session.service.before)
                self.assertIsNone(f.session.service.prepared)
                f.event('final-read')
                f.queue_request('before')
                injected[0] = True
        f.session.sample = sampled_late_frame
        f.session.finish()
        self.assertTrue(injected[0])
        self.assertIn('finish-ack', f.events)
        self.assertFalse(f.session.frames.frames.empty())
        self.assertEqual(f.session.service.sequence, 2)
        self.assertFalse(f.session.service.before)
        self.assertIsNone(f.session.service.prepared)
        # No actual Node Promise is asserted settled by the Python queue. Serve
        # these same queued originals through the real pump after that ACK.
        f.session.pump()
        self.assertTrue(f.session.service.before)
        f.queue_request('after')
        f.session.pump()
        self.assertFalse(f.session.service.before)
        self.assertEqual(f.session.service.sequence, 4)
        self.assertTrue(f.cleanup())

    def test_prepared_reply_cannot_commit_while_same_writer_pending(self):
        f = Fixture(delay=False)
        f.writer_mode = 'held'
        f.clock.on_pause = lambda: setattr(f.clock, 'now', 22)
        first = self.refused('proof-frame-deadline', f.session.pump)
        self.assertIsNotNone(f.session.service.prepared)
        self.assertEqual(f.session.service.sequence, 1)
        self.assertEqual(len(f.session.pending_physical), 1)
        self.assertNotIn('response-flush', f.events)
        self.refused('pipe-writer-unsettled', f.cleanup)
        f.session.writers[-1].settle()
        self.assertEqual(f.session.pending_physical, set())
        self.assertEqual(f.session.service.sequence, 1)
        self.assertIsNotNone(f.session.service.prepared)
        self.assertTrue(f.cleanup())
        self.assertEqual(first.args, ('proof-frame-deadline',))

    def test_rejected_physical_write_preserves_uncommitted_service(self):
        f = Fixture(delay=False)
        f.write_failure = True
        self.refused('pipe-write-failed', f.session.pump)
        self.assertEqual(f.session.pending_physical, set())
        self.assertEqual(f.session.service.sequence, 1)
        self.assertIsNotNone(f.session.service.prepared)
        self.assertNotIn('response-flush', f.events)
        self.assertTrue(f.cleanup())

    def test_original_deadline_before_and_after_physical_settlement(self):
        for when in ('before', 'after'):
            with self.subTest(edge=when):
                f = Fixture(delay=False)
                pending, threads, actions = set(), [], []
                original = f.ns['tracked_pipe_write']
                # This name is a capability-only adapter to the actual helper.
                f.clock.now = 1
                if when == 'before':
                    f.clock.now = 2
                def action():
                    actions.append('physical')
                    f.clock.now = 2
                code = 'pipe-write-deadline' if when == 'before' else 'pipe-write-failed'
                self.refused(code, lambda: original(action, pending, lambda: None, 2, threads.append))
                self.assertEqual(actions, [] if when == 'before' else ['physical'])
                self.assertEqual(pending, set())

    def test_source_result_phase_and_finish_binding_refusals(self):
        for kind, code in (('source', 'source-drift'), ('result', 'prepare-result'), ('binding', 'finish-request')):
            with self.subTest(case=kind):
                f = Fixture(delay=False)
                f.drifts = kind == 'source'
                f.result_drift = kind == 'result'
                if kind == 'binding':
                    f.controls['finish.request.json'] = f.ns['wire']({**f.request, 'phase': 'test'})
                self.refused(code, f.session.finish)
                self.assertNotIn('finish-ack', f.events)
                self.assertTrue(f.cleanup())

    def test_actual_checkpoint_malformed_mismatched_and_evicted(self):
        for mode in ('malformed', 'mismatched', 'evicted'):
            with self.subTest(case=mode):
                f = Fixture(delay=False)
                if mode == 'malformed':
                    cp = {'sequence': True, 'chainHash': None}
                elif mode == 'mismatched':
                    cp = {'sequence': 1, 'chainHash': 'f' * 64}
                else:
                    for i in range(2, 66):
                        f.session.service.checkpoints.append({'sequence': i, 'chainHash': 'e' * 64})
                    cp = {'sequence': 0, 'chainHash': None}
                f.controls['finish.request.json'] = f.ns['wire']({**f.request, 'fsProofCheckpoint': cp})
                self.refused('proof-checkpoint', f.session.finish)
                self.assertNotIn('finish-ack', f.events)
                self.assertTrue(f.cleanup())

    def test_actual_parser_eof_queue_overflow_and_duplicate_frame(self):
        f = Fixture(delay=False)
        frames = f.ns['ProofFrames']()
        frames.feed(b'x')
        frames.end()
        self.refused('pipe-partial', frames.next)
        frames = f.ns['ProofFrames']()
        self.refused('pipe-queue', lambda: frames.feed(b'x\n' * 9))
        f.session.pump()
        f.queue_request('after')
        self.refused('proof-channel', f.session.pump)
        self.assertEqual(f.session.service.sequence, 2)

    def test_unexpected_exit_before_first_visible_request(self):
        f = Fixture(delay=False)
        f.visible = False
        f.exit_status = 1
        self.refused('node-exited-before-finish', f.session.finish)
        self.assertNotIn('finish-ack', f.events)
        self.assertTrue(f.cleanup())

    def test_separately_injected_process_exit_after_reply_is_not_wire_cause(self):
        f = Fixture(exit_after_reply=True)
        self.refused('finish-pending', f.session.finish)
        self.assertNotIn('finish-ack', f.events)
        self.assertTrue(f.cleanup())

    def test_sampler_masks_inner_guard_but_closes_retained_handles(self):
        f = Fixture(delay=False)
        opened, closed, calls = [], [], [0]
        def guard():
            calls[0] += 1
            if calls[0] == 8:
                f.ns['refuse']('proof-frame-deadline')
        def op(_path):
            opened.append(len(opened) + 1)
            return opened[-1]
        native = {'attributes': lambda _: 16, 'open': op, 'info': lambda _: {'attributes': 16, 'identity': {}},
                  'close': lambda h: closed.append(h)}
        error = self.refused('proof-failed', lambda: f.ns['inspect_fixed_path']('fixed', {'fixed': Path('/invented/file')}, native, guard))
        self.assertEqual(closed, list(reversed(opened)))
        self.assertGreater(len(opened), 1)
        self.assertEqual(f.ns['failure_projection'](error, {}), ({'family': 'supervisor', 'code': 'supervisor-failed'}, None))

    def test_first_failure_survives_secondary_cleanup_failure(self):
        f = Fixture(delay=False)
        f.writer_mode = 'held'
        f.clock.on_pause = lambda: setattr(f.clock, 'now', 22)
        first = self.refused('proof-frame-deadline', f.session.pump)
        second = self.refused('pipe-writer-unsettled', f.cleanup)
        self.assertIsNot(first, second)
        self.assertEqual(first.args, ('proof-frame-deadline',))
        f.session.writers[-1].settle()
        self.assertTrue(f.cleanup())

    def test_actual_run_session_reports_first_projection_and_separate_cleanup(self):
        f = Fixture(delay=False)
        ns = f.ns
        first, cleanup = RuntimeError('source-drift'), RuntimeError('finish-pending')
        calls, reports = [], []
        class ReportPath:
            def exists(self):
                return True
            def __truediv__(self, _name):
                return self
        class Session:
            def __init__(self, *_args):
                calls.append('constructor-capability')
                self.phase_active = 360
                self.child = types.SimpleNamespace(returncode=1)
                self.modules = {}
                self.policy = None
                self.stats = {}
                self.emergency = True
                self.phase_root = ReportPath()
                self.resource_observer = None
            def run(self):
                calls.append('original-run')
                raise first
            def close(self):
                calls.append('mandatory-close')
                raise cleanup
            def resource_diagnostic(self):
                return {'collectorPrimary': None, 'collectorCleanup': None, 'guardian': None}
        def publish(_path, raw, before):
            before()
            reports.append(ns['strict'](raw))
            calls.append('report-capability')
        ns['NativeSession'] = Session
        ns['publish'] = publish
        ns['report_reserve'] = lambda *_args, **_kwargs: None
        self.assertEqual(ns['run_session']('prepare', 0, {'invented-code': 'f' * 64}, {}, 'a' * 64, 'b' * 64, None), 1)
        self.assertEqual(calls, ['constructor-capability', 'original-run', 'mandatory-close', 'report-capability'])
        self.assertEqual(reports[0]['failure']['code'], 'source-drift')
        self.assertEqual(reports[0]['cleanupFailure'], {'family': 'supervisor', 'code': 'finish-pending'})
        self.assertFalse(reports[0]['normalExit'])
        self.assertFalse(reports[0]['ownCleanupPassed'])

    @classmethod
    def tearDownClass(cls):
        for key in keys:
            assert sha((REPO / key).read_bytes()) == pins[key]
        for key, value in package_pins.items():
            assert sha((REPO / 'spikes/topic-resolution/harness/experimental/playwright-dev-v1' / key).read_bytes()) == value
        assert (BASE / 'source-paths.js').read_bytes() == list_raw
        assert (BASE / 'reviewed-sources-r3.json').read_bytes() == map_raw
        assert sha(baseline.read_bytes()) == baseline_pin
        assert cases_path.read_bytes() == cases_raw


if __name__ == '__main__':
    unittest.main(verbosity=1)
