"""Default inert. Fixed public DEV diagnostic, own Node/Chrome Job tree only."""
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

if len(sys.argv) == 1:
    print('No action. Explicit --static-controls or --browser-controls; review, freeze and separate approval first.')
    raise SystemExit(0)
if sys.platform != 'win32' or len(sys.argv) != 2 or sys.argv[1] not in ('--static-controls', '--browser-controls'):
    raise SystemExit('Only the fixed Windows public input probe is supported')

PHASE = sys.argv[1][2:]
WALL_LIMIT = 180 if PHASE == 'browser-controls' else 360
ACTIVE_LIMIT = 170 if PHASE == 'browser-controls' else 350
started = time.monotonic()
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
if HERE.drive.upper() != 'D:':
    raise SystemExit('Diagnostic must remain on D drive')
TARGET = HERE / 'run.mjs'
READER = HERE.parents[1] / 'browser' / 'chromium' / 'page-content-reader.js'
READER_SHA = 'c7946a7e19adb3fd9c14b2304101dbd3bf8b7c92fd1ab7c3ba679104b55e428f'
OUTPUT = HERE / ('output-browser' if PHASE == 'browser-controls' else 'output-static')
if not TARGET.is_file() or TARGET.is_symlink() or OUTPUT.exists() or OUTPUT.is_symlink():
    raise SystemExit('Missing fixed runner or existing output prohibits replay')
if HERE.resolve() != HERE:
    raise SystemExit('Reparse diagnostic path refused')
MIB = 1048576
MEMORY_LIMIT = 1536 * MIB
MAX_BYTES = 256 * 1024

class MemoryStatus(ctypes.Structure):
    _fields_ = [('length', wintypes.DWORD), ('load', wintypes.DWORD)] + [
        (key, ctypes.c_ulonglong) for key in ('totalPhysical', 'availablePhysical', 'totalPageFile',
        'availablePageFile', 'totalVirtual', 'availableVirtual', 'availableExtended')]

class ProcessMemory(ctypes.Structure):
    _fields_ = [('cb', wintypes.DWORD), ('faults', wintypes.DWORD)] + [
        (key, ctypes.c_size_t) for key in ('peakWorkingSet', 'workingSet', 'peakPagedPool', 'pagedPool',
        'peakNonPagedPool', 'nonPagedPool', 'pagefile', 'peakPagefile', 'privateUsage')]

class BasicLimits(ctypes.Structure):
    _fields_ = [('perProcessUserTime', ctypes.c_longlong), ('perJobUserTime', ctypes.c_longlong),
        ('limitFlags', wintypes.DWORD), ('minimumWorkingSet', ctypes.c_size_t), ('maximumWorkingSet', ctypes.c_size_t),
        ('activeProcessLimit', wintypes.DWORD), ('affinity', ctypes.c_size_t),
        ('priorityClass', wintypes.DWORD), ('schedulingClass', wintypes.DWORD)]

class IoCounters(ctypes.Structure):
    _fields_ = [(key, ctypes.c_ulonglong) for key in ('readOperations', 'writeOperations', 'otherOperations',
        'readBytes', 'writeBytes', 'otherBytes')]

class ExtendedLimits(ctypes.Structure):
    _fields_ = [('basic', BasicLimits), ('io', IoCounters), ('processMemoryLimit', ctypes.c_size_t),
        ('jobMemoryLimit', ctypes.c_size_t), ('peakProcessMemoryUsed', ctypes.c_size_t), ('peakJobMemoryUsed', ctypes.c_size_t)]

class JobPids(ctypes.Structure):
    _fields_ = [('assigned', wintypes.DWORD), ('listed', wintypes.DWORD), ('pids', ctypes.c_size_t * 128)]

kernel = ctypes.WinDLL('kernel32', use_last_error=True)
psapi = ctypes.WinDLL('psapi', use_last_error=True)
kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
kernel.CreateJobObjectW.restype = wintypes.HANDLE
kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
kernel.QueryInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p]
kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
kernel.IsProcessInJob.argtypes = [wintypes.HANDLE, wintypes.HANDLE, ctypes.POINTER(wintypes.BOOL)]
kernel.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel.OpenProcess.restype = wintypes.HANDLE
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
kernel.GlobalMemoryStatusEx.argtypes = [ctypes.POINTER(MemoryStatus)]
psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessMemory), wintypes.DWORD]

