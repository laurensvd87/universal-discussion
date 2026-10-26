"""Default inert. ADR151 fixed owned-Job startup-only diagnostic guardian; source only."""
import ctypes
from ctypes import wintypes
import hashlib
import json
import math
import os
import re
import stat
from pathlib import Path
import shutil
import subprocess
import sys
import time

if len(sys.argv) == 1:
    print('No action. Explicit --run-dev, reviewed freeze and separate approval required.')
    raise SystemExit(0)
if sys.platform != 'win32' or len(sys.argv) != 2 or sys.argv[1] != '--run-dev':
    raise SystemExit('Only the fixed supervised Windows native study is supported')

PHASE = 'native-extension-startup-dev'
WALL_LIMIT = 180
ACTIVE_LIMIT = 170
DRAIN_LIMIT = 15
VARIANT_LIMIT = 45
MIB = 1048576
MEMORY_LIMIT = 1536 * MIB
MAX_BYTES = 256 * 1024
PROFILE_MAX_BYTES = 512 * MIB
PROFILE_MAX_ENTRIES = 8192
started = time.monotonic()
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
OWN = 'spikes/topic-resolution/harness/experimental/native-extension-startup-dev-v1/'
OLD = 'spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/'
OLD_FREEZE = OLD + 'freeze.json'
OLD_FREEZE_SHA = '770eb68ef044dadbb6ef0f2edf2c927b643480e7d06cbf496319b1cab9d457ec'
DEV = 'spikes/topic-resolution/harness/experimental/playwright-dev-v1/'
OUTPUT = HERE / 'output'
TARGET = HERE / 'run.mjs'
if HERE.drive.upper() != 'D:' or HERE != REPO / OWN or HERE.resolve() != HERE:
    raise SystemExit('Fixed D study path required')
if OUTPUT.exists() or OUTPUT.is_symlink():
    raise SystemExit('Existing output prohibits repeat')
PACKAGE_ROOT = REPO / DEV / 'node_modules/playwright-core'
PACKAGE_PREFIX = 'node_modules/playwright-core/'
PACKAGE_INTEGRITY = 'sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ=='
# Literal CODE paths only, plus the one allowed fixed old freeze metadata.
NEW_SOURCE_PATHS = [
    OWN + 'run.mjs', OWN + 'run.test.mjs', OWN + 'protocol.json',
    OWN + 'README.md', OWN + 'supervise.py', OWN + 'supervise.test.mjs',
    'decisions/ADR-151-native-extension-startup-diagnostic.md'
]

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

def sampled_member_absent(job, pid, members=job_members):
    # A failed sample is skipped ONLY when a fresh list of this same owned Job
    # proves that exact sampled PID absent. Enumeration failure stays fatal.
    current = members(job)
    return pid not in list(current.pids[:current.listed])

def tree_memory(job):
    members = job_members(job)
    rss = private = 0
    for pid in members.pids[:members.listed]:
        handle = kernel.OpenProcess(0x1000 | 0x0010, False, pid)
        if not handle:
            if sampled_member_absent(job, pid):
                continue
            raise RuntimeError('job-member-memory-unverifiable')
        try:
            belongs = wintypes.BOOL()
            if not kernel.IsProcessInJob(handle, job, ctypes.byref(belongs)) or not belongs.value:
                if sampled_member_absent(job, pid):
                    continue
                raise RuntimeError('opened-process-not-confirmed-in-own-job')
            memory = ProcessMemory()
            memory.cb = ctypes.sizeof(memory)
            if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), ctypes.sizeof(memory)):
                if sampled_member_absent(job, pid):
                    continue
                raise RuntimeError('job-member-memory-unverifiable')
            rss += memory.workingSet
            private += memory.privateUsage
        finally:
            kernel.CloseHandle(handle)
    return rss, private, members.listed

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
    if paths['result'].exists() and paths['result'].stat().st_size > 128 * 1024:
        raise RuntimeError('bounded-result-unavailable')
    return profile_bytes, profile_entries


