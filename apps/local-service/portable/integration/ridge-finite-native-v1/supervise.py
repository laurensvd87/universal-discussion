"""Inert by default. Supervise only this NEW synthetic owned native proof."""
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time

if not sys.argv[1:]:
    print('No action. Reviewed freeze and --run-isolated-server required.')
    raise SystemExit(0)
if sys.argv[1:] != ['--run-isolated-server'] or sys.platform != 'win32':
    raise SystemExit('Unsupported fixed native proof phase')
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
OUTPUT = HERE / 'output'
RUN_PARENT = REPO / 'apps/local-service/portable/data/hierarchy-shadow-native'
SOURCE_NAMES = [
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v2/supervise.py",
 "apps/local-service/portable/canonical-v4/experimental/ridge-validation-cost-screen-v1/README.md",
 "apps/local-service/portable/canonical-v4/experimental/ridge-validation-cost-screen-v1/run.js",
 "apps/local-service/portable/canonical-v4/experimental/ridge-validation-cost-screen-v1/test.js",
 "apps/local-service/portable/canonical-v4/index.js",
 "apps/local-service/portable/canonical-v4/migrations/001-canonical-v4.sql",
 "apps/local-service/portable/canonical-v4/migrations/002-runtime-core.sql",
 "apps/local-service/portable/canonical-v4/migrations/003-execute-only-command-boundary.sql",
 "apps/local-service/portable/canonical-v4/migrations/004-ingestion-foundation.sql",
 "apps/local-service/portable/canonical-v4/migrations/005-ingestion-apply-and-lifecycle.sql",
 "apps/local-service/portable/canonical-v4/migrations/006-lifecycle-command-boundary.sql",
 "apps/local-service/portable/canonical-v4/migrations/007-exact-ridge-scan-single-pass.sql",
 "apps/local-service/portable/canonical-v4/migrations/008-independent-new-ingestion-admission.sql",
 "apps/local-service/portable/canonical-v4/migrations/009-fail-fast-new-ingestion-locks.sql",
 "apps/local-service/portable/integration/hierarchy-shadow-isolated-postgres.js",
 "apps/local-service/portable/integration/ridge-finite-native-v1/README.md",
 "apps/local-service/portable/integration/ridge-finite-native-v1/run.js",
 "apps/local-service/portable/integration/ridge-finite-native-v1/supervise.py",
 "apps/local-service/portable/integration/ridge-finite-native-v1/test.js",
 "apps/local-service/portable/node_modules/pg-connection-string/index.js",
 "apps/local-service/portable/node_modules/pg-connection-string/package.json",
 "apps/local-service/portable/node_modules/pg-int8/index.js",
 "apps/local-service/portable/node_modules/pg-int8/package.json",
 "apps/local-service/portable/node_modules/pg-pool/index.js",
 "apps/local-service/portable/node_modules/pg-pool/package.json",
 "apps/local-service/portable/node_modules/pg-protocol/dist/buffer-reader.js",
 "apps/local-service/portable/node_modules/pg-protocol/dist/buffer-writer.js",
 "apps/local-service/portable/node_modules/pg-protocol/dist/index.js",
 "apps/local-service/portable/node_modules/pg-protocol/dist/messages.js",
 "apps/local-service/portable/node_modules/pg-protocol/dist/parser.js",
 "apps/local-service/portable/node_modules/pg-protocol/dist/serializer.js",
 "apps/local-service/portable/node_modules/pg-protocol/package.json",
 "apps/local-service/portable/node_modules/pg-types/index.js",
 "apps/local-service/portable/node_modules/pg-types/lib/arrayParser.js",
 "apps/local-service/portable/node_modules/pg-types/lib/binaryParsers.js",
 "apps/local-service/portable/node_modules/pg-types/lib/builtins.js",
 "apps/local-service/portable/node_modules/pg-types/lib/textParsers.js",
 "apps/local-service/portable/node_modules/pg-types/package.json",
 "apps/local-service/portable/node_modules/pg-types/test/index.js",
 "apps/local-service/portable/node_modules/pg-types/test/types.js",
 "apps/local-service/portable/node_modules/pg/esm/index.mjs",
 "apps/local-service/portable/node_modules/pg/lib/client.js",
 "apps/local-service/portable/node_modules/pg/lib/connection-parameters.js",
 "apps/local-service/portable/node_modules/pg/lib/connection.js",
 "apps/local-service/portable/node_modules/pg/lib/crypto/cert-signatures.js",
 "apps/local-service/portable/node_modules/pg/lib/crypto/sasl.js",
 "apps/local-service/portable/node_modules/pg/lib/crypto/utils.js",
 "apps/local-service/portable/node_modules/pg/lib/defaults.js",
 "apps/local-service/portable/node_modules/pg/lib/index.js",
 "apps/local-service/portable/node_modules/pg/lib/native/client.js",
 "apps/local-service/portable/node_modules/pg/lib/native/index.js",
 "apps/local-service/portable/node_modules/pg/lib/native/query.js",
 "apps/local-service/portable/node_modules/pg/lib/query.js",
 "apps/local-service/portable/node_modules/pg/lib/result.js",
 "apps/local-service/portable/node_modules/pg/lib/stream.js",
 "apps/local-service/portable/node_modules/pg/lib/type-overrides.js",
 "apps/local-service/portable/node_modules/pg/lib/utils.js",
 "apps/local-service/portable/node_modules/pg/package.json",
 "apps/local-service/portable/node_modules/pgpass/lib/helper.js",
 "apps/local-service/portable/node_modules/pgpass/lib/index.js",
 "apps/local-service/portable/node_modules/pgpass/package.json",
 "apps/local-service/portable/node_modules/postgres-array/index.js",
 "apps/local-service/portable/node_modules/postgres-array/package.json",
 "apps/local-service/portable/node_modules/postgres-bytea/index.js",
 "apps/local-service/portable/node_modules/postgres-bytea/package.json",
 "apps/local-service/portable/node_modules/postgres-date/index.js",
 "apps/local-service/portable/node_modules/postgres-date/package.json",
 "apps/local-service/portable/node_modules/postgres-interval/index.js",
 "apps/local-service/portable/node_modules/postgres-interval/package.json",
 "apps/local-service/portable/node_modules/split2/bench.js",
 "apps/local-service/portable/node_modules/split2/index.js",
 "apps/local-service/portable/node_modules/split2/package.json",
 "apps/local-service/portable/node_modules/split2/test.js",
 "apps/local-service/portable/node_modules/xtend/immutable.js",
 "apps/local-service/portable/node_modules/xtend/mutable.js",
 "apps/local-service/portable/node_modules/xtend/package.json",
 "apps/local-service/portable/node_modules/xtend/test.js",
 "apps/local-service/portable/package-lock.json",
 "apps/local-service/portable/package.json",
 "apps/local-service/portable/src/database.js",
 "apps/local-service/portable/test/hierarchy-shadow-native-default.test.js",
 "apps/local-service/src/accounts/account-principal.js",
 "apps/local-service/src/adapters/normalized-sqlite-repository.js",
 "apps/local-service/src/application/account-public-chats.js",
 "apps/local-service/src/domain/adaptive-topic-integration.js",
 "apps/local-service/src/domain/adaptive-topics.js",
 "apps/local-service/src/domain/alternate-topic-cache.js",
 "apps/local-service/src/domain/alternate-topic-planner-indexed.js",
 "apps/local-service/src/domain/alternate-topic-planner.js",
 "apps/local-service/src/domain/body-topic-metric.js",
 "apps/local-service/src/domain/bounded-evidence-graph.js",
 "apps/local-service/src/domain/demo-state.js",
 "apps/local-service/src/domain/diagonal-adapter.js",
 "apps/local-service/src/domain/discussion-view.js",
 "apps/local-service/src/domain/errors.js",
 "apps/local-service/src/domain/fixed-reference-topic-integration.js",
 "apps/local-service/src/domain/guarded-body-topic-planner.js",
 "apps/local-service/src/domain/learned-sources.js",
 "apps/local-service/src/domain/owner-topic-planner.js",
 "apps/local-service/src/domain/persisted-state.js",
 "apps/local-service/src/domain/reference-state-migration.js",
 "apps/local-service/src/domain/reference-topic-membership.js",
 "apps/local-service/src/domain/repository-contract.js",
 "apps/local-service/src/domain/ridge-topic-adapter.js",
 "apps/local-service/src/domain/ridge-topic-planner.js",
 "apps/local-service/src/domain/source-threads.js",
 "apps/local-service/src/domain/state-migration.js",
 "apps/local-service/src/domain/topic-radius-index.js",
 "apps/local-service/src/domain/validation.js",
 "decisions/ADR-146-exact-ridge-validation-performance.md",
 "spikes/topic-resolution/browser/core/page-content-policy.js",
 "spikes/topic-resolution/browser/embedding/embedding-contract.js"
]
BINARY_PINS = {
 "D:/PostgreSQL/17/bin/postgres.exe": "f5dbfd059f8088b9511a02fc014e659369996fc7d3e88e47658b1cfa2fbb02d2",
 "D:/PostgreSQL/17/bin/initdb.exe": "d385519a50d2cd5e143e86c2c10acfe0d44d3039d714c8211b804011bca2409f",
 "D:/PostgreSQL/17/bin/pg_ctl.exe": "9885ac53af9d67c76c1ddde87c19e6b15539d7c482bca70cd5ead5dad0b7ce3c",
 "D:/PostgreSQL/17/lib/vector.dll": "459a1abcabd69c8092c3a7de998a18e2714b6676a7ba4f3bdd111fc610a440a0",
 "D:/PostgreSQL/17/share/extension/vector.control": "52c583fb0c22c616b21762c7b9d3079c02655b78b96d5689cd1e64449b9a575e",
 "D:/PostgreSQL/17/share/extension/vector--0.8.2.sql": "1e4d2de57f0a16c5c2b259d77655aecf9c740713beae4ac4b511549fceb6aafb"
}
SETTINGS = {
 "schema": "ridge-finite-native-proof/v1",
 "sizes": [
  64,
  256,
  1024
 ],
 "families": [
  "sparse",
  "dense"
 ],
 "dimensions": 384,
 "repeats": 3,
 "storedSources": 1024,
 "maximumChunkRows": 32,
 "maximumChunkBytes": 2097152,
 "heapMiB": 256,
 "treeMemoryMiB": 768,
 "aggregateCpuSeconds": 60,
 "wallSeconds": 180,
 "cleanupReserveSeconds": 30,
 "ownedBytes": 536870912,
 "ownedEntries": 8192,
 "maximumReportBytes": 65536
}
MIB = 1048576
MEMORY_LIMIT, CPU_SECONDS, WALL_SECONDS, ACTIVE_SECONDS = 768 * MIB, 60, 180, 150
started = time.monotonic()
parent_cpu_started = time.process_time()

