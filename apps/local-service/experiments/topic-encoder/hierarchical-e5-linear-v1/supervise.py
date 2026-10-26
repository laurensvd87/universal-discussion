"""Bounded supervisor for one explicit experiment child; never a live service."""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

if len(sys.argv) != 2 or sys.argv[1] not in ('--encode', '--fit', '--test'):
    print('No action. Use --encode, --fit or --test for a checked experiment phase.')
    raise SystemExit(0)
if sys.platform != 'win32':
    raise SystemExit('The checked resource supervisor requires Windows')
here = Path(__file__).resolve().parent
budget = json.loads((here / 'protocol.json').read_text(encoding='utf8'))['budget']
if (budget['threads'] != 1 or not 1 <= budget['maxProcessRssMiB'] <= 1536 or
        not 1 <= budget['maxProcessCommitMiB'] <= 1536 or
        budget['minSystemAvailableMiB'] < 1024 or budget['minCDriveFreeMiB'] < 768 or
        not 1 <= budget['maxWallSeconds'] <= 180):
    raise SystemExit('Invalid experiment resource budget')

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
reserve = budget['minSystemAvailableMiB'] * 1048576

def headroom():
    status = MemoryStatus(); status.length = ctypes.sizeof(status)
    if not kernel.GlobalMemoryStatusEx(ctypes.byref(status)):
        raise RuntimeError('Cannot verify host memory reserve')
    if min(status.availablePhysical, status.availablePageFile) < reserve:
        raise RuntimeError('Host memory reserve unavailable')
    if shutil.disk_usage('C:\\').free < budget['minCDriveFreeMiB'] * 1048576:
        raise RuntimeError('C drive safety reserve unavailable')

headroom()
node = shutil.which('node')
if not node:
    raise SystemExit('Node is unavailable')
mode = sys.argv[1][2:]
child_env = os.environ.copy(); child_env['MURMINGLE_LINEAR_SUPERVISED'] = mode
child = subprocess.Popen([node, '--max-old-space-size=768', str(here / 'run.js'), sys.argv[1]],
    cwd=here.parents[4], env=child_env, creationflags=subprocess.CREATE_NO_WINDOW)
handle = kernel.OpenProcess(0x1000 | 0x0010, False, child.pid)
started = time.monotonic(); peak_rss = peak_commit = 0
try:
    if not handle:
        raise RuntimeError('Cannot inspect exact child resources')
    while child.poll() is None:
        headroom()
        memory = ProcessMemory(); memory.cb = ctypes.sizeof(memory)
        if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), ctypes.sizeof(memory)):
            if child.poll() is not None:
                break
            raise RuntimeError('Cannot verify child memory')
        peak_rss = max(peak_rss, memory.workingSet); peak_commit = max(peak_commit, memory.privateUsage)
        if (memory.workingSet > budget['maxProcessRssMiB'] * 1048576 or
                memory.privateUsage > budget['maxProcessCommitMiB'] * 1048576 or
                time.monotonic() - started > budget['maxWallSeconds']):
            raise RuntimeError('Experiment child exceeded resource budget')
        time.sleep(.05)
    code = child.wait()
    print(json.dumps({'stage': 'supervisor-complete', 'mode': mode, 'exitCode': code,
        'sampledPeakChildRssBytes': peak_rss, 'sampledPeakChildPrivateCommitBytes': peak_commit,
        'elapsedSeconds': time.monotonic() - started}), flush=True)
    raise SystemExit(code)
finally:
    if child.poll() is None:
        child.kill(); child.wait()  # Only this exact child, never services or crawler.
    if handle:
        kernel.CloseHandle(handle)
