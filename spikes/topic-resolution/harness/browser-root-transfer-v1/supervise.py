"""Default inert. Fixed public DEV diagnostic, own Node/Chrome Job tree only."""
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
import stat
from pathlib import Path
import shutil
import subprocess
import sys
import time

if len(sys.argv) == 1:
    print('No action. Explicit --browser-batch N; review, freeze and separate approval first.')
    raise SystemExit(0)
if sys.platform != 'win32' or len(sys.argv) != 3 or sys.argv[1] != '--browser-batch' or sys.argv[2] not in tuple(str(i) for i in range(1, 9)):
    raise SystemExit('Only the fixed Windows public input probe is supported')

PHASE = 'browser-only'
BATCH = int(sys.argv[2])
WALL_LIMIT = 180
ACTIVE_LIMIT = 170
started = time.monotonic()
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
if HERE.drive.upper() != 'D:':
    raise SystemExit('Diagnostic must remain on D drive')
TARGET = HERE / 'run.mjs'
READER = REPO / 'spikes/topic-resolution/browser/chromium/page-content-reader.js'
READER_SHA = 'c7946a7e19adb3fd9c14b2304101dbd3bf8b7c92fd1ab7c3ba679104b55e428f'
OUTPUT = HERE / ('output-batch-' + str(BATCH).zfill(2))
if not TARGET.is_file() or TARGET.is_symlink() or OUTPUT.exists() or OUTPUT.is_symlink():
    raise SystemExit('Missing fixed runner or existing output prohibits replay')
if HERE.resolve() != HERE:
    raise SystemExit('Reparse diagnostic path refused')
MIB = 1048576
MEMORY_LIMIT = 1536 * MIB
MAX_BYTES = 256 * 1024
PROFILE_MAX_BYTES = 512 * MIB
PROFILE_MAX_ENTRIES = 8192

class MemoryStatus(ctypes.Structure):
    _fields_ = [('length', wintypes.DWORD), ('load', wintypes.DWORD)] + [
        (key, ctypes.c_ulonglong) for key in ('totalPhysical', 'availablePhysical', 'totalPageFile',
        'availablePageFile', 'totalVirtual', 'availableVirtual', 'availableExtended')]

class ProcessMemory(ctypes.Structure):
    _fields_ = [('cb', wintypes.DWORD), ('faults', wintypes.DWORD)] + [
        (key, ctypes.c_size_t) for key in ('peakWorkingSet', 'workingSet', 'peakPagedPool', 'pagedPool',
        'peakNonPagedPool', 'nonPagedPool', 'pagefile', 'peakPagefile', 'privateUsage')]

class BasicLimits(ctypes.Structure):
    _fields_ = [('perProcessUserTime', ctypes.c_longlong), ('perJobUserTime', ctypes.c_longlong),
        ('limitFlags', wintypes.DWORD), ('minimumWorkingSet', ctypes.c_size_t), ('maximumWorkingSet', ctypes.c_size_t),
        ('activeProcessLimit', wintypes.DWORD), ('affinity', ctypes.c_size_t),
        ('priorityClass', wintypes.DWORD), ('schedulingClass', wintypes.DWORD)]

class IoCounters(ctypes.Structure):
    _fields_ = [(key, ctypes.c_ulonglong) for key in ('readOperations', 'writeOperations', 'otherOperations',
        'readBytes', 'writeBytes', 'otherBytes')]

class ExtendedLimits(ctypes.Structure):
    _fields_ = [('basic', BasicLimits), ('io', IoCounters), ('processMemoryLimit', ctypes.c_size_t),
        ('jobMemoryLimit', ctypes.c_size_t), ('peakProcessMemoryUsed', ctypes.c_size_t), ('peakJobMemoryUsed', ctypes.c_size_t)]

class JobPids(ctypes.Structure):
    _fields_ = [('assigned', wintypes.DWORD), ('listed', wintypes.DWORD), ('pids', ctypes.c_size_t * 128)]

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