def headroom():
    status = MemoryStatus()
    status.length = ctypes.sizeof(status)
    if not kernel.GlobalMemoryStatusEx(ctypes.byref(status)):
        raise RuntimeError('host-memory-unverifiable')
    if min(status.availablePhysical, status.availablePageFile) < 1024 * MIB:
        raise RuntimeError('host-memory-reserve-unavailable')
    if shutil.disk_usage('C:\\').free < 768 * MIB or shutil.disk_usage('D:\\').free < 512 * MIB:
        raise RuntimeError('drive-reserve-unavailable')

def job_members(job):
    members = JobPids()
    if not kernel.QueryInformationJobObject(job, 3, ctypes.byref(members), ctypes.sizeof(members), None):
        raise RuntimeError('job-pid-list-unverifiable-or-overflow')
    if members.assigned > 128 or members.listed > 128 or members.listed != members.assigned:
        raise RuntimeError('job-pid-capacity')
    return members

def tree_memory(job):
    members = job_members(job)
    rss = private = 0
    for pid in members.pids[:members.listed]:
        handle = kernel.OpenProcess(0x1000 | 0x0010, False, pid)
        if not handle:
            # Exit races are not silently treated as zero memory: fail closed.
            raise RuntimeError('job-member-memory-unverifiable')
        try:
            belongs = wintypes.BOOL()
            if not kernel.IsProcessInJob(handle, job, ctypes.byref(belongs)) or not belongs.value:
                raise RuntimeError('opened-process-not-confirmed-in-own-job')
            memory = ProcessMemory()
            memory.cb = ctypes.sizeof(memory)
            if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), ctypes.sizeof(memory)):
                raise RuntimeError('job-member-memory-unverifiable')
            rss += memory.workingSet
            private += memory.privateUsage
        finally:
            kernel.CloseHandle(handle)
    return rss, private, members.listed