class MemoryStatus(ctypes.Structure):
    _fields_ = [('length', wintypes.DWORD), ('load', wintypes.DWORD)] + [(key, ctypes.c_ulonglong) for key in
        ('totalPhysical', 'availablePhysical', 'totalPageFile', 'availablePageFile', 'totalVirtual', 'availableVirtual', 'availableExtended')]

class ProcessMemory(ctypes.Structure):
    _fields_ = [('cb', wintypes.DWORD), ('faults', wintypes.DWORD)] + [(key, ctypes.c_size_t) for key in
        ('peakWorkingSet', 'workingSet', 'peakPagedPool', 'pagedPool', 'peakNonPagedPool', 'nonPagedPool', 'pagefile', 'peakPagefile', 'privateUsage')]

class BasicLimits(ctypes.Structure):
    _fields_ = [('perProcessUserTime', ctypes.c_longlong), ('perJobUserTime', ctypes.c_longlong), ('limitFlags', wintypes.DWORD),
        ('minimumWorkingSet', ctypes.c_size_t), ('maximumWorkingSet', ctypes.c_size_t), ('activeProcessLimit', wintypes.DWORD),
        ('affinity', ctypes.c_size_t), ('priorityClass', wintypes.DWORD), ('schedulingClass', wintypes.DWORD)]

