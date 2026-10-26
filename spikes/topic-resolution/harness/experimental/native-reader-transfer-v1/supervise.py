"""Default inert. ADR150 fixed owned-Job native-root study guardian; source only."""
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
import re
import stat
from pathlib import Path
import shutil
import subprocess
import sys
import time

if len(sys.argv) == 1:
    print('No action. Explicit --run-study, reviewed freeze and separate approval required.')
    raise SystemExit(0)
if sys.platform != 'win32' or len(sys.argv) != 2 or sys.argv[1] != '--run-study':
    raise SystemExit('Only the fixed supervised Windows native study is supported')

PHASE = 'native-root-transfer'
WALL_LIMIT = 1800
ACTIVE_LIMIT = 1700
DRAIN_LIMIT = 30
MODEL_LIMIT = 180
MIB = 1048576
MEMORY_LIMIT = 1536 * MIB
MAX_BYTES = 1048576
PROFILE_MAX_BYTES = 512 * MIB
PROFILE_MAX_ENTRIES = 8192
started = time.monotonic()
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
OWN = 'spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/'
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
FIT = 'apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/'
# Literal reviewed CODE paths only; no paths are followed from evidence JSON.
ARTIFACT_FILES = {
    'freezeBytes': (FIT + 'freeze.json', 65536, 'ddee567ad132299dc130f01da77d77bae3fd18a7ad7c222a276de1384ef9c894'),
    'supervisorBytes': (FIT + 'output/supervisor.json', 65536, 'c5b1073a5cf9c71412e0d43488ecae008474b39276c5a43c67bec8efd7ee766e'),
    'selectionReceiptBytes': (FIT + 'output/selection-receipt.json', 65536, '88b87fc555c4e456bfb1a7ab23c93fcffa75de8d51b453df0f861324e3a0ae4f'),
    'selectionBytes': (FIT + 'output/selection.json', 262144, 'd5bc132ac6182046830822f98e16710b5a8ccad176a461f8e8613fde5661e0de'),
    'modelBytes': (FIT + 'output/root-model.json', 262144, '442ceb797e071f13ea4bc25df701846d2f167a7deb3e60de31711da8bdec7451'),
    'policyBytes': (FIT + 'output/root-policy.json', 65536, '309afc18b29695640f4f15d8138d75ad002768f4e0b13d47df902e3d8bb6b546'),
    'inputDefinitionBytes': (FIT + 'output/input-definition.json', 16384, '2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'),
    'candidate': ('apps/local-service/data/hierarchy-current-producer-transfer-candidates-adr143.json', 65536, 'd6843c87347a111277c04baf65062cf246ccd75fc883631d8c69e31563288052'),
    'labelSeal': ('apps/local-service/data/hierarchy-current-producer-transfer-label-seal-adr143.json', 65536, 'a138f586f3590bf4b3c3158a2902d4187967f40de38703a981eae72335db8101'),
    'packageBaseline': ('spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/freeze.json', 65536, '908ed69a9b1e42ed6fb0de7ac0d0862ffb5fe8964cf368701cb442085e1091bb'),
    'assetManifest': ('spikes/topic-resolution/browser/embedding/.assets/manifest.json', 16384, None)
}

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
    if paths['result'].exists() and paths['result'].stat().st_size > 512 * 1024:
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
    if OWN + 'source-paths.js' not in names or OWN + 'supervise.py' not in names or OWN + 'run.mjs' not in names:
        raise RuntimeError('source-code-literal-closure')
    return names

def source_snapshot():
    # Parse the SAME checked source bytes. No JS is executed or imported here.
    literal = bounded_bytes(HERE / 'source-paths.js')
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
        data = literal if name == OWN + 'source-paths.js' else bounded_bytes(path)
        hashes[name], buffers[name] = sha(data), data
    # Fresh exact check fences drift of the literal during the inventory.
    if bounded_bytes(HERE / 'source-paths.js') != literal:
        raise RuntimeError('source-code-literal-drift')
    pkg = strict_json(buffers[PACKAGE_PREFIX + 'package.json'])
    lock = strict_json(buffers[DEV + 'package-lock.json'])
    if pkg.get('name') != 'playwright-core' or pkg.get('version') != '1.64.1' or lock.get('packages', {}).get('node_modules/playwright-core', {}).get('integrity') != PACKAGE_INTEGRITY:
        raise RuntimeError('reviewed-package-identity')
    return hashes

