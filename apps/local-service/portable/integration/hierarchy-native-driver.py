"""Maintained, fixed native hierarchy check. Import is inert; no automatic retry.

Historical controllers and WinAPI retirement logic remain pinned dependencies.
This driver owns only its new paths/launch and normal-source catalog bindings.
"""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import time
import types

STARTED = time.monotonic()  # One original epoch before any authenticated read.
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
OWN = 'apps/local-service/portable/integration/'
OLD = OWN + 'native-hierarchy-postgres-v2/'
NODE = 'C:/Program Files/nodejs/node.exe'
ENTRY = OWN + 'semantic-native-check.js'
SEMANTIC_LEDGER = 'apps/local-service/portable/test/semantic-native-cases.json'
RUNS_ROOT = REPO / 'apps/local-service/portable/data/hierarchy-native-runs'
MAP_KEY = OWN + 'hierarchy-native-reviewed-sources.json'
NORMAL_SCOPE_ABSENCES = frozenset([
    'apps/local-service/src/http/package.json',
    'apps/local-service/test/package.json',
])
MIB = 1048576
CREATE_FLAGS = 0x8040C
NORMAL_KEYS = frozenset([
    'apps/local-service/portable/canonical-v4/hierarchy-schema-source.js',
    'apps/local-service/portable/canonical-v4/hierarchy-repository.js',
    'apps/local-service/portable/test/hierarchy-schema-source.test.js',
    'apps/local-service/portable/test/hierarchy-native-composition.test.js',
    'apps/local-service/portable/test/hierarchy-native-call.test.js',
    'apps/local-service/portable/test/hierarchy-native-assertions.js',
    OWN + 'hierarchy-native-context.js', OWN + 'hierarchy-native-cluster.js',
    OWN + 'hierarchy-native-check.js',
    ENTRY, OWN + 'hierarchy-native-driver.py', OWN + 'hierarchy_native_driver_test.py',
    OWN + 'hierarchy-native-run.js',
    'apps/local-service/portable/test/hierarchy-native-run.test.js',
    OWN + 'semantic-native-context.js', OWN + 'semantic-native-check.test.js',
    SEMANTIC_LEDGER,
    'apps/local-service/portable/test/semantic-native-assertions.js',
    'apps/local-service/portable/canonical-v4/migrations/010-semantic-hierarchy.sql',
    'apps/local-service/portable/canonical-v4/semantic-repository.js',
    'apps/local-service/portable/canonical-v4/ingestion-repository.js',
    'apps/local-service/portable/canonical-v4/bootstrap/001-admin.sql',
    'apps/local-service/src/application/hierarchy-ingestion-preparation.js',
    'apps/local-service/src/domain/hierarchy-rooted-matcher.js',
    'apps/local-service/src/domain/hierarchy-binary-detail.js',
    'apps/local-service/src/domain/hierarchical-e5-observed-head-policy.js',
    'spikes/topic-resolution/browser/core/local-service-contract.js',
    'apps/local-service/portable/canonical-v4/migrations/011-semantic-discussion-feeds.sql',
    'apps/local-service/portable/canonical-v4/semantic-discussion-repository.js',
    'apps/local-service/portable/test/semantic-discussion-repository.test.js',
    'apps/local-service/src/domain/semantic-topic-grouping.js',
    'apps/local-service/src/domain/semantic-topic-grouping.test.js',
    'apps/local-service/portable/canonical-v4/migrations/012-semantic-stored-source-preparation.sql',
    'apps/local-service/portable/canonical-v4/semantic-source-preparation.js',
    'apps/local-service/portable/canonical-v4/semantic-source-repository.js',
    'apps/local-service/portable/test/semantic-source-preparation.test.js',
    'apps/local-service/portable/test/semantic-source-repository.test.js',
    'apps/local-service/src/application/create-postgres-canonical-service.js',
    'apps/local-service/src/http/request-handler.js',
    'apps/local-service/test/semantic-public-reads.test.js',
    'apps/local-service/src/accounts/account-errors.js',
    'apps/local-service/src/accounts/account-routes.js',
    'apps/local-service/src/application/postgres-public-read-flights.js',
    'apps/local-service/portable/canonical-v4/migrations/013-semantic-public-topic-metadata.sql',
    'apps/local-service/portable/canonical-v4/semantic-metadata-repository.js',
    'apps/local-service/portable/test/semantic-metadata-repository.test.js',
    'apps/local-service/src/domain/semantic-topic-directory.js',
    'apps/local-service/test/semantic-topic-directory.test.js',
])
PINS = {
    'inventory': (OLD+'inventory.py', '3dfc2dcdb0c09a46d6215b5cf0781829f27a70f03c8106e6bb70db18bf28f385'),
    'supervisor': (OLD+'supervise.py', '2ccaf30294cd0edc87e126aeb152ca76a100e2cc289f2dc5f652241f33cae334'),
    'windows': (OLD+'windows.py', '890cca5fe58a938ba3b6be960d951d35265a7217cc9a831e31358b1fee79c433'),
    'baseline': ('spikes/topic-resolution/harness/experimental/native-job-list-observation-v2/run.py',
                 '8e0cf0aefd09a80c1c4971fa8515024b47ca47ab8eed28e4065acae02373c940'),
}
NATIVE_FAILURE_CODES = frozenset([
    'abi', 'assign-state', 'assignment', 'attribute-handles', 'attribute-init',
    'attribute-size', 'census-state', 'checkpoint', 'checkpoint-return',
    'close-descendants-or-pipes', 'close-handle', 'close-handles', 'close-live-process',
    'create-process', 'initialize-state', 'job-limit', 'job-members', 'launch-state',
    'limit-readback', 'membership', 'normal-empty-job', 'output-capacity',
    'pipe-create', 'pipe-inheritance', 'pipe-peek', 'pipe-read', 'pipe-state',
    'pipe-stream', 'poll-state', 'resume', 'sample-state', 'stdin-create',
    'terminate-job', 'terminate-process',
])


