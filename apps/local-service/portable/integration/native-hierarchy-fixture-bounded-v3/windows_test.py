"""Pure fake-API tests. Never constructs WindowsNative or starts a child."""
import hashlib
import importlib.util
import json
from pathlib import Path, PureWindowsPath
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit, unquote

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('bounded_windows_under_test', HERE / 'windows.py')
W = importlib.util.module_from_spec(spec)
spec.loader.exec_module(W)


class FakeAPI:
    def __init__(self):
        self.calls = []
        self.fail = None
        self.serial = 0
        self.handles = {}
        self.closed = set()
        self.alive = True
        self.assigned = False
        self.code = 0
        self.rows = {'bytes': 144, 'expectedBytes': 144, 'flags': W.FLAGS,
                     'active': 1, 'memory': 1024*W.MIB}
        self.streams = {'stdout': bytearray(), 'stderr': bytearray()}
        self.ends = set()
        self.member_override = None

    def call(self, name):
        self.calls.append(name)
        if self.fail == name:
            raise RuntimeError(name)

    def handle(self, name):
        self.serial += 1
        self.handles[name] = self.serial
        return self.serial

    def create_job(self):
        self.call('create-job')
        return self.handle('job')

    def set_limits(self, job):
        self.call('set-limits')

    def read_limits(self, job):
        self.call('read-limits')
        return dict(self.rows)

    def create_pipe(self):
        stream = 'stdout' if 'stdoutRead' not in self.handles else 'stderr'
        self.call('pipe-'+stream)
        return self.handle(stream+'Read'), self.handle(stream+'Write')

    def noninheritable(self, handle):
        self.call('noninherit')
        assert handle in (self.handles.get('stdoutRead'), self.handles.get('stderrRead'))

    def open_stdin(self):
        self.call('stdin')
        return self.handle('stdin')

    def attributes(self, handles):
        self.call('attributes')
        assert handles == (self.handles['stdin'], self.handles['stdoutWrite'], self.handles['stderrWrite'])
        return object()

    def delete_attributes(self, attributes):
        self.call('delete-attributes')

    def create_process(self, attributes, stdin, stdout, stderr):
        self.call('create-process')
        assert not self.assigned
        return self.handle('process'), self.handle('thread'), 19

    def assign(self, job, process):
        self.call('assign')
        self.assigned = True
        return True

    def belongs(self, job, process):
        self.call('belongs')
        return self.assigned

    def resume(self, thread):
        self.call('resume')
        assert self.assigned
        return 1

    def members(self, job):
        self.call('members')
        if self.member_override is not None:
            return self.member_override
        # Deliberately retain exited PID until original process close.
        return (19,) if self.assigned and self.handles.get('process') not in self.closed else ()

    def resources(self, job):
        self.call('resources')
        return {'cpu': 0, 'committed': 0, 'accounting': None,
                'physicalFree': 2*1024*W.MIB, 'commitFree': 2*1024*W.MIB,
                'cFree': 3*1024*W.MIB, 'dFree': 5*1024*W.MIB}

    def stream(self, handle):
        return 'stdout' if handle == self.handles['stdoutRead'] else 'stderr'

    def peek(self, handle):
        self.call('peek')
        stream = self.stream(handle)
        return None if not self.streams[stream] and stream in self.ends else len(self.streams[stream])

    def read(self, handle, maximum):
        self.call('read')
        stream = self.stream(handle)
        data = bytes(self.streams[stream][:maximum])
        del self.streams[stream][:maximum]
        return data

    def exited(self, handle):
        self.call('exited')
        return not self.alive

    def exit_code(self, handle):
        self.call('exit-code')
        return self.code

    def terminate_process(self, handle):
        self.call('terminate-process')
        assert handle == self.handles['process'] and not self.assigned
        self.alive = False
        return True

    def terminate_job(self, handle):
        self.call('terminate-job')
        assert handle == self.handles['job'] and self.assigned
        self.alive = False
        return True

    def close_handle(self, handle):
        self.call('close-'+str(handle))
        assert handle not in self.closed
        self.closed.add(handle)
        return True