def artifact_snapshot():
    hashes = {}
    for path, maximum, pinned in ARTIFACT_FILES.values():
        value = sha(bounded_bytes(REPO / path, maximum))
        if pinned is not None and value != pinned:
            raise RuntimeError('fixed-artifact-drift')
        hashes[path] = value
    return hashes

def validate_freeze(value, sources, artifacts, reuse_sha):
    f = exact_fields(value, ['schema', 'sourceHashes', 'artifactHashes', 'protocolSha256', 'artifactReuseReceiptSha256', 'targetProfile', 'encoderHash', 'freezeHash'])
    if f['schema'] != 'native-reader-root-transfer-freeze/v1':
        raise RuntimeError('freeze-schema')
    material = {k: v for k, v in f.items() if k != 'freezeHash'}
    if sha(ordered_json(material)) != hash_value(f['freezeHash']):
        raise RuntimeError('freeze-selfhash')
    if type(f['sourceHashes']) is not dict or list(f['sourceHashes']) != list(sources) or f['sourceHashes'] != sources:
        raise RuntimeError('freeze-source-mismatch')
    if type(f['artifactHashes']) is not dict or list(f['artifactHashes']) != list(artifacts) or f['artifactHashes'] != artifacts:
        raise RuntimeError('freeze-artifact-mismatch')
    if f['protocolSha256'] != sources[OWN + 'protocol.json'] or f['artifactReuseReceiptSha256'] != reuse_sha:
        raise RuntimeError('freeze-linkage')
    profile = exact_fields(f['targetProfile'], ['schema', 'producerId', 'inputConstructionHash', 'extractorVersions', 'effectiveTitleRule', 'producerProfileHash'])
    if profile['schema'] != 'native-root-target-producer-profile/v1' or profile['producerId'] != 'native-browser-current' or profile['effectiveTitleRule'] != 'trim-or-hostname/v1':
        raise RuntimeError('freeze-profile')
    if profile['extractorVersions'] != ['article-container-prefix/v1', 'main-text-prefix/v1']:
        raise RuntimeError('freeze-extractors')
    for key in ('inputConstructionHash', 'producerProfileHash'):
        hash_value(profile[key])
    if sha(ordered_json({key: v for key, v in profile.items() if key != 'producerProfileHash'})) != profile['producerProfileHash']:
        raise RuntimeError('freeze-profile-selfhash')
    hash_value(f['encoderHash'])
    return f

def validate_drain_request(value, freeze_sha, profile_hash):
    r = exact_fields(value, ['schema', 'freezeSha256', 'captureHash', 'accounted', 'available', 'producerProfileHash'])
    if r['schema'] != 'native-root-browser-drain-request/v1' or r['freezeSha256'] != freeze_sha or r['producerProfileHash'] != profile_hash:
        raise RuntimeError('drain-request-linkage')
    if type(r['accounted']) is not int or r['accounted'] != 32:
        raise RuntimeError('drain-request-denominator')
    count(r['available'], 32)
    hash_value(r['captureHash'])
    return r

def only_original_node(members, original_pid):
    count(original_pid, 0xffffffff, 1)
    return members.assigned == 1 and members.listed == 1 and list(members.pids[:members.listed]) == [original_pid]

def confirmed_node_exit(members, exit_code):
    # Not a success verdict: outside wait/exitCode==0 and normal Job drain still
    # run. Empty Job alone, or an exited Node with descendants, proves neither.
    return members.assigned == 0 and members.listed == 0 and exit_code is not None

def make_drain_ack(request_sha, original_pid, freeze_sha):
    hash_value(request_sha)
    hash_value(freeze_sha)
    count(original_pid, 0xffffffff, 1)
    return {'schema':'native-root-browser-drain-ack/v1', 'requestSha256':request_sha, 'originalNodePid':original_pid,
        'browserDescendantsAbsent':True, 'freezeSha256':freeze_sha}

def model_phase_elapsed(first_request_at, now):
    if first_request_at is None:
        return None
    elapsed = now - first_request_at
    if elapsed < 0 or elapsed >= MODEL_LIMIT:
        raise RuntimeError('owned-model-phase-deadline')
    return elapsed