def diagnostic_controller_type(supervisor, windows):
    """Keep finite exact-class failures at original first-failure selection.

    No operation is caught/retried here. Unknown exceptions still use the
    frozen generic classification; no messages, filenames or SQL are inspected.
    """
    class Controller(supervisor.Controller):
        def remember(self, error, cleanup=False, fallback='controller-failure'):
            translated = error
            if type(error) is windows.BoundaryFailure:
                fields = object.__getattribute__(error, '__dict__')
                code = dict.get(fields, 'code') if type(fields) is dict else None
                if type(code) is str and code in NATIVE_FAILURE_CODES:
                    translated = supervisor.Refusal('native-' + code)
            else:
                for exact, category in (
                    (FileNotFoundError, 'filesystem-missing'),
                    (PermissionError, 'filesystem-denied'),
                    (NotADirectoryError, 'filesystem-not-directory'),
                    (IsADirectoryError, 'filesystem-is-directory'),
                    (json.JSONDecodeError, 'owned-json-invalid'),
                ):
                    if type(error) is exact:
                        translated = supervisor.Refusal(category)
                        break
            return super().remember(translated, cleanup, fallback)
    return Controller


def semantic_completion(stdout, stderr, exit_code):
    """Validate this production suite, never alias historical synthetic cases.

    The frozen supervisor's transport record still has25/3 fields. Acceptance
    additionally binds the shared *new* ledger, exact semantic proof schema,
    actual restricted roles, bounded lock-contention scope and normal cleanup.
    It deliberately makes no multi-user throughput or matching-quality claim.
    """
    result = {'schema':'native-hierarchy-postgres-json-report/v2', 'accepted':False,
        'code':'input-type', 'stdoutBytes':0, 'stderrBytes':0,
        'stdoutSha256':None, 'stderrSha256':None, 'testPoints':0, 'outerTests':0}
    def refused(code):
        result['code'] = code
        return result
    def pairs(items):
        out = {}
        for key, value in items:
            if key in out:
                raise ValueError('duplicate')
            out[key] = value
        return out
    def parse(raw):
        return json.loads(raw.decode('utf8'), object_pairs_hook=pairs,
            parse_constant=lambda _: (_ for _ in ()).throw(ValueError('constant')))
    def shape(value, keys):
        return type(value) is dict and set(value) == set(keys.split())
    def integer(value, expected):
        return type(value) is int and value == expected
    if type(stdout) is not bytes or type(stderr) is not bytes:
        return result
    result.update(stdoutBytes=len(stdout), stderrBytes=len(stderr),
        stdoutSha256=hashlib.sha256(stdout).hexdigest(), stderrSha256=hashlib.sha256(stderr).hexdigest())
    if len(stdout) > 262144:
        return refused('stdout-limit')
    if len(stderr) > 65536:
        return refused('stderr-limit')
    if type(exit_code) is not int or exit_code != 0:
        return refused('exit-status')
    try:
        if not stdout.endswith(b'\n') or stdout.count(b'\n') != 1:
            return refused('json-encoding')
        value = parse(stdout)
    except (ValueError, UnicodeError, RecursionError):
        return refused('json-encoding')
    if not shape(value, 'schema accepted primary server cleanup proof'):
        return refused('json-shape')
    if value['schema'] != 'canonical-semantic-postgres-result/v1' or value['accepted'] is not True or value['primary'] is not None:
        return refused('json-proof')
    server = value['server']
    if (not shape(server, 'port version ownershipVerified') or not integer(server['port'],55433)
            or not integer(server['version'],170011) or server['ownershipVerified'] is not True):
        return refused('json-proof')
    cleanup = value['cleanup']
    if (not shape(cleanup,'reason stopped childExited clientsClosed physicalSettled directoryRetained')
            or cleanup['reason'] != 'verified-own-server-smart-stopped'
            or not all(cleanup[key] is True for key in cleanup if key != 'reason')):
        return refused('json-cleanup')
    proof = value['proof']
    if not shape(proof, 'schema status nativeExecuted pendingAssertions cases restrictedRoleValidated concurrencyScope multiUserLoadValidated semanticQualityMeasured lastObservedSqlFailure cleanup'):
        return refused('json-shape')
    if (proof['schema'] != 'canonical-semantic-postgres-proof/v1' or proof['status'] != 'passed'
            or proof['nativeExecuted'] is not True or not integer(proof['pendingAssertions'],0)
            or proof['restrictedRoleValidated'] is not True
            or proof['concurrencyScope'] != 'head-switch-vs-apply-and-mvcc-read'
            or proof['multiUserLoadValidated'] is not False or proof['semanticQualityMeasured'] is not False
            or proof['lastObservedSqlFailure'] is not None):
        return refused('json-proof')
    # This fixed file is part of the authenticated catalog and end pins. Reading
    # it grants no authority and does not permit caller-selected case names.
    try:
        raw = (REPO/SEMANTIC_LEDGER).read_bytes()
        if not 0 < len(raw) <= 16384:
            return refused('json-cases')
        groups = parse(raw)
        if type(groups) is not list or len(groups) != 3:
            return refused('json-cases')
        expected = []
        for index, group in enumerate(groups):
            if (not shape(group, 'name children') or type(group['name']) is not str
                    or type(group['children']) is not list or len(group['children']) != (8,8,6)[index]
                    or any(type(name) is not str for name in group['children'])):
                return refused('json-cases')
            expected.append({'name':group['name'], 'depth':0, 'status':'passed'})
            expected.extend({'name':name, 'depth':1, 'status':'passed'} for name in group['children'])
        cases = proof['cases']
        if (type(cases) is not list or len(cases) != 25 or cases != expected
                or len({row['name'] for row in expected}) != 25
                or any(not shape(row,'name depth status') or type(row['depth']) is not int for row in cases)):
            return refused('json-cases')
    except (OSError, ValueError, UnicodeError, RecursionError):
        return refused('json-cases')
    result.update(testPoints=25, outerTests=3)
    dbs = proof['cleanup']
    if (not shape(dbs, 'status used finished adminClosed failureCount databases') or dbs['status'] != 'passed'
            or not integer(dbs['used'],2) or dbs['finished'] is not True or dbs['adminClosed'] is not True
            or not integer(dbs['failureCount'],0) or type(dbs['databases']) is not list or len(dbs['databases']) != 2):
        return refused('json-cleanup')
    for index, row in enumerate(dbs['databases']):
        if (not shape(row, 'name oid created closed dropped pending cleanupFailures')
                or row['name'] != 'murmingle_hierarchy_fixture_20261026_'+('a' if index == 0 else 'b')
                or type(row['oid']) is not str or not 1 <= len(row['oid']) <= 10
                or not all('0' <= char <= '9' for char in row['oid']) or row['oid'].startswith('0')
                or not 0 < int(row['oid']) <= 4294967295
                or not all(row[key] is True for key in ('created','closed','dropped'))
                or not integer(row['pending'],0) or not integer(row['cleanupFailures'],0)):
            return refused('json-cleanup')
    if dbs['databases'][0]['oid'] == dbs['databases'][1]['oid']:
        return refused('json-cleanup')
    result.update(accepted=True, code='complete')
    return result


