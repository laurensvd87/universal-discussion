"""One fixed real-root experiment child; no capture/network or service/crawler actions."""
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

MODES = ('freeze', 'prepare-eligibility', 'encode-expansion', 'fit-calibrate', 'encode-test', 'test')
if len(sys.argv) == 1:
    print('No action. Explicit --freeze, --prepare-eligibility, --encode-expansion, --fit-calibrate, --encode-test or --test required.')
    raise SystemExit(0)
if sys.platform != 'win32' or len(sys.argv) != 2 or sys.argv[1] not in ['--' + mode for mode in MODES]:
    raise SystemExit('Only fixed Windows real-root experiment operations are supported')

here = Path(__file__).resolve().parent
if here.drive.upper() != 'D:':
    raise SystemExit('Real-root experiment must remain on D drive')
target = here / 'run.js'
if not target.is_file() or target.is_symlink():
    raise SystemExit('Fixed experiment target unavailable')
mode = sys.argv[1][2:]
output = here / 'output'
if output.is_symlink() or output.exists() and not output.is_dir():
    raise SystemExit('Unsafe experiment output directory')
output.mkdir(exist_ok=True)
if output.resolve() != output:
    raise SystemExit('Reparse experiment output directory refused')
result = here / {'freeze': 'freeze.json', 'prepare-eligibility': 'output/training-eligibility.json', 'encode-expansion': 'output/encoding-training-expansion.json',
    'fit-calibrate': 'output/selection.json', 'encode-test': 'output/encoding-test.json', 'test': 'measured-results.json'}[mode]
paths = {key: output / (mode + '.' + suffix) for key, suffix in (
    ('stdout', 'stdout.log'), ('stderr', 'stderr.log'), ('receipt', 'supervisor.json'),
    ('marker', 'supervisor.started.json'))}
runner_marker = output / (mode + '.started.json')
if any(p.exists() or p.is_symlink() for p in [*paths.values(), result, runner_marker]):
    raise SystemExit('Existing evidence prohibits replay')
MIB = 1048576
rss_limit = commit_limit = 1536 * MIB
wall_limit = 180
max_logs = 128 * 1024

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
        raise RuntimeError('cannot-verify-host-memory')
    if min(status.availablePhysical, status.availablePageFile) < 1024 * MIB:
        raise RuntimeError('host-memory-reserve-unavailable')
    if shutil.disk_usage('C:\\').free < 768 * MIB or shutil.disk_usage('D:\\').free < 512 * MIB:
        raise RuntimeError('drive-reserve-unavailable')

def digest(filename):
    if filename.is_symlink() or not filename.is_file() or filename.stat().st_size > 8 * MIB:
        raise RuntimeError('bounded-source-unavailable')
    return hashlib.sha256(filename.read_bytes()).hexdigest()

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

headroom()
node = shutil.which('node')
if not node:
    raise SystemExit('Node unavailable')
source_paths = {'run.js': target, 'supervise.py': Path(__file__)}
source_hashes = {name: digest(path) for name, path in source_paths.items()}
paths['result'] = result
with paths['marker'].open('x', encoding='utf8') as marker:
    json.dump({'schema': 'expanded-root-started/v1', 'mode': mode, 'sourceHashes': source_hashes,
        'noAutomaticRepeat': True}, marker)