def validate_result(value, frozen, freeze_sha, sources, artifacts, request, request_sha, ack_sha):
    if type(value) is not dict:
        raise RuntimeError('result-contract')
    expected = {'schema':'native-root-study-result/v1', 'status':'complete', 'freezeHash':frozen['freezeHash'],
        'freezeSha256':freeze_sha, 'protocolSha256':frozen['protocolSha256'],
        'artifactReuseReceiptSha256':frozen['artifactReuseReceiptSha256'], 'sourceHashes':sources, 'artifactHashes':artifacts,
        'drainRequestSha256':request_sha, 'drainAckSha256':ack_sha, 'captureHash':request['captureHash'],
        'producerProfileHash':frozen['targetProfile']['producerProfileHash'], 'rawInputPersisted':False,
        'rawInputRetained':False, 'vectorInputsPersisted':False, 'productionValidated':False, 'assignmentAuthority':False}
    expected.update({'sourceHashesRechecked':True, 'assetHashesRechecked':True, 'stageBytesRechecked':True})
    for key, wanted in expected.items():
        if key not in value or type(value[key]) is not type(wanted) or value[key] != wanted:
            raise RuntimeError('result-linkage')
    if type(value.get('capture')) is not dict or type(value['capture'].get('accounted')) is not int or value['capture']['accounted'] != 32 or type(value['capture'].get('available')) is not int or value['capture']['available'] != request['available']:
        raise RuntimeError('result-capture-linkage')
    outcomes = value.get('outcomes')
    if type(outcomes) is not list or len(outcomes) != 32:
        raise RuntimeError('result-denominator')
    for index, row in enumerate(outcomes):
        if type(row) is not dict or row.get('caseId') != 'producer-transfer-' + str(index + 1).zfill(3) or type(row.get('ordinal')) is not int or row['ordinal'] != index + 1 or row.get('status') not in ('classified', 'unavailable'):
            raise RuntimeError('result-outcomes')
    if sum(row['status'] == 'classified' for row in outcomes) != request['available']:
        raise RuntimeError('result-available-denominator')
    count(value.get('encoderCalls'), 64)
    if value['encoderCalls'] != request['available'] * 2:
        raise RuntimeError('result-encoder-denominator')
    return True

def end_identity(initial_sources, initial_artifacts, initial_freeze_sha, initial_reuse_sha):
    if source_snapshot() != initial_sources or artifact_snapshot() != initial_artifacts or sha(bounded_bytes(HERE / 'freeze.json', 65536)) != initial_freeze_sha or sha(bounded_bytes(HERE / 'artifact-reuse.json', 65536)) != initial_reuse_sha:
        raise RuntimeError('study-source-or-artifact-drift')

# Only an explicitly reviewed --run-study reaches fixed-file preflight.
try:
    headroom()
    source_hashes = source_snapshot()
    artifact_hashes = artifact_snapshot()
    freeze_bytes = bounded_bytes(HERE / 'freeze.json', 65536)
    freeze_sha = sha(freeze_bytes)
    reuse_sha = sha(bounded_bytes(HERE / 'artifact-reuse.json', 65536))
    frozen = validate_freeze(strict_json(freeze_bytes), source_hashes, artifact_hashes, reuse_sha)
    node = shutil.which('node')
    if not node:
        raise RuntimeError('node-unavailable')
except Exception:
    raise SystemExit('Fixed study preflight unavailable') from None

OUTPUT.mkdir()  # Exclusive, retained on failure. Never delete or replay.
paths = {name: OUTPUT / suffix for name, suffix in [
    ('marker', 'supervisor.started.json'), ('stdout', 'stdout.log'), ('stderr', 'stderr.log'),
    ('receipt', 'supervisor.json'), ('result', 'result.json'),
    ('drain_request', 'drain.request.json'), ('drain_ack', 'drain.ack.json'), ('drain_ack_pending', 'drain.ack.pending')]}
marker = {'schema':'native-root-study-supervisor-started/v1', 'freezeSha256':freeze_sha,
    'sourceHashes':source_hashes, 'artifactHashes':artifact_hashes, 'noAutomaticRepeat':True}
marker_wire = ordered_json(marker)
output_bounds(len(marker_wire) + 65536)
with paths['marker'].open('xb') as out:
    out.write(marker_wire)