def load_pinned(name):
    key, expected = PINS[name]
    path = REPO/key
    for component in reversed((path,) + tuple(path.parents)):
        info = component.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise RuntimeError('library-reparse')
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= 262144:
        raise RuntimeError('library-size')
    with path.open('rb') as stream:
        opened = os.fstat(stream.fileno())
        raw = stream.read(262145)
        after_open = os.fstat(stream.fileno())
    after = path.lstat()
    identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns,
                          s.st_birthtime_ns if os.name == 'nt' else s.st_ctime_ns)
    if not (identity(before) == identity(opened) == identity(after_open) == identity(after)
            and before.st_ctime_ns == after.st_ctime_ns
            and opened.st_ctime_ns == after_open.st_ctime_ns
            and len(raw) == before.st_size and hashlib.sha256(raw).hexdigest() == expected):
        raise RuntimeError('library-pin')
    module = types.ModuleType('_maintained_hierarchy_' + name)
    module.__file__ = str(path)
    exec(compile(raw, str(path), 'exec'), module.__dict__)
    return module


def native_api_type(windows, run):
    # Only the fixed CreateProcess entry/TEMP binding differs. Assignment,
    # inherited-handle whitelist, readback, census and close use frozen code.
    require = windows.require
    wintypes = windows.wintypes
    TEMP = run.output / 'temp'

    class NativeAPI(windows._WinAPI):
        def create_process(self, attributes, stdin, stdout, stderr):
            class ExtendedStartup(ctypes.Structure):
                _fields_ = [('startup', self.m.StartupInfo), ('attributes', ctypes.c_void_p)]
            require(ctypes.sizeof(self.m.StartupInfo) == 104 and ctypes.sizeof(ExtendedStartup) == 112
                    and ctypes.sizeof(self.m.ProcessInfo) == 24, 'abi')
            startup, info = ExtendedStartup(), self.m.ProcessInfo()
            startup.startup.cb, startup.startup.flags = ctypes.sizeof(startup), 0x101
            startup.startup.show = 0
            startup.startup.stdin, startup.startup.stdout, startup.startup.stderr = stdin, stdout, stderr
            startup.attributes = ctypes.addressof(attributes[0])
            command = '"' + NODE + '" --max-old-space-size=64 "' + str(REPO / ENTRY) + '"'
            environment = ('OMP_NUM_THREADS=1\0PATH=D:\\PostgreSQL\\17\\bin;C:\\Windows\\System32;C:\\Windows\0'
                           'SystemRoot=C:\\Windows\0TEMP=' + str(TEMP) + '\0TMP=' + str(TEMP) +
                           '\0UV_THREADPOOL_SIZE=1\0WINDIR=C:\\Windows\0\0')
            block = ctypes.create_unicode_buffer(environment, len(environment))
            ok = self.k.CreateProcessW(NODE, ctypes.create_unicode_buffer(command), None, None, True,
                CREATE_FLAGS, block, str(REPO), ctypes.cast(ctypes.byref(startup),
                ctypes.POINTER(self.m.StartupInfo)), ctypes.byref(info))
            require(bool(ok), 'create-process')
            return info.process, info.thread, int(info.pid)

    return NativeAPI


