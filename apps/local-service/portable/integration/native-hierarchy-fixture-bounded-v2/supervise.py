"""Pure one-shot controller for the fixed canonical fixture boundary.

Import is inert. The fixed runner still requires independent whole-source review,
final pins and a separate actual-execution decision before a real invocation.
All injected callables are private composition seams, not CLI selectors.
"""
import math
import hashlib
import json
import os
from pathlib import Path
import stat

MIB = 1048576
CAPS = {'stdout': 262144, 'stderr': 65536}
CATALOG_LIMIT = 256*1024
PACKAGE_LIST_SHA256 = '79fd0a4e54af5399913b250e0ccdd1397c2c74e940ff968e3d1f8a0980703f2b'
PACKAGE_ROOTS = ('@electric-sql/pglite', '@electric-sql/pglite-pgvector', 'pg',
    'pg-cloudflare', 'pg-connection-string', 'pg-int8', 'pg-pool', 'pg-protocol',
    'pg-types', 'pgpass', 'postgres-array', 'postgres-bytea', 'postgres-date',
    'postgres-interval', 'split2', 'xtend')
DEVICE_NAMES = frozenset(('con', 'prn', 'aux', 'nul', 'clock$') +
    tuple(prefix+str(index) for prefix in ('com', 'lpt') for index in range(1,10)))
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
OWN = 'apps/local-service/portable/integration/native-hierarchy-fixture-bounded-v2/'
BASELINE = 'spikes/topic-resolution/harness/experimental/native-job-list-observation-v2/'
GUARD_KEY = 'spikes/topic-resolution/harness/deny-external-capabilities.js'
SCOPE_FILES = frozenset(('apps/local-service/package.json',
    'apps/local-service/portable/package.json', 'spikes/topic-resolution/package.json'))
LOCAL_JS_GROUPS = {
    'apps/local-service/experiments/topic-encoder/': '''
hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js
native-root-rank-candidate-v1/scorer.js''',
    'apps/local-service/portable/canonical-v4/': '''
embedding-binary-wire.js index.js lifecycle-repository.js read-facade.js
related-catalog-evidence.js related-catalog-index.js runtime-repository.js
experimental/hierarchy-native-scoped-ingestion-v2/repository.js
experimental/hierarchy-native-scoped-ingestion-v2/test.js''',
    'apps/local-service/portable/': 'src/database.js test/canonical-v4-runtime-fixture.js',
    'apps/local-service/src/': '''
accounts/account-principal.js adapters/normalized-sqlite-repository.js
application/account-public-chats.js
application/experimental/native-canonical-mapping-v1/mapping.js
application/experimental/native-canonical-publication-v1/publication.js
application/experimental/native-owner-grouping-v1/grouping.js
application/experimental/native-scoped-ingress-v1/ingress.js
application/experimental/native-scoped-preparation-v1/preparation.js
domain/adaptive-topic-integration.js domain/adaptive-topics.js
domain/alternate-topic-cache.js domain/alternate-topic-planner.js
domain/alternate-topic-planner-indexed.js domain/body-topic-metric.js
domain/bounded-evidence-graph.js domain/demo-state.js domain/diagonal-adapter.js
domain/discussion-view.js domain/errors.js
domain/experimental/native-root-local-detail-transfer-v1/adapter.js
domain/fixed-reference-topic-integration.js domain/guarded-body-topic-planner.js
domain/hierarchical-e5-local-evidence.js domain/hierarchical-e5-paired-input.js
domain/hierarchical-e5-paired-linear-heads.js domain/learned-sources.js
domain/owner-topic-planner.js domain/persisted-state.js
domain/reference-state-migration.js domain/reference-topic-membership.js
domain/repository-contract.js domain/ridge-topic-adapter.js domain/ridge-topic-planner.js
domain/source-threads.js domain/state-migration.js domain/topic-radius-index.js domain/validation.js''',
    'spikes/topic-resolution/browser/': '''
core/page-content-policy.js core/related-sources.js embedding/embedding-contract.js''',
}
LOCAL_JS = frozenset(prefix+name for prefix,names in LOCAL_JS_GROUPS.items() for name in names.split())
SQL_KEYS = frozenset('apps/local-service/portable/canonical-v4/migrations/'+name for name in '''
001-canonical-v4.sql 002-runtime-core.sql 003-execute-only-command-boundary.sql
004-ingestion-foundation.sql 005-ingestion-apply-and-lifecycle.sql
006-lifecycle-command-boundary.sql 007-exact-ridge-scan-single-pass.sql
008-independent-new-ingestion-admission.sql 009-fail-fast-new-ingestion-locks.sql'''.split()) | frozenset(
    'apps/local-service/portable/canonical-v4/experimental/hierarchy-native-scoped-ingestion-v2/'+name
    for name in ('schema.sql','boundary.sql'))
HARNESS_KEYS = frozenset(OWN+name for name in
    ('supervise.py','supervise_test.py','windows.py','windows_test.py','report.py','report_test.py','README.md'))
