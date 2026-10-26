"""ADR182. Default-inert, fixed Python-only owned Job observation."""
import sys
import time
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import stat

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
OWN = 'spikes/topic-resolution/harness/experimental/native-job-list-observation-v1/'
SOURCE_KEYS = tuple(sorted((OWN + 'run.py', OWN + 'run.test.mjs', OWN + 'README.md',
    'decisions/ADR-182-owned-job-process-list-observation.md')))
SOURCE_MAP = HERE / 'reviewed-source-map.json'
OUTPUT = HERE / 'output'
PYTHON = 'C:/Users/Laurens/AppData/Local/Programs/Python/Python312/python.exe'
PYTHON_SHA = '4d6f5f81a4bca11191c4c7c6b43632694d0a4ce74e068619d8fdc161d469859a'
PYTHON_BYTES = 104952
MIB = 1048576
ERRORS = {2: 'file-missing', 3: 'path-missing', 5: 'access-denied', 6: 'invalid-handle',
    32: 'sharing', 33: 'lock', 87: 'invalid-parameter', 122: 'insufficient-buffer',
    234: 'more-data', 299: 'partial-copy'}
CODES = frozenset(('source-map-pin', 'source-map', 'source-pin', 'source-drift', 'source-file',
    'interpreter', 'reparse', 'arguments', 'active-deadline', 'wall-deadline', 'cpu', 'resources',
    'headroom', 'output-capacity', 'query-capacity', 'row-capacity', 'abi', 'job-create', 'job-limit',
    'create-process', 'assignment', 'membership', 'resume', 'wait', 'child-exit', 'unknown-child',
    'query-failed', 'assigned-capacity', 'listed-capacity', 'count-mismatch', 'prefix-bounds',
    'prefix-contract', 'return-length', 'normal-empty-job', 'close-handle', 'own-job-termination',
    'cleanup-deadline', 'publication', 'suspended-set', 'control-insufficiency', 'unclassified'))
STAGES = frozenset(('suspended', 'small-control', 'resumed', 'exited-held', 'handles-closed',
    'churn', 'cleanup', 'final-empty'))


class ProbeFailure(RuntimeError):
    def __init__(self, code):
        super().__init__('Owned Job observation refused')
        self.code = code


def require(value, code):
    if value is not True:
        raise ProbeFailure(code)


def project_failure(error):
    if type(error) is ProbeFailure:
        value = object.__getattribute__(error, '__dict__').get('code')
        if type(value) is str and value in CODES:
            return {'code': value}
    return {'code': 'unclassified'}


def safe_failure(error):
    try:
        return project_failure(error)
    except Exception:
        return {'code': 'unclassified'}


def wire(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf8')


def sha(value):
    return hashlib.sha256(value).hexdigest()


def exact_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'source-map')
            result[key] = value
        return result
    result = json.loads(raw.decode('utf8'), object_pairs_hook=pairs,
        parse_constant=lambda _: (_ for _ in ()).throw(ProbeFailure('source-map')))
    require(wire(result) == raw, 'source-map')
    return result


def hash_value(value):
    require(type(value) is str and len(value) == 64 and all(c in '0123456789abcdef' for c in value), 'arguments')
    return value


def checked(path, root):
    current = path
    while True:
        info = current.lstat()
        require(not (getattr(info, 'st_file_attributes', 0) & 0x400) and not stat.S_ISLNK(info.st_mode), 'reparse')
        if current == root:
            break
        require(current != current.parent, 'source-file')
        current = current.parent
    return path.lstat()


