"""ADR153 default-inert owned Node bootstrap census. No browser/model code."""
import ctypes
from ctypes import wintypes
import hashlib
import json
import ntpath
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time

MIB = 1048576
MEMORY_LIMIT = 1536 * MIB
PROFILE_MAX_BYTES = 256 * 1024
PROFILE_MAX_ENTRIES = 256
ACTIVE_LIMIT = 30
WALL_LIMIT = 40
CENSUS_SECONDS = 2
IMAGE_BUFFER_UNITS = 32768
IMAGE_HASH_ENCODING = 'win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1'
SELECTED_NODE = 'C:/Program Files/nodejs/node.exe'
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
OWN = 'spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/'
BASE = 'spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/'
OLD = 'spikes/topic-resolution/harness/experimental/native-extension-startup-dev-v1/'
BASE_FREEZE = BASE + 'freeze.json'
OLD_FREEZE = OLD + 'freeze.json'
BASE_FREEZE_SHA = '770eb68ef044dadbb6ef0f2edf2c927b643480e7d06cbf496319b1cab9d457ec'
OLD_FREEZE_SHA = '0d470f5315e9c7cd9fe910ccae91ffad67119a5e356d5c21f7bd62bebf9ac021'
OLD_ADDITIONS = [OLD + x for x in ('run.mjs', 'run.test.mjs', 'protocol.json', 'README.md', 'supervise.py', 'supervise.test.mjs')] + ['decisions/ADR-151-native-extension-startup-diagnostic.md']
NEW_ADDITIONS = [OWN + x for x in ('node.mjs', 'run.py', 'test.mjs', 'README.md')] + ['decisions/ADR-153-owned-node-bootstrap-process-census.md']
DEV = 'spikes/topic-resolution/harness/experimental/playwright-dev-v1/'
PACKAGE_ROOT = REPO / DEV / 'node_modules/playwright-core'
PACKAGE_PREFIX = 'node_modules/playwright-core/'
PACKAGE_INTEGRITY = 'sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ=='
OUTPUT = HERE / 'output'

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


def load_windows():
    global kernel, psapi
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
    kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4
    kernel.GetProcessId.argtypes = [wintypes.HANDLE]
    kernel.GetProcessId.restype = wintypes.DWORD

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
                        if metadata.st_size > 65536:
                            raise RuntimeError('evidence-file-capacity')
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
    if BASE + 'source-paths.js' not in names or BASE + 'supervise.py' not in names or BASE + 'run.mjs' not in names:
        raise RuntimeError('source-code-literal-closure')
    return names

def source_snapshot():
    # Authenticate fixed metadata and the fixed CODE literal BEFORE following
    # any path in that literal. Evidence JSON supplies only the fixed-key hash.
    base_bytes = bounded_bytes(REPO / BASE_FREEZE, 65536)
    if sha(base_bytes) != BASE_FREEZE_SHA:
        raise RuntimeError('base-freeze-drift')
    base_metadata = strict_json(base_bytes)
    if type(base_metadata) is not dict or base_metadata.get('schema') != 'native-reader-root-transfer-freeze/v1' or type(base_metadata.get('sourceHashes')) is not dict:
        raise RuntimeError('base-source-schema')
    literal = bounded_bytes(REPO / BASE / 'source-paths.js')
    literal_pin = hash_value(base_metadata['sourceHashes'].get(BASE + 'source-paths.js'))
    if sha(literal) != literal_pin:
        raise RuntimeError('source-code-literal-pin')
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
        data = literal if name == BASE + 'source-paths.js' else bounded_bytes(path)
        hashes[name], buffers[name] = sha(data), data
    # Fresh exact check fences drift of the literal during the inventory.
    if bounded_bytes(REPO / BASE / 'source-paths.js') != literal:
        raise RuntimeError('source-code-literal-drift')
    pkg = strict_json(buffers[PACKAGE_PREFIX + 'package.json'])
    lock = strict_json(buffers[DEV + 'package-lock.json'])
    if pkg.get('name') != 'playwright-core' or pkg.get('version') != '1.64.1' or lock.get('packages', {}).get('node_modules/playwright-core', {}).get('integrity') != PACKAGE_INTEGRITY:
        raise RuntimeError('reviewed-package-identity')
    metadata = base_metadata
    if type(metadata) is not dict or metadata.get('schema') != 'native-reader-root-transfer-freeze/v1' or metadata.get('sourceHashes') != hashes or list(metadata['sourceHashes']) != list(hashes):
        raise RuntimeError('base-source-mismatch')
    for name in OLD_ADDITIONS:
        hashes[name] = sha(bounded_bytes(REPO / name))
    hashes[BASE_FREEZE] = sha(base_bytes)
    old_bytes = bounded_bytes(REPO / OLD_FREEZE, 65536)
    if sha(old_bytes) != OLD_FREEZE_SHA:
        raise RuntimeError('old-freeze-drift')
    metadata = strict_json(old_bytes)
    if type(metadata) is not dict or metadata.get('schema') != 'native-extension-startup-dev-freeze/v1' or metadata.get('sourceHashes') != hashes or list(metadata['sourceHashes']) != list(hashes) or len(hashes) != 195:
        raise RuntimeError('old-source-mismatch')
    for name in NEW_ADDITIONS:
        hashes[name] = sha(bounded_bytes(REPO / name))
    hashes[OLD_FREEZE] = sha(old_bytes)
    if len(hashes) != 201 or len(hashes) > 256:
        raise RuntimeError('full-source-count')
    if bounded_bytes(REPO / BASE_FREEZE, 65536) != base_bytes or bounded_bytes(REPO / OLD_FREEZE, 65536) != old_bytes:
        raise RuntimeError('fixed-metadata-read-drift')
    return hashes


