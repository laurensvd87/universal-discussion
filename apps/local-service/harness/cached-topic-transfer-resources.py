"""Read-only Windows resource counters for the one local E5 transfer trial."""
import ctypes
import datetime
import json
from ctypes import wintypes


class PerformanceInfo(ctypes.Structure):
    _fields_ = [('cb', wintypes.DWORD)] + [(n, ctypes.c_size_t) for n in (
        'CommitTotal', 'CommitLimit', 'CommitPeak', 'PhysicalTotal',
        'PhysicalAvailable', 'SystemCache', 'KernelTotal', 'KernelPaged',
        'KernelNonpaged', 'PageSize')] + [(n, wintypes.DWORD) for n in (
        'HandleCount', 'ProcessCount', 'ThreadCount')]


def snapshot():
    info = PerformanceInfo()
    info.cb = ctypes.sizeof(info)
    call = ctypes.WinDLL('psapi', use_last_error=True).GetPerformanceInfo
    call.argtypes = [ctypes.POINTER(PerformanceInfo), wintypes.DWORD]
    call.restype = wintypes.BOOL
    if not call(ctypes.byref(info), info.cb):
        raise RuntimeError('Resource counters unavailable')
    result = {'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'physicalFree': info.PhysicalAvailable * info.PageSize,
              'commitFree': (info.CommitLimit - info.CommitTotal) * info.PageSize}
    disk = ctypes.WinDLL('kernel32', use_last_error=True).GetDiskFreeSpaceExW
    disk.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(ctypes.c_ulonglong),
                     ctypes.POINTER(ctypes.c_ulonglong), ctypes.POINTER(ctypes.c_ulonglong)]
    disk.restype = wintypes.BOOL
    for drive in ('C', 'D'):
        free, total, available = (ctypes.c_ulonglong() for _ in range(3))
        if not disk(drive + ':\\', ctypes.byref(free), ctypes.byref(total), ctypes.byref(available)):
            raise RuntimeError('Disk counters unavailable')
        result[drive.lower() + 'Free'] = free.value
    return result


if __name__ == '__main__':
    print(json.dumps(snapshot()))
