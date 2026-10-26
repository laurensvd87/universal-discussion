"""ADR174 own-Job guardian. Default inert; no preparation or automatic retry.

The child is handshake-blocked, NOT created suspended. Node bootstrap before
assignment is outside the Job guarantee; no native imports/actions may precede
the exact handshake. Root supplies a reviewed FILE hash of the fixed ledger.
"""
import ctypes
from ctypes import wintypes
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
import time

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
OWN = 'apps/local-service/portable/integration/scoped-native-isolated-v2/'
DRIVER = 'apps/local-service/data/adr174-scoped-native-check-20261020.mjs'
ADR = 'decisions/ADR-174-owned-postgresql-address-proof.md'
OUTPUT = HERE / 'output'
RUN_PARENT = REPO / 'apps/local-service/portable/data/scoped-native-isolated-v2'
MIB = 1048576
MEMORY_LIMIT, CPU_SECONDS, ACTIVE_SECONDS, WALL_SECONDS = 1536*MIB, 60, 360, 420
FIXED_NODE='C:/Program Files/nodejs/node.exe'
FIXED_PYTHON='C:/Users/Laurens/AppData/Local/Programs/Python/Python312/python.exe'
SETTINGS = {'schema':'adr174-owned-native-limits/v1','port':55433,'startupSeconds':120,
 'sqlSeconds':195,'stopSeconds':20,'reportSeconds':25,'wallSeconds':420,
 'activeSeconds':360,'memoryMiB':1536,'cpuSeconds':60,'ownedBytes':536870912,
 'ownedEntries':8192,'reportBytes':262144,'nodeHeapMiB':256}
BINARY_PINS = {
 'D:/PostgreSQL/17/bin/postgres.exe':'f5dbfd059f8088b9511a02fc014e659369996fc7d3e88e47658b1cfa2fbb02d2',
 'D:/PostgreSQL/17/bin/initdb.exe':'d385519a50d2cd5e143e86c2c10acfe0d44d3039d714c8211b804011bca2409f',
 'D:/PostgreSQL/17/bin/pg_ctl.exe':'9885ac53af9d67c76c1ddde87c19e6b15539d7c482bca70cd5ead5dad0b7ce3c',
 'D:/PostgreSQL/17/lib/vector.dll':'459a1abcabd69c8092c3a7de998a18e2714b6676a7ba4f3bdd111fc610a440a0',
 'D:/PostgreSQL/17/share/extension/vector.control':'52c583fb0c22c616b21762c7b9d3079c02655b78b96d5689cd1e64449b9a575e',
 'D:/PostgreSQL/17/share/extension/vector--0.8.2.sql':'1e4d2de57f0a16c5c2b259d77655aecf9c740713beae4ac4b511549fceb6aafb',
 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe':'8bb6fa8c283b4d92120b1ef249a9b311b0f804d4cabbe9981159976c8be76a5e',
 'C:/Program Files/nodejs/node.exe':'3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237',
 'C:/Users/Laurens/AppData/Local/Programs/Python/Python312/python.exe':'4d6f5f81a4bca11191c4c7c6b43632694d0a4ce74e068619d8fdc161d469859a'}
CASE_NAMES = ['fresh-identity-source-role-audit','legacy-apply-held-admission-update-reply',
 'scoped-held-growth-enqueue','last-watermark-contention','native-slot-snapshot-race',
 'update-before-root-reply','root-reply-before-update','root-replay-before-topic-delete',
 'topic-delete-before-root-replay','completion-before-forget','forget-before-completion',
 'completion-before-account-withdraw','account-withdraw-before-completion','completion-before-revoke',
 'revoke-before-completion','clear-before-enqueue','enqueue-before-clear','clear-before-post',
 'post-before-clear','clear-before-update','update-before-clear','legacy-implicit-lifecycle-negative',
 'literal-COMMIT-simple','literal-COMMIT-semicolon','literal-COMMIT-extended','unsupported-lowercase',
 'unsupported-END','unsupported-WORK','unsupported-CHAIN','unsupported-comment','unsupported-multistatement',
 'unsupported-PREPARE','implicit-simple','implicit-extended','constraints-before','constraints-during',
 'constraints-after','savepoint-late-commit','nested-literal-red-depth-green','authority-expired-after-mutation',
 'lease-expired-after-mutation','stale-epoch-after-reclaim','lost-response-reconciliation','ABC-replay-no-rewind',
 'changed-actor-proof-conflict','final-wires-tuples-retirement']