def image_identity(raw):
    if type(raw) is not str or not 0 < len(raw) < IMAGE_BUFFER_UNITS or any(ord(c) < 32 or 0xd800 <= ord(c) <= 0xdfff for c in raw):
        raise RuntimeError('image-path-unverifiable')
    value = raw.replace('/', '\\')
    if value.startswith('\\\\?\\UNC\\'):
        value = '\\\\' + value[8:]
    elif value.startswith('\\\\?\\'):
        value = value[4:]
    if not (re.match(r'^[A-Za-z]:\\', value) or re.match(r'^\\\\[^\\]+\\[^\\]+\\', value)):
        raise RuntimeError('image-path-not-absolute')
    parts = value.split('\\')
    if any(part in ('.', '..') for part in parts) or value.endswith('\\'):
        raise RuntimeError('image-path-lexical-contract')
    normalized = ''.join(chr(ord(c) + 32) if 'A' <= c <= 'Z' else c for c in value)
    basename = ntpath.basename(value)
    if not 0 < len(basename) <= 128 or any(ord(c) < 32 or ord(c) == 127 for c in basename):
        raise RuntimeError('image-basename-capacity')
    return {'imageBasename':basename, 'imagePathSha256':sha((IMAGE_HASH_ENCODING + '\0' + normalized).encode('utf8'))}

class CensusFailure(RuntimeError):
    def __init__(self, code, rows):
        super().__init__(code)
        self.rows = rows

CENSUS_ERRORS = {'census-deadline', 'census-snapshot-overflow', 'census-membership-drift', 'census-member-inspection-failed',
    'metadata-counter', 'image-path-unverifiable', 'image-path-not-absolute', 'image-path-lexical-contract', 'image-basename-capacity'}