class IoCounters(ctypes.Structure):
    _fields_ = [(key, ctypes.c_ulonglong) for key in ('readOperations', 'writeOperations', 'otherOperations', 'readBytes', 'writeBytes', 'otherBytes')]

class ExtendedLimits(ctypes.Structure):
    _fields_ = [('basic', BasicLimits), ('io', IoCounters), ('processMemoryLimit', ctypes.c_size_t), ('jobMemoryLimit', ctypes.c_size_t),
        ('peakProcessMemoryUsed', ctypes.c_size_t), ('peakJobMemoryUsed', ctypes.c_size_t)]

class JobPids(ctypes.Structure):
    _fields_ = [('assigned', wintypes.DWORD), ('listed', wintypes.DWORD), ('pids', ctypes.c_size_t * 128)]

class BasicAccounting(ctypes.Structure):
    # JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION: exited processes remain included.
    _fields_ = [(key, ctypes.c_longlong) for key in ('totalUserTime', 'totalKernelTime', 'periodUserTime', 'periodKernelTime')] + [
        (key, wintypes.DWORD) for key in ('totalPageFaultCount', 'totalProcesses', 'activeProcesses', 'totalTerminatedProcesses')]

kernel = ctypes.WinDLL('kernel32', use_last_error=True)
psapi = ctypes.WinDLL('psapi', use_last_error=True)
kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
kernel.CreateJobObjectW.restype = wintypes.HANDLE
kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
kernel.QueryInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p]
kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
kernel.IsProcessInJob.argtypes = [wintypes.HANDLE, wintypes.HANDLE, ctypes.POINTER(wintypes.BOOL)]
kernel.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel.OpenProcess.restype = wintypes.HANDLE
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
kernel.GlobalMemoryStatusEx.argtypes = [ctypes.POINTER(MemoryStatus)]
psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessMemory), wintypes.DWORD]