job = process_handle = child = None
started = time.monotonic()
reason = None
peak_rss = peak_private = peak_pids = 0
cleanup_confirmed = False
cleanup_reason = None
result_sha = result_text = None
source_hashes_rechecked = False
with paths['stdout'].open('xb') as stdout_log, paths['stderr'].open('xb') as stderr_log:
    try:
        if mode != 'freeze':
            frozen_path = here / 'freeze.json'
            if frozen_path.is_symlink() or not frozen_path.is_file() or frozen_path.stat().st_size > MIB:
                raise RuntimeError('frozen-source-witness-unavailable')
            frozen = json.loads(frozen_path.read_text(encoding='utf8'))
            if any(frozen['sourceHashes'].get(k) != v for k, v in source_hashes.items()):
                raise RuntimeError('supervisor-or-runner-changed')
        job = kernel.CreateJobObjectW(None, None)
        if not job:
            raise RuntimeError('job-creation-failed')
        limits = ExtendedLimits()
        # No breakaway permission: all descendants remain owned by this Job.
        limits.basic.limitFlags = 0x2000 | 0x200  # KILL_ON_JOB_CLOSE | JOB_MEMORY
        limits.jobMemoryLimit = rss_limit
        if not kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            raise RuntimeError('job-resource-limit-failed')
        allowed = {'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT'}
        env = {key: value for key, value in os.environ.items() if key.upper() in allowed}
        temp = output / (mode + '.temp')
        temp.mkdir()
        # No inherited credentials, NODE_OPTIONS, owner profile, app or pairing.
        env.update({'TEMP': str(temp), 'TMP': str(temp), 'MURMINGLE_CAPACITY_ROOT_V1_SUPERVISED': mode,
            'OMP_NUM_THREADS': '1', 'OPENBLAS_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1', 'UV_THREADPOOL_SIZE': '1'})
        child = subprocess.Popen([node, '--max-old-space-size=512', str(target), '--' + mode],
            cwd=here, env=env, creationflags=subprocess.CREATE_NO_WINDOW,
            stdin=subprocess.PIPE, stdout=stdout_log, stderr=stderr_log)
        process_handle = kernel.OpenProcess(0x0100 | 0x0001 | 0x1000, False, child.pid)
        if not process_handle or not kernel.AssignProcessToJobObject(job, process_handle):
            raise RuntimeError('node-job-assignment-failed')
        # Node has no experiment/encoder execution before this exact handshake.
        # Never send it on assignment failure; no external process is attached.
        child.stdin.write(b'CAPACITY_ROOT_JOB_ASSIGNED_V1\n')
        child.stdin.flush()
        child.stdin.close()
        while child.poll() is None:
            headroom()
            rss, private, pids = tree_memory(job)
            peak_rss = max(peak_rss, rss)
            peak_private = max(peak_private, private)
            peak_pids = max(peak_pids, pids)
            sizes = sum(p.stat().st_size for p in [paths['stdout'], paths['stderr']] if p.exists())
            if rss > rss_limit or private > rss_limit or time.monotonic() - started > 180:
                raise RuntimeError('owned-job-resource-budget-exceeded')
            if sizes > max_logs:
                raise RuntimeError('owned-output-capacity-exceeded')
            time.sleep(.05)
        child.wait()
        if child.returncode != 0:
            raise RuntimeError('owned-child-failed')
        if time.monotonic() - started > 180:
            raise RuntimeError('owned-wall-budget-exceeded')
        if paths['result'].is_symlink() or not paths['result'].is_file() or not 0 < paths['result'].stat().st_size <= 8 * MIB:
            raise RuntimeError('bounded-result-unavailable')
        if sum(p.stat().st_size for p in [paths['stdout'], paths['stderr']]) > max_logs:
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
        if any(digest(path) != source_hashes[name] for name, path in source_paths.items()):
            raise RuntimeError('diagnostic-source-drift')
        source_hashes_rechecked = True
        if reason is None:
            result_sha = digest(paths['result'])
            result_text = paths['result'].read_text(encoding='utf8')
    except Exception as error:
        reason = reason or (str(error) if isinstance(error, RuntimeError) else 'final-evidence-unverifiable')
    receipt = {'schema': 'hierarchy-capacity-root-supervisor/v1', 'mode': mode, 'reason': reason,
        'childPid': child.pid if child else None, 'exitCode': child.returncode if child else None,
        'sourceHashes': source_hashes, 'elapsedSeconds': time.monotonic() - started,
        'sampledPeakTreeRssBytes': peak_rss, 'sampledPeakTreePrivateBytes': peak_private,
        'sampledPeakTreeProcesses': peak_pids, 'jobMemoryLimitBytes': rss_limit,
        'ownTreeCleanupConfirmed': cleanup_confirmed, 'cleanupReason': cleanup_reason,
        'sourceHashesRechecked': source_hashes_rechecked,
        'retainedPhaseTempDirectory': mode + '.temp',
        'noNativeAttestation': True, 'productionValidated': False, 'assignmentAuthority': False, 'noCaptureOrNetwork': True}
    if reason is None:
        receipt['resultSha256'] = result_sha
    with paths['receipt'].open('x', encoding='utf8') as output:
        json.dump(receipt, output)
    print(json.dumps(receipt), flush=True)
    raise SystemExit(0 if reason is None else 1)