job = process_handle = child = None
reason = cleanup_reason = None
cleanup_confirmed = emergency_own_job_termination = False
source_hashes_rechecked = artifact_hashes_rechecked = False
peak_rss = peak_private = peak_pids = peak_profile_bytes = peak_profile_entries = 0
result_sha = None
request = request_bytes = request_sha = ack_bytes = ack_sha = None
drain_deadline = None
model_started_at = None
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
        env.update({'TEMP':str(temp), 'TMP':str(temp), 'MURMINGLE_NATIVE_ROOT_TRANSFER_V1_SUPERVISED':'1',
            'OMP_NUM_THREADS':'1', 'UV_THREADPOOL_SIZE':'1'})
        child = subprocess.Popen([node, '--max-old-space-size=256', str(TARGET), '--run-study'],
            cwd=HERE, env=env, creationflags=subprocess.CREATE_NO_WINDOW,
            stdin=subprocess.PIPE, stdout=stdout_log, stderr=stderr_log)
        process_handle = kernel.OpenProcess(0x0100 | 0x0001 | 0x1000, False, child.pid)
        if not process_handle or not kernel.AssignProcessToJobObject(job, process_handle):
            raise RuntimeError('node-job-assignment-failed')
        child.stdin.write(b'NATIVE_ROOT_STUDY_JOB_ASSIGNED_V1\n')
        child.stdin.flush()
        child.stdin.close()  # Model-phase permission is a separate fixed file ACK.
        while child.poll() is None:
            model_phase_elapsed(model_started_at, time.monotonic())
            headroom()
            rss, private, pids = tree_memory(job)
            peak_rss, peak_private, peak_pids = max(peak_rss, rss), max(peak_private, private), max(peak_pids, pids)
            profile_bytes, profile_entries = output_bounds(65536)
            peak_profile_bytes, peak_profile_entries = max(peak_profile_bytes, profile_bytes), max(peak_profile_entries, profile_entries)
            if rss > MEMORY_LIMIT or private > MEMORY_LIMIT or time.monotonic() - started > ACTIVE_LIMIT:
                raise RuntimeError('owned-job-resource-budget-exceeded')
            members = job_members(job)
            if ack_sha is not None:
                if not only_original_node(members, child.pid):
                    if confirmed_node_exit(members, child.poll()):
                        break
                    raise RuntimeError('descendant-created-after-browser-drain')
                if sha(bounded_bytes(paths['drain_request'], 4096)) != request_sha or sha(bounded_bytes(paths['drain_ack'], 4096)) != ack_sha:
                    raise RuntimeError('drain-evidence-drift')
            else:
                if paths['drain_ack'].exists() or paths['drain_ack'].is_symlink():
                    raise RuntimeError('unexpected-drain-ack')
                if paths['drain_request'].exists() or paths['drain_request'].is_symlink():
                    if drain_deadline is None:
                        model_started_at = time.monotonic()
                        drain_deadline = model_started_at + DRAIN_LIMIT
                    data = bounded_bytes(paths['drain_request'], 4096)
                    if request_bytes is None:
                        request_bytes = data
                        request = validate_drain_request(strict_json(data), freeze_sha, frozen['targetProfile']['producerProfileHash'])
                        request_sha = sha(data)
                    elif data != request_bytes:
                        raise RuntimeError('drain-request-drift')
                    if time.monotonic() >= drain_deadline:
                        raise RuntimeError('browser-drain-deadline')
                    if only_original_node(members, child.pid):
                        # Check the entire actual fixed closure BEFORE permitting model loading.
                        end_identity(source_hashes, artifact_hashes, freeze_sha, reuse_sha)
                        model_phase_elapsed(model_started_at, time.monotonic())
                        if time.monotonic() >= drain_deadline or not only_original_node(job_members(job), child.pid):
                            raise RuntimeError('browser-drain-unconfirmed')
                        ack_bytes = ordered_json(make_drain_ack(request_sha, child.pid, freeze_sha))
                        output_bounds(len(ack_bytes) + 65536)
                        with paths['drain_ack_pending'].open('xb') as out:
                            out.write(ack_bytes)
                        # Closed tiny fixed pending file, atomic exclusive name
                        # publication on the same owned NTFS directory. Retain
                        # both names; never overwrite/retry/delete evidence.
                        os.link(paths['drain_ack_pending'], paths['drain_ack'])
                        ack_sha = sha(ack_bytes)
            time.sleep(.05)
        child.wait()
        model_phase_elapsed(model_started_at, time.monotonic())
        if child.returncode != 0:
            raise RuntimeError('owned-child-failed')
        if not normal_job_drain(job):
            raise RuntimeError('surviving-descendants-after-normal-child-exit')
        if ack_sha is None:
            raise RuntimeError('browser-drain-not-acknowledged')
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
        end_identity(source_hashes, artifact_hashes, freeze_sha, reuse_sha)
        model_phase_elapsed(model_started_at, time.monotonic())
        source_hashes_rechecked = artifact_hashes_rechecked = True
        if reason is None:
            if sha(bounded_bytes(paths['drain_request'], 4096)) != request_sha or sha(bounded_bytes(paths['drain_ack'], 4096)) != ack_sha:
                raise RuntimeError('final-drain-evidence-drift')
            result_bytes = bounded_bytes(paths['result'], 512 * 1024)
            result_sha = sha(result_bytes)
            validate_result(strict_json(result_bytes), frozen, freeze_sha, source_hashes, artifact_hashes, request, request_sha, ack_sha)
    except Exception as error:
        reason = reason or (str(error) if isinstance(error, RuntimeError) else 'final-evidence-unverifiable')
    if time.monotonic() - started > WALL_LIMIT:
        reason = reason or 'owned-total-wall-budget-exceeded'
    receipt = {'schema':'native-root-study-supervisor/v1', 'phase':PHASE, 'reason':reason,
        'freezeSha256':freeze_sha, 'freezeHash':frozen['freezeHash'], 'protocolSha256':frozen['protocolSha256'],
        'artifactReuseReceiptSha256':reuse_sha, 'childPid':child.pid if child else None, 'exitCode':child.returncode if child else None,
        'sourceHashes':source_hashes, 'artifactHashes':artifact_hashes,
        'elapsedSeconds':time.monotonic() - started, 'sampledPeakTreeRssBytes':peak_rss,
        'sampledPeakTreePrivateBytes':peak_private, 'sampledPeakTreeProcesses':peak_pids, 'jobMemoryLimitBytes':MEMORY_LIMIT,
        'ownTreeCleanupConfirmed':cleanup_confirmed, 'cleanupReason':cleanup_reason, 'emergencyOwnJobTermination':emergency_own_job_termination,
        'sampledPeakOwnedOutputBytes':peak_profile_bytes, 'sampledPeakOwnedOutputEntries':peak_profile_entries,
        'ownedOutputByteLimit':PROFILE_MAX_BYTES, 'ownedOutputEntryLimit':PROFILE_MAX_ENTRIES,
        'sourceHashesRechecked':source_hashes_rechecked, 'artifactHashesRechecked':artifact_hashes_rechecked,
        'browserDrainConfirmed':ack_sha is not None, 'drainRequestSha256':request_sha, 'drainAckSha256':ack_sha,
        'browserDrainOriginalNodePid':child.pid if ack_sha is not None else None,
        'modelPhaseElapsedSeconds':time.monotonic() - model_started_at if model_started_at is not None else None,
        'modelPhaseLimitSeconds':MODEL_LIMIT, 'modelPhaseStartBasis':'first-supervisor-observed-drain-request',
        'resultSha256':result_sha if reason is None else None,
        'noCanonicalWrites':True, 'noProviderCalls':True, 'rawInputPersistedByHarness':False,
        'productionValidated':False, 'assignmentAuthority':False}
    wire = ordered_json(receipt)
    if len(wire) > 65536:
        raise SystemExit('Bounded supervisor receipt unavailable')
    try:
        output_bounds(len(wire))
        with paths['receipt'].open('xb') as out:
            out.write(wire)
    except RuntimeError:
        print(json.dumps({'schema':'native-root-study-supervisor/v1', 'reason':'supervisor-evidence-capacity',
            'exitCode':child.returncode if child else None, 'ownTreeCleanupConfirmed':cleanup_confirmed,
            'emergencyOwnJobTermination':emergency_own_job_termination}), flush=True)
        raise SystemExit(1)
    print(wire.decode('utf8'), flush=True)
    raise SystemExit(0 if reason is None else 1)