def catalog_type(inventory):
    I, require = inventory, inventory.require

    class Catalog(I.FileCatalog):
        def _inventory(self):
            for key in NORMAL_SCOPE_ABSENCES:
                require(not os.path.lexists(REPO/key), 'resolution-shadow')
            return super()._inventory() | NORMAL_KEYS

        def _map(self):
            path = I.checked_path(REPO, MAP_KEY)
            size = path.lstat().st_size
            require(0 < size <= I.CATALOG_LIMIT, 'catalog-input')
            require(I.hash_regular_file(REPO, MAP_KEY, size) == self.external_sha, 'catalog-file-pin')
            with path.open('rb') as stream:
                raw = stream.read(I.CATALOG_LIMIT + 1)
            require(len(raw) == size and hashlib.sha256(raw).hexdigest() == self.external_sha, 'catalog-file-pin')
            return raw

    return Catalog


def directory_info(path, inventory):
    for component in reversed((path,) + tuple(path.parents)):
        info = component.lstat()
        inventory.require(inventory.no_reparse(info) and stat.S_ISDIR(info.st_mode), 'owned-directory')
    return path.lstat()


class OwnedRun:
    """Fresh internally named run; prior directories are never adopted/deleted.

    Output512KiB and cluster512MiB remain separately bounded. Control metadata
    (one catalog snapshot, marker and permanent child claim) is capped at1MiB.
    """
    def __init__(self, inventory):
        self.i = inventory
        self.nonce = os.urandom(24).hex()
        self.root = RUNS_ROOT / ('run-' + self.nonce)
        self.output, self.cluster = self.root/'output', self.root/'cluster'
        self.prepared = False
        self.root_id = self.parent_id = self.marker = self.catalog = None
        self.claim = self.claim_pending_id = None

    def prepare(self, raw, external_sha):
        I, require = self.i, self.i.require
        require(not self.prepared and type(raw) is bytes and len(raw)+4096 <= I.CATALOG_LIMIT
                and hashlib.sha256(raw).hexdigest() == external_sha, 'run-catalog')
        directory_info(RUNS_ROOT.parent, I)
        try:
            RUNS_ROOT.mkdir()
        except FileExistsError:
            pass
        info = directory_info(RUNS_ROOT, I)
        self.parent_id = (info.st_dev, info.st_ino)
        self.root.mkdir()  # Exclusive; even an empty existing run is refused.
        info = directory_info(self.root, I)
        self.root_id = (info.st_dev, info.st_ino)
        self.marker = I.canonical_json({'schema':'hierarchy-native-owned-run',
            'nonce':self.nonce, 'runDirectory':str(self.root), 'catalogSha256':external_sha})
        self.catalog = raw
        for name, data in [('run.pending', self.marker), ('reviewed-sources.json', raw)]:
            with (self.root/name).open('xb') as stream:
                require(stream.write(data) == len(data), 'run-publication')
                stream.flush()
                os.fsync(stream.fileno())
        os.link(self.root/'run.pending', self.root/'run.json')
        self.prepared = True
        self.check()

    def _read(self, name, cap, empty=False):
        I, require = self.i, self.i.require
        path = self.root/name
        before = path.lstat()
        require(I.no_reparse(before) and stat.S_ISREG(before.st_mode)
                and (0 if empty else 1) <= before.st_size <= cap, 'run-control-file')
        with path.open('rb') as stream:
            raw = stream.read(cap+1)
        require(len(raw) == before.st_size and len(raw) <= cap, 'run-control-file')
        require(I.hash_regular_file(self.root,name,before.st_size) == hashlib.sha256(raw).hexdigest(), 'run-control-file')
        return raw, before

    def check(self, child_pid=None):
        I, require = self.i, self.i.require
        require(self.prepared, 'run-not-prepared')
        parent, root = directory_info(RUNS_ROOT,I), directory_info(self.root,I)
        require((parent.st_dev,parent.st_ino) == self.parent_id
                and (root.st_dev,root.st_ino) == self.root_id, 'run-replaced')
        allowed = {'run.pending','run.json','reviewed-sources.json','child.pending','child.claim','output','cluster'}
        with os.scandir(self.root) as entries:
            names = set()
            for entry in entries:
                require(entry.name in allowed and entry.name not in names, 'run-unexpected-entry')
                names.add(entry.name)
        require({'run.pending','run.json','reviewed-sources.json'} <= names, 'run-control-missing')
        marker, mi = self._read('run.json',1024)
        pending, pi = self._read('run.pending',1024)
        catalog, _ = self._read('reviewed-sources.json',I.CATALOG_LIMIT)
        require(marker == pending == self.marker and catalog == self.catalog
                and (mi.st_dev,mi.st_ino) == (pi.st_dev,pi.st_ino), 'run-control-changed')
        total = len(marker)+len(pending)+len(catalog)
        # Directory enumeration is not an atomic snapshot of a child's legal
        # publication. Read its fixed permanent paths directly before treating
        # a missing enumerated name as a disappeared claim.
        if os.path.lexists(self.root/'child.pending'):
            # An in-progress exclusive write may be empty/partial. Do not parse
            # it until the child publishes its closed hardlink.
            info = (self.root/'child.pending').lstat()
            require(I.no_reparse(info) and stat.S_ISREG(info.st_mode) and 0 <= info.st_size <= 1024, 'run-child-pending')
            identity = (info.st_dev,info.st_ino)
            if self.claim_pending_id is None:
                self.claim_pending_id = identity
            require(self.claim_pending_id == identity, 'run-child-replaced')
            total += info.st_size
        else:
            require(self.claim_pending_id is None, 'run-child-disappeared')
        if os.path.lexists(self.root/'child.claim'):
            require(os.path.lexists(self.root/'child.pending') and type(child_pid) is int and child_pid>0, 'run-child-identity')
            claim, ci = self._read('child.claim',1024)
            claimed_pending, cpi = self._read('child.pending',1024)
            expected = I.canonical_json({'schema':'hierarchy-native-child-claim',
                'nonce':self.nonce,'catalogSha256':hashlib.sha256(self.catalog).hexdigest(),
                'markerSha256':hashlib.sha256(self.marker).hexdigest(),'pid':child_pid})
            require(claim == claimed_pending == expected and (ci.st_dev,ci.st_ino) == (cpi.st_dev,cpi.st_ino), 'run-child-identity')
            if self.claim is None:
                self.claim = claim
            require(self.claim == claim, 'run-child-changed')
            total += len(claim)
        else:
            require(self.claim is None, 'run-child-disappeared')
        require(total <= I.CATALOG_LIMIT, 'run-control-capacity')


