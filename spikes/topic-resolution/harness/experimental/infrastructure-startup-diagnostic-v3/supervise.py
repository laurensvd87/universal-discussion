"""ADR198 explicit startup-only owner. Import and no-argument execution are inert."""
import ctypes
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import threading
import time
import types

ACTUAL_RELEASE = 'adr203-reviewed-startup/v1'
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
OWN = 'spikes/topic-resolution/harness/experimental/infrastructure-startup-diagnostic-v3/'
V13 = 'spikes/topic-resolution/harness/experimental/native-specificity-study-v13/'
DEV = 'spikes/topic-resolution/harness/experimental/playwright-dev-v1/'
PREFIX = 'node_modules/playwright-core/'
PACKAGE = REPO / DEV / PREFIX
BASELINE_KEY = 'spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/freeze.json'
BASELINE_PIN = '908ed69a9b1e42ed6fb0de7ac0d0862ffb5fe8964cf368701cb442085e1091bb'
INTEGRITY = 'sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ=='
HELPERS = {
 'generic': V13 + 'supervise.py',
 'native': 'spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/run.py',
 'baseline': 'spikes/topic-resolution/harness/experimental/native-console-baseline-dev-v1/baseline.py',
 'census': 'spikes/topic-resolution/harness/experimental/growing-owned-job-census-v1/census.py'}
HELPER_PINS = {
 'generic': '8849cc1b06a26df3cb3ea1378cbe98013de13add89ac16fc5f483030a0d9afe1',
 'native': '5865e5bbf769549ca5cd2e58f635b7cfee1e94d264fc4a82fd59ec42f66d0e27',
 'baseline': '03cc1268b8772a8ae2b46c6af24de3fdad74b6abcb459825c7f9d5ec4be73527',
 'census': '235df1bdb1027a3c9dac8ee65e9a1b1852dfb042c2bd50608ab5840b13fc45db'}
PROFILES = ['profile-01']
RUNTIME = {'platform':'win32','nodeVersion':'v24.19.0'}
HANDSHAKE = b'NATIVE_SPECIFICITY_OWN_JOB_ASSIGNED_V1\n'
MIB = 1048576
SHAPES = {
 'sourceMap': ['schema','sourcePathsFileSha256','sourceHashes'],
 'freeze': ['schema','sourcePathsFileSha256','sourceMapFileSha256','sourceHashes','protocolSha256','profiles','freezeHash'],
 'request': ['schema','sequence','sourceIdentityHash','sourcePathsFileSha256','nodePid','kind','priorChainHash','payload'],
 'response': ['schema','sequence','kind','requestHash','chainHash','payload'],
 'bootstrap': ['schema','sourceIdentityHash','sourcePathsFileSha256','sourceMapHash','nodePid','creationFiletime','deadlineMilliseconds'],
 'fault': ['schema','profileIndex','stage','rpc','code','witness'],
 'profile': ['schema','profileIndex','status','preLoadCensus','finalCensus','contextCloseAttempts','browserCloseAttempts','contextClosed','browserClosed','physicalOperationsDrained','callbacksDrained','pending','firstFault'],
 'result': ['schema','bindings','status','profiles','drainAckHashes','firstFault','proofHead'],
 'ready': ['bootstrapHash','creationFiletime','nodeVersion'],
 'profileBegin': ['profileIndex','previousDrainAckHash'],
 'profileDrain': ['profileIndex','result','resultHash','proofHead'],
 'faultRequest': ['firstFault','firstFaultHash'],
 'complete': ['result','resultHash'],
 'fsBefore': ['pathKey'], 'fsAfter': ['ticket','pathKey']}
SHAPES = {**SHAPES,
 'bindings':['sourcePathsFileSha256','freezeFileSha256','freezeHash','sourceMapHash','nodePid','creationFiletime','bootstrapFileSha256','baselineHash'],
 'faultEvidence':['schema','bindings','requestSequence','requestHash','firstFaultHash','firstFault'],
 'pending':['originals','callbacks','unsafeOriginal','unsafeObligations','coordinator'],
 'coordinator':['failure','disposed','events','cleanupIssued','backlog','normalActive','cleanupActive','denialActive','peakNormal','peakCleanup','peakAggregate','peakDenials','peakBacklog'],
 'proofHead':['sequence','chainHash'],
 'bootstrapRefusal':['schema','stage','code'],
 'controlMilestone':['schema','index','request','response','physicalAckWriteSettled'],
 'milestoneSummary':['index','kind','sequence','preparedFileSha256','committedFileSha256'],
 'nativeProof':['pathKey','ancestorsChecked','openedIdentityChecked','attributes','identity','atomic'],
 'nativeIdentity':['volumeSerial','fileIndex','creationFiletime','size','fileType'],
 'baseline':['schema','node','console','baselineHash'],
 'baselineIdentity':['pid','creationFiletime','imagePathSha256','imagePathHashEncoding'],
 'supervisor':['schema','status','sourcePathsFileSha256','freezeFileSha256','bindings','baseline','resultFileSha256','firstFaultFileSha256','committedControlHead','committedControlBytes','milestones','proofScope','nodeStarted','nodeAssigned','normalExit','exitCode','firstFaultSaved','firstFault','protocolComplete','emergencyOwnJobTermination','ownCleanupPassed','endchecksPassed','peak','enumeration','collectorFailure','authority','productionValidated'],
 'metadataSupervisor':['schema','status','nodeStarted','jobCreated','sourcePathsFileSha256','sourceMapFileSha256','freezeFileSha256','freezeHash','parentCpuMilliseconds','sourceHashesRechecked'],
 'metadataFailure':['schema','status','nodeStarted','jobCreated','sourceHashesRechecked'],
 'proofAck':['ticket','proof'], 'startupAck':['schema','baseline'],
 'beginAck':['schema','profileIndex'], 'drainAck':['schema','profileIndex','resultHash'],
 'faultAck':['schema','firstFaultHash'], 'exitAck':['schema','status','resultHash']}
LIMITS = {'activeSeconds':360,'wallSeconds':420,'cpuSeconds':60,'bootstrapSeconds':30,'readySeconds':15,
 'profileSeconds':45,'drainSeconds':15,'frameBytes':16384,'wireBytes':67108864,'processes':128,
 'memoryBytes':1536*MIB,'studyBytes':8192*MIB,'studyEntries':344064,'currentBytes':512*MIB,
 'currentEntries':8192,'evidenceBytes':32*MIB,'logBytes':MIB,'resultBytes':524288,'diagnosticBytes':320}
KINDS = ['FS_BEFORE','FS_AFTER','READY','PROFILE_BEGIN','PROFILE_DRAIN','FAILED_PROFILE_DRAIN','STARTUP_FAULT','COMPLETE','FAILED_COMPLETE']
BOOTSTRAP_STAGES = ['configuration','held-handshake','bootstrap-read','ready','source-authentication','package-directories','runtime-import','profiles','pipe-finish']
STAGES = frozenset(['launch','cleanup','context.launch','http-deny','socket-deny','http-abort','socket-close',
 'browser.root-session','Browser.setDownloadBehavior','context.anchor-session','Target.getTargetInfo',
 'Target.setDiscoverTargets','Target.getTargets.pre-load','Target.getTargets.final','context.close','browser.close'])
CODES = frozenset(['contract','deadline','physical-unsettled','client-failure','unexpected-page','unexpected-worker',
 'unexpected-navigation','unexpected-page-event','unexpected-disconnect','blank-anchor','browser-handle',
 'event-capacity','retained-capacity','infrastructure-contract','infrastructure-identity',
 'infrastructure-lifecycle','infrastructure-census','anchor-contract'])

def require(value, code='contract'):
    if value is not True:
        raise RuntimeError(code)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def wire(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf8')

def digest(value):
    return sha(wire(value))

def exact(value, keys):
    require(type(value) is dict and list(value) == list(keys), 'schema')
    return value

def hash_value(value):
    require(type(value) is str and re.fullmatch('[a-f0-9]{64}', value) is not None, 'hash')
    return value

def strict(data, maximum=524288):
    require(type(data) is bytes and 0 < len(data) <= maximum, 'json-capacity')
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, 'duplicate-key')
            out[key] = value
        return out
    value = json.loads(data.decode('utf8'), object_pairs_hook=pairs,
                       parse_constant=lambda _: require(False, 'nonfinite-json'))
    require(wire(value) == data, 'canonical-json')
    return value

def integer(value, maximum=9007199254740991, minimum=0):
    require(type(value) is int and minimum <= value <= maximum, 'counter')
    return value