def inspect_job_members(job, observed, list_members, open_member, belongs, identity, close_member, clock=time.monotonic):
    # Testable identity projection. No process is opened except a just-enumerated
    # member; absence is established only through this same Job, never PID lookup.
    rows = []
    until = clock() + CENSUS_SECONDS
    def fresh():
        if clock() >= until:
            raise RuntimeError('census-deadline')
        ids = list_members(job)
        if type(ids) is not list or len(ids) > 8 or len(set(ids)) != len(ids):
            raise RuntimeError('census-snapshot-overflow')
        for pid in ids:
            count(pid, 0xffffffff, 1)
        return ids
    try:
        if type(observed) is not list or len(observed) > 8 or len(set(observed)) != len(observed):
            raise RuntimeError('census-snapshot-overflow')
        for pid in observed:
            count(pid, 0xffffffff, 1)
        current = fresh()
        pids = list(dict.fromkeys(observed + current))
        if len(pids) > 8:
            raise RuntimeError('census-snapshot-overflow')
        for pid in pids:
            row = {'pid':pid, 'creationFiletime':None, 'imageBasename':None, 'imagePathSha256':None,
                'imagePathHashEncoding':IMAGE_HASH_ENCODING, 'confirmedOwnJob':None, 'inspectionStatus':'gone'}
            if pid not in fresh():
                rows.append(row)
                continue
            handle = None
            try:
                handle = open_member(pid)
                if not handle or not belongs(handle, job):
                    raise RuntimeError('census-open-or-membership-failed')
                data = identity(handle)
                exact_fields(data, ['pid', 'creationFiletime', 'imagePath'])
                if data['pid'] != pid or type(data['pid']) is not int:
                    raise RuntimeError('census-handle-pid-mismatch')
                count(data['creationFiletime'], (1 << 64) - 1, 1)
                projected = image_identity(data['imagePath'])
                if not belongs(handle, job):
                    raise RuntimeError('census-membership-changed')
                if pid not in fresh():
                    rows.append(row)
                    continue
                row.update(creationFiletime=str(data['creationFiletime']), **projected, confirmedOwnJob=True, inspectionStatus='confirmed')
                rows.append(row)
            except Exception:
                if pid not in fresh():
                    rows.append(row)
                else:
                    row.update(confirmedOwnJob=False, inspectionStatus='inspection-failed')
                    rows.append(row)
                    raise RuntimeError('census-member-inspection-failed') from None
            finally:
                if handle:
                    close_member(handle)
        if any(pid not in pids for pid in fresh()):
            raise RuntimeError('census-membership-drift')
        return rows
    except Exception as error:
        code = str(error) if type(error) is RuntimeError and str(error) in CENSUS_ERRORS else 'census-failed'
        raise CensusFailure(code, rows) from None

def member_ids(job):
    members = job_members(job)
    return list(members.pids[:members.listed])

def process_belongs(handle, job):
    result = wintypes.BOOL()
    if not kernel.IsProcessInJob(handle, job, ctypes.byref(result)):
        raise RuntimeError('membership-unverifiable')
    return bool(result.value)

def process_identity(handle):
    pid = kernel.GetProcessId(handle)
    if not pid:
        raise RuntimeError('process-pid-unverifiable')
    values = [wintypes.FILETIME() for _ in range(4)]
    if not kernel.GetProcessTimes(handle, *[ctypes.byref(v) for v in values]):
        raise RuntimeError('process-time-unverifiable')
    buffer = ctypes.create_unicode_buffer(IMAGE_BUFFER_UNITS)
    size = wintypes.DWORD(IMAGE_BUFFER_UNITS)
    if not kernel.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)) or not 0 < size.value < IMAGE_BUFFER_UNITS:
        raise RuntimeError('process-image-unverifiable')
    created = (values[0].dwHighDateTime << 32) | values[0].dwLowDateTime
    return {'pid':int(pid), 'creationFiletime':created, 'imagePath':buffer[:size.value]}

def validate_freeze(value, sources):
    f = exact_fields(value, ['schema', 'sourceHashes', 'oldFreezeSha256', 'baseFreezeSha256', 'freezeHash'])
    if f['schema'] != 'native-bootstrap-process-dev-freeze/v1' or f['sourceHashes'] != sources or list(f['sourceHashes']) != list(sources):
        raise RuntimeError('freeze-source-mismatch')
    if f['oldFreezeSha256'] != OLD_FREEZE_SHA or f['baseFreezeSha256'] != BASE_FREEZE_SHA or sha(ordered_json({k:v for k,v in f.items() if k != 'freezeHash'})) != hash_value(f['freezeHash']):
        raise RuntimeError('freeze-linkage')
    return f