def publisher_type(supervisor, inventory, run):
    class Publisher(supervisor.ExclusivePublisher):
        def __init__(self):
            super().__init__()
            self.root = run.output

        def prepare(self):
            directory_info(self.root.parent, inventory)
            return super().prepare()

        def check(self):
            directory_info(self.root.parent, inventory)
            return super().check()

    return Publisher


def cluster_tree_type(supervisor, inventory, run):
    I, require = inventory, inventory.require
    hash_regular_file = inventory.hash_regular_file

    class ClusterTree(supervisor.ClusterTree):
        def __init__(self):
            super().__init__()
            self.parent = run.cluster

        def check(self):
            require(self.prepared,'cluster-baseline')
            if not os.path.lexists(self.parent):
                require(self.parent_id is None and self.directory is None,'cluster-disappeared');return
            info=self.directory_info(self.parent);current=(info.st_dev,info.st_ino)
            if self.parent_id is None:self.parent_id=current
            require(current==self.parent_id,'cluster-replaced')
            with os.scandir(self.parent) as entries:
                names=[]
                for entry in entries:
                    names.append(entry.name);require(len(names)<=1,'cluster-count')
            if not names:
                require(self.directory is None,'cluster-disappeared');return
            import re
            require(re.fullmatch('nhpg-[A-Za-z0-9]{1,64}',names[0]) is not None,'cluster-name')
            directory=self.parent/names[0];info=self.directory_info(directory)
            if self.directory is None:self.directory,self.directory_id=directory,(info.st_dev,info.st_ino)
            require(directory==self.directory and (info.st_dev,info.st_ino)==self.directory_id,'cluster-replaced')
            pending=[(directory,0)];count=total=0
            while pending:
                root,depth=pending.pop()
                require(depth<=16,'cluster-depth')
                try:
                    self.directory_info(root)
                    with os.scandir(root) as entries:
                        for entry in entries:
                            count+=1;require(count<=8192,'cluster-entry-cap')
                            try:info=entry.stat(follow_symlinks=False)
                            except FileNotFoundError:continue
                            require(I.no_reparse(info),'cluster-reparse')
                            if stat.S_ISDIR(info.st_mode):pending.append((Path(entry.path),depth+1))
                            else:
                                require(stat.S_ISREG(info.st_mode) and info.st_size>=0,'cluster-kind')
                                total+=info.st_size;require(total<=512*MIB,'cluster-byte-cap')
                except FileNotFoundError:
                    require(root!=directory,'cluster-disappeared')
            require(self.directory_info(directory).st_ino==self.directory_id[1],'cluster-replaced')
            marker=directory/'ownership.json'
            if os.path.lexists(marker):
                info=marker.lstat();require(I.no_reparse(info) and stat.S_ISREG(info.st_mode) and 0<info.st_size<=4096,'cluster-marker')
                with marker.open('rb') as stream:raw=stream.read(4097)
                require(len(raw)==info.st_size and len(raw)<=4096,'cluster-marker')
                final_hash=hash_regular_file(self.parent,names[0]+'/ownership.json',info.st_size)
                require(hashlib.sha256(raw).hexdigest()==final_hash,'cluster-marker')
                value=json.loads(raw,object_pairs_hook=I._unique_pairs)
                require(type(value) is dict and set(value)=={'schema','nonce','runDirectory'} and value['schema']=='native-hierarchy-postgres/maintained' and
                    type(value['nonce']) is str and re.fullmatch('[a-f0-9]{48}',value['nonce']) is not None and
                    type(value['runDirectory']) is str and value['runDirectory'].replace('\\','/').casefold()==str(directory).replace('\\','/').casefold(),'cluster-marker')
                pending_info=(directory/'ownership.pending').lstat()
                require((info.st_dev,info.st_ino,info.st_size)==(pending_info.st_dev,pending_info.st_ino,pending_info.st_size) and
                    hash_regular_file(self.parent,names[0]+'/ownership.pending',info.st_size)==final_hash,'cluster-marker')
                if self.marker is None:self.marker=final_hash
                require(self.marker==final_hash,'cluster-marker-drift')
            else:require(self.marker is None,'cluster-marker-disappeared')
    return ClusterTree