def digest(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MIB:
        raise RuntimeError('bounded-source-unavailable')
    return hashlib.sha256(path.read_bytes()).hexdigest()

headroom()
node = shutil.which('node')
if not node:
    raise SystemExit('Node unavailable')
source_paths = {name: HERE / name for name in ('run.mjs', 'policy.js', 'supervise.py', 'run.test.mjs', 'policy.test.mjs', 'protocol.json', 'README.md')}
source_paths.update({
    'page-content-reader.js': READER,
    'page-content-policy.js': REPO / 'spikes/topic-resolution/browser/core/page-content-policy.js',
    'public-fetch.js': REPO / 'apps/local-service/src/crawler/public-fetch.js',
    'robots.js': REPO / 'apps/local-service/src/crawler/robots.js',
    'static-capture.js': REPO / 'apps/local-service/src/crawler/static-capture.js',
    'robots-deny-space-repair.js': REPO / 'apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js',
})
source_hashes = {name: digest(path) for name, path in source_paths.items()}
freeze_path = HERE / 'freeze.json'
freeze_sha = digest(freeze_path)
freeze_bytes = freeze_path.read_bytes()
if hashlib.sha256(freeze_bytes).hexdigest() != freeze_sha:
    raise SystemExit('Freeze changed during preflight')
frozen = json.loads(freeze_bytes)
freeze_body = {key: value for key, value in frozen.items() if key != 'freezeHash'}
if frozen.get('schema') != 'current-producer-controls-freeze/v1' or frozen.get('sourceHashes') != source_hashes or frozen.get('protocolSha256') != source_hashes['protocol.json'] or hashlib.sha256(json.dumps(freeze_body, separators=(',', ':'), ensure_ascii=False).encode('utf8')).hexdigest() != frozen.get('freezeHash'):
    raise SystemExit('Reviewed freeze unavailable or changed')
if source_hashes['page-content-reader.js'] != READER_SHA:
    raise SystemExit('Reader source changed; review required')
OUTPUT.mkdir()  # Exclusive directory is persistent, including failed attempts.
paths = {name: OUTPUT / suffix for name, suffix in [('marker', 'supervisor.started.json'),
    ('stdout', 'stdout.log'), ('stderr', 'stderr.log'), ('receipt', 'supervisor.json'), ('result', 'result.json')]}
with paths['marker'].open('x', encoding='utf8') as marker:
    json.dump({'schema': 'current-producer-controls-supervisor-started/v1', 'sourceHashes': source_hashes, 'phase': PHASE, 'freezeSha256': freeze_sha,
        'noAutomaticRepeat': True}, marker)

job = process_handle = child = None
reason = None
peak_rss = peak_private = peak_pids = 0
cleanup_confirmed = False
cleanup_reason = None
result_sha = result_text = None
source_hashes_rechecked = False
with paths['stdout'].open('xb') as stdout_log, paths['stderr'].open('xb') as stderr_log:
    try:
        job = kernel.CreateJobObjectW(None, None)
        if not job:
            raise RuntimeError('job-creation-failed')
        limits = ExtendedLimits()
        # No breakaway permission: all descendants remain owned by this Job.
        limits.basic.limitFlags = 0x2000 | 0x200  # KILL_ON_JOB_CLOSE | JOB_MEMORY
        limits.jobMemoryLimit = MEMORY_LIMIT
        if not kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            raise RuntimeError('job-resource-limit-failed')
        allowed = {'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT'}
        env = {key: value for key, value in os.environ.items() if key.upper() in allowed}
        temp = OUTPUT / 'temp'
        temp.mkdir()
        # No inherited credentials, NODE_OPTIONS, owner profile, app or pairing.
        env.update({'TEMP': str(temp), 'TMP': str(temp), 'MURMINGLE_CURRENT_PRODUCER_CONTROLS_V1_SUPERVISED': PHASE,
            'OMP_NUM_THREADS': '1', 'UV_THREADPOOL_SIZE': '1'})
        child = subprocess.Popen([node, '--max-old-space-size=256', str(TARGET), '--' + PHASE],
            cwd=HERE, env=env, creationflags=subprocess.CREATE_NO_WINDOW,
            stdin=subprocess.PIPE, stdout=stdout_log, stderr=stderr_log)
        process_handle = kernel.OpenProcess(0x0100 | 0x0001 | 0x1000, False, child.pid)
        if not process_handle or not kernel.AssignProcessToJobObject(job, process_handle):
            raise RuntimeError('node-job-assignment-failed')
        # Node has no browser-spawn path before this exact handshake. Never send
        # it on assignment failure; there is no browser attach or retry path.
        child.stdin.write(('CURRENT_PRODUCER_CONTROLS_JOB_ASSIGNED_V1:' + PHASE + '\n').encode('ascii'))
        child.stdin.flush()
        child.stdin.close()
        while child.poll() is None:
            headroom()
            rss, private, pids = tree_memory(job)
            peak_rss = max(peak_rss, rss)
            peak_private = max(peak_private, private)
            peak_pids = max(peak_pids, pids)
            sizes = sum(p.stat().st_size for p in [paths['stdout'], paths['stderr'], paths['result']] if p.exists())
            if rss > MEMORY_LIMIT or private > MEMORY_LIMIT or time.monotonic() - started > ACTIVE_LIMIT:
                raise RuntimeError('owned-job-resource-budget-exceeded')
            if sizes > MAX_BYTES:
                raise RuntimeError('owned-output-capacity-exceeded')
            time.sleep(.05)
        child.wait()
        if child.returncode != 0:
            raise RuntimeError('owned-child-failed')
        if time.monotonic() - started > WALL_LIMIT:
            raise RuntimeError('owned-wall-budget-exceeded')
        if paths['result'].is_symlink() or not paths['result'].is_file() or not 0 < paths['result'].stat().st_size <= 192 * 1024:
            raise RuntimeError('bounded-result-unavailable')
        if sum(p.stat().st_size for p in [paths['stdout'], paths['stderr'], paths['result']]) > MAX_BYTES:
            raise RuntimeError('owned-output-capacity-exceeded')
    except Exception as error:
        reason = str(error) if isinstance(error, RuntimeError) else 'supervisor-failed'
    finally:
        cleanup_deadline = time.monotonic() + 5
        try:
            if job and not kernel.TerminateJobObject(job, 1):
                cleanup_reason = 'own-job-termination-unverifiable'
            if child is not None and child.poll() is None:
                child.kill()  # Assignment failure too: exact own Node, never PID/name search.
                child.wait(timeout=max(.01, cleanup_deadline - time.monotonic()))
            if job:
                while True:
                    members = job_members(job)
                    if members.assigned == 0 and members.listed == 0:
                        cleanup_confirmed = child is None or child.poll() is not None
                        break
                    if time.monotonic() >= cleanup_deadline:
                        raise RuntimeError('own-job-final-drain-timeout')
                    time.sleep(.05)
            else:
                cleanup_confirmed = child is None or child.poll() is not None
            if not cleanup_confirmed:
                raise RuntimeError('own-child-final-exit-unconfirmed')
        except Exception as error:
            cleanup_reason = str(error) if isinstance(error, RuntimeError) else 'own-tree-cleanup-unconfirmed'
        finally:
            if process_handle:
                kernel.CloseHandle(process_handle)
            if job:
                kernel.CloseHandle(job)  # Kill-on-close remains a final safety boundary.
        reason = reason or cleanup_reason
    try:
        if digest(freeze_path) != freeze_sha or any(digest(path) != source_hashes[name] for name, path in source_paths.items()):
            raise RuntimeError('diagnostic-source-drift')
        source_hashes_rechecked = True
        if reason is None:
            result_bytes = paths['result'].read_bytes()
            if not 0 < len(result_bytes) <= 192 * 1024:
                raise RuntimeError('bounded-result-unavailable')
            result_sha = hashlib.sha256(result_bytes).hexdigest()
            parsed = json.loads(result_bytes)
            if parsed.get('schema') != 'current-producer-controls-result/v1' or parsed.get('phase') != PHASE or parsed.get('status') != 'complete' or parsed.get('sourceHashes') != source_hashes or parsed.get('sourceHashesRechecked') is not True or parsed.get('freezeSha256') != freeze_sha or (PHASE == 'browser-controls' and parsed.get('protocolCallbacksDrained') is not True):
                raise RuntimeError('result-source-or-drain-witness-mismatch')
    except Exception as error:
        reason = reason or (str(error) if isinstance(error, RuntimeError) else 'final-evidence-unverifiable')
    if time.monotonic() - started > WALL_LIMIT:
        reason = reason or 'owned-total-wall-budget-exceeded'
    receipt = {'schema': 'current-producer-controls-supervisor/v1', 'phase': PHASE, 'reason': reason, 'freezeSha256': freeze_sha,
        'childPid': child.pid if child else None, 'exitCode': child.returncode if child else None,
        'sourceHashes': source_hashes, 'elapsedSeconds': time.monotonic() - started,
        'sampledPeakTreeRssBytes': peak_rss, 'sampledPeakTreePrivateBytes': peak_private,
        'sampledPeakTreeProcesses': peak_pids, 'jobMemoryLimitBytes': MEMORY_LIMIT,
        'ownTreeCleanupConfirmed': cleanup_confirmed, 'cleanupReason': cleanup_reason,
        'sourceHashesRechecked': source_hashes_rechecked,
        'noNativeAttestation': True, 'noModelCalls': True, 'productionValidated': False,
        'purpose': 'already-consumed-TRAIN-controls-compatibility-not-independent-quality'}
    if reason is None:
        receipt['resultSha256'] = result_sha
    with paths['receipt'].open('x', encoding='utf8') as output:
        json.dump(receipt, output)
    print(json.dumps(receipt), flush=True)
    raise SystemExit(0 if reason is None else 1)


