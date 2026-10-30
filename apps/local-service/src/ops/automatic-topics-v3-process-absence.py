"""Read-only current Murmingle writer census. Import is inert; no signal API.

This is repeated observation, not an atomic hostile-writer exclusion mechanism.
The owner must keep writers stopped until the backup pair has been published.
Command lines stay in this process; the CLI emits only two booleans.
"""
import ctypes
from ctypes import wintypes
import json
import ntpath
import os
from pathlib import Path
import subprocess
import sys

REPO = Path(__file__).resolve().parents[4]
CAPTURE = REPO / 'apps/local-service/src/ops/automatic-topics-v3-quiesced-backup.js'
NODE = 'c:/program files/nodejs/node.exe'
POWERSHELL = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
WRITERS = (
    'postgres-runtime-operator.js', 'postgres-runtime-operator.mjs',
    'automatic-topics-runtime-operator.js', 'automatic-topics-quiesced-backup.js',
    'automatic-topics-v3-runtime-operator.js', 'automatic-topics-v3-quiesced-backup.js',
    'quiesced-state-backup.js', 'local-postgres-watch.mjs', 'crawl-cli.js',
    'postgres-ingest-worker.mjs', 'postgres-worker.mjs',
)
SCRIPT = r"""
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$parent=Get-CimInstance Win32_Process -Filter 'ProcessId=__PARENT_PID__'
if(-not $parent){throw 'parent-unavailable'}
$nodes=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'")
if($nodes.Count -gt 256){throw 'census-capacity'}
$rows=@($nodes|ForEach-Object {@{id=[long]$_.ProcessId;image=$_.ExecutablePath;command=$_.CommandLine}})
$raw=ConvertTo-Json -Compress -Depth 4 -InputObject @{parentId=[long]$parent.ProcessId;parentName=$parent.Name;nodes=$rows}
if([Text.Encoding]::UTF8.GetByteCount($raw) -gt 65536){throw 'census-capacity'}
[Console]::WriteLine($raw)
"""


def require(value):
    if not value:
        raise RuntimeError('process-census-unavailable')


def normalized(value):
    return ntpath.normpath(value).replace('\\', '/').casefold()


def windows_arguments(value):
    require(sys.platform == 'win32' and type(value) is str and 0 < len(value) <= 32768)
    shell = ctypes.WinDLL('shell32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    shell.CommandLineToArgvW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(ctypes.c_int)]
    shell.CommandLineToArgvW.restype = ctypes.POINTER(wintypes.LPWSTR)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    count = ctypes.c_int()
    pointer = shell.CommandLineToArgvW(value, ctypes.byref(count))
    require(bool(pointer))
    try:
        require(0 < count.value <= 256)
        return [pointer[index] for index in range(count.value)]
    finally:
        require(kernel.LocalFree(pointer) is None)


def writers_absent(census, parent_id, parse_arguments, cwd):
    require(type(census) is dict and set(census) == {'parentId', 'parentName', 'nodes'})
    require(type(parent_id) is int and 0 < parent_id <= 4294967295
            and type(census['parentId']) is int and census['parentId'] == parent_id)
    require(type(census['parentName']) is str and 0 < len(census['parentName']) <= 260)
    rows = census['nodes']
    require(type(rows) is list and len(rows) <= 256)
    seen = set()
    absent = True
    for row in rows:
        require(type(row) is dict and set(row) == {'id', 'image', 'command'})
        pid = row['id']
        require(type(pid) is int and 0 < pid <= 4294967295 and pid not in seen)
        seen.add(pid)
        image, command = row['image'], row['command']
        if (type(image) is not str or not image or len(image) > 32768
                or ntpath.basename(image).casefold() != 'node.exe'
                or type(command) is not str or not command or len(command) > 32768):
            absent = False  # Access denial/opaque process is never absence.
            continue
        args = parse_arguments(command)
        require(type(args) is list and 0 < len(args) <= 256
                and all(type(arg) is str and len(arg) <= 32768 for arg in args))
        require(normalized(args[0]) == normalized(image) or args[0].casefold() in ('node', 'node.exe'))
        if (pid == parent_id and normalized(image) == NODE and len(args) == 3
                and args[2] == '--capture'
                and normalized(str((Path(cwd) / args[1]).resolve())) == normalized(str(CAPTURE))):
            continue  # Only the actual, exact capture parent; no second instance.
        if pid == parent_id:
            absent = False  # An indirect/eval wrapper is not the capture entry.
            continue
        lower = command.casefold().replace('\\', '/')
        if any(leaf in lower for leaf in WRITERS):
            absent = False
            continue
        # Unrelated editor/language-server arguments may contain the workspace.
        # A script entry inside this repository is conservatively a writer.
        for arg in args[1:]:
            if arg.casefold().endswith(('.js', '.mjs', '.cjs')):
                candidate = normalized(str((Path(cwd) / arg).resolve()))
                if candidate.startswith(normalized(str(REPO)) + '/'):
                    absent = False
    require((census['parentName'].casefold() == 'node.exe') == (parent_id in seen))
    return absent


def observe():
    require(sys.platform == 'win32')
    parent_id = os.getppid()
    require(type(parent_id) is int and 0 < parent_id <= 4294967295)
    script = SCRIPT.replace('__PARENT_PID__', str(parent_id))
    result = subprocess.run([POWERSHELL, '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
                            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=15, creationflags=0x08000000, check=False)
    require(result.returncode == 0 and len(result.stdout) <= 65536 and not result.stderr)
    census = json.loads(result.stdout.decode('utf-8-sig'))
    return writers_absent(census, parent_id, windows_arguments, Path.cwd())


def main(args=None):
    if args is None:
        args = sys.argv[1:]
    absent = False
    try:
        require(type(args) is list and not args)
        absent = observe()
    except Exception:
        pass  # Never expose command lines, credentials or exception payloads.
    print(json.dumps({'writersAbsent': absent, 'signalSent': False}, separators=(',', ':')))
    return 0 if absent else 1


if __name__ == '__main__':
    raise SystemExit(main())
