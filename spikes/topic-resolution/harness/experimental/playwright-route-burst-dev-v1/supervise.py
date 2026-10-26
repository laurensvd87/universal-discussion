"""Default inert. Invented local route-burst DEV diagnostic, own Node/Chrome Job tree only."""
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
    print('No action. Explicit --run-dev; review, freeze and separate approval first.')
    raise SystemExit(0)
if sys.platform != 'win32' or len(sys.argv) != 2 or sys.argv[1] != '--run-dev':
    raise SystemExit('Only the fixed Windows route-burst DEV probe is supported')

PHASE = 'dev-bursts'
WALL_LIMIT = 180
ACTIVE_LIMIT = 170
started = time.monotonic()
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
if HERE.drive.upper() != 'D:':
    raise SystemExit('Diagnostic must remain on D drive')
TARGET = HERE / 'run.mjs'
OUTPUT = HERE / 'output'
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

SOURCE_NAMES = [
  "spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/run.mjs",
  "spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/run.test.mjs",
  "spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/supervise.py",
  "spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/protocol.json",
  "spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/README.md",
  "spikes/topic-resolution/harness/experimental/playwright-route-coordinator-v1/coordinator.mjs",
  "spikes/topic-resolution/harness/experimental/playwright-route-coordinator-v1/coordinator.test.mjs",
  "spikes/topic-resolution/harness/experimental/playwright-route-coordinator-v1/README.md",
  "decisions/ADR-149-serialized-browser-denials-and-reserved-cleanup.md",
  "spikes/topic-resolution/harness/deny-external-capabilities.js",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/package.json",
  "spikes/topic-resolution/harness/experimental/playwright-dev-v1/package-lock.json"
]
PACKAGE_PREFIX = 'node_modules/playwright-core/'
PACKAGE_ROOT = REPO / 'spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core'

def bounded_bytes(path, maximum=4 * MIB):
    current = path
    while True:
        info = current.lstat()
        if getattr(info, 'st_file_attributes', 0) & 0x400 or current.is_symlink():
            raise RuntimeError('source-reparse-or-containment')
        if current == REPO:
            break
        if current == current.parent:
            raise RuntimeError('source-reparse-or-containment')
        current = current.parent
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= maximum or path.resolve() != path:
        raise RuntimeError('bounded-source-unavailable')
    data = path.read_bytes()
    after = path.lstat()
    if len(data) != before.st_size or (after.st_size, after.st_mtime_ns, after.st_ctime_ns) != (before.st_size, before.st_mtime_ns, before.st_ctime_ns):
        raise RuntimeError('source-changed-during-read')
    return data

def digest(path):
    return hashlib.sha256(bounded_bytes(path)).hexdigest()

def source_paths_for_run():
    paths = {name: REPO / name for name in SOURCE_NAMES}
    count = total = 0
    def walk(directory, depth=0):
        nonlocal count, total
        info = directory.lstat()
        if depth > 8 or getattr(info, 'st_file_attributes', 0) & 0x400 or directory.is_symlink() or not stat.S_ISDIR(info.st_mode) or directory.resolve() != directory:
            raise RuntimeError('package-tree-unverifiable')
        children = sorted(directory.iterdir(), key=lambda child: child.name)
        if len(children) > 128:
            raise RuntimeError('package-tree-capacity')
        for path in children:
            info = path.lstat()
            if getattr(info, 'st_file_attributes', 0) & 0x400 or path.is_symlink() or path.resolve() != path:
                raise RuntimeError('package-tree-unverifiable')
            if stat.S_ISDIR(info.st_mode):
                walk(path, depth + 1)
            elif stat.S_ISREG(info.st_mode):
                count += 1
                total += info.st_size
                if count > 128 or total > 16 * MIB or not 0 < info.st_size <= 4 * MIB:
                    raise RuntimeError('package-tree-capacity')
                paths[PACKAGE_PREFIX + path.relative_to(PACKAGE_ROOT).as_posix()] = path
            else:
                raise RuntimeError('package-tree-unverifiable')
    walk(PACKAGE_ROOT)
    if count != 115 or len(paths) > 256:
        raise RuntimeError('reviewed-package-file-count-mismatch')
    return paths