def ordered_json(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf8')

def sha(data):
    return hashlib.sha256(data).hexdigest()

def strict_json(data):
    def pairs(values):
        out = {}
        for key, value in values:
            if key in out:
                raise RuntimeError('duplicate-json-key')
            out[key] = value
        return out
    def constant(value):
        raise RuntimeError('nonfinite-json-value')
    return json.loads(data.decode('utf8'), object_pairs_hook=pairs, parse_constant=constant)

def exact_fields(value, keys):
    if type(value) is not dict or list(value) != list(keys):
        raise RuntimeError('metadata-contract')
    return value

def hash_value(value):
    if type(value) is not str or not re.fullmatch('[a-f0-9]{64}', value):
        raise RuntimeError('metadata-hash')
    return value

def count(value, maximum, minimum=0):
    if type(value) is not int or not minimum <= value <= maximum:
        raise RuntimeError('metadata-counter')
    return value

def parse_source_names(data):
    text = data.decode('utf8')
    matches = re.findall(r'export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\);', text)
    if len(matches) != 1:
        raise RuntimeError('source-code-literal-unavailable')
    names = strict_json(matches[0].encode('utf8'))
    if type(names) is not list or len(names) != 72 or len(set(names)) != 72 or names != sorted(names):
        raise RuntimeError('source-code-literal-capacity')
    for name in names:
        if type(name) is not str or not re.fullmatch('[A-Za-z0-9._/-]{1,240}', name) or name.startswith('/') or any(p in ('', '.', '..') for p in name.split('/')):
            raise RuntimeError('source-code-literal-path')
    if OLD + 'source-paths.js' not in names or OLD + 'supervise.py' not in names or OLD + 'run.mjs' not in names:
        raise RuntimeError('source-code-literal-closure')
    return names

def source_snapshot():
    # Parse the SAME checked source bytes. No JS is executed or imported here.
    literal = bounded_bytes(REPO / OLD / 'source-paths.js')
    names = parse_source_names(literal)
    paths = {name: REPO / name for name in names}
    files = total = 0
    def walk(directory, depth=0):
        nonlocal files, total
        info = directory.lstat()
        if depth > 8 or getattr(info, 'st_file_attributes', 0) & 0x400 or not stat.S_ISDIR(info.st_mode) or directory.is_symlink() or directory.resolve() != directory:
            raise RuntimeError('package-tree-unverifiable')
        children = sorted(directory.iterdir(), key=lambda p: p.name)
        if len(children) > 128:
            raise RuntimeError('package-tree-capacity')
        for path in children:
            info = path.lstat()
            if getattr(info, 'st_file_attributes', 0) & 0x400 or path.is_symlink() or path.resolve() != path:
                raise RuntimeError('package-tree-unverifiable')
            if stat.S_ISDIR(info.st_mode):
                walk(path, depth + 1)
            elif stat.S_ISREG(info.st_mode):
                files += 1
                total += info.st_size
                if files > 128 or total > 16 * MIB or not 0 < info.st_size <= 4 * MIB:
                    raise RuntimeError('package-tree-capacity')
                paths[PACKAGE_PREFIX + path.relative_to(PACKAGE_ROOT).as_posix()] = path
            else:
                raise RuntimeError('package-tree-unverifiable')
    walk(PACKAGE_ROOT)
    if files != 115 or total != 13656167 or len(paths) != 187 or len(paths) > 256:
        raise RuntimeError('reviewed-source-count-mismatch')
    hashes, buffers = {}, {}
    for name, path in paths.items():
        data = literal if name == OLD + 'source-paths.js' else bounded_bytes(path)
        hashes[name], buffers[name] = sha(data), data
    # Fresh exact check fences drift of the literal during the inventory.
    if bounded_bytes(REPO / OLD / 'source-paths.js') != literal:
        raise RuntimeError('source-code-literal-drift')
    pkg = strict_json(buffers[PACKAGE_PREFIX + 'package.json'])
    lock = strict_json(buffers[DEV + 'package-lock.json'])
    if pkg.get('name') != 'playwright-core' or pkg.get('version') != '1.64.1' or lock.get('packages', {}).get('node_modules/playwright-core', {}).get('integrity') != PACKAGE_INTEGRITY:
        raise RuntimeError('reviewed-package-identity')
    old_bytes = bounded_bytes(REPO / OLD_FREEZE, 65536)
    if sha(old_bytes) != OLD_FREEZE_SHA:
        raise RuntimeError('immutable-old-freeze-drift')
    old_freeze = strict_json(old_bytes)
    if type(old_freeze) is not dict or old_freeze.get('schema') != 'native-reader-root-transfer-freeze/v1':
        raise RuntimeError('immutable-old-freeze-schema')
    # Fixed hashes compare the actual literal CODE/package inventory, never
    # follow old artifactHashes/sourceHashes JSON keys as paths.
    if type(old_freeze.get('sourceHashes')) is not dict or list(old_freeze['sourceHashes']) != list(hashes) or old_freeze['sourceHashes'] != hashes:
        raise RuntimeError('immutable-old-source-drift')
    for name in NEW_SOURCE_PATHS:
        if name in hashes:
            raise RuntimeError('new-source-key-collision')
        hashes[name] = sha(bounded_bytes(REPO / name))
    hashes[OLD_FREEZE] = sha(old_bytes)
    if len(hashes) != 195 or len(hashes) > 256:
        raise RuntimeError('reviewed-full-source-count-mismatch')
    if bounded_bytes(REPO / OLD_FREEZE, 65536) != old_bytes:
        raise RuntimeError('immutable-old-freeze-read-drift')
    return hashes

def validate_freeze(value, sources):
    f = exact_fields(value, ['schema', 'sourceHashes', 'protocolSha256', 'oldFreezeSha256', 'freezeHash'])
    if f['schema'] != 'native-extension-startup-dev-freeze/v1':
        raise RuntimeError('freeze-schema')
    material = {k: v for k, v in f.items() if k != 'freezeHash'}
    if sha(ordered_json(material)) != hash_value(f['freezeHash']):
        raise RuntimeError('freeze-selfhash')
    if type(f['sourceHashes']) is not dict or list(f['sourceHashes']) != list(sources) or f['sourceHashes'] != sources:
        raise RuntimeError('freeze-source-mismatch')
    if f['protocolSha256'] != sources[OWN + 'protocol.json'] or f['oldFreezeSha256'] != OLD_FREEZE_SHA:
        raise RuntimeError('freeze-linkage')
    return f

def validate_between_request(value, freeze_sha):
    r = exact_fields(value, ['schema', 'freezeSha256', 'firstVariantHash'])
    if r['schema'] != 'native-startup-between-contexts-request/v1' or r['freezeSha256'] != freeze_sha:
        raise RuntimeError('between-request-linkage')
    hash_value(r['firstVariantHash'])
    return r

def validate_variant_marker(value, freeze_sha, index):
    r = exact_fields(value, ['schema', 'freezeSha256', 'variantIndex'])
    if r['schema'] != 'native-startup-variant-started/v1' or r['freezeSha256'] != freeze_sha or type(r['variantIndex']) is not int or r['variantIndex'] != index:
        raise RuntimeError('variant-marker-linkage')
    return r

def variant_deadline(first_observed, now):
    if first_observed is None:
        return None
    elapsed = now - first_observed
    if elapsed < 0 or elapsed >= VARIANT_LIMIT:
        raise RuntimeError('owned-variant-deadline')
    return elapsed

def only_original_node(members, original_pid):
    count(original_pid, 0xffffffff, 1)
    return members.assigned == 1 and members.listed == 1 and list(members.pids[:members.listed]) == [original_pid]

def confirmed_node_exit(members, exit_code):
    # Not a success verdict: outside wait/exitCode==0 and normal Job drain still
    # run. Empty Job alone, or an exited Node with descendants, proves neither.
    return members.assigned == 0 and members.listed == 0 and exit_code is not None

def make_between_ack(request_sha, original_pid, freeze_sha):
    hash_value(request_sha)
    hash_value(freeze_sha)
    count(original_pid, 0xffffffff, 1)
    return {'schema':'native-startup-between-contexts-ack/v1', 'requestSha256':request_sha, 'originalNodePid':original_pid,
        'browserDescendantsAbsent':True, 'freezeSha256':freeze_sha}

STAGES = ['launch', 'blank-anchor', 'http-deny', 'socket-deny', 'browser-cdp', 'download-deny', 'extension-load',
    'worker-lookup', 'target-census', 'worker-wait', 'native-api', 'native-window', 'begin-study', 'end-study', 'close-context', 'close-browser']

def milliseconds(value, maximum):
    if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= maximum:
        raise RuntimeError('result-time')
    return value

def validate_variant(value, variant):
    v = exact_fields(value, ['variant', 'status', 'failure', 'workerObservation', 'nativeApiPresent', 'windowMetadata', 'beginEndCompleted', 'census',
        'events', 'contextCloseAttempts', 'browserCloseAttempts', 'contextClosed', 'browserClosed', 'physicalOperationsDrained', 'callbacksDrained', 'pending', 'elapsedMs'])
    if v['variant'] != variant or v['status'] not in ('completed', 'incompatible'):
        raise RuntimeError('variant-result')
    if v['workerObservation'] not in ('observed', 'not-observed-within-8s', 'not-reached'):
        raise RuntimeError('worker-observation')
    for key in ('nativeApiPresent', 'beginEndCompleted', 'contextClosed', 'browserClosed', 'physicalOperationsDrained', 'callbacksDrained'):
        if type(v[key]) is not bool:
            raise RuntimeError('variant-boolean')
    if v['physicalOperationsDrained'] is not True or v['callbacksDrained'] is not True or type(v['pending']) is not int or v['pending'] != 0:
        raise RuntimeError('variant-unsettled')
    count(v['events'], 4096)
    count(v['contextCloseAttempts'], 1)
    count(v['browserCloseAttempts'], 1)
    milliseconds(v['elapsedMs'], 45000)
    failure = v['failure']
    if v['status'] == 'completed':
        if failure is not None or v['beginEndCompleted'] is not True:
            raise RuntimeError('variant-completion')
    else:
        failure = exact_fields(failure, ['stage', 'safeClass'])
        if failure['stage'] not in STAGES or failure['stage'] in ('close-context', 'close-browser') or failure['safeClass'] not in ('native-api-error', 'native-timeout', 'native-api-unavailable'):
            raise RuntimeError('variant-failure-projection')
        if failure['safeClass'] == 'native-api-unavailable' and (failure['stage'] != 'native-api' or v['nativeApiPresent'] is not False):
            raise RuntimeError('variant-api-unavailable')
    expected_close = 0 if failure is not None and failure['stage'] == 'launch' else 1
    if v['contextCloseAttempts'] != expected_close or v['browserCloseAttempts'] != expected_close or v['contextClosed'] != bool(expected_close) or v['browserClosed'] != bool(expected_close):
        raise RuntimeError('variant-cleanup')
    if v['nativeApiPresent'] or v['beginEndCompleted']:
        if v['workerObservation'] != 'observed':
            raise RuntimeError('native-worker-linkage')
    if v['beginEndCompleted'] and (not v['nativeApiPresent'] or v['windowMetadata'] is None):
        raise RuntimeError('native-begin-end-linkage')
    if v['windowMetadata'] is not None:
        w = exact_fields(v['windowMetadata'], ['windowId', 'type', 'incognito', 'focused'])
        count(w['windowId'], 9007199254740991)
        if w['type'] not in ('normal', 'popup', 'panel', 'app', 'devtools') or type(w['incognito']) is not bool or type(w['focused']) is not bool or not v['nativeApiPresent']:
            raise RuntimeError('native-window-metadata')
    if v['census'] is not None:
        c = exact_fields(v['census'], ['targets', 'blankPages', 'ownExtensionWorkers', 'otherTargets', 'ownExtensionEquality'])
        count(c['targets'], 128, 1)
        count(c['ownExtensionWorkers'], 1)
        if type(c['blankPages']) is not int or c['blankPages'] != 1 or type(c['otherTargets']) is not int or c['otherTargets'] != 0 or c['ownExtensionEquality'] is not True:
            raise RuntimeError('native-target-census')
    return v

def validate_result(value, frozen, freeze_sha, sources, request, request_sha, ack_sha):
    r = exact_fields(value, ['schema', 'status', 'freezeHash', 'freezeSha256', 'protocolSha256', 'oldFreezeSha256', 'sourceHashes', 'variants', 'trace', 'barrier',
        'sourceHashesRechecked', 'stageBytesRechecked', 'publicNavigations', 'observations', 'modelCalls', 'rawInputPersisted', 'completeOsEgressIsolation', 'productionValidated', 'assignmentAuthority', 'elapsedMs'])
    expected = {'schema':'native-extension-startup-dev-result/v1', 'status':'complete', 'freezeHash':frozen['freezeHash'], 'freezeSha256':freeze_sha,
        'protocolSha256':frozen['protocolSha256'], 'oldFreezeSha256':OLD_FREEZE_SHA, 'sourceHashes':sources,
        'sourceHashesRechecked':True, 'stageBytesRechecked':True, 'publicNavigations':0, 'observations':0, 'modelCalls':0,
        'rawInputPersisted':False, 'completeOsEgressIsolation':False, 'productionValidated':False, 'assignmentAuthority':False}
    for key, wanted in expected.items():
        if type(r[key]) is not type(wanted) or r[key] != wanted:
            raise RuntimeError('result-linkage')
    if list(r['sourceHashes']) != list(sources):
        raise RuntimeError('result-source-order')
    milliseconds(r['elapsedMs'], 165000)
    variants = r['variants']
    if type(variants) is not list or len(variants) != 2:
        raise RuntimeError('variant-denominator')
    for v, name in zip(variants, ('block', 'allow')):
        validate_variant(v, name)
    if sha(ordered_json(variants[0])) != request['firstVariantHash']:
        raise RuntimeError('first-variant-proof')
    b = exact_fields(r['barrier'], ['requestSha256', 'ackSha256'])
    if b['requestSha256'] != request_sha or b['ackSha256'] != ack_sha:
        raise RuntimeError('result-barrier-linkage')
    trace = r['trace']
    if type(trace) is not list or not 4 <= len(trace) <= 256 or len(trace) % 2:
        raise RuntimeError('operation-trace-capacity')
    seen = []
    for i in range(0, len(trace), 2):
        before = exact_fields(trace[i], ['variant', 'stage', 'event', 'safeClass'])
        after = exact_fields(trace[i + 1], ['variant', 'stage', 'event', 'safeClass'])
        if before['variant'] not in ('block', 'allow') or before['stage'] not in STAGES or before['event'] != 'before' or before['safeClass'] is not None:
            raise RuntimeError('operation-trace-before')
        if after['variant'] != before['variant'] or after['stage'] != before['stage'] or after['event'] != 'after' or after['safeClass'] not in (None, 'native-api-error', 'native-timeout'):
            raise RuntimeError('operation-trace-after')
        seen.append(before['variant'])
    if seen != sorted(seen, key=lambda name: 0 if name == 'block' else 1) or set(seen) != {'block', 'allow'}:
        raise RuntimeError('operation-trace-variant-order')
    for name in ('block', 'allow'):
        if not any(row['variant'] == name and row['stage'] == 'launch' for row in trace):
            raise RuntimeError('operation-trace-launch')
    for v in variants:
        after = [row for row in trace if row['variant'] == v['variant'] and row['event'] == 'after']
        for stage, key in (('close-context', 'contextCloseAttempts'), ('close-browser', 'browserCloseAttempts')):
            rows = [row for row in after if row['stage'] == stage]
            if len(rows) != v[key] or any(row['safeClass'] is not None for row in rows):
                raise RuntimeError('operation-trace-cleanup')
        if v['beginEndCompleted']:
            for stage in ('begin-study', 'end-study'):
                if sum(row['stage'] == stage and row['safeClass'] is None for row in after) != 1:
                    raise RuntimeError('operation-trace-begin-end')
        if v['failure'] is not None:
            f = v['failure']
            wanted = None if f['safeClass'] == 'native-api-unavailable' else f['safeClass']
            if not any(row['stage'] == f['stage'] and row['safeClass'] == wanted for row in after):
                raise RuntimeError('operation-trace-failure')
    return True

def end_identity(initial_sources, initial_freeze_sha):
    if source_snapshot() != initial_sources or sha(bounded_bytes(HERE / 'freeze.json', 65536)) != initial_freeze_sha:
        raise RuntimeError('startup-source-or-freeze-drift')

# Only an explicitly reviewed --run-dev reaches fixed-file preflight.
try:
    headroom()
    source_hashes = source_snapshot()
    freeze_bytes = bounded_bytes(HERE / 'freeze.json', 65536)
    freeze_sha = sha(freeze_bytes)
    frozen = validate_freeze(strict_json(freeze_bytes), source_hashes)
    node = shutil.which('node')
    if not node:
        raise RuntimeError('node-unavailable')
except Exception:
    raise SystemExit('Fixed study preflight unavailable') from None

OUTPUT.mkdir()  # Exclusive, retained on failure. Never delete or replay.
paths = {name: OUTPUT / suffix for name, suffix in [
    ('marker', 'supervisor.started.json'), ('stdout', 'stdout.log'), ('stderr', 'stderr.log'),
    ('receipt', 'supervisor.json'), ('result', 'result.json'),
    ('between_request', 'between-contexts.request.json'), ('between_ack', 'between-contexts.ack.json'),
    ('between_ack_pending', 'between-contexts.ack.pending'), ('variant1', 'variant-1.started.json'), ('variant2', 'variant-2.started.json')]}

marker = {'schema':'native-extension-startup-dev-supervisor-started/v1', 'freezeSha256':freeze_sha,
    'sourceHashes':source_hashes, 'oldFreezeSha256':OLD_FREEZE_SHA, 'noAutomaticRepeat':True}
marker_wire = ordered_json(marker)
output_bounds(len(marker_wire) + 65536)
with paths['marker'].open('xb') as out:
    out.write(marker_wire)

job = process_handle = child = None
reason = cleanup_reason = None
cleanup_confirmed = emergency_own_job_termination = False
source_hashes_rechecked = old_freeze_rechecked = False
peak_rss = peak_private = peak_pids = peak_profile_bytes = peak_profile_entries = 0
result_sha = None
request = request_bytes = request_sha = ack_bytes = ack_sha = None
drain_deadline = None
variant_started = [None, None]
variant_marker_hashes = [None, None]
first_variant_elapsed = None
second_variant_elapsed = None
with paths['stdout'].open('xb') as stdout_log, paths['stderr'].open('xb') as stderr_log:
    try:
        job = kernel.CreateJobObjectW(None, None)
        if not job:
            raise RuntimeError('job-creation-failed')
        limits = ExtendedLimits()
        limits.basic.limitFlags = 0x2000 | 0x200  # KILL_ON_JOB_CLOSE | JOB_MEMORY, no breakaway.
        limits.jobMemoryLimit = MEMORY_LIMIT
        if not kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            raise RuntimeError('job-resource-limit-failed')
        allowed = {'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT'}
        env = {key: value for key, value in os.environ.items() if key.upper() in allowed}
        temp = OUTPUT / 'temp'
        temp.mkdir()
        info = temp.lstat()
        if getattr(info, 'st_file_attributes', 0) & 0x400 or not stat.S_ISDIR(info.st_mode) or temp.is_symlink() or temp.resolve() != temp:
            raise RuntimeError('owned-temp-unverifiable')
        env.update({'TEMP':str(temp), 'TMP':str(temp), 'MURMINGLE_NATIVE_EXTENSION_STARTUP_DEV_V1_SUPERVISED':'1',
            'OMP_NUM_THREADS':'1', 'UV_THREADPOOL_SIZE':'1'})
        child = subprocess.Popen([node, '--max-old-space-size=256', str(TARGET), '--run-dev'],
            cwd=HERE, env=env, creationflags=subprocess.CREATE_NO_WINDOW,
            stdin=subprocess.PIPE, stdout=stdout_log, stderr=stderr_log)
        process_handle = kernel.OpenProcess(0x0100 | 0x0001 | 0x1000, False, child.pid)
        if not process_handle or not kernel.AssignProcessToJobObject(job, process_handle):
            raise RuntimeError('node-job-assignment-failed')
        child.stdin.write(b'NATIVE_EXTENSION_STARTUP_DEV_JOB_ASSIGNED_V1\n')
        child.stdin.flush()
        child.stdin.close()  # Variant2 requires a separate fixed Node-only Job ACK.
        while child.poll() is None:
            now = time.monotonic()
            variant_deadline(variant_started[0] if ack_sha is None else variant_started[1], now)
            headroom()
            rss, private, pids = tree_memory(job)
            peak_rss, peak_private, peak_pids = max(peak_rss, rss), max(peak_private, private), max(peak_pids, pids)
            profile_bytes, profile_entries = output_bounds(65536)
            peak_profile_bytes, peak_profile_entries = max(peak_profile_bytes, profile_bytes), max(peak_profile_entries, profile_entries)
            if rss > MEMORY_LIMIT or private > MEMORY_LIMIT or now - started > ACTIVE_LIMIT:
                raise RuntimeError('owned-job-resource-budget-exceeded')
            members = job_members(job)
            for i, key in enumerate(('variant1', 'variant2')):
                if paths[key].exists() or paths[key].is_symlink():
                    wire = bounded_bytes(paths[key], 4096)
                    validate_variant_marker(strict_json(wire), freeze_sha, i + 1)
                    if variant_marker_hashes[i] is None:
                        if i == 1 and ack_sha is None:
                            raise RuntimeError('second-variant-before-ack')
                        variant_marker_hashes[i] = sha(wire)
                        variant_started[i] = time.monotonic()
                    elif sha(wire) != variant_marker_hashes[i]:
                        raise RuntimeError('variant-marker-drift')
                elif variant_marker_hashes[i] is not None:
                    raise RuntimeError('variant-marker-removed')
            variant_deadline(variant_started[0] if ack_sha is None else variant_started[1], time.monotonic())
            if variant_marker_hashes[0] is None and not only_original_node(members, child.pid):
                if confirmed_node_exit(members, child.poll()):
                    break
                raise RuntimeError('descendant-before-first-variant-marker')
            if ack_sha is not None:
                # Descendants are allowed again ONLY for the fixed second
                # variant. This is not ADR150's no-model-descendants rule.
                if variant_marker_hashes[1] is None and not only_original_node(members, child.pid):
                    if confirmed_node_exit(members, child.poll()):
                        break
                    raise RuntimeError('descendant-before-second-variant-marker')
                if sha(bounded_bytes(paths['between_request'], 4096)) != request_sha or sha(bounded_bytes(paths['between_ack'], 4096)) != ack_sha:
                    raise RuntimeError('between-evidence-drift')
            else:
                if paths['between_ack'].exists() or paths['between_ack'].is_symlink():
                    raise RuntimeError('unexpected-between-ack')
                if paths['between_request'].exists() or paths['between_request'].is_symlink():
                    if variant_started[0] is None:
                        raise RuntimeError('between-request-before-first-marker')
                    if drain_deadline is None:
                        drain_deadline = time.monotonic() + DRAIN_LIMIT
                    data = bounded_bytes(paths['between_request'], 4096)
                    if request_bytes is None:
                        request_bytes = data
                        request = validate_between_request(strict_json(data), freeze_sha)
                        request_sha = sha(data)
                    elif data != request_bytes:
                        raise RuntimeError('between-request-drift')
                    if time.monotonic() >= drain_deadline:
                        raise RuntimeError('between-contexts-deadline')
                    if only_original_node(members, child.pid):
                        end_identity(source_hashes, freeze_sha)
                        variant_deadline(variant_started[0], time.monotonic())
                        if time.monotonic() >= drain_deadline or not only_original_node(job_members(job), child.pid):
                            raise RuntimeError('between-contexts-unconfirmed')
                        ack_bytes = ordered_json(make_between_ack(request_sha, child.pid, freeze_sha))
                        output_bounds(len(ack_bytes) + 65536)
                        with paths['between_ack_pending'].open('xb') as out:
                            out.write(ack_bytes)
                        os.link(paths['between_ack_pending'], paths['between_ack'])
                        ack_sha = sha(ack_bytes)
                        first_variant_elapsed = variant_deadline(variant_started[0], time.monotonic())
            time.sleep(.05)
        child.wait()
        second_variant_elapsed = variant_deadline(variant_started[1], time.monotonic())
        if child.returncode != 0:
            raise RuntimeError('owned-child-failed')
        if not normal_job_drain(job):
            raise RuntimeError('surviving-descendants-after-normal-child-exit')
        if ack_sha is None or any(value is None for value in variant_marker_hashes):
            raise RuntimeError('between-contexts-or-variants-not-acknowledged')
        if time.monotonic() - started > WALL_LIMIT:
            raise RuntimeError('owned-wall-budget-exceeded')
    except Exception as error:
        reason = str(error) if isinstance(error, RuntimeError) else 'supervisor-failed'
    finally:
        cleanup_deadline = time.monotonic() + 5
        try:
            if job:
                remaining = job_members(job)
                if remaining.assigned != 0 or remaining.listed != 0:
                    emergency_own_job_termination = True
                    reason = reason or 'emergency-own-job-termination-required'
                    if not kernel.TerminateJobObject(job, 1):
                        cleanup_reason = 'own-job-termination-unverifiable'
            if child is not None and child.poll() is None:
                child.kill()  # Only our exact Popen Node, including assignment failure.
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
                kernel.CloseHandle(job)
        reason = reason or cleanup_reason
    try:
        output_bounds(65536)
        profile_bytes, profile_entries = owned_tree_metadata(OUTPUT)
        peak_profile_bytes, peak_profile_entries = max(peak_profile_bytes, profile_bytes), max(peak_profile_entries, profile_entries)
        end_identity(source_hashes, freeze_sha)
        source_hashes_rechecked = old_freeze_rechecked = True
        if reason is None:
            for i, key in enumerate(('variant1', 'variant2')):
                if sha(bounded_bytes(paths[key], 4096)) != variant_marker_hashes[i]:
                    raise RuntimeError('final-variant-marker-drift')
            if sha(bounded_bytes(paths['between_request'], 4096)) != request_sha or sha(bounded_bytes(paths['between_ack'], 4096)) != ack_sha:
                raise RuntimeError('final-drain-evidence-drift')
            result_bytes = bounded_bytes(paths['result'], 128 * 1024)
            result_sha = sha(result_bytes)
            validate_result(strict_json(result_bytes), frozen, freeze_sha, source_hashes, request, request_sha, ack_sha)
    except Exception as error:
        reason = reason or (str(error) if isinstance(error, RuntimeError) else 'final-evidence-unverifiable')
    if time.monotonic() - started > WALL_LIMIT:
        reason = reason or 'owned-total-wall-budget-exceeded'
    receipt = {'schema':'native-extension-startup-dev-supervisor/v1', 'phase':PHASE, 'reason':reason,
        'freezeSha256':freeze_sha, 'freezeHash':frozen['freezeHash'], 'protocolSha256':frozen['protocolSha256'], 'oldFreezeSha256':OLD_FREEZE_SHA,
        'childPid':child.pid if child else None, 'exitCode':child.returncode if child else None, 'sourceHashes':source_hashes,
        'elapsedSeconds':time.monotonic() - started, 'sampledPeakTreeRssBytes':peak_rss,
        'sampledPeakTreePrivateBytes':peak_private, 'sampledPeakTreeProcesses':peak_pids, 'jobMemoryLimitBytes':MEMORY_LIMIT,
        'ownTreeCleanupConfirmed':cleanup_confirmed, 'cleanupReason':cleanup_reason, 'emergencyOwnJobTermination':emergency_own_job_termination,
        'sampledPeakOwnedOutputBytes':peak_profile_bytes, 'sampledPeakOwnedOutputEntries':peak_profile_entries,
        'ownedOutputByteLimit':PROFILE_MAX_BYTES, 'ownedOutputEntryLimit':PROFILE_MAX_ENTRIES,
        'sourceHashesRechecked':source_hashes_rechecked, 'oldFreezeRechecked':old_freeze_rechecked,
        'betweenContextsConfirmed':ack_sha is not None, 'betweenRequestSha256':request_sha, 'betweenAckSha256':ack_sha,
        'betweenOriginalNodePid':child.pid if ack_sha is not None else None,
        'variantMarkerSha256':variant_marker_hashes, 'firstVariantObservedElapsedSeconds':first_variant_elapsed,
        'secondVariantObservedElapsedSeconds':second_variant_elapsed,
        'variantLimitSeconds':VARIANT_LIMIT, 'variantDeadlineBasis':'first-supervisor-observed-fixed-marker',
        'resultSha256':result_sha if reason is None else None,
        'noPublicNavigation':True, 'noNativeContentRead':True, 'noModelCalls':True, 'noCanonicalWrites':True,
        'productionValidated':False, 'assignmentAuthority':False}
    wire = ordered_json(receipt)
    if len(wire) > 65536:
        raise SystemExit('Bounded supervisor receipt unavailable')
    try:
        output_bounds(len(wire))
        with paths['receipt'].open('xb') as out:
            out.write(wire)
    except RuntimeError:
        print(json.dumps({'schema':'native-extension-startup-dev-supervisor/v1', 'reason':'supervisor-evidence-capacity',
            'exitCode':child.returncode if child else None, 'ownTreeCleanupConfirmed':cleanup_confirmed,
            'emergencyOwnJobTermination':emergency_own_job_termination}), flush=True)
        raise SystemExit(1)
    print(wire.decode('utf8'), flush=True)
    raise SystemExit(0 if reason is None else 1)