def parse_cli(argv):
    if argv == []:
        return None
    require(type(argv) is list and len(argv) == 5, 'cli')
    mode = argv[0]
    require(mode in ('--prepare','--run-startup') and argv[1] == '--source-paths-sha256' and
            argv[3] == ('--source-map-sha256' if mode == '--prepare' else '--freeze-sha256'), 'cli')
    return mode, hash_value(argv[2]), hash_value(argv[4])

def checked(path, root=REPO):
    path = Path(path)
    at = path
    while True:
        info = at.lstat()
        require(not stat.S_ISLNK(info.st_mode) and not getattr(info, 'st_file_attributes', 0) & 0x400, 'reparse')
        if at == root:
            break
        require(at != at.parent, 'containment')
        at = at.parent
    require(path.resolve() == path, 'resolved-path')
    return path.lstat()

def read_fixed(path, maximum=4194304, root=REPO, *, inspect=None, open_file=None, opened_stat=None):
    inspect=checked if inspect is None else inspect
    open_file=(lambda p:p.open('rb')) if open_file is None else open_file
    opened_stat=(lambda stream:os.fstat(stream.fileno())) if opened_stat is None else opened_stat
    before = inspect(path, root)
    require(stat.S_ISREG(before.st_mode) and 0 < before.st_size <= maximum, 'file-capacity')
    with open_file(path) as stream:
        opened=opened_stat(stream)
        require(stat.S_ISREG(opened.st_mode) and (opened.st_dev,opened.st_ino)==(before.st_dev,before.st_ino),'opened-file-identity')
        data=stream.read(maximum+1)
        opened_after=opened_stat(stream)
        require((opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns,opened.st_ctime_ns)==
                (opened_after.st_dev,opened_after.st_ino,opened_after.st_size,opened_after.st_mtime_ns,opened_after.st_ctime_ns),'opened-file-drift')
    after = inspect(path, root)
    require((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns) ==
            (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) and len(data) == before.st_size, 'file-drift')
    return data

def literal_paths(data):
    matches = re.findall(r'export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\);', data.decode('utf8'))
    require(len(matches) == 1, 'source-literal')
    names = json.loads(matches[0])
    require(type(names) is list and 1 <= len(names) <= 128 and
            all(type(x) is str for x in names) and names == sorted(set(names)), 'source-keyset')
    require(len({name.lower() for name in names})==len(names),'source-casefold')
    for key in names:
        require(re.fullmatch('[A-Za-z0-9._/-]{1,240}', key) is not None and not key.startswith('/') and
                all(x not in ('','.','..') for x in key.split('/')) and '/output/' not in key and
                '/node_modules/' not in key and not key.startswith('node_modules/') and '/.assets/' not in key and
                not key.startswith('apps/local-service/data/'), 'source-path')
    require(set(HELPERS.values()).issubset(names) and all(OWN + name in names for name in
            ('protocol.json','source-paths.js','supervise.py','run.mjs','test.mjs','README.md')), 'source-closure')
    return names

def package_files(expected, guard, root=PACKAGE, *, inspect=None, children=None):
    inspect=checked if inspect is None else inspect
    children=os.scandir if children is None else children
    require(type(expected) is list and len(expected)==115 and expected==sorted(set(expected)), 'package-keyset')
    require(all(type(key) is str and key.startswith(PREFIX) for key in expected) and
            len({key.lower() for key in expected})==115,'package-keyset')
    directories={'':set()}
    files=set()
    for key in expected:
        guard()
        relative=key[len(PREFIX):]
        parts=relative.split('/')
        require(1<=len(parts)<=9 and all(re.fullmatch('[A-Za-z0-9._-]{1,256}',part) and part not in ('.','..') for part in parts),'package-path')
        files.add(relative)
        for i,part in enumerate(parts):
            parent='/'.join(parts[:i])
            directories.setdefault(parent,set()).add(part)
            if i<len(parts)-1:directories.setdefault('/'.join(parts[:i+1]),set())
        guard()
    require(len(directories)<=921 and not files.intersection(directories) and
            len({name.lower() for name in files|set(directories)})==len(files)+len(directories),'package-directory-keyset')
    require(all(len(names)<=128 for names in directories.values()),'package-capacity')
    result = []
    total = 0
    visited=set()
    def visit(directory, depth):
        nonlocal total
        guard()
        relative=directory.relative_to(root).as_posix() if directory!=root else ''
        require(depth<=8 and relative in directories and relative not in visited and
                len(visited)<len(directories),'package-directory')
        visited.add(relative)
        require(stat.S_ISDIR(inspect(directory,root).st_mode),'package-directory')
        guard()
        names=[]
        iterator=children(directory)
        try:
            while True:
                guard()
                try:item=next(iterator)
                except StopIteration:
                    guard()
                    break
                guard()
                require(len(names)<128,'package-capacity')
                name=item.name
                require(type(name) is str and name in directories[relative] and name not in names,'package-unknown-child')
                names.append(name)
        finally:
            iterator.close()
        require(set(names)==directories[relative],'package-children')
        for name in sorted(names):
            guard()
            child=directory/name
            child_relative=child.relative_to(root).as_posix()
            info = inspect(child, root)
            guard()
            if child_relative in directories:
                require(stat.S_ISDIR(info.st_mode),'package-directory')
                visit(child,depth+1)
            else:
                require(child_relative in files and stat.S_ISREG(info.st_mode) and 0 < info.st_size <= 4194304, 'package-type')
                total += info.st_size
                result.append(PREFIX + child_relative)
                require(len(result) <= 115 and total <= 16777216, 'package-capacity')
            guard()
        guard()
    visit(root, 0)
    require(len(result)==115 and total==13656167 and visited==set(directories),'package-identity')
    guard()
    return sorted(result)

def authenticate(list_pin, context_pin, mode, guard, read=read_fixed, packages=package_files):
    guard()
    literal = read(HERE / 'source-paths.js', 131072)
    require(sha(literal) == hash_value(list_pin), 'source-list-pin')
    names = literal_paths(literal)
    context_path = HERE / ('reviewed-sources.json' if mode == '--prepare' else 'output/prepare/freeze.json')
    context_bytes = read(context_path, 524288)
    require(sha(context_bytes) == hash_value(context_pin), 'context-file-pin')
    context = strict(context_bytes)
    if mode == '--prepare':
        exact(context, SHAPES['sourceMap'])
        require(context['schema'] == 'startup-reviewed-sources/v1', 'source-map')
    else:
        exact(context, SHAPES['freeze'])
        require(context['schema'] == 'startup-prepared-freeze/v1' and context['profiles'] == PROFILES, 'freeze')
        require(digest({k:v for k,v in context.items() if k != 'freezeHash'}) == context['freezeHash'], 'freeze-self-hash')
    require(context['sourcePathsFileSha256'] == list_pin, 'source-list-binding')
    expected = context['sourceHashes']
    require(type(expected) is dict and len(expected) <= 256, 'source-map')
    baseline_bytes = read(REPO / BASELINE_KEY, 65536)
    require(sha(baseline_bytes) == BASELINE_PIN, 'package-baseline-pin')
    # The single historical LF is removed ONLY after authenticating its FILE.
    baseline = strict(baseline_bytes[:-1] if baseline_bytes.endswith(b'\n') else baseline_bytes, 65536)
    require(type(baseline) is dict and type(baseline.get('sourceHashes')) is dict,'package-baseline')
    baseline_package_keys=sorted(key for key in baseline['sourceHashes'] if type(key) is str and key.startswith(PREFIX))
    package_keys = packages(baseline_package_keys,guard)
    require(set(expected) == set(names + package_keys + [BASELINE_KEY]), 'source-keyset')
    buffers = {}
    hashes = {}
    for key in sorted(expected):
        guard()
        hash_value(expected[key])
        data = baseline_bytes if key == BASELINE_KEY else literal if key == OWN+'source-paths.js' else read(
            PACKAGE / key[len(PREFIX):] if key.startswith(PREFIX) else REPO / key)
        require(sha(data) == expected[key], 'source-drift')
        if key.startswith(PREFIX):
            require(expected[key] == baseline['sourceHashes'].get(key), 'package-drift')
        else:
            buffers[key] = data
        hashes[key] = sha(data)
    package_bytes = read(PACKAGE / 'package.json')
    require(sha(package_bytes)==expected[PREFIX+'package.json'],'package-json-reread')
    package = json.loads(package_bytes.decode('utf8'))
    lock = json.loads(buffers[DEV+'package-lock.json'].decode('utf8'))
    require(package.get('name') == 'playwright-core' and package.get('version') == '1.64.1' and
            lock.get('packages',{}).get(PREFIX[:-1],{}).get('integrity') == INTEGRITY, 'package-identity')
    for name, key in HELPERS.items():
        require(hashes[key] == HELPER_PINS[name], 'immutable-helper-pin')
    protocol = json.loads(buffers[OWN+'protocol.json'].decode('utf8'))
    exact(protocol, ['schema','profiles','runtime','limits','shapes','kinds','bootstrapRefusalStages','sourceAcceptance'])
    require(protocol == {'schema':'startup-infrastructure-diagnostic/v1','profiles':PROFILES,'runtime':RUNTIME,'limits':LIMITS,
                         'shapes':SHAPES,'kinds':KINDS,'bootstrapRefusalStages':BOOTSTRAP_STAGES,'sourceAcceptance':'adr203-reviewed-startup/v1'}, 'protocol')
    require(read(HERE / 'source-paths.js',131072) == literal and read(context_path,524288) == context_bytes, 'context-drift')
    guard()
    return hashes, buffers, context_bytes, context