def headroom():
    status = MemoryStatus()
    status.length = ctypes.sizeof(status)
    if not kernel.GlobalMemoryStatusEx(ctypes.byref(status)):
        raise RuntimeError('host-memory-unverifiable')
    if min(status.availablePhysical, status.availablePageFile) < 1024 * MIB:
        raise RuntimeError('host-memory-reserve-unavailable')
    if shutil.disk_usage('C:\\').free < 768 * MIB or shutil.disk_usage('D:\\').free < 512 * MIB:
        raise RuntimeError('drive-reserve-unavailable')

def job_members(job):
    members = JobPids()
    if not kernel.QueryInformationJobObject(job, 3, ctypes.byref(members), ctypes.sizeof(members), None):
        raise RuntimeError('job-pid-list-unverifiable-or-overflow')
    if members.assigned > 128 or members.listed > 128 or members.listed != members.assigned:
        raise RuntimeError('job-pid-capacity')
    return members

def owned_tree_metadata(root, scan=os.scandir, inspect=os.lstat):
    # Fixed freshly-created OUTPUT only in the actual caller. Metadata only;
    # never read profile/cookie contents or follow an observed reparse point.
    root_path = str(root)
    pending = [root_path]
    entries = total = 0
    while pending:
        directory = pending.pop()
        try:
            info = inspect(directory)
        except FileNotFoundError:
            if directory == root_path:
                raise
            continue  # Package removed an already-discovered owned directory.
        if info.st_file_attributes & 0x400 or not stat.S_ISDIR(info.st_mode):
            raise RuntimeError('owned-output-reparse-or-type')
        try:
            with scan(directory) as children:
                for entry in children:
                    entries += 1
                    if entries > PROFILE_MAX_ENTRIES:
                        raise RuntimeError('owned-profile-entry-capacity')
                    try:
                        metadata = entry.stat(follow_symlinks=False)
                    except FileNotFoundError:
                        continue  # Count the observed entry, but do not follow it.
                    if metadata.st_file_attributes & 0x400:
                        raise RuntimeError('owned-output-reparse-or-type')
                    if stat.S_ISDIR(metadata.st_mode):
                        pending.append(entry.path)
                    elif stat.S_ISREG(metadata.st_mode):
                        total += metadata.st_size
                        if total > PROFILE_MAX_BYTES:
                            raise RuntimeError('owned-profile-byte-capacity')
                    else:
                        raise RuntimeError('owned-output-reparse-or-type')
        except FileNotFoundError:
            if directory == root_path:
                raise
            continue
    return total, entries

def normal_job_drain(job, members=job_members, clock=time.monotonic, pause=time.sleep):
    until = clock() + 2
    while True:
        live = members(job)
        if live.assigned == 0 and live.listed == 0:
            return True
        if clock() >= until:
            return False
        pause(.05)

def tree_memory(job):
    members = job_members(job)
    rss = private = 0
    for pid in members.pids[:members.listed]:
        handle = kernel.OpenProcess(0x1000 | 0x0010, False, pid)
        if not handle:
            # Exit races are not silently treated as zero memory: fail closed.
            raise RuntimeError('job-member-memory-unverifiable')
        try:
            belongs = wintypes.BOOL()
            if not kernel.IsProcessInJob(handle, job, ctypes.byref(belongs)) or not belongs.value:
                raise RuntimeError('opened-process-not-confirmed-in-own-job')
            memory = ProcessMemory()
            memory.cb = ctypes.sizeof(memory)
            if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), ctypes.sizeof(memory)):
                raise RuntimeError('job-member-memory-unverifiable')
            rss += memory.workingSet
            private += memory.privateUsage
        finally:
            kernel.CloseHandle(handle)
    return rss, private, members.listed

