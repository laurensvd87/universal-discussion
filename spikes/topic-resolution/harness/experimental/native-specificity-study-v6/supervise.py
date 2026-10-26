"""ADR184 default-inert parent; only complete bounded Job lists are authority."""
import ctypes
from collections import deque
import hashlib
import json
import math
import os
from pathlib import Path
import queue
import re
import shutil
import stat
import subprocess
import sys
import threading
import time
import types

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
OWN = 'spikes/topic-resolution/harness/experimental/native-specificity-study-v6/'
DEV = 'spikes/topic-resolution/harness/experimental/playwright-dev-v1/'
PACKAGE_PREFIX = 'node_modules/playwright-core/'
PACKAGE = REPO / DEV / PACKAGE_PREFIX
NODE = 'C:/Program Files/nodejs/node.exe'
PACKAGE_BASELINE = 'spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/freeze.json'
PACKAGE_BASELINE_SHA = '908ed69a9b1e42ed6fb0de7ac0d0862ffb5fe8964cf368701cb442085e1091bb'
WORKSPACE = HERE / 'output'
LEGACY_WORKSPACE = HERE.parent / 'native-specificity-study-v1' / 'output'
SECOND_WORKSPACE = HERE.parent / 'native-specificity-study-v2' / 'output'
THIRD_WORKSPACE = HERE.parent / 'native-specificity-study-v3' / 'output'
FOURTH_WORKSPACE = HERE.parent / 'native-specificity-study-v4' / 'output'
FIFTH_WORKSPACE = HERE.parent / 'native-specificity-study-v5' / 'output'
STUDY_WORKSPACES = (LEGACY_WORKSPACE, SECOND_WORKSPACE, THIRD_WORKSPACE, FOURTH_WORKSPACE, FIFTH_WORKSPACE, WORKSPACE)
PREPARE_LEAF = 'prepare-r3'
REVIEWED_SOURCE_MAP = HERE / 'reviewed-sources-r3.json'
PREPARED_FREEZE = HERE / 'output' / PREPARE_LEAF / 'node-owned' / 'freeze.json'
TEST_AUDIT_PATHS = {
    'audit:selection-audit': HERE / 'output' / 'train-cal' / 'independent-audit.json',
    'audit:train-supervisor': HERE / 'output' / 'train-cal' / 'supervisor.json',
    'audit:train-result': HERE / 'output' / 'train-cal' / 'node-owned' / 'result.json',
    'audit:train-selection': HERE / 'output' / 'train-cal' / 'node-owned' / 'selection.json',
}
HANDSHAKE = b'NATIVE_SPECIFICITY_OWN_JOB_ASSIGNED_V1\n'
MIB = 1048576
HELPERS = {
    'native': 'spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/run.py',
    'baseline': 'spikes/topic-resolution/harness/experimental/native-console-baseline-dev-v1/baseline.py',
    'census': 'spikes/topic-resolution/harness/experimental/growing-owned-job-census-v1/census.py',
    'guardian': OWN + 'guardian.py',
}


def refuse(code):
    raise RuntimeError(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def wire(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf8')


def strict(data):
    def pairs(items):
        out = {}
        for key, value in items:
            if key in out:
                refuse('duplicate-key')
            out[key] = value
        return out
    value = json.loads(data.decode('utf8'), object_pairs_hook=pairs,
                       parse_constant=lambda _: refuse('nonfinite-json'))
    if wire(value) != data:
        refuse('noncanonical-json')
    return value


def strict_node_json(data):
    """Decode FILE-pinned Node result/selection bytes, not Python canonical JSON.

    V8 finite numeric spellings are not rewritten or used for Python semantic
    digests. Duplicate keys/nonfinite numbers and bounded shape still reject;
    exact outer field contracts remain enforced by the individual consumers.
    """
    require(type(data) is bytes and 0 < len(data) <= 524288, 'node-json-capacity')
    def pairs(items):
        out = {}
        for key, value in items:
            if key in out:
                refuse('duplicate-key')
            out[key] = value
        return out
    def number(text):
        value = float(text)
        require(math.isfinite(value), 'nonfinite-json')
        return value
    try:
        value = json.loads(data.decode('utf8'), object_pairs_hook=pairs, parse_float=number,
                           parse_constant=lambda _: refuse('nonfinite-json'))
    except RecursionError:
        refuse('node-json-depth')
    pending = [(value, 0)]
    visited = 0
    while pending:
        item, depth = pending.pop()
        visited += 1
        require(depth <= 64 and visited <= 262144, 'node-json-depth')
        if type(item) is dict:
            pending.extend((child, depth + 1) for child in item.values())
        elif type(item) is list:
            pending.extend((child, depth + 1) for child in item)
    return value


def exact(value, keys):
    if type(value) is not dict or list(value) != list(keys):
        refuse('schema')
    return value


def require(value, code='linkage'):
    if value is not True:
        refuse(code)


RESOURCE_STAGES = frozenset(('host-memory', 'job-members', 'job-member-open', 'job-member-membership',
    'job-member-memory', 'job-member-close', 'job-cpu', 'job-commit', 'root-before', 'root-after',
    'walk-stat', 'walk-scan', 'walk-entry', 'walk-account', 'log-stat', 'result-stat', 'drive-space', 'unclassified'))
RESOURCE_SCOPES = frozenset(('host', 'own-job', 'workspace-v1', 'workspace-v2', 'workspace-v3', 'workspace-v4', 'workspace-v5', 'workspace-v6',
    'current-batch', 'current-temp', 'C', 'D', 'unclassified'))
RESOURCE_OPERATIONS = frozenset(('global-memory', 'job-members', 'resample-members', 'open-process',
    'membership', 'process-memory', 'close-handle', 'cpu-accounting', 'job-commit', 'root-check',
    'stat', 'scandir', 'entry-stat', 'account', 'disk-usage', 'unclassified'))
RESOURCE_RUNTIME_CODES = frozenset(('host-memory', 'job-commit', 'cpu-accounting', 'owned-tree',
    'owned-entries', 'owned-bytes', 'combined-workspace-capacity', 'workspace-directory', 'log-type',
    'result-type', 'job-pid-list-unverifiable-or-overflow', 'job-pid-capacity',
    'job-pid-prefix', 'job-enumeration-counter',
    'job-member-memory-unverifiable', 'opened-process-not-confirmed-in-own-job', 'membership-false'))
RESOURCE_OS_CODES = {2: 'file-missing', 3: 'path-missing', 5: 'access-denied', 6: 'invalid-handle',
    32: 'sharing', 33: 'lock', 87: 'invalid-parameter', 299: 'partial-copy'}
RESOURCE_FAMILY_CODES = {'native-api': frozenset((*RESOURCE_OS_CODES.values(), 'other')),
    'os': frozenset((*RESOURCE_OS_CODES.values(), 'other')),
    'runtime': RESOURCE_RUNTIME_CODES, 'unclassified': frozenset(('unclassified',))}


def resource_error(error):
    """Exact builtins only; never call str(), arbitrary attributes or hooks."""
    if type(error) is RuntimeError:
        args = object.__getattribute__(error, 'args')
        if type(args) is tuple and len(args) == 1 and type(args[0]) is str and args[0] in RESOURCE_RUNTIME_CODES:
            return 'runtime', args[0]
    if type(error) in (OSError, FileNotFoundError, PermissionError, NotADirectoryError,
                        IsADirectoryError, BlockingIOError, TimeoutError):
        try:
            value = object.__getattribute__(error, 'winerror')
        except AttributeError:
            value = None
        return 'os', RESOURCE_OS_CODES.get(value, 'other') if type(value) is int else 'other'
    return 'unclassified', 'unclassified'


def project_collector_observation(value):
    exact(value, ('stage', 'scope', 'operation', 'family', 'code'))
    for key, allowed in (('stage', RESOURCE_STAGES), ('scope', RESOURCE_SCOPES), ('operation', RESOURCE_OPERATIONS)):
        require(type(value[key]) is str and value[key] in allowed, 'resource-observation')
    family, code = value['family'], value['code']
    require(type(family) is str and family in RESOURCE_FAMILY_CODES and type(code) is str and
            code in RESOURCE_FAMILY_CODES[family], 'resource-observation')
    return dict(value)


class ResourceObserver:
    """Private diagnostic state only. Tolerated races never call retain()."""
    def __init__(self):
        self.primary = None
        self.cleanup = None
        self.in_cleanup = False

    def candidate(self, error, stage, scope, operation, *, native_code=None, semantic=None):
        family, code = resource_error(error)
        if native_code is not None:
            family, code = 'native-api', RESOURCE_OS_CODES.get(native_code, 'other') if type(native_code) is int else 'other'
        if semantic is not None:
            family, code = 'runtime', semantic
        return {'stage': stage, 'scope': scope, 'operation': operation, 'family': family, 'code': code}

    def retain(self, value):
        try:
            copy = project_collector_observation(value)
            if self.in_cleanup:
                if self.cleanup is None:
                    self.cleanup = copy
            elif self.primary is None:
                self.primary = copy
        except Exception:
            pass  # Observation cannot replace the original refusal.

    def call(self, stage, scope, operation, action):
        try:
            return action()
        except Exception as error:
            try:
                self.retain(self.candidate(error, stage, scope, operation))
            except Exception:
                pass
            raise


def resource_call(observer, stage, scope, operation, action):
    return action() if observer is None else observer.call(stage, scope, operation, action)


def observe_resource_failure(observer, error, stage, scope, operation):
    if observer is not None:
        try:
            observer.retain(observer.candidate(error, stage, scope, operation))
        except Exception:
            pass


def observe_native_failure(observer, stage, operation, read_error):
    try:
        code = read_error()
        observer.retain(observer.candidate(None, stage, 'host' if stage == 'host-memory' else 'own-job',
                                          operation, native_code=code))
    except Exception:
        pass


def enumeration_stats():
    return {'schema': 'native-specificity-job-enumeration/v1', 'logicalObservations': 0,
            'physicalQueries': 0, 'retryQueries': 0, 'firstMismatch': None}


class CompleteJobEnumeration:
    """Fixed128, <=3 physical calls; incomplete prefixes are never inspected.

    fence is parent-owned, synchronous and NON-collecting; cleanup ignores work
    poison, never its original wall/cleanup deadline. No helper global/defaults
    are patched. The first work refusal remains sticky even if caught upstream.
    """
    def __init__(self, helper, fence, stats):
        self.helper, self.fence, self.stats = helper, fence, stats
        self.failure = None

    def query(self, job, *, cleanup=False, until=None):
        if self.failure is not None and not cleanup:
            raise self.failure
        try:
            for attempt in range(3):
                self.fence(cleanup=cleanup, until=until)
                s = self.stats
                require(s['physicalQueries'] < 9007199254740991 and
                        s['logicalObservations'] < 9007199254740991, 'job-enumeration-counter')
                if attempt == 0:
                    s['logicalObservations'] += 1
                else:
                    s['retryQueries'] += 1
                s['physicalQueries'] += 1
                value = self.helper.JobPids()
                ok = self.helper.kernel.QueryInformationJobObject(job, 3, ctypes.byref(value), ctypes.sizeof(value), None)
                self.fence(cleanup=cleanup, until=until)
                require(bool(ok), 'job-pid-list-unverifiable-or-overflow')
                assigned, listed = int(value.assigned), int(value.listed)
                if assigned != listed and s['firstMismatch'] is None:
                    s['firstMismatch'] = {'assigned': assigned, 'listed': listed}
                require(assigned <= 128 and listed <= 128, 'job-pid-capacity')
                if assigned != listed:
                    require(max(assigned, listed) < 128 and attempt < 2, 'job-pid-capacity')
                    continue  # NO access to any incomplete prefix, not even one PID.
                ids = list(value.pids[:listed])
                require(len(ids) == listed and len(set(ids)) == listed and
                        all(type(pid) is int and 0 < pid <= 0xffffffff for pid in ids), 'job-pid-prefix')
                return value
        except Exception as error:
            if not cleanup and self.failure is None:
                self.failure = error
            raise


def observed_tree_memory(h, job, observer, last_error=None, *, members=None):
    """ADR153 algorithm/API sequence, with approved query-limited access only.

    The verified helper's load_windows configures both DLLs use_last_error=True.
    Tests inject cached-error reads. No new process/exit API or retry is added.
    """
    read_error = ctypes.get_last_error if last_error is None else last_error
    query = h.job_members if members is None else members  # Actual session ALWAYS injects its owned complete adapter.
    def candidate(stage, operation, *, semantic=None):
        # Read cached failure before resampling/CloseHandle, not for belongs=false.
        try:
            code = None if semantic is not None else read_error()
            return observer.candidate(None, stage, 'own-job', operation, native_code=code, semantic=semantic)
        except Exception:
            return {'stage': stage, 'scope': 'own-job', 'operation': operation,
                    'family': 'unclassified', 'code': 'unclassified'}
    def absent(pid, pending):
        try:
            fresh = query(job)
            result = pid not in list(fresh.pids[:fresh.listed])
        except Exception as error:
            observe_resource_failure(observer, error, 'job-members', 'own-job', 'resample-members')
            raise
        if not result:
            observer.retain(pending)
        return result
    members = resource_call(observer, 'job-members', 'own-job', 'job-members', lambda: query(job))
    rss = private = 0
    for pid in members.pids[:members.listed]:
        handle = resource_call(observer, 'job-member-open', 'own-job', 'open-process',
                              lambda: h.kernel.OpenProcess(0x1000, False, pid))
        if not handle:
            pending = candidate('job-member-open', 'open-process')
            if absent(pid, pending):
                continue
            raise RuntimeError('job-member-memory-unverifiable')
        try:
            belongs = h.wintypes.BOOL()
            ok = resource_call(observer, 'job-member-membership', 'own-job', 'membership',
                               lambda: h.kernel.IsProcessInJob(handle, job, ctypes.byref(belongs)))
            if not ok or not belongs.value:
                pending = candidate('job-member-membership', 'membership', semantic='membership-false' if ok else None)
                if absent(pid, pending):
                    continue
                raise RuntimeError('opened-process-not-confirmed-in-own-job')
            memory = h.ProcessMemory()
            memory.cb = ctypes.sizeof(memory)
            ok = resource_call(observer, 'job-member-memory', 'own-job', 'process-memory',
                               lambda: h.psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), ctypes.sizeof(memory)))
            if not ok:
                pending = candidate('job-member-memory', 'process-memory')
                if absent(pid, pending):
                    continue
                raise RuntimeError('job-member-memory-unverifiable')
            rss += memory.workingSet
            private += memory.privateUsage
        finally:
            resource_call(observer, 'job-member-close', 'own-job', 'close-handle', lambda: h.kernel.CloseHandle(handle))
    return rss, private, members.listed