EXTRA_SOURCE_KEYS = frozenset((
    'apps/local-service/portable/canonical-v4/experimental/hierarchy-native-scoped-ingestion-v2/README.md',
    'apps/local-service/src/application/experimental/native-scoped-ingress-v1/ingress.test.js',
    'decisions/ADR-183-detached-owned-job-observation.md', GUARD_KEY)) | frozenset(
    BASELINE+name for name in ('run.py','run.test.mjs','README.md','reviewed-source-map.json'))
# Logical binary keys cannot select paths. These literal pins are rechecked in
# addition to the external catalog FILE hash, before and after the attempt.
PYTHON_DIR = Path('C:/Users/Laurens/AppData/Local/Programs/Python/Python312')
RUNTIME_PINS = {
    '@node': (Path('C:/Program Files/nodejs/node.exe'), 92825416,
        '3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'),
    '@python': (PYTHON_DIR/'python.exe', 104952,
        '4d6f5f81a4bca11191c4c7c6b43632694d0a4ce74e068619d8fdc161d469859a'),
    '@python312dll': (PYTHON_DIR/'python312.dll', 6945272,
        '9a0e3435aaa680d868150f87ab3e388ad2eebc22f87e036155c7b4eda8cd2120'),
    '@python3dll': (PYTHON_DIR/'python3.dll', 70376,
        'fb975a606e7fbf74f64260e3f60c3490b4f74a183c0926fd6ed1ac4c52ac7b1c'),
    '@vcruntime140': (PYTHON_DIR/'vcruntime140.dll', 120400,
        '052ad6a20d375957e82aa6a3c441ea548d89be0981516ca7eb306e063d5027f4'),
    '@vcruntime140_1': (PYTHON_DIR/'vcruntime140_1.dll', 49776,
        '6a99bc0128e0c7d6cbbf615fcc26909565e17d4ca3451b97f8987f9c6acbc6c8'),
}
SNAPSHOT_KEYS = frozenset(('initialized', 'processCreated', 'assigned',
    'membershipVerified', 'resumed', 'exited', 'exitCode', 'emergency',
    'completeEmptyJob', 'allHandlesClosed', 'closeFailure', 'stdoutBytes',
    'stderrBytes', 'stdoutEof', 'stderrEof', 'limits'))


class Refusal(RuntimeError):
    def __init__(self, code, counter=None, value=None):
        self.metadata = {'code': code, 'counter': counter, 'value': value}
        super().__init__(code)


def require(condition, code, counter=None, value=None):
    if not condition:
        raise Refusal(code, counter, value)


def number(value):
    return type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 2**64


def uint(value):
    return type(value) is int and 0 <= value < 2**64


def hex_sha(value):
    return type(value) is str and len(value) == 64 and all(c in '0123456789abcdef' for c in value)


def safe_key(key):
    if type(key) is not str:
        return False
    if key in RUNTIME_PINS:
        return True
    if type(key) is not str or not 1 <= len(key) <= 240:
        return False
    for part in key.split('/'):
        if (not part or part in ('.', '..') or part.endswith(('.', ' ')) or
            part.split('.')[0].casefold() in DEVICE_NAMES or
            any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@._-' for c in part)):
            return False
    return True


def canonical_json(value):
    return (json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(',', ':'),
                       allow_nan=False)+'\n').encode('ascii')


def _unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'catalog-duplicate-field')
        result[key] = value
    return result


def authenticate_catalog(raw, external_sha, expected_keys, hash_file):
    """Authenticate FILE bytes BEFORE JSON parsing or following catalog keys.

    expected_keys and hash_file belong to the fixed runner, never the map/CLI.
    hash_file streams an exact fixed file of expected size; no body is retained.
    This pure seam does not grant execution or prove catalog completeness by itself.
    """
    require(type(raw) is bytes and len(raw) <= CATALOG_LIMIT and hex_sha(external_sha), 'catalog-input')
    require(hashlib.sha256(raw).hexdigest() == external_sha, 'catalog-file-pin')
    require(type(expected_keys) is frozenset and 0 < len(expected_keys) <= 600 and
            all(safe_key(key) for key in expected_keys), 'catalog-expected-keys')
    try:
        value = json.loads(raw.decode('ascii'), object_pairs_hook=_unique_pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(Refusal('catalog-number')))
    except Refusal:
        raise
    except (ValueError, UnicodeError, RecursionError):
        raise Refusal('catalog-json') from None
    require(type(value) is dict and set(value) == {'schema','files'} and
            value['schema'] == 'native-hierarchy-fixture-catalog/v1' and
            type(value['files']) is list and len(value['files']) == len(expected_keys), 'catalog-shape')
    require(canonical_json(value) == raw, 'catalog-canonical')
    keys, total = [], 0
    for row in value['files']:
        require(type(row) is dict and set(row) == {'key','bytes','sha256'}, 'catalog-shape')
        require(safe_key(row['key']) and type(row['bytes']) is int and
                0 < row['bytes'] <= 128*MIB and hex_sha(row['sha256']), 'catalog-entry')
        keys.append(row['key'])
        total += row['bytes']
    require(total <= 256*MIB, 'catalog-total')
    require(keys == sorted(expected_keys) and len({key.casefold() for key in keys}) == len(keys), 'catalog-key-set')
    # Reject file/directory aliases, including case-only ancestor collisions.
    folded = {key.casefold() for key in keys}
    require(not any('/'.join(key.casefold().split('/')[:index]) in folded
                    for key in keys for index in range(1,len(key.split('/')))), 'catalog-key-set')
    for row in value['files']:
        require(hash_file(row['key'], row['bytes']) == row['sha256'], 'catalog-content-pin')
    return value