def checked(path):
    for p in [path] + list(path.parents):
        s = p.lstat()
        if p.is_symlink() or getattr(s, 'st_file_attributes', 0) & 0x400:
            raise RuntimeError('reparse-path-refused')
    if str(path.resolve()).lower() != str(path.absolute()).lower():
        raise RuntimeError('resolved-path-refused')

def fixed_bytes(path, maximum=4 * MIB):
    checked(path)
    s = path.lstat()
    if not stat.S_ISREG(s.st_mode) or not 0 < s.st_size <= maximum:
        raise RuntimeError('fixed-file-bound-refused')
    b = path.read_bytes()
    after = path.lstat()
    if len(b) != s.st_size or (after.st_size, after.st_mtime_ns, after.st_ctime_ns) != (s.st_size, s.st_mtime_ns, s.st_ctime_ns):
        raise RuntimeError('fixed-file-drift')
    return b

def sha(b):
    return hashlib.sha256(b).hexdigest()

def headroom():
    memory = MemoryStatus()
    memory.length = ctypes.sizeof(memory)
    if not kernel.GlobalMemoryStatusEx(ctypes.byref(memory)) or min(memory.availablePhysical, memory.availablePageFile) < 1024 * MIB:
        raise RuntimeError('host-physical-or-commit-reserve')
    if shutil.disk_usage('C:\\').free < 768 * MIB or shutil.disk_usage('D:\\').free < 512 * MIB:
        raise RuntimeError('drive-reserve')

def members(job):
    p = JobPids()
    if not kernel.QueryInformationJobObject(job, 3, ctypes.byref(p), ctypes.sizeof(p), None) or p.assigned != p.listed or p.listed > 128:
        raise RuntimeError('own-job-members-unverifiable')
    return p

def cpu_seconds(user_ticks, kernel_ticks):
    if not isinstance(user_ticks, int) or not isinstance(kernel_ticks, int) or min(user_ticks, kernel_ticks) < 0:
        raise RuntimeError('own-job-cpu-invalid')
    return (user_ticks + kernel_ticks) / 10_000_000

def accounting(job):
    a = BasicAccounting()
    if not kernel.QueryInformationJobObject(job, 1, ctypes.byref(a), ctypes.sizeof(a), None):
        raise RuntimeError('own-job-cpu-unverifiable')
    if a.totalUserTime < 0 or a.totalKernelTime < 0:
        raise RuntimeError('own-job-cpu-invalid')
    return cpu_seconds(a.totalUserTime, a.totalKernelTime), a.totalProcesses, a.totalTerminatedProcesses

def tree_memory(job):
    p = members(job)
    rss = private = 0
    for pid in p.pids[:p.listed]:
        handle = kernel.OpenProcess(0x1000 | 0x0010, False, pid)
        if not handle:
            raise RuntimeError('own-job-member-exit-race-unverifiable')
        try:
            belongs = wintypes.BOOL()
            if not kernel.IsProcessInJob(handle, job, ctypes.byref(belongs)) or not belongs.value:
                raise RuntimeError('own-job-membership-unverified')
            m = ProcessMemory()
            m.cb = ctypes.sizeof(m)
            if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(m), ctypes.sizeof(m)):
                raise RuntimeError('own-job-memory-unverifiable')
            rss += m.workingSet
            private += m.privateUsage
        finally:
            kernel.CloseHandle(handle)
    return rss, private, p.listed