def load_modules(buffers):
    modules = {}
    for name, key in HELPERS.items():
        data = buffers[key]
        require(sha(data) == HELPER_PINS[name], 'helper-pin')
        module = types.ModuleType('_adr198_' + name)
        module.__file__ = str(REPO / key)
        exec(compile(data, module.__file__, 'exec'), module.__dict__)
        modules[name] = module
    return modules

def fixed_paths(hashes, leaf):
    allowed = {key: PACKAGE/key[len(PREFIX):] if key.startswith(PREFIX) else REPO/key for key in hashes}
    allowed['control:source-paths'] = HERE/'source-paths.js'
    allowed['control:freeze'] = HERE/'output/prepare/freeze.json'
    allowed['control:bootstrap'] = leaf/'bootstrap.json'
    allowed['output:root'] = leaf
    names=list(('bootstrap.json','first-fault.json','result.json','supervisor.json','freeze.json'))
    names += ['milestone-'+str(i).zfill(2)+'.'+edge+'.json' for i in range(1,11) for edge in ('prepared','committed')]
    for name in names:
        allowed['output:'+name] = leaf/name
        allowed['output:'+name+'.pending'] = leaf/(name+'.pending')
    for key in list(hashes):
        if key.startswith(PREFIX):
            relative = Path(key)
            for parent in relative.parents:
                name = parent.as_posix()
                if name.startswith(PREFIX.rstrip('/')):
                    allowed[name] = REPO/DEV/name
    return allowed

def validate_fault(value):
    a = exact(value, SHAPES['fault'])
    require(a['schema'] == 'startup-first-fault/v1', 'fault')
    integer(a['profileIndex'],1,1)
    require(type(a['stage']) is str and a['stage'] in STAGES and
            type(a['rpc']) is str and a['rpc'] in STAGES and
            type(a['code']) is str and a['code'] in CODES, 'fault-label')
    if a['witness'] is not None:
        require(type(a['witness']) is dict, 'witness')
        if a['witness'].get('schema') == 'native-browser-launch-witness/v1':
            w = exact(a['witness'], ['schema','spawn','spawnCode','launchCode'])
            codes = ('EACCES','EPERM','ENOENT','EAGAIN','EMFILE','ENFILE','ENOMEM','EINVAL','ENOSYS','UNKNOWN','unclassified')
            require(type(w['spawn']) is str and type(w['spawnCode']) is str and type(w['launchCode']) is str and
                    ((w['spawn'] in ('start-not-observed','start-observed','spawn-return-observed') and w['spawnCode']=='none') or
                     (w['spawn']=='spawn-error-observed' and w['spawnCode'] in codes) or
                     (w['spawn']=='unavailable' and w['spawnCode']=='unavailable')) and
                    w['launchCode'] in codes+('unavailable',) and a['code']=='client-failure' and
                    a['stage']=='context.launch' and a['rpc']=='context.launch', 'witness')
        else:
            w = exact(a['witness'], ['schema','site','role','predicate'])
            require(w['schema'] == 'native-infrastructure-identity-witness/v1' and
                w['site'] in ('created','changed','census','worker') and
                w['role'] in ('anchor','ui-root','ui-aim','worker','other') and
                w['predicate'] in ('terminal','type','url','context','attached','parent','opener',
                  'duplicate-created','duplicate-role','duplicate-id','target-capacity','worker-present') and
                    a['code'] == 'infrastructure-identity', 'witness')
    require(len(wire(a))<=LIMITS['diagnosticBytes'], 'fault-capacity')
    return a

def validate_bindings(value):
    a=exact(value,SHAPES['bindings'])
    integer(a['nodePid'],0xffffffff,1)
    for key in ('sourcePathsFileSha256','freezeFileSha256','freezeHash','sourceMapHash','bootstrapFileSha256','baselineHash'):
        hash_value(a[key])
    require(type(a['creationFiletime']) is str and re.fullmatch('[1-9][0-9]{0,19}',a['creationFiletime']) is not None and
            int(a['creationFiletime'])<(1<<64),'creation-identity')
    return a

def validate_head(value):
    a=exact(value,SHAPES['proofHead'])
    integer(a['sequence'],65536)
    if a['sequence']==0:
        require(a['chainHash'] is None,'empty-head')
    else:
        hash_value(a['chainHash'])
    return a

def validate_census(value, phase):
    keys = ['phase','targets','blankPages','ownExtensionWorkers','otherTargets','ownExtensionEquality',
            'infrastructureTargets','infrastructureEquality','anchorEquality','browserTargets']
    a = exact(value, keys)
    for key in ('targets','blankPages','ownExtensionWorkers','otherTargets','infrastructureTargets','browserTargets'):
        integer(a[key],128)
    require(a['phase'] == phase and a['blankPages'] == 1 and a['ownExtensionWorkers'] == 0 and
            a['otherTargets'] == 0 and a['ownExtensionEquality'] is True and
            a['infrastructureTargets'] == 2 and a['infrastructureEquality'] is True and
            a['anchorEquality'] is True, 'census')
    integer(a['browserTargets'],128)
    require(a['targets'] == 3 + a['browserTargets'], 'census')
    return a

def validate_profile(value, failed):
    a = exact(value, SHAPES['profile'])
    require(a['schema'] == 'startup-profile/v1' and a['status'] == ('failed' if failed else 'healthy'), 'profile-status')
    integer(a['profileIndex'],1,1)
    for key in ('contextCloseAttempts','browserCloseAttempts'):
        integer(a[key],1)
    for key in ('contextClosed','browserClosed','physicalOperationsDrained','callbacksDrained'):
        require(type(a[key]) is bool, 'profile-boolean')
    require(a['contextCloseAttempts'] == int(a['contextClosed']) and a['browserCloseAttempts'] == int(a['browserClosed'])
            and a['physicalOperationsDrained'] and a['callbacksDrained'], 'profile-physical')
    p = exact(a['pending'], ['originals','callbacks','unsafeOriginal','unsafeObligations','coordinator'])
    for key in ('originals','callbacks','unsafeObligations'):
        integer(p[key],4096)
    require(p['originals'] == 0 and p['callbacks'] == 0 and p['unsafeOriginal'] is False and p['unsafeObligations'] == 0, 'profile-originals')
    c = exact(p['coordinator'], ['failure','disposed','events','cleanupIssued','backlog','normalActive','cleanupActive',
                              'denialActive','peakNormal','peakCleanup','peakAggregate','peakDenials','peakBacklog'])
    for key in ('events','cleanupIssued','backlog','normalActive','cleanupActive','denialActive','peakNormal','peakCleanup','peakAggregate','peakDenials','peakBacklog'):
        integer(c[key],4096)
    require(c['backlog'] == 0 and c['normalActive'] == 0 and c['cleanupActive'] == 0 and c['denialActive'] == 0 and
            c['cleanupIssued'] == a['contextCloseAttempts'] + a['browserCloseAttempts'] and
            c['peakNormal'] <= 126 and c['peakCleanup'] <= 2 and c['peakAggregate'] <= 128 and c['peakDenials'] <= 1, 'coordinator')
    require(type(c['disposed']) is bool and c['disposed'] is False and
            c['failure'] in (None,'operation-rejected','event-capacity','normal-capacity','external-fatal','invalid-task'), 'coordinator')
    if failed:
        validate_fault(a['firstFault'])
    else:
        require(a['firstFault'] is None and a['contextClosed'] and a['browserClosed'] and c['failure'] is None, 'healthy')
    if a['preLoadCensus'] is not None:
        validate_census(a['preLoadCensus'],'pre-load')
    if a['finalCensus'] is not None:
        validate_census(a['finalCensus'],'final')
        require(a['preLoadCensus'] is not None, 'census-order')
    if not failed:
        require(a['preLoadCensus'] is not None and a['finalCensus'] is not None, 'census-unreached')
    return a