def non_temp_evidence_bytes():
    total = 0
    with os.scandir(OUTPUT) as entries:
        for entry in entries:
            metadata = entry.stat(follow_symlinks=False)
            if metadata.st_file_attributes & 0x400:
                raise RuntimeError('non-temp-evidence-reparse')
            if entry.name == 'temp' and stat.S_ISDIR(metadata.st_mode):
                continue
            if not stat.S_ISREG(metadata.st_mode):
                raise RuntimeError('unexpected-non-temp-evidence-type')
            total += metadata.st_size
            if total > MAX_BYTES:
                raise RuntimeError('non-temp-evidence-capacity')
    return total

def digest(path):
    if path.resolve() != path:
        raise RuntimeError('source-realpath-mismatch')
    current = path
    while current != REPO:
        if current == current.parent or current.is_symlink():
            raise RuntimeError('source-reparse-or-containment')
        current = current.parent
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 4 * MIB:
        raise RuntimeError('bounded-source-unavailable')
    return hashlib.sha256(path.read_bytes()).hexdigest()

headroom()
node = shutil.which('node')
if not node:
    raise SystemExit('Node unavailable')
source_paths = {
    "run.mjs": HERE / "run.mjs",
    "policy.js": HERE / "policy.js",
    "manifest.js": HERE / "manifest.js",
    "producer-profiles.js": HERE / "producer-profiles.js",
    "supervise.py": HERE / "supervise.py",
    "protocol.json": HERE / "protocol.json",
    "run.test.mjs": HERE / "run.test.mjs",
    "policy.test.mjs": HERE / "policy.test.mjs",
    "manifest.test.mjs": HERE / "manifest.test.mjs",
    "README.md": HERE / "README.md",
    "artifact-reuse.js": HERE / "artifact-reuse.js",
    "artifact-reuse.test.mjs": HERE / "artifact-reuse.test.mjs",
    "page-content-reader.js": REPO / "spikes/topic-resolution/browser/chromium/page-content-reader.js",
    "page-content-policy.js": REPO / "spikes/topic-resolution/browser/core/page-content-policy.js",
    "final-policy.js": REPO / "spikes/topic-resolution/harness/current-producer-final-v2/policy.js",
    "final-manifest.js": REPO / "spikes/topic-resolution/harness/current-producer-final-v2/manifest.js",
    "public-fetch.js": REPO / "apps/local-service/src/crawler/public-fetch.js",
    "robots.js": REPO / "apps/local-service/src/crawler/robots.js",
    "static-capture.js": REPO / "apps/local-service/src/crawler/static-capture.js",
    "robots-deny-space-repair.js": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js",
    "package.json": REPO / "spikes/topic-resolution/harness/experimental/playwright-dev-v1/package.json",
    "package-lock.json": REPO / "spikes/topic-resolution/harness/experimental/playwright-dev-v1/package-lock.json",
    "ADR148.md": REPO / "decisions/ADR-148-browser-input-transfer-with-fixed-root-model.md",
    "apps/local-service/data/hierarchy-current-producer-transfer-candidates-adr143.json": REPO / "apps/local-service/data/hierarchy-current-producer-transfer-candidates-adr143.json",
    "apps/local-service/data/hierarchy-current-producer-transfer-label-seal-adr143.json": REPO / "apps/local-service/data/hierarchy-current-producer-transfer-label-seal-adr143.json",
    "apps/local-service/data/hierarchy-browser-root-artifact-reuse-adr148.json": REPO / "apps/local-service/data/hierarchy-browser-root-artifact-reuse-adr148.json",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/freeze.json": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/freeze.json",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/supervisor.json": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/supervisor.json",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/selection-receipt.json": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/output/selection-receipt.json",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/fit.js": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/fit.js",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/contracts.test.js": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/contracts.test.js",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/protocol.json": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/protocol.json",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/supervise.py": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/supervise.py",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/manifest.js": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/manifest.js",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.js": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.js",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.test.js": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.test.js",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/README.md": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/README.md",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.test.js": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.test.js",
    "apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js": REPO / "apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js",
    "apps/local-service/src/domain/hierarchical-e5-paired-input.js": REPO / "apps/local-service/src/domain/hierarchical-e5-paired-input.js",
    "apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js": REPO / "apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js",
    "spikes/topic-resolution/harness/deny-external-capabilities.js": REPO / "spikes/topic-resolution/harness/deny-external-capabilities.js",
    "spikes/topic-resolution/harness/current-producer-final-v1/run.mjs": REPO / "spikes/topic-resolution/harness/current-producer-final-v1/run.mjs",
    "spikes/topic-resolution/harness/current-producer-final-v1/policy.js": REPO / "spikes/topic-resolution/harness/current-producer-final-v1/policy.js",
    "spikes/topic-resolution/harness/current-producer-final-v1/manifest.js": REPO / "spikes/topic-resolution/harness/current-producer-final-v1/manifest.js",
    "spikes/topic-resolution/harness/current-producer-final-v1/protocol.json": REPO / "spikes/topic-resolution/harness/current-producer-final-v1/protocol.json",
    "spikes/topic-resolution/browser/core/page-content-policy.js": REPO / "spikes/topic-resolution/browser/core/page-content-policy.js",
    "apps/local-service/src/crawler/public-fetch.js": REPO / "apps/local-service/src/crawler/public-fetch.js",
    "apps/local-service/src/crawler/robots.js": REPO / "apps/local-service/src/crawler/robots.js",
    "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js",
    "apps/local-service/src/crawler/static-capture.js": REPO / "apps/local-service/src/crawler/static-capture.js",
    "spikes/topic-resolution/browser/chromium/page-content-reader.js": REPO / "spikes/topic-resolution/browser/chromium/page-content-reader.js",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js",
    "spikes/topic-resolution/browser/embedding/embedding-contract.js": REPO / "spikes/topic-resolution/browser/embedding/embedding-contract.js",
    "apps/local-service/experiments/topic-encoder/hierarchical-e5-paired-v1/taxonomy.js": REPO / "apps/local-service/experiments/topic-encoder/hierarchical-e5-paired-v1/taxonomy.js",
}
package_root = REPO / 'spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core'
package_count = package_bytes = 0