def bounded_file(path, maximum, root=REPO):
    before = checked(path, root)
    require(stat.S_ISREG(before.st_mode) and 0 < before.st_size <= maximum and path.resolve() == path, 'source-file')
    result = path.read_bytes()
    after = checked(path, root)
    require(len(result) == before.st_size and
        (before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
        (after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'source-drift')
    return result


def authenticate_sources(pin, read=bounded_file):
    raw = read(SOURCE_MAP, 16384)
    require(sha(raw) == pin, 'source-map-pin')  # Before parsing any metadata.
    value = exact_json(raw)
    require(type(value) is dict and list(value) == ['schema', 'sourceHashes'] and
        value['schema'] == 'native-job-list-reviewed-sources/v1', 'source-map')
    hashes = value['sourceHashes']
    require(type(hashes) is dict and tuple(hashes) == SOURCE_KEYS, 'source-map')
    for key in SOURCE_KEYS:  # NEVER follow a JSON-selected path.
        require(sha(read(REPO / key, 4 * MIB)) == hash_value(hashes[key]), 'source-pin')
    return raw, dict(hashes)


def authenticate_python(read=bounded_file, executable=None):
    selected = sys.executable if executable is None else executable
    require(type(selected) is str and selected.replace('\\', '/').lower() == PYTHON.lower(), 'interpreter')
    data = read(Path(PYTHON), MIB, Path('C:/'))
    require(len(data) == PYTHON_BYTES and sha(data) == PYTHON_SHA, 'interpreter')


class JobPids(ctypes.Structure):
    _fields_ = [('assigned', wintypes.DWORD), ('listed', wintypes.DWORD), ('pids', ctypes.c_size_t * 128)]


class Accounting(ctypes.Structure):
    _fields_ = [(k, ctypes.c_longlong) for k in ('user', 'kernel', 'periodUser', 'periodKernel')] + [
        (k, wintypes.DWORD) for k in ('faults', 'total', 'active', 'terminated')]


class MemoryStatus(ctypes.Structure):
    _fields_ = [('length', wintypes.DWORD), ('load', wintypes.DWORD)] + [
        (k, ctypes.c_ulonglong) for k in ('totalPhysical', 'availablePhysical', 'totalPageFile',
        'availablePageFile', 'totalVirtual', 'availableVirtual', 'availableExtended')]


class BasicLimits(ctypes.Structure):
    _fields_ = [('processTime', ctypes.c_longlong), ('jobTime', ctypes.c_longlong), ('flags', wintypes.DWORD),
        ('minimumWorkingSet', ctypes.c_size_t), ('maximumWorkingSet', ctypes.c_size_t),
        ('activeLimit', wintypes.DWORD), ('affinity', ctypes.c_size_t),
        ('priority', wintypes.DWORD), ('scheduling', wintypes.DWORD)]


class IoCounters(ctypes.Structure):
    _fields_ = [(k, ctypes.c_ulonglong) for k in ('reads', 'writes', 'other', 'readBytes', 'writeBytes', 'otherBytes')]


class ExtendedLimits(ctypes.Structure):
    _fields_ = [('basic', BasicLimits), ('io', IoCounters), ('processMemory', ctypes.c_size_t),
        ('jobMemory', ctypes.c_size_t), ('peakProcessMemory', ctypes.c_size_t), ('peakJobMemory', ctypes.c_size_t)]


class StartupInfo(ctypes.Structure):
    _fields_ = [('cb', wintypes.DWORD), ('reserved', wintypes.LPWSTR), ('desktop', wintypes.LPWSTR),
        ('title', wintypes.LPWSTR)] + [(k, wintypes.DWORD) for k in ('x', 'y', 'width', 'height',
        'xChars', 'yChars', 'fill', 'flags')] + [('show', wintypes.WORD), ('reservedBytes', wintypes.WORD),
        ('reservedPointer', ctypes.c_void_p), ('stdin', wintypes.HANDLE), ('stdout', wintypes.HANDLE), ('stderr', wintypes.HANDLE)]


class ProcessInfo(ctypes.Structure):
    _fields_ = [('process', wintypes.HANDLE), ('thread', wintypes.HANDLE), ('pid', wintypes.DWORD), ('tid', wintypes.DWORD)]


def abi():
    value = {'pointerBytes': ctypes.sizeof(ctypes.c_size_t), 'dwordBytes': ctypes.sizeof(wintypes.DWORD),
        'assignedOffset': JobPids.assigned.offset, 'listedOffset': JobPids.listed.offset,
        'pidOffset': JobPids.pids.offset, 'fullBufferBytes': ctypes.sizeof(JobPids)}
    value['valid'] = value == {'pointerBytes': 8, 'dwordBytes': 4, 'assignedOffset': 0,
        'listedOffset': 4, 'pidOffset': 8, 'fullBufferBytes': 1032}
    return value


class WindowsNative:
    """Only initialized after fixed source+interpreter authentication."""
    def __init__(self):
        k = self.k = ctypes.WinDLL('kernel32', use_last_error=True)
        declarations = {
            'CreateJobObjectW': ([ctypes.c_void_p, wintypes.LPCWSTR], wintypes.HANDLE),
            'SetInformationJobObject': ([wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD], wintypes.BOOL),
            'QueryInformationJobObject': ([wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)], wintypes.BOOL),
            'CreateProcessW': ([wintypes.LPCWSTR, wintypes.LPWSTR, ctypes.c_void_p, ctypes.c_void_p, wintypes.BOOL,
                wintypes.DWORD, ctypes.c_void_p, wintypes.LPCWSTR, ctypes.POINTER(StartupInfo), ctypes.POINTER(ProcessInfo)], wintypes.BOOL),
            'AssignProcessToJobObject': ([wintypes.HANDLE, wintypes.HANDLE], wintypes.BOOL),
            'IsProcessInJob': ([wintypes.HANDLE, wintypes.HANDLE, ctypes.POINTER(wintypes.BOOL)], wintypes.BOOL),
            'ResumeThread': ([wintypes.HANDLE], wintypes.DWORD),
            'WaitForSingleObject': ([wintypes.HANDLE, wintypes.DWORD], wintypes.DWORD),
            'GetExitCodeProcess': ([wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)], wintypes.BOOL),
            'TerminateProcess': ([wintypes.HANDLE, wintypes.UINT], wintypes.BOOL),
            'TerminateJobObject': ([wintypes.HANDLE, wintypes.UINT], wintypes.BOOL),
            'CloseHandle': ([wintypes.HANDLE], wintypes.BOOL),
            'GlobalMemoryStatusEx': ([ctypes.POINTER(MemoryStatus)], wintypes.BOOL),
            'GetDiskFreeSpaceExW': ([wintypes.LPCWSTR, ctypes.POINTER(ctypes.c_ulonglong),
                ctypes.POINTER(ctypes.c_ulonglong), ctypes.POINTER(ctypes.c_ulonglong)], wintypes.BOOL)}
        for name, (args, result) in declarations.items():
            fn = getattr(k, name)
            fn.argtypes, fn.restype = args, result

    def create_job(self):
        job = self.k.CreateJobObjectW(None, None)
        require(bool(job), 'job-create')
        return job

    def limit_job(self, job):
        limit = ExtendedLimits()
        limit.basic.flags, limit.basic.activeLimit, limit.jobMemory = 0x2000 | 0x200 | 0x8, 8, 512 * MIB
        require(bool(self.k.SetInformationJobObject(job, 9, ctypes.byref(limit), ctypes.sizeof(limit))), 'job-limit')

    def create_child(self):
        info, startup = ProcessInfo(), StartupInfo()
        startup.cb, startup.flags, startup.show = ctypes.sizeof(startup), 1, 0
        command = '"' + PYTHON.replace('/', '\\') + '" -I -S -B "' + str(HERE / 'run.py') + '" --owned-child'
        block = 'SystemRoot=C:\\Windows\0TEMP=' + str(OUTPUT / 'temp') + '\0TMP=' + str(OUTPUT / 'temp') + '\0WINDIR=C:\\Windows\0\0'
        environment = ctypes.create_unicode_buffer(block, len(block))
        ok = self.k.CreateProcessW(PYTHON, ctypes.create_unicode_buffer(command), None, None, False,
            0x08000000 | 0x4 | 0x400, environment, str(HERE), ctypes.byref(startup), ctypes.byref(info))
        require(bool(ok), 'create-process')  # BOOL0 output fields are not handle authority.
        return {'process': info.process, 'thread': info.thread, 'pid': int(info.pid)}

    def assign(self, job, process):
        return bool(self.k.AssignProcessToJobObject(job, process))

    def belongs(self, job, process):
        result = wintypes.BOOL()
        return bool(self.k.IsProcessInJob(process, job, ctypes.byref(result))) and bool(result.value)

    def resume(self, thread):
        return int(self.k.ResumeThread(thread))

    def exited(self, process):
        value = int(self.k.WaitForSingleObject(process, 0))
        require(value in (0, 258), 'wait')
        return value == 0

    def exit_code(self, process):
        code = wintypes.DWORD()
        require(bool(self.k.GetExitCodeProcess(process, ctypes.byref(code))), 'child-exit')
        return int(code.value)

    def close(self, handle):
        return bool(self.k.CloseHandle(handle))

    def terminate_process(self, handle):
        return bool(self.k.TerminateProcess(handle, 1))

    def terminate_job(self, job):
        return bool(self.k.TerminateJobObject(job, 1))

    def query(self, job, capacity):
        # Exact DWORD/DWORD/ULONG_PTR layout, including deterministic sentinel.
        class Buffer(ctypes.Structure):
            _fields_ = [('assigned', wintypes.DWORD), ('listed', wintypes.DWORD), ('pids', ctypes.c_size_t * capacity)]
        data, returned = Buffer(), wintypes.DWORD(0xffffffff)
        ok = self.k.QueryInformationJobObject(job, 3, ctypes.byref(data), ctypes.sizeof(data), ctypes.byref(returned))
        error = None if ok else ERRORS.get(ctypes.get_last_error(), 'other')  # IMMEDIATE cached error.
        # On BOOL0 no PID array or returned header establishes authority.
        pids = tuple(int(x) for x in data.pids[:data.listed]) if ok and data.listed <= capacity else None
        return {'ok': bool(ok), 'error': error, 'assigned': int(data.assigned), 'listed': int(data.listed),
            'returned': int(returned.value), 'bufferBytes': ctypes.sizeof(data), 'pids': pids}

    def resources(self, job):
        host = MemoryStatus()
        host.length = ctypes.sizeof(host)
        require(bool(self.k.GlobalMemoryStatusEx(ctypes.byref(host))), 'resources')
        free = []
        for drive in ('C:\\', 'D:\\'):
            value = ctypes.c_ulonglong()
            require(bool(self.k.GetDiskFreeSpaceExW(drive, ctypes.byref(value), None, None)), 'resources')
            free.append(value.value)
        cpu, committed = None, 0
        if job:
            account, limit = Accounting(), ExtendedLimits()
            require(bool(self.k.QueryInformationJobObject(job, 1, ctypes.byref(account), ctypes.sizeof(account), None)), 'resources')
            require(min(account.user, account.kernel) >= 0, 'resources')
            cpu = (account.user + account.kernel) / 10000000
            require(bool(self.k.QueryInformationJobObject(job, 9, ctypes.byref(limit), ctypes.sizeof(limit), None)), 'resources')
            committed = int(limit.peakJobMemory)
        return {'cpu': cpu, 'committed': committed, 'physicalFree': int(host.availablePhysical),
            'commitFree': int(host.availablePageFile), 'cFree': int(free[0]), 'dFree': int(free[1])}