REQUIRED_SOURCES = [OWN+x for x in ['supervise.py','supervise.test.py','cluster.js','cluster.test.js','README.md']] + [
 DRIVER,ADR,'apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-native-v2/check.js',
 'apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-native-v1/run-control.js']

def require(value, code='metadata-contract'):
    if not value:raise RuntimeError(code)

def sha(value):return hashlib.sha256(value).hexdigest()
def wire(value):return json.dumps(value,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode('utf8')
def exact(value, names):
    require(type(value) is dict and list(value)==names)
    return value
def strict(value):
    def pairs(items):
        result={}
        for key,item in items:
            require(key not in result,'duplicate-json-key');result[key]=item
        return result
    def invalid(_):raise RuntimeError('nonfinite-json')
    return json.loads(value.decode('utf8'),object_pairs_hook=pairs,parse_constant=invalid)
def hash_value(value):return type(value) is str and re.fullmatch('[a-f0-9]{64}',value) is not None
def integer(value, maximum):return type(value) is int and 0<=value<=maximum
def finite(value):return type(value) in (int,float) and math.isfinite(value) and value>=0
def parse_args(args):
    if not args:return None
    require(len(args)==3 and args[:2]==['--run-isolated-server','--source-ledger-sha256'] and hash_value(args[2]),'fixed-cli')
    return args[2]

def source_name(name):
    require(type(name) is str and re.fullmatch('[A-Za-z0-9._/-]{1,256}',name) is not None,'source-path')
    parts=name.split('/');require(all(p not in ('','.','..') for p in parts),'source-path')
    if name in (DRIVER,'apps/local-service/package.json'):return name
    require(name.startswith(('apps/local-service/portable/','apps/local-service/src/',
       'spikes/topic-resolution/browser/','decisions/')),'source-scope')
    require(not any(p.lower() in ('data','output','outputs','artifacts','profiles','cache','captures','models') for p in parts),'source-private-path')
    require(Path(name).suffix in ('.js','.mjs','.py','.sql','.md','.json'),'source-extension')
    if name.endswith('.json'):require(parts[-1] in ('package.json','package-lock.json','protocol.json','manifest.json'),'source-json')
    return name

def checked(path):
    for p in [path]+list(path.parents):
        s=p.lstat()
        require(not p.is_symlink() and not getattr(s,'st_file_attributes',0)&0x400,'reparse-path')
    require(str(path.resolve()).lower()==str(path.absolute()).lower(),'resolved-path')

def fixed_bytes(path, maximum=16*MIB):
    checked(path);before=path.lstat()
    require(stat.S_ISREG(before.st_mode) and 0<before.st_size<=maximum,'fixed-file-bound')
    value=path.read_bytes();after=path.lstat()
    require(len(value)==before.st_size and (after.st_size,after.st_mtime_ns,after.st_ctime_ns)==
      (before.st_size,before.st_mtime_ns,before.st_ctime_ns),'fixed-file-drift')
    return value

def source_snapshot(ledger_pin, read=fixed_bytes):
    # Authentication precedes parsing AND every path supplied by the ledger.
    require(hash_value(ledger_pin),'ledger-pin')
    ledger_bytes=read(HERE/'source-ledger.json',262144)
    require(sha(ledger_bytes)==ledger_pin,'ledger-pin')
    ledger=exact(strict(ledger_bytes),['schema','sourceHashes'])
    require(ledger['schema']=='adr174-owned-native-source-ledger/v1','ledger-schema')
    sources=ledger['sourceHashes'];require(type(sources) is dict and 1<=len(sources)<=2048,'source-count')
    require(list(sources)==sorted(sources) and all(k in sources for k in REQUIRED_SOURCES),'source-set')
    # Validate the WHOLE list before following even its first source name.
    for name,pin in sources.items():source_name(name);require(hash_value(pin),'source-hash')
    total=0
    for name,pin in sources.items():
        value=read(REPO/name);total+=len(value);require(total<=64*MIB,'source-total');require(sha(value)==pin,'source-drift')
    binaries={name:sha(read(Path(name),128*MIB)) for name in BINARY_PINS}
    require(binaries==BINARY_PINS,'binary-drift')
    freeze_bytes=read(HERE/'freeze.json',262144);f=exact(strict(freeze_bytes),
      ['schema','sourceLedgerSha256','sourceHashes','binaryHashes','settings','freezeHash'])
    require(f['schema']=='adr174-owned-native-freeze/v1' and f['sourceLedgerSha256']==ledger_pin and
      f['sourceHashes']==sources and list(f['sourceHashes'])==list(sources) and
      f['binaryHashes']==BINARY_PINS and f['settings']==SETTINGS,'freeze-contract')
    require(f['freezeHash']==sha(wire({key:value for key,value in f.items() if key!='freezeHash'})),'freeze-hash')
    require(read(HERE/'source-ledger.json',262144)==ledger_bytes,'ledger-end-drift')
    return {'sourceHashes':sources,'binaryHashes':binaries,'freeze':f,'freezeBytes':freeze_bytes,
      'freezeSha256':sha(freeze_bytes),'ledgerSha256':ledger_pin}

def same_snapshot(old,new):
    require(old==new,'source-or-binary-final-drift')

class MemoryStatus(ctypes.Structure):
    _fields_=[('length',wintypes.DWORD),('load',wintypes.DWORD)]+[(k,ctypes.c_ulonglong) for k in
     ('totalPhysical','availablePhysical','totalPageFile','availablePageFile','totalVirtual','availableVirtual','availableExtended')]
class ProcessMemory(ctypes.Structure):
    _fields_=[('cb',wintypes.DWORD),('faults',wintypes.DWORD)]+[(k,ctypes.c_size_t) for k in
     ('peakWorkingSet','workingSet','peakPagedPool','pagedPool','peakNonPagedPool','nonPagedPool','pagefile','peakPagefile','privateUsage')]
class BasicLimits(ctypes.Structure):
    _fields_=[('perProcessUserTime',ctypes.c_longlong),('perJobUserTime',ctypes.c_longlong),('limitFlags',wintypes.DWORD),
     ('minimumWorkingSet',ctypes.c_size_t),('maximumWorkingSet',ctypes.c_size_t),('activeProcessLimit',wintypes.DWORD),
     ('affinity',ctypes.c_size_t),('priorityClass',wintypes.DWORD),('schedulingClass',wintypes.DWORD)]
class IoCounters(ctypes.Structure):
    _fields_=[(k,ctypes.c_ulonglong) for k in ('readOperations','writeOperations','otherOperations','readBytes','writeBytes','otherBytes')]
class ExtendedLimits(ctypes.Structure):
    _fields_=[('basic',BasicLimits),('io',IoCounters),('processMemoryLimit',ctypes.c_size_t),('jobMemoryLimit',ctypes.c_size_t),
     ('peakProcessMemoryUsed',ctypes.c_size_t),('peakJobMemoryUsed',ctypes.c_size_t)]
class JobPids(ctypes.Structure):
    _fields_=[('assigned',wintypes.DWORD),('listed',wintypes.DWORD),('pids',ctypes.c_size_t*128)]
class BasicAccounting(ctypes.Structure):
    _fields_=[(k,ctypes.c_longlong) for k in ('totalUserTime','totalKernelTime','periodUserTime','periodKernelTime')]+[
     (k,wintypes.DWORD) for k in ('totalPageFaultCount','totalProcesses','activeProcesses','totalTerminatedProcesses')]

def load_windows():
    k=ctypes.WinDLL('kernel32',use_last_error=True);p=ctypes.WinDLL('psapi',use_last_error=True)
    k.CreateJobObjectW.argtypes=[ctypes.c_void_p,wintypes.LPCWSTR];k.CreateJobObjectW.restype=wintypes.HANDLE
    for name,args in {
      'SetInformationJobObject':[wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD],
      'QueryInformationJobObject':[wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD,ctypes.c_void_p],
      'AssignProcessToJobObject':[wintypes.HANDLE,wintypes.HANDLE],
      'IsProcessInJob':[wintypes.HANDLE,wintypes.HANDLE,ctypes.POINTER(wintypes.BOOL)],
      'TerminateJobObject':[wintypes.HANDLE,wintypes.UINT],
      'OpenProcess':[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD],
      'CloseHandle':[wintypes.HANDLE],
      'GlobalMemoryStatusEx':[ctypes.POINTER(MemoryStatus)]}.items():getattr(k,name).argtypes=args
    k.OpenProcess.restype=wintypes.HANDLE
    p.GetProcessMemoryInfo.argtypes=[wintypes.HANDLE,ctypes.POINTER(ProcessMemory),wintypes.DWORD]
    return k,p

def headroom(k):
    memory=MemoryStatus();memory.length=ctypes.sizeof(memory)
    require(k.GlobalMemoryStatusEx(ctypes.byref(memory)) and min(memory.availablePhysical,memory.availablePageFile)>=1024*MIB,'host-reserve')
    require(shutil.disk_usage('C:\\').free>=768*MIB and shutil.disk_usage('D:\\').free>=512*MIB,'drive-reserve')

def members(k,job):
    p=JobPids();require(k.QueryInformationJobObject(job,3,ctypes.byref(p),ctypes.sizeof(p),None)
      and p.assigned==p.listed and p.listed<=128,'own-job-members-unverifiable')
    return list(p.pids[:p.listed])
def cpu_seconds(user,kernel):
    require(type(user) is int and type(kernel) is int and min(user,kernel)>=0,'own-job-cpu-invalid')
    return (user+kernel)/10000000
def accounting(k,job):
    a=BasicAccounting();require(k.QueryInformationJobObject(job,1,ctypes.byref(a),ctypes.sizeof(a),None),'own-job-cpu-unverifiable')
    return cpu_seconds(a.totalUserTime,a.totalKernelTime),a.totalProcesses,a.totalTerminatedProcesses

def tree_memory(k,p,job):
    ids=members(k,job);rss=private=0
    for pid in ids:
        handle=k.OpenProcess(0x1000|0x0010,False,pid)
        if not handle:
            require(pid not in members(k,job),'own-job-live-member-unverifiable');continue
        try:
            belongs=wintypes.BOOL()
            if not k.IsProcessInJob(handle,job,ctypes.byref(belongs)) or not belongs.value:
                require(pid not in members(k,job),'own-job-live-membership-unverifiable');continue
            m=ProcessMemory();m.cb=ctypes.sizeof(m)
            if not p.GetProcessMemoryInfo(handle,ctypes.byref(m),ctypes.sizeof(m)):
                require(pid not in members(k,job),'own-job-live-memory-unverifiable');continue
            rss+=m.workingSet;private+=m.privateUsage
        finally:require(k.CloseHandle(handle),'own-memory-handle-close-failed')
    return rss,private,len(ids)

def active_deadline(started,now):require(finite(now) and 0<=now-started<ACTIVE_SECONDS,'active-deadline')
def startup_deadline(started,now):require(finite(now) and 0<=now-started<120,'startup-deadline')
def before_startup(started,action,clock=time.monotonic):
    startup_deadline(started,clock());value=action();startup_deadline(started,clock());return value
def fixed_runtime_paths(node,python,resolve_path=lambda value:str(Path(value).resolve())):
    require(type(node) is str and type(python) is str,'fixed-runtime-path')
    require(resolve_path(node).replace('\\','/').lower()==FIXED_NODE.lower() and
      resolve_path(python).replace('\\','/').lower()==FIXED_PYTHON.lower(),'fixed-runtime-path')
    return str(Path(FIXED_NODE))
def observe_sql_phase(state,started,read,clock=time.monotonic):
    # First observation, never a restarted epoch. Metadata reads may cross a
    # deadline, so the post-read clock is authoritative for acceptance.
    active_deadline(started,clock());value=read();now=clock();active_deadline(started,now)
    if state['firstObserved'] is None:startup_deadline(started,now)
    if value is None:
        require(state['firstObserved'] is None,'sql-marker-disappeared');return
    exact(strict(value),['schema']);require(strict(value)['schema']=='adr174-sql-phase-started/v1','sql-marker-schema')
    if state['firstObserved'] is None:state.update(firstObserved=now,sha256=sha(value))
    else:require(state['sha256']==sha(value),'sql-marker-drift')
    require(now-state['firstObserved']<195+20+25,'post-startup-deadline')

def read_sql_marker(read=fixed_bytes):
    try:value=read(OUTPUT/'sql-started.json',1024)
    except FileNotFoundError:return None
    require(read(OUTPUT/'sql-started.pending',1024)==value and
      read(OUTPUT/'sql-started.json',1024)==value,'sql-marker-publication-drift')
    return value

def before_active(started,action,clock=time.monotonic):
    active_deadline(started,clock());value=action();active_deadline(started,clock());return value
def assign_then_release(child,open_handle,assign,release,check):
    # Retain exact child, attempt Job assignment before any post-Popen rejection.
    handle=open_handle(child.pid);require(bool(handle),'own-node-handle-failed')
    try:
        require(assign(handle),'own-node-job-assignment-failed');check();release()
    except BaseException as error:
        error.owned_handle=handle
        # Assignment completion is separately tracked by the trusted callback.
        raise
    return handle

def assign_verified(k,job,owned,latch_assigned):
    ok=k.AssignProcessToJobObject(job,owned)
    if ok:
        # Keep containment latched even if the subsequent membership proof fails.
        latch_assigned();belongs=wintypes.BOOL()
        require(k.IsProcessInJob(owned,job,ctypes.byref(belongs)) and belongs.value,'own-node-membership-unverified')
    return ok

def new_run_directory(baseline,read=fixed_bytes,*,exists=lambda path:path.exists(),
      list_directory=lambda path:path.iterdir(),verify=checked,is_directory=lambda path:path.is_dir(),expected=None):
    if not exists(RUN_PARENT):require(expected is None,'owned-run-directory-disappeared');return None
    verify(RUN_PARENT);require(is_directory(RUN_PARENT),'run-parent-type')
    additions=[p for p in list_directory(RUN_PARENT) if p.name not in baseline]
    require(len(additions)<=1 and all(re.fullmatch('adr174-[A-Za-z0-9]+',p.name) for p in additions),'unexpected-new-native-directory')
    if not additions:require(expected is None,'owned-run-directory-disappeared');return None
    directory=additions[0];require(expected is None or directory==expected,'owned-run-directory-replaced')
    verify(directory);require(is_directory(directory),'new-native-directory-type')
    marker=directory/'ownership.json'
    if exists(marker):
        value=read(marker,4096)
        require(read(directory/'ownership.pending',4096)==value and read(marker,4096)==value,'ownership-publication-drift')
        v=exact(strict(value),['schema','nonce','runDirectory'])
        require(v['schema']=='adr174-owned-postgres/v1' and type(v['nonce']) is str and re.fullmatch('[a-f0-9]{48}',v['nonce']) and
         type(v['runDirectory']) is str and v['runDirectory'].lower()==str(directory).lower(),'new-native-marker-invalid')
    return directory

def reserve_report(total,count,report_bytes):
    require(integer(report_bytes,262144) and total+report_bytes<=512*MIB and count+1<=8192,'receipt-capacity')
def evidence_bounds():
    logs=0
    for name in ('stdout.log','stderr.log'):
        file=OUTPUT/name
        if file.exists():logs+=file.stat().st_size
    require(logs<=65536,'owned-log-capacity')
    for name in ('result.json','supervisor.json'):
        file=OUTPUT/name
        if file.exists():require(file.stat().st_size<=262144,'owned-report-capacity')
def disk_usage(roots,*,verify=checked,list_directory=lambda path:path.iterdir(),metadata=lambda path:path.lstat(),check_evidence=evidence_bounds):
    total=count=0;pending=[(p,True) for p in roots if p is not None]
    while pending:
        root,required=pending.pop()
        try:
            verify(root);root_stat=metadata(root)
            require(not stat.S_ISLNK(root_stat.st_mode) and not getattr(root_stat,'st_file_attributes',0)&0x400,'owned-tree-reparse')
            require(stat.S_ISDIR(root_stat.st_mode),'owned-directory-type')
            for entry in list_directory(root):
                # Charge each discovered directory entry even if DROP removes it
                # before inspection; only absence, never another error, is benign.
                count+=1;require(count<=8192,'owned-entry-capacity')
                try:s=metadata(entry)
                except FileNotFoundError:continue
                require(not stat.S_ISLNK(s.st_mode) and not getattr(s,'st_file_attributes',0)&0x400,'owned-tree-reparse')
                if stat.S_ISDIR(s.st_mode):pending.append((entry,False))
                elif stat.S_ISREG(s.st_mode):total+=s.st_size;require(total<=512*MIB,'owned-disk-capacity')
                else:raise RuntimeError('owned-file-type')
        except FileNotFoundError:
            if required:raise
    # A removed queued descendant must not hide loss of a REQUIRED root.
    for root in roots:
        if root is not None:
            verify(root);s=metadata(root)
            require(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode)
              and not getattr(s,'st_file_attributes',0)&0x400,'owned-directory-type')
    check_evidence()
    return total,count