def non_temp_evidence_bytes(prospective=0):
    if type(prospective) is not int or prospective < 0:
        raise RuntimeError('invalid-evidence-reservation')
    pending = [OUTPUT]
    count = total = 0
    while pending:
        directory = pending.pop()
        metadata = directory.lstat()
        if getattr(metadata, 'st_file_attributes', 0) & 0x400 or not stat.S_ISDIR(metadata.st_mode):
            raise RuntimeError('owned-output-reparse-or-type')
        for path in directory.iterdir():
            metadata = path.lstat()
            count += 1
            if count > PROFILE_MAX_ENTRIES or getattr(metadata, 'st_file_attributes', 0) & 0x400 or path.is_symlink():
                raise RuntimeError('owned-output-reparse-or-type')
            if path == OUTPUT / 'temp':
                if not stat.S_ISDIR(metadata.st_mode):
                    raise RuntimeError('owned-temp-unverifiable')
                continue
            if stat.S_ISDIR(metadata.st_mode):
                pending.append(path)
            elif stat.S_ISREG(metadata.st_mode):
                total += metadata.st_size
            else:
                raise RuntimeError('owned-output-reparse-or-type')
    if total + prospective > MAX_BYTES:
        raise RuntimeError('non-temp-evidence-capacity')
    return total

def output_bounds(reserve=0):
    profile_bytes, profile_entries = owned_tree_metadata(OUTPUT)
    non_temp_evidence_bytes(reserve)
    if profile_bytes + reserve > PROFILE_MAX_BYTES or profile_entries + (1 if reserve else 0) > PROFILE_MAX_ENTRIES:
        raise RuntimeError('owned-final-receipt-capacity')
    log_bytes = sum(paths[key].stat().st_size for key in ('stdout', 'stderr') if paths[key].exists())
    if log_bytes > 64 * 1024:
        raise RuntimeError('owned-log-capacity-exceeded')
    if paths['result'].exists() and paths['result'].stat().st_size > 64 * 1024:
        raise RuntimeError('bounded-result-unavailable')
    return profile_bytes, profile_entries