def package_walk(directory, depth=0):
    global package_count, package_bytes
    if depth > 8 or directory.is_symlink() or directory.resolve() != directory:
        raise RuntimeError('package-tree-unverifiable')
    children = sorted(directory.iterdir(), key=lambda child: child.name)
    if len(children) > 128:
        raise RuntimeError('package-tree-capacity')
    for path in children:
        if path.is_symlink() or path.resolve() != path:
            raise RuntimeError('package-tree-unverifiable')
        if path.is_dir():
            package_walk(path, depth + 1)
        elif path.is_file():
            package_count += 1
            package_bytes += path.stat().st_size
            if package_count > 128 or package_bytes > 16 * MIB or path.stat().st_size > 4 * MIB:
                raise RuntimeError('package-tree-capacity')
            source_paths['node_modules/playwright-core/' + path.relative_to(package_root).as_posix()] = path
        else:
            raise RuntimeError('package-tree-unverifiable')

package_walk(package_root)
if len(source_paths) > 256:
    raise SystemExit('Source key capacity')
source_hashes = {name: digest(path) for name, path in source_paths.items()}
freeze_path = HERE / 'freeze.json'
freeze_sha = digest(freeze_path)
freeze_bytes = freeze_path.read_bytes()
if hashlib.sha256(freeze_bytes).hexdigest() != freeze_sha:
    raise SystemExit('Freeze changed during preflight')
frozen = json.loads(freeze_bytes)
freeze_body = {key: value for key, value in frozen.items() if key != 'freezeHash'}
if frozen.get('schema') != 'browser-root-transfer-freeze/v1' or frozen.get('sourceHashes') != source_hashes or frozen.get('protocolSha256') != source_hashes['protocol.json'] or hashlib.sha256(json.dumps(freeze_body, separators=(',', ':'), ensure_ascii=False).encode('utf8')).hexdigest() != frozen.get('freezeHash'):
    raise SystemExit('Reviewed freeze unavailable or changed')