class ProtocolOwner:
    """One prepared response; logical progress commits only after physical write."""
    def __init__(self, config, prove, baseline, begin, drain, publish, guard, milestone=None):
        self.config,self.prove,self.baseline,self.begin,self.drain,self.publish,self.guard = config,prove,baseline,begin,drain,publish,guard
        self.sequence = 0
        self.chain = None
        self.ready = False
        self.index = 0
        self.active = False
        self.first_fault = None
        self.fault_observed = None
        self.fault_evidence_saved = False
        self.results = []
        self.acks = []
        self.tickets = {}
        self.prepared = None
        self.completed = False
        self.failed_complete = False
        self.bytes = 0
        self.bindings = dict(config['bindings'])
        self.fault_file_sha = None
        self.result_file_sha = None
        self.milestone = milestone
        self.milestones = []

    def head(self):
        return {'sequence':self.sequence,'chainHash':self.chain}

    def prepare(self, raw):
        self.guard()
        require(self.prepared is None and not self.completed and type(raw) is bytes and len(raw)<16384, 'exchange')
        r = exact(strict(raw,16384), SHAPES['request'])
        integer(r['sequence'],65536,1)
        integer(r['nodePid'],0xffffffff,1)
        require(r['schema']=='startup-request/v1' and r['sequence']==self.sequence+1 and
                r['sequence']<=65536 and r['sourceIdentityHash']==self.config['sourceIdentityHash'] and
                r['sourcePathsFileSha256']==self.config['sourcePathsFileSha256'] and
                r['nodePid']==self.config['nodePid'] and r['priorChainHash']==self.chain and
                r['kind'] in KINDS, 'request-linkage')
        kind,p = r['kind'],r['payload']
        mutation = lambda: None
        if kind == 'FS_BEFORE':
            exact(p, SHAPES['fsBefore'])
            require(len(self.tickets)<128, 'ticket-capacity')
            proof = self.prove(p['pathKey'])
            payload = {'ticket':r['sequence'],'proof':proof}
            mutation = lambda:self.tickets.update({r['sequence']:proof})
        elif kind == 'FS_AFTER':
            exact(p, SHAPES['fsAfter'])
            integer(p['ticket'],65536,1)
            old = self.tickets.get(p['ticket'])
            require(old is not None and old['pathKey']==p['pathKey'], 'ticket')
            proof = self.prove(p['pathKey'])
            for key in ('volumeSerial','fileIndex','creationFiletime','fileType'):
                require(proof['identity'][key]==old['identity'][key], 'ticket-identity')
            payload = {'ticket':p['ticket'],'proof':proof}
            mutation = lambda:self.tickets.pop(p['ticket'])
        elif kind == 'READY':
            exact(p, SHAPES['ready'])
            require(not self.ready and p==self.config['ready'] and p['nodeVersion']==RUNTIME['nodeVersion'], 'ready')
            baseline = self.baseline()
            payload = {'schema':'startup-baseline-ack/v1','baseline':baseline}
            def mutation():
                self.ready = True
                self.bindings['baselineHash'] = baseline['baselineHash']
        elif kind == 'STARTUP_FAULT':
            exact(p, SHAPES['faultRequest'])
            require(self.ready and self.first_fault is None, 'fault-order')
            fault = validate_fault(p['firstFault'])
            require(p['firstFaultHash']==digest(fault) and fault['profileIndex']==self.index and
                    self.index>=1 and (self.active or len(self.results)==self.index), 'fault-binding')
            self.fault_observed = fault
            self.fault_file_sha = self.publish('first-fault.json',wire({'schema':'startup-fault-evidence/v1','bindings':self.bindings,'requestSequence':r['sequence'],
                 'requestHash':sha(raw),'firstFaultHash':p['firstFaultHash'],'firstFault':fault}))
            self.fault_evidence_saved = True
            payload = {'schema':'startup-fault-evidence-ack/v1','firstFaultHash':p['firstFaultHash']}
            mutation = lambda:setattr(self,'first_fault',fault)
        elif kind == 'PROFILE_BEGIN':
            exact(p, SHAPES['profileBegin'])
            integer(p['profileIndex'],1,1)
            require(self.ready and self.first_fault is None and not self.active and self.index<1 and
                    p['profileIndex']==self.index+1 and p['previousDrainAckHash']==(self.acks[-1] if self.acks else None), 'profile-order')
            self.begin(p['profileIndex'])
            payload = {'schema':'startup-profile-begin-ack/v1','profileIndex':p['profileIndex']}
            def mutation():
                self.index += 1
                self.active = True
        elif kind in ('PROFILE_DRAIN','FAILED_PROFILE_DRAIN'):
            exact(p, SHAPES['profileDrain'])
            integer(p['profileIndex'],1,1)
            failed = kind=='FAILED_PROFILE_DRAIN'
            result = validate_profile(p['result'],failed)
            validate_head(p['proofHead'])
            require(self.ready and self.active and result['profileIndex']==self.index and p['profileIndex']==self.index and
                    p['resultHash']==digest(result) and p['proofHead']==self.head() and not self.tickets, 'drain-binding')
            require((failed and self.first_fault==result['firstFault']) or (not failed and self.first_fault is None), 'fault-drain')
            self.drain(self.index)
            payload = {'schema':'startup-failed-drain-ack/v1' if failed else 'startup-profile-drain-ack/v1',
                       'profileIndex':self.index,'resultHash':p['resultHash']}
            def mutation():
                self.active = False
                self.results.append(result)
        else:
            exact(p, SHAPES['complete'])
            failed = kind=='FAILED_COMPLETE'
            a = exact(p['result'],SHAPES['result'])
            validate_bindings(a['bindings'])
            validate_head(a['proofHead'])
            require(type(a['profiles']) is list and len(a['profiles'])==1 and
                    type(a['drainAckHashes']) is list and len(a['drainAckHashes'])==len(a['profiles']),'result-lists')
            for item in a['profiles']:
                require(type(item) is dict and item.get('status') in ('healthy','failed'),'profile-status')
                validate_profile(item,item['status']=='failed')
            for item in a['drainAckHashes']:
                hash_value(item)
            require(self.ready and not self.active and not self.tickets and
                    a['schema']=='startup-result/v1' and a['bindings']==self.bindings and a['status']==('failed' if failed else 'healthy') and
                    a['profiles']==self.results and a['drainAckHashes']==self.acks and a['proofHead']==self.head() and
                    p['resultHash']==digest(a), 'complete-binding')
            if failed:
                validate_fault(a['firstFault'])
                require(self.first_fault==a['firstFault'], 'complete-fault')
            else:
                require(self.index==1 and a['firstFault'] is None and self.first_fault is None, 'healthy-complete')
            self.result_file_sha = self.publish('result.json',wire(a))
            payload = {'schema':'startup-exit-ack/v1','status':a['status'],'resultHash':p['resultHash']}
            def mutation():
                self.completed = True
                self.failed_complete = failed
        chain = digest({'previousChainHash':self.chain,'requestHash':sha(raw),'responsePayloadHash':digest(payload)})
        ack = wire({'schema':'startup-ack/v1','sequence':r['sequence'],'kind':kind,'requestHash':sha(raw),
                    'chainHash':chain,'payload':payload})
        require(len(ack)<16384 and self.bytes+len(raw)+len(ack)+2<=64*MIB, 'wire-capacity')
        self.prepared = (ack,raw,r,chain,mutation)
        if kind not in ('FS_BEFORE','FS_AFTER'):
            require(len(self.milestones)<10,'milestone-capacity')
            record={'schema':'startup-control-milestone/v1','index':len(self.milestones)+1,
                    'request':r,'response':strict(ack,16384),'physicalAckWriteSettled':False}
            file_hash=None if self.milestone is None else self.milestone('prepared',record)
            self.milestones.append({'index':record['index'],'kind':kind,'sequence':r['sequence'],
                                    'preparedFileSha256':file_hash,'committedFileSha256':None})
        return ack

    def commit_written(self, ack):
        require(self.prepared is not None and ack==self.prepared[0], 'physical-ack')
        _,raw,r,chain,mutation = self.prepared
        self.guard()
        mutation()
        self.sequence += 1
        self.chain = chain
        self.bytes += len(raw)+len(ack)+2
        if r['kind'] in ('PROFILE_DRAIN','FAILED_PROFILE_DRAIN'):
            self.acks.append(sha(ack))
        if r['kind'] not in ('FS_BEFORE','FS_AFTER'):
            record={'schema':'startup-control-milestone/v1','index':self.milestones[-1]['index'],
                    'request':r,'response':strict(ack,16384),'physicalAckWriteSettled':True}
            file_hash=None if self.milestone is None else self.milestone('committed',record)
            self.milestones[-1]['committedFileSha256']=file_hash
        self.prepared = None

