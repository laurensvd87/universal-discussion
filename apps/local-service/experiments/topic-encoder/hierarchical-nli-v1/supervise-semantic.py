"""Bounded local NLI experiments; exact own child only, never service/crawler."""
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
    print('No action. Explicit --semantic required.')
    raise SystemExit(0)
if sys.platform != 'win32' or len(sys.argv) != 2 or sys.argv[1] not in ['--semantic']:
    raise SystemExit('Only the fixed Windows NLI operations are supported')
mode = sys.argv[1][2:]
here = Path(__file__).resolve().parent
data = here.parents[2] / 'data'
if here.drive.upper() != 'D:' or not data.is_dir():
    raise SystemExit('NLI evidence must remain in the known D drive data directory')
target, argument = {'semantic': ('semantic-smoke.js', '--semantic')}[mode]
target_path = here / target
if not target_path.is_file() or target_path.is_symlink():
    raise SystemExit('Fixed experiment target unavailable')
prefix = data / ('hierarchy-nli-' + mode + '-adr133')
paths = {key: Path(str(prefix) + '.' + suffix) for key, suffix in [
    ('stdout', 'stdout.log'), ('stderr', 'stderr.log'), ('receipt', 'supervisor.json'),
    ('marker', 'started.json'), ('result', 'json')]}
if any(p.exists() or p.is_symlink() for p in paths.values()):
    raise SystemExit('Existing evidence prohibits replay')
MIB = 1048576
rss_limit = (512 if mode == 'prepare' else 1536) * MIB
commit_limit = (768 if mode == 'prepare' else 1536) * MIB
wall_limit = 360 if mode == 'prepare' else 180
max_logs = 65536
max_result = 2 * MIB

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
        raise RuntimeError('Cannot verify host memory reserve')
    if min(status.availablePhysical, status.availablePageFile) < 1024 * MIB:
        raise RuntimeError('Host physical or commit reserve unavailable')
    if shutil.disk_usage('C:\\').free < 768 * MIB or shutil.disk_usage('D:\\').free < 512 * MIB:
        raise RuntimeError('Drive reserve unavailable')

headroom()
node = shutil.which('node')
if not node:
    raise SystemExit('Node unavailable')
env = os.environ.copy()
env['MURMINGLE_NLI_SUPERVISED'] = mode
started = time.monotonic()
peak_rss = peak_commit = 0
reason = None
with paths['stdout'].open('xb') as stdout_log, paths['stderr'].open('xb') as stderr_log:
    child = subprocess.Popen([node, '--max-old-space-size=512', str(target_path), argument],
        cwd=here.parents[2], env=env, creationflags=subprocess.CREATE_NO_WINDOW,
        stdin=subprocess.DEVNULL, stdout=stdout_log, stderr=stderr_log)
    handle = None
    try:
        handle = kernel.OpenProcess(0x1000 | 0x0010, False, child.pid)
        if not handle:
            raise RuntimeError('Cannot inspect exact own NLI child')
        while child.poll() is None:
            headroom()
            if sum(os.fstat(f.fileno()).st_size for f in [stdout_log, stderr_log]) > max_logs:
                raise RuntimeError('Own child log capacity exceeded')
            memory = ProcessMemory()
            memory.cb = ctypes.sizeof(memory)
            if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), ctypes.sizeof(memory)):
                if child.poll() is not None:
                    break
                raise RuntimeError('Cannot inspect own child memory')
            peak_rss = max(peak_rss, memory.workingSet)
            peak_commit = max(peak_commit, memory.privateUsage)
            if memory.workingSet > rss_limit or memory.privateUsage > commit_limit or time.monotonic() - started > wall_limit:
                raise RuntimeError('Own NLI child resource budget exceeded')
            time.sleep(.05)
        child.wait()
        if sum(os.fstat(f.fileno()).st_size for f in [stdout_log, stderr_log]) > max_logs:
            reason = 'own-child-log-capacity-exceeded'
        elif child.returncode != 0:
            reason = 'own-child-failed'
        elif time.monotonic() - started > wall_limit:
            reason = 'own-child-wall-budget-exceeded'
        elif mode != 'prepare' and (paths['result'].is_symlink() or not paths['result'].is_file() or
                not 0 < paths['result'].stat().st_size <= max_result):
            reason = 'bounded-result-unavailable'
        elif mode == 'prepare' and not (data / 'hierarchy-nli-assets-adr133-v1' / 'preparation-complete.json').is_file():
            reason = 'asset-completion-receipt-unavailable'
    except Exception as error:
        reason = str(error)
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        if handle:
            kernel.CloseHandle(handle)
    receipt = {'schema': 'hierarchy-nli-supervisor/v1', 'mode': mode, 'childPid': child.pid,
        'exitCode': child.returncode, 'reason': reason, 'sampledPeakChildRssBytes': peak_rss,
        'sampledPeakChildPrivateCommitBytes': peak_commit, 'elapsedSeconds': time.monotonic() - started,
        'targetSha256': hashlib.sha256(target_path.read_bytes()).hexdigest(),
        'supervisorSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'productionReady': False, 'independentHoldout': False}
    with paths['receipt'].open('x', encoding='utf-8') as output:
        json.dump(receipt, output)
    print(json.dumps(receipt), flush=True)
    raise SystemExit(0 if reason is None else 1)