def no_reparse(info):
    return not stat.S_ISLNK(info.st_mode) and not (getattr(info, 'st_file_attributes', 0) & 0x400)


def checked_path(root, key):
    """Fixed-root containment with lstat on every existing path component.

    This is sampled pathname checking, not an atomic filesystem sandbox.
    """
    require(safe_key(key) and not key.startswith('@'), 'file-key')
    root = Path(root)
    require(root.is_absolute(), 'file-root')
    # Include fixed root ancestry; a junction above the root is not bypassed.
    for component in reversed((root,)+tuple(root.parents)):
        info = component.lstat()
        require(no_reparse(info) and stat.S_ISDIR(info.st_mode), 'file-root')
    target = root
    for index, part in enumerate(key.split('/')):
        target = target / part
        info = target.lstat()
        require(no_reparse(info), 'file-reparse')
        require(stat.S_ISREG(info.st_mode) if index == len(key.split('/'))-1 else
                stat.S_ISDIR(info.st_mode), 'file-kind')
    require(target.resolve().is_relative_to(root.resolve()), 'file-containment')
    return target


def hash_regular_file(root, key, expected_bytes):
    path = checked_path(root, key)
    before = path.lstat()
    require(before.st_size == expected_bytes, 'file-size')
    digest, length = hashlib.sha256(), 0
    with path.open('rb') as stream:
        opened = os.fstat(stream.fileno())
        require((opened.st_dev,opened.st_ino,opened.st_size) ==
                (before.st_dev,before.st_ino,before.st_size), 'file-identity')
        while True:
            chunk = stream.read(65536)
            if not chunk:
                break
            length += len(chunk)
            require(length <= expected_bytes, 'file-size')
            digest.update(chunk)
        after_open = os.fstat(stream.fileno())
    after = checked_path(root, key).lstat()
    verify_file_identity(before,opened,after_open,after,length,expected_bytes)
    return digest.hexdigest()


def verify_file_identity(before, opened, after_open, after, length, expected_bytes):
    # Python's Windows lstat/fstat can expose creation versus metadata-change
    # time in the deprecated ctime field (CPython issue157671). Compare birthtime
    # across APIs, while STILL fencing ctime within each API's own observations.
    # https://docs.python.org/3.12/library/os.html#os.stat_result.st_birthtime_ns
    # https://github.com/python/cpython/issues/157671
    def fields(item):
        birth = item.st_birthtime_ns if os.name == 'nt' else item.st_ctime_ns
        return item.st_dev,item.st_ino,item.st_size,item.st_mtime_ns,birth
    require(length == expected_bytes and before.st_dev != 0 and before.st_ino != 0 and
            fields(before) == fields(opened) == fields(after_open) == fields(after) and
            before.st_ctime_ns == after.st_ctime_ns and
            opened.st_ctime_ns == after_open.st_ctime_ns, 'file-identity')


def fixed_package_inventory(root):
    """Enumerate only16 fixed package roots; reject shadows and authenticate list.

    Names are collected without following any reparse point. Body reads are
    deferred until the independently reviewed exact456-path list has matched.
    """
    base = 'apps/local-service/portable/node_modules/'
    found = []
    entry_count = directory_count = 0
    for name in PACKAGE_ROOTS:
        package_key = base+name
        # checked_path expects a file, so validate the package directory using
        # its mandatory manifest and then traverse only its physical parent.
        package = checked_path(root, package_key+'/package.json').parent
        pending = [(package, package_key, 0)]
        while pending:
            directory, relative, depth = pending.pop()
            directory_count += 1
            require(directory_count <= 512, 'package-directory-count')
            require(depth <= 16, 'package-depth')
            with os.scandir(directory) as entries:
                for entry in entries:
                    entry_count += 1
                    require(entry_count <= 2048, 'package-entry-count')
                    info = entry.stat(follow_symlinks=False)
                    key = relative+'/'+entry.name
                    require(safe_key(key) and no_reparse(info), 'package-entry')
                    if stat.S_ISDIR(info.st_mode):
                        require(entry.name.casefold() != 'node_modules', 'package-shadow')
                        pending.append((Path(entry.path),key,depth+1))
                    else:
                        require(stat.S_ISREG(info.st_mode), 'package-entry')
                        found.append(key)
                        require(len(found) <= 456, 'package-count')
    found.sort()
    require(len(found) == 456 and len({key.casefold() for key in found}) == 456,
            'package-count')
    require(hashlib.sha256('\n'.join(found).encode('utf-8')).hexdigest() == PACKAGE_LIST_SHA256,
            'package-list-pin')
    return tuple(found)