class Experiment:
    def __init__(self, native, started, clock=time.monotonic, pause=time.sleep, metadata=lambda: None):
        self.n, self.started, self.clock, self.pause, self.metadata = native, started, clock, pause, metadata
        self.job = None
        self.children = []
        self.created = self.queries = self.dropped = 0
        self.rows, self.first_unexpected, self.final_empty = [], None, None
        self.first_stage = {}  # At most the eight literal stages, references only.
        self.counts = {stage: 0 for stage in sorted(STAGES)}
        self.error = self.cleanup_error = None
        self.emergency = False
        self.last_cpu = 0
        self.cleanup_passed = False
        self.job_closed = False
        self.last_time = started

    def remember(self, error, cleanup=False):
        if cleanup:
            if self.cleanup_error is None:
                self.cleanup_error = error
        elif self.error is None:
            self.error = error

    def guard(self, cleanup=False):
        now = self.clock()
        require(self.last_time <= now and now - self.started < (60 if cleanup else 45), 'wall-deadline' if cleanup else 'active-deadline')
        self.last_time = now
        r = self.n.resources(self.job)
        if r['cpu'] is not None:
            require(type(r['cpu']) in (int, float) and self.last_cpu <= r['cpu'] <= 20, 'cpu')
            self.last_cpu = r['cpu']
        require(r['committed'] <= 512 * MIB, 'resources')
        require(min(r['physicalFree'], r['commitFree']) >= 1024 * MIB and r['cFree'] >= 2048 * MIB and r['dFree'] >= 4096 * MIB, 'headroom')
        self.metadata()
        now = self.clock()
        require(self.last_time <= now and now - self.started < (60 if cleanup else 45), 'wall-deadline' if cleanup else 'active-deadline')
        self.last_time = now

    def query(self, stage, *, capacity=128, cleanup=False, final=False):
        self.guard(cleanup)
        require(stage in STAGES and capacity in (1, 128) and self.queries < 2048, 'query-capacity')
        self.queries += 1
        self.counts[stage] += 1
        q = self.n.query(self.job, capacity)
        # Header integers remain diagnostic on BOOL0; do not validate them as a
        # complete-list predicate, nor inspect any supplied false-result PIDs.
        ok = q['ok'] is True
        prefix = q['pids'] if ok and q['listed'] <= capacity else None
        in_bounds = ok and prefix is not None and len(prefix) == q['listed']
        known = {r['pid'] for r in self.children if not r['processAttempted']}
        unique = in_bounds and len(set(prefix)) == len(prefix) and all(type(v) is int and 0 < v <= 0xffffffff for v in prefix)
        known_only = unique and all(pid in known for pid in prefix)
        suspended = {r['pid'] for r in self.children if r['assigned'] and r['verified'] and
            not r['resumed'] and not r['processAttempted']}
        suspended_exact = bool(in_bounds and len(suspended) == 8 and set(prefix) == suspended and
                               q['assigned'] == 8 and q['listed'] == 8) if stage == 'suspended' else None
        control_expected = (q['error'] in ('more-data', 'insufficient-buffer') if not ok else
            len(suspended) == 8 and q['assigned'] == 8 and q['listed'] < 8) if capacity == 1 else None
        row = {'ordinal': self.queries, 'stage': stage, 'capacity': capacity, 'querySucceeded': ok,
            'errorCategory': None if ok else q['error'], 'assigned': q['assigned'], 'listed': q['listed'],
            'returnLengthWritten': q['returned'] != 0xffffffff,
            'returnedBytes': None if q['returned'] == 0xffffffff else q['returned'], 'bufferBytes': q['bufferBytes'],
            'assignedOver128': q['assigned'] > 128, 'listedOver128': q['listed'] > 128,
            'countsEqual': q['assigned'] == q['listed'], 'prefixInBounds': in_bounds if ok else None,
            'prefixUniqueNonzero': unique if ok else None, 'knownHeldOnly': known_only if ok else None,
            'suspendedSetExact': suspended_exact, 'expectedControlInsufficiency': control_expected}
        failure = None
        if not ok:
            if capacity == 128 or not control_expected: failure = 'query-failed'
        else:
            if q['assigned'] > 128: failure = 'assigned-capacity'
            elif q['listed'] > 128: failure = 'listed-capacity'
            elif capacity == 128 and q['assigned'] != q['listed']: failure = 'count-mismatch'
            elif not in_bounds: failure = 'prefix-bounds'
            elif not unique: failure = 'prefix-contract'
            elif not known_only: failure = 'unknown-child'
            elif q['returned'] != 0xffffffff and not 8 + q['listed'] * 8 <= q['returned'] <= q['bufferBytes']: failure = 'return-length'
            elif stage == 'suspended' and not suspended_exact: failure = 'suspended-set'
            elif capacity == 1 and not control_expected: failure = 'control-insufficiency'
            elif final and q['listed'] != 0: failure = 'normal-empty-job'
        if failure is not None:
            if self.first_unexpected is None: self.first_unexpected = row
            else: self.dropped += 1
        elif final:
            self.final_empty = row
        elif len(self.rows) < 62:
            self.rows.append(row)
        else:
            self.dropped += 1
        if failure is not None:
            raise ProbeFailure(failure)
        if stage not in self.first_stage:
            self.first_stage[stage] = row
        self.guard(cleanup)
        return row  # small control never establishes membership/absence.

    def create(self):
        self.guard()
        require(self.created < 64 and sum(not r['exited'] for r in self.children) < 8, 'create-process')
        child = self.n.create_child()
        child.update(assigned=False, verified=False, resumed=False, exited=False,
            processAttempted=False, threadAttempted=False, processClosed=False, threadClosed=False)
        self.children.append(child)  # Retain BOTH handles before any later guard.
        self.created += 1
        self.guard()
        require(self.n.assign(self.job, child['process']), 'assignment')
        child['assigned'] = True  # LATCH BEFORE membership/post-call rejection.
        self.guard()
        require(self.n.belongs(self.job, child['process']), 'membership')
        child['verified'] = True
        self.guard()

    def close_handle(self, child, kind):
        key = kind + 'Attempted'
        if not child[key]:
            child[key] = True
            require(self.n.close(child[kind]), 'close-handle')
            child[kind + 'Closed'] = True

    def resume_group(self, group):
        for child in group:
            self.guard()
            require(child['assigned'] and child['verified'] and not child['resumed'], 'resume')
            previous = self.n.resume(child['thread'])
            child['resumed'] = previous == 1
            require(previous == 1, 'resume')
            self.guard()
            self.close_handle(child, 'thread')
            self.guard()

    def wait_group(self, group, stage, cleanup=False):
        while True:
            self.guard(cleanup)
            for child in group:
                if not child['exited'] and self.n.exited(child['process']):
                    child['exited'] = True
                    require(self.n.exit_code(child['process']) == 0, 'child-exit')
                self.guard(cleanup)
            if all(c['exited'] for c in group):
                return
            if not cleanup:
                self.query(stage)
            self.pause(.01)

    def schedule(self):
        self.guard()
        require(abi()['valid'], 'abi')
        self.job = self.n.create_job()
        self.guard()
        self.n.limit_job(self.job)
        self.guard()
        for _ in range(8): self.create()
        group = self.children[-8:]
        self.query('suspended')
        self.query('small-control', capacity=1)
        self.resume_group(group)
        self.query('resumed')
        self.wait_group(group, 'resumed')
        self.query('exited-held')
        for child in group:
            self.guard()
            self.close_handle(child, 'process')
        self.query('handles-closed')
        for _ in range(7):
            for _ in range(8): self.create()
            group = self.children[-8:]
            self.resume_group(group)
            self.query('churn')
            self.wait_group(group, 'churn')
            for child in group:
                self.guard()
                self.close_handle(child, 'process')
            self.query('churn')

    def cleanup(self):
        # Attempt every original handle once even if another cleanup action
        # fails. Assigned children can be terminated ONLY through this own Job.
        kill_attempted = False
        def terminate_owned_job():
            nonlocal kill_attempted
            if not kill_attempted and self.job:
                kill_attempted = True
                self.emergency = True
                try: require(self.n.terminate_job(self.job), 'own-job-termination')
                except Exception as error: self.remember(error, True)
        if any(c['assigned'] and not c['resumed'] and not c['exited'] for c in self.children):
            terminate_owned_job()
        for child in self.children:
            try:
                if not child['assigned'] and not child['exited']:
                    self.emergency = True
                    require(self.n.terminate_process(child['process']), 'own-job-termination')
                while not child['exited']:
                    require(self.clock() - self.started < 55, 'cleanup-deadline')  # Reserve 5s of SAME60 for emergency drain.
                    self.guard(True)
                    if self.n.exited(child['process']):
                        child['exited'] = True
                        if not self.emergency: require(self.n.exit_code(child['process']) == 0, 'child-exit')
                    else:
                        self.pause(.01)
            except Exception as error:
                self.remember(error, True)
                if child['assigned']: terminate_owned_job()
                # A failed resource guard cannot suppress physical observation
                # of the already-issued emergency. No new work/acceptance lease.
                try:
                    while not child['exited']:
                        require(self.clock() - self.started < 60, 'cleanup-deadline')
                        if self.n.exited(child['process']): child['exited'] = True
                        else: self.pause(.01)
                except Exception as nested: self.remember(nested, True)
            for kind in ('thread', 'process'):
                try: self.close_handle(child, kind)
                except Exception as error: self.remember(error, True)
        if self.job:
            try:
                require(all(c['exited'] and c['processClosed'] and c['threadClosed'] for c in self.children), 'normal-empty-job')
                self.query('final-empty', cleanup=True, final=True)
            except Exception as error: self.remember(error, True)
            try:
                require(self.n.close(self.job), 'close-handle')
                self.job_closed, self.job = True, None
            except Exception as error: self.remember(error, True)
        self.cleanup_passed = self.cleanup_error is None and (self.job_closed or self.job is None) and all(c['exited'] and c['processClosed'] and c['threadClosed'] for c in self.children)

    def execute(self):
        try: self.schedule()
        except Exception as error: self.remember(error)
        finally: self.cleanup()

    def result(self):
        reserved = {row['ordinal']: row for row in self.first_stage.values()}
        if self.first_unexpected is not None: reserved[self.first_unexpected['ordinal']] = self.first_unexpected
        if self.final_empty is not None: reserved[self.final_empty['ordinal']] = self.final_empty
        retained_by_ordinal = dict(reserved)
        for row in self.rows:
            if row['ordinal'] not in retained_by_ordinal and len(retained_by_ordinal) < 64:
                retained_by_ordinal[row['ordinal']] = row
        retained = sorted(retained_by_ordinal.values(), key=lambda row: row['ordinal'])
        require(len(retained) <= 64 and self.queries <= 2048, 'row-capacity')
        passed = self.error is None and self.cleanup_error is None and self.cleanup_passed and not self.emergency and self.final_empty is not None
        return {'schema': 'native-job-list-observation-result/v1', 'status': 'passed' if passed else 'failed',
            'abi': abi(), 'createdChildren': self.created, 'queryCount': self.queries, 'counts': dict(self.counts),
            'rows': retained, 'droppedRows': self.queries - len(retained),
            'failure': None if self.error is None else safe_failure(self.error),
            'cleanupFailure': None if self.cleanup_error is None else safe_failure(self.cleanup_error),
            'emergencyOwnJobTermination': self.emergency, 'cleanupPassed': self.cleanup_passed,
            'normalEmptyJob': self.final_empty is not None and not self.emergency and self.cleanup_passed,
            'allOriginalHandlesClosed': self.job_closed and all(c['threadClosed'] and c['processClosed'] for c in self.children),
            'observedJobCpuMilliseconds': int(self.last_cpu * 1000), 'noPublicActions': True,
            'productionMembershipAuthority': False, 'historicalCauseProved': False}


