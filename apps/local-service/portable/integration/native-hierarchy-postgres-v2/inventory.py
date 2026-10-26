"""Read/hash-only fixed native PostgreSQL input catalog.

Import performs no native operation. Root authenticates this module FILE before
compilation; map FILE authentication precedes parsing and following catalog keys.
"""
import math
import hashlib
import json
import os
from pathlib import Path
import stat

MIB = 1048576
CAPS = {'stdout': 262144, 'stderr': 65536}
CATALOG_LIMIT = 1024*1024
PG_ROOT = Path('D:/PostgreSQL/17')
PG_LIST_SHA256 = 'c5ad23dfec06e08e71062501c4544ba4794bd1b876ddaeb2142e527b7ce7fcc6'
PG_FILE_COUNT = 1777
PACKAGE_LIST_SHA256 = '79fd0a4e54af5399913b250e0ccdd1397c2c74e940ff968e3d1f8a0980703f2b'
PACKAGE_ROOTS = ('@electric-sql/pglite', '@electric-sql/pglite-pgvector', 'pg',
    'pg-cloudflare', 'pg-connection-string', 'pg-int8', 'pg-pool', 'pg-protocol',
    'pg-types', 'pgpass', 'postgres-array', 'postgres-bytea', 'postgres-date',
    'postgres-interval', 'split2', 'xtend')
DEVICE_NAMES = frozenset(('con', 'prn', 'aux', 'nul', 'clock$') +
    tuple(prefix+str(index) for prefix in ('com', 'lpt') for index in range(1,10)))
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
OWN = 'apps/local-service/portable/integration/native-hierarchy-postgres-v2/'
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
LOCAL_JS = frozenset(prefix+name for prefix,names in LOCAL_JS_GROUPS.items() for name in names.split()) | frozenset(
    OWN+name for name in ('cluster.js','cluster.test.js','client.js','client.test.js',
                         'session.js','session.test.js','context.js','context.test.js',
                         'suite.js','suite.test.js','entry.js','entry.test.js')) | frozenset(
    'apps/local-service/portable/canonical-v4/experimental/hierarchy-native-postgres-fixture-v2/'+name
    for name in ('repository.js','assertions.js'))
SQL_KEYS = frozenset('apps/local-service/portable/canonical-v4/migrations/'+name for name in '''
001-canonical-v4.sql 002-runtime-core.sql 003-execute-only-command-boundary.sql
004-ingestion-foundation.sql 005-ingestion-apply-and-lifecycle.sql
006-lifecycle-command-boundary.sql 007-exact-ridge-scan-single-pass.sql
008-independent-new-ingestion-admission.sql 009-fail-fast-new-ingestion-locks.sql'''.split()) | frozenset(
    'apps/local-service/portable/canonical-v4/experimental/hierarchy-native-scoped-ingestion-v2/'+name
    for name in ('schema.sql','boundary.sql'))
HARNESS_KEYS = frozenset(OWN+name for name in
    ('supervise.py','supervise_test.py','windows.py','windows_test.py','inventory.py','inventory_test.py','README.md'))
EXTRA_SOURCE_KEYS = frozenset((
    'apps/local-service/portable/canonical-v4/experimental/hierarchy-native-scoped-ingestion-v2/README.md',
    'apps/local-service/src/application/experimental/native-scoped-ingress-v1/ingress.test.js',
    'decisions/ADR-183-detached-owned-job-observation.md', GUARD_KEY)) | frozenset(
    BASELINE+name for name in ('run.py','run.test.mjs','README.md','reviewed-source-map.json')) | frozenset((
    'apps/local-service/portable/canonical-v4/experimental/hierarchy-native-postgres-fixture-v2/README.md',
    'decisions/ADR-222-separated-native-postgres-start-identities.md'))