def scope_absences():
    candidates = set()
    for key in LOCAL_JS | {GUARD_KEY}:
        parent = Path(key).parent
        while str(parent) != '.':
            candidates.add(parent.as_posix()+'/package.json')
            parent = parent.parent
        candidates.add('package.json')
    return frozenset(candidates)-SCOPE_FILES


class FileCatalog:
    """Fixed-path, read/hash-only catalog authentication; never launches code.

    Construction/import are inert. No catalog-selected exe, command, environment,
    output or root is accepted. Python/system libraries remain a trusted runtime;
    these sampled file checks do not constitute an atomic code-loading sandbox.
    """
    def __init__(self, external_sha):
        require(hex_sha(external_sha), 'catalog-file-pin')
        self.external_sha = external_sha
        self.keys = self.value = self.raw = self.root_identity = None
        self.attempted = self.accepted = False

    def _inventory(self):
        require(len(LOCAL_JS) == 53 and len(SQL_KEYS) == 11 and len(scope_absences()) == 29,
                'fixed-inventory')
        # The absence of an intervening package scope is part of Node resolution,
        # not implied by hashing only the already-known files.
        for key in scope_absences() | {'apps/local-service/portable/src/node_modules'}:
            require(not os.path.lexists(REPO/key), 'resolution-shadow')
        keys = (LOCAL_JS | SQL_KEYS | HARNESS_KEYS | SCOPE_FILES | EXTRA_SOURCE_KEYS |
                frozenset(fixed_package_inventory(REPO)) | frozenset(RUNTIME_PINS))
        return frozenset(keys)

    def _hash(self, key, size):
        if key in RUNTIME_PINS:
            path, fixed_size, fixed_hash = RUNTIME_PINS[key]
            require(size == fixed_size, 'runtime-pin')
            value = hash_regular_file(path.parent,path.name,size)
            require(value == fixed_hash, 'runtime-pin')
            return value
        return hash_regular_file(REPO,key,size)

    def _map(self):
        key = OWN+'reviewed-sources.json'
        path = checked_path(REPO,key)
        size = path.lstat().st_size
        require(0 < size <= CATALOG_LIMIT, 'catalog-input')
        # Authenticate the map FILE before decoding or following even its keys.
        require(hash_regular_file(REPO,key,size) == self.external_sha, 'catalog-file-pin')
        with path.open('rb') as stream:
            raw = stream.read(CATALOG_LIMIT+1)
        require(len(raw) == size and hashlib.sha256(raw).hexdigest() == self.external_sha,
                'catalog-file-pin')
        return raw

    def authenticate(self):
        require(not self.attempted, 'catalog-one-shot')
        self.attempted = True
        self.raw = self._map()
        self.keys = self._inventory()
        root = REPO.lstat()
        self.root_identity = (root.st_dev,root.st_ino)
        self.value = authenticate_catalog(self.raw,self.external_sha,self.keys,self._hash)
        # Re-authenticate the consumed immutable helper map as an independent
        # literal baseline pin, even when this new catalog is otherwise valid.
        baseline_path = checked_path(REPO,BASELINE+'reviewed-source-map.json')
        baseline_size = next(row['bytes'] for row in self.value['files']
                             if row['key'] == BASELINE+'reviewed-source-map.json')
        require(0 < baseline_size <= 8192, 'baseline-map-size')
        require(hash_regular_file(REPO,BASELINE+'reviewed-source-map.json',baseline_size) ==
                '381535247a5e6f829f28c66f8a047da04e5d1c5e9f0a7085feae4abd91ffe390', 'baseline-map-pin')
        with baseline_path.open('rb') as stream:
            baseline_bytes = stream.read(baseline_size+1)
        require(len(baseline_bytes) == baseline_size and hashlib.sha256(baseline_bytes).hexdigest() ==
                '381535247a5e6f829f28c66f8a047da04e5d1c5e9f0a7085feae4abd91ffe390', 'baseline-map-pin')
        baseline = json.loads(baseline_bytes,object_pairs_hook=_unique_pairs)
        expected = {BASELINE+name for name in ('run.py','run.test.mjs','README.md')} | {
            'decisions/ADR-183-detached-owned-job-observation.md'}
        require(set(baseline) == {'schema','sourceHashes'} and
                baseline['schema'] == 'native-job-list-reviewed-sources/v1' and
                set(baseline['sourceHashes']) == expected, 'baseline-map-shape')
        current = {row['key']:row['sha256'] for row in self.value['files']}
        require(all(current[key] == baseline['sourceHashes'][key] for key in expected), 'baseline-source-pin')
        self.accepted = True

    def end_pins(self):
        require(self.accepted and self.value is not None and self._map() == self.raw, 'catalog-state')
        root = REPO.lstat()
        require((root.st_dev,root.st_ino) == self.root_identity and self._inventory() == self.keys,
                'catalog-end-inventory')
        authenticate_catalog(self.raw,self.external_sha,self.keys,self._hash)


