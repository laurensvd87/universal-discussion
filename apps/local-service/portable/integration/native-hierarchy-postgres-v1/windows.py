"""Fixed owned-native PostgreSQL child boundary. Import and construction perform no native work.

The caller authenticates the ADR183 module before supplying it. The optional API
is a pure test seam, not an executable/handle selector exposed by the controller.
"""
import ctypes
from ctypes import wintypes
from pathlib import Path

MIB = 1048576
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
NODE = 'C:/Program Files/nodejs/node.exe'
ENTRY = 'apps/local-service/portable/integration/native-hierarchy-postgres-v1/entry.js'
ACTIVE_LIMIT = 32
CENSUS_CAPACITY = 128
TEMP = HERE / 'output' / 'temp'
FLAGS = 0x2208
CREATE_FLAGS = 0x8040C  # EXTENDED_STARTUPINFO_PRESENT|UNICODE|SUSPENDED|DETACHED
READ_CHUNK = 4096
OUTPUT_CAPS = {'stdout': 262144, 'stderr': 65536}


class BoundaryFailure(RuntimeError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def require(value, code):
    if not value:
        raise BoundaryFailure(code)


class _SecurityAttributes(ctypes.Structure):
    _fields_ = [('length', wintypes.DWORD), ('descriptor', ctypes.c_void_p),
                ('inherit', wintypes.BOOL)]


class _WinAPI:
    """Only initialize() constructs this facade; DLL bindings come from ADR183."""
    def __init__(self, reviewed):
        self.m = reviewed
        self.n = reviewed.WindowsNative()
        self.k = self.n.k
        declarations = {
            'CreatePipe': ([ctypes.POINTER(wintypes.HANDLE), ctypes.POINTER(wintypes.HANDLE),
                            ctypes.POINTER(_SecurityAttributes), wintypes.DWORD], wintypes.BOOL),
            'SetHandleInformation': ([wintypes.HANDLE, wintypes.DWORD, wintypes.DWORD], wintypes.BOOL),
            'CreateFileW': ([wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                             ctypes.POINTER(_SecurityAttributes), wintypes.DWORD,
                             wintypes.DWORD, wintypes.HANDLE], wintypes.HANDLE),
            'InitializeProcThreadAttributeList': ([ctypes.c_void_p, wintypes.DWORD,
                wintypes.DWORD, ctypes.POINTER(ctypes.c_size_t)], wintypes.BOOL),
            'UpdateProcThreadAttribute': ([ctypes.c_void_p, wintypes.DWORD, ctypes.c_size_t,
                ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_void_p], wintypes.BOOL),
            'DeleteProcThreadAttributeList': ([ctypes.c_void_p], None),
            'PeekNamedPipe': ([wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
                ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p], wintypes.BOOL),
            'ReadFile': ([wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
                          ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p], wintypes.BOOL),
        }
        for name, (args, result) in declarations.items():
            fn = getattr(self.k, name)
            fn.argtypes, fn.restype = args, result

    def create_job(self):
        return self.n.create_job()

    def set_limits(self, job):
        limits = self.m.ExtendedLimits()
        limits.basic.flags, limits.basic.activeLimit, limits.jobMemory = FLAGS, ACTIVE_LIMIT, 1024*MIB
        require(bool(self.k.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits))), 'job-limit')

    def read_limits(self, job):
        limits, returned = self.m.ExtendedLimits(), wintypes.DWORD(0xffffffff)
        require(bool(self.k.QueryInformationJobObject(job, 9, ctypes.byref(limits),
            ctypes.sizeof(limits), ctypes.byref(returned))), 'limit-readback')
        return {'bytes': int(returned.value), 'expectedBytes': ctypes.sizeof(limits),
                'flags': int(limits.basic.flags), 'active': int(limits.basic.activeLimit),
                'memory': int(limits.jobMemory)}

    def create_pipe(self):
        r, w = wintypes.HANDLE(), wintypes.HANDLE()
        sa = _SecurityAttributes(ctypes.sizeof(_SecurityAttributes), None, True)
        require(bool(self.k.CreatePipe(ctypes.byref(r), ctypes.byref(w), ctypes.byref(sa), 0)), 'pipe-create')
        return r.value, w.value

    def noninheritable(self, handle):
        require(bool(self.k.SetHandleInformation(handle, 1, 0)), 'pipe-inheritance')

    def open_stdin(self):
        sa = _SecurityAttributes(ctypes.sizeof(_SecurityAttributes), None, True)
        h = self.k.CreateFileW('NUL', 0x80000000, 3, ctypes.byref(sa), 3, 0, None)
        require(h not in (None, 0, ctypes.c_void_p(-1).value), 'stdin-create')
        return h

    def attributes(self, handles):
        size = ctypes.c_size_t()
        ok = self.k.InitializeProcThreadAttributeList(None, 1, 0, ctypes.byref(size))
        require(not ok and ctypes.get_last_error() == 122 and 0 < size.value <= 65536, 'attribute-size')
        buffer = ctypes.create_string_buffer(size.value)
        require(bool(self.k.InitializeProcThreadAttributeList(buffer, 1, 0, ctypes.byref(size))), 'attribute-init')
        values = (wintypes.HANDLE * 3)(*handles)
        try:
            require(bool(self.k.UpdateProcThreadAttribute(buffer, 0, 0x20002, values,
                ctypes.sizeof(values), None, None)), 'attribute-handles')
        except BaseException:
            self.k.DeleteProcThreadAttributeList(buffer)
            raise
        return buffer, values  # Both storage originals live through Delete.

    def delete_attributes(self, attributes):
        self.k.DeleteProcThreadAttributeList(attributes[0])

    def create_process(self, attributes, stdin, stdout, stderr):
        class ExtendedStartup(ctypes.Structure):
            _fields_ = [('startup', self.m.StartupInfo), ('attributes', ctypes.c_void_p)]
        require(ctypes.sizeof(self.m.StartupInfo) == 104 and ctypes.sizeof(ExtendedStartup) == 112
                and ctypes.sizeof(self.m.ProcessInfo) == 24, 'abi')
        startup, info = ExtendedStartup(), self.m.ProcessInfo()
        startup.startup.cb, startup.startup.flags = ctypes.sizeof(startup), 0x101
        startup.startup.show = 0
        startup.startup.stdin, startup.startup.stdout, startup.startup.stderr = stdin, stdout, stderr
        startup.attributes = ctypes.addressof(attributes[0])
        command = '"' + NODE + '" --max-old-space-size=64 "' + str(REPO / ENTRY) + '"'
        environment = ('OMP_NUM_THREADS=1\0PATH=D:\\PostgreSQL\\17\\bin;C:\\Windows\\System32;C:\\Windows\0'
                       'SystemRoot=C:\\Windows\0TEMP=' + str(TEMP) + '\0TMP=' + str(TEMP) +
                       '\0UV_THREADPOOL_SIZE=1\0WINDIR=C:\\Windows\0\0')
        block = ctypes.create_unicode_buffer(environment, len(environment))
        ok = self.k.CreateProcessW(NODE, ctypes.create_unicode_buffer(command), None, None, True,
            CREATE_FLAGS, block, str(REPO), ctypes.cast(ctypes.byref(startup),
            ctypes.POINTER(self.m.StartupInfo)), ctypes.byref(info))
        require(bool(ok), 'create-process')
        return info.process, info.thread, int(info.pid)

    def assign(self, job, process):
        return self.n.assign(job, process)

    def belongs(self, job, process):
        return self.n.belongs(job, process)

    def resume(self, thread):
        return self.n.resume(thread)

    def members(self, job):
        row = self.n.query(job, CENSUS_CAPACITY)
        # ADR183 documents an unwritten ReturnLength sentinel. It is not a
        # written-byte claim; BOOL success and the complete bounded counts/prefix
        # are still mandatory. Every actually written length is checked.
        require(type(row) is dict and {'ok', 'assigned', 'listed', 'bufferBytes', 'returned', 'pids'} <= row.keys()
            and row['ok'] is True
            and type(row['assigned']) is int and type(row['listed']) is int
            and 0 <= row['assigned'] <= ACTIVE_LIMIT
            and row['assigned'] == row['listed']
            and type(row['bufferBytes']) is int
            and row['bufferBytes'] == 8 + CENSUS_CAPACITY*ctypes.sizeof(ctypes.c_size_t)
            and type(row['returned']) is int
            and (row['returned'] == 0xffffffff or
                 8 + row['listed']*ctypes.sizeof(ctypes.c_size_t) <= row['returned'] <= row['bufferBytes'])
            and type(row['pids']) is tuple and len(row['pids']) == row['listed']
            and all(type(x) is int and 0 < x <= 0xffffffff for x in row['pids'])
            and len(set(row['pids'])) == row['listed'], 'job-members')
        return row['pids']

    def resources(self, job):
        return self.n.resources(job)

    def peek(self, handle):
        available = wintypes.DWORD()
        if not self.k.PeekNamedPipe(handle, None, 0, None, ctypes.byref(available), None):
            require(ctypes.get_last_error() == 109, 'pipe-peek')
            return None
        return int(available.value)

    def read(self, handle, maximum):
        buffer, size = ctypes.create_string_buffer(maximum), wintypes.DWORD()
        require(bool(self.k.ReadFile(handle, buffer, maximum, ctypes.byref(size), None)), 'pipe-read')
        require(0 < size.value <= maximum, 'pipe-read')
        return buffer.raw[:size.value]

    def exited(self, handle):
        return self.n.exited(handle)

    def exit_code(self, handle):
        return self.n.exit_code(handle)

    def terminate_process(self, handle):
        return self.n.terminate_process(handle)

    def terminate_job(self, handle):
        return self.n.terminate_job(handle)

    def close_handle(self, handle):
        return self.n.close(handle)


