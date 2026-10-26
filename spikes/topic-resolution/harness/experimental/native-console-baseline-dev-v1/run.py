"""ADR155 default-inert guardian. Frozen helper reuse, never its old main."""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import types
sys.dont_write_bytecode=True
from baseline import ExactConsoleBaseline, make_ack, validate_completion, validate_ready

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[4]
OWN='spikes/topic-resolution/harness/experimental/native-console-baseline-dev-v1/'
OLD='spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/'
OLD_FREEZE_SHA='2e78d5d1d3bf9f72eb799f6f3f6fbffd38c63caf628020abc6904f6038b25028'
HELPER_SHA='5865e5bbf769549ca5cd2e58f635b7cfee1e94d264fc4a82fd59ec42f66d0e27'
ADDITIONS=[OWN+x for x in ('baseline.py','run.py','node.mjs','test.mjs','README.md')]+['decisions/ADR-155-exact-owned-console-baseline-and-normal-drain.md']
OUTPUT=HERE/'output'

def sha(data):return hashlib.sha256(data).hexdigest()
def wire(value):return json.dumps(value,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode('utf8')
def strict(data):
    def pairs(rows):
        result={}
        for key,value in rows:
            if key in result:raise RuntimeError('duplicate-json-key')
            result[key]=value
        return result
    def bad(value):raise RuntimeError('nonfinite-json')
    return json.loads(data.decode('utf8'),object_pairs_hook=pairs,parse_constant=bad)

def initial_read(path,maximum=4194304):
    at=path
    while True:
        info=at.lstat()
        if getattr(info,'st_file_attributes',0)&0x400 or at.is_symlink():raise RuntimeError('source-reparse')
        if at==REPO:break
        if at==at.parent:raise RuntimeError('source-containment')
        at=at.parent
    import stat
    before=path.lstat()
    if not stat.S_ISREG(before.st_mode) or not 0<before.st_size<=maximum or path.resolve()!=path:raise RuntimeError('source-capacity')
    data=path.read_bytes();after=path.lstat()
    if len(data)!=before.st_size or (before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise RuntimeError('source-read-drift')
    return data

def load_helper(read=initial_read):
    frozen=read(REPO/OLD/'freeze.json',65536)
    if sha(frozen)!=OLD_FREEZE_SHA:raise RuntimeError('old-freeze-pin')
    metadata=strict(frozen)
    code=read(REPO/OLD/'run.py')
    if metadata.get('sourceHashes',{}).get(OLD+'run.py')!=HELPER_SHA or sha(code)!=HELPER_SHA:raise RuntimeError('helper-source-pin')
    module=types.ModuleType('_adr155_verified_adr153')
    module.__file__=str(REPO/OLD/'run.py')
    exec(compile(code,module.__file__,'exec'),module.__dict__)
    return module,metadata,frozen

def source_snapshot(helper,metadata,frozen):
    sources=helper.source_snapshot()
    if len(sources)!=201 or sources!=metadata.get('sourceHashes') or list(sources)!=list(metadata['sourceHashes']):raise RuntimeError('old-source-drift')
    sources=dict(sources)
    for key in ADDITIONS:sources[key]=sha(helper.bounded_bytes(REPO/key))
    sources[OLD+'freeze.json']=sha(frozen)
    if len(sources)!=208 or helper.bounded_bytes(REPO/OLD/'freeze.json',65536)!=frozen:raise RuntimeError('source-closure-drift')
    return sources

def validate_freeze(value,sources):
    if type(value) is not dict or list(value)!=['schema','sourceHashes','oldFreezeSha256','freezeHash'] or value['schema']!='native-console-baseline-dev-freeze/v1' or value['sourceHashes']!=sources or list(value['sourceHashes'])!=list(sources) or value['oldFreezeSha256']!=OLD_FREEZE_SHA or value['freezeHash']!=sha(wire({k:v for k,v in value.items() if k!='freezeHash'})):raise RuntimeError('freeze-linkage')
    return value

def publish(path,data):
    if len(data)>65536:raise RuntimeError('evidence-capacity')
    pending=path.with_suffix('.pending')
    with pending.open('xb') as out:out.write(data);out.flush();os.fsync(out.fileno())
    os.link(pending,path) # Exclusive atomic publication; retain pending evidence.

def retain_unique(rows,new):
    for row in new:
        if row not in rows:
            if len(rows)>=32:raise RuntimeError('census-retention-capacity')
            rows.append(dict(row))

def ready_bytes(exists,read,sample,until,clock=time.monotonic,pause=time.sleep):
    while True:
        if clock()>=until:raise RuntimeError('ready-deadline')
        if exists():
            if clock()>=until:raise RuntimeError('ready-deadline')
            value=read()
            if clock()>=until:raise RuntimeError('ready-deadline')
            return value
        sample()
        if clock()>=until:raise RuntimeError('ready-deadline')
        pause(.05)

def normal_drain(sample,poll,completed,clock=time.monotonic,pause=time.sleep):
    until=clock()+5
    while True:
        live=sample(completed and poll()==0)
        if not live and poll()==0 and completed:return True
        if clock()>=until:raise RuntimeError('normal-drain-timeout')
        pause(.05)

def run(helper,metadata,frozen):
    started=time.monotonic();helper.load_windows();helper.headroom()
    sources=source_snapshot(helper,metadata,frozen)
    freeze_bytes=helper.bounded_bytes(HERE/'freeze.json',65536);freeze_sha=sha(freeze_bytes)
    freeze=validate_freeze(strict(freeze_bytes),sources);map_hash=sha(wire(sources))
    node,selected=helper.selected_node_path()
    OUTPUT.mkdir();(OUTPUT/'temp').mkdir()
    job=child=original=None;reason=None;emergency=False;clean=False;rechecked=False
    rows=[];baseline=None;ready_sha=ack_sha=None;complete=False;peaks=[0,0,0]
    def bounds():
        helper.owned_tree_metadata(OUTPUT)
        if sum((OUTPUT/x).stat().st_size for x in ('stdout.log','stderr.log') if (OUTPUT/x).exists())>65536:raise RuntimeError('log-capacity')
        if time.monotonic()-started>=30:raise RuntimeError('active-deadline')
    with (OUTPUT/'stdout.log').open('xb') as stdout,(OUTPUT/'stderr.log').open('xb') as stderr:
        try:
            k=helper.kernel;job=k.CreateJobObjectW(None,None)
            if not job:raise RuntimeError('job-create')
            limits=helper.ExtendedLimits();limits.basic.limitFlags=0x2000|0x200;limits.jobMemoryLimit=1536*1048576
            if not k.SetInformationJobObject(job,9,ctypes.byref(limits),ctypes.sizeof(limits)):raise RuntimeError('job-limit')
            env={key:value for key,value in os.environ.items() if key.upper() in {'SYSTEMROOT','WINDIR','PATH','PATHEXT'}}
            env.update(TEMP=str(OUTPUT/'temp'),TMP=str(OUTPUT/'temp'),MURMINGLE_NATIVE_CONSOLE_BASELINE_DEV_V1_SUPERVISED='1',OMP_NUM_THREADS='1',UV_THREADPOOL_SIZE='1')
            child=subprocess.Popen([node,'--max-old-space-size=256',str(HERE/'node.mjs'),'--bootstrap'],cwd=HERE,env=env,shell=False,creationflags=subprocess.CREATE_NO_WINDOW,stdin=subprocess.PIPE,stdout=stdout,stderr=stderr)
            original=k.OpenProcess(0x1000|0x0100|0x0001,False,child.pid)
            if not original or not k.AssignProcessToJobObject(job,original):raise RuntimeError('job-assignment')
            actual=helper.process_identity(original);image=helper.image_identity(actual['imagePath'])
            if actual['pid']!=child.pid or image['imagePathSha256']!=selected['imagePathSha256'] or not helper.process_belongs(original,job):raise RuntimeError('original-image')
            row={'pid':child.pid,'creationFiletime':str(actual['creationFiletime']),**image,'imagePathHashEncoding':helper.IMAGE_HASH_ENCODING,'confirmedOwnJob':True,'inspectionStatus':'confirmed'}
            state=ExactConsoleBaseline(row);retain_unique(rows,[row])
            def consume_completion():
                nonlocal complete
                if baseline is None or ready_sha is None or ack_sha is None:raise RuntimeError('completion-before-ack')
                validate_completion(strict(helper.bounded_bytes(OUTPUT/'completion.json',65536)),ready_sha,ack_sha,freeze_sha,map_hash,baseline)
                complete=True
            def sample(exit_allowed=False):
                helper.headroom();bounds()
                observed=helper.member_ids(job)
                try:inspected=helper.inspect_job_members(job,observed,helper.member_ids,lambda pid:k.OpenProcess(0x1000,False,pid),helper.process_belongs,helper.process_identity,k.CloseHandle)
                except helper.CensusFailure as error:
                    retain_unique(rows,error.rows);raise RuntimeError('census-failed') from None
                retain_unique(rows,inspected);live=helper.member_ids(job)
                # A just-exited Node can disappear between census and poll.
                if child.pid not in live and not exit_allowed:
                    if child.poll()==0:
                        consume_completion()
                        exit_allowed=True
                state.observe(inspected,live,exit_allowed)
                rss,private,count=helper.tree_memory(job)
                peaks[:]=[max(peaks[0],rss),max(peaks[1],private),max(peaks[2],count)]
                if max(rss,private)>1536*1048576:raise RuntimeError('memory-capacity')
                return live
            sample()
            startup={'schema':'native-console-start/v1','freezeSha256':freeze_sha,'sourceHashesHash':map_hash,'originalNodePid':child.pid,'originalNodeCreationFiletime':row['creationFiletime']}
            child.stdin.write(b'NATIVE_CONSOLE_BASELINE_DEV_JOB_ASSIGNED_V1\n'+wire(startup)+b'\n');child.stdin.flush();child.stdin.close()
            ready_until=time.monotonic()+15;child_until=time.monotonic()+25
            ready_data=ready_bytes(lambda:(OUTPUT/'ready.json').exists(),lambda:helper.bounded_bytes(OUTPUT/'ready.json',65536),sample,ready_until)
            ready=strict(ready_data);ready_sha=sha(ready_data)
            validate_ready(ready,freeze_sha,map_hash,state.node);sample()
            if time.monotonic()>=ready_until:raise RuntimeError('ready-deadline')
            baseline=state.seal()
            if source_snapshot(helper,metadata,frozen)!=sources or helper.bounded_bytes(HERE/'freeze.json',65536)!=freeze_bytes:raise RuntimeError('ack-source-drift')
            if time.monotonic()>=ready_until:raise RuntimeError('ready-deadline')
            ack=make_ack(ready,ready_sha,freeze_sha,map_hash,baseline);ack_bytes=wire(ack);ack_sha=sha(ack_bytes);publish(OUTPUT/'ack.json',ack_bytes)
            while child.poll() is None:
                if (OUTPUT/'completion.json').exists():
                    consume_completion()
                sample(complete and child.poll()==0)
                if time.monotonic()>=child_until:raise RuntimeError('child-deadline')
                time.sleep(.05)
            if child.poll()!=0:raise RuntimeError('node-nonzero')
            consume_completion()
            normal_drain(sample,child.poll,complete)
        except Exception as error:
            reason=str(error) if type(error) is RuntimeError else 'guardian-failed'
        finally:
            until=time.monotonic()+5
            try:
                if job and helper.member_ids(job):
                    emergency=True;reason=reason or 'emergency-required'
                    if not helper.kernel.TerminateJobObject(job,1):raise RuntimeError('termination-failed')
                if child and child.poll() is None:
                    emergency=True;reason=reason or 'emergency-original-child-termination-required'
                    child.kill();child.wait(timeout=max(.01,until-time.monotonic()))
                while job and helper.member_ids(job):
                    if time.monotonic()>=until:raise RuntimeError('cleanup-deadline')
                    time.sleep(.05)
                clean=child is None or child.poll() is not None
            except Exception:reason=reason or 'cleanup-failed'
            finally:
                if original:helper.kernel.CloseHandle(original)
                if job:helper.kernel.CloseHandle(job)
        try:
            if source_snapshot(helper,metadata,frozen)!=sources or helper.bounded_bytes(HERE/'freeze.json',65536)!=freeze_bytes:raise RuntimeError('end-source-drift')
            rechecked=True;bounds()
        except Exception:reason=reason or 'end-check-failed'
        if time.monotonic()-started>40:reason=reason or 'wall-deadline'
        result={'schema':'native-console-baseline-supervisor/v1','status':'complete' if reason is None and clean and not emergency else 'failed','reason':reason,'freezeSha256':freeze_sha,'freezeHash':freeze['freezeHash'],'sourceHashes':sources,'sourceHashesRechecked':rechecked,'baseline':baseline,'readySha256':ready_sha,'ackSha256':ack_sha,'completionValidated':complete,'exitCode':None if child is None else child.returncode,'memberCensus':rows,'sampledPeakRssBytes':peaks[0],'sampledPeakPrivateBytes':peaks[1],'sampledPeakProcesses':peaks[2],'emergencyOwnJobTermination':emergency,'ownTreeCleanupConfirmed':clean,'elapsedSeconds':time.monotonic()-started,'trustedHostPathAssumption':True,'binaryOrSignatureAttestation':False,'canonicalAuthority':False,'productionValidated':False}
        total,entries=helper.owned_tree_metadata(OUTPUT)
        if total+2*len(wire(result))>262144 or entries+2>256:raise RuntimeError('final-evidence-capacity')
        publish(OUTPUT/'supervisor.json',wire(result));helper.owned_tree_metadata(OUTPUT)
        print(wire(result).decode('utf8'));return 0 if result['status']=='complete' else 1

def main():
    if len(sys.argv)==1:print('Inert. Review and separate preparation/run approval required.');return 0
    if sys.platform!='win32' or sys.argv[1:] not in (['--prepare'],['--run-dev']) or HERE!=REPO/OWN or HERE.drive.upper()!='D:' or OUTPUT.exists() or OUTPUT.is_symlink():raise RuntimeError('fixed-cli-scope')
    helper,metadata,frozen=load_helper()
    if sys.argv[1]=='--prepare':
        sources=source_snapshot(helper,metadata,frozen)
        body={'schema':'native-console-baseline-dev-freeze/v1','sourceHashes':sources,'oldFreezeSha256':OLD_FREEZE_SHA}
        if source_snapshot(helper,metadata,frozen)!=sources:raise RuntimeError('prepare-drift')
        with (HERE/'freeze.json').open('xb') as out:out.write(wire({**body,'freezeHash':sha(wire(body))}))
        return 0
    return run(helper,metadata,frozen)

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception:print('Console baseline diagnostic unavailable.',file=sys.stderr);raise SystemExit(1) from None