def validate_result(result,context,directory):
    exact(result,['schema','status','freezeFileSha256','sourceHashes','binaryHashes','lifecycle','nativeProof'])
    require(result['schema']=='adr174-owned-native-result/v1' and result['status']=='passed','native-result-status')
    require(result['freezeFileSha256']==context['freezeSha256'] and result['sourceHashes']==context['sourceHashes']
      and result['binaryHashes']==BINARY_PINS,'native-result-bytechain')
    life=result['lifecycle'];require(type(life) is dict and life.get('schema')=='adr174-owned-postgres-lifecycle/v1'
      and life.get('status')=='passed' and life.get('syntheticOnly') is True,'lifecycle-status')
    require('connectionRefusal' in life and life['connectionRefusal'] is None,'unexpected-connection-refusal')
    require(directory is not None and type(life.get('runDirectory')) is str and
      life['runDirectory'].lower()==str(directory).lower(),'native-directory-mismatch')
    server=life.get('server');require(type(server) is dict and server.get('ownershipVerified') is True
      and type(server.get('port')) is int and server['port']==55433 and type(server.get('postmasterPid')) is int
      and server['postmasterPid']>0 and type(server.get('version')) is int and 170000<=server['version']<180000,'native-server-proof')
    cleanup=life.get('cleanup');require(type(cleanup) is dict and cleanup.get('reason')=='verified-own-server-smart-stopped'
      and all(cleanup.get(k) is True for k in ['stopped','childExited','clientsClosed','physicalSettled','directoryRetained']),'native-cleanup-proof')
    proof=result['nativeProof'];require(type(proof) is dict and life.get('checks')==proof and proof.get('schema')=='adr167-native-result/v1'
      and proof.get('status')=='passed' and proof.get('nativeExecuted') is True,'native-proof')
    cases=proof.get('cases');require(type(cases) is list and len(cases)==len(CASE_NAMES)
      and [r.get('name') if type(r) is dict else None for r in cases]==CASE_NAMES
      and all(r.get('status')=='passed' for r in cases),'native-case-ledger')
    require(type(proof.get('cleanup')) is dict and proof['cleanup'].get('status')=='dropped','native-database-cleanup')
    control=proof.get('control');require(type(control) is dict and control.get('pendingPhysical')==0 and type(control.get('pendingPhysical')) is int
      and control.get('pendingTasks')==0 and type(control.get('pendingTasks')) is int
      and integer(control.get('clients'),8) and control['clients']>0 and type(proof.get('closedClients')) is int
      and proof['closedClients']==control['clients'],'native-client-drain')
    for key in ['acquisitionUncertain','closeUncertain','dropUncertain']:
        require(control.get(key) is False,'native-client-uncertainty')
    require(control.get('closed') is True and control.get('fault') is None and control.get('dropFinished') is True
      and all(control.get(k) is False for k in ['sinkFailed','timerFailed','controllerBusy']),'native-controller-completion')
    require(finite(life.get('elapsedMilliseconds')) and life['elapsedMilliseconds']<=360000,'lifecycle-deadline')
    return result