class Lifecycle(unittest.TestCase):
    def new(self):
        api = FakeAPI()
        return W.OwnedFixtureProcess(None, api), api

    def launched(self):
        obj, api = self.new()
        obj.initialize(lambda: None)
        obj.launch_suspended(lambda: None)
        return obj, api

    def test_constructor_is_inert(self):
        class Forbidden:
            def __getattribute__(self, name):
                raise AssertionError('No native access before initialize')
        obj = W.OwnedFixtureProcess(Forbidden())
        self.assertFalse(obj.snapshot()['processCreated'])

    def test_normal_exact_owned_lifecycle_and_held_exit_query(self):
        obj, api = self.launched()
        obj.assign_and_resume(lambda: None)
        self.assertLess(api.calls.index('assign'), api.calls.index('belongs'))
        self.assertLess(api.calls.index('members'), api.calls.index('resume'))
        self.assertIsNone(obj.poll_exit())
        api.alive = False
        self.assertEqual(obj.poll_exit(), 0)
        self.assertEqual(api.members(api.handles['job']), (19,))
        api.ends.update(('stdout', 'stderr'))
        for stream in ('stdout', 'stderr'):
            self.assertTrue(obj.read_available(stream)['eof'])
        state = obj.close()
        self.assertTrue(state['completeEmptyJob'] and state['allHandlesClosed'])
        self.assertFalse(state['emergency'])
        before = list(api.calls)
        obj.close()
        self.assertEqual(before, api.calls)
        self.assertNotIn('19', str(state))  # No raw process identity in projection.

    def test_sample_has_no_checkpoint_or_recursion(self):
        obj, api = self.new()
        obj.initialize(lambda: None)
        before = len(api.calls)
        self.assertEqual(obj.sample()['commitFree'], 2*1024*W.MIB)
        self.assertEqual(api.calls[before:], ['resources'])
        obj.close()

    def test_initialize_partial_failures_close_every_acquired_handle(self):
        for failure in ('create-job', 'set-limits', 'read-limits', 'pipe-stdout',
                        'noninherit', 'pipe-stderr', 'stdin', 'attributes'):
            with self.subTest(failure=failure):
                obj, api = self.new()
                api.fail = failure
                with self.assertRaises(RuntimeError):
                    obj.initialize(lambda: None)
                self.assertEqual(set(api.handles.values()), api.closed)
                self.assertNotIn('create-process', api.calls)

    def test_limit_mismatch_never_launches(self):
        for key, value in (('active', 8), ('memory', 513*W.MIB), ('flags', 0x2a08),
                           ('flags', 0x2208|0x1000), ('bytes', 143)):
            with self.subTest(key=key, value=value):
                obj, api = self.new()
                api.rows[key] = value
                with self.assertRaises(W.BoundaryFailure):
                    obj.initialize(lambda: None)
                self.assertEqual(api.closed, set(api.handles.values()))

    def test_failed_attempts_cannot_retry_initialization_launch_or_assignment(self):
        for operation, failure in (('initialize', 'create-job'), ('launch_suspended', 'create-process'),
                                   ('assign_and_resume', 'assign')):
            with self.subTest(operation=operation):
                obj, api = self.new()
                if operation != 'initialize':
                    obj.initialize(lambda: None)
                if operation == 'assign_and_resume':
                    obj.launch_suspended(lambda: None)
                api.fail = failure
                with self.assertRaises(RuntimeError):
                    getattr(obj, operation)(lambda: None)
                api.fail = None
                before = list(api.calls)
                with self.assertRaises(W.BoundaryFailure):
                    getattr(obj, operation)(lambda: None)
                self.assertEqual(before, api.calls)
                if obj.launched:
                    obj.terminate_owned()
                    obj.poll_exit()
                obj.close()

    def test_initialize_cleanup_failure_preserves_original_and_attempts_every_close(self):
        obj, api = self.new()
        original = RuntimeError('original checkpoint')
        def checkpoint():
            if 'stdoutRead' in obj.handles:
                api.fail = 'close-'+str(api.handles['stdoutRead'])
                raise original
        with self.assertRaises(RuntimeError) as caught:
            obj.initialize(checkpoint)
        self.assertIs(caught.exception, original)
        self.assertTrue(obj.snapshot()['closeFailure'])
        self.assertEqual(set(obj.handles), obj.attempted)

    def test_postcreate_guard_retains_both_originals(self):
        obj, api = self.new()
        obj.initialize(lambda: None)
        fault = RuntimeError('original guard')
        def checkpoint():
            if obj.launched:
                self.assertIn('process', obj.handles)
                self.assertIn('thread', obj.handles)
                raise fault
        with self.assertRaises(RuntimeError) as caught:
            obj.launch_suspended(checkpoint)
        self.assertIs(caught.exception, fault)
        with self.assertRaises(W.BoundaryFailure):
            obj.close()
        obj.terminate_owned()
        obj.terminate_owned()
        self.assertEqual(api.calls.count('terminate-process'), 1)
        obj.poll_exit()
        obj.close()
        self.assertEqual(api.closed, set(api.handles.values()))

    def test_assignment_latched_before_postguard_and_only_job_termination(self):
        obj, api = self.launched()
        def checkpoint():
            if obj.assigned:
                raise RuntimeError('postassign')
        with self.assertRaises(RuntimeError):
            obj.assign_and_resume(checkpoint)
        self.assertTrue(obj.assigned)
        self.assertNotIn('resume', api.calls)
        obj.terminate_owned()
        obj.poll_exit()
        obj.close()
        self.assertIn('terminate-job', api.calls)
        self.assertNotIn('terminate-process', api.calls)

    def test_postresume_checkpoint_cannot_hide_resumed_original(self):
        obj, api = self.launched()
        original = RuntimeError('postresume')
        def checkpoint():
            if obj.resumed:
                raise original
        with self.assertRaises(RuntimeError) as caught:
            obj.assign_and_resume(checkpoint)
        self.assertIs(caught.exception, original)
        self.assertTrue(obj.snapshot()['resumed'])
        obj.terminate_owned()
        obj.poll_exit()
        self.assertTrue(obj.close()['allHandlesClosed'])

    def test_membership_and_extra_member_fail_before_resume(self):
        for members in ((), (77,), (19, 77)):
            with self.subTest(members=members):
                obj, api = self.launched()
                api.member_override = members
                with self.assertRaises(W.BoundaryFailure):
                    obj.assign_and_resume(lambda: None)
                self.assertNotIn('resume', api.calls)
                api.member_override = None
                obj.terminate_owned()
                obj.poll_exit()
                obj.close()

    def test_per_stream_bounded_reads_and_eof_not_empty_availability(self):
        obj, api = self.launched()
        self.assertEqual(obj.read_available('stdout'), {'data': b'', 'eof': False})
        api.streams['stdout'].extend(b'a'*9000)
        api.streams['stderr'].extend(b'b'*33)
        self.assertEqual(len(obj.read_available('stdout')['data']), 4096)
        self.assertEqual(obj.read_available('stderr')['data'], b'b'*33)
        self.assertEqual(len(obj.read_available('stdout')['data']), 4096)
        self.assertEqual(len(obj.read_available('stdout')['data']), 808)
        api.ends.add('stdout')
        self.assertTrue(obj.read_available('stdout')['eof'])
        before = len(api.calls)
        self.assertTrue(obj.read_available('stdout')['eof'])
        self.assertEqual(len(api.calls), before)
        obj.terminate_owned()
        obj.poll_exit()
        obj.close()

    def test_exact_output_caps_no_silent_truncation(self):
        for stream, cap in W.OUTPUT_CAPS.items():
            with self.subTest(stream=stream):
                obj, api = self.launched()
                api.streams[stream].extend(b'x'*(cap+1))
                for _ in range(cap//W.READ_CHUNK):
                    self.assertEqual(len(obj.read_available(stream)['data']), W.READ_CHUNK)
                self.assertEqual(obj.counts[stream], cap)
                with self.assertRaises(W.BoundaryFailure):
                    obj.read_available(stream)
                self.assertEqual(obj.counts[stream], cap+1)
                obj.terminate_owned()
                obj.poll_exit()
                obj.close()

    def test_close_failure_attempts_others_without_retry(self):
        obj, api = self.launched()
        obj.terminate_owned()
        obj.poll_exit()
        failed = 'close-'+str(api.handles['thread'])
        api.fail = failed
        with self.assertRaises(RuntimeError):
            obj.close()
        self.assertTrue(obj.snapshot()['closeFailure'])
        api.fail = None
        obj.close()
        self.assertEqual(api.calls.count(failed), 1)
        self.assertFalse(obj.snapshot()['allHandlesClosed'])

    def test_closed_api_refuses_new_native_work(self):
        obj, api = self.launched()
        obj.terminate_owned()
        obj.poll_exit()
        obj.close()
        for action in (lambda: obj.initialize(lambda: None), lambda: obj.launch_suspended(lambda: None),
                       lambda: obj.assign_and_resume(lambda: None), obj.sample,
                       lambda: obj.read_available('stdout')):
            with self.assertRaises(W.BoundaryFailure):
                action()

    def test_source_fixed_launch_contract_and_baseline_authentication(self):
        baseline = W.REPO / 'spikes/topic-resolution/harness/experimental/native-job-list-observation-v2/run.py'
        self.assertEqual(hashlib.sha256(baseline.read_bytes()).hexdigest(),
            '8e0cf0aefd09a80c1c4971fa8515024b47ca47ab8eed28e4065acae02373c940')
        source = (HERE / 'windows.py').read_text('utf-8')
        self.assertEqual(W.CREATE_FLAGS, 0x80000|0x400|0x4|0x8)
        self.assertEqual(W.FLAGS, 0x2000|0x200|0x8)
        self.assertNotIn('subprocess', source)
        self.assertIn('True,\n            CREATE_FLAGS', source)
        self.assertIn("'NUL'", source)
        for flag in ('--max-old-space-size=64', '--test-isolation=none', '--test-concurrency=1', '--test-reporter=tap'):
            self.assertIn(flag, source)
        self.assertNotIn('NODE_OPTIONS=', source)


def reviewed_types():
    """Authenticate literal ADR183 closure BEFORE inert module import."""
    own = 'spikes/topic-resolution/harness/experimental/native-job-list-observation-v2/'
    fixed = (W.REPO / own / 'reviewed-source-map.json').read_bytes()
    if hashlib.sha256(fixed).hexdigest() != '381535247a5e6f829f28c66f8a047da04e5d1c5e9f0a7085feae4abd91ffe390':
        raise AssertionError('Baseline map FILE changed')
    paths = sorted([own+'run.py', own+'run.test.mjs', own+'README.md',
                    'decisions/ADR-183-detached-owned-job-observation.md'])
    parsed = json.loads(fixed)
    if list(parsed) != ['schema', 'sourceHashes'] or list(parsed['sourceHashes']) != paths:
        raise AssertionError('Baseline literal closure changed')
    for relative in paths:
        if hashlib.sha256((W.REPO / relative).read_bytes()).hexdigest() != parsed['sourceHashes'][relative]:
            raise AssertionError('Baseline source FILE changed')
    spec = importlib.util.spec_from_file_location('authenticated_adr183_types', W.REPO / own / 'run.py')
    baseline = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(baseline)  # No main or WindowsNative constructor.
    return baseline, paths, parsed['sourceHashes']


class Fn:
    def __init__(self, action):
        self.action = action

    def __call__(self, *args):
        return self.action(*args)


class NativeFacade(unittest.TestCase):
    def native(self):
        m, paths, hashes = reviewed_types()
        calls = []
        kernel = SimpleNamespace()
        def bind(name, action):
            setattr(kernel, name, Fn(action))
        def init_attributes(buffer, count, flags, size):
            calls.append(('attribute-init', buffer is None, count, flags))
            size._obj.value = 64
            if buffer is None:
                W.ctypes.set_last_error(122)
                return 0
            return 1
        def update(buffer, flags, key, handles, size, previous, returned):
            calls.append(('attribute-update', flags, key, tuple(handles), size))
            return 1
        bind('InitializeProcThreadAttributeList', init_attributes)
        bind('UpdateProcThreadAttribute', update)
        bind('DeleteProcThreadAttributeList', lambda buffer: calls.append(('delete',)))
        def limits(job, kind, ptr, size):
            value = ptr._obj
            calls.append(('set-limits', value.basic.flags, value.basic.activeLimit, value.jobMemory))
            return 1
        bind('SetInformationJobObject', limits)
        def read_limits(job, kind, ptr, size, returned):
            value = ptr._obj
            value.basic.flags, value.basic.activeLimit, value.jobMemory = W.FLAGS, 1, 1024*W.MIB
            returned._obj.value = size
            return 1
        bind('QueryInformationJobObject', read_limits)
        def create(application, command, pa, ta, inherit, flags, environment, cwd, startup, info):
            calls.append(('create', application, command.value, inherit, flags,
                          W.ctypes.wstring_at(environment, len(environment)), cwd,
                          startup.contents.cb, startup.contents.flags,
                          startup.contents.stdin, startup.contents.stdout, startup.contents.stderr))
            info._obj.process, info._obj.thread, info._obj.pid = 91, 92, 19
            return 1
        bind('CreateProcessW', create)
        for name in ('CreatePipe', 'SetHandleInformation', 'CreateFileW', 'PeekNamedPipe', 'ReadFile'):
            bind(name, lambda *args: (_ for _ in ()).throw(AssertionError('Unexpected native facade call')))
        native = SimpleNamespace(k=kernel)
        # Use actual authenticated ABI types but never the real constructor.
        review = SimpleNamespace(WindowsNative=lambda: native, ExtendedLimits=m.ExtendedLimits,
            StartupInfo=m.StartupInfo, ProcessInfo=m.ProcessInfo)
        return W._WinAPI(review), calls, kernel, paths, hashes

    def endpins(self, paths, hashes):
        for relative in paths:
            self.assertEqual(hashlib.sha256((W.REPO / relative).read_bytes()).hexdigest(), hashes[relative])

    def test_actual_facade_exact_limits_and_extended_launch_via_fake_dll(self):
        api, calls, kernel, paths, hashes = self.native()
        api.set_limits(1)
        self.assertEqual(api.read_limits(1), {'bytes':144, 'expectedBytes':144,
            'flags': W.FLAGS, 'active':1, 'memory':1024*W.MIB})
        attrs = api.attributes((10, 11, 12))
        self.assertEqual(api.create_process(attrs, 10, 11, 12), (91, 92, 19))
        api.delete_attributes(attrs)
        create = next(row for row in calls if row[0] == 'create')
        self.assertEqual(create[1], W.NODE)
        self.assertTrue(create[3])
        self.assertEqual(create[4], 0x8040C)
        self.assertEqual(create[7:], (112, 0x101, 10, 11, 12))
        self.assertIn('--test-isolation=none', create[2])
        self.assertIn('--test-reporter=tap', create[2])
        guard_uri = (W.REPO / W.GUARD).as_uri()
        self.assertIn(' --import "'+guard_uri+'" ',create[2])
        self.assertNotIn(' --import "'+str(W.REPO / W.GUARD)+'" ',create[2])
        self.assertEqual(urlsplit(guard_uri).scheme,'file')
        self.assertEqual(unquote(urlsplit(guard_uri).path).lstrip('/'),(W.REPO/W.GUARD).as_posix())
        environment = create[5]
        self.assertTrue(environment.endswith('\0\0'))
        self.assertEqual([v.split('=', 1)[0] for v in environment[:-2].split('\0')],
            ['MURMINGLE_ADR220_SQL_FIXTURE', 'SystemRoot', 'TEMP', 'TMP', 'WINDIR'])
        self.assertEqual(create[6], str(W.REPO))
        update = next(row for row in calls if row[0] == 'attribute-update')
        self.assertEqual(update[1:], (0, 0x20002, (10, 11, 12), 24))
        self.endpins(paths, hashes)

    def test_fixed_guard_uri_encodes_windows_spaces_hash_and_percent_via_fake_dll(self):
        api,calls,kernel,paths,hashes = self.native()
        attrs = api.attributes((10,11,12))
        with patch.object(W,'REPO',PureWindowsPath('D:/fixed folder/#percent%')):
            api.create_process(attrs,10,11,12)
        api.delete_attributes(attrs)
        create = next(row for row in calls if row[0]=='create')
        expected = 'file:///D:/fixed%20folder/%23percent%25/'+W.GUARD
        self.assertIn(' --import "'+expected+'" ',create[2])
        self.assertEqual(create[1],W.NODE)
        self.assertEqual(create[4],0x8040C)
        self.assertEqual(create[7:],(112,0x101,10,11,12))
        self.endpins(paths,hashes)

    def test_actual_facade_attribute_registration_failure_deletes_original_storage(self):
        api, calls, kernel, paths, hashes = self.native()
        kernel.UpdateProcThreadAttribute.action = lambda *args: 0
        with self.assertRaises(W.BoundaryFailure):
            api.attributes((10, 11, 12))
        self.assertEqual(calls.count(('delete',)), 1)
        self.assertFalse(any(row[0] == 'create' for row in calls))
        self.endpins(paths, hashes)

    def test_actual_facade_peek_broken_pipe_only_and_bounded_read(self):
        api, calls, kernel, paths, hashes = self.native()
        def peek(handle, buffer, maximum, read, available, remaining):
            available._obj.value = 7
            return 1
        kernel.PeekNamedPipe.action = peek
        self.assertEqual(api.peek(1), 7)
        def read(handle, buffer, maximum, actual, overlapped):
            self.assertEqual(maximum, 7)
            W.ctypes.memmove(buffer, b'example', 7)
            actual._obj.value = 7
            return 1
        kernel.ReadFile.action = read
        self.assertEqual(api.read(1, 7), b'example')
        def broken(*args):
            W.ctypes.set_last_error(109)
            return 0
        kernel.PeekNamedPipe.action = broken
        self.assertIsNone(api.peek(1))
        W.ctypes.set_last_error(5)
        kernel.PeekNamedPipe.action = lambda *args: 0
        with self.assertRaises(W.BoundaryFailure):
            api.peek(1)
        self.endpins(paths, hashes)

    def test_actual_complete_membership_counts_bounds_and_return_length(self):
        api, calls, kernel, paths, hashes = self.native()
        valid = {'ok': True, 'assigned': 1, 'listed': 1, 'pids': (19,),
                 'returned': 16, 'bufferBytes': 1032}
        api.n.query = lambda job, capacity: dict(valid)
        self.assertEqual(api.members(1), (19,))
        for delta in ({'ok':False}, {'assigned':2}, {'listed':129}, {'pids':(0,)},
                      {'pids':(0x100000000,)}, {'returned':15}, {'returned':1033}):
            with self.subTest(delta=delta):
                api.n.query = lambda job, capacity: {**valid, **delta}
                with self.assertRaises(W.BoundaryFailure):
                    api.members(1)
        api.n.query = lambda job, capacity: {**valid, 'returned':0xffffffff}
        self.assertEqual(api.members(1), (19,))
        self.endpins(paths, hashes)


if __name__ == '__main__':
    unittest.main()