class OwnedFixtureProcess:
    def __init__(self, authenticated_ADR183_module, api=None):
        self.reviewed, self.api = authenticated_ADR183_module, api
        self.handles, self.attempted, self.closed = {}, set(), set()
        self.attributes = None
        self.initialized = self.launched = self.assigned = self.verified = False
        self.initialize_attempted = self.launch_attempted = self.assignment_attempted = False
        self.resumed = self.exited = self.emergency = self.empty = False
        self.pid = self.code = None
        self.counts = {'stdout': 0, 'stderr': 0}
        self.eof = {'stdout': False, 'stderr': False}
        self.limits = None
        self.close_error = False

    def _checkpoint(self, callback):
        require(callable(callback), 'checkpoint')
        require(callback() is None, 'checkpoint-return')

    def _verify_limits(self):
        r = self.api.read_limits(self.handles['job'])
        require(r['bytes'] == r['expectedBytes'] and r['flags'] == FLAGS
                and r['active'] == ACTIVE_LIMIT and r['memory'] == 1024*MIB, 'limit-readback')
        self.limits = {'flags': FLAGS, 'activeProcessLimit': ACTIVE_LIMIT, 'jobMemoryBytes': 1024*MIB}

    def initialize(self, checkpoint):
        require(not self.initialize_attempted and not self.handles and not self.attempted, 'initialize-state')
        self.initialize_attempted = True
        self._checkpoint(checkpoint)
        if self.api is None:
            require(self.reviewed.abi()['valid'], 'abi')
            self.api = _WinAPI(self.reviewed)
        try:
            self.handles['job'] = self.api.create_job()
            self._checkpoint(checkpoint)
            self.api.set_limits(self.handles['job'])
            self._verify_limits()
            self._checkpoint(checkpoint)
            for stream in ('stdout', 'stderr'):
                r, w = self.api.create_pipe()
                self.handles[stream+'Read'], self.handles[stream+'Write'] = r, w
                self.api.noninheritable(r)
                self._checkpoint(checkpoint)
            self.handles['stdin'] = self.api.open_stdin()
            self._checkpoint(checkpoint)
            self.attributes = self.api.attributes((self.handles['stdin'],
                self.handles['stdoutWrite'], self.handles['stderrWrite']))
            self._checkpoint(checkpoint)
            self.initialized = True
        except BaseException:
            try:
                self.close()
            except BaseException:
                self.close_error = True
            raise

    def _delete_attributes(self):
        if self.attributes is not None:
            attributes, self.attributes = self.attributes, None
            self.api.delete_attributes(attributes)

    def _close_one(self, name):
        if name in self.handles and name not in self.attempted:
            self.attempted.add(name)
            try:
                require(self.api.close_handle(self.handles[name]), 'close-handle')
            except BaseException:
                self.close_error = True
                raise
            self.closed.add(name)

    def launch_suspended(self, checkpoint):
        require(self.initialized and not self.launch_attempted and not self.attempted, 'launch-state')
        self.launch_attempted = True
        self._checkpoint(checkpoint)
        process, thread, pid = self.api.create_process(self.attributes, self.handles['stdin'],
            self.handles['stdoutWrite'], self.handles['stderrWrite'])
        # Latch BOTH originals before any native cleanup, validation or callback.
        self.handles['process'], self.handles['thread'], self.pid = process, thread, pid
        self.launched = True
        first = None
        for name in ('stdoutWrite', 'stderrWrite', 'stdin'):
            try:
                self._close_one(name)
            except BaseException as error:
                if first is None:
                    first = error
        try:
            self._delete_attributes()
        except BaseException as error:
            if first is None:
                first = error
        if first is not None:
            raise first
        self._checkpoint(checkpoint)

    def assign_and_resume(self, checkpoint):
        require(self.launched and not self.assignment_attempted and not self.resumed and not self.exited, 'assign-state')
        self.assignment_attempted = True
        self._checkpoint(checkpoint)
        require(self.api.assign(self.handles['job'], self.handles['process']), 'assignment')
        self.assigned = True  # Latched even when a following checkpoint refuses.
        self._checkpoint(checkpoint)
        require(self.api.belongs(self.handles['job'], self.handles['process']), 'membership')
        self._verify_limits()
        require(self._census() == (self.pid,), 'job-members')
        self.verified = True
        self._checkpoint(checkpoint)
        previous = self.api.resume(self.handles['thread'])
        self.resumed = previous == 1
        require(self.resumed, 'resume')
        self._checkpoint(checkpoint)

    def _census(self):
        require('job' in self.handles and 'job' not in self.attempted, 'census-state')
        pids = self.api.members(self.handles['job'])
        require(type(pids) is tuple and len(pids) <= ACTIVE_LIMIT
                and all(type(pid) is int and 0 < pid <= 0xffffffff for pid in pids)
                and len(set(pids)) == len(pids), 'job-members')
        return pids

    def normal_retirement_ready(self):
        if not self.launched or not self.exited or not all(self.eof.values()):
            return False
        # The original exited root may remain listed while its handle is held.
        # No surviving descendant can be hidden by EOF or root exit.
        return all(pid == self.pid for pid in self._census())

    def sample(self):
        require('job' in self.handles and 'job' not in self.attempted, 'sample-state')
        self._census()
        return self.api.resources(self.handles['job'])

    def read_available(self, stream):
        require(type(stream) is str and stream in OUTPUT_CAPS, 'pipe-stream')
        require(self.launched and stream+'Read' not in self.attempted, 'pipe-state')
        if self.eof[stream]:
            return {'data': b'', 'eof': True}
        available = self.api.peek(self.handles[stream+'Read'])
        if available is None:
            self.eof[stream] = True
            return {'data': b'', 'eof': True}
        require(type(available) is int and available >= 0, 'pipe-peek')
        if not available:
            return {'data': b'', 'eof': False}
        data = self.api.read(self.handles[stream+'Read'], min(available, READ_CHUNK))
        require(type(data) is bytes and 0 < len(data) <= min(available, READ_CHUNK), 'pipe-read')
        self.counts[stream] += len(data)
        require(self.counts[stream] <= OUTPUT_CAPS[stream], 'output-capacity')
        return {'data': data, 'eof': False}

    def poll_exit(self):
        if not self.launched:
            return None
        if not self.exited:
            require('process' not in self.attempted, 'poll-state')
            if self.api.exited(self.handles['process']):
                self.exited = True
                self.code = self.api.exit_code(self.handles['process'])
        return self.code if self.exited else None

    def terminate_owned(self):
        if not self.launched or self.emergency:
            return
        if self.assigned:
            first = None
            try:
                needs_termination = not self.exited or any(pid != self.pid for pid in self._census())
            except BaseException as error:
                first, needs_termination = error, True
            if needs_termination:
                self.emergency = True
                try:
                    require(self.api.terminate_job(self.handles['job']), 'terminate-job')
                except BaseException:
                    if first is None:
                        raise
                if first is not None:
                    raise first
        elif not self.exited:
            self.emergency = True
            require(self.api.terminate_process(self.handles['process']), 'terminate-process')

    def close(self):
        if self.attempted == set(self.handles):
            return self.snapshot()
        # Never make a live original unobservable merely because cleanup failed.
        require(not self.launched or self.exited, 'close-live-process')
        require(not self.launched or self.normal_retirement_ready(), 'close-descendants-or-pipes')
        first = None
        try:
            self._delete_attributes()
        except BaseException as error:
            first = error
        for name in ('thread', 'process', 'stdin', 'stdoutWrite', 'stderrWrite', 'stdoutRead', 'stderrRead'):
            try:
                self._close_one(name)
            except BaseException as error:
                if first is None:
                    first = error
        if 'job' in self.handles and 'job' not in self.attempted:
            try:
                require(not self.launched or {'process', 'thread'} <= self.closed, 'close-handles')
                require(self._census() == (), 'normal-empty-job')
                self.empty = True
            except BaseException as error:
                if first is None:
                    first = error
                # Never disguise residual-child kill-on-close as normal cleanup.
                if self.assigned and not self.emergency:
                    self.emergency = True
                    try:
                        require(self.api.terminate_job(self.handles['job']), 'terminate-job')
                    except BaseException:
                        pass  # Preserve the first census/physical-close failure.
            try:
                self._close_one('job')
            except BaseException as error:
                if first is None:
                    first = error
        if first is not None:
            self.close_error = True
            raise first
        return self.snapshot()

    def snapshot(self):
        return {'initialized': self.initialized, 'processCreated': self.launched,
            'assigned': self.assigned, 'membershipVerified': self.verified,
            'resumed': self.resumed, 'exited': self.exited, 'exitCode': self.code,
            'emergency': self.emergency, 'completeEmptyJob': self.empty,
            'allHandlesClosed': len(self.closed) == len(self.handles),
            'closeFailure': self.close_error, 'stdoutBytes': self.counts['stdout'],
            'stderrBytes': self.counts['stderr'], 'stdoutEof': self.eof['stdout'],
            'stderrEof': self.eof['stderr'], 'limits': None if self.limits is None else dict(self.limits)}

