"""Fixed isolated native hierarchy supervisor SOURCE; no automatic execution."""
import hashlib
import json
import os
from pathlib import Path
import stat
import time

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
OWN = 'apps/local-service/portable/integration/native-hierarchy-postgres-v2/'
INVENTORY_PIN = '3dfc2dcdb0c09a46d6215b5cf0781829f27a70f03c8106e6bb70db18bf28f385'

def bootstrap_inventory():
    import types
    path=HERE/'inventory.py'
    for parent in reversed((path,)+tuple(path.parents)):
        info=parent.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info,'st_file_attributes',0)&0x400:
            raise RuntimeError('bootstrap-reparse')
    before=path.lstat()
    if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= 262144:
        raise RuntimeError('bootstrap-size')
    with path.open('rb') as stream:
        opened=os.fstat(stream.fileno())
        raw=stream.read(262145)
        after_open=os.fstat(stream.fileno())
    after=path.lstat()
    identity=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,
        s.st_birthtime_ns if os.name=='nt' else s.st_ctime_ns)
    if not (identity(before)==identity(opened)==identity(after_open)==identity(after) and
        before.st_ctime_ns==after.st_ctime_ns and opened.st_ctime_ns==after_open.st_ctime_ns and
        len(raw)==before.st_size and hashlib.sha256(raw).hexdigest()==INVENTORY_PIN):
        raise RuntimeError('bootstrap-pin')
    module=types.ModuleType('_authenticated_native_inventory')
    module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    return module

_BOOTSTRAP_STARTED=time.monotonic()  # Before the first authenticated file read.
I=bootstrap_inventory()
MIB,CAPS,FileCatalog=I.MIB,I.CAPS,I.FileCatalog
Refusal,require,number,uint,hex_sha=I.Refusal,I.require,I.number,I.uint,I.hex_sha
canonical_json,checked_path,hash_regular_file=I.canonical_json,I.checked_path,I.hash_regular_file
no_reparse=I.no_reparse
SNAPSHOT_KEYS=I.SNAPSHOT_KEYS
CASE_NAMES=["pure wire and factory capability preconditions do not open any DB","actual canonical native queue, historical topology and ancestor feeds (separately gated)","full143/depth8 publication and canonical admission preserve both signed-zero wires","SQL publication rejects missing parents, cycles, duplicates and genuine depth9 atomically","real root/snapshot/ancestor edges commit atomically; owner prefix is display only","all15 outside-detail roots use actual protected preparation and canonical writes","fresh observation with unchanged material appends evidence without material-version inflation","page A→B/replay preserves original Source/Topic/Discussion/root and real reply hydration","owner-wide CAS affects both authors, not semantic membership or existing root prefix","unresolved actual native observation creates canonical root with NO semantic edges","inherited versus explicit owner subtree cut changes posting projection without rescoring/edge rewrites","ancestor keyset pages deduplicate, exclude siblings and fence only related feed changes","pre-enqueue failure retains bounded original issued command; explicit same request resumes only handoff","committed attestation without issuance quarantines retries before allocation or preparation","lease/token/prior mismatches and one-use attestation cannot create duplicate canonical Sources","private attestation revocation and expired prequeue commands fail closed and scrub without renewal","completion rejoins publication head and Source incarnation before any canonical mutation","actual mutation before original authority expiry still rolls back at late literal COMMIT","actual canonical mutation rollback and destructive wrappers restore all history/edges atomically","two accepted revisions SAME publication family preserve old ancestry; family revoke hides edges only","unissued/forged refs/direct old publication or node enqueue refuse without canonical mutation","Source erasure scrubs vectors/evidence and retires operations but keeps original discussion","actual local-detail conflict and STOP persist root-only canonical membership (separately gated)","conflict","stop"]

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
                'native-hierarchy-postgres-supervisor/v2', 'publication-result')
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
            row['limits'] == {'flags': 0x2208, 'activeProcessLimit': 32,
                              'jobMemoryBytes': 1024*MIB} and
            all(type(value) is int for value in row['limits'].values())), 'native-snapshot')
    return dict(row, limits=None if row['limits'] is None else dict(row['limits']))