class ExclusivePublisher:
    """One fresh fixed output directory. Never adopt, overwrite or delete output.

    Captures and finite metadata are published only after the controller retires
    its original handles. The temp subtree is sampled throughout native work;
    this disk-size observation is not a filesystem quota or atomic sandbox.
    """
    def __init__(self):
        self.root = HERE/'output'
        self.identity = None
        self.prepared = self.published = False

    def prepare(self):
        require(not self.prepared and not os.path.lexists(self.root), 'output-fresh')
        # Validate the existing fixed parent before creating the exclusive leaf.
        checked_path(REPO,OWN+'supervise.py')
        self.root.mkdir()
        info = self.root.lstat()
        require(no_reparse(info) and stat.S_ISDIR(info.st_mode), 'output-root')
        self.identity = (info.st_dev,info.st_ino)
        (self.root/'temp').mkdir()
        self.prepared = True
        self.check()

    def check(self):
        require(self.prepared, 'output-state')
        checked_path(REPO,OWN+'supervise.py')
        root = self.root.lstat()
        require(no_reparse(root) and stat.S_ISDIR(root.st_mode) and
                (root.st_dev,root.st_ino) == self.identity, 'output-identity')
        pending, entries, total = [(self.root,0)], 0, 0
        while pending:
            directory, depth = pending.pop()
            require(depth <= 8, 'output-depth')
            with os.scandir(directory) as children:
                for child in children:
                    entries += 1
                    require(entries <= 128, 'output-count')
                    info = child.stat(follow_symlinks=False)
                    require(no_reparse(info), 'output-reparse')
                    if stat.S_ISDIR(info.st_mode):
                        pending.append((Path(child.path),depth+1))
                    else:
                        require(stat.S_ISREG(info.st_mode), 'output-kind')
                        total += info.st_size
                        require(total <= 512*1024, 'output-total', 'ownedOutputBytes', total)
        return total

    def _write(self, name, data, limit):
        require(type(data) is bytes and len(data) <= limit, 'publication-size')
        current = self.check()
        require(current + len(data) <= 512*1024, 'output-total', 'ownedOutputBytes', current+len(data))
        target = self.root/name
        require(not os.path.lexists(target), 'publication-fresh')
        with target.open('xb') as stream:
            require(stream.write(data) == len(data), 'publication-write')
            stream.flush()
            os.fsync(stream.fileno())
        self.check()

    def publish(self, result, stdout, stderr, checkpoint):
        require(self.prepared and not self.published, 'publication-state')
        # One attempt, including failures: partial files remain evidence, never
        # a reason to adopt/overwrite the directory or automatically rerun.
        self.published = True
        require(checkpoint() is None, 'publication-checkpoint')
        require(type(result) is dict and result.get('schema') ==
                'native-hierarchy-fixture-supervisor/v1', 'publication-result')
        self._write('stdout.bin',stdout,CAPS['stdout'])
        self._write('stderr.bin',stderr,CAPS['stderr'])
        encoded = canonical_json(result)
        self._write('.pending-result.json',encoded,65536)
        require(checkpoint() is None, 'publication-checkpoint')
        require(not os.path.lexists(self.root/'result.json'), 'publication-fresh')
        require(self.check()+len(encoded) <= 512*1024, 'publication-total')
        # link is exclusive even if another writer races the prior lstat.
        os.link(self.root/'.pending-result.json',self.root/'result.json')
        self.check()
        require(checkpoint() is None, 'publication-checkpoint')
        # A linked result alone is not PASS; the outer process must also exit0
        # after this final checkpoint. Pending and final bytes remain immutable.


def load_fixed_module(name, pins):
    import types
    allowed = {'baseline':BASELINE+'run.py','report':OWN+'report.py','windows':OWN+'windows.py'}
    require(type(name) is str and name in allowed, 'module-name')
    key = allowed[name]
    path = checked_path(REPO,key)
    require(pins[key]['bytes'] <= 2*MIB, 'module-size')
    with path.open('rb') as stream:
        source = stream.read(2*MIB+1)
    require(len(source) == pins[key]['bytes'] and
            hashlib.sha256(source).hexdigest() == pins[key]['sha256'], 'module-pin')
    module = types.ModuleType('_authenticated_bounded_'+name)
    module.__file__, module.__package__ = str(path), ''
    # Never consult preexisting bytecode caches, even with writeback disabled.
    exec(compile(source,str(path),'exec'),module.__dict__)
    return module


