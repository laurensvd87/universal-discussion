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

MODES = ('freeze', 'encode-traincal', 'fit-calibrate', 'encode-test', 'test')
if len(sys.argv) == 1:
    print('No action. Explicit --freeze, --encode-traincal, --fit-calibrate, --encode-test or --test required.')
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
result = here / {'freeze': 'freeze.json', 'encode-traincal': 'output/encoding-traincal.json',
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

kernel = ctypes.WinDLL('kernel32', use_last_error=True)
psapi = ctypes.WinDLL('psapi', use_last_error=True)
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

source_hashes = {'run.js': digest(target), 'supervise.py': digest(Path(__file__))}
# Resource refusal is not a model/test attempt. Do not consume its exclusive
# marker unless reserves have first been verified; the child loop checks again.
headroom()
with paths['marker'].open('x', encoding='utf8') as marker:
    json.dump({'mode': mode, 'noAutomaticRepeat': True, 'sourceHashes': source_hashes}, marker)

started = time.monotonic()
child = handle = None
peak_rss = peak_commit = 0
reason = None
with paths['stdout'].open('xb') as stdout_log, paths['stderr'].open('xb') as stderr_log:
    try:
        headroom()
        if mode != 'freeze':
            frozen_path = here / 'freeze.json'
            if frozen_path.is_symlink() or not frozen_path.is_file() or frozen_path.stat().st_size > MIB:
                raise RuntimeError('frozen-source-witness-unavailable')
            frozen = json.loads(frozen_path.read_text(encoding='utf8'))
            if any(frozen['sourceHashes'].get(key) != value for key, value in source_hashes.items()):
                raise RuntimeError('supervisor-or-target-changed-after-freeze')
        node = shutil.which('node')
        if not node:
            raise RuntimeError('node-unavailable')
        # No inherited NODE_OPTIONS, provider tokens, PG credentials or app flags.
        allowed = {'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'USERPROFILE',
            'APPDATA', 'LOCALAPPDATA', 'USERNAME', 'USERDOMAIN'}
        env = {key: value for key, value in os.environ.items() if key.upper() in allowed}
        env.update({'MURMINGLE_REAL_ROOT_SUPERVISED': mode, 'OMP_NUM_THREADS': '1',
            'OPENBLAS_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1', 'UV_THREADPOOL_SIZE': '1'})
        child = subprocess.Popen([node, '--max-old-space-size=512', str(target), '--' + mode],
            cwd=here.parents[4], env=env, creationflags=subprocess.CREATE_NO_WINDOW,
            stdin=subprocess.DEVNULL, stdout=stdout_log, stderr=stderr_log)
        handle = kernel.OpenProcess(0x1000 | 0x0010, False, child.pid)
        if not handle:
            raise RuntimeError('cannot-inspect-own-child')
        while child.poll() is None:
            headroom()
            if sum(os.fstat(f.fileno()).st_size for f in (stdout_log, stderr_log)) > max_logs:
                raise RuntimeError('own-child-log-capacity-exceeded')
            memory = ProcessMemory()
            memory.cb = ctypes.sizeof(memory)
            if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), ctypes.sizeof(memory)):
                if child.poll() is not None:
                    break
                raise RuntimeError('cannot-inspect-own-child-memory')
            peak_rss = max(peak_rss, memory.workingSet, memory.peakWorkingSet)
            peak_commit = max(peak_commit, memory.privateUsage, memory.peakPagefile)
            if peak_rss > rss_limit or peak_commit > commit_limit or time.monotonic() - started > wall_limit:
                raise RuntimeError('own-child-resource-budget-exceeded')
            time.sleep(.05)
        child.wait()
        if child.returncode != 0:
            reason = 'own-child-failed'
        elif time.monotonic() - started > wall_limit:
            reason = 'own-child-wall-budget-exceeded'
        elif sum(os.fstat(f.fileno()).st_size for f in (stdout_log, stderr_log)) > max_logs:
            reason = 'own-child-log-capacity-exceeded'
        elif result.is_symlink() or not result.is_file() or not 0 < result.stat().st_size <= 8 * MIB:
            reason = 'bounded-phase-result-unavailable'
    except Exception as error:
        reason = str(error) if isinstance(error, RuntimeError) else 'supervisor-validation-failed'
    finally:
        if child is not None and child.poll() is None:
            child.kill()  # Only the exact Popen child created here; never another PID.
            child.wait()
        if handle:
            kernel.CloseHandle(handle)
    receipt = {'schema': 'hierarchy-real-root-supervisor/v1', 'mode': mode,
        'childPid': child.pid if child else None, 'exitCode': child.returncode if child else None,
        'reason': reason, 'sourceHashes': source_hashes, 'sampledPeakChildRssBytes': peak_rss,
        'sampledPeakChildPrivateCommitBytes': peak_commit, 'elapsedSeconds': time.monotonic() - started,
        'productionReady': False, 'assignmentAuthority': False, 'noCaptureOrNetwork': True}
    if reason is None:
        receipt['resultSha256'] = hashlib.sha256(result.read_bytes()).hexdigest()
    with paths['receipt'].open('x', encoding='utf8') as receipt_file:
        json.dump(receipt, receipt_file)
    print(json.dumps(receipt), flush=True)
    raise SystemExit(0 if reason is None else 1)