def checked_completion(row):
    keys = {'schema', 'accepted', 'code', 'stdoutBytes', 'stderrBytes',
            'stdoutSha256', 'stderrSha256', 'testPoints', 'outerTests'}
    codes = {'input-type','stdout-limit','stderr-limit','exit-status','json-encoding',
             'json-shape','json-proof','json-cleanup','json-cases','complete'}
    require(type(row) is dict and set(row) == keys and
            row['schema'] == 'native-hierarchy-postgres-json-report/v2' and
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
                 validate, clock, pause, workspace_check=lambda: None, started_at=None):
        self.clock, self.pause = clock, pause
        self.authenticate, self.end_pins = authenticate, end_pins
        self.host_sample, self.boundary_factory, self.validate = host_sample, boundary_factory, validate
        self.workspace_check = workspace_check
        self.started = clock() if started_at is None else started_at
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

    def now(self, limit=390):
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
        for key, floor in (('physicalFree', (2144 if startup else 1024)*MIB),
                           ('commitFree', (2144 if startup else 1024)*MIB),
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
        require(account['activeProcesses'] <= 32 and account['activeProcesses'] <= account['totalProcesses'] and
                account['totalTerminatedProcesses'] <= account['totalProcesses'], 'job-accounting')
        require(cpu == (account['user100ns'] + account['kernel100ns'])/10000000,
                'job-accounting')
        require(cpu >= self.last_cpu and peak >= self.last_peak, 'resource-regression')
        if self.last_accounting is not None:
            require(all(account[key] >= self.last_accounting[key] for key in keys
                        if key != 'activeProcesses'), 'resource-regression')
        self.last_cpu, self.last_peak, self.last_accounting = cpu, peak, dict(account)
        require(cpu <= 60, 'resource-limit', 'jobCpuSeconds', cpu)
        require(peak <= 1024*MIB, 'resource-limit', 'historicalPeakJobMemoryBytes', peak)
        # These are sampled independently of host_sample; neither is a reservation.
        for key, floor in (('physicalFree', 1024*MIB), ('commitFree', 1024*MIB),
                           ('cFree', 2048*MIB), ('dFree', 4096*MIB)):
            require(uint(row.get(key)), 'resource-shape')
            require(row[key] >= floor, 'resource-floor', key, row[key])

    def guard(self, limit=360):
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
        require(self.ticks <= 39000, 'poll-limit')
        require(self.pause(0.01) is None, 'pause-return')

    def cleanup_owned(self):
        """Failures never turn off physical observation or create a fresh lease."""
        if self.boundary is None:
            return
        try:
            retired = checked_snapshot(self.boundary)
            if retired['allHandlesClosed']:
                self.native = retired
                require(not retired['processCreated'] or retired['completeEmptyJob'], 'cleanup-retirement-unverified')
                return
        except BaseException as error:
            self.remember(error, True, 'cleanup-observation')
        try:
            self.boundary.terminate_owned()
        except BaseException as error:
            self.remember(error, True, 'termination-failure')
        try:
            failure_time = self.now()
            deadline = min(failure_time + 20, self.started + 380,
                           self.normal_deadline if self.normal_deadline is not None else self.started + 380)
        except BaseException as error:
            self.remember(error, True)
            deadline = None
        emergency_drain = False
        while True:
            try:
                row = checked_snapshot(self.boundary)
                if not row['processCreated'] or (row['exited'] and row['stdoutEof'] and row['stderrEof'] and self.boundary.normal_retirement_ready()):
                    break
                if row['processCreated']:
                    self.boundary.poll_exit()
                    self.drain_once(discard=True)
                row = checked_snapshot(self.boundary)
                if not row['processCreated'] or (row['exited'] and row['stdoutEof'] and row['stderrEof'] and self.boundary.normal_retirement_ready()):
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
                    deadline = min(deadline + 10, self.started + 390)
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
            self.now(360)
            self.host(startup=True)
            self.boundary = self.boundary_factory()
            self.boundary.initialize(self.guard)
            self.ready = True
            self.guard()
            self.host(startup=True)
            self.boundary.launch_suspended(self.guard)
            self.boundary.assign_and_resume(self.guard)
            while True:
                limit = 360 if self.normal_deadline is None else self.normal_deadline-self.started
                self.guard(limit)
                self.boundary.poll_exit()
                observed = checked_snapshot(self.boundary)
                if observed['exited'] and self.normal_deadline is None:
                    # Exit must be observed before360. Only physical EOF/drain,
                    # close and final checks may use the normal20s allowance.
                    observed_at = self.now(360)
                    self.normal_deadline = min(observed_at+20, self.started+380)
                    limit = self.normal_deadline-self.started
                self.drain_once()
                self.native = checked_snapshot(self.boundary)
                self.guard(limit)
                if self.native['exited'] and self.native['stdoutEof'] and self.native['stderrEof'] and self.boundary.normal_retirement_ready():
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
        return {'schema': 'native-hierarchy-postgres-supervisor/v2',
                'accepted': self.primary is None and self.cleanup is None,
                'primary': self.primary, 'cleanup': self.cleanup,
                'endPinsChecked': self.end_checked, 'native': self.native,
                'completion': self.tap,
                'cleanupClassification': ('verified-normal' if self.native is not None and
                    self.native['completeEmptyJob'] and self.native['allHandlesClosed'] and
                    not self.native['emergency'] and not self.native['closeFailure'] else
                    'owned-emergency' if self.native is not None and self.native['emergency'] else
                    'unverified-may-use-kill-on-close')}



def validate_completion(stdout,stderr,exit_code):
    result={'schema':'native-hierarchy-postgres-json-report/v2','accepted':False,
        'code':'input-type','stdoutBytes':0,'stderrBytes':0,'stdoutSha256':None,
        'stderrSha256':None,'testPoints':0,'outerTests':0}
    def refused(code):result['code']=code;return result
    if type(stdout) is not bytes or type(stderr) is not bytes:return result
    result.update(stdoutBytes=len(stdout),stderrBytes=len(stderr),
        stdoutSha256=hashlib.sha256(stdout).hexdigest(),stderrSha256=hashlib.sha256(stderr).hexdigest())
    if len(stdout)>CAPS['stdout']:return refused('stdout-limit')
    if len(stderr)>CAPS['stderr']:return refused('stderr-limit')
    if type(exit_code) is not int or exit_code!=0:return refused('exit-status')
    try:
        require(stdout.endswith(b'\n') and stdout.count(b'\n')==1,'json-encoding')
        value=json.loads(stdout.decode('utf8'),object_pairs_hook=I._unique_pairs,
            parse_constant=lambda _: (_ for _ in ()).throw(Refusal('json-encoding')))
    except (ValueError,UnicodeError,Refusal,RecursionError):return refused('json-encoding')
    if type(value) is not dict or set(value)!={'schema','accepted','primary','server','cleanup','proof'}:
        return refused('json-shape')
    if value['schema']!='native-hierarchy-postgres-result/v2' or value['accepted'] is not True or value['primary'] is not None:
        return refused('json-proof')
    server=value['server']
    if type(server) is not dict or server!={'port':55433,'version':170011,'ownershipVerified':True} or type(server['port']) is not int or type(server['version']) is not int or server['ownershipVerified'] is not True:
        return refused('json-proof')
    cleanup=value['cleanup']
    if type(cleanup) is not dict or set(cleanup)!={'reason','stopped','childExited','clientsClosed','physicalSettled','directoryRetained'} or cleanup['reason']!='verified-own-server-smart-stopped' or not all(cleanup[k] is True for k in cleanup if k!='reason'):
        return refused('json-cleanup')
    proof=value['proof']
    if type(proof) is not dict or set(proof)!={'schema','status','nativeExecuted','pendingAssertions','cases','cleanup','concurrencyValidated','restrictedRoleValidated','semanticQualityMeasured'}:
        return refused('json-shape')
    if proof['schema']!='native-hierarchy-postgres-proof/v2' or proof['status']!='passed' or proof['nativeExecuted'] is not True or type(proof['pendingAssertions']) is not int or proof['pendingAssertions']!=0 or any(proof[k] is not False for k in ('concurrencyValidated','restrictedRoleValidated','semanticQualityMeasured')):
        return refused('json-proof')
    cases=proof['cases']
    if type(cases) is not list or len(cases)!=25:return refused('json-cases')
    depths=[0,0]+[1]*20+[0,1,1]
    if any(type(row) is not dict or set(row)!={'name','depth','status'} or row['name']!=CASE_NAMES[i] or type(row['depth']) is not int or row['depth']!=depths[i] or row['status']!='passed' for i,row in enumerate(cases)):
        return refused('json-cases')
    result.update(testPoints=25,outerTests=3)
    dbs=proof['cleanup']
    if type(dbs) is not dict or set(dbs)!={'status','used','finished','adminClosed','failureCount','databases'} or dbs['status']!='passed' or type(dbs['used']) is not int or dbs['used']!=2 or dbs['finished'] is not True or dbs['adminClosed'] is not True or type(dbs['failureCount']) is not int or dbs['failureCount']!=0:
        return refused('json-cleanup')
    rows=dbs['databases']
    if type(rows) is not list or len(rows)!=2:return refused('json-cleanup')
    for index,row in enumerate(rows):
        if type(row) is not dict or set(row)!={'name','oid','created','closed','dropped','pending','cleanupFailures'} or row['name']!='murmingle_hierarchy_fixture_20261026_'+('a' if index==0 else 'b'):
            return refused('json-cleanup')
        if type(row['oid']) is not str or not 1<=len(row['oid'])<=10 or not all('0'<=c<='9' for c in row['oid']) or row['oid'].startswith('0') or not 0<int(row['oid'])<=4294967295 or not all(row[k] is True for k in ('created','closed','dropped')) or type(row['pending']) is not int or row['pending']!=0 or type(row['cleanupFailures']) is not int or row['cleanupFailures']!=0:
            return refused('json-cleanup')
    if rows[0]['oid']==rows[1]['oid']:return refused('json-cleanup')
    result.update(accepted=True,code='complete');return result

class ClusterTree:
    """Sampled logical size/count bound on this new tree, not a quota/sandbox."""
    def __init__(self):
        self.parent=REPO/'apps/local-service/portable/data/native-hierarchy-postgres-v2'
        self.prepared=False;self.parent_id=self.directory_id=self.directory=None
        self.marker=None
    def directory_info(self,path):
        for component in reversed((path,)+tuple(path.parents)):
            info=component.lstat()
            require(I.no_reparse(info) and stat.S_ISDIR(info.st_mode),'cluster-directory')
        return path.lstat()
    def prepare(self):
        require(not self.prepared,'cluster-baseline')
        if os.path.lexists(self.parent):
            info=self.directory_info(self.parent);self.parent_id=(info.st_dev,info.st_ino)
            with os.scandir(self.parent) as entries:
                require(next(entries,None) is None,'cluster-existing-output')
        else:self.directory_info(self.parent.parent)
        self.prepared=True
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
        require(re.fullmatch('nhpg2-[A-Za-z0-9]{1,64}',names[0]) is not None,'cluster-name')
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
            require(type(value) is dict and set(value)=={'schema','nonce','runDirectory'} and value['schema']=='native-hierarchy-postgres/v2' and
                type(value['nonce']) is str and re.fullmatch('[a-f0-9]{48}',value['nonce']) is not None and
                type(value['runDirectory']) is str and value['runDirectory'].replace('\\','/').casefold()==str(directory).replace('\\','/').casefold(),'cluster-marker')
            pending_info=(directory/'ownership.pending').lstat()
            require((info.st_dev,info.st_ino,info.st_size)==(pending_info.st_dev,pending_info.st_ino,pending_info.st_size) and
                hash_regular_file(self.parent,names[0]+'/ownership.pending',info.st_size)==final_hash,'cluster-marker')
            if self.marker is None:self.marker=final_hash
            require(self.marker==final_hash,'cluster-marker-drift')
        else:require(self.marker is None,'cluster-marker-disappeared')

def load_fixed_module(name,pins):
    import types
    allowed={'baseline':I.BASELINE+'run.py','windows':OWN+'windows.py'}
    require(name in allowed,'module-name');key=allowed[name]
    path=checked_path(REPO,key)
    require(pins[key]['bytes']<=2*MIB,'module-size')
    with path.open('rb') as stream:raw=stream.read(2*MIB+1)
    require(len(raw)==pins[key]['bytes'] and hashlib.sha256(raw).hexdigest()==pins[key]['sha256'],'module-pin')
    module=types.ModuleType('_authenticated_native_'+name);module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__);return module

