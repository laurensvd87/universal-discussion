"""Supervise only this experiment's encoder child with Windows RSS/commit guards."""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

if sys.argv[1:] != ['--encode']:
    print('No action. Use --encode for the bounded synthetic local-model experiment.')
    raise SystemExit(0)
if sys.platform != 'win32':
    raise SystemExit('This checked resource supervisor requires Windows')
here = Path(__file__).resolve().parent
budget = json.loads((here / 'protocol.json').read_text(encoding='utf8'))['budget']
if (budget['threads'] != 1 or not 1 <= budget['maxProcessRssMiB'] <= 1536 or
        not 1 <= budget['maxProcessCommitMiB'] <= 1536 or
        budget['minSystemAvailableMiB'] < 512 or not 1 <= budget['maxWallSeconds'] <= 180):
    raise SystemExit('Invalid resource budget')

class MemoryStatus(ctypes.Structure):
    _fields_ = [('length', wintypes.DWORD), ('load', wintypes.DWORD)] + [
        (name, ctypes.c_ulonglong) for name in ('totalPhysical', 'availablePhysical',
        'totalPageFile', 'availablePageFile', 'totalVirtual', 'availableVirtual', 'availableExtended')]

class ProcessMemory(ctypes.Structure):
    _fields_ = [('cb', wintypes.DWORD), ('faults', wintypes.DWORD)] + [
        (name, ctypes.c_size_t) for name in ('peakWorkingSet', 'workingSet', 'peakPagedPool',
        'pagedPool', 'peakNonPagedPool', 'nonPagedPool', 'pagefile', 'peakPagefile', 'privateUsage')]

kernel = ctypes.WinDLL('kernel32', use_last_error=True)
psapi = ctypes.WinDLL('psapi', use_last_error=True)
kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel.OpenProcess.restype = wintypes.HANDLE
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
kernel.GlobalMemoryStatusEx.argtypes = [ctypes.POINTER(MemoryStatus)]
psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessMemory), wintypes.DWORD]

status = MemoryStatus(); status.length = ctypes.sizeof(status)
if not kernel.GlobalMemoryStatusEx(ctypes.byref(status)):
    raise SystemExit('Cannot verify host memory headroom')
reserve = budget['minSystemAvailableMiB'] * 1048576
if min(status.availablePhysical, status.availablePageFile) < reserve:
    raise SystemExit('Host memory reserve unavailable; no encoder started')
node = shutil.which('node')
if not node:
    raise SystemExit('Node is unavailable')
child_env = os.environ.copy()
child_env['MURMINGLE_HIERARCHY_SUPERVISED'] = '1'
child = subprocess.Popen([node, '--max-old-space-size=768', str(here / 'run.js'), '--encode'],
                         cwd=here.parents[4], env=child_env, creationflags=subprocess.CREATE_NO_WINDOW)
handle = kernel.OpenProcess(0x1000 | 0x0010, False, child.pid)
started = time.monotonic()
peak_rss = peak_commit = 0
violation = False
try:
    if not handle:
        raise RuntimeError('Cannot verify child memory')
    while child.poll() is None:
        status = MemoryStatus(); status.length = ctypes.sizeof(status)
        memory = ProcessMemory(); memory.cb = ctypes.sizeof(memory)
        if (not kernel.GlobalMemoryStatusEx(ctypes.byref(status)) or
                not psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), ctypes.sizeof(memory))):
            if child.poll() is not None:
                break
            raise RuntimeError('Cannot verify child resource state')
        peak_rss = max(peak_rss, memory.workingSet)
        peak_commit = max(peak_commit, memory.privateUsage)
        if (memory.workingSet > budget['maxProcessRssMiB'] * 1048576 or
                memory.privateUsage > budget['maxProcessCommitMiB'] * 1048576 or
                min(status.availablePhysical, status.availablePageFile) < reserve or
                time.monotonic() - started > budget['maxWallSeconds']):
            violation = True
            raise RuntimeError('Synthetic encoder resource budget exceeded')
        time.sleep(.05)
    code = child.wait()
    print(json.dumps({'stage': 'supervisor-complete', 'exitCode': code, 'resourceViolation': violation,
        'peakChildRssBytes': peak_rss, 'peakChildCommitBytes': peak_commit}), flush=True)
    raise SystemExit(code)
finally:
    if child.poll() is None:
        # Only our exact Popen child. Network/process creation is also denied in JS.
        child.kill()
        child.wait()
    if handle:
        kernel.CloseHandle(handle)
