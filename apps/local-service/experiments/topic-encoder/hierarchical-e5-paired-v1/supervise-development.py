"""One explicit DEVELOPMENT run. Never starts/stops the application or crawler."""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

if len(sys.argv) == 1:
    print('No action. Explicit --run-development is required.')
    raise SystemExit(0)
if sys.argv[1:] != ['--run-development'] or sys.platform != 'win32':
    raise SystemExit('Only the fixed Windows development run is supported')
here = Path(__file__).resolve().parent
data = here.parents[2] / 'data'
if here.drive.upper() != 'D:' or not data.is_dir():
    raise SystemExit('Development evidence must stay in the known D drive data directory')
prefix = data / 'hierarchy-paired-development-adr133'
marker = Path(str(prefix) + '.started.json')
result_path = Path(str(prefix) + '.json')
stdout_path = Path(str(prefix) + '.stdout.log')
stderr_path = Path(str(prefix) + '.stderr.log')
receipt_path = Path(str(prefix) + '.supervisor.json')
protocol = json.loads((here / 'development-protocol.json').read_bytes())
limits = protocol['limits']
required_limits = {'processRssBytes': 1536 * 1048576, 'processPrivateCommitBytes': 1536 * 1048576,
    'hostReserveBytes': 1024 * 1048576, 'cDriveReserveBytes': 768 * 1048576,
    'wallSeconds': 180, 'resultBytes': 2 * 1048576, 'logBytes': 65536, 'threads': 1}
if limits != required_limits:
    raise SystemExit('Development resource policy differs from the reviewed fixed limits')
if any(p.exists() or p.is_symlink() for p in [marker, result_path, stdout_path, stderr_path, receipt_path]):
    raise SystemExit('Existing development evidence prohibits replay')

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
        raise RuntimeError('Cannot verify host memory')
    if min(status.availablePhysical, status.availablePageFile) < limits['hostReserveBytes']:
        raise RuntimeError('Host memory reserve unavailable')
    if shutil.disk_usage('C:\\').free < limits['cDriveReserveBytes']:
        raise RuntimeError('C drive reserve unavailable')

headroom()
node = shutil.which('node')
if not node:
    raise SystemExit('Node unavailable')
env = os.environ.copy()
env['MURMINGLE_PAIRED_DEV_SUPERVISED'] = '1'
started = time.monotonic()
peak_rss = peak_commit = 0
reason = None
with stdout_path.open('xb') as stdout_log, stderr_path.open('xb') as stderr_log:
    child = subprocess.Popen([node, '--max-old-space-size=768', str(here / 'development.js'), '--run-development'],
        cwd=here.parents[2], env=env, creationflags=subprocess.CREATE_NO_WINDOW,
        stdin=subprocess.DEVNULL, stdout=stdout_log, stderr=stderr_log)
    handle = None
    try:
        handle = kernel.OpenProcess(0x1000 | 0x0010, False, child.pid)
        if not handle:
            raise RuntimeError('Cannot inspect exact own development child')
        while child.poll() is None:
            headroom()
            if sum(os.fstat(f.fileno()).st_size for f in [stdout_log, stderr_log]) > limits['logBytes']:
                raise RuntimeError('Development log capacity exceeded')
            memory = ProcessMemory()
            memory.cb = ctypes.sizeof(memory)
            if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), ctypes.sizeof(memory)):
                if child.poll() is not None:
                    break
                raise RuntimeError('Cannot verify exact child memory')
            peak_rss = max(peak_rss, memory.workingSet)
            peak_commit = max(peak_commit, memory.privateUsage)
            if (memory.workingSet > limits['processRssBytes'] or
                    memory.privateUsage > limits['processPrivateCommitBytes'] or
                    time.monotonic() - started > limits['wallSeconds']):
                raise RuntimeError('Development child exceeded resource budget')
            time.sleep(.05)
        code = child.wait()
        if sum(os.fstat(f.fileno()).st_size for f in [stdout_log, stderr_log]) > limits['logBytes']:
            reason = 'development-log-capacity-exceeded'
        elif code != 0:
            reason = 'development-child-failed'
        elif (result_path.is_symlink() or not result_path.is_file() or
                not 0 < result_path.stat().st_size <= limits['resultBytes']):
            reason = 'bounded-development-result-missing'
        elif time.monotonic() - started > limits['wallSeconds']:
            reason = 'development-wall-budget-exceeded'
    except Exception as error:
        reason = str(error)
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()  # Only this supervisor's own child, never the crawler.
        if handle:
            kernel.CloseHandle(handle)
    receipt = {'schema': 'hierarchy-paired-development-supervisor/v1', 'childPid': child.pid,
        'exitCode': child.returncode, 'reason': reason, 'sampledPeakChildRssBytes': peak_rss,
        'sampledPeakChildPrivateCommitBytes': peak_commit, 'elapsedSeconds': time.monotonic() - started,
        'productionReady': False, 'independentHoldout': False}
    with receipt_path.open('x', encoding='utf-8') as output:
        json.dump(receipt, output)
    print(json.dumps(receipt), flush=True)
    raise SystemExit(0 if reason is None else 1)