def execute_fixed_fixture(external_sha):
    import sys,time
    require(sys.flags.isolated and sys.flags.no_site and sys.flags.dont_write_bytecode,'python-flags')
    require(sys.platform=='win32' and Path(sys.executable).resolve()==I.RUNTIME_PINS['@python'][0].resolve(),'python-path')
    require(str(REPO).replace('\\','/').casefold()=='d:/gitprojekts/universal-discussion-bootstrap','fixed-repo')
    catalog,publisher,tree=FileCatalog(external_sha),ExclusivePublisher(),ClusterTree()
    modules={};host_native=[]
    def authenticate():
        catalog.authenticate();publisher.prepare();tree.prepare()
        pins={r['key']:r for r in catalog.value['files']}
        for name in ('baseline','windows'):modules[name]=load_fixed_module(name,pins)
        require(modules['baseline'].abi()['valid'],'abi')
        require(modules['windows'].REPO==REPO and modules['windows'].TEMP==HERE/'output'/'temp','fixed-boundary-path')
    def host():
        if not host_native:host_native.append(modules['baseline'].WindowsNative())
        return host_native[0].resources(None)
    def workspace():publisher.check();tree.check()
    controller=Controller(authenticate=authenticate,end_pins=catalog.end_pins,host_sample=host,
        boundary_factory=lambda:modules['windows'].OwnedFixtureProcess(modules['baseline']),
        validate=validate_completion,clock=time.monotonic,pause=time.sleep,workspace_check=workspace,started_at=_BOOTSTRAP_STARTED)
    result=controller.run()
    if publisher.prepared:
        def final_checkpoint():
            controller.now(controller.normal_deadline-controller.started if result['accepted'] else 390)
            workspace()
            if result['accepted']:controller.host()
        publisher.publish(result,bytes(controller.buffers['stdout']),bytes(controller.buffers['stderr']),final_checkpoint)
    return result

def main(argv=None):
    import sys
    args=sys.argv[1:] if argv is None else argv
    if type(args) is not list or len(args)!=1 or not hex_sha(args[0]):
        sys.stderr.write('Exactly one reviewed native catalog SHA256 is required.\n');return 2
    try:
        result=execute_fixed_fixture(args[0])
        sys.stdout.write(canonical_json({'schema':'native-hierarchy-postgres-invocation/v2','accepted':result['accepted']}).decode('ascii'))
        return 0 if result['accepted'] else 1
    except BaseException:
        sys.stderr.write('Isolated native hierarchy fixture did not complete.\n');return 1

if __name__=='__main__':raise SystemExit(main())