def validate_node_result(data, frozen, freeze_sha, sources):
    text = data.decode('utf8')
    if not text.endswith('\n') or text.count('\n') != 1:
        raise RuntimeError('node-marker-count')
    r = exact_fields(strict_json(data), ['schema', 'status', 'freezeHash', 'freezeSha256', 'sourceHashesHash', 'inventoryCount',
        'oldFreezeSha256', 'baseFreezeSha256', 'noBrowserImport', 'noModelCalls', 'noContentRead', 'noCanonicalWrites'])
    wanted = {'schema':'native-bootstrap-inventory-complete/v1', 'status':'complete', 'freezeHash':frozen['freezeHash'],
        'freezeSha256':freeze_sha, 'sourceHashesHash':sha(ordered_json(sources)), 'inventoryCount':201,
        'oldFreezeSha256':OLD_FREEZE_SHA, 'baseFreezeSha256':BASE_FREEZE_SHA, 'noBrowserImport':True,
        'noModelCalls':True, 'noContentRead':True, 'noCanonicalWrites':True}
    if any(type(r[k]) is not type(v) or r[k] != v for k,v in wanted.items()):
        raise RuntimeError('node-marker-linkage')
    return r

def output_bounds(reserve=0):
    total, entries = owned_tree_metadata(OUTPUT)
    if total + reserve > PROFILE_MAX_BYTES or entries + (1 if reserve else 0) > PROFILE_MAX_ENTRIES:
        raise RuntimeError('output-capacity')
    for path in OUTPUT.iterdir():
        meta = path.lstat()
        if stat.S_ISREG(meta.st_mode) and meta.st_size > 65536:
            raise RuntimeError('evidence-file-capacity')
    logs = sum((OUTPUT / name).stat().st_size for name in ('stdout.log', 'stderr.log') if (OUTPUT / name).exists())
    if logs > 65536:
        raise RuntimeError('log-capacity')
    return total, entries

def selected_node_path():
    # One fixed installed executable selection, never a PATH wrapper/shim.
    # Metadata only; never read executable bytes.
    path = Path(SELECTED_NODE)
    at = path
    while True:
        s = at.lstat()
        if getattr(s, 'st_file_attributes', 0) & 0x400 or at.is_symlink():
            raise RuntimeError('node-path-reparse')
        if at == at.parent:
            break
        at = at.parent
    if not path.is_file() or path.resolve() != path:
        raise RuntimeError('node-path-unverifiable')
    return str(path), image_identity(str(path))

