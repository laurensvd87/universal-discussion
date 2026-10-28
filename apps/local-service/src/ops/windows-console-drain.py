"""Drain the four original Murmingle processes; never terminate a process.

Import is inert. The fixed original identities deliberately expire on restart.
The CLI sends at most one Ctrl+C per role and retains an exclusive attempt file.
"""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import sys

ORIGINALS = {
    'crawler': (4060, 134374874198004480),
    'api': (19868, 134368609403565948),
    'worker': (36616, 134368608212543986),
    'dashboard': (6644, 134363848153050342),
}
NODE = 'c:\\program files\\nodejs\\node.exe'
DATA = Path(__file__).resolve().parents[2] / 'data'


def require(value):
    if not value:
        raise RuntimeError('console-drain-refused')


class WindowsConsole:
    def __init__(self):
        require(sys.platform == 'win32')
        self.k = ctypes.WinDLL('kernel32', use_last_error=True)
        signatures = {
            'OpenProcess': ([wintypes.DWORD, wintypes.BOOL, wintypes.DWORD], wintypes.HANDLE),
            'CloseHandle': ([wintypes.HANDLE], wintypes.BOOL),
            'GetProcessTimes': ([wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4, wintypes.BOOL),
            'QueryFullProcessImageNameW': ([wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)], wintypes.BOOL),
            'GetExitCodeProcess': ([wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)], wintypes.BOOL),
            'FreeConsole': ([], wintypes.BOOL),
            'AttachConsole': ([wintypes.DWORD], wintypes.BOOL),
            'GetConsoleProcessList': ([ctypes.POINTER(wintypes.DWORD), wintypes.DWORD], wintypes.DWORD),
            'SetConsoleCtrlHandler': ([ctypes.c_void_p, wintypes.BOOL], wintypes.BOOL),
            'GenerateConsoleCtrlEvent': ([wintypes.DWORD, wintypes.DWORD], wintypes.BOOL),
            'WaitForSingleObject': ([wintypes.HANDLE, wintypes.DWORD], wintypes.DWORD),
        }
        for name, (args, result) in signatures.items():
            function = getattr(self.k, name)
            function.argtypes, function.restype = args, result

    def open(self, pid):
        handle = self.k.OpenProcess(0x100000 | 0x1000, False, pid)
        require(handle)
        return handle

    def absent(self, pid):
        ctypes.set_last_error(0)
        handle = self.k.OpenProcess(0x100000 | 0x1000, False, pid)
        if handle:
            self.close(handle)
            return False
        require(ctypes.get_last_error() == 87)  # Access denied is not absence.
        return True

    def identity(self, handle):
        times = [wintypes.FILETIME() for _ in range(4)]
        require(self.k.GetProcessTimes(handle, *[ctypes.byref(value) for value in times]))
        name, size, code = ctypes.create_unicode_buffer(32768), wintypes.DWORD(32768), wintypes.DWORD()
        require(self.k.QueryFullProcessImageNameW(handle, 0, name, ctypes.byref(size)))
        require(self.k.GetExitCodeProcess(handle, ctypes.byref(code)))
        return ((times[0].dwHighDateTime << 32) | times[0].dwLowDateTime, name.value.lower(), code.value)

    def detach(self):
        self.k.FreeConsole()  # This separate helper's console only.

    def attach(self, pid):
        require(self.k.AttachConsole(pid))

    def members(self):
        values = (wintypes.DWORD * 64)()
        count = self.k.GetConsoleProcessList(values, 64)
        require(0 < count <= 64)
        return list(values)[:count]

    def interrupt(self):
        require(self.k.SetConsoleCtrlHandler(None, True))  # Ignore Ctrl+C in this helper.
        require(self.k.GenerateConsoleCtrlEvent(0, 0))

    def wait(self, handle):
        require(self.k.WaitForSingleObject(handle, 180000) == 0)
        code = wintypes.DWORD()
        require(self.k.GetExitCodeProcess(handle, ctypes.byref(code)))
        return code.value

    def close(self, handle):
        require(self.k.CloseHandle(handle))


def inspect_or_drain(role, mode, native, own_pid):
    require(role in ORIGINALS and mode in ('probe', 'drain'))
    pid = ORIGINALS[role][0]
    handle, attached = None, False
    try:
        handle = native.open(pid)
        original = native.identity(handle)
        require(original[0] == ORIGINALS[role][1] and original[1] == NODE and original[2] == 259)
        native.detach()
        native.attach(pid)
        attached = True
        require(sorted(native.members()) == sorted([own_pid, pid]))
        require(native.identity(handle) == original)
        result = {'role': role, 'pid': pid, 'creationFiletime': str(original[0]), 'exclusiveConsole': True, 'signalSent': False, 'exited': False}
        if mode == 'drain':
            # Recheck both witnesses at the last boundary. No group-directed
            # Ctrl+C assumption: broadcast is safe only in this exclusive console.
            require(sorted(native.members()) == sorted([own_pid, pid]))
            require(native.identity(handle) == original)
            native.interrupt()
            result['signalSent'] = True
            result['exitCode'] = native.wait(handle)
            # Both original entrypoints explicitly return130 after draining.
            # Windows' default Ctrl+C termination code is not a graceful stop.
            require(result['exitCode'] == 130)
            result['exited'] = True
        return result
    finally:
        if attached:
            native.detach()
        if handle is not None:
            native.close(handle)


def main(args):
    if args == ['absence', 'all']:
        try:
            native = WindowsConsole()
            require(all(native.absent(pid) for pid, _created in ORIGINALS.values()))
            print('{"originalProcessesAbsent":true,"signalSent":false}')
            return 0
        except Exception:
            print('{"originalProcessesAbsent":false,"signalSent":false}')
            return 1
    if len(args) != 2 or args[0] not in ('probe', 'drain') or args[1] not in ORIGINALS:
        return 2
    marker = None
    try:
        if args[0] == 'drain':
            for parent in (DATA, *DATA.parents):
                info = parent.lstat()
                require(parent.is_dir() and not info.st_file_attributes & 0x400)
            # Never reuse an earlier attempt or resend after uncertain observation.
            marker = (DATA / ('cutover-console-drain-20261028-' + args[1] + '.json')).open('x', encoding='utf8')
            marker.write(json.dumps({'role': args[1], 'status': 'attempted', 'noAutomaticRetry': True}) + '\n')
            marker.flush()
            os.fsync(marker.fileno())
        result = inspect_or_drain(args[1], args[0], WindowsConsole(), os.getpid())
        print(json.dumps(result, separators=(',', ':')))
        if marker:
            marker.write(json.dumps(result, separators=(',', ':')) + '\n')
            marker.flush()
            os.fsync(marker.fileno())
        return 0
    except Exception:
        print('{"status":"refused-or-unsettled","noAutomaticRetry":true}')
        return 1
    finally:
        if marker:
            marker.close()


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