def output_bounds():
    total = entries = 0
    pending = [OUTPUT]
    while pending:
        root = pending.pop()
        require(stat.S_ISDIR(checked(root, HERE).st_mode), 'output-capacity')
        with os.scandir(root) as children:
            for entry in children:
                entries += 1
                item = entry.stat(follow_symlinks=False)
                require(entries <= 16 and not getattr(item, 'st_file_attributes', 0) & 0x400, 'output-capacity')
                if stat.S_ISDIR(item.st_mode): pending.append(Path(entry.path))
                elif stat.S_ISREG(item.st_mode): total += item.st_size
                else: raise ProbeFailure('output-capacity')
    require(total <= 128 * 1024, 'output-capacity')
    return total, entries


def publish_result(data, started, *, clock=time.monotonic, measure=output_bounds,
                   open_pending=None, link_final=None):
    """Actual publication seam: original epoch, fixed paths, no injected path."""
    open_pending = (lambda: (OUTPUT / 'result.pending').open('xb')) if open_pending is None else open_pending
    link_final = (lambda: os.link(OUTPUT / 'result.pending', OUTPUT / 'result.json')) if link_final is None else link_final
    def deadline():
        now = clock()
        require(started <= now < started + 60, 'publication')
    deadline()
    total, entries = measure()
    require(len(data) <= 64 * 1024 and total + 2 * len(data) <= 128 * 1024 and entries + 2 <= 16, 'output-capacity')
    deadline()
    with open_pending() as file:
        file.write(data)
    deadline()  # AFTER actual pending close and immediately BEFORE exclusive link.
    link_final()
    measure()
    deadline()  # Final scan/IO cannot cross the original wall and still exit0.


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if not args: return 0
    if args == ['--owned-child']:
        time.sleep(2)  # Fixed isolated synthetic workload, never run by source tests.
        return 0
    require(len(args) == 3 and args[:2] == ['--run-owned-job-observation', '--source-map-sha256'], 'arguments')
    started = time.monotonic()
    pin = hash_value(args[2])
    original_map, hashes = authenticate_sources(pin)
    authenticate_python()
    require(time.monotonic() - started < 45, 'active-deadline')
    native = WindowsNative()
    require(time.monotonic() - started < 45, 'active-deadline')
    OUTPUT.mkdir()  # Fixed fresh/exclusive. No deletion or adoption.
    (OUTPUT / 'temp').mkdir()
    probe = Experiment(native, started, metadata=output_bounds)
    probe.execute()
    endchecked = False
    try:
        probe.guard(True)
        again, current = authenticate_sources(pin)
        require(again == original_map and current == hashes, 'source-drift')
        authenticate_python()
        probe.guard(True)
        endchecked = True
    except Exception as error: probe.remember(error)
    body = {**probe.result(), 'sourceMapSha256': pin, 'interpreterSha256': PYTHON_SHA,
        'endchecksPassed': endchecked, 'elapsedMilliseconds': int((time.monotonic() - started) * 1000)}
    if not endchecked: body['status'] = 'failed'
    data = wire({**body, 'resultHash': sha(wire(body))})
    require(len(data) <= 64 * 1024, 'output-capacity')
    publish_result(data, started)
    if body['status'] != 'passed': sys.stderr.write('Owned Job observation refused.\n')
    return 0 if body['status'] == 'passed' else 1


if __name__ == '__main__':
    try: sys.exit(main())
    except Exception:
        sys.stderr.write('Owned Job observation refused.\n')
        sys.exit(1)