if source_hashes['page-content-reader.js'] != READER_SHA:
    raise SystemExit('Reader source changed; review required')
OUTPUT.mkdir()  # Exclusive directory is persistent, including failed attempts.
paths = {name: OUTPUT / suffix for name, suffix in [('marker', 'supervisor.started.json'),
    ('stdout', 'stdout.log'), ('stderr', 'stderr.log'), ('receipt', 'supervisor.json'), ('result', 'result.json'), ('packet', 'input.packet.json')]}
with paths['marker'].open('x', encoding='utf8') as marker:
    json.dump({'schema': 'browser-root-transfer-supervisor-started/v1', 'sourceHashes': source_hashes, 'phase': PHASE, 'batch': BATCH, 'freezeSha256': freeze_sha,
        'noAutomaticRepeat': True}, marker)

job = process_handle = child = None
reason = None
peak_rss = peak_private = peak_pids = 0
peak_profile_bytes = peak_profile_entries = 0
emergency_own_job_termination = False
cleanup_confirmed = False
cleanup_reason = None
result_sha = result_text = None
source_hashes_rechecked = False
with paths['stdout'].open('xb') as stdout_log, paths['stderr'].open('xb') as stderr_log:
    try:
        job = kernel.CreateJobObjectW(None, None)
        if not job:
            raise RuntimeError('job-creation-failed')
        limits = ExtendedLimits()
        # No breakaway permission: all descendants remain owned by this Job.
        limits.basic.limitFlags = 0x2000 | 0x200  # KILL_ON_JOB_CLOSE | JOB_MEMORY
        limits.jobMemoryLimit = MEMORY_LIMIT
        if not kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            raise RuntimeError('job-resource-limit-failed')
        allowed = {'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT'}
        env = {key: value for key, value in os.environ.items() if key.upper() in allowed}
        temp = OUTPUT / 'temp'
        temp.mkdir()
        if temp.is_symlink() or temp.resolve() != temp:
            raise RuntimeError('owned-temp-unverifiable')
        # No inherited credentials, NODE_OPTIONS, owner profile, app or pairing.
        env.update({'TEMP': str(temp), 'TMP': str(temp), 'MURMINGLE_BROWSER_ROOT_TRANSFER_V1_SUPERVISED': str(BATCH),
            'OMP_NUM_THREADS': '1', 'UV_THREADPOOL_SIZE': '1'})
        child = subprocess.Popen([node, '--max-old-space-size=256', str(TARGET), '--browser-batch', str(BATCH)],
            cwd=HERE, env=env, creationflags=subprocess.CREATE_NO_WINDOW,
            stdin=subprocess.PIPE, stdout=stdout_log, stderr=stderr_log)
        process_handle = kernel.OpenProcess(0x0100 | 0x0001 | 0x1000, False, child.pid)
        if not process_handle or not kernel.AssignProcessToJobObject(job, process_handle):
            raise RuntimeError('node-job-assignment-failed')
        # Node has no browser-spawn path before this exact handshake. Never send
        # it on assignment failure; there is no browser attach or retry path.
        child.stdin.write(('BROWSER_ROOT_TRANSFER_JOB_ASSIGNED_V1:' + str(BATCH) + '\n').encode('ascii'))
        child.stdin.flush()
        child.stdin.close()
        while child.poll() is None:
            headroom()
            rss, private, pids = tree_memory(job)
            peak_rss = max(peak_rss, rss)
            peak_private = max(peak_private, private)
            peak_pids = max(peak_pids, pids)
            non_temp_evidence_bytes()
            profile_bytes, profile_entries = owned_tree_metadata(OUTPUT)
            peak_profile_bytes = max(peak_profile_bytes, profile_bytes)
            peak_profile_entries = max(peak_profile_entries, profile_entries)
            sizes = sum(p.stat().st_size for p in [paths['stdout'], paths['stderr'], paths['result'], paths['packet']] if p.exists())
            if rss > MEMORY_LIMIT or private > MEMORY_LIMIT or time.monotonic() - started > ACTIVE_LIMIT:
                raise RuntimeError('owned-job-resource-budget-exceeded')
            if sizes > MAX_BYTES or sum(paths[k].stat().st_size for k in ('stdout', 'stderr')) > 64 * 1024 or (paths['result'].exists() and paths['result'].stat().st_size > 64 * 1024):
                raise RuntimeError('owned-output-capacity-exceeded')
            time.sleep(.05)
        child.wait()
        if child.returncode != 0:
            raise RuntimeError('owned-child-failed')
        if not normal_job_drain(job):
            raise RuntimeError('surviving-descendants-after-normal-child-exit')
        if time.monotonic() - started > WALL_LIMIT:
            raise RuntimeError('owned-wall-budget-exceeded')
        if paths['packet'].is_symlink() or not paths['packet'].is_file() or paths['packet'].stat().st_size > 128 * 1024:
            raise RuntimeError('bounded-packet-unavailable')
        if paths['result'].is_symlink() or not paths['result'].is_file() or not 0 < paths['result'].stat().st_size <= 64 * 1024:
            raise RuntimeError('bounded-result-unavailable')
        if sum(p.stat().st_size for p in [paths['stdout'], paths['stderr'], paths['result']]) > MAX_BYTES:
            raise RuntimeError('owned-output-capacity-exceeded')
        if sum(paths[k].stat().st_size for k in ('stdout', 'stderr')) > 64 * 1024:
            raise RuntimeError('owned-log-capacity-exceeded')
    except Exception as error:
        reason = str(error) if isinstance(error, RuntimeError) else 'supervisor-failed'
    finally:
        cleanup_deadline = time.monotonic() + 5
        try:
            if job:
                remaining = job_members(job)
                if remaining.assigned != 0 or remaining.listed != 0:
                    emergency_own_job_termination = True
                    # Emergency cleanup cannot turn a normal child exit into success.
                    reason = reason or 'emergency-own-job-termination-required'
                    if not kernel.TerminateJobObject(job, 1):
                        cleanup_reason = 'own-job-termination-unverifiable'
            if child is not None and child.poll() is None:
                child.kill()  # Assignment failure too: exact own Node, never PID/name search.
                child.wait(timeout=max(.01, cleanup_deadline - time.monotonic()))
            if job:
                while True:
                    members = job_members(job)
                    if members.assigned == 0 and members.listed == 0:
                        cleanup_confirmed = child is None or child.poll() is not None
                        break
                    if time.monotonic() >= cleanup_deadline:
                        raise RuntimeError('own-job-final-drain-timeout')
                    time.sleep(.05)
            else:
                cleanup_confirmed = child is None or child.poll() is not None
            if not cleanup_confirmed:
                raise RuntimeError('own-child-final-exit-unconfirmed')
        except Exception as error:
            cleanup_reason = str(error) if isinstance(error, RuntimeError) else 'own-tree-cleanup-unconfirmed'
        finally:
            if process_handle:
                kernel.CloseHandle(process_handle)
            if job:
                kernel.CloseHandle(job)  # Kill-on-close remains a final safety boundary.
        reason = reason or cleanup_reason
    try:
        non_temp_evidence_bytes()
        profile_bytes, profile_entries = owned_tree_metadata(OUTPUT)
        peak_profile_bytes = max(peak_profile_bytes, profile_bytes)
        peak_profile_entries = max(peak_profile_entries, profile_entries)
        if digest(freeze_path) != freeze_sha or any(digest(path) != source_hashes[name] for name, path in source_paths.items()):
            raise RuntimeError('diagnostic-source-drift')
        source_hashes_rechecked = True
        if reason is None:
            result_bytes = paths['result'].read_bytes()
            if not 0 < len(result_bytes) <= 64 * 1024:
                raise RuntimeError('bounded-result-unavailable')
            result_sha = hashlib.sha256(result_bytes).hexdigest()
            packet_sha = digest(paths['packet'])
            parsed = json.loads(result_bytes)
            if parsed.get('schema') != 'browser-root-transfer-result/v1' or parsed.get('phase') != PHASE or parsed.get('batch') != BATCH or parsed.get('denominator') != 4 or parsed.get('fullProducerDenominator') != 32 or parsed.get('status') != 'complete' or parsed.get('sourceHashes') != source_hashes or parsed.get('sourceHashesRechecked') is not True or parsed.get('freezeSha256') != freeze_sha or parsed.get('protocolCallbacksDrained') is not True or parsed.get('packetSha256') != packet_sha:
                raise RuntimeError('result-source-or-drain-witness-mismatch')
    except Exception as error:
        reason = reason or (str(error) if isinstance(error, RuntimeError) else 'final-evidence-unverifiable')
    if time.monotonic() - started > WALL_LIMIT:
        reason = reason or 'owned-total-wall-budget-exceeded'
    receipt = {'schema': 'browser-root-transfer-supervisor/v1', 'phase': PHASE, 'batch': BATCH, 'denominator': 4, 'fullProducerDenominator': 32, 'reason': reason, 'freezeSha256': freeze_sha,
        'childPid': child.pid if child else None, 'exitCode': child.returncode if child else None,
        'sourceHashes': source_hashes, 'elapsedSeconds': time.monotonic() - started,
        'sampledPeakTreeRssBytes': peak_rss, 'sampledPeakTreePrivateBytes': peak_private,
        'sampledPeakTreeProcesses': peak_pids, 'jobMemoryLimitBytes': MEMORY_LIMIT,
        'ownTreeCleanupConfirmed': cleanup_confirmed, 'cleanupReason': cleanup_reason,
        'emergencyOwnJobTermination': emergency_own_job_termination,
        'sampledPeakOwnedOutputBytes': peak_profile_bytes, 'sampledPeakOwnedOutputEntries': peak_profile_entries,
        'ownedOutputByteLimit': PROFILE_MAX_BYTES, 'ownedOutputEntryLimit': PROFILE_MAX_ENTRIES,
        'sourceHashesRechecked': source_hashes_rechecked,
        'noNativeAttestation': True, 'noModelCalls': True, 'productionValidated': False,
        'purpose': 'ADR148-browser-root-only-reobservation-not-independent-cohort'}
    if reason is None:
        receipt['resultSha256'] = result_sha
        receipt['packetSha256'] = packet_sha
    receipt_wire = json.dumps(receipt, separators=(',', ':'), ensure_ascii=False)
    try:
        if non_temp_evidence_bytes() + len(receipt_wire.encode('utf8')) > MAX_BYTES:
            raise RuntimeError('non-temp-evidence-capacity')
    except Exception:
        reason = reason or 'non-temp-evidence-capacity'
        receipt = {'schema': 'browser-root-transfer-supervisor/v1', 'phase': PHASE, 'batch': BATCH,
            'reason': reason, 'exitCode': child.returncode if child else None, 'ownTreeCleanupConfirmed': cleanup_confirmed,
            'cleanupReason': cleanup_reason, 'emergencyOwnJobTermination': emergency_own_job_termination,
            'sourceHashesRechecked': source_hashes_rechecked, 'productionValidated': False}
        receipt_wire = json.dumps(receipt, separators=(',', ':'))
    with paths['receipt'].open('x', encoding='utf8') as output:
        output.write(receipt_wire)
    print(json.dumps(receipt), flush=True)
    raise SystemExit(0 if reason is None else 1)