def execute_fixed_fixture(external_sha):
    """Fixed actual composition. Calling this requires a separate Root decision.

    Tests use only controlled fake composition seams or immediate flag refusal;
    they never construct WindowsNative or invoke the real database fixture.
    """
    import sys
    import time
    require(sys.flags.isolated and sys.flags.no_site and sys.flags.dont_write_bytecode,
            'python-flags')
    require(Path(sys.executable).resolve() == RUNTIME_PINS['@python'][0].resolve(), 'python-path')
    catalog, publisher = FileCatalog(external_sha), ExclusivePublisher()
    modules, host_native = {}, []

    def authenticate():
        catalog.authenticate()
        publisher.prepare()
        pins = {row['key']:row for row in catalog.value['files']}
        for name in ('baseline','report','windows'):
            modules[name] = load_fixed_module(name,pins)
        require(modules['baseline'].abi()['valid'], 'abi')
        require(modules['windows'].REPO == REPO and modules['windows'].TEMP == HERE/'output'/'temp',
                'fixed-boundary-path')

    def host():
        if not host_native:
            host_native.append(modules['baseline'].WindowsNative())
        return host_native[0].resources(None)

    def workspace():
        publisher.check()

    controller = Controller(authenticate=authenticate,end_pins=catalog.end_pins,
        host_sample=host,boundary_factory=lambda: modules['windows'].OwnedFixtureProcess(modules['baseline']),
        validate=lambda *args: modules['report'].validate_completion(*args),
        clock=time.monotonic,pause=time.sleep,workspace_check=workspace)
    result = controller.run()
    if publisher.prepared:
        def final_checkpoint():
            # Failure evidence can still be saved under a failed resource
            # guard, but never with a renewed deadline or unbounded writes.
            controller.now(controller.normal_deadline-controller.started if result['accepted'] else 150)
            publisher.check()
            if result['accepted']:
                controller.host()
        publisher.publish(result,bytes(controller.buffers['stdout']),bytes(controller.buffers['stderr']),final_checkpoint)
    return result


def error_metadata(error, fallback):
    if type(error) is Refusal:
        return dict(error.metadata)
    # Never execute an unknown exception's property/__getattr__ while cleaning
    # up. Only our exact finite refusal type carries structured information.
    return {'code': fallback, 'counter': None, 'value': None}


def checked_snapshot(boundary):
    row = boundary.snapshot()
    require(type(row) is dict and set(row) == SNAPSHOT_KEYS, 'native-snapshot')
    for key in SNAPSHOT_KEYS - {'exitCode', 'stdoutBytes', 'stderrBytes', 'limits'}:
        require(type(row[key]) is bool, 'native-snapshot')
    require(row['exitCode'] is None or (type(row['exitCode']) is int and
            0 <= row['exitCode'] <= 0xffffffff), 'native-snapshot')
    require(uint(row['stdoutBytes']) and uint(row['stderrBytes']), 'native-snapshot')
    require(row['limits'] is None or (type(row['limits']) is dict and
            row['limits'] == {'flags': 0x2208, 'activeProcessLimit': 1,
                              'jobMemoryBytes': 512*MIB} and
            all(type(value) is int for value in row['limits'].values())), 'native-snapshot')
    return dict(row, limits=None if row['limits'] is None else dict(row['limits']))


def checked_completion(row):
    keys = {'schema', 'accepted', 'code', 'stdoutBytes', 'stderrBytes',
            'stdoutSha256', 'stderrSha256', 'testPoints', 'outerTests'}
    codes = {'input-type', 'stdout-limit', 'stderr-limit', 'exit-status', 'tap-lines',
             'tap-encoding', 'tap-structure', 'tap-diagnostic', 'tap-coverage',
             'tap-plan', 'tap-result', 'tap-summary', 'tap-trailing', 'complete'}
    require(type(row) is dict and set(row) == keys and
            row['schema'] == 'native-hierarchy-fixture-tap-report/v1' and
            type(row['accepted']) is bool and type(row['code']) is str and
            row['code'] in codes, 'completion-shape')
    for key in ('stdoutBytes', 'stderrBytes', 'testPoints', 'outerTests'):
        require(uint(row[key]), 'completion-shape')
    for key in ('stdoutSha256', 'stderrSha256'):
        value = row[key]
        require(value is None or (type(value) is str and len(value) == 64 and
                all(char in '0123456789abcdef' for char in value)), 'completion-shape')
    require(not row['accepted'] or (row['code'] == 'complete' and row['testPoints'] == 25 and
            row['outerTests'] == 3 and row['stdoutSha256'] is not None and
            row['stderrSha256'] is not None), 'completion-shape')
    return dict(row)