def run():
    load_windows()
    started = time.monotonic()
    headroom()
    sources = source_snapshot()
    freeze_bytes = bounded_bytes(HERE / 'freeze.json', 65536)
    freeze_sha = sha(freeze_bytes)
    frozen = validate_freeze(strict_json(freeze_bytes), sources)
    node, selected = selected_node_path()
    OUTPUT.mkdir()  # Exclusive; retain all failed evidence. No cleanup deletion.
    (OUTPUT / 'temp').mkdir()
    marker = {'schema':'native-bootstrap-supervisor-started/v1', 'freezeSha256':freeze_sha,
        'selectedNodeImage':selected, 'sourceHashesHash':sha(ordered_json(sources)), 'noAutomaticRepeat':True}
    wire = ordered_json(marker)
    output_bounds(len(wire))
    (OUTPUT / 'started.json').write_bytes(wire)
    job = child = original = None
    reason = census_error = cleanup_reason = None
    rows = []
    emergency = cleanup_confirmed = rechecked = handshake_sent = False
    peak_rss = peak_private = peak_pids = 0
    result = None
    with (OUTPUT / 'stdout.log').open('xb') as stdout, (OUTPUT / 'stderr.log').open('xb') as stderr:
        try:
            job = kernel.CreateJobObjectW(None, None)
            if not job:
                raise RuntimeError('job-create-failed')
            limits = ExtendedLimits()
            limits.basic.limitFlags = 0x2000 | 0x200
            limits.jobMemoryLimit = MEMORY_LIMIT
            if not kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
                raise RuntimeError('job-limit-failed')
            env = {k:v for k,v in os.environ.items() if k.upper() in {'SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT'}}
            env.update(TEMP=str(OUTPUT / 'temp'), TMP=str(OUTPUT / 'temp'),
                MURMINGLE_NATIVE_BOOTSTRAP_PROCESS_DEV_V1_SUPERVISED='1', OMP_NUM_THREADS='1', UV_THREADPOOL_SIZE='1')
            child = subprocess.Popen([node, '--max-old-space-size=256', str(HERE / 'node.mjs'), '--bootstrap'],
                cwd=HERE, env=env, shell=False, creationflags=subprocess.CREATE_NO_WINDOW, stdin=subprocess.PIPE, stdout=stdout, stderr=stderr)
            original = kernel.OpenProcess(0x0100 | 0x0001 | 0x1000, False, child.pid)
            if not original or not kernel.AssignProcessToJobObject(job, original):
                raise RuntimeError('node-job-assignment-failed')
            original_members = member_ids(job)
            peak_pids = max(peak_pids, len(original_members))
            if child.pid not in original_members:
                raise RuntimeError('original-node-not-live-in-job')
            first = process_identity(original)
            identity_members = member_ids(job)
            peak_pids = max(peak_pids, len(identity_members))
            if first['pid'] != child.pid or not process_belongs(original, job) or child.pid not in identity_members:
                raise RuntimeError('original-node-identity-unverifiable')
            count(first['creationFiletime'], (1 << 64) - 1, 1)
            first_image = image_identity(first['imagePath'])
            rows.append({'pid':child.pid, 'creationFiletime':str(first['creationFiletime']), **first_image,
                'imagePathHashEncoding':IMAGE_HASH_ENCODING, 'confirmedOwnJob':True, 'inspectionStatus':'confirmed'})
            if first_image['imagePathSha256'] != selected['imagePathSha256']:
                raise RuntimeError('selected-node-image-mismatch')
            def capture_members(observed):
                nonlocal rows, census_error, peak_pids
                def census_list(actual_job):
                    nonlocal peak_pids
                    live = member_ids(actual_job)
                    peak_pids = max(peak_pids, len(live))
                    return live
                try:
                    inspected = inspect_job_members(job, observed, census_list,
                        lambda pid:kernel.OpenProcess(0x1000, False, pid), process_belongs, process_identity, kernel.CloseHandle)
                except CensusFailure as error:
                    inspected = error.rows
                    census_error = str(error)
                if len(rows) + len(inspected) > 32:
                    census_error = 'retained-row-capacity'
                    raise RuntimeError('retained-row-capacity')
                rows.extend(inspected)
                if census_error:
                    raise RuntimeError('member-census-failed')
                if any(row['pid'] != child.pid for row in inspected):
                    raise RuntimeError('unexpected-owned-job-member')
            # Retain the original handle-bound identity even when no violation.
            capture_members(list(dict.fromkeys(original_members + identity_members)))
            initial_live = member_ids(job)
            if initial_live != [child.pid]:
                capture_members(initial_live)
                raise RuntimeError('unexpected-owned-job-member')
            child.stdin.write(b'NATIVE_BOOTSTRAP_PROCESS_DEV_JOB_ASSIGNED_V1\n')
            child.stdin.flush()
            child.stdin.close()
            handshake_sent = True
            while child.poll() is None:
                live = member_ids(job)
                peak_pids = max(peak_pids, len(live))
                if live != [child.pid]:
                    if not live and child.poll() is not None:
                        break
                    capture_members(live)
                    raise RuntimeError('unexpected-owned-job-member')
                headroom()
                rss, private, pids = tree_memory(job)
                peak_rss, peak_private, peak_pids = max(peak_rss, rss), max(peak_private, private), max(peak_pids, pids)
                output_bounds(65536)
                if max(rss, private) > MEMORY_LIMIT or time.monotonic() - started >= ACTIVE_LIMIT:
                    raise RuntimeError('owned-resource-budget')
                time.sleep(.05)
            child.wait()
            exited_members = member_ids(job)
            if exited_members:
                capture_members(exited_members)
                raise RuntimeError('unexpected-member-after-node-exit')
            if child.returncode != 0 or not normal_job_drain(job):
                raise RuntimeError('node-exit-or-normal-job-drain-failed')
            result = validate_node_result(bounded_bytes(OUTPUT / 'stdout.log', 65536), frozen, freeze_sha, sources)
        except Exception as error:
            reason = str(error) if type(error) is RuntimeError else 'supervisor-failed'
        finally:
            until = time.monotonic() + 5
            try:
                if job and member_ids(job):
                    emergency = True
                    reason = reason or 'emergency-own-job-termination-required'
                    if not kernel.TerminateJobObject(job, 1):
                        raise RuntimeError('own-job-termination-unverifiable')
                if child is not None and child.poll() is None:
                    child.kill()  # Only exact original Popen, including failed assignment.
                    child.wait(timeout=max(.01, until-time.monotonic()))
                if job:
                    while member_ids(job):
                        if time.monotonic() >= until:
                            raise RuntimeError('final-job-drain-timeout')
                        time.sleep(.05)
                cleanup_confirmed = child is None or child.poll() is not None
                if not cleanup_confirmed:
                    raise RuntimeError('original-node-exit-unconfirmed')
            except Exception as error:
                cleanup_reason = str(error) if type(error) is RuntimeError else 'cleanup-unverifiable'
            finally:
                if original:
                    kernel.CloseHandle(original)
                if job:
                    kernel.CloseHandle(job)
        try:
            output_bounds(65536)
            if source_snapshot() != sources or sha(bounded_bytes(HERE / 'freeze.json', 65536)) != freeze_sha:
                raise RuntimeError('final-source-drift')
            rechecked = True
        except Exception:
            reason = reason or 'final-source-or-output-unverifiable'
        if time.monotonic() - started > WALL_LIMIT:
            reason = reason or 'wall-budget'
        reason = reason or cleanup_reason
        receipt = {'schema':'native-bootstrap-process-supervisor/v1', 'status':'complete' if reason is None else 'failed', 'reason':reason,
            'freezeSha256':freeze_sha, 'freezeHash':frozen['freezeHash'], 'oldFreezeSha256':OLD_FREEZE_SHA, 'baseFreezeSha256':BASE_FREEZE_SHA,
            'sourceHashes':sources, 'sourceHashesRechecked':rechecked, 'selectedNodeImage':selected, 'handshakeSent':handshake_sent,
            'childPid':child.pid if child else None, 'exitCode':child.returncode if child else None, 'memberCensus':rows, 'censusError':census_error,
            'ancestryClaim':False, 'helperWhitelistEstablished':False, 'nodeOnlyPredicateMaintained':True,
            'emergencyOwnJobTermination':emergency, 'ownTreeCleanupConfirmed':cleanup_confirmed, 'cleanupReason':cleanup_reason,
            'sampledPeakTreeRssBytes':peak_rss, 'sampledPeakTreePrivateBytes':peak_private, 'sampledPeakTreeProcesses':peak_pids,
            'elapsedSeconds':time.monotonic()-started, 'inventoryResult':result if reason is None else None,
            'noBrowserLaunch':True, 'noModelCalls':True, 'noCanonicalWrites':True, 'productionValidated':False, 'assignmentAuthority':False}
        wire = ordered_json(receipt)
        if len(wire) > 65536:
            raise RuntimeError('receipt-capacity')
        output_bounds(len(wire))
        with (OUTPUT / 'supervisor.json').open('xb') as out:
            out.write(wire)
        print(wire.decode('utf8'), flush=True)
        return 0 if reason is None else 1