def new_run_directory(baseline):
    if not RUN_PARENT.exists():
        return None
    checked(RUN_PARENT)
    additions = [p for p in RUN_PARENT.iterdir() if p.name not in baseline]
    if len(additions) > 1 or any(not re.fullmatch(r'adr132-[A-Za-z0-9]+', p.name) for p in additions):
        raise RuntimeError('unexpected-new-native-directory')
    if not additions:
        return None
    checked(additions[0])
    if not additions[0].is_dir():
        raise RuntimeError('new-native-directory-type')
    marker = additions[0] / 'ownership.json'
    if marker.exists():
        value = json.loads(fixed_bytes(marker, 4096))
        if value.get('schema') != 'adr132-isolated-postgres/v1' or value.get('runDirectory', '').lower() != str(additions[0]).lower() or not re.fullmatch(r'[a-f0-9]{48}', value.get('nonce', '')):
            raise RuntimeError('new-native-marker-invalid')
    return additions[0]

def disk_usage(roots):
    total = count = 0
    pending = [p for p in roots if p is not None]
    while pending:
        root = pending.pop()
        checked(root)
        for entry in root.iterdir():
            try:
                s = entry.lstat()
            except FileNotFoundError:
                continue  # ephemeral OWN utility files; next sample sees replacements
            if entry.is_symlink() or getattr(s, 'st_file_attributes', 0) & 0x400:
                raise RuntimeError('owned-tree-reparse-refused')
            count += 1
            if count > 8192:
                raise RuntimeError('owned-entry-capacity')
            if stat.S_ISDIR(s.st_mode):
                pending.append(entry)
            elif stat.S_ISREG(s.st_mode):
                total += s.st_size
                if total > 512 * MIB:
                    raise RuntimeError('owned-disk-capacity')
            else:
                raise RuntimeError('owned-file-type')
    for name in ('stdout.log', 'stderr.log', 'result.json'):
        p = OUTPUT / name
        if p.exists() and p.stat().st_size > 65536:
            raise RuntimeError('owned-evidence-file-capacity')
    return total, count

if HERE.drive.upper() != 'D:' or OUTPUT.exists():
    raise SystemExit('D workspace or exclusive output precondition refused')
checked(HERE)
headroom()
node = shutil.which('node')
if not node:
    raise SystemExit('Node missing')
sources = {name: sha(fixed_bytes(REPO / name)) for name in SOURCE_NAMES}
binary_hashes = {name: sha(fixed_bytes(Path(name), 16 * MIB)) for name in BINARY_PINS}
if binary_hashes != BINARY_PINS:
    raise SystemExit('Installed native binary pin mismatch')
freeze_bytes = fixed_bytes(HERE / 'freeze.json', 65536)
freeze_sha = sha(freeze_bytes)
f = json.loads(freeze_bytes)
body = {key: value for key, value in f.items() if key != 'freezeHash'}
if list(f) != ['schema', 'sourceHashes', 'binaryHashes', 'settings', 'freezeHash'] or f.get('schema') != 'ridge-finite-native-source-freeze/v1' or f.get('sourceHashes') != sources or f.get('binaryHashes') != BINARY_PINS or f.get('settings') != SETTINGS or sha(json.dumps(body, separators=(',', ':'), ensure_ascii=False).encode()) != f.get('freezeHash'):
    raise SystemExit('Reviewed source freeze unavailable or changed')
if RUN_PARENT.exists():
    checked(RUN_PARENT)
baseline = set(p.name for p in RUN_PARENT.iterdir()) if RUN_PARENT.exists() else set()
OUTPUT.mkdir()
temp = OUTPUT / 'temp'
temp.mkdir()
with (OUTPUT / 'started.json').open('x', encoding='utf8') as stream:
    json.dump({'schema': 'ridge-finite-native-supervisor-started/v1', 'freezeSha256': freeze_sha, 'sourceHashes': sources, 'noReplay': True}, stream)