def execute(external_sha):
    S = load_pinned('supervisor')
    I = S.I  # Keep the controller's exact refusal type and authenticated helper.
    I.require(sys.flags.isolated and sys.flags.no_site and sys.flags.dont_write_bytecode, 'python-flags')
    I.require(sys.platform == 'win32' and Path(sys.executable).resolve() == I.RUNTIME_PINS['@python'][0].resolve(), 'python-path')
    I.require(str(REPO).replace(chr(92), '/').casefold() == 'd:/gitprojekts/universal-discussion-bootstrap', 'fixed-repo')
    catalog = catalog_type(I)(external_sha)
    run = OwnedRun(I)
    publisher = publisher_type(S, I, run)()
    tree = cluster_tree_type(S, I, run)()
    modules, host_native = {'windows':load_pinned('windows')}, []

    def authenticate():
        catalog.authenticate()
        run.prepare(catalog.raw, external_sha)
        publisher.prepare()
        tree.prepare()
        modules['baseline'] = load_pinned('baseline')
        I.require(modules['baseline'].abi()['valid'], 'abi')

    def host():
        if not host_native:
            host_native.append(modules['baseline'].WindowsNative())
        return host_native[0].resources(None)

    def workspace():
        run.check(controller.boundary.pid if controller.boundary is not None else None)
        publisher.check()
        tree.check()

    def boundary():
        W, B = modules['windows'], modules['baseline']
        return W.OwnedFixtureProcess(B, api=native_api_type(W, run)(B))

    controller = diagnostic_controller_type(S, modules['windows'])(authenticate=authenticate, end_pins=catalog.end_pins,
        host_sample=host, boundary_factory=boundary, validate=semantic_completion,
        clock=time.monotonic, pause=time.sleep, workspace_check=workspace, started_at=STARTED)
    result = controller.run()
    if publisher.prepared:
        def final_checkpoint():
            controller.now(controller.normal_deadline-controller.started if result['accepted'] else 390)
            workspace()
            if result['accepted']:
                controller.host()
        publisher.publish(result, bytes(controller.buffers['stdout']), bytes(controller.buffers['stderr']), final_checkpoint)
    return result


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if (type(args) is not list or len(args) != 1 or type(args[0]) is not str
            or len(args[0]) != 64 or any(c not in '0123456789abcdef' for c in args[0])):
        sys.stderr.write('Exactly one reviewed hierarchy catalog SHA256 is required.\n')
        return 2
    try:
        result = execute(args[0])
        sys.stdout.write(json.dumps({'schema':'native-hierarchy-postgres-invocation/v2',
            'accepted':result['accepted']}, sort_keys=True, separators=(',', ':'))+'\n')
        return 0 if result['accepted'] else 1
    except BaseException:
        sys.stderr.write('Maintained hierarchy check did not complete.\n')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