def exact_fields(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        raise RuntimeError('result-contract-mismatch')
    return value

def require_equal(value, expected):
    if type(value) is not type(expected) or value != expected:
        raise RuntimeError('result-contract-mismatch')

def bounded_integer(value, maximum, minimum=0):
    if type(value) is not int or not minimum <= value <= maximum:
        raise RuntimeError('result-counter-capacity')

def fixture_digest(count):
    text = '<!doctype html><meta charset="utf-8"><title>Invented denial fixture</title>'
    text += ''.join('<img src="https://route-burst.invalid/image/' + str(i) + '">' for i in range(count))
    return hashlib.sha256(text.encode('utf8')).hexdigest()

def validate_snapshot(value, stage):
    s = exact_fields(value, ['failure', 'disposed', 'events', 'cleanupIssued', 'backlog', 'normalActive', 'cleanupActive', 'denialActive',
        'peakNormal', 'peakCleanup', 'peakAggregate', 'peakDenials', 'peakBacklog', 'nativeStarted', 'nativeSettled', 'physical', 'peakPhysical',
        'unexpected', 'expectedFatal', 'registered', 'callerRejectedDenials', 'callerRejectedOrdinary', 'callerRejectedQueuedDenials'])
    for key, maximum in {'events':4096, 'cleanupIssued':2, 'backlog':4096, 'normalActive':126, 'cleanupActive':2, 'denialActive':1,
        'peakNormal':126, 'peakCleanup':2, 'peakAggregate':128, 'peakDenials':1, 'peakBacklog':4096, 'nativeStarted':1256,
        'nativeSettled':1256, 'physical':128, 'peakPhysical':128, 'registered':4096, 'callerRejectedDenials':1,
        'callerRejectedOrdinary':125, 'callerRejectedQueuedDenials':255}.items():
        bounded_integer(s[key], maximum)
    require_equal(s['disposed'], False)
    require_equal(s['unexpected'], None)
    require_equal(s['peakDenials'], 1)
    require_equal(s['expectedFatal'], stage in ('after-fatal', 'final'))
    require_equal(s['failure'], 'external-fatal' if stage in ('after-fatal', 'final') else None)
    require_equal(s['nativeStarted'], 1000 if stage == 'normal' else 1001)
    require_equal(s['nativeSettled'], s['nativeStarted'])
    if s['events'] < 1000 or s['peakNormal'] < max(1, s['normalActive']) or s['peakCleanup'] < s['cleanupActive'] or s['peakPhysical'] < max(1, s['physical']) or s['peakAggregate'] < s['normalActive'] + s['cleanupActive'] or s['peakBacklog'] < max(1, s['backlog']):
        raise RuntimeError('result-physical-accounting-mismatch')
    require_equal(s['physical'], s['normalActive'] + s['cleanupActive'])
    if stage in ('normal', 'at-fatal', 'after-fatal'):
        require_equal(s['cleanupIssued'], 0)
        require_equal(s['cleanupActive'], 0)
        require_equal(s['peakCleanup'], 0)
    if stage in ('normal', 'final'):
        for key in ('backlog', 'normalActive', 'cleanupActive', 'denialActive', 'physical', 'registered'):
            require_equal(s[key], 0)
    else:
        require_equal(s['normalActive'], 126)
        require_equal(s['denialActive'], 1)
        require_equal(s['physical'], 126)
    if stage in ('normal', 'at-fatal'):
        for key in ('callerRejectedDenials', 'callerRejectedOrdinary', 'callerRejectedQueuedDenials'):
            require_equal(s[key], 0)
    else:
        require_equal(s['callerRejectedDenials'], 1)
        require_equal(s['callerRejectedOrdinary'], 125)
    if stage == 'at-fatal':
        bounded_integer(s['backlog'], 255, 1)
        require_equal(s['registered'], s['backlog'])
    if stage == 'after-fatal':
        require_equal(s['backlog'], 0)
        require_equal(s['registered'], 0)
    if stage == 'final':
        require_equal(s['cleanupIssued'], 2)
        bounded_integer(s['peakCleanup'], 2, 1)
        bounded_integer(s['peakAggregate'], 128, 126 + s['peakCleanup'])
        bounded_integer(s['peakPhysical'], 128, 126 + s['peakCleanup'])
    if stage != 'normal':
        require_equal(s['peakNormal'], 126)
    return s

def validate_owner_snapshot(value, queued):
    s = exact_fields(value, ['callbacks', 'uniqueOrdinals', 'aborted', 'retired', 'pending'])
    for key in s:
        bounded_integer(s[key], 256)
    require_equal(s['aborted'], 1)
    require_equal(s['uniqueOrdinals'], queued + 1)
    require_equal(s['callbacks'], s['uniqueOrdinals'] + s['retired'])
    require_equal(s['pending'], 0)
    return s

def validate_result(value, expected_sources, expected_freeze_sha, expected_freeze_hash, expected_protocol_sha):
    r = exact_fields(value, ['schema', 'phase', 'status', 'normal', 'controlled', 'final', 'sourceHashes', 'freezeHash', 'freezeSha256',
        'sourceHashesRechecked', 'protocolCallbacksDrained', 'elapsedMs', 'noPublicNavigation', 'noNativeAttestation', 'noModelCalls', 'noCanonicalWrites',
        'playwrightInternalPendingOrIpcCapsEnforced', 'completeOsEgressIsolation', 'productionValidated', 'assignmentAuthority'])
    for key, expected in {'schema':'playwright-route-burst-dev-result/v1', 'phase':'dev-bursts', 'status':'complete', 'freezeHash':expected_freeze_hash,
        'freezeSha256':expected_freeze_sha, 'sourceHashesRechecked':True, 'protocolCallbacksDrained':True, 'noPublicNavigation':True,
        'noNativeAttestation':True, 'noModelCalls':True, 'noCanonicalWrites':True, 'playwrightInternalPendingOrIpcCapsEnforced':False,
        'completeOsEgressIsolation':False, 'productionValidated':False, 'assignmentAuthority':False}.items():
        require_equal(r[key], expected)
    require_equal(r['sourceHashes'], expected_sources)
    # Protocol SHA is transitively bound to BOTH validated freeze and source map.
    require_equal(r['sourceHashes'][SOURCE_NAMES[3]], expected_protocol_sha)
    elapsed = r['elapsedMs']
    if type(elapsed) not in (int, float) or not 0 <= elapsed <= 165000:
        raise RuntimeError('result-elapsed-budget')
    normal = exact_fields(r['normal'], ['references', 'callbacks', 'uniqueOrdinals', 'aborted', 'retired', 'pending', 'coordinator', 'fixtureSha256', 'status'])
    for key, expected in {'references':1000, 'callbacks':1000, 'uniqueOrdinals':1000, 'aborted':1000, 'retired':0, 'pending':0,
        'fixtureSha256':fixture_digest(1000), 'status':'complete'}.items():
        require_equal(normal[key], expected)
    normal_snapshot = validate_snapshot(normal['coordinator'], 'normal')
    c = exact_fields(r['controlled'], ['references', 'observed', 'atFatal', 'afterFatal', 'callerRejected', 'cleanup', 'fixtureSha256', 'status', 'expectedFatalStage', 'finalObserved'])
    for key, expected in {'references':256, 'fixtureSha256':fixture_digest(256), 'status':'expected-controlled-fatal', 'expectedFatalStage':'adapter-quota-full'}.items():
        require_equal(c[key], expected)
    before = validate_snapshot(c['atFatal'], 'at-fatal')
    after = validate_snapshot(c['afterFatal'], 'after-fatal')
    final = validate_snapshot(r['final'], 'final')
    for earlier, later in ((normal_snapshot, before), (before, after), (after, final)):
        if any(later[key] < earlier[key] for key in ('events', 'peakNormal', 'peakCleanup', 'peakAggregate', 'peakDenials', 'peakBacklog', 'peakPhysical', 'nativeStarted', 'nativeSettled')):
            raise RuntimeError('result-physical-accounting-mismatch')
    queued = before['backlog']
    rejected = exact_fields(c['callerRejected'], ['physicalDenials', 'physicalOrdinary', 'queuedDenials', 'total'])
    for key, expected in {'physicalDenials':1, 'physicalOrdinary':125, 'queuedDenials':queued, 'total':126 + queued}.items():
        require_equal(rejected[key], expected)
    for snapshot in (after, final):
        require_equal(snapshot['callerRejectedQueuedDenials'], queued)
        require_equal(snapshot['events'], before['events'])
    cleanup = exact_fields(c['cleanup'], ['contextAttempts', 'browserAttempts', 'contextCompleted', 'browserCompleted'])
    for key, expected in {'contextAttempts':1, 'browserAttempts':1, 'contextCompleted':True, 'browserCompleted':True}.items():
        require_equal(cleanup[key], expected)
    observed = validate_owner_snapshot(c['observed'], queued)
    last = validate_owner_snapshot(c['finalObserved'], queued)
    if last['callbacks'] < observed['callbacks'] or last['retired'] < observed['retired']:
        raise RuntimeError('result-callback-accounting-mismatch')
    return True

headroom()
node = shutil.which('node')
if not node:
    raise SystemExit('Node unavailable')
source_paths = source_paths_for_run()
source_hashes = {name: digest(path) for name, path in source_paths.items()}
freeze_path = HERE / 'freeze.json'
freeze_bytes = bounded_bytes(freeze_path, 65536)
freeze_sha = hashlib.sha256(freeze_bytes).hexdigest()
frozen = json.loads(freeze_bytes)
freeze_body = {key: value for key, value in frozen.items() if key != 'freezeHash'}
if (list(frozen) != ['schema', 'sourceHashes', 'protocolSha256', 'freezeHash'] or
    frozen.get('schema') != 'playwright-route-burst-dev-freeze/v1' or frozen.get('sourceHashes') != source_hashes or
    frozen.get('protocolSha256') != source_hashes['spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/protocol.json'] or
    hashlib.sha256(json.dumps(freeze_body, separators=(',', ':'), ensure_ascii=False).encode('utf8')).hexdigest() != frozen.get('freezeHash')):
    raise SystemExit('Reviewed freeze unavailable or changed')
OUTPUT.mkdir()  # Exclusive directory is persistent, including failed attempts.
paths = {name: OUTPUT / suffix for name, suffix in [('marker', 'supervisor.started.json'),
    ('stdout', 'stdout.log'), ('stderr', 'stderr.log'), ('receipt', 'supervisor.json'), ('result', 'result.json')]}
with paths['marker'].open('x', encoding='utf8') as marker:
    marker_wire = json.dumps({'schema': 'playwright-route-burst-dev-supervisor-started/v1', 'sourceHashes': source_hashes, 'phase': PHASE, 'freezeSha256': freeze_sha,
        'noAutomaticRepeat': True}, separators=(',', ':'), ensure_ascii=False)
    if len(marker_wire.encode('utf8')) > 64 * 1024:
        raise SystemExit('bounded-supervisor-marker-unavailable')
    non_temp_evidence_bytes(len(marker_wire.encode('utf8')))
    marker.write(marker_wire)

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
        env.update({'TEMP': str(temp), 'TMP': str(temp), 'MURMINGLE_PLAYWRIGHT_ROUTE_BURST_DEV_V1_SUPERVISED': '1',
            'OMP_NUM_THREADS': '1', 'UV_THREADPOOL_SIZE': '1'})
        child = subprocess.Popen([node, '--max-old-space-size=256', str(TARGET), '--run-dev'],
            cwd=HERE, env=env, creationflags=subprocess.CREATE_NO_WINDOW,
            stdin=subprocess.PIPE, stdout=stdout_log, stderr=stderr_log)
        process_handle = kernel.OpenProcess(0x0100 | 0x0001 | 0x1000, False, child.pid)
        if not process_handle or not kernel.AssignProcessToJobObject(job, process_handle):
            raise RuntimeError('node-job-assignment-failed')
        # Node has no browser-spawn path before this exact handshake. Never send
        # it on assignment failure; there is no browser attach or retry path.
        child.stdin.write(('PLAYWRIGHT_ROUTE_BURST_JOB_ASSIGNED_V1\n').encode('ascii'))
        child.stdin.flush()
        child.stdin.close()
        while child.poll() is None:
            headroom()
            rss, private, pids = tree_memory(job)
            peak_rss = max(peak_rss, rss)
            peak_private = max(peak_private, private)
            peak_pids = max(peak_pids, pids)
            profile_bytes, profile_entries = output_bounds(64 * 1024)
            peak_profile_bytes = max(peak_profile_bytes, profile_bytes)
            peak_profile_entries = max(peak_profile_entries, profile_entries)
            sizes = sum(p.stat().st_size for p in [paths['stdout'], paths['stderr'], paths['result']] if p.exists())
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
            emergency_own_job_termination = bool(job)
            cleanup_reason = str(error) if isinstance(error, RuntimeError) else 'own-tree-cleanup-unconfirmed'
        finally:
            if process_handle:
                kernel.CloseHandle(process_handle)
            if job:
                kernel.CloseHandle(job)  # Kill-on-close remains a final safety boundary.
        reason = reason or cleanup_reason
    try:
        output_bounds()
        profile_bytes, profile_entries = owned_tree_metadata(OUTPUT)
        peak_profile_bytes = max(peak_profile_bytes, profile_bytes)
        peak_profile_entries = max(peak_profile_entries, profile_entries)
        final_paths = source_paths_for_run()
        if list(final_paths) != list(source_paths) or digest(freeze_path) != freeze_sha or any(digest(path) != source_hashes[name] for name, path in final_paths.items()):
            raise RuntimeError('diagnostic-source-drift')
        source_hashes_rechecked = True
        if reason is None:
            result_bytes = bounded_bytes(paths['result'], 64 * 1024)
            if not 0 < len(result_bytes) <= 64 * 1024:
                raise RuntimeError('bounded-result-unavailable')
            result_sha = hashlib.sha256(result_bytes).hexdigest()
            parsed = json.loads(result_bytes)
            validate_result(parsed, source_hashes, freeze_sha, frozen['freezeHash'], frozen['protocolSha256'])
    except Exception as error:
        reason = reason or (str(error) if isinstance(error, RuntimeError) else 'final-evidence-unverifiable')
    if time.monotonic() - started > WALL_LIMIT:
        reason = reason or 'owned-total-wall-budget-exceeded'
    receipt = {'schema': 'playwright-route-burst-dev-supervisor/v1', 'phase': PHASE, 'reason': reason, 'freezeSha256': freeze_sha,
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
        'purpose': 'invented-local-route-bursts-scheduling-and-cleanup-not-topic-quality',
        'noPublicNavigation': True, 'noCorpusInputs': True, 'noCanonicalWrites': True}
    if reason is None:
        receipt['resultSha256'] = result_sha
    wire = json.dumps(receipt, separators=(',', ':'), ensure_ascii=False)
    if len(wire.encode('utf8')) > 64 * 1024:
        raise SystemExit('bounded-supervisor-receipt-unavailable')
    try:
        output_bounds(len(wire.encode('utf8')))
        with paths['receipt'].open('x', encoding='utf8') as output:
            output.write(wire)
    except RuntimeError:
        # Do not delete/truncate retained failed evidence or exceed its cap.
        print(json.dumps({'schema': 'playwright-route-burst-dev-supervisor/v1', 'phase': PHASE,
            'reason': 'supervisor-evidence-capacity', 'exitCode': child.returncode if child else None,
            'ownTreeCleanupConfirmed': cleanup_confirmed, 'emergencyOwnJobTermination': emergency_own_job_termination}), flush=True)
        raise SystemExit(1)
    print(wire, flush=True)
    raise SystemExit(0 if reason is None else 1)






