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
ENTRY = OWN + 'hierarchy-native-check.js'
OUTPUT = REPO / 'apps/local-service/portable/data/hierarchy-native-check-output'
TEMP = OUTPUT / 'temp'
CLUSTER_PARENT = REPO / 'apps/local-service/portable/data/hierarchy-native-check'
MAP_KEY = OWN + 'hierarchy-native-reviewed-sources.json'
MIB = 1048576
CREATE_FLAGS = 0x8040C
NORMAL_KEYS = frozenset([
    'apps/local-service/portable/canonical-v4/hierarchy-schema-source.js',
    'apps/local-service/portable/canonical-v4/hierarchy-repository.js',
    'apps/local-service/portable/test/hierarchy-schema-source.test.js',
    'apps/local-service/portable/test/hierarchy-native-composition.test.js',
    'apps/local-service/portable/test/hierarchy-native-assertions.js',
    OWN + 'hierarchy-native-context.js', OWN + 'hierarchy-native-cluster.js',
    ENTRY, OWN + 'hierarchy-native-driver.py', OWN + 'hierarchy_native_driver_test.py',
])
PINS = {
    'inventory': (OLD+'inventory.py', '3dfc2dcdb0c09a46d6215b5cf0781829f27a70f03c8106e6bb70db18bf28f385'),
    'supervisor': (OLD+'supervise.py', '2ccaf30294cd0edc87e126aeb152ca76a100e2cc289f2dc5f652241f33cae334'),
    'windows': (OLD+'windows.py', '890cca5fe58a938ba3b6be960d951d35265a7217cc9a831e31358b1fee79c433'),
    'baseline': ('spikes/topic-resolution/harness/experimental/native-job-list-observation-v2/run.py',
                 '8e0cf0aefd09a80c1c4971fa8515024b47ca47ab8eed28e4065acae02373c940'),
}


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


def native_api_type(windows):
    # Only the fixed CreateProcess entry/TEMP binding differs. Assignment,
    # inherited-handle whitelist, readback, census and close use frozen code.
    require = windows.require
    wintypes = windows.wintypes

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


def publisher_type(supervisor, inventory):
    class Publisher(supervisor.ExclusivePublisher):
        def __init__(self):
            super().__init__()
            self.root = OUTPUT

        def prepare(self):
            directory_info(self.root.parent, inventory)
            return super().prepare()

        def check(self):
            directory_info(self.root.parent, inventory)
            return super().check()

    return Publisher


def cluster_tree_type(supervisor, inventory):
    I, require = inventory, inventory.require
    hash_regular_file = inventory.hash_regular_file

    class ClusterTree(supervisor.ClusterTree):
        def __init__(self):
            super().__init__()
            self.parent = CLUSTER_PARENT

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
    publisher = publisher_type(S, I)()
    tree = cluster_tree_type(S, I)()
    modules, host_native = {}, []

    def authenticate():
        catalog.authenticate()
        publisher.prepare()
        tree.prepare()
        modules['baseline'] = load_pinned('baseline')
        modules['windows'] = load_pinned('windows')
        I.require(modules['baseline'].abi()['valid'], 'abi')

    def host():
        if not host_native:
            host_native.append(modules['baseline'].WindowsNative())
        return host_native[0].resources(None)

    def workspace():
        publisher.check()
        tree.check()

    def boundary():
        W, B = modules['windows'], modules['baseline']
        return W.OwnedFixtureProcess(B, api=native_api_type(W)(B))

    controller = S.Controller(authenticate=authenticate, end_pins=catalog.end_pins,
        host_sample=host, boundary_factory=boundary, validate=S.validate_completion,
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