def run(ledger_pin):
    started=time.monotonic();parent_cpu=time.process_time()
    require(sys.platform=='win32' and HERE==REPO/OWN and HERE.drive.upper()=='D:' and not OUTPUT.exists() and not OUTPUT.is_symlink(),'fixed-run-scope')
    checked(HERE);context=before_active(started,lambda:source_snapshot(ledger_pin));startup_deadline(started,time.monotonic())
    node=fixed_runtime_paths(shutil.which('node'),sys.executable)
    k,p=before_startup(started,load_windows);headroom(k)
    if RUN_PARENT.exists():checked(RUN_PARENT);require(RUN_PARENT.is_dir(),'run-parent-type')
    baseline=set(x.name for x in RUN_PARENT.iterdir()) if RUN_PARENT.exists() else set()
    OUTPUT.mkdir();temp=OUTPUT/'temp';temp.mkdir()
    with (OUTPUT/'started.json').open('xb') as stream:stream.write(wire({'schema':'adr174-owned-native-supervisor-started/v1','freezeSha256':context['freezeSha256'],
      'sourceLedgerSha256':ledger_pin,'sourceHashes':context['sourceHashes'],'noReplay':True}))
    job=handle=child=None;assigned=False;emergency=False;drained=False;rechecked=False
    reason=cleanup_reason=None;run_directory=None;result_sha=None;total_processes=terminated_processes=None;final_job_cpu=0
    sql_phase={'firstObserved':None,'sha256':None}
    peaks={'rss':0,'private':0,'processes':0,'cpu':0,'bytes':0,'entries':0}
    def sample():
        nonlocal run_directory
        headroom(k);active_deadline(started,time.monotonic())
        observe_sql_phase(sql_phase,started,read_marker)
        run_directory=new_run_directory(baseline,expected=run_directory);used,entries=disk_usage([OUTPUT,run_directory])
        rss,private,processes=tree_memory(k,p,job);cpu,_,_=accounting(k,job);cpu+=time.process_time()-parent_cpu
        for key,value in [('rss',rss),('private',private),('processes',processes),('cpu',cpu),('bytes',used),('entries',entries)]:peaks[key]=max(peaks[key],value)
        require(rss<=MEMORY_LIMIT and private<=MEMORY_LIMIT and cpu<CPU_SECONDS,'owned-resource-budget')
    def read_marker():
        return read_sql_marker()
    with (OUTPUT/'stdout.log').open('xb') as out,(OUTPUT/'stderr.log').open('xb') as err:
        try:
            job=before_startup(started,lambda:k.CreateJobObjectW(None,None));require(bool(job),'own-job-create-failed')
            limits=ExtendedLimits();limits.basic.limitFlags=0x2000|0x200;limits.jobMemoryLimit=MEMORY_LIMIT
            require(k.SetInformationJobObject(job,9,ctypes.byref(limits),ctypes.sizeof(limits)),'own-job-limit-failed')
            env={key:value for key,value in os.environ.items() if key.upper() in {'SYSTEMROOT','WINDIR','PATH','PATHEXT','COMSPEC'}}
            env.update(TEMP=str(temp),TMP=str(temp),MURMINGLE_SCOPED_NATIVE_SUPERVISED='v1',
              MURMINGLE_SCOPED_NATIVE_FREEZE_SHA256=context['freezeSha256'],MURMINGLE_SCOPED_NATIVE_SOURCE_LEDGER_SHA256=ledger_pin,
              UV_THREADPOOL_SIZE='1',OMP_NUM_THREADS='1')
            startup_deadline(started,time.monotonic())
            child=subprocess.Popen([node,'--max-old-space-size=256',str(REPO/DRIVER),'--run-isolated-server'],cwd=HERE,env=env,
              shell=False,creationflags=subprocess.CREATE_NO_WINDOW,stdin=subprocess.PIPE,stdout=out,stderr=err)
            # Assign BEFORE post-launch deadline check; never lose a returned child.
            def assign(owned):
                nonlocal assigned
                def latch():
                    nonlocal assigned
                    assigned=True
                return assign_verified(k,job,owned,latch)
            def release():
                child.stdin.write(b'SCOPED_NATIVE_OWN_JOB_ASSIGNED_V1\n');child.stdin.flush();child.stdin.close()
            try:handle=assign_then_release(child,lambda pid:k.OpenProcess(0x1000|0x0100|0x0001,False,pid),assign,release,lambda:startup_deadline(started,time.monotonic()))
            except BaseException as error:
                handle=getattr(error,'owned_handle',None);raise
            while child.poll() is None:sample();time.sleep(.05)
            child.wait();active_deadline(started,time.monotonic());observe_sql_phase(sql_phase,started,read_marker)
            if (OUTPUT/'result.json').exists():result_sha=sha(fixed_bytes(OUTPUT/'result.json',262144))
            require(child.returncode==0,'owned-native-child-failed');require(not members(k,job),'own-native-descendants-not-drained');drained=True
            require(sql_phase['firstObserved'] is not None,'sql-marker-not-observed')
            run_directory=new_run_directory(baseline,expected=run_directory)
            result_bytes=fixed_bytes(OUTPUT/'result.json',262144);result_sha=sha(result_bytes)
            validate_result(strict(result_bytes),context,run_directory);sample()
        except Exception as error:reason=str(error) if type(error) is RuntimeError else 'native-supervisor-failed'
        finally:
            cleanup_until=min(started+WALL_SECONDS,time.monotonic()+60)
            if reason is not None:
                if job and assigned:
                    try:live=bool(members(k,job))
                    except Exception:live=True
                    if live:
                        emergency=True
                        if not k.TerminateJobObject(job,1):cleanup_reason='own-job-emergency-termination-failed'
                if child is not None and child.poll() is None:
                    if not assigned:child.kill();emergency=True
                    try:child.wait(timeout=max(.01,cleanup_until-time.monotonic()))
                    except Exception:cleanup_reason=cleanup_reason or 'own-node-exit-unconfirmed'
            if job:
                while time.monotonic()<cleanup_until:
                    try:
                        if not members(k,job):drained=child is None or child.poll() is not None;break
                    except Exception:break
                    time.sleep(.05)
                if not drained:cleanup_reason=cleanup_reason or 'own-job-final-drain-unconfirmed'
                try:
                    cpu,total_processes,terminated_processes=accounting(k,job);final_job_cpu=cpu;peaks['cpu']=max(peaks['cpu'],cpu+time.process_time()-parent_cpu)
                except Exception:cleanup_reason=cleanup_reason or 'own-job-final-cpu-unverifiable'
            for owned in (handle,job):
                if owned:
                    try:
                        if not k.CloseHandle(owned):cleanup_reason=cleanup_reason or 'own-handle-close-failed'
                    except Exception:cleanup_reason=cleanup_reason or 'own-handle-close-failed'
    try:
        same_snapshot(context,source_snapshot(ledger_pin));rechecked=True
        run_directory=new_run_directory(baseline,expected=run_directory);used,entries=disk_usage([OUTPUT,run_directory])
        peaks['bytes']=max(peaks['bytes'],used);peaks['entries']=max(peaks['entries'],entries)
    except Exception:reason=reason or 'final-bytechain-or-disk-unverifiable'
    peaks['cpu']=max(peaks['cpu'],final_job_cpu+time.process_time()-parent_cpu)
    if peaks['cpu']>=CPU_SECONDS or time.monotonic()-started>WALL_SECONDS:reason=reason or 'final-total-budget-exceeded'
    if reason is None and time.monotonic()-started>=ACTIVE_SECONDS:reason='normal-lifecycle-deadline'
    reason=reason or cleanup_reason
    receipt={'schema':'adr174-owned-native-supervisor/v1','status':'passed' if reason is None and drained and rechecked and not emergency else 'failed',
      'reason':reason,'cleanupReason':cleanup_reason,'freezeSha256':context['freezeSha256'],'sourceLedgerSha256':ledger_pin,
      'sourceHashes':context['sourceHashes'],'binaryHashes':BINARY_PINS,'resultSha256':result_sha,
      'sampledPeakTreeRssBytes':peaks['rss'],'sampledPeakTreePrivateBytes':peaks['private'],'sampledPeakTreeProcesses':peaks['processes'],
      'aggregateCpuSeconds':peaks['cpu'],'jobCpuIncludesExitedProcesses':True,'totalJobProcesses':total_processes,'terminatedJobProcesses':terminated_processes,
      'sampledPeakOwnedBytes':peaks['bytes'],'sampledPeakOwnedEntries':peaks['entries'],'elapsedSeconds':time.monotonic()-started,
      'emergencyOwnJobTermination':emergency,'ownTreeDrainConfirmed':drained,'sourceHashesRechecked':rechecked,
      'sqlPhaseMarkerSha256':sql_phase['sha256'],'sqlPhaseFirstObservedSeconds':None if sql_phase['firstObserved'] is None else sql_phase['firstObserved']-started,
      'runDirectory':str(run_directory) if run_directory else None,'retainedTempDirectory':str(temp),'handshakeBlockedNotSuspended':True,
      'activation':False,'productionValidated':False}
    data=wire(receipt);used,entries=disk_usage([OUTPUT,run_directory]);reserve_report(used,entries,len(data))
    with (OUTPUT/'supervisor.json').open('xb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
    disk_usage([OUTPUT,run_directory]);print(data.decode('utf8'),flush=True)
    return 0 if receipt['status']=='passed' else 1

def main():
    pin=parse_args(sys.argv[1:])
    if pin is None:print('Inert. Reviewed ledger FILE pin and explicit isolated phase required.');return 0
    return run(pin)

if __name__=='__main__':raise SystemExit(main())


