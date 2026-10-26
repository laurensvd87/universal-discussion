"""One bounded experiment child, with Windows commit/RSS and system headroom guards."""
import ctypes
import json
from pathlib import Path
import subprocess
import sys
import time
import psutil

class MemoryStatus(ctypes.Structure):
    _fields_ = [('length',ctypes.c_ulong),('load',ctypes.c_ulong)] + [
        (name,ctypes.c_ulonglong) for name in ('totalPhysical','availablePhysical',
        'totalPageFile','availablePageFile','totalVirtual','availableVirtual','availableExtended')]

budget = json.loads(Path(__file__).with_name('protocol.json').read_text())['budget']
if len(sys.argv) < 2:
    raise SystemExit('Expected child command')
child = subprocess.Popen(sys.argv[1:])
process = psutil.Process(child.pid)
started = time.monotonic()
peak_rss = peak_commit = 0
try:
    while child.poll() is None:
        status = MemoryStatus()
        status.length = ctypes.sizeof(status)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            raise RuntimeError('Cannot establish commit headroom')
        rss = commit = 0
        for item in [process, *process.children(recursive=True)]:
            try:
                memory = item.memory_info()
                rss += memory.rss
                commit += memory.pagefile
            except psutil.NoSuchProcess:
                pass
        peak_rss, peak_commit = max(peak_rss,rss), max(peak_commit,commit)
        if (rss > budget['maxProcessRssMiB']*1048576 or
            commit > budget['maxProcessCommitMiB']*1048576 or
            status.availablePageFile < budget['minSystemAvailableMiB']*1048576 or
            status.availablePhysical < budget['minSystemAvailableMiB']*1048576 or
            time.monotonic()-started > budget['maxWallSeconds']):
            raise RuntimeError('Child resource budget exceeded')
        time.sleep(.05)
    print(json.dumps({'stage':'supervisor-complete','exitCode':child.returncode,
        'peakChildRssBytes':peak_rss,'peakChildCommitBytes':peak_commit}),flush=True)
    raise SystemExit(child.returncode)
finally:
    if child.poll() is None:
        for item in reversed(process.children(recursive=True)):
            item.kill()
        child.kill()
        child.wait()