class Controller:
    """One original epoch, bounded captures and physically observed cleanup.

    authenticate/end_pins return None on success. host_sample returns the
    authenticated helper's host resource shape, without creating a child.
    boundary_factory may run only AFTER authentication and startup admission.
    validate is the separately authenticated fixed TAP validator.
    """
    def __init__(self, *, authenticate, end_pins, host_sample, boundary_factory,
                 validate, clock, pause, workspace_check=lambda: None):
        self.clock, self.pause = clock, pause
        self.authenticate, self.end_pins = authenticate, end_pins
        self.host_sample, self.boundary_factory, self.validate = host_sample, boundary_factory, validate
        self.workspace_check = workspace_check
        self.started = clock()  # Before authentication, setup or native initialization.
        require(number(self.started), 'clock')
        self.last_time = self.started
        self.used = False
        self.boundary = None
        self.ready = False
        self.primary = self.cleanup = None
        self.last_cpu = self.last_peak = 0
        self.last_accounting = None
        self.buffers = {key: bytearray() for key in CAPS}
        self.turn = 0
        self.ticks = 0
        self.end_checked = False
        self.authenticated = False
        self.tap = self.native = None
        self.normal_deadline = None

    def now(self, limit=150):
        value = self.clock()
        require(number(value) and value >= self.last_time, 'clock')
        self.last_time = value
        require(value - self.started < limit, 'deadline', 'epochSeconds', value - self.started)
        return value

    def remember(self, error, cleanup=False, fallback='controller-failure'):
        name = 'cleanup' if cleanup else 'primary'
        if getattr(self, name) is None:
            setattr(self, name, error_metadata(error, fallback))

    def host(self, startup=False):
        row = self.host_sample()
        require(type(row) is dict, 'resource-shape')
        for key, floor in (('physicalFree', (1632 if startup else 1024)*MIB),
                           ('commitFree', (1632 if startup else 1024)*MIB),
                           ('cFree', 2048*MIB), ('dFree', 4096*MIB)):
            value = row.get(key)
            require(uint(value), 'resource-shape')
            require(value >= floor, 'resource-floor', key, value)

    def job(self):
        row = self.boundary.sample()
        require(type(row) is dict, 'resource-shape')
        cpu, peak, account = row.get('cpu'), row.get('committed'), row.get('accounting')
        require(number(cpu) and uint(peak) and type(account) is dict, 'resource-shape')
        keys = ('totalProcesses', 'activeProcesses', 'totalTerminatedProcesses', 'user100ns', 'kernel100ns')
        require(set(account) == set(keys) and all(uint(account[key]) for key in keys), 'resource-shape')
        require(account['activeProcesses'] <= account['totalProcesses'] <= 1 and
                account['totalTerminatedProcesses'] <= account['totalProcesses'], 'job-accounting')
        require(cpu == (account['user100ns'] + account['kernel100ns'])/10000000,
                'job-accounting')
        require(cpu >= self.last_cpu and peak >= self.last_peak, 'resource-regression')
        if self.last_accounting is not None:
            require(all(account[key] >= self.last_accounting[key] for key in keys
                        if key != 'activeProcesses'), 'resource-regression')
        self.last_cpu, self.last_peak, self.last_accounting = cpu, peak, dict(account)
        require(cpu <= 60, 'resource-limit', 'jobCpuSeconds', cpu)
        require(peak <= 512*MIB, 'resource-limit', 'historicalPeakJobMemoryBytes', peak)
        # These are sampled independently of host_sample; neither is a reservation.
        for key, floor in (('physicalFree', 1024*MIB), ('commitFree', 1024*MIB),
                           ('cFree', 2048*MIB), ('dFree', 4096*MIB)):
            require(uint(row.get(key)), 'resource-shape')
            require(row[key] >= floor, 'resource-floor', key, row[key])

    def guard(self, limit=120):
        self.now(limit)
        require(self.workspace_check() is None, 'workspace-check-return')
        self.host()
        if self.ready:
            self.job()
        self.now(limit)

    def drain_once(self, discard=False):
        order = ('stdout', 'stderr') if self.turn % 2 == 0 else ('stderr', 'stdout')
        self.turn += 1
        first = None
        for stream in order:
            try:
                row = self.boundary.read_available(stream)
                require(type(row) is dict and set(row) == {'data', 'eof'} and
                        type(row['data']) is bytes and type(row['eof']) is bool and
                        len(row['data']) <= 4096 and not (row['eof'] and row['data']), 'pipe-shape')
                if not discard:
                    require(len(self.buffers[stream]) + len(row['data']) <= CAPS[stream],
                            'output-limit', stream + 'Bytes', len(self.buffers[stream])+len(row['data']))
                    self.buffers[stream].extend(row['data'])
            except BaseException as error:
                if first is None:
                    first = error
        if first is not None:
            raise first

    def wait_tick(self):
        self.ticks += 1
        require(self.ticks <= 15000, 'poll-limit')
        require(self.pause(0.01) is None, 'pause-return')

    def cleanup_owned(self):
        """Failures never turn off physical observation or create a fresh lease."""
        if self.boundary is None:
            return
        try:
            self.boundary.terminate_owned()
        except BaseException as error:
            self.remember(error, True, 'termination-failure')
        try:
            failure_time = self.now()
            deadline = min(failure_time + 20, self.started + 140,
                           self.normal_deadline if self.normal_deadline is not None else self.started + 140)
        except BaseException as error:
            self.remember(error, True)
            deadline = None
        emergency_drain = False
        while True:
            try:
                row = checked_snapshot(self.boundary)
                if not row['processCreated'] or (row['exited'] and row['stdoutEof'] and row['stderrEof']):
                    break
                if row['processCreated']:
                    self.boundary.poll_exit()
                    self.drain_once(discard=True)
                row = checked_snapshot(self.boundary)
                if not row['processCreated'] or (row['exited'] and row['stdoutEof'] and row['stderrEof']):
                    break
            except BaseException as error:
                self.remember(error, True, 'cleanup-observation')
            # A failed clock cannot justify more time. Still made one bounded
            # attempt to physically observe exit/EOF after owned termination.
            if deadline is None:
                break
            try:
                current = self.now()
                if current >= deadline:
                    self.remember(Refusal('cleanup-deadline', 'epochSeconds', current-self.started), True)
                    if emergency_drain:
                        break
                    # One transition only, at most ten more seconds, still
                    # bounded by the original absolute epoch. Never renew20s.
                    emergency_drain = True
                    deadline = min(deadline + 10, self.started + 150)
                    if current >= deadline:
                        break
                self.host()
            except Refusal as error:
                self.remember(error, True)
                if error.metadata['code'] in ('clock', 'deadline'):
                    break
            except BaseException as error:
                self.remember(error, True, 'cleanup-resources')
            try:
                self.wait_tick()
            except BaseException as error:
                self.remember(error, True)
                break
        try:
            self.native = self.boundary.close()
        except BaseException as error:
            self.remember(error, True, 'cleanup-close')

    def run(self):
        require(not self.used, 'one-shot')
        self.used = True
        try:
            require(self.authenticate() is None, 'authentication-return')
            self.authenticated = True
            self.now(120)
            self.host(startup=True)
            self.boundary = self.boundary_factory()
            self.boundary.initialize(self.guard)
            self.ready = True
            self.guard()
            self.host(startup=True)
            self.boundary.launch_suspended(self.guard)
            self.boundary.assign_and_resume(self.guard)
            while True:
                limit = 120 if self.normal_deadline is None else self.normal_deadline-self.started
                self.guard(limit)
                self.boundary.poll_exit()
                observed = checked_snapshot(self.boundary)
                if observed['exited'] and self.normal_deadline is None:
                    # Exit must be observed before120. Only physical EOF/drain,
                    # close and final checks may use the normal20s allowance.
                    observed_at = self.now(120)
                    self.normal_deadline = min(observed_at+20, self.started+140)
                    limit = self.normal_deadline-self.started
                self.drain_once()
                self.native = checked_snapshot(self.boundary)
                self.guard(limit)
                if self.native['exited'] and self.native['stdoutEof'] and self.native['stderrEof']:
                    break
                self.wait_tick()
            self.tap = checked_completion(self.validate(bytes(self.buffers['stdout']), bytes(self.buffers['stderr']),
                                     self.native['exitCode']))
            require(type(self.tap) is dict and self.tap.get('accepted') is True, 'completion')
            self.native = self.boundary.close()
            limit = self.normal_deadline-self.started
            self.now(limit)
            require(self.end_pins() is None, 'end-pins-return')
            self.end_checked = True
            self.host()
            self.now(limit)
            self.native = checked_snapshot(self.boundary)
            require(all(self.native[key] is True for key in ('initialized', 'processCreated',
                'assigned', 'membershipVerified', 'resumed', 'exited', 'completeEmptyJob',
                'allHandlesClosed', 'stdoutEof', 'stderrEof')) and
                self.native['exitCode'] == 0 and not self.native['emergency'] and
                not self.native['closeFailure'] and self.native['limits'] is not None,
                'native-completion')
            require(all(self.native[key+'Bytes'] == len(self.buffers[key]) for key in CAPS),
                    'capture-accounting')
        except BaseException as error:
            self.remember(error, fallback='execution-failure')
            self.cleanup_owned()
            # A failed attempt must also bind its end-source state. Do not
            # mask the original fault or claim pins passed if time is exhausted.
            try:
                require(self.authenticated, 'authentication-incomplete')
                self.now()
                require(self.end_pins() is None, 'end-pins-return')
                self.now()
                self.end_checked = True
                self.host()
            except BaseException as end_error:
                self.remember(end_error, True, 'end-pins-failure')
        if self.boundary is not None:
            try:
                self.native = checked_snapshot(self.boundary)
            except BaseException as error:
                self.remember(error, True, 'cleanup-snapshot')
                self.native = None
        # Only the separately authenticated fixed validator's closed projection
        # is retained. Raw captures, exception strings, paths and PIDs stay out.
        return {'schema': 'native-hierarchy-fixture-supervisor/v1',
                'accepted': self.primary is None and self.cleanup is None,
                'primary': self.primary, 'cleanup': self.cleanup,
                'endPinsChecked': self.end_checked, 'native': self.native,
                'completion': self.tap,
                'cleanupClassification': ('verified-normal' if self.native is not None and
                    self.native['completeEmptyJob'] and self.native['allHandlesClosed'] and
                    not self.native['emergency'] and not self.native['closeFailure'] else
                    'owned-emergency' if self.native is not None and self.native['emergency'] else
                    'unverified-may-use-kill-on-close')}


def main(argv=None):
    """Exactly one external map FILE hash; no executable/path/phase selectors."""
    import sys
    arguments = sys.argv[1:] if argv is None else argv
    if type(arguments) is not list or len(arguments) != 1 or not hex_sha(arguments[0]):
        sys.stderr.write('Exactly one reviewed catalog SHA256 is required.\n')
        return 2
    try:
        result = execute_fixed_fixture(arguments[0])
        sys.stdout.write(canonical_json({'schema':'native-hierarchy-fixture-invocation/v1',
                                        'accepted':result['accepted']}).decode('ascii'))
        return 0 if result['accepted'] else 1
    except BaseException:
        # No traceback, raw exception, environment, paths or fixture data in
        # the outer diagnostic channel. Exclusive partial output stays intact.
        sys.stderr.write('Bounded canonical fixture did not complete.\n')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