def main():
    if len(sys.argv) == 1:
        print('No action. Separate review, metadata freeze and run approval required.')
        return 0
    if sys.platform != 'win32' or len(sys.argv) != 2 or sys.argv[1] not in ('--prepare', '--run-dev'):
        raise RuntimeError('fixed-cli-only')
    if HERE.drive.upper() != 'D:' or HERE != REPO / OWN or OUTPUT.exists() or OUTPUT.is_symlink():
        raise RuntimeError('fixed-new-output-required')
    if sys.argv[1] == '--prepare':
        if (HERE / 'freeze.json').exists():
            raise RuntimeError('existing-freeze')
        sources = source_snapshot()
        body = {'schema':'native-bootstrap-process-dev-freeze/v1', 'sourceHashes':sources,
            'oldFreezeSha256':OLD_FREEZE_SHA, 'baseFreezeSha256':BASE_FREEZE_SHA}
        if source_snapshot() != sources:
            raise RuntimeError('prepare-source-drift')
        with (HERE / 'freeze.json').open('xb') as out:
            out.write(ordered_json({**body, 'freezeHash':sha(ordered_json(body))}))
        print('Metadata freeze prepared.')
        return 0
    return run()

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Bootstrap diagnostic unavailable.', file=sys.stderr)
        raise SystemExit(1) from None