job = handle = child = None
reason = cleanup_reason = None
peak_rss = peak_private = peak_cpu = peak_bytes = peak_entries = peak_processes = 0
emergency = False
assigned = False
pre_assignment_node_killed = False
drained = rechecked = False
run_directory = None
result_sha = None
final_job_cpu = 0
with (OUTPUT / 'stdout.log').open('xb') as out, (OUTPUT / 'stderr.log').open('xb') as err:
    try:
        job = kernel.CreateJobObjectW(None, None)
        if not job:
            raise RuntimeError('own-job-create-failed')
        limits = ExtendedLimits()
        limits.basic.limitFlags = 0x2000 | 0x200  # kill-on-own-close + job commit cap; no breakaway
        limits.jobMemoryLimit = MEMORY_LIMIT
        if not kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            raise RuntimeError('own-job-limit-failed')
        env = {k: v for k, v in os.environ.items() if k.upper() in {'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'COMSPEC'}}
        env.update({'TEMP': str(temp), 'TMP': str(temp), 'MURMINGLE_RIDGE_NATIVE_SUPERVISED': 'v1', 'MURMINGLE_RIDGE_NATIVE_FREEZE_SHA256': freeze_sha, 'UV_THREADPOOL_SIZE': '1', 'OMP_NUM_THREADS': '1'})
        child = subprocess.Popen([node, '--max-old-space-size=256', str(HERE / 'run.js'), '--run-isolated-server'],
            cwd=HERE, env=env, creationflags=subprocess.CREATE_NO_WINDOW, stdin=subprocess.PIPE, stdout=out, stderr=err)
        handle = kernel.OpenProcess(0x1000 | 0x0100 | 0x0001, False, child.pid)
        if not handle or not kernel.AssignProcessToJobObject(job, handle):
            raise RuntimeError('own-node-job-assignment-failed')
        assigned = True
        child.stdin.write(b'RIDGE_NATIVE_OWN_JOB_ASSIGNED_V1\n')
        child.stdin.flush()
        child.stdin.close()
        while child.poll() is None:
            headroom()
            run_directory = new_run_directory(baseline)
            used_bytes, entries = disk_usage([OUTPUT, run_directory])
            rss, private, processes = tree_memory(job)
            job_cpu, _, _ = accounting(job)
            total_cpu = job_cpu + time.process_time() - parent_cpu_started
            peak_rss, peak_private, peak_processes = max(peak_rss, rss), max(peak_private, private), max(peak_processes, processes)
            peak_cpu, peak_bytes, peak_entries = max(peak_cpu, total_cpu), max(peak_bytes, used_bytes), max(peak_entries, entries)
            if rss > MEMORY_LIMIT or private > MEMORY_LIMIT or total_cpu >= CPU_SECONDS or time.monotonic() - started >= ACTIVE_SECONDS:
                raise RuntimeError('owned-resource-or-active-budget')
            time.sleep(.05)
        child.wait()
        if (OUTPUT / 'result.json').exists():
            result_sha = sha(fixed_bytes(OUTPUT / 'result.json', 65536))
        if child.returncode != 0:
            raise RuntimeError('owned-native-child-failed')
        if members(job).listed != 0:
            raise RuntimeError('own-native-descendants-not-drained')
        drained = True
        result_bytes = fixed_bytes(OUTPUT / 'result.json', 65536)
        result = json.loads(result_bytes)
        result_sha = sha(result_bytes)
        lifecycle = result.get('lifecycle', {})
        if result.get('schema') != 'ridge-finite-native-proof/v1' or result.get('status') != 'passed' or result.get('freezeFileSha256') != freeze_sha or result.get('sourceHashes') != sources or result.get('binaryHashes') != BINARY_PINS or lifecycle.get('cleanup', {}).get('stopped') is not True or lifecycle.get('cleanup', {}).get('reason') != 'verified-own-server-smart-stopped' or lifecycle.get('server', {}).get('ownershipVerified') is not True:
            raise RuntimeError('native-result-or-graceful-proof-failed')
        run_directory = new_run_directory(baseline)
        if run_directory is None or lifecycle.get('runDirectory', '').lower() != str(run_directory).lower():
            raise RuntimeError('native-owned-directory-result-mismatch')
        used_bytes, entries = disk_usage([OUTPUT, run_directory])
        job_cpu, _, _ = accounting(job)
        peak_cpu = max(peak_cpu, job_cpu + time.process_time() - parent_cpu_started)
        peak_bytes, peak_entries = max(peak_bytes, used_bytes), max(peak_entries, entries)
    except Exception as error:
        reason = str(error) if isinstance(error, RuntimeError) else 'native-supervisor-failed'
    finally:
        if reason is not None:
            # Authorized emergency action only against the handle of OUR Job.
            # This is always FAILURE, never a successful smart-stop claim.
            if job and assigned:
                try:
                    active = members(job).listed > 0
                except RuntimeError:
                    active = True  # own handle is known; membership proof failure is cleanup failure
                if active:
                    emergency = True
                    if not kernel.TerminateJobObject(job, 1):
                        cleanup_reason = 'own-job-emergency-termination-failed'
            if child is not None and child.poll() is None:
                if not assigned:
                    # Before assignment, this exact captured Node is still in
                    # handshake and cannot have imported/invoked the helper.
                    child.kill()
                    pre_assignment_node_killed = True
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    cleanup_reason = 'own-node-exit-unconfirmed'
        if job:
            deadline = min(started + WALL_SECONDS, time.monotonic() + 5)
            while time.monotonic() < deadline:
                try:
                    if members(job).listed == 0:
                        drained = child is None or child.poll() is not None
                        break
                except RuntimeError:
                    break
                time.sleep(.05)
            if not drained:
                cleanup_reason = cleanup_reason or 'own-job-final-drain-unconfirmed'
            try:
                job_cpu, total_processes, terminated_processes = accounting(job)
                final_job_cpu = job_cpu
                peak_cpu = max(peak_cpu, job_cpu + time.process_time() - parent_cpu_started)
            except RuntimeError:
                total_processes = terminated_processes = None
                cleanup_reason = cleanup_reason or 'own-job-final-cpu-unverifiable'
        else:
            total_processes = terminated_processes = None
        if handle:
            kernel.CloseHandle(handle)
        if job:
            kernel.CloseHandle(job)
    try:
        if sha(fixed_bytes(HERE / 'freeze.json', 65536)) != freeze_sha or any(sha(fixed_bytes(REPO / name)) != value for name, value in sources.items()) or any(sha(fixed_bytes(Path(name), 16 * MIB)) != value for name, value in BINARY_PINS.items()):
            raise RuntimeError('source-or-binary-final-drift')
        rechecked = True
    except Exception:
        reason = reason or 'final-bytechain-unverifiable'
    peak_cpu = max(peak_cpu, final_job_cpu + time.process_time() - parent_cpu_started)
    if peak_cpu >= CPU_SECONDS or time.monotonic() - started > WALL_SECONDS:
        reason = reason or 'final-total-budget-exceeded'
    reason = reason or cleanup_reason
    receipt = {'schema': 'ridge-finite-native-supervisor/v1', 'status': 'passed' if reason is None and drained and not emergency else 'failed',
        'reason': reason, 'freezeSha256': freeze_sha, 'sourceHashes': sources, 'binaryHashes': BINARY_PINS, 'resultSha256': result_sha,
        'sampledPeakTreeRssBytes': peak_rss, 'sampledPeakTreePrivateBytes': peak_private, 'sampledPeakTreeProcesses': peak_processes,
        'aggregateCpuSeconds': peak_cpu, 'jobCpuIncludesExitedProcesses': True, 'totalJobProcesses': total_processes, 'terminatedJobProcesses': terminated_processes,
        'sampledPeakOwnedBytes': peak_bytes, 'sampledPeakOwnedEntries': peak_entries, 'elapsedSeconds': time.monotonic() - started,
        'emergencyOwnJobTermination': emergency, 'ownTreeDrainConfirmed': drained, 'cleanupReason': cleanup_reason, 'sourceHashesRechecked': rechecked,
        'preAssignmentHandshakeBlockedNodeKilled': pre_assignment_node_killed,
        'runDirectory': str(run_directory) if run_directory else None, 'retainedTempDirectory': str(temp), 'activation': False, 'productionValidated': False}
    with (OUTPUT / 'supervisor.json').open('x', encoding='utf8') as stream:
        json.dump(receipt, stream)
    print(json.dumps(receipt), flush=True)
    raise SystemExit(0 if receipt['status'] == 'passed' else 1)