def hash_value(value):
    if type(value) is not str or not re.fullmatch('[a-f0-9]{64}', value):
        refuse('hash')
    return value


def integer(value, maximum, minimum=0):
    if type(value) is not int or not minimum <= value <= maximum:
        refuse('counter')
    return value


def checked(path, root):
    """Resolved fixed owner/source scope only; never follows a reparse point."""
    at = Path(path)
    while True:
        info = at.lstat()
        if getattr(info, 'st_file_attributes', 0) & 0x400 or at.is_symlink():
            refuse('reparse')
        if at == root:
            break
        if at == at.parent:
            refuse('containment')
        at = at.parent
    return path.lstat()


def read_fixed(path, maximum=4194304, root=REPO):
    before = checked(path, root)
    if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= maximum or path.resolve() != path:
        refuse('file-capacity')
    data = path.read_bytes()
    after = checked(path, root)
    if len(data) != before.st_size or (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
        refuse('file-drift')
    return data


def literal_paths(data):
    matches = re.findall(r'export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\);', data.decode('utf8'))
    if len(matches) != 1:
        refuse('source-literal')
    names = json.loads(matches[0])
    if type(names) is not list or not 1 <= len(names) <= 128 or any(type(n) is not str for n in names) or names != sorted(set(names)):
        refuse('source-keyset')
    for name in names:
        if not re.fullmatch('[A-Za-z0-9._/-]{1,240}', name) or name.startswith('/') or any(p in ('', '.', '..') for p in name.split('/')) or name.startswith('apps/local-service/data/') or '/output/' in name or '/node_modules/' in name:
            refuse('source-path')
        if not name.endswith(('.js', '.mjs', '.py', '.md', '.json', '.sql')):
            refuse('source-path')
    if not set(HELPERS.values()).issubset(names) or any(OWN + p not in names for p in ('source-paths.js', 'execute.mjs', 'supervise.py', 'supervise.test.mjs', 'protocol.json')):
        refuse('source-closure')
    return names


def package_files(root=PACKAGE):
    files = []
    total = 0
    def visit(directory, depth):
        nonlocal total
        info = checked(directory, root)
        if depth > 8 or not stat.S_ISDIR(info.st_mode):
            refuse('package-tree')
        children = sorted(directory.iterdir(), key=lambda p: p.name)
        if len(children) > 128:
            refuse('package-capacity')
        for path in children:
            item = checked(path, root)
            if stat.S_ISDIR(item.st_mode):
                visit(path, depth + 1)
            elif stat.S_ISREG(item.st_mode):
                total += item.st_size
                if not 0 < item.st_size <= 4194304 or total > 16777216 or len(files) >= 115:
                    refuse('package-capacity')
                files.append(PACKAGE_PREFIX + path.relative_to(root).as_posix())
            else:
                refuse('package-tree')
    visit(root, 0)
    if len(files) != 115 or total != 13656167:
        refuse('package-identity')
    return sorted(files)


def package_directory_closure(authenticated_file_keys):
    """Only root/proper directory ancestors of the 115 authenticated files.

    This does not discover directories or authenticate new files. The caller
    supplies the actual previously authenticated file inventory, not wire JSON.
    ASCII casefold aliases and file/directory collisions reject before mapping.
    """
    require(type(authenticated_file_keys) in (list, tuple) and len(authenticated_file_keys) == 115,
            'package-directory-keys')
    keys = tuple(authenticated_file_keys)
    require(all(type(key) is str for key in keys), 'package-directory-keys')
    require(list(keys) == sorted(set(keys)), 'package-directory-keys')
    directories = {PACKAGE_PREFIX[:-1]}
    for key in keys:
        require(key.startswith(PACKAGE_PREFIX) and re.fullmatch('[A-Za-z0-9._/-]{1,256}', key) is not None,
                'package-directory-keys')
        parts = key[len(PACKAGE_PREFIX):].split('/')
        require(all(part not in ('', '.', '..') for part in parts) and len(parts) - 1 <= 8,
                'package-directory-keys')
        for length in range(1, len(parts)):
            directories.add(PACKAGE_PREFIX + '/'.join(parts[:length]))
    folded_files = {key.lower() for key in keys}
    folded_directories = {key.lower() for key in directories}
    require(len(folded_files) == 115 and len(folded_directories) == len(directories) and
            folded_files.isdisjoint(folded_directories) and len(directories) <= 921,
            'package-directory-collision')
    return tuple(sorted(directories))


def authenticate_sources(literal_pin, expected, read=read_fixed, packages=package_files, guard=lambda: None,
                         baseline_pin=PACKAGE_BASELINE_SHA):
    """External FILE pin BEFORE parsing/following even valid CODE literals."""
    hash_value(literal_pin)
    guard()
    literal = read(HERE / 'source-paths.js', 131072)
    guard()
    if sha(literal) != literal_pin:
        refuse('source-literal-pin')
    names = literal_paths(literal)
    if type(expected) is not dict or len(expected) > 256:
        refuse('source-map')
    buffers, hashes = {}, {}
    total = 0
    for key in names:
        guard()
        data = literal if key == OWN + 'source-paths.js' else read(REPO / key, 4194304)
        guard()
        total += len(data)
        if total > 33554432:
            refuse('source-capacity')
        buffers[key] = data
        hashes[key] = sha(data)
    if any(hashes[key] != expected.get(key) for key in names):
        refuse('source-drift')
    guard()
    baseline_bytes = read(REPO / PACKAGE_BASELINE, 65536)
    guard()
    if sha(baseline_bytes) != baseline_pin:
        refuse('package-baseline-pin')
    # Authenticate ORIGINAL FILE bytes first. This one pinned historical
    # metadata file has exactly one final LF; no other whitespace envelope is
    # normalized. Double LF/CRLF still fail the unchanged strict parser.
    baseline = strict(baseline_bytes[:-1] if baseline_bytes.endswith(b'\n') else baseline_bytes)
    if type(baseline) is not dict or baseline.get('schema') != 'playwright-route-burst-dev-freeze/v1' or type(baseline.get('sourceHashes')) is not dict:
        refuse('package-baseline')
    guard()
    members = packages()
    guard()
    if type(members) is not list or len(members) != 115 or len(set(members)) != 115 or members != sorted(members):
        refuse('package-keyset')
    package_total = 0
    for key in members:
        if type(key) is not str or not key.startswith(PACKAGE_PREFIX) or not re.fullmatch('[A-Za-z0-9._/-]{1,256}', key) or any(p in ('', '.', '..') for p in key.split('/')):
            refuse('package-path')
        guard()
        data = read(PACKAGE / key[len(PACKAGE_PREFIX):], 4194304)
        guard()
        package_total += len(data)
        if package_total > 16777216:
            refuse('package-capacity')
        hashes[key] = sha(data)
        if hashes[key] != baseline['sourceHashes'].get(key):
            refuse('package-drift')
    if len(hashes) > 256 or package_total != 13656167 or set(expected) not in (set(names), set(hashes)) or any(hashes[k] != v for k, v in expected.items()):
        refuse('source-drift')
    guard()
    if read(HERE / 'source-paths.js', 131072) != literal:
        refuse('source-literal-drift')
    if read(REPO / PACKAGE_BASELINE, 65536) != baseline_bytes:
        refuse('package-baseline-drift')
    guard()
    return hashes, buffers


def decode_reviewed_sources(data, expected_file_hash, literal_pin):
    if type(data) is not bytes or not 0 < len(data) <= 262144 or sha(data) != hash_value(expected_file_hash):
        refuse('reviewed-sources-pin')
    value = exact(strict(data), ('schema', 'sourcePathsSha256', 'sourceHashes'))
    if value['schema'] != 'native-specificity-reviewed-sources/v1' or value['sourcePathsSha256'] != literal_pin or type(value['sourceHashes']) is not dict or not 1 <= len(value['sourceHashes']) <= 256:
        refuse('reviewed-sources')
    for digest in value['sourceHashes'].values():
        hash_value(digest)
    # Keys are expected identities only. authenticate_sources independently
    # derives every actual read path from the already authenticated CODE literal.
    return value


STAGE_PATHS = ('batch-config.js', 'chromium/page-content-reader.js', 'core/page-content-policy.js',
               'manifest.json', 'native-adapter.js', 'native-rights.js', 'worker.js')


def decode_freeze(data, expected_file_hash, literal_pin):
    if type(data) is not bytes or not 0 < len(data) <= 262144 or sha(data) != hash_value(expected_file_hash):
        refuse('freeze-pin')
    value = strict(data)
    keys = ('schema', 'sourcePathsSha256', 'sourceHashes', 'catalogHash', 'contextHash',
            'manifestHash', 'panelIdentity', 'recipeHash', 'encoderHash', 'assetPinsHash',
            'packageFiles', 'packageBytes', 'batchIds', 'batchStageHashes', 'freezeHash')
    if type(value) is not dict or set(value) != set(keys) or value['schema'] != 'native-specificity-study-freeze/v1' or value['sourcePathsSha256'] != literal_pin:
        refuse('freeze-schema')
    for key in ('sourcePathsSha256', 'catalogHash', 'contextHash', 'manifestHash', 'panelIdentity', 'recipeHash', 'encoderHash', 'assetPinsHash', 'freezeHash'):
        hash_value(value[key])
    if sha(wire({k: v for k, v in value.items() if k != 'freezeHash'})) != value['freezeHash']:
        refuse('freeze-hash')
    if type(value['sourceHashes']) is not dict or not 1 <= len(value['sourceHashes']) <= 256 or type(value['packageFiles']) is not int or value['packageFiles'] != 115 or type(value['packageBytes']) is not int or value['packageBytes'] != 13656167:
        refuse('freeze-source')
    for digest in value['sourceHashes'].values():
        hash_value(digest)
    batches = exact(value['batchIds'], ('train-cal', 'test'))
    all_ids = []
    for phase, count in [('train-cal', 24), ('test', 18)]:
        ids = batches[phase]
        if type(ids) is not list or len(ids) != count:
            refuse('freeze-batches')
        all_ids.extend(hash_value(digest) for digest in ids)
    stages = value['batchStageHashes']
    if len(set(all_ids)) != 42 or type(stages) is not dict or set(stages) != set(all_ids):
        refuse('freeze-stages')
    for stage in stages.values():
        if type(stage) is not dict or set(stage) != set(STAGE_PATHS):
            refuse('freeze-stages')
        for digest in stage.values():
            hash_value(digest)
    return value


def fixed_catalog(data):
    """Call ONLY with externally pinned, source-authenticated literal CODE."""
    matches = re.findall(r'export const SOURCE_CATALOG=freeze\((\{[\s\S]*\})\);\s*$', data.decode('utf8'))
    if len(matches) != 1:
        refuse('catalog-literal')
    value = json.loads(matches[0])
    if type(value) is not dict or value.get('schema') != 'native-specificity-source-catalog/v1' or type(value.get('entries')) is not list or len(value['entries']) > 160:
        refuse('catalog-literal')
    allowed = {}
    for entry in value['entries']:
        if type(entry) is not dict or set(entry) != {'key', 'path', 'kind', 'maximumBytes', 'sha256'}:
            refuse('catalog-entry')
        key, path = entry['key'], entry['path']
        if type(key) is not str or type(path) is not str or not re.fullmatch('[A-Za-z0-9._/-]{1,256}', path) or path.startswith('/') or any(p in ('', '.', '..') for p in path.split('/')) or key in allowed:
            refuse('catalog-path')
        allowed[key] = REPO / path
    return value, allowed


def stage_layout(stage, expected, read=read_fixed, list_directory=lambda p: sorted(os.listdir(p))):
    if type(expected) is not dict or set(expected) != set(STAGE_PATHS):
        refuse('stage-expected')
    layout = {'': ['batch-config.js', 'chromium', 'core', 'manifest.json', 'native-adapter.js', 'native-rights.js', 'worker.js'],
              'chromium': ['page-content-reader.js'], 'core': ['page-content-policy.js']}
    for directory, children in layout.items():
        path = stage / directory
        info = checked(path, WORKSPACE)
        if not stat.S_ISDIR(info.st_mode) or list_directory(path) != children:
            refuse('stage-layout')
    for path in STAGE_PATHS:
        if sha(read(stage / path, 4194304, WORKSPACE)) != expected[path]:
            refuse('stage-bytes')


def verified_modules(buffers, hashes):
    """Exact-buffer private exec; no old main/load_modules/inventory calls."""
    for path in HELPERS.values():
        if path not in buffers or sha(buffers[path]) != hashes.get(path):
            refuse('helper-pin')
    out = {}
    for name, path in HELPERS.items():
        module = types.ModuleType('_adr179_' + name)
        module.__file__ = str(REPO / path)
        exec(compile(buffers[path], module.__file__, 'exec'), module.__dict__)
        out[name] = module
    return out


def publish(path, data, before_link=lambda: None):
    pending = Path(str(path) + '.pending')
    with pending.open('xb') as handle:
        handle.write(data)
        handle.flush()
    before_link()
    os.link(pending, path)
    if read_fixed(pending, max(1, len(data)), WORKSPACE) != data or read_fixed(path, max(1, len(data)), WORKSPACE) != data:
        refuse('publication-drift')
    return sha(data)


def read_published(path, maximum):
    data = read_fixed(path, maximum, WORKSPACE)
    if read_fixed(Path(str(path) + '.pending'), maximum, WORKSPACE) != data:
        refuse('publication-drift')
    return data


def evidence_exclusions(root=WORKSPACE):
    excluded = []
    for phase, count in [(PREPARE_LEAF, 0), ('train-cal', 24), ('test', 18)]:
        excluded.append(str(root / phase / 'temp'))
        for i in range(1, count + 1):
            for name in ('profile', 'temp'):
                excluded.append(str(root / phase / 'node-owned' / ('batch-' + str(i).zfill(2)) / name))
    return tuple(excluded)


def study_usage(maximum_bytes, maximum_entries, *, evidence=False, usage=None, inspect_root=None, observer=None):
    """The three literal workspaces share ONE unchanged cumulative ceiling."""
    usage = owned_usage if usage is None else usage
    inspect_root = (lambda root: checked(root, REPO)) if inspect_root is None else inspect_root
    total = entries = 0
    for root in STUDY_WORKSPACES:
        scope = ('workspace-v1' if root == LEGACY_WORKSPACE else 'workspace-v2' if root == SECOND_WORKSPACE else 'workspace-v3' if root == THIRD_WORKSPACE else 'workspace-v4' if root == FOURTH_WORKSPACE else 'workspace-v5' if root == FIFTH_WORKSPACE else 'workspace-v6')
        def inspect_required():
            require(stat.S_ISDIR(inspect_root(root).st_mode), 'workspace-directory')
        resource_call(observer, 'root-before', scope, 'root-check', inspect_required)
        kwargs = {'exclude_directories': evidence_exclusions(root)} if evidence else {}
        if observer is not None and usage is owned_usage:
            kwargs.update(observer=observer, scope=scope)
        size, count = resource_call(observer, 'walk-scan', scope, 'scandir',
                                   lambda: usage(root, maximum_bytes, maximum_entries, **kwargs))
        resource_call(observer, 'root-after', scope, 'root-check', inspect_required)
        total += size
        entries += count
        resource_call(observer, 'walk-account', scope, 'account', lambda: require(total <= maximum_bytes and entries <= maximum_entries, 'combined-workspace-capacity'))
    return total, entries


def report_reserve(length, usage=None, inspect_root=None, observer=None):
    total, entries = study_usage(8192 * MIB, 344064, usage=usage, inspect_root=inspect_root, observer=observer)
    evidence, _ = study_usage(32 * MIB, 344064, evidence=True, usage=usage, inspect_root=inspect_root, observer=observer)
    require(total + 2 * length <= 8192 * MIB and entries + 2 <= 344064 and
            evidence + 2 * length <= 32 * MIB, 'report-capacity')


def owned_usage(root, maximum_bytes, maximum_entries, inspect=os.lstat, scan=os.scandir, exclude_directories=(), observer=None, scope='workspace-v6'):
    """Parent-only metadata walk, including Chrome names such as Local State.

    Node must not call IO.countWorkspace over profile descendants: their names
    need not fit the deliberately narrower ASCII byte/proof path grammar. This
    actual scoped walker alone supplies whole-study/current-batch counters; it
    never reads profile file bytes. Discovered descendants may vanish, but the
    required root may not. Reparse/type/access failures are never ignored.
    """
    pending = [str(root)]
    total = entries = 0
    while pending:
        directory = pending.pop()
        try:
            info = inspect(directory)
        except FileNotFoundError as error:
            if directory == str(root):
                observe_resource_failure(observer, error, 'walk-stat', scope, 'stat')
                raise
            continue
        except Exception as error:
            observe_resource_failure(observer, error, 'walk-stat', scope, 'stat')
            raise
        if getattr(info, 'st_file_attributes', 0) & 0x400 or not stat.S_ISDIR(info.st_mode):
            observe_resource_failure(observer, RuntimeError('owned-tree'), 'walk-stat', scope, 'stat')
            refuse('owned-tree')
        try:
            with scan(directory) as children:
                for entry in children:
                    entries += 1
                    if entries > maximum_entries:
                        observe_resource_failure(observer, RuntimeError('owned-entries'), 'walk-account', scope, 'account')
                        refuse('owned-entries')
                    try:
                        item = entry.stat(follow_symlinks=False)
                    except FileNotFoundError:
                        continue
                    except Exception as error:
                        observe_resource_failure(observer, error, 'walk-entry', scope, 'entry-stat')
                        raise
                    if getattr(item, 'st_file_attributes', 0) & 0x400:
                        observe_resource_failure(observer, RuntimeError('owned-tree'), 'walk-entry', scope, 'entry-stat')
                        refuse('owned-tree')
                    if stat.S_ISDIR(item.st_mode):
                        if str(entry.path) not in exclude_directories:
                            pending.append(entry.path)
                    elif stat.S_ISREG(item.st_mode):
                        total += item.st_size
                        if total > maximum_bytes:
                            observe_resource_failure(observer, RuntimeError('owned-bytes'), 'walk-account', scope, 'account')
                            refuse('owned-bytes')
                    else:
                        observe_resource_failure(observer, RuntimeError('owned-tree'), 'walk-entry', scope, 'entry-stat')
                        refuse('owned-tree')
        except FileNotFoundError as error:
            if directory == str(root):
                observe_resource_failure(observer, error, 'walk-scan', scope, 'scandir')
                raise
        except Exception as error:
            observe_resource_failure(observer, error, 'walk-scan', scope, 'scandir')
            raise
    return total, entries


class JobAccounting(ctypes.Structure):
    _fields_ = [('TotalUserTime', ctypes.c_longlong), ('TotalKernelTime', ctypes.c_longlong),
                ('ThisPeriodTotalUserTime', ctypes.c_longlong), ('ThisPeriodTotalKernelTime', ctypes.c_longlong),
                ('TotalPageFaultCount', ctypes.c_uint32), ('TotalProcesses', ctypes.c_uint32),
                ('ActiveProcesses', ctypes.c_uint32), ('TotalTerminatedProcesses', ctypes.c_uint32)]


def cpu_seconds(kernel, job, observer=None, last_error=None):
    value = JobAccounting()
    if not kernel.QueryInformationJobObject(job, 1, ctypes.byref(value), ctypes.sizeof(value), None):
        if observer is not None:
            observe_native_failure(observer, 'job-cpu', 'cpu-accounting', ctypes.get_last_error if last_error is None else last_error)
        refuse('cpu-accounting')
    if min(value.TotalUserTime, value.TotalKernelTime) < 0:
        refuse('cpu-accounting')
    return (value.TotalUserTime + value.TotalKernelTime) / 10000000


def projection(row):
    return {'pid': row['pid'], 'creationFileTime': row['creationFiletime'],
            'imagePathHash': row['imagePathSha256'], 'pathEncoding': row['imagePathHashEncoding']}


class NativeFileInformation(ctypes.Structure):
    _fields_ = [('attributes', ctypes.c_uint32), ('creationLow', ctypes.c_uint32),
                ('creationHigh', ctypes.c_uint32), ('accessLow', ctypes.c_uint32),
                ('accessHigh', ctypes.c_uint32), ('writeLow', ctypes.c_uint32),
                ('writeHigh', ctypes.c_uint32), ('volume', ctypes.c_uint32),
                ('sizeHigh', ctypes.c_uint32), ('sizeLow', ctypes.c_uint32),
                ('links', ctypes.c_uint32), ('indexHigh', ctypes.c_uint32),
                ('indexLow', ctypes.c_uint32)]


def configure_file_api(kernel):
    # Explicit actual native setup only, never at import/test extraction.
    kernel.GetFileAttributesW.argtypes = [ctypes.c_wchar_p]
    kernel.GetFileAttributesW.restype = ctypes.c_uint32
    kernel.CreateFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
                                  ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
    kernel.CreateFileW.restype = ctypes.c_void_p
    kernel.GetFileInformationByHandle.argtypes = [ctypes.c_void_p, ctypes.POINTER(NativeFileInformation)]


def native_file_identity(info):
    return {'volumeSerial': str(info.volume), 'fileIndex': str((info.indexHigh << 32) | info.indexLow),
            'creationFiletime': str((info.creationHigh << 32) | info.creationLow),
            'size': str((info.sizeHigh << 32) | info.sizeLow),
            'fileType': 'directory' if info.attributes & 0x10 else 'file'}


def inspect_fixed_path(path_key, allowed, native, guard):
    """Sampled path/own-open metadata proof, NOT atomic Node-open confinement.

    `allowed` is created only from authenticated literal CODE/catalog/asset keys
    or separately validated owned-workspace grammar, never evidence JSON paths.
    native supplies attributes/open/info/close callbacks; native handle metadata
    is a separate namespace from Node dev/ino/lstat values.
    """
    if type(path_key) is not str or type(allowed) is not dict or path_key not in allowed:
        refuse('proof-path')
    path = allowed[path_key]
    if type(path) is not Path and not isinstance(path, Path):
        refuse('proof-path')
    ancestors = [path]
    while ancestors[-1] != ancestors[-1].parent:
        if len(ancestors) >= 32:
            refuse('proof-depth')
        ancestors.append(ancestors[-1].parent)
    handles = []
    failure = None
    output = None
    try:
        for item in reversed(ancestors):
            guard()
            attributes = native['attributes'](item)
            guard()
            if type(attributes) is not int or attributes == 0xffffffff or attributes & 0x400:
                refuse('proof-reparse')
            handle = native['open'](item)
            if not handle or handle == ctypes.c_void_p(-1).value:
                refuse('proof-open')
            handles.append((item, handle, None))
            guard()
            info = native['info'](handle)
            guard()
            if type(info) is not dict or list(info) != ['attributes', 'identity'] or info['attributes'] & 0x400 or info['attributes'] != attributes:
                refuse('proof-identity')
            handles[-1] = (item, handle, info)
        for item, handle, original in handles:
            guard()
            after = native['info'](handle)
            guard()
            attributes = native['attributes'](item)
            guard()
            if attributes != original['attributes'] or attributes & 0x400 or after != original:
                refuse('proof-drift')
        final = handles[-1][2]
        output = {'pathKey': path_key, 'ancestorsChecked': True, 'openedIdentityChecked': True,
                  'attributes': final['attributes'], 'identity': dict(final['identity']), 'atomic': False}
    except Exception:
        failure = 'proof-failed'
    finally:
        for _, handle, _ in reversed(handles):
            try:
                value = native['close'](handle)
                if value is False or type(value) is int and value == 0:
                    failure = failure or 'proof-close'
            except Exception:
                failure = failure or 'proof-close'
    if failure:
        refuse(failure)
    guard()
    return output


def guarded_assignment(kernel, job, child, retain):
    handle = kernel.OpenProcess(0x1000 | 0x0100 | 0x0001, False, child.pid)
    if not handle:
        refuse('open-original')
    retain(handle, False)
    if not kernel.AssignProcessToJobObject(job, handle):
        refuse('assign-original')
    retain(handle, True)  # latch ownership before membership verification
    belongs = ctypes.c_int()
    if not kernel.IsProcessInJob(handle, job, ctypes.byref(belongs)) or not belongs.value:
        refuse('assignment-membership')
    return handle


def tracked_pipe_write(action, pending, guard, until, retain_thread,
                       clock=time.monotonic, pause=time.sleep, thread_factory=threading.Thread):
    """Original blocking write remains charged if its caller lease expires."""
    token = object()
    state = {'done': False, 'failed': False}
    guard()
    require(clock() < until, 'pipe-write-deadline')
    pending.add(token)
    def original():
        try:
            action()
        except Exception:
            state['failed'] = True
        finally:
            state['done'] = True
            pending.discard(token)  # actual physical settlement, never timeout
    thread = thread_factory(target=original, daemon=True, name='adr179-owned-proof-writer')
    retain_thread(thread)
    thread.start()
    while not state['done']:
        guard()
        require(clock() < until, 'pipe-write-deadline')
        pause(.01)
    thread.join(timeout=0)
    guard()
    require(clock() < until and not state['failed'] and not thread.is_alive(), 'pipe-write-failed')


def pause_if_idle(handled, pause, guard):
    # A settled serialized proof must not incur an artificial per-frame delay.
    # Idle waits retain the original phase guard and a finite backoff.
    if handled is not True:
        guard()
        pause(.002)
        guard()


def held_model_deadline(phase, held, now):
    """Unchanged first-observation clocks, retained after guardian.complete()."""
    require(phase in ('train-cal', 'test') and type(held) is tuple and len(held) == 3, 'post-complete-clock')
    model_at, stage, stage_at = held
    for value in (now, model_at, stage_at):
        require(type(value) in (int, float) and math.isfinite(value) and value >= 0, 'post-complete-clock')
    require(model_at <= stage_at <= now, 'post-complete-clock')
    require(now - model_at < (780 if phase == 'train-cal' else 525), 'model-deadline')
    limits = {'encoding': 540 if phase == 'train-cal' else 405,
              'fitting': 180, 'assessment': 60, 'checks': 60}
    require(type(stage) is str and stage in limits, 'post-complete-clock')
    require(now - stage_at < limits[stage], 'model-stage-deadline')


class ProofFrames:
    """Bounded child-owned stdout framing; no reader thread until explicit start.

    Child stdout is protocol only, diagnostics go to separately capped stderr.
    Raw frames are transient; retained evidence is a compact hash chain/count.
    """
    def __init__(self):
        self.frames = queue.Queue(maxsize=8)
        self.buffer = bytearray()
        self.failure = None
        self.received = 0
        self.count = 0
        self.maximum = 0
        self.chain = None
        self.finished = False

    def feed(self, chunk):
        if self.failure is not None or self.finished:
            refuse('pipe-terminal')
        if type(chunk) is not bytes or not 0 < len(chunk) <= 4096:
            self.failure = 'pipe-frame'
            refuse(self.failure)
        self.received += len(chunk)
        if self.received > 64 * MIB:
            self.failure = 'pipe-bytes'
            refuse(self.failure)
        self.buffer.extend(chunk)
        while b'\n' in self.buffer:
            index = self.buffer.index(10)
            if not 0 < index < 16384 or self.count >= 65536:
                self.failure = 'pipe-frame'
                refuse(self.failure)
            frame = bytes(self.buffer[:index])
            del self.buffer[:index + 1]
            self.count += 1
            self.maximum = max(self.maximum, len(frame) + 1)
            self.chain = sha(wire({'previousChainHash': self.chain, 'frameSha256': sha(frame)}))
            try:
                self.frames.put_nowait(frame)
            except queue.Full:
                self.failure = 'pipe-queue'
                refuse(self.failure)
        if len(self.buffer) >= 16384:
            self.failure = 'pipe-frame'
            refuse(self.failure)

    def end(self):
        if self.buffer:
            self.failure = self.failure or 'pipe-partial'
        self.finished = True

    def start(self, stream):
        def reader():
            try:
                while True:
                    chunk = stream.read1(4096)
                    if not chunk:
                        break
                    self.feed(chunk)
            except Exception:
                self.failure = self.failure or 'pipe-reader'
            finally:
                self.end()
        thread = threading.Thread(target=reader, daemon=True, name='adr179-owned-proof-reader')
        thread.start()
        return thread

    def next(self):
        if self.failure is not None:
            refuse(self.failure)
        try:
            return self.frames.get_nowait()
        except queue.Empty:
            return None


class ProofService:
    """One owned pipe request at a time, source-key allowlist and native tickets."""
    def __init__(self, phase, source_identity, allowed, prove, guard):
        require(phase in ('prepare', 'train-cal', 'test'))
        self.phase = phase
        self.source_identity = hash_value(source_identity)
        self.allowed = dict(allowed)
        self.prove = prove
        self.guard = guard
        self.sequence = 0
        self.before = {}
        self.used = set()
        self.failure = None
        self.bytes = 0
        self.chain = None
        self.maximum = 0
        self.prepared = None
        self.checkpoints = deque([{'sequence': 0, 'chainHash': None}], maxlen=64)
        self.named_checkpoints = {}

    def _check(self):
        if self.failure:
            refuse(self.failure)
        self.guard()

    def answer(self, raw):
        self._check()
        try:
            require(self.prepared is None)
            require(type(raw) is bytes and 0 < len(raw) < 16384)
            r = exact(strict(raw), ('schema', 'sequence', 'phase', 'sourceIdentityHash', 'pathKey', 'operationNonce', 'edge', 'parentPathKey', 'priorChainHash'))
            require(r['schema'] == 'native-specificity-fs-request/v1' and r['phase'] == self.phase and r['sourceIdentityHash'] == self.source_identity)
            require(type(r['sequence']) is int and r['sequence'] == self.sequence + 1 <= 65536)
            require(r['priorChainHash'] == self.chain)
            key, nonce = r['pathKey'], r['operationNonce']
            require(type(key) is str and key in self.allowed and type(nonce) is str and re.fullmatch('[A-Za-z0-9._:-]{1,160}', nonce) is not None)
            require(r['edge'] in ('before', 'after'))
            if r['edge'] == 'before':
                require(r['parentPathKey'] is None and nonce not in self.used and len(self.before) < 128)
            else:
                require(nonce in self.before)
                previous = self.before[nonce]
                parent = r['parentPathKey']
                require((parent is None and previous['pathKey'] == key) or
                        (type(parent) is str and parent == previous['pathKey'] and parent in self.allowed and
                         ((previous['identity']['fileType'] == 'directory' and self.allowed[key].parent == self.allowed[parent]) or
                          (previous['identity']['fileType'] == 'file' and self.allowed[parent].parent == self.allowed[key].parent and str(self.allowed[parent]) == str(self.allowed[key]) + '.pending'))))
            self._check()
            proof = self.prove(key)
            self._check()
            exact(proof, ('pathKey', 'ancestorsChecked', 'openedIdentityChecked', 'attributes', 'identity', 'atomic'))
            require(proof['pathKey'] == key and proof['ancestorsChecked'] is True and proof['openedIdentityChecked'] is True and proof['atomic'] is False)
            identity = exact(proof['identity'], ('volumeSerial', 'fileIndex', 'creationFiletime', 'size', 'fileType'))
            for field in ('volumeSerial', 'fileIndex', 'creationFiletime', 'size'):
                require(type(identity[field]) is str and re.fullmatch('(?:0|[1-9][0-9]{0,19})', identity[field]) is not None and int(identity[field]) <= (4294967295 if field == 'volumeSerial' else 18446744073709551615))
            require(identity['creationFiletime'] != '0')
            require(identity['fileType'] in ('directory', 'file') and type(proof['attributes']) is int and 0 <= proof['attributes'] < 0xffffffff and not proof['attributes'] & 0x400)
            if r['edge'] == 'after' and (r['parentPathKey'] is None or self.before[nonce]['identity']['fileType'] == 'file'):
                require(all(identity[k] == self.before[nonce]['identity'][k] for k in ('volumeSerial', 'fileIndex', 'creationFiletime', 'fileType')))
            body = {'schema': 'native-specificity-fs-proof/v1', 'pathKey': key, 'operationNonce': nonce, 'edge': r['edge'],
                    'ancestorsChecked': True, 'openedIdentityChecked': True, 'attributes': proof['attributes'],
                    'identity': dict(identity), 'atomic': False, 'requestHash': sha(raw)}
            ack = wire({**body, 'receiptHash': sha(wire(body))})
            require(len(ack) < 16384 and self.bytes + len(raw) + len(ack) + 2 <= 64 * MIB)
            self._check()
            self.prepared = {'raw': raw, 'ack': ack, 'request': r, 'identity': dict(identity)}
            return ack
        except Exception:
            self.failure = self.failure or 'proof-channel'
            raise RuntimeError(self.failure) from None

    def commit_written(self, ack):
        """Only AFTER the ORIGINAL stdin write+flush physically settles."""
        self._check()
        p = self.prepared
        if p is None or type(ack) is not bytes or ack != p['ack']:
            self.failure = self.failure or 'proof-channel'
            refuse(self.failure)
        raw, r = p['raw'], p['request']
        self.sequence += 1
        self.bytes += len(raw) + len(ack) + 2
        self.maximum = max(self.maximum, len(raw) + 1, len(ack) + 1)
        self.chain = sha(wire({'previousChainHash': self.chain, 'requestHash': sha(raw), 'responseHash': sha(ack)}))
        self.checkpoints.append({'sequence': self.sequence, 'chainHash': self.chain})
        if r['edge'] == 'before':
            self.used.add(r['operationNonce'])
            self.before[r['operationNonce']] = {'pathKey': r['pathKey'], 'identity': dict(p['identity'])}
        else:
            del self.before[r['operationNonce']]
        self.prepared = None

    def checkpoint_matches(self, value):
        self._check()
        try:
            exact(value, ('sequence', 'chainHash'))
            integer(value['sequence'], 65536)
            if value['sequence'] == 0:
                require(value['chainHash'] is None, 'proof-checkpoint')
            else:
                hash_value(value['chainHash'])
            require(value in self.checkpoints, 'proof-checkpoint')
        except Exception:
            self.failure = 'proof-checkpoint'
            refuse(self.failure)
        return True

    def accept_checkpoint(self, name, value):
        self._check()
        order = ('result', 'finish', 'completion')
        if len(self.named_checkpoints) >= 3 or name != order[len(self.named_checkpoints)]:
            self.failure = 'proof-checkpoint'
            refuse(self.failure)
        self.checkpoint_matches(value)
        self.named_checkpoints[name] = dict(value)


class PhaseControl:
    """Fixed-path actual parent orchestration, injectable without native setup.

    IO callbacks read/publish exclusively within the freshly owned phase output.
    `tick` continuously services the bounded owned pipe/resource monitor; it
    must retain original physical work. No callback/boolean supplies drain
    authority: actual fresh membership and held-handle census still gate ACK.
    """
    def __init__(self, guardian, exists, read, publish, poll, members, recheck, tick, pause, clock):
        self.g = guardian
        self.exists = exists
        self.read = read
        self.publish = publish
        self.poll = poll
        self.members = members
        self.recheck = recheck
        self.tick = tick
        self.pause = pause
        self.clock = clock
        self.control_pairs = []
        self.first_failure = None
        self.model_first_observed = None
        self.stage_first_observed = None
        self.model_stage = None

    def observe_cohort(self):
        observed = self.g.observe_request('cohort-drain')
        self.model_first_observed = observed
        self.stage_first_observed = observed
        self.model_stage = 'encoding'

    def observe_model(self, stage):
        self.g.advance_model(stage)
        # Read the trusted helper's actual held FIRST observation, not a new
        # post-IO clock sample. No guardian state/timestamps are modified here.
        self.stage_first_observed = self.g.stage_started
        self.model_stage = stage

    def model_clock(self):
        require(self.model_stage == 'checks' and self.model_first_observed is not None and
                self.stage_first_observed is not None, 'post-complete-clock')
        return (self.model_first_observed, self.model_stage, self.stage_first_observed)

    def check(self):
        if self.first_failure:
            refuse(self.first_failure)
        handled = self.tick() is True
        self.g.check()
        if self.poll() is not None:
            self.g.fail('owner-failure')
        return handled

    def wait(self, name, observed):
        while True:
            handled = self.check()
            present = self.exists(name)
            if present:
                # Actual complete-path observation BEFORE bounded file read,
                # residual probing, source IO or any setup callback.
                observed()
                value = self.read(name, 16384)
                self.check()
                return value
            handled = self.check() or handled
            pause_if_idle(handled, self.pause, self.g.check)
            self.check()

    def residual_drain(self):
        self.check()
        original = self.members()
        self.check()
        if type(original) is not list or len(original) > 128 or len(set(original)) != len(original):
            self.g.fail('normal-drain-failed')
        allowed = {self.g.node['pid']}
        if self.g.console is not None:
            allowed.add(self.g.console['pid'])
        remaining = set(original)
        while True:
            handled = self.check()  # held guardian observation owns the non-sliding15s
            live = self.members()
            handled = self.check() or handled
            if type(live) is not list or len(live) > 128 or len(set(live)) != len(live) or self.g.node['pid'] not in live or not set(live).issubset(remaining):
                self.g.fail('normal-drain-failed')
            remaining = set(live)
            if remaining.issubset(allowed):
                return
            pause_if_idle(handled, self.pause, self.g.check)

    def control_ack(self, name, raw, kind, extra):
        self.check()
        self.g._baseline()
        if self.recheck() is not True:
            self.g.fail('owner-failure')
        self.check()
        self.g._baseline()
        body = {'schema': 'native-specificity-control-ack/v1', **self.g.bindings,
                'phase': self.g.phase, 'kind': kind, **extra, 'requestHash': sha(raw)}
        data = wire(body)
        def before_link():
            self.check()
            self.g._baseline()
            self.check()
            if self.g.pending:
                self.g.fail('physical-unsettled')
        value = self.publish(name, data, before_link)
        self.check()
        if value != sha(data) or self.g.pending:
            self.g.fail('physical-unsettled')
        self.control_pairs.append({'requestHash': sha(raw), 'ackHash': sha(data)})
        return data

    def run(self):
        try:
            for index, batch_id in enumerate(self.g.batch_ids, 1):
                prefix = 'batch-' + str(index).zfill(2)
                raw = self.wait(prefix + '.start.request.json', lambda: self.g.begin_batch(batch_id))
                r = exact(strict(raw), ('schema', 'freezeHash', 'manifestHash', 'nodeIdentityHash', 'sourceMapHash',
                                        'phase', 'batchId', 'batchIndex', 'previousAckHash'))
                wanted = {'schema': 'native-specificity-batch-start-request/v1', **self.g.bindings,
                          'phase': self.g.phase, 'batchId': batch_id, 'batchIndex': index,
                          'previousAckHash': self.g.previous_ack}
                require(r == wanted and type(r['batchIndex']) is int, 'batch-start')
                self.control_ack(prefix + '.start.ack.json', raw, 'batch-start', {'batchId': batch_id, 'batchIndex': index})
                raw = self.wait(prefix + '.drain.request.json', lambda: self.g.observe_request('batch-drain'))
                self.residual_drain()
                self.g.batch_barrier(raw)
            raw = self.wait('cohort.drain.request.json', self.observe_cohort)
            self.residual_drain()
            self.g.cohort_barrier(raw)
            capture_hash = self.g.capture_hash
            encoding_hash = None
            for stage in ('fitting' if self.g.phase == 'train-cal' else 'assessment', 'checks'):
                raw = self.wait('model-' + stage + '.request.json', lambda: self.observe_model(stage))
                r = exact(strict(raw), ('schema', 'freezeHash', 'manifestHash', 'nodeIdentityHash', 'sourceMapHash',
                                        'phase', 'stage', 'captureHash', 'encodingHash', 'previousAckHash'))
                wanted = {'schema': 'native-specificity-model-stage-request/v1', **self.g.bindings,
                          'phase': self.g.phase, 'stage': stage, 'captureHash': capture_hash,
                          'encodingHash': r['encodingHash'], 'previousAckHash': self.g.previous_ack}
                hash_value(r['encodingHash'])
                require(r == wanted and (encoding_hash is None or encoding_hash == r['encodingHash']), 'model-stage')
                encoding_hash = r['encodingHash']
                self.control_ack('model-' + stage + '.ack.json', raw, 'model-stage',
                                 {'stage': stage, 'captureHash': capture_hash, 'encodingHash': encoding_hash})
            return {'captureHash': capture_hash, 'encodingHash': encoding_hash, 'controlPairs': list(self.control_pairs)}
        except Exception:
            self.first_failure = self.first_failure or 'phase-control'
            try:
                self.g.fail('owner-failure')
            except Exception:
                pass
            raise


class BaselinePolicy:
    """Incremental exact ADR155 tuples; never reset between browser batches."""
    def __init__(self, initial, base, census, exit_proof):
        self.base, self.census, self.exit_proof = base, census, exit_proof
        self.node = base.identity(initial)
        self.console = None
        self.sealed = None
        if self.node['imagePathSha256'] != base.NODE_HASH:
            raise census.PolicyFailure('policy-identity-conflict')

    def accept(self, row):
        if row['inspectionStatus'] == 'gone':
            if row['pid'] == self.node['pid']:
                if not self.exit_proof():
                    raise self.census.PolicyFailure('policy-node-missing')
            elif self.console is None or row['pid'] != self.console['pid']:
                raise self.census.PolicyFailure('policy-gone-unknown')
            return
        value = self.base.identity(row)
        if value['pid'] == self.node['pid']:
            if value != self.node:
                raise self.census.PolicyFailure('policy-identity-conflict')
        elif value['imagePathSha256'] == self.base.CONSOLE_HASH:
            if self.console is None:
                if self.sealed is not None:
                    raise self.census.PolicyFailure('policy-late-member')
                self.console = dict(value)
            elif self.console != value:
                raise self.census.PolicyFailure('policy-identity-conflict')
        else:
            raise self.census.PolicyFailure('policy-unknown-member')

    def final(self, result):
        if len(result['livePids']) > 2:
            raise self.census.PolicyFailure('policy-scope-capacity')
        if self.node['pid'] not in result['livePids'] and not self.exit_proof():
            raise self.census.PolicyFailure('policy-node-missing')

    def seal(self):
        if self.sealed is not None:
            raise self.census.PolicyFailure('policy-identity-conflict')
        body = {'schema': 'native-console-baseline/v1', 'node': dict(self.node),
                'console': None if self.console is None else dict(self.console)}
        self.sealed = {**body, 'baselineHash': self.base.digest(body)}
        return self.sealed


def validate_selection_semantics(result, phase, selection_sha, selection=None):
    if phase != 'train-cal':
        require(selection_sha is None, 'selection-phase')
        return
    semantic = result.get('semantic')
    require(type(semantic) is dict, 'selection-semantic')
    base = ('status', 'accounted', 'referenceCount', 'calibrationSelections')
    status = semantic.get('status')
    if status == 'no-reference-set':
        exact(semantic, (*base, 'testAllowed'))
        require(type(semantic['accounted']) is int and semantic['accounted'] == 96 and
                type(semantic['referenceCount']) is int and semantic['referenceCount'] == 0 and
                type(semantic['calibrationSelections']) is int and semantic['calibrationSelections'] == 0 and
                semantic['testAllowed'] is False and selection_sha is None and selection is None, 'selection-semantic')
    elif status == 'selected-pending-independent-audit':
        exact(semantic, (*base, 'selectionIdentity', 'packetHash', 'artifactHash', 'testAllowed'))
        require(type(semantic['accounted']) is int and semantic['accounted'] == 96 and
                type(semantic['referenceCount']) is int and 1 <= semantic['referenceCount'] <= 48 and
                type(semantic['calibrationSelections']) is int and semantic['calibrationSelections'] == 1 and
                semantic['testAllowed'] is False and selection_sha is not None, 'selection-semantic')
        hash_value(selection_sha)
        for key in ('selectionIdentity', 'packetHash', 'artifactHash'):
            hash_value(semantic[key])
        if selection is not None:
            require(type(selection) is dict and type(selection.get('referencePacket')) is dict and
                    selection.get('selectionIdentity') == semantic['selectionIdentity'] and
                    selection['referencePacket'].get('packetHash') == semantic['packetHash'] and
                    selection['referencePacket'].get('artifactHash') == semantic['artifactHash'], 'selection-semantic')
    else:
        refuse('selection-semantic')


def validate_phase_result(raw, phase, frozen, startup, selection_sha):
    require(type(raw) is bytes and 0 < len(raw) <= 524288, 'result-capacity')
    value = exact(strict_node_json(raw), ('schema', 'phase', 'freezeHash', 'sourceMapHash', 'nodeIdentityHash',
            'readySha256', 'startupAckSha256', 'baselineHash', 'result', 'selectionSha256',
            'fsProofCheckpoint', 'sourceAssetEndchecksPassed', 'productionValidated', 'assignmentAuthority'))
    require(value['schema'] == 'native-specificity-study-result/v1' and value['phase'] == phase and
            value['freezeHash'] == frozen['freezeHash'] and value['selectionSha256'] == selection_sha and
            value['sourceAssetEndchecksPassed'] is True and value['productionValidated'] is False and value['assignmentAuthority'] is False, 'result-linkage')
    for key in ('sourceMapHash', 'nodeIdentityHash', 'readySha256', 'startupAckSha256', 'baselineHash'):
        require(value[key] == startup[key], 'result-linkage')
    result = value['result']
    require(type(result) is dict and result.get('schema') == 'native-specificity-phase-composition/v1' and result.get('phase') == phase and
            result.get('manifestHash') == frozen['manifestHash'] and result.get('sourceAssetEndchecksPassed') is True and
            result.get('normalEncoderClosed') is True and result.get('productionValidated') is False and result.get('assignmentAuthority') is False, 'result-phase')
    count = 96 if phase == 'train-cal' else 72
    capture = result.get('capture')
    encoding = result.get('encoding')
    require(type(capture) is dict and type(capture.get('accounted')) is int and capture['accounted'] == count and
            type(encoding) is dict and type(encoding.get('encoderCalls')) is int and 0 <= encoding['encoderCalls'] <= count * 2 and
            encoding.get('rawTextRetained') is False, 'result-counts')
    hash_value(capture.get('captureHash'))
    receipts = result.get('receipts')
    require(type(receipts) is list and len(receipts) == count // 4, 'result-receipts')
    validate_selection_semantics(result, phase, selection_sha)
    return value


def authenticate_test_bundle(audit_pin, frozen, freeze_file_sha, source_map_hash, read=read_fixed, guard=lambda: None):
    """Fixed independently audited bundle only; no metadata-selected paths.

    External audit FILE SHA precedes its parse. All three train FILE SHA pins
    precede ANY train parse. Child semantic admission remains a separate gate.
    Returned original buffers are retained for exact fresh end rechecks.
    """
    hash_value(audit_pin)
    guard()
    raw = read(TEST_AUDIT_PATHS['audit:selection-audit'], 262144)
    guard()
    require(type(raw) is bytes and sha(raw) == audit_pin, 'test-audit-pin')
    audit = exact(strict(raw), ('schema', 'phase', 'freezeFileSha256', 'freezeHash', 'sourceMapHash',
        'panelIdentity', 'manifestHash', 'producerRecipeHash', 'rootReuseReceiptHash', 'rootTransferHash',
        'trainFiles', 'trainNodeIdentityHash', 'selectionIdentity', 'packetHash', 'artifactHash',
        'inputLedgerHash', 'review', 'auditIdentity'))
    require(audit['schema'] == 'native-specificity-independent-selection-audit/v1' and
            audit['phase'] == 'train-cal', 'test-audit-schema')
    for key in ('freezeFileSha256', 'freezeHash', 'sourceMapHash', 'panelIdentity', 'manifestHash',
                'producerRecipeHash', 'rootReuseReceiptHash', 'rootTransferHash', 'trainNodeIdentityHash',
                'selectionIdentity', 'packetHash', 'artifactHash', 'inputLedgerHash', 'auditIdentity'):
        hash_value(audit[key])
    require(audit['auditIdentity'] == sha(wire({k: v for k, v in audit.items() if k != 'auditIdentity'})), 'test-audit-identity')
    require(audit['freezeFileSha256'] == freeze_file_sha and audit['freezeHash'] == frozen['freezeHash'] and
            audit['sourceMapHash'] == source_map_hash and audit['panelIdentity'] == frozen['panelIdentity'] and
            audit['manifestHash'] == frozen['manifestHash'] and audit['producerRecipeHash'] == frozen['recipeHash'], 'test-audit-context')
    review = {'selectedPolicyAndBindingsChecked': True, 'fullGridReplay': False,
              'omittedQueryFeaturesNotRecomputed': True, 'testPermitted': True,
              'scope': 'fixed-168-specificity/v1'}
    require(wire(exact(audit['review'], review)) == wire(review), 'test-audit-review')
    files = exact(audit['trainFiles'], ('supervisorSha256', 'resultSha256', 'selectionSha256'))
    retained = {'audit:selection-audit': raw}
    for name, pin_name in (('audit:train-supervisor', 'supervisorSha256'),
                           ('audit:train-result', 'resultSha256'), ('audit:train-selection', 'selectionSha256')):
        hash_value(files[pin_name])
        guard()
        data = read(TEST_AUDIT_PATHS[name], 524288)
        guard()
        require(type(data) is bytes and sha(data) == files[pin_name], 'test-train-file-pin')
        retained[name] = data
    # No parse above this point of any supervisor/result/selection train file.
    supervisor = strict(retained['audit:train-supervisor'])
    require(type(supervisor) is dict and supervisor.get('schema') == 'native-specificity-study-supervisor/v1' and
            supervisor.get('phase') == 'train-cal' and supervisor.get('sourceIdentityKind') == 'freeze-file' and
            supervisor.get('sourceIdentityHash') == freeze_file_sha and supervisor.get('freezeHash') == frozen['freezeHash'] and
            supervisor.get('sourceMapHash') == source_map_hash and supervisor.get('nodeIdentityHash') == audit['trainNodeIdentityHash'] and
            supervisor.get('normalExit') is True and supervisor.get('normalEmptyJob') is True and
            supervisor.get('endchecksPassed') is True and supervisor.get('ownCleanupPassed') is True and
            type(supervisor.get('exitCode')) is int and supervisor['exitCode'] == 0 and
            supervisor.get('emergencyOwnJobTermination') is False and 'failure' in supervisor and supervisor['failure'] is None and
            'cleanupFailure' in supervisor and supervisor['cleanupFailure'] is None and
            supervisor.get('resultSha256') == files['resultSha256'] and
            supervisor.get('selectionSha256') == files['selectionSha256'], 'test-train-supervisor')
    complete = supervisor.get('guardianComplete')
    require(type(complete) is dict and type(complete.get('pending')) is int and complete['pending'] == 0 and
            complete.get('phase') == 'train-cal', 'test-train-supervisor')
    require(supervisor.get('supervisorHash') == sha(wire({k: v for k, v in supervisor.items() if k != 'supervisorHash'})), 'test-train-supervisor')
    result = strict_node_json(retained['audit:train-result'])
    require(type(result) is dict and result.get('nodeIdentityHash') == audit['trainNodeIdentityHash'], 'test-train-result')
    startup = {k: result.get(k) for k in ('sourceMapHash', 'nodeIdentityHash', 'readySha256', 'startupAckSha256', 'baselineHash')}
    for value in startup.values():
        hash_value(value)
    require(startup['sourceMapHash'] == source_map_hash, 'test-train-result')
    validate_phase_result(retained['audit:train-result'], 'train-cal', frozen, startup, files['selectionSha256'])
    selection = strict_node_json(retained['audit:train-selection'])
    require(type(selection) is dict and selection.get('schema') == 'native-specificity-selected-detail/v1' and
            selection.get('selectionIdentity') == audit['selectionIdentity'], 'test-train-selection')
    # External FILE pins and the independent numeric-free audit bind these
    # claimed identities here. Only child JS admission recomputes the actual
    # JS semantic selection digest/codec; Python float rendering cannot do so.
    for key in ('panelIdentity', 'manifestHash', 'producerRecipeHash', 'rootReuseReceiptHash', 'rootTransferHash', 'inputLedgerHash'):
        require(selection.get(key) == audit[key], 'test-train-selection')
    packet = selection.get('referencePacket')
    require(type(packet) is dict and packet.get('packetHash') == audit['packetHash'] and packet.get('artifactHash') == audit['artifactHash'], 'test-train-selection')
    guard()
    return retained


class NativeSession:
    """Actual owned parent capabilities. Never instantiated by source-only tests."""
    def __init__(self, phase, started, sources, buffers, source_identity, literal_pin, frozen=None,
                 test_audit_sha=None, test_bundle=None):
        self.phase, self.started = phase, started
        self.sources, self.buffers = sources, buffers
        self.source_identity, self.literal_pin, self.frozen = source_identity, literal_pin, frozen
        require((phase == 'test') == (test_audit_sha is not None), 'test-audit-phase')
        self.test_audit_sha = None if test_audit_sha is None else hash_value(test_audit_sha)
        self.test_bundle = {} if test_bundle is None else dict(test_bundle)
        self.bootstrap_bytes = None
        self.source_map_hash = sha(wire(dict(sorted(sources.items()))))
        self.modules = verified_modules(buffers, sources)
        self.helper, self.base, self.census = [self.modules[k] for k in ('native', 'baseline', 'census')]
        self.guardian = None
        self.model_clock = None
        self.phase_root = WORKSPACE / (PREPARE_LEAF if phase == 'prepare' else phase)
        self.output = self.phase_root / 'node-owned'
        self.job = self.child = self.original = None
        self.assigned = False
        self.policy = None
        self.baseline = None
        self.ready_sha = self.startup_ack_sha = None
        self.exit_confirmed = False
        self._confirming_exit = False
        self.emergency = False
        self.frames = ProofFrames()
        self.service = None
        self.reader = None
        self.pending_physical = set()
        self.writers = []
        self.frame_until = None
        self.stats = {'peakRssBytes': 0, 'peakPrivateBytes': 0, 'peakJobMembers': 0,
                      'peakCpuSeconds': 0, 'peakStudyBytes': 0, 'peakStudyEntries': 0,
                      'jobEnumeration': enumeration_stats()}
        self.enumerator = None
        self.enumeration_until = None
        self.bootstrap_until = None
        self.cleanup_until = None
        self.last_cpu = 0
        self.failure = None
        self.native_result = None
        self.phase_active = 60 if phase == 'prepare' else 9420 if phase == 'train-cal' else 7005
        self.phase_cpu = 60 if phase == 'prepare' else 1920 if phase == 'train-cal' else 1395
        self.workspace_snapshot = None
        self.workspace_sampled_at = None
        self.resource_observer = ResourceObserver()
        self.output_handles = []
        _, self.allowed = fixed_catalog(buffers[OWN + 'source-paths.js'])
        for key in sources:
            if key.startswith(PACKAGE_PREFIX):
                self.allowed[key] = PACKAGE / key[len(PACKAGE_PREFIX):]
        # Source authentication has already established all 115 FILE keys.
        # Add their exact directory closure BEFORE ProofService copies allowed.
        for key in package_directory_closure(sorted(key for key in sources if key.startswith(PACKAGE_PREFIX))):
            self.allowed[key] = PACKAGE if key == PACKAGE_PREFIX[:-1] else PACKAGE / key[len(PACKAGE_PREFIX):]
        self.allowed['packageBaseline'] = REPO / PACKAGE_BASELINE
        self.allowed['control:source-list'] = HERE / 'source-paths.js'
        if phase == 'prepare':
            self.allowed['control:reviewed-sources'] = REVIEWED_SOURCE_MAP
        else:
            self.allowed['control:freeze'] = PREPARED_FREEZE
        if phase == 'test':
            self.allowed.update(TEST_AUDIT_PATHS)
        self.allowed['workspace:'] = self.output
        self.allowed['workspace-parent'] = self.phase_root
        self.allowed['control:bootstrap'] = self.phase_root / 'bootstrap.json'
        for name in ('model.onnx', 'tokenizer.json', 'tokenizer_config.json', 'config.json',
                     'special_tokens_map.json', 'tokenizers.mjs', 'ort.wasm.min.mjs',
                     'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'):
            self.allowed['asset:' + name] = REPO / 'spikes/topic-resolution/browser/embedding/.assets' / name

    def bootstrap_guard(self):
        self.raw_guard()
        if time.monotonic() - self.started >= 30:
            refuse('bootstrap-deadline')

    def enumeration_fence(self, *, cleanup=False, until=None):
        """NO resource sampling/census/guard callbacks: safe inside list queries."""
        now = time.monotonic()
        require(type(now) in (int, float) and math.isfinite(now) and now >= self.started, 'phase-deadline')
        require(now < self.started + self.phase_active + (60 if cleanup else 0), 'phase-deadline')
        for deadline in (until, None if cleanup else self.enumeration_until):
            if deadline is not None:
                require(now < deadline, 'census-deadline')
        if cleanup:
            if self.cleanup_until is not None:
                require(now < self.cleanup_until, 'own-cleanup-deadline')
            return  # Never treat expired work/state poison as permission to skip cleanup.
        if self.failure:
            refuse(self.failure)
        if self.bootstrap_until is not None:
            require(now < self.bootstrap_until, 'bootstrap-deadline')
        if self.frame_until is not None:
            require(now < self.frame_until, 'proof-frame-deadline')
        g = self.guardian
        if g is not None:
            if g.fault is not None:
                raise self.modules['guardian'].GuardianFailure(g.fault)
            if g.model_started is None:
                require(now - self.started < g.count * 360, 'capture-deadline')
            for began, limit, code in ((g.batch_started, 360, 'batch-deadline'),
                    (g.drain_started, 15, 'drain-deadline')):
                if began is not None:
                    require(now - began < limit, code)
            if g.model_started is not None:
                held_model_deadline(self.phase, (g.model_started, g.model_stage, g.stage_started), now)
        elif self.model_clock is not None:
            held_model_deadline(self.phase, self.model_clock, now)

    def complete_members(self, job, *, cleanup=False, until=None):
        require(job == self.job and bool(job), 'job-pid-list-unverifiable-or-overflow')
        if self.enumerator is None:
            self.enumerator = CompleteJobEnumeration(self.helper, self.enumeration_fence, self.stats['jobEnumeration'])
        return self.enumerator.query(job, cleanup=cleanup, until=until)

    def member_ids(self, job, *, cleanup=False, until=None):
        value = self.complete_members(job, cleanup=cleanup, until=until)
        return list(value.pids[:value.listed])

    def resource_diagnostic(self):
        observer = self.resource_observer
        result = {'collectorPrimary': None, 'collectorCleanup': None, 'guardian': None}
        for key, candidate in (('collectorPrimary', observer.primary), ('collectorCleanup', observer.cleanup)):
            if candidate is not None:
                try:
                    result[key] = project_collector_observation(candidate)
                except Exception:
                    pass
        if self.guardian is not None:
            try:
                result['guardian'] = self.guardian.resource_diagnostic()
            except Exception:
                pass
        require(len(wire(result)) <= 1024, 'resource-observation')
        return result

    def raw_resources(self, capabilities=None):
        # Tests inject THIS assembled collector; actual calls use fixed capabilities.
        caps = {} if capabilities is None else capabilities
        observer = self.resource_observer
        read_error = caps.get('last_error', ctypes.get_last_error)
        h = self.helper
        status = h.MemoryStatus()
        status.length = ctypes.sizeof(status)
        if not resource_call(observer, 'host-memory', 'host', 'global-memory',
                             lambda: h.kernel.GlobalMemoryStatusEx(ctypes.byref(status))):
            observe_native_failure(observer, 'host-memory', 'global-memory', read_error)
            refuse('host-memory')
        rss = private = members = cpu = committed = 0
        if self.job:
            rss, private, members = observed_tree_memory(h, self.job, observer, read_error, members=self.complete_members)
            cpu = resource_call(observer, 'job-cpu', 'own-job', 'cpu-accounting',
                                lambda: cpu_seconds(h.kernel, self.job, observer, read_error))
            limits = h.ExtendedLimits()
            if not resource_call(observer, 'job-commit', 'own-job', 'job-commit',
                    lambda: h.kernel.QueryInformationJobObject(self.job, 9, ctypes.byref(limits), ctypes.sizeof(limits), None)):
                observe_native_failure(observer, 'job-commit', 'job-commit', read_error)
                refuse('job-commit')
            committed = int(limits.peakJobMemoryUsed)  # observed peak >= current
        now = caps.get('clock', time.monotonic)()
        if self.workspace_snapshot is None or now - self.workspace_sampled_at >= 1:
            usage = caps.get('study_usage', study_usage)
            walk = caps.get('owned_usage', owned_usage)
            inspect = caps.get('checked', checked)
            exists = caps.get('exists', lambda path: path.exists())
            total, entries = usage(8192 * MIB, 344064, observer=observer)
            # Only actual directories with these exact fresh-owned names are
            # excluded; regular/special/reparse objects cannot hide as temp.
            evidence, _ = usage(32 * MIB, 344064, evidence=True, observer=observer)
            logs = result_bytes = batch_bytes = batch_entries = 0
            # Historical prepare output stays charged; only the fixed NEW leaf
            # is used for fresh preparation. No old output is adopted/deleted.
            for root in STUDY_WORKSPACES:
                for phase in ('prepare', PREPARE_LEAF, 'train-cal', 'test'):
                    log = root / phase / 'stderr.log'
                    scope = 'workspace-v1' if root == LEGACY_WORKSPACE else 'workspace-v2' if root == SECOND_WORKSPACE else 'workspace-v3' if root == THIRD_WORKSPACE else 'workspace-v4' if root == FOURTH_WORKSPACE else 'workspace-v5' if root == FIFTH_WORKSPACE else 'workspace-v6'
                    if resource_call(observer, 'log-stat', scope, 'stat', lambda: exists(log)):
                        item = resource_call(observer, 'log-stat', scope, 'stat', lambda: inspect(log, root))
                        resource_call(observer, 'log-stat', scope, 'stat', lambda: require(stat.S_ISREG(item.st_mode), 'log-type'))
                        logs += item.st_size
            result = self.output / 'result.json'
            if resource_call(observer, 'result-stat', 'workspace-v6', 'stat', lambda: exists(result)):
                item = resource_call(observer, 'result-stat', 'workspace-v6', 'stat', lambda: inspect(result, WORKSPACE))
                resource_call(observer, 'result-stat', 'workspace-v6', 'stat', lambda: require(stat.S_ISREG(item.st_mode), 'result-type'))
                result_bytes = item.st_size
            if self.guardian is not None:
                batch_dir = self.output / ('batch-' + str(min(self.guardian.index + 1, self.guardian.count)).zfill(2))
                if resource_call(observer, 'walk-stat', 'current-batch', 'stat', lambda: exists(batch_dir)):
                    batch_bytes, batch_entries = walk(batch_dir, 512 * MIB, 8192, observer=observer, scope='current-batch')
            temp_bytes, temp_entries = walk(self.phase_root / 'temp', 512 * MIB, 8192, observer=observer, scope='current-temp')
            batch_bytes += temp_bytes
            batch_entries += temp_entries
            self.workspace_snapshot = (total, entries, batch_bytes, batch_entries, evidence, logs, result_bytes)
            self.workspace_sampled_at = now
        total, entries, batch_bytes, batch_entries, evidence, logs, result_bytes = self.workspace_snapshot
        r = {'cpuSeconds': cpu, 'jobMembers': members, 'rssBytes': rss, 'privateBytes': private,
             'commitBytes': committed, 'hostPhysicalFree': int(status.availablePhysical),
             'hostCommitFree': int(status.availablePageFile),
             'cFree': resource_call(observer, 'drive-space', 'C', 'disk-usage', lambda: caps.get('disk_usage', shutil.disk_usage)('C:/').free),
             'dFree': resource_call(observer, 'drive-space', 'D', 'disk-usage', lambda: caps.get('disk_usage', shutil.disk_usage)('D:/').free), 'batchBytes': batch_bytes, 'batchEntries': batch_entries,
             'studyBytes': total, 'studyEntries': entries, 'evidenceBytes': evidence,
             'logBytes': logs, 'resultBytes': result_bytes}
        for key, value in [('peakRssBytes', rss), ('peakPrivateBytes', private), ('peakJobMembers', members),
                           ('peakCpuSeconds', cpu), ('peakStudyBytes', total), ('peakStudyEntries', entries)]:
            self.stats[key] = max(self.stats[key], value)
        return r

    def raw_guard(self, cleanup=False):
        if self.failure and not cleanup:
            refuse(self.failure)
        now = time.monotonic()
        if now - self.started >= self.phase_active + (60 if cleanup else 0):
            refuse('phase-deadline')
        if not cleanup:
            self.post_complete_guard()
        if self.job:
            r = self.raw_resources()
            if r['cpuSeconds'] < self.last_cpu or r['cpuSeconds'] > self.phase_cpu:
                refuse('phase-cpu')
            self.last_cpu = r['cpuSeconds']
            require(max(r['rssBytes'], r['privateBytes'], r['commitBytes']) <= 1536 * MIB and r['jobMembers'] <= 128, 'job-resource')
            require(min(r['hostPhysicalFree'], r['hostCommitFree']) >= 1024 * MIB and r['cFree'] >= 2048 * MIB and r['dFree'] >= 4096 * MIB, 'headroom')
            # raw_resources sums CURRENT batch plus phase temp. Their separate
            # individual walkers are not sufficient to establish this ceiling.
            require(r['batchBytes'] <= 512 * MIB and r['batchEntries'] <= 8192 and
                    r['studyBytes'] <= 8192 * MIB and r['studyEntries'] <= 344064, 'disk-capacity')
            require(r['evidenceBytes'] <= 32 * MIB and r['logBytes'] <= MIB and r['resultBytes'] <= 524288, 'evidence-capacity')
        if not cleanup:
            self.post_complete_guard()

    def post_complete_guard(self):
        if self.guardian is not None and self.guardian.state == 'complete':
            # Completion is not a fresh lease. Keep original model/checks
            # deadlines through ACK publication, completion validation and exit.
            held_model_deadline(self.phase, self.model_clock, time.monotonic())

    def guarded(self):
        if self.frame_until is not None and time.monotonic() >= self.frame_until:
            refuse('proof-frame-deadline')
        if self.guardian is None or self.guardian.state == 'complete':
            self.raw_guard()
            if self.guardian is not None and self.guardian.state == 'complete' and not self._confirming_exit:
                self.sample()  # exact identities remain enforced after complete
        else:
            self.guardian.check()

    def identify(self, handle):
        value = self.helper.process_identity(handle)
        return {'pid': value['pid'], 'creationFiletime': str(value['creationFiletime']),
                **self.helper.image_identity(value['imagePath']), 'imagePathHashEncoding': self.helper.IMAGE_HASH_ENCODING}

    def sample(self):
        self.raw_guard()
        previous = self.enumeration_until
        self.enumeration_until = min(previous, time.monotonic() + 2) if previous is not None else time.monotonic() + 2
        try:
            result = self.census.inspect_growing_job(self.job, list_members=self.member_ids,
                        open_member=lambda pid: self.helper.kernel.OpenProcess(0x1000, False, pid),
                        belongs=self.helper.process_belongs, identity=self.identify,
                        close_member=self.helper.kernel.CloseHandle, validate_row=self.policy.accept)
        finally:
            self.enumeration_until = previous
        self.policy.final(result)
        self.raw_guard()
        return result

    def baseline_rows(self):
        require(self.child.poll() is None, 'node-exited-before-ack')
        return [projection(row) for row in self.sample()['currentRows']]

    def recheck(self, ignored=None):
        self.guarded()
        fresh, _ = authenticate_sources(self.literal_pin, self.sources, read=self.read_file, guard=self.raw_guard)
        require(fresh == self.sources, 'source-drift')
        fixed = REVIEWED_SOURCE_MAP if self.phase == 'prepare' else PREPARED_FREEZE
        require(sha(self.read_file(fixed, 262144)) == self.source_identity, 'source-context-drift')
        if self.bootstrap_bytes is not None:
            require(self.read_file(self.phase_root / 'bootstrap.json', 16384) == self.bootstrap_bytes, 'bootstrap-drift')
        for key, original in self.test_bundle.items():
            require(key in TEST_AUDIT_PATHS and self.read_file(TEST_AUDIT_PATHS[key], 524288) == original, 'test-bundle-drift')
        if self.guardian is not None and (self.guardian.drain_started is not None or self.guardian.model_started is not None):
            index = min(self.guardian.index, self.guardian.count - 1)
            ids = self.frozen['batchIds'][self.phase]
            targets = range(self.guardian.count) if self.guardian.model_started is not None else [index]
            for i in targets:
                stage_layout(self.output / ('batch-' + str(i + 1).zfill(2)) / 'extension', self.frozen['batchStageHashes'][ids[i]], read=self.read_file)
                self.guarded()
        self.guarded()
        return True

    def read_file(self, path, maximum=4194304, root=REPO):
        key = next((name for name, fixed in self.allowed.items() if fixed == path), None)
        if key is None:
            try:
                relative = path.relative_to(self.output).as_posix()
            except ValueError:
                refuse('parent-read-scope')
            key = 'workspace:' + relative
            self.allowed[key] = path
        before = self.native_proof(key)
        data = read_fixed(path, maximum, root)
        after = self.native_proof(key)
        require(all(before['identity'][k] == after['identity'][k] for k in ('volumeSerial', 'fileIndex', 'creationFiletime')), 'parent-read-identity')
        return data

    def read_control(self, name, maximum=16384):
        path = self.output / name
        data = self.read_file(path, maximum, WORKSPACE)
        require(self.read_file(Path(str(path) + '.pending'), maximum, WORKSPACE) == data, 'publication-drift')
        return data

    def parent_publish(self, path, data, before_link):
        self.workspace_snapshot = None  # fresh sampled capacity BEFORE publication
        self.guarded()
        current = self.raw_resources()
        require(current['studyBytes'] + 2 * len(data) <= 8192 * MIB and
                current['studyEntries'] + 2 <= 344064 and current['evidenceBytes'] + 2 * len(data) <= 32 * MIB, 'publication-capacity')
        result = publish(path, data, before_link)
        self.workspace_snapshot = None
        self.guarded()
        return result

    def native_proof(self, key):
        if key.startswith('audit:'):
            require(self.phase == 'test' and key in TEST_AUDIT_PATHS, 'proof-audit-phase')
        if key.startswith('control:'):
            permitted = {'control:source-list', 'control:bootstrap'}
            permitted.add('control:reviewed-sources' if self.phase == 'prepare' else 'control:freeze')
            require(key in permitted, 'proof-control-phase')
        if key.startswith('workspace:') and key != 'workspace:':
            relative = key[len('workspace:'):]
            if not re.fullmatch('[A-Za-z0-9._/-]{1,512}', relative) or relative.startswith('/') or len(relative.split('/')) > 16 or any(p in ('', '.', '..') for p in relative.split('/')):
                refuse('proof-workspace')
            self.allowed[key] = self.output / relative
        if key.startswith('asset:') and self.phase != 'prepare' and (self.guardian is None or self.guardian.model_started is None):
            refuse('asset-before-drain')
        k = self.helper.kernel
        def info(handle):
            value = NativeFileInformation()
            if not k.GetFileInformationByHandle(handle, ctypes.byref(value)):
                refuse('native-file-info')
            return {'attributes': int(value.attributes), 'identity': native_file_identity(value)}
        native = {'attributes': lambda p: int(k.GetFileAttributesW(str(p))),
                  'open': lambda p: k.CreateFileW(str(p), 0x80, 7, None, 3, 0x02000000 | 0x00200000, None),
                  'info': info, 'close': k.CloseHandle}
        return inspect_fixed_path(key, self.allowed, native, self.guarded)

    def start(self):
        if os.name != 'nt':
            refuse('windows-required')
        require(time.monotonic() - self.started < 30, 'bootstrap-deadline')
        self.bootstrap_until = self.started + 30
        self.helper.load_windows()
        configure_file_api(self.helper.kernel)
        require(shutil.disk_usage('C:/').free >= 2048 * MIB and shutil.disk_usage('D:/').free >= 4096 * MIB, 'headroom')
        WORKSPACE.mkdir(exist_ok=True)
        checked(WORKSPACE, REPO)
        self.phase_root.mkdir()  # parent namespace fresh/exclusive; never adopts
        (self.phase_root / 'temp').mkdir()
        self.bootstrap_guard()
        k = self.helper.kernel
        self.job = k.CreateJobObjectW(None, None)
        require(bool(self.job), 'job-create')
        limits = self.helper.ExtendedLimits()
        limits.basic.limitFlags = 0x2000 | 0x200 | 0x8
        limits.basic.activeProcessLimit = 128
        limits.jobMemoryLimit = 1536 * MIB
        require(bool(k.SetInformationJobObject(self.job, 9, ctypes.byref(limits), ctypes.sizeof(limits))), 'job-limit')
        self.bootstrap_guard()
        node, selected = self.helper.selected_node_path()
        require(str(node).replace('\\', '/').lower() == NODE.lower(), 'fixed-node')
        env = {key: value for key, value in os.environ.items() if key.upper() in {'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT'}}
        env.update(TEMP=str(self.phase_root / 'temp'), TMP=str(self.phase_root / 'temp'),
                   MURMINGLE_NATIVE_SPECIFICITY_SUPERVISED='1', OMP_NUM_THREADS='1',
                   UV_THREADPOOL_SIZE='1', MURMINGLE_NATIVE_SPECIFICITY_SOURCE_IDENTITY=self.source_identity,
                   MURMINGLE_NATIVE_SPECIFICITY_SOURCE_LIST=self.literal_pin)
        if self.phase == 'test':
            env['MURMINGLE_NATIVE_SPECIFICITY_TEST_AUDIT'] = self.test_audit_sha
        stderr = (self.phase_root / 'stderr.log').open('xb')
        self.output_handles.append(stderr)
        self.bootstrap_guard()  # MUST precede Popen, but not interrupt assignment
        command = '--prepare' if self.phase == 'prepare' else '--run-' + self.phase
        self.child = subprocess.Popen([str(node), '--max-old-space-size=256', str(HERE / 'execute.mjs'), command],
                    cwd=REPO, env=env, shell=False, creationflags=0x8,  # DETACHED_PROCESS, no console/breakaway.
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr)
        def retain(handle, assigned):
            self.original = handle
            self.assigned = assigned
        guarded_assignment(k, self.job, self.child, retain)
        self.bootstrap_guard()  # child is retained+assigned before deadline refusal
        actual = self.identify(self.original)
        require(actual['pid'] == self.child.pid and actual['imagePathSha256'] == selected['imagePathSha256'] and self.helper.process_belongs(self.original, self.job), 'original-node')
        initial = {**actual, 'confirmedOwnJob': True, 'inspectionStatus': 'confirmed'}
        self.policy = BaselinePolicy(initial, self.base, self.census, self.exit_proof)
        self.sample()
        node_hash = sha(wire(projection(initial)))
        bootstrap = {'schema': 'native-specificity-bootstrap/v1', 'phase': self.phase,
                     'sourceIdentityHash': self.source_identity,
                     'sourceIdentityKind': 'reviewed-source-map-file' if self.phase == 'prepare' else 'freeze-file',
                     'sourcePathsSha256': self.literal_pin, 'sourceMapHash': self.source_map_hash,
                     'testAuditSha256': self.test_audit_sha,
                     'originalNodePid': self.child.pid, 'originalNodeCreationFiletime': initial['creationFiletime'],
                     'nodeIdentityHash': node_hash}
        self.bootstrap_bytes = wire(bootstrap)
        self.parent_publish(self.phase_root / 'bootstrap.json', self.bootstrap_bytes, self.bootstrap_guard)
        self.service = ProofService(self.phase, self.source_identity, self.allowed, self.native_proof, self.guarded)
        self.reader = self.frames.start(self.child.stdout)
        self.child.stdin.write(HANDSHAKE)
        self.child.stdin.flush()  # remains OPEN for bounded proof ACK frames
        self.bootstrap_guard()
        until = min(self.started + 30, time.monotonic() + 15)
        self.enumeration_until = until  # Held READY/ACK lease, never reset per physical query.
        while True:
            handled = self.pump()
            self.bootstrap_guard()
            if self.child.poll() is not None:
                refuse('startup-exit')
            if time.monotonic() >= until:
                refuse('ready-deadline')
            if (self.output / 'ready.json').exists():
                ready_bytes = self.read_control('ready.json', 16384)
                self.bootstrap_guard()
                require(time.monotonic() < until, 'ready-deadline')
                ready = strict(ready_bytes)
                expected = {'schema': 'native-specificity-ready/v1', 'phase': self.phase,
                            'sourceIdentityHash': self.source_identity, 'sourceMapHash': self.source_map_hash,
                            'testAuditSha256': self.test_audit_sha,
                            'originalNodePid': self.child.pid, 'originalNodeCreationFiletime': initial['creationFiletime'],
                            'baselineHash': 'pending'}
                require(ready == expected and list(ready) == list(expected), 'ready-identity')
                break
            self.sample()
            pause_if_idle(handled, time.sleep, self.bootstrap_guard)
        self.ready_sha = sha(ready_bytes)
        # READY asserts bootstrap/header identity and fresh workspace, not child
        # ledger completion. Parent CODE authentication preceded Popen; child
        # full-ledger checks follow baseline ACK before network/model actions.
        self.sample()
        self.baseline = self.policy.seal()
        self.recheck()
        ack = {'schema': 'native-specificity-startup-ack/v1', 'phase': self.phase,
               'sourceIdentityHash': self.source_identity, 'sourceMapHash': self.source_map_hash,
               'testAuditSha256': self.test_audit_sha,
               'originalNodePid': self.child.pid, 'originalNodeCreationFiletime': initial['creationFiletime'],
               'readySha256': self.ready_sha, 'baseline': self.baseline, 'baselineHash': self.baseline['baselineHash']}
        def before_link():
            self.bootstrap_guard()
            require(time.monotonic() < until and self.child.poll() is None, 'startup-ack-deadline')
            self.sample()
            self.bootstrap_guard()
        self.startup_ack_sha = self.parent_publish(self.output / 'ack.json', wire(ack), before_link)
        self.enumeration_until = None
        self.bootstrap_until = None
        if self.phase != 'prepare':
            g = self.modules['guardian']
            config = {'phase': self.phase, 'freezeHash': self.frozen['freezeHash'],
                      'manifestHash': self.frozen['manifestHash'], 'nodeIdentityHash': node_hash,
                      'sourceMapHash': self.source_map_hash, 'batchIds': self.frozen['batchIds'][self.phase],
                      'node': projection(initial), 'console': None if self.baseline['console'] is None else projection(self.baseline['console'])}
            def guardian_publish(kind, raw, before):
                name = ('batch-' + str(self.guardian.index + 1).zfill(2) + '.drain.ack.json') if kind == 'batch-drain' else 'cohort.drain.ack.json'
                return self.parent_publish(self.output / name, raw, before)
            self.guardian = g.PhaseGuardian(config, {'clock': time.monotonic, 'resources': self.raw_resources,
                    'members': self.baseline_rows, 'census': self.baseline_rows, 'recheck': self.recheck,
                    'publish': guardian_publish}, started_at=self.started)

    def startup_bindings(self):
        return {'sourceMapHash': self.source_map_hash, 'nodeIdentityHash': sha(wire(projection(self.policy.node))),
                'readySha256': self.ready_sha, 'startupAckSha256': self.startup_ack_sha,
                'baselineHash': self.baseline['baselineHash']}

    def read_result(self):
        raw = self.read_control('result.json', 524288)
        self.guarded()
        value = strict_node_json(raw)
        selected = value.get('selectionSha256')
        selection = None
        if selected is not None:
            require(self.phase == 'train-cal', 'selection-phase')
            hash_value(selected)
            selection_raw = self.read_control('selection.json', 524288)
            require(sha(selection_raw) == selected, 'selection-bytes')
            selection = strict_node_json(selection_raw)
        else:
            for name in ('selection.json', 'selection.json.pending'):
                try:
                    (self.output / name).lstat()  # Lexical presence, NEVER follow a dangling link/reparse target.
                except FileNotFoundError:
                    continue
                refuse('unexpected-selection')
        if self.phase == 'prepare':
            exact(value, ('schema', 'phase', 'sourceIdentityHash', 'sourceMapHash', 'nodeIdentityHash', 'readySha256',
                          'startupAckSha256', 'baselineHash', 'freezeSha256', 'fsProofCheckpoint',
                          'sourceAssetEndchecksPassed', 'productionValidated', 'assignmentAuthority'))
            require(value['schema'] == 'native-specificity-study-prepared/v1' and value['phase'] == 'prepare' and
                    value['sourceIdentityHash'] == self.source_identity and value['sourceAssetEndchecksPassed'] is True and
                    value['productionValidated'] is False and value['assignmentAuthority'] is False, 'prepare-result')
            for key, expected in self.startup_bindings().items():
                require(value[key] == expected, 'prepare-result')
            # Prepare publishes only inside its fresh Node-owned workspace.
            # Authenticate both retained pending/final bytes, never promote it
            # outside IO ownership or follow a path supplied by the result.
            fresh_freeze = self.read_control('freeze.json', 262144)
            decode_freeze(fresh_freeze, value['freezeSha256'], self.literal_pin)
        else:
            checked_result = validate_phase_result(raw, self.phase, self.frozen, self.startup_bindings(), selected)
            validate_selection_semantics(checked_result['result'], self.phase, selected, selection)
        self.service.accept_checkpoint('result', value['fsProofCheckpoint'])
        return raw, selected

    def finish(self):
        while not (self.output / 'finish.request.json').exists():
            handled = self.pump()
            require(self.child.poll() is None, 'node-exited-before-finish')
            pause_if_idle(handled, time.sleep, self.guarded)
        observed = time.monotonic()
        self.guarded()
        request_raw = self.read_control('finish.request.json', 16384)
        request = exact(strict(request_raw), ('schema', 'phase', 'sourceIdentityHash', 'sourceMapHash', 'nodeIdentityHash',
                'readySha256', 'startupAckSha256', 'baselineHash', 'resultSha256', 'selectionSha256',
                'finalDrainAckHash', 'fsProofCheckpoint'))
        expected = {'schema': 'native-specificity-finish-request/v1', 'phase': self.phase,
                    'sourceIdentityHash': self.source_identity, **self.startup_bindings(),
                    'resultSha256': request['resultSha256'], 'selectionSha256': request['selectionSha256'],
                    'finalDrainAckHash': None if self.guardian is None else self.guardian.previous_ack,
                    'fsProofCheckpoint': request['fsProofCheckpoint']}
        require(request == expected, 'finish-request')
        # Match the checkpoint now, before lengthy result/source checks.
        self.service.checkpoint_matches(request['fsProofCheckpoint'])
        result_raw, selected = self.read_result()
        require(request['resultSha256'] == sha(result_raw) and request['selectionSha256'] == selected, 'finish-bytes')
        self.service.accept_checkpoint('finish', request['fsProofCheckpoint'])
        self.recheck()
        # Serve remaining publication checks until their ORIGINAL proofs settle.
        # The unchanged fixed lease is never restarted by a successful frame.
        while self.service.before or self.service.prepared is not None or not self.frames.frames.empty():
            require(time.monotonic() - observed < 15, 'finish-deadline')
            handled = self.pump()
            pause_if_idle(handled, time.sleep, self.guarded)
        require(not self.pending_physical and self.child.poll() is None, 'finish-pending')
        guardian_complete = None if self.guardian is None else self.guardian.complete()
        self.raw_guard()
        self.sample()
        ack = {'schema': 'native-specificity-finish-ack/v1', 'phase': self.phase,
               'sourceIdentityHash': self.source_identity, **self.startup_bindings(),
               'requestHash': sha(request_raw), 'resultSha256': sha(result_raw), 'selectionSha256': selected}
        def before_link():
            self.raw_guard()
            require(time.monotonic() - observed < 15 and self.child.poll() is None, 'finish-deadline')
            self.sample()
            require(not self.pending_physical and self.service.prepared is None and not self.service.before, 'finish-pending')
        self.finish_request_sha = sha(request_raw)
        self.finish_ack_sha = sha(wire(ack))
        self.result_sha = sha(result_raw)
        self.selection_sha = selected
        self.guardian_complete = guardian_complete
        self.native_result = strict_node_json(result_raw)
        require(self.parent_publish(self.output / 'finish.ack.json', wire(ack), before_link) == self.finish_ack_sha, 'finish-ack')

    def exit_proof(self):
        if self.exit_confirmed:
            return True
        if self.child.poll() != 0:
            return False
        require(time.monotonic() - self.started < self.phase_active, 'exit-deadline')
        self.post_complete_guard()
        require(self.native_result is not None, 'exit-before-finish')
        require(not self._confirming_exit, 'exit-reentry')
        self._confirming_exit = True
        try:
            raw = self.read_control('completion.json', 16384)
            c = exact(strict(raw), ('schema', 'phase', 'sourceIdentityHash', 'sourceMapHash', 'nodeIdentityHash',
                    'readySha256', 'startupAckSha256', 'baselineHash', 'finishRequestSha256', 'finishAckSha256',
                    'resultSha256', 'selectionSha256', 'finalDrainAckHash', 'fsProofCheckpoint'))
            self.service.accept_checkpoint('completion', c['fsProofCheckpoint'])
            expected = {'schema': 'native-specificity-study-complete/v1', 'phase': self.phase,
                        'sourceIdentityHash': self.source_identity, **self.startup_bindings(),
                        'finishRequestSha256': self.finish_request_sha, 'finishAckSha256': self.finish_ack_sha,
                        'resultSha256': self.result_sha, 'selectionSha256': self.selection_sha,
                        'finalDrainAckHash': None if self.guardian is None else self.guardian.previous_ack,
                        'fsProofCheckpoint': c['fsProofCheckpoint']}
            require(c == expected and sha(self.read_control('result.json', 524288)) == self.result_sha and
                    sha(self.read_control('finish.ack.json', 16384)) == self.finish_ack_sha, 'completion')
            self.post_complete_guard()
            self.exit_confirmed = True
            return True
        finally:
            self._confirming_exit = False

    def run(self):
        self.start()
        if self.phase != 'prepare':
            control = PhaseControl(self.guardian, lambda p: (self.output / p).exists(),
                    lambda p, maximum: self.read_control(p, maximum),
                    lambda p, data, before: self.parent_publish(self.output / p, data, before), self.child.poll,
                    lambda: self.member_ids(self.job), self.recheck, self.pump, time.sleep, time.monotonic)
            self.control_result = control.run()
            self.model_clock = control.model_clock()
        self.finish()
        while self.child.poll() is None:
            handled = self.pump()
            pause_if_idle(handled, time.sleep, self.guarded)
        require(self.exit_proof(), 'normal-exit')
        until = min(self.started + self.phase_active + 60, time.monotonic() + 5)
        self.enumeration_until = until
        while self.member_ids(self.job, until=until):
            self.sample()
            require(time.monotonic() < until, 'normal-empty-job-deadline')
            time.sleep(.02)
        self.enumeration_until = None
        self.reader.join(timeout=1)
        require(not self.reader.is_alive() and self.frames.finished and self.frames.next() is None and
                not self.service.before and self.service.prepared is None and not self.pending_physical, 'physical-unsettled')
        self.recheck()
        require(not self.member_ids(self.job, until=until), 'normal-empty-job')
        return {'normalExit': True, 'exitCode': 0, 'normalEmptyJob': True, 'endchecksPassed': True,
                'resultSha256': self.result_sha, 'selectionSha256': self.selection_sha,
                'guardianComplete': self.guardian_complete, 'stats': {**self.stats,
                    'fsProofSequence': self.service.sequence, 'fsProofChainHash': self.service.chain,
                    'fsProofWireBytes': self.service.bytes, 'fsProofMaximumFrame': self.service.maximum,
                    'fsProofCheckpoints': self.service.named_checkpoints, 'rawProofFramesRetained': False}}

    def close(self):
        self.resource_observer.in_cleanup = True  # Observation context only, no cleanup change.
        until = min(self.started + self.phase_active + 60, time.monotonic() + 60)
        self.cleanup_until = until
        h = self.helper
        membership_error = None
        try:
            live = self.job and self.member_ids(self.job, cleanup=True, until=until)
        except Exception as error:
            membership_error = error
            live = True  # UNKNOWN is never empty and must not skip own-Job cleanup.
        if live or self.child is not None and self.child.poll() is None:
            self.emergency = True
            if self.assigned:
                require(bool(h.kernel.TerminateJobObject(self.job, 1)), 'own-job-emergency-failed')
            elif self.child is not None:
                self.child.kill()  # exact retained Popen, PREassignment failure ONLY
        while True:
            require(time.monotonic() < until, 'own-cleanup-deadline')
            try:
                live = self.job and self.member_ids(self.job, cleanup=True, until=until)
            except Exception as error:
                membership_error = membership_error or error
                live = True
                # No enumeration retry authorizes work. The own assigned Job
                # must still receive emergency termination before physical wait.
                if self.assigned and not self.emergency:
                    self.emergency = True
                    require(bool(h.kernel.TerminateJobObject(self.job, 1)), 'own-job-emergency-failed')
                break
            if not live and (self.child is None or self.child.poll() is not None):
                break
            time.sleep(.02)
        if self.child is not None:
            self.child.wait(timeout=max(.01, until - time.monotonic()))
            if self.child.stdin is not None:
                self.child.stdin.close()
            if self.child.stdout is not None:
                self.child.stdout.close()
        if self.job:
            try:
                require(not self.member_ids(self.job, cleanup=True, until=until), 'normal-empty-job')
            except Exception as error:
                membership_error = membership_error or error
        if self.reader is not None:
            self.reader.join(timeout=max(.01, min(2, until - time.monotonic())))
            require(not self.reader.is_alive(), 'pipe-reader-unsettled')
        for writer in self.writers:
            writer.join(timeout=max(.01, min(2, until - time.monotonic())))
            require(not writer.is_alive(), 'pipe-writer-unsettled')
        require(not self.pending_physical, 'physical-unsettled')
        for handle in self.output_handles:
            handle.close()
        if self.original:
            require(bool(h.kernel.CloseHandle(self.original)), 'original-close')
            self.original = None
        if self.job:
            require(bool(h.kernel.CloseHandle(self.job)), 'job-close')
            self.job = None
        if membership_error is not None:
            raise membership_error
        return True

    def pump(self):
        self.guarded()
        raw = self.frames.next()
        if raw is not None:
            self.frame_until = time.monotonic() + 15  # FIRST observed frame, before parse/proof IO
            self.guarded()
            # Admit only the fixed owned phase workspace grammar, never a raw
            # external path. Native metadata is queried only AFTER full frame
            # schema/sequence/chain validation inside ProofService.answer.
            request = strict(raw)
            for key in (request.get('pathKey'), request.get('parentPathKey')):
                if type(key) is str and key.startswith('workspace:') and key != 'workspace:':
                    relative = key[len('workspace:'):]
                    if not re.fullmatch('[A-Za-z0-9._/-]{1,512}', relative) or relative.startswith('/') or len(relative.split('/')) > 16 or any(p in ('', '.', '..') for p in relative.split('/')):
                        refuse('proof-workspace')
                    self.allowed[key] = self.output / relative
                    self.service.allowed[key] = self.allowed[key]
            ack = self.service.answer(raw)
            self.guarded()
            def write_original():
                self.child.stdin.write(ack + b'\n')
                self.child.stdin.flush()
            self.writers = [writer for writer in self.writers if writer.is_alive()]
            require(not self.writers, 'pipe-writer-reentry')
            tracked_pipe_write(write_original, self.pending_physical, self.guarded,
                               self.frame_until, self.writers.append)
            self.guarded()
            self.service.commit_written(ack)
            self.frame_until = None
        self.guarded()
        return raw is not None


RELEASE_LITERAL = b"export const ACTUAL_EXECUTION_RELEASE='adr186-reviewed-execution/v1';"


GUARDIAN_FAILURE_CODES = frozenset({
    'contract', 'identity', 'request', 'clock-start', 'clock', 'terminal',
    'callback-state', 'resources', 'cpu-regressed', 'phase-deadline', 'phase-cpu',
    'capture-cpu', 'capture-deadline', 'drain-deadline', 'batch-deadline', 'batch-cpu',
    'model-deadline', 'model-stage-deadline', 'memory', 'headroom', 'disk', 'evidence',
    'operation', 'publish-reentry', 'async-capability', 'batch-order', 'membership',
    'census', 'pending', 'source-stage', 'publication', 'request-observation',
    'batch-request', 'cohort-request', 'model-order', 'completion', 'owner-failure',
    'physical-unsettled', 'normal-drain-failed', 'io-members', 'io-census',
    'io-recheck', 'io-publish', 'io-native',
})
CENSUS_FAILURE_CODES = frozenset({
    'census-deadline', 'census-capacity', 'census-round-capacity', 'census-row-capacity',
    'census-membership-unverifiable', 'census-open-live-failed', 'census-job-live-failed',
    'census-identity-live-failed', 'census-identity-contract', 'census-identity-changed',
    'census-close-failed', 'census-handle-alias', 'census-callback-failed',
    'policy-rejected', 'policy-unknown-member', 'policy-node-missing',
    'policy-identity-conflict', 'policy-late-member', 'policy-gone-unknown',
    'policy-scope-capacity', 'baseline-contract',
})
SUPERVISOR_FAILURE_CODES = frozenset({
    'bootstrap-deadline', 'headroom', 'phase-deadline', 'phase-cpu', 'job-resource',
    'source-drift', 'source-context-drift', 'normal-exit', 'normal-empty-job',
    'normal-empty-job-deadline', 'physical-unsettled', 'ready-deadline', 'startup-exit',
    'finish-deadline', 'finish-pending', 'completion', 'proof-channel', 'proof-checkpoint',
    'model-deadline', 'model-stage-deadline', 'post-complete-clock', 'disk-capacity',
    'combined-workspace-capacity', 'job-pid-list-unverifiable-or-overflow', 'job-pid-capacity',
    'job-pid-prefix', 'job-enumeration-counter', 'census-deadline', 'capture-deadline',
    'batch-deadline', 'drain-deadline',
})


def failure_projection(error, modules):
    """Only exact classes from already authenticated private modules carry codes.

    Never stringify an exception or persist args, messages, stack, partial rows,
    paths or caller-selected class names. Unknown/subclass/forged codes sanitize.
    """
    generic = {'family': 'supervisor', 'code': 'supervisor-failed'}
    for name, class_name, allowed in (
            ('guardian', 'GuardianFailure', GUARDIAN_FAILURE_CODES),
            ('census', 'CensusFailure', CENSUS_FAILURE_CODES)):
        module = modules.get(name)
        cls = None if module is None else module.__dict__.get(class_name)
        if cls is not None and type(error) is cls:
            own = object.__getattribute__(error, '__dict__')
            code = own.get('code')
            if type(code) is not str or code not in allowed:
                return generic, None
            cleanup_code = own.get('cleanupCode')
            cleanup = ({'family': 'census', 'code': 'census-close-failed'}
                       if name == 'census' and type(cleanup_code) is str and cleanup_code == 'census-close-failed' else None)
            return {'family': name, 'code': code}, cleanup
    if type(error) is RuntimeError:
        args = object.__getattribute__(error, 'args')
        if len(args) == 1 and type(args[0]) is str and args[0] in SUPERVISOR_FAILURE_CODES:
            return {'family': 'supervisor', 'code': args[0]}, None
    return generic, None


def run_session(phase, started, sources, buffers, source_identity, literal_pin, frozen,
                test_audit_sha=None, test_bundle=None):
    session = NativeSession(phase, started, sources, buffers, source_identity, literal_pin, frozen, test_audit_sha, test_bundle)
    outcome = None
    failure = None
    cleanup_failure = None
    cleaned = False
    try:
        outcome = session.run()
    except Exception as error:
        failure, cleanup_failure = failure_projection(error, session.modules)
        session.failure = failure['code']
    finally:
        try:
            cleaned = session.close()
        except Exception as error:
            reason, nested_cleanup = failure_projection(error, session.modules)
            cleanup_failure = cleanup_failure or nested_cleanup or reason
            failure = failure or {'family': 'supervisor', 'code': 'own-cleanup-failed'}
    passed = outcome is not None and cleaned is True and not session.emergency and failure is None
    if failure is not None:
        observation = {'collectorPrimary': None, 'collectorCleanup': None, 'guardian': None}
        try:
            observation = session.resource_diagnostic()
        except Exception:
            pass  # Diagnostic failure cannot change the held failure/cleanup.
        failure = {**failure, 'resourceObservation': observation}
    body = {'schema': 'native-specificity-study-supervisor/v1', 'phase': phase,
            'sourceIdentityHash': source_identity, 'sourceIdentityKind': 'reviewed-source-map-file' if phase == 'prepare' else 'freeze-file',
            'freezeHash': None if frozen is None else frozen['freezeHash'],
            'sourceMapHash': sha(wire(dict(sorted(sources.items())))),
            'nodeIdentityHash': None if session.policy is None else sha(wire(projection(session.policy.node))),
            'normalExit': bool(passed), 'exitCode': None if session.child is None else session.child.poll(),
            'normalEmptyJob': bool(passed), 'endchecksPassed': bool(passed),
            'resultSha256': None if outcome is None else outcome['resultSha256'],
            'selectionSha256': None if outcome is None else outcome['selectionSha256'],
            'guardianComplete': None if outcome is None else outcome['guardianComplete'],
            'stats': {**(dict(session.stats) if outcome is None else outcome['stats']),
                      'jobEnumeration': dict(session.stats.get('jobEnumeration', enumeration_stats()))},
            'emergencyOwnJobTermination': session.emergency, 'ownCleanupPassed': cleaned is True,
            'failure': failure, 'cleanupFailure': cleanup_failure,
            'productionValidated': False, 'assignmentAuthority': False}
    report = wire({**body, 'supervisorHash': sha(wire(body))})
    require(len(report) <= 524288, 'supervisor-capacity')
    if session.phase_root.exists():
        # Native work has physically exited. Publication remains fixed-owned,
        # exclusive and metadata-only, without restarting a work lease.
        def final_reserve():
            require(time.monotonic() - started < session.phase_active + 60, 'report-deadline')
            report_reserve(len(report), observer=session.resource_observer)
        publish(session.phase_root / 'supervisor.json', report, final_reserve)
    return 0 if passed else 1


def main(argv=None, read=read_fixed, packages=package_files, run=run_session, clock=time.monotonic,
         authenticate=authenticate_sources):
    args = sys.argv[1:] if argv is None else argv
    if not args:
        return 0
    started = clock()  # ORIGINAL phase epoch, before inventory or native setup
    if type(args) is not list or len(args) not in (5, 7) or args[0] not in ('--prepare', '--run-train-cal', '--run-test') or args[1] != '--source-paths-sha256':
        refuse('arguments')
    phase = 'prepare' if args[0] == '--prepare' else args[0][len('--run-'):]
    literal_pin = hash_value(args[2])
    expected_option = '--source-map-sha256' if phase == 'prepare' else '--freeze-sha256'
    require(args[3] == expected_option, 'arguments')
    identity_pin = hash_value(args[4])
    require(len(args) == (7 if phase == 'test' else 5), 'arguments')
    test_audit_sha = None
    if phase == 'test':
        require(args[5] == '--selection-audit-sha256', 'arguments')
        test_audit_sha = hash_value(args[6])
    active = 60 if phase == 'prepare' else 9420 if phase == 'train-cal' else 7005
    def preflight():
        require(0 <= clock() - started < min(30, active), 'bootstrap-deadline')
    preflight()
    path = REVIEWED_SOURCE_MAP if phase == 'prepare' else PREPARED_FREEZE
    raw = read(path, 262144)
    preflight()
    context = decode_reviewed_sources(raw, identity_pin, literal_pin) if phase == 'prepare' else decode_freeze(raw, identity_pin, literal_pin)
    sources, buffers = authenticate(literal_pin, context['sourceHashes'], read, packages, preflight)
    # A prospective Source-only release checkpoint. Root adds this literal ONLY
    # after actual CLI/IO/parent review; it is NOT execution permission itself.
    if RELEASE_LITERAL not in buffers[OWN + 'execute.mjs'].splitlines():
        refuse('execution-wire-not-released')
    preflight()
    require(read(path, 262144) == raw, 'initial-context-drift')
    preflight()
    bundle = None if phase != 'test' else authenticate_test_bundle(test_audit_sha, context, identity_pin,
                          sha(wire(dict(sorted(sources.items())))), read, preflight)
    return run(phase, started, sources, buffers, identity_pin, literal_pin,
               None if phase == 'prepare' else context, test_audit_sha, bundle)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        # No arbitrary exception repr/traceback or source paths on stdout/stderr.
        sys.stderr.write('{"schema":"native-specificity-parent-refusal/v1","code":"parent-refused"}\n')
        raise SystemExit(1)
