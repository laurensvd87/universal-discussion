"""Gracefully drain ONLY the fixed original API for the private-AI hotfix.

Import is inert. The fixed identity expires on restart. Never force-terminate,
select another PID/role, or resend after an uncertain drain observation.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys

API_PID = 38860
API_CREATION = 134377258774279552
NODE = 'c:\\program files\\nodejs\\node.exe'
BACKEND_SHA = 'f51961281ca4cac306d13c8d9124cf41596f1d64d4e8c124cb472057a581da4e'
DATA = Path(__file__).resolve().parents[2] / 'data'


def require(value):
    if not value:
        raise RuntimeError('private-ai-api-drain-refused')


def backend():
    name = Path(__file__).with_name('windows-console-drain.py')
    require(not name.is_symlink() and name.stat().st_size == 7078)
    require(hashlib.sha256(name.read_bytes()).hexdigest() == BACKEND_SHA)
    spec = importlib.util.spec_from_file_location('held_console_backend', name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # Only the inert WindowsConsole ABI is reused. Never call the old entry,
    # old inspect_or_drain, or use its stale four-role target table.
    return module.WindowsConsole()


def inspect_api(mode, native, own_pid):
    require(mode in ('probe', 'drain') and own_pid != API_PID)
    handle, attached = None, False
    try:
        handle = native.open(API_PID)
        original = native.identity(handle)
        require(original == (API_CREATION, NODE, 259))
        native.detach()
        native.attach(API_PID)
        attached = True
        require(sorted(native.members()) == sorted([own_pid, API_PID]))
        require(native.identity(handle) == original)
        result = {'apiPid': API_PID, 'creationFiletime': str(API_CREATION),
                  'exclusiveConsole': True, 'signalSent': False, 'exited': False}
        if mode == 'drain':
            require(sorted(native.members()) == sorted([own_pid, API_PID]))
            require(native.identity(handle) == original)
            native.interrupt()
            result['signalSent'] = True
            result['exitCode'] = native.wait(handle)
            require(result['exitCode'] == 130)
            result['exited'] = True
        return result
    finally:
        if attached:
            native.detach()
        if handle is not None:
            native.close(handle)


def main(args):
    if args not in (['probe'], ['drain']):
        return 2
    marker = None
    try:
        if args == ['drain']:
            for parent in (DATA, *DATA.parents):
                info = parent.lstat()
                require(parent.is_dir() and not info.st_file_attributes & 0x400)
            marker = (DATA / 'private-ai17-api-drain-attempt-20261030.json').open('x', encoding='utf8')
            marker.write(json.dumps({'apiPid': API_PID, 'creationFiletime': str(API_CREATION),
                                     'status': 'attempted', 'noAutomaticRetry': True}) + '\n')
            marker.flush()
            os.fsync(marker.fileno())
        result = inspect_api(args[0], backend(), os.getpid())
        print(json.dumps(result, separators=(',', ':')))
        if marker:
            marker.write(json.dumps(result, separators=(',', ':')) + '\n')
            marker.flush()
            os.fsync(marker.fileno())
        return 0
    except Exception:
        print(json.dumps({'status': 'refused-or-unsettled', 'signalSent': False if args == ['probe'] else None,
                          'noAutomaticRetry': True}, separators=(',', ':')))
        return 1
    finally:
        if marker:
            marker.close()


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