class OwnedParent:
    def __init__(self, mode, list_pin, context_pin, started, clock=time.monotonic):
        self.mode,self.list_pin,self.context_pin,self.started,self.clock = mode,list_pin,context_pin,started,clock
        self.cpu_started = time.process_time()
        self.job = None
        self.child = None
        self.launch_handle = None
        self.original = None
        self.assigned = False
        self.emergency = False
        self.exit_confirmed = False
        self.failure = None
        self.failure_present = False
        self.resource_failure = None
        self.modules = None
        self.frames = None
        self.reader = None
        self.pending_writes = set()
        self.writers = []
        self.service = None
        self.baseline = None
        self.baseline_policy = None
        self.profile_started = None
        self.profile_index = 0
        self.last_cpu = 0
        self.bootstrap_until = started+30
        self.held_until = self.bootstrap_until
        self.work_until = started+360
        self.wall_until = started+420
        self.leaf = HERE/'output'/('prepare' if mode=='--prepare' else 'startup')
        self.leaf_owned = False
        self.peak = {'cpuSeconds':0,'rssBytes':0,'privateBytes':0,'jobMembers':0,'studyBytes':0,'studyEntries':0}
        self.usage_cache = None
        self.usage_at = None

    def fence(self, *, cleanup=False, until=None):
        now = self.clock()
        require(math.isfinite(now) and now>=self.started and now<self.wall_until, 'wall-deadline')
        require(now<self.held_until,'held-deadline')
        if until is not None:
            require(now<until, 'operation-deadline')
        if not cleanup:
            require(not self.failure_present and now<self.work_until, 'work-stopped')
        if self.mode=='--prepare':
            require(time.process_time()-self.cpu_started<=60, 'parent-cpu')

    def enumeration_fence(self, *, cleanup=False, until=None):
        self.fence(cleanup=cleanup,until=until)

    def members(self, job, *, cleanup=False):
        until = min(self.wall_until,self.held_until,self.clock()+2)
        return self.enumerator.query(job,cleanup=cleanup,until=until)

    def ids(self, job, *, cleanup=False):
        value = self.members(job,cleanup=cleanup)
        return list(value.pids[:value.listed])

    def identify(self, handle):
        h = self.modules['native']
        value = h.process_identity(handle)
        return {'pid':value['pid'],'creationFiletime':str(value['creationFiletime']),
                **h.image_identity(value['imagePath']),'imagePathHashEncoding':h.IMAGE_HASH_ENCODING}

    def record_failure(self, error):
        if not self.failure_present:
            self.failure_present = True
            self.failure = error

    def all_usage(self, *, walk=None, inspect_root=None, exists=None):
        g = self.modules['generic']
        walk=g.owned_usage if walk is None else walk
        inspect_root=checked if inspect_root is None else inspect_root
        exists=os.path.lexists if exists is None else exists
        study_bytes = study_entries = evidence = logs = 0
        roots = [HERE.parent/('native-specificity-study-v'+str(i))/'output' for i in range(1,17)] + [HERE.parent/'infrastructure-startup-diagnostic-v1'/'output',HERE.parent/'infrastructure-startup-diagnostic-v2'/'output',HERE/'output']
        def diagnostic_failure(index,error):
            if index>=13 and self.resource_failure is None:
                family,code=g.resource_error(error)
                scope = 'workspace-v'+str(index+1) if index<16 else 'diagnostic-v'+str(index-15)
                self.resource_failure={'scope':scope,'stage':'metadata-walk','family':family,'code':code}
        for i, root in enumerate(roots):
            self.fence(cleanup=True)
            try:
                if i==18 and not self.leaf_owned and not exists(root):
                    inspect_root(HERE)
                    continue
                require(stat.S_ISDIR(inspect_root(root).st_mode),'workspace-root')
            except Exception as error:
                diagnostic_failure(i,error)
                raise
            exclusions = []
            if i<16:
                for phase,count in [('prepare',0),('prepare-r3',0),('train-cal',24),('test',18)]:
                    exclusions.append(str(root/phase/'temp'))
                    for n in range(1,count+1):
                        exclusions += [str(root/phase/'node-owned'/('batch-'+str(n).zfill(2))/name) for name in ('profile','temp')]
            else:
                historical_profiles = ('profile-01','profile-02','profile-03') if i<18 else tuple(PROFILES)
                for phase in ('prepare','startup'):
                    exclusions += [str(root/phase/'temp')] + [str(root/phase/name) for name in historical_profiles]
            try:
                kwargs = {'observer':self.observer,'scope':'workspace-v'+str(i+1)} if i<13 else {'observer':None,'scope':'unclassified'}
                size,count = walk(root,8192*MIB,344064,**kwargs)
                kept,_ = walk(root,32*MIB,344064,exclude_directories=tuple(exclusions),**kwargs)
            except Exception as error:
                diagnostic_failure(i,error)
                raise
            study_bytes += size
            study_entries += count
            evidence += kept
            phases = ('prepare','prepare-r3','train-cal','test') if i<16 else ('prepare','startup')
            for phase in phases:
                path = root/phase/'stderr.log'
                try:
                    info = inspect_root(path)
                except FileNotFoundError:
                    continue
                require(stat.S_ISREG(info.st_mode),'log-type')
                logs += info.st_size
        require(study_bytes<=8192*MIB and study_entries<=344064 and evidence<=32*MIB and logs<=MIB,'aggregate-capacity')
        current = current_entries = 0
        for path in [self.leaf/'temp'] + ([self.leaf/PROFILES[self.profile_index-1]] if self.profile_index else []):
            if exists(path):
                size,count = walk(path,512*MIB,8192,observer=None,scope='unclassified')
                current += size
                current_entries += count
        require(current<=512*MIB and current_entries<=8192,'current-capacity')
        self.peak['studyBytes'] = max(self.peak['studyBytes'],study_bytes)
        self.peak['studyEntries'] = max(self.peak['studyEntries'],study_entries)
        return study_bytes,study_entries,evidence,logs

    def resources(self, cleanup=False):
        self.fence(cleanup=cleanup)
        h,g = self.modules['native'],self.modules['generic']
        status = h.MemoryStatus()
        status.length = ctypes.sizeof(status)
        require(bool(h.kernel.GlobalMemoryStatusEx(ctypes.byref(status))), 'host-memory')
        require(min(status.availablePhysical,status.availablePageFile)>=1024*MIB and
                shutil.disk_usage('C:/').free>=2048*MIB and shutil.disk_usage('D:/').free>=4096*MIB,'headroom')
        if self.job:
            query = lambda job:self.members(job,cleanup=cleanup)
            rss,private,count = g.observed_tree_memory(h,self.job,self.observer,members=query)
            cpu = g.cpu_seconds(h.kernel,self.job,self.observer)
            limits = h.ExtendedLimits()
            require(bool(h.kernel.QueryInformationJobObject(self.job,9,ctypes.byref(limits),ctypes.sizeof(limits),None)),'job-commit')
            require(cpu>=self.last_cpu and cpu<=60 and count<=128 and
                    max(rss,private,int(limits.peakJobMemoryUsed))<=1536*MIB,'job-resource')
            self.last_cpu = cpu
            for key,value in [('cpuSeconds',cpu),('rssBytes',rss),('privateBytes',private),('jobMembers',count)]:
                self.peak[key] = max(self.peak[key],value)
        if self.usage_at is None or self.clock()-self.usage_at>=1:
            self.usage_cache = self.all_usage()
            self.usage_at = self.clock()
        self.fence(cleanup=cleanup)

    def prove(self, key):
        require(key in self.allowed,'proof-key')
        if self.service is not None and self.service.first_fault is not None:
            require(key in ('control:bootstrap','control:freeze','control:source-paths') or key.startswith('output:'),'terminal-proof-key')
        h,g = self.modules['native'],self.modules['generic']
        def info(handle):
            value = g.NativeFileInformation()
            require(bool(h.kernel.GetFileInformationByHandle(handle,ctypes.byref(value))),'native-file-info')
            return {'attributes':int(value.attributes),'identity':g.native_file_identity(value)}
        native = {'attributes':lambda path:int(h.kernel.GetFileAttributesW(str(path))),
                  'open':lambda path:h.kernel.CreateFileW(str(path),0x80,7,None,3,0x02000000|0x00200000,None),
                  'info':info,'close':h.kernel.CloseHandle}
        return g.inspect_fixed_path(key,self.allowed,native,lambda:self.fence(cleanup=True))

    def read_sampled(self,path,maximum=4194304):
        key = next((key for key,value in self.allowed.items() if value==path),None)
        require(key is not None,'fixed-read')
        before = self.prove(key)
        data = read_fixed(path,maximum)
        after = self.prove(key)
        for field in ('volumeSerial','fileIndex','creationFiletime','fileType'):
            require(before['identity'][field]==after['identity'][field],'native-file-drift')
        return data

    def publish_pair(self,name,data):
        require(self.leaf_owned,'unowned-publication')
        fixed=('bootstrap.json','first-fault.json','result.json','supervisor.json','freeze.json')
        milestones=tuple('milestone-'+str(i).zfill(2)+'.'+edge+'.json' for i in range(1,11) for edge in ('prepared','committed'))
        require(name in fixed+milestones,'publication-name')
        require(type(data) is bytes and 0<len(data)<=524288,'publication-capacity')
        self.fence(cleanup=True)
        self.usage_at = None
        self.resources(cleanup=True)
        size,count,evidence,_ = self.usage_cache
        require(size+2*len(data)<=8192*MIB and count+2<=344064 and evidence+2*len(data)<=32*MIB,'publication-reserve')
        target = self.leaf/name
        pending = self.leaf/(name+'.pending')
        caps=self.publication_capabilities()
        require(not caps['exists'](target) and not caps['exists'](pending),'publication-exists')
        caps['checked'](self.leaf)
        root_before=caps['sample']('output:root')
        descriptor = caps['open'](pending)
        try:
            start = caps['fstat'](descriptor)
            native_start=caps['opened'](descriptor)
            require(not native_start['attributes']&0x400 and native_start['identity']['fileType']=='file','publication-opened-type')
            offset = 0
            while offset<len(data):
                self.fence(cleanup=True)
                n = caps['write'](descriptor,data[offset:])
                require(n>0,'publication-write')
                offset += n
            caps['sync'](descriptor)
            final = caps['fstat'](descriptor)
            native_final=caps['opened'](descriptor)
            require((start.st_dev,start.st_ino)==(final.st_dev,final.st_ino) and final.st_size==len(data),'publication-identity')
            for field in ('volumeSerial','fileIndex','creationFiletime','fileType'):
                require(native_start['identity'][field]==native_final['identity'][field],'publication-opened-drift')
            require(native_final['identity']['size']==str(len(data)) and not native_final['attributes']&0x400,'publication-opened-size')
        finally:
            caps['close'](descriptor)
        caps['checked'](pending)
        pending_before=caps['sample']('output:'+name+'.pending')
        require(pending_before['identity']==native_final['identity'],'publication-pending-swap')
        self.fence(cleanup=True)
        caps['link'](pending,target)
        a,b = caps['checked'](pending),caps['checked'](target)
        require(a.st_nlink==2 and b.st_nlink==2 and (a.st_dev,a.st_ino)==(b.st_dev,b.st_ino)==(final.st_dev,final.st_ino),'publication-pair')
        for key in ('output:'+name+'.pending','output:'+name):
            require(caps['sample'](key)['identity']==native_final['identity'],'publication-pair-native')
        root_after=caps['sample']('output:root')
        for field in ('volumeSerial','fileIndex','creationFiletime','fileType'):
            require(root_before['identity'][field]==root_after['identity'][field],'publication-root-drift')
        require(caps['read'](target,524288)==data and caps['read'](pending,524288)==data,'publication-bytes')
        for key in ('output:'+name+'.pending','output:'+name):
            require(caps['sample'](key)['identity']==native_final['identity'],'publication-read-swap')
        root_end=caps['sample']('output:root')
        for field in ('volumeSerial','fileIndex','creationFiletime','fileType'):
            require(root_before['identity'][field]==root_end['identity'][field],'publication-root-drift')
        self.usage_at = None
        self.resources(cleanup=True)
        return sha(data)

    def recheck(self, terminal=False):
        # Rechecks operate through fixed authenticated source paths; normal
        # child proof requests cannot acquire this terminal recheck capability.
        def read(path,maximum=4194304):
            key = next((key for key,value in self.allowed.items() if value==path),None)
            require(key is not None,'parent-fixed-read')
            return self.parent_fixed_read(path,key,maximum)
        hashes,buffers,context_bytes,context = authenticate(self.list_pin,self.context_pin,self.mode,
                   lambda:self.fence(cleanup=terminal),read=read)
        require(hashes==self.hashes and context_bytes==self.context_bytes,'source-recheck')
        self.resources(cleanup=terminal)

    def parent_fixed_read(self,path,key,maximum):
        saved = self.service
        # No global/default monkeypatch: call the same sampler with explicit
        # capabilities and fixed allowlist, without child protocol admission.
        h,g = self.modules['native'],self.modules['generic']
        def info(handle):
            item = g.NativeFileInformation()
            require(bool(h.kernel.GetFileInformationByHandle(handle,ctypes.byref(item))),'file-info')
            return {'attributes':int(item.attributes),'identity':g.native_file_identity(item)}
        native={'attributes':lambda p:int(h.kernel.GetFileAttributesW(str(p))),
                'open':lambda p:h.kernel.CreateFileW(str(p),0x80,7,None,3,0x02200000,None),
                'info':info,'close':h.kernel.CloseHandle}
        before=g.inspect_fixed_path(key,self.allowed,native,lambda:self.fence(cleanup=True))
        data=read_fixed(path,maximum)
        after=g.inspect_fixed_path(key,self.allowed,native,lambda:self.fence(cleanup=True))
        require(before['identity']==after['identity'],'file-identity')
        return data

    def publication_capabilities(self):
        h,g=self.modules['native'],self.modules['generic']
        def info_fd(descriptor):
            import msvcrt
            value=g.NativeFileInformation()
            require(bool(h.kernel.GetFileInformationByHandle(msvcrt.get_osfhandle(descriptor),ctypes.byref(value))),'publication-opened-native')
            return {'attributes':int(value.attributes),'identity':g.native_file_identity(value)}
        def sample(key):
            def info(handle):
                value=g.NativeFileInformation()
                require(bool(h.kernel.GetFileInformationByHandle(handle,ctypes.byref(value))),'publication-native-info')
                return {'attributes':int(value.attributes),'identity':g.native_file_identity(value)}
            native={'attributes':lambda p:int(h.kernel.GetFileAttributesW(str(p))),
                    'open':lambda p:h.kernel.CreateFileW(str(p),0x80,7,None,3,0x02200000,None),
                    'info':info,'close':h.kernel.CloseHandle}
            return g.inspect_fixed_path(key,self.allowed,native,lambda:self.fence(cleanup=True))
        return {'exists':os.path.lexists,'checked':checked,
                'open':lambda p:os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),
                'fstat':os.fstat,'write':os.write,'sync':os.fsync,'close':os.close,
                'link':os.link,'read':read_fixed,'opened':info_fd,'sample':sample}

    def baseline_sample(self, seal=False, cleanup=False):
        self.resources(cleanup=cleanup)
        h,b,c = self.modules['native'],self.modules['baseline'],self.modules['census']
        def accept(row):
            if row['inspectionStatus']=='gone':
                require((self.baseline_policy.console is not None and row['pid']==self.baseline_policy.console['pid']) or
                        (self.exit_confirmed and row['pid']==self.child.pid),'baseline-gone')
                return
            value=b.identity(row)
            if value['pid']==self.baseline_policy.node['pid']:
                require(value==self.baseline_policy.node,'node-identity')
            elif value['imagePathSha256']==b.CONSOLE_HASH:
                if self.baseline_policy.console is None:
                    require(self.baseline is None,'late-console')
                    self.baseline_policy.console=dict(value)
                else:
                    require(value==self.baseline_policy.console,'console-identity')
            else:
                require(False,'unknown-baseline-member')
        result=c.inspect_growing_job(self.job,list_members=lambda job:self.ids(job,cleanup=cleanup),
                open_member=lambda pid:h.kernel.OpenProcess(0x1000,False,pid),belongs=h.process_belongs,
                identity=self.identify,close_member=h.kernel.CloseHandle,validate_row=accept,clock=self.clock)
        self.baseline_policy.observe(result['currentRows'],result['livePids'],node_exit_allowed=self.exit_confirmed)
        if seal:
            self.baseline=self.baseline_policy.seal()
        return self.baseline

    def begin(self,index):
        require(not self.failure_present and self.clock()<self.work_until,'work-stopped')
        self.baseline_sample()
        self.recheck()
        profile=self.leaf/PROFILES[index-1]
        require(not os.path.lexists(profile),'profile-exists')
        profile.mkdir()
        checked(profile)
        self.profile_index=index
        self.profile_started=self.clock()
        self.held_until=min(self.work_until,self.profile_started+45)

    def drain(self,index):
        require(index==self.profile_index and self.profile_started is not None,'drain-order')
        until=min(self.wall_until,self.clock()+15)
        self.held_until=until
        while True:
            self.resources(cleanup=True)
            if set(self.ids(self.job,cleanup=True)).issubset(
                    {self.child.pid}|({self.baseline_policy.console['pid']} if self.baseline_policy.console else set())):
                self.baseline_sample(cleanup=True)
                break
            self.fence(cleanup=True,until=until)
            time.sleep(.01)
        self.recheck(terminal=True)
        self.profile_started=None

    def initialize(self):
        require(os.name=='nt' and re.match('^[Dd]:',str(REPO)) is not None,'windows-d-workspace')
        # Authenticate only immutable fixed helper FILEs first, then establish
        # host/all-root reserves before the complete inventory traversal.
        bootstrap_buffers={}
        for name,key in HELPERS.items():
            self.fence(until=self.bootstrap_until)
            data=read_fixed(REPO/key)
            require(sha(data)==HELPER_PINS[name],'bootstrap-helper-pin')
            bootstrap_buffers[key]=data
        self.modules=load_modules(bootstrap_buffers)
        h,g=self.modules['native'],self.modules['generic']
        h.load_windows()
        g.configure_file_api(h.kernel)
        self.observer=g.ResourceObserver()
        self.resources()
        hashes,buffers,raw,context=authenticate(self.list_pin,self.context_pin,self.mode,
                   lambda:self.fence(until=self.bootstrap_until))
        self.hashes,self.buffers,self.context_bytes,self.context=hashes,buffers,raw,context
        require(all(buffers[key]==value for key,value in bootstrap_buffers.items()),'bootstrap-helper-drift')
        output=HERE/'output'
        if not output.exists():
            output.mkdir()
        checked(output)
        self.leaf.mkdir()
        self.leaf_owned=True
        (self.leaf/'temp').mkdir()
        checked(self.leaf)
        self.allowed=fixed_paths(hashes,self.leaf)
        self.allowed['control:context']=HERE/('reviewed-sources.json' if self.mode=='--prepare' else 'output/prepare/freeze.json')
        self.stats=g.enumeration_stats()
        self.enumerator=g.CompleteJobEnumeration(h,self.enumeration_fence,self.stats)
        self.resources()
        self.recheck()

    def prepare_metadata(self):
        body={'schema':'startup-prepared-freeze/v1','sourcePathsFileSha256':self.list_pin,
              'sourceMapFileSha256':self.context_pin,'sourceHashes':self.hashes,
              'protocolSha256':self.hashes[OWN+'protocol.json'],'profiles':PROFILES}
        value={**body,'freezeHash':digest(body)}
        self.publish_pair('freeze.json',wire(value))
        self.recheck()
        result={'schema':'startup-metadata-preparation/v1','status':'complete','nodeStarted':False,'jobCreated':False,
                'sourcePathsFileSha256':self.list_pin,'sourceMapFileSha256':self.context_pin,
                'freezeFileSha256':sha(wire(value)),'freezeHash':value['freezeHash'],
                'parentCpuMilliseconds':math.ceil((time.process_time()-self.cpu_started)*1000),
                'sourceHashesRechecked':True}
        exact(result,SHAPES['metadataSupervisor'])
        self.publish_pair('supervisor.json',wire(result))
        self.fence()
        return 0

    def assign_owned_original(self,k,g,selected):
        # The retained Popen handle is authority; a PID lookup is not. Reject
        # reuse before the generic helper can assign its inspection handle.
        launched=self.identify(self.launch_handle)
        require(launched['pid']==self.child.pid and launched['imagePathSha256']==selected['imagePathSha256'],
                'launch-original')
        def retain(handle,assigned):
            self.original=handle
            if assigned:
                self.assigned=True
            else:
                self.assigned=False
                inspected=self.identify(handle)
                require(inspected==launched,'inspection-original')
                self.fence(until=self.bootstrap_until)
        g.guarded_assignment(k,self.job,self.child,retain)
        return launched

    def start_node(self):
        h,g=self.modules['native'],self.modules['generic']
        self.fence(until=self.bootstrap_until)
        k=h.kernel
        self.job=k.CreateJobObjectW(None,None)
        require(bool(self.job),'job-create')
        limits=h.ExtendedLimits()
        limits.basic.limitFlags=0x2208
        limits.basic.activeProcessLimit=128
        limits.jobMemoryLimit=1536*MIB
        require(bool(k.SetInformationJobObject(self.job,9,ctypes.byref(limits),ctypes.sizeof(limits))),'job-limits')
        readback=h.ExtendedLimits()
        require(bool(k.QueryInformationJobObject(self.job,9,ctypes.byref(readback),ctypes.sizeof(readback),None)) and
                int(readback.basic.limitFlags)==0x2208 and int(readback.basic.activeProcessLimit)==128 and
                int(readback.jobMemoryLimit)==1536*MIB,'job-readback')
        node,selected=h.selected_node_path()
        require(str(node).replace('\\','/').lower()=='c:/program files/nodejs/node.exe','fixed-node')
        self.stderr=(self.leaf/'stderr.log').open('xb')
        env={key:value for key,value in os.environ.items() if key.upper() in {'SYSTEMROOT','WINDIR','PATH','PATHEXT'}}
        env.update(TEMP=str(self.leaf/'temp'),TMP=str(self.leaf/'temp'),OMP_NUM_THREADS='1',UV_THREADPOOL_SIZE='1',
          MURMINGLE_STARTUP_SUPERVISED='1',MURMINGLE_STARTUP_SOURCE_IDENTITY=self.context_pin,
          MURMINGLE_STARTUP_SOURCE_PATHS=self.list_pin,
          MURMINGLE_STARTUP_WALL_MILLISECONDS=str(max(1,math.floor((self.wall_until-self.clock())*1000))))
        self.resources()
        self.fence(until=self.bootstrap_until)
        self.child=subprocess.Popen([str(node),'--max-old-space-size=256',str(HERE/'run.mjs'),'--owned-startup'],
                     cwd=REPO,env=env,shell=False,creationflags=0x8,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.stderr)
        # Popen owns this handle from the instant creation succeeded; it is
        # retained before any inspection API/deadline can fail.
        self.launch_handle=self.child._handle
        launched=self.assign_owned_original(k,g,selected)
        self.fence(until=self.bootstrap_until)
        actual=self.identify(self.original)
        require(actual==launched and actual['pid']==self.child.pid and actual['imagePathSha256']==selected['imagePathSha256'] and
                h.process_belongs(self.original,self.job),'original-node')
        initial={**actual,'confirmedOwnJob':True,'inspectionStatus':'confirmed'}
        self.baseline_policy=self.modules['baseline'].ExactConsoleBaseline(initial)
        self.baseline_sample()
        bootstrap={'schema':'startup-bootstrap/v1','sourceIdentityHash':self.context_pin,
          'sourcePathsFileSha256':self.list_pin,'sourceMapHash':digest(self.hashes),'nodePid':self.child.pid,
          'creationFiletime':actual['creationFiletime'],'deadlineMilliseconds':integer(int(env['MURMINGLE_STARTUP_WALL_MILLISECONDS']),420000,1)}
        data=wire(bootstrap)
        self.publish_pair('bootstrap.json',data)
        config={'sourceIdentityHash':self.context_pin,'sourcePathsFileSha256':self.list_pin,'nodePid':self.child.pid,
                'ready':{'bootstrapHash':sha(data),'creationFiletime':actual['creationFiletime'],'nodeVersion':RUNTIME['nodeVersion']},
                'bindings':{'sourcePathsFileSha256':self.list_pin,'freezeFileSha256':self.context_pin,
                 'freezeHash':self.context['freezeHash'],'sourceMapHash':digest(self.hashes),'nodePid':self.child.pid,
                 'creationFiletime':actual['creationFiletime'],'bootstrapFileSha256':sha(data),'baselineHash':None}}
        self.service=ProtocolOwner(config,self.prove,lambda:self.baseline_sample(seal=True),
              self.begin,self.drain,self.publish_pair,lambda:self.fence(cleanup=True),
              milestone=lambda edge,record:self.publish_pair('milestone-'+str(record['index']).zfill(2)+'.'+edge+'.json',wire(record)))
        self.frames=g.ProofFrames()
        self.reader=self.frames.start(self.child.stdout)
        self.write_original(HANDSHAKE,min(self.bootstrap_until,self.clock()+15))
        self.ready_until=min(self.bootstrap_until,self.clock()+15)
        self.held_until=self.ready_until

    def write_original(self,data,until):
        def write():
            require(self.child.stdin.write(data)==len(data),'pipe-write-count')
            self.child.stdin.flush()
        self.modules['generic'].tracked_pipe_write(write,self.pending_writes,lambda:self.fence(cleanup=True,until=until),
            until,self.writers.append,clock=self.clock)

    def run_node(self):
        self.start_node()
        while not self.service.completed:
            self.fence(cleanup=True)
            self.resources(cleanup=True)
            require(self.child.poll() is None,'unexpected-node-exit')
            if not self.service.ready:
                self.fence(until=self.ready_until)
            elif self.service.first_fault is None:
                self.fence()
                if self.profile_started is not None:
                    self.fence(until=self.profile_started+45)
            raw=self.frames.next()
            if raw is None:
                time.sleep(.002)
                continue
            ack=self.service.prepare(raw)
            until=min(self.wall_until,self.clock()+15)
            self.write_original(ack+b'\n',until)
            self.service.commit_written(ack)
            if strict(ack,16384)['kind']=='READY':
                self.held_until=self.bootstrap_until
        # Child may exit only after actual completion ACK settlement.
        until=min(self.wall_until,self.clock()+15)
        while self.child.poll() is None:
            self.fence(cleanup=True,until=until)
            self.resources(cleanup=True)
            require(self.frames.next() is None,'extra-frame')
            time.sleep(.01)
        self.exit_confirmed=True
        require(self.child.returncode==0,'node-exit')
        self.reader.join(max(0,until-self.clock()))
        require(not self.reader.is_alive() and self.frames.finished and not self.frames.buffer and
                self.frames.next() is None and self.frames.failure is None,'pipe-eof')
        for writer in self.writers:
            writer.join(max(0,until-self.clock()))
            require(not writer.is_alive(),'writer-join')
        require(not self.pending_writes,'physical-write')
        while self.ids(self.job,cleanup=True):
            self.fence(cleanup=True,until=until)
            time.sleep(.01)
        self.recheck(terminal=True)
        require(read_fixed(self.leaf/'result.json')==read_fixed(self.leaf/'result.json.pending'),'result-pair')
        return not self.service.failed_complete

    def close_owned(self,normal):
        clean=True
        # Work/READY/profile leases stay poisoned. This is the independently
        # fixed outer420s physical cleanup fence, not another work lease.
        self.held_until=self.wall_until
        h=self.modules['native'] if self.modules else None
        descendants=False
        if self.job:
            try:
                descendants=bool(self.ids(self.job,cleanup=True))
            except Exception:
                descendants=True  # Unknown Job membership is never empty proof.
        if self.child is not None:
            if self.child.poll() is None or descendants:
                self.emergency=True
                if self.assigned and self.job:
                    require(bool(h.kernel.TerminateJobObject(self.job,1)),'terminate-owned-job')
                elif self.child.poll() is None:
                    # Exactly the Popen-owned handle, never PID lookup.
                    k=h.kernel
                    k.TerminateProcess.argtypes=[ctypes.c_void_p,ctypes.c_uint]
                    require(bool(k.TerminateProcess(self.launch_handle,1)),'terminate-original')
            until=self.wall_until
            while self.child.poll() is None:
                self.fence(cleanup=True,until=until)
                time.sleep(.01)
            self.exit_confirmed=True
            if self.reader is not None:
                self.reader.join(max(0,self.wall_until-self.clock()))
                clean=clean and not self.reader.is_alive()
            for writer in self.writers:
                writer.join(max(0,self.wall_until-self.clock()))
                clean=clean and not writer.is_alive()
            clean=clean and not self.pending_writes
            # Do not acquire a buffered stream lock while its original reader
            # or writer thread still owns it. An uncertain physical thread is
            # retained and reported; it is never declared closed by a wrapper.
            if clean:
                for stream in (self.child.stdin,self.child.stdout):
                    if stream is not None:
                        self.fence(cleanup=True)
                        stream.close()
        if self.job:
            while self.ids(self.job,cleanup=True):
                self.fence(cleanup=True)
                time.sleep(.01)
        if self.original:
            clean=bool(h.kernel.CloseHandle(self.original)) and clean
            self.original=None
        if self.job:
            clean=bool(h.kernel.CloseHandle(self.job)) and clean
            self.job=None
        if self.launch_handle is not None:
            self.launch_handle.Close()
            self.launch_handle=None
        if hasattr(self,'stderr'):
            self.stderr.close()
        return clean

    def execute(self):
        successful=False
        normal=False
        clean=False
        try:
            self.initialize()
            if self.mode=='--prepare':
                return self.prepare_metadata()
            successful=self.run_node()
            normal=True
        except Exception as error:
            self.record_failure(error)
        finally:
            if self.mode=='--run-startup':
                try:
                    clean=self.close_owned(normal)
                except Exception as error:
                    self.record_failure(error)
        if self.mode=='--prepare':
            # A failed metadata attempt never fabricates process ownership.
            if self.leaf_owned and self.modules:
                result={'schema':'startup-metadata-preparation/v1','status':'failed','nodeStarted':False,
                        'jobCreated':False,'sourceHashesRechecked':False}
                exact(result,SHAPES['metadataFailure'])
                if not os.path.lexists(self.leaf/'supervisor.json'):
                    self.publish_pair('supervisor.json',wire(result))
            return 1
        passed=successful and normal and clean and not self.emergency and not self.failure_present
        result={'schema':'startup-supervisor/v1','status':'complete' if passed else 'failed',
          'sourcePathsFileSha256':self.list_pin,'freezeFileSha256':self.context_pin,
          'bindings':None if self.service is None else self.service.bindings,
          'baseline':self.baseline,'resultFileSha256':None if self.service is None else self.service.result_file_sha,
          'firstFaultFileSha256':None if self.service is None else self.service.fault_file_sha,
          'committedControlHead':None if self.service is None else self.service.head(),
          'committedControlBytes':None if self.service is None else self.service.bytes,
          'milestones':[] if self.service is None else self.service.milestones,
          'proofScope':'sampled-native-path-identities-compact-chain-not-raw-replay/v1',
          'nodeStarted':self.child is not None,'nodeAssigned':self.assigned,'normalExit':normal,
          'exitCode':None if self.child is None else self.child.returncode,
          'firstFaultSaved':self.service is not None and self.service.fault_evidence_saved,
          'firstFault':None if self.service is None else self.service.fault_observed,
          'protocolComplete':self.service is not None and self.service.completed,
          'emergencyOwnJobTermination':self.emergency,'ownCleanupPassed':clean,
          'endchecksPassed':passed,'peak':self.peak,'enumeration':getattr(self,'stats',None),
          'collectorFailure':self.resource_failure,'authority':False,'productionValidated':False}
        exact(result,SHAPES['supervisor'])
        if self.leaf_owned and self.modules:
            self.publish_pair('supervisor.json',wire(result))
        return 0 if passed else 1

def main(argv=None):
    args=sys.argv[1:] if argv is None else argv
    config=parse_cli(args)
    if config is None:
        return 0
    require(ACTUAL_RELEASE=='adr203-reviewed-startup/v1','entry-closed')
    mode,list_pin,context_pin=config
    started=time.monotonic()
    return OwnedParent(mode,list_pin,context_pin,started).execute()

if __name__=='__main__':
    try:
        code=main()
    except Exception:
        sys.stderr.write('{"schema":"startup-refusal/v1","code":"refused"}\n')
        code=1
    sys.exit(code)