# Logical binary keys cannot select paths. These literal pins are rechecked in
# addition to the external catalog FILE hash, before and after the attempt.
PYTHON_DIR = Path('C:/Users/Laurens/AppData/Local/Programs/Python/Python312')
RUNTIME_PINS = {
    '@powershell': (Path('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'), 495616,
        '8bb6fa8c283b4d92120b1ef249a9b311b0f804d4cabbe9981159976c8be76a5e'),
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
            any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@._+-' for c in part)):
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
    require(type(expected_keys) is frozenset and 0 < len(expected_keys) <= 3000 and
            all(safe_key(key) for key in expected_keys), 'catalog-expected-keys')
    try:
        value = json.loads(raw.decode('ascii'), object_pairs_hook=_unique_pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(Refusal('catalog-number')))
    except Refusal:
        raise
    except (ValueError, UnicodeError, RecursionError):
        raise Refusal('catalog-json') from None
    require(type(value) is dict and set(value) == {'schema','files'} and
            value['schema'] == 'native-hierarchy-postgres-catalog/v2' and
            type(value['files']) is list and len(value['files']) == len(expected_keys), 'catalog-shape')
    require(canonical_json(value) == raw, 'catalog-canonical')
    keys, total = [], 0
    for row in value['files']:
        require(type(row) is dict and set(row) == {'key','bytes','sha256'}, 'catalog-shape')
        require(safe_key(row['key']) and type(row['bytes']) is int and
                0 < row['bytes'] <= 128*MIB and hex_sha(row['sha256']), 'catalog-entry')
        keys.append(row['key'])
        total += row['bytes']
    require(total <= 320*MIB, 'catalog-total')
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



def fixed_postgres_inventory():
    """Complete fixed bin/lib/share metadata census, never follows a junction.

    This path-list authentication includes installed DLL/catalog/vector assets,
    not merely the historical executable list. OS loader/system dependencies and
    Python stdlib remain trusted platform scope, not a loader-trace claim.
    """
    found = []
    count = directories = 0
    for section, witness in (('bin','postgres.exe'),('lib','vector.dll'),
                             ('share','extension/vector.control')):
        directory = checked_path(PG_ROOT,section+'/'+witness).parents[len(witness.split('/'))-1]
        pending = [(directory,section,0)]
        while pending:
            parent, relative, depth = pending.pop()
            directories += 1
            require(directories <= 2048 and depth <= 16, 'postgres-directory-count')
            with os.scandir(parent) as entries:
                for entry in entries:
                    count += 1
                    require(count <= 8192, 'postgres-entry-count')
                    info = entry.stat(follow_symlinks=False)
                    key = relative+'/'+entry.name
                    require(safe_key(key) and no_reparse(info), 'postgres-entry')
                    if stat.S_ISDIR(info.st_mode):
                        pending.append((Path(entry.path),key,depth+1))
                    else:
                        require(stat.S_ISREG(info.st_mode), 'postgres-entry')
                        found.append('@postgres/'+key)
                        require(len(found) <= PG_FILE_COUNT, 'postgres-file-count')
    found.sort()
    require(len(found) == PG_FILE_COUNT and len({x.casefold() for x in found}) == PG_FILE_COUNT,
            'postgres-file-count')
    require(hashlib.sha256('\n'.join(found).encode('utf8')).hexdigest() == PG_LIST_SHA256,
            'postgres-list-pin')
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
        require(len(LOCAL_JS) == 67 and len(SQL_KEYS) == 11 and len(scope_absences()) == 32,
                'fixed-inventory')
        # The absence of an intervening package scope is part of Node resolution,
        # not implied by hashing only the already-known files.
        for key in scope_absences() | {'apps/local-service/portable/src/node_modules'}:
            require(not os.path.lexists(REPO/key), 'resolution-shadow')
        keys = (LOCAL_JS | SQL_KEYS | HARNESS_KEYS | SCOPE_FILES | EXTRA_SOURCE_KEYS |
                frozenset(fixed_package_inventory(REPO)) | frozenset(RUNTIME_PINS) |
                frozenset(fixed_postgres_inventory()))
        return frozenset(keys)

    def _hash(self, key, size):
        if key in RUNTIME_PINS:
            path, fixed_size, fixed_hash = RUNTIME_PINS[key]
            require(size == fixed_size, 'runtime-pin')
            value = hash_regular_file(path.parent,path.name,size)
            require(value == fixed_hash, 'runtime-pin')
            return value
        if key.startswith('@postgres/'):
            return hash_regular_file(PG_ROOT,key[len('@postgres/'):],size)
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
