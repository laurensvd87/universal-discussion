"""ADR158 small composed Node-only guardian. Inert without explicit phase."""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time
import types
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
REPO=HERE.parents[4]
OWN='spikes/topic-resolution/harness/experimental/composed-owned-bootstrap-dev-v1/'
OLD153='spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/'
OLD155='spikes/topic-resolution/harness/experimental/native-console-baseline-dev-v1/'
PART='spikes/topic-resolution/harness/experimental/growing-owned-job-census-v1/'
SOURCE_KEYS=[OWN+'run.py',OWN+'node.mjs',OWN+'test.mjs',OWN+'README.md',
 'decisions/ADR-158-composed-minimal-owned-bootstrap-guardian.md',OLD153+'run.py',OLD153+'freeze.json',
 OLD155+'baseline.py',OLD155+'freeze.json',PART+'census.py',PART+'test.mjs',PART+'README.md',
 'decisions/ADR-157-bounded-growing-owned-job-census.md']
PIN153='2e78d5d1d3bf9f72eb799f6f3f6fbffd38c63caf628020abc6904f6038b25028'
HELPER_PIN='5865e5bbf769549ca5cd2e58f635b7cfee1e94d264fc4a82fd59ec42f66d0e27'
PIN155='487231c5608b16610e04d0905ea6cd01b84af64004386af66e8c619db517ee43'
BASELINE_PIN='03cc1268b8772a8ae2b46c6af24de3fdad74b6abcb459825c7f9d5ec4be73527'
OUTPUT=HERE/'output'

def sha(data):return hashlib.sha256(data).hexdigest()
def wire(value):return json.dumps(value,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode('utf8')
def strict(data):
    value=json.loads(data.decode('utf8'))
    if wire(value)!=data:raise RuntimeError('canonical-json-required')
    return value
def read_fixed(path,maximum=4194304):
    at=path
    while True:
        info=at.lstat()
        if getattr(info,'st_file_attributes',0)&0x400 or at.is_symlink():raise RuntimeError('source-reparse')
        if at==REPO:break
        if at==at.parent:raise RuntimeError('source-containment')
        at=at.parent
    before=path.lstat()
    if not stat.S_ISREG(before.st_mode) or not 0<before.st_size<=maximum or path.resolve()!=path:raise RuntimeError('source-capacity')
    data=path.read_bytes();after=path.lstat()
    if len(data)!=before.st_size or (before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise RuntimeError('source-read-drift')
    return data
def inventory(read=read_fixed):
    buffers={key:read(REPO/key,65536 if key.endswith('freeze.json') else 4194304) for key in SOURCE_KEYS}
    return {key:sha(value) for key,value in buffers.items()},buffers
def authenticate_old(buffers):
    for prefix,freeze_pin,key,code_pin in [(OLD153,PIN153,'run.py',HELPER_PIN),(OLD155,PIN155,'baseline.py',BASELINE_PIN)]:
        data=buffers[prefix+'freeze.json']
        if sha(data)!=freeze_pin:raise RuntimeError('old-freeze-pin')
        metadata=strict(data)
        if metadata.get('sourceHashes',{}).get(prefix+key)!=code_pin or sha(buffers[prefix+key])!=code_pin:raise RuntimeError('old-code-pin')
def validate_freeze(value,sources):
    if type(value) is not dict or list(value)!=['schema','sourceHashes','freezeHash'] or value['schema']!='composed-owned-bootstrap-freeze/v1' or value['sourceHashes']!=sources or list(value['sourceHashes'])!=SOURCE_KEYS or value['freezeHash']!=sha(wire({'schema':value['schema'],'sourceHashes':sources})):raise RuntimeError('freeze-linkage')
    return value
def load_modules(buffers,sources):
    authenticate_old(buffers)
    # All three modules are executed from the exact buffer authenticated here.
    modules=[]
    for tag,key in [('win',OLD153+'run.py'),('baseline',OLD155+'baseline.py'),('census',PART+'census.py')]:
        if sha(buffers[key])!=sources.get(key):raise RuntimeError('module-source-pin')
        module=types.ModuleType('_adr158_'+tag);module.__file__=str(REPO/key)
        exec(compile(buffers[key],module.__file__,'exec'),module.__dict__);modules.append(module)
    return tuple(modules)

class IncrementalPolicy:
    def __init__(self,node,baseline,census,exit_proof):
        self.base=baseline;self.census=census;self.node=baseline.identity(node);self.console=None;self.sealed=None;self.exit_proof=exit_proof
        if self.node['imagePathSha256']!=baseline.NODE_HASH:raise census.PolicyFailure('policy-identity-conflict')
    def reject(self,code):raise self.census.PolicyFailure(code)
    def accept(self,row):
        if row['inspectionStatus']=='gone':
            if row['pid']==self.node['pid']:
                if not self.exit_proof():self.reject('policy-node-missing')
            elif self.console is None or row['pid']!=self.console['pid']:self.reject('policy-gone-unknown')
            return
        try:value=self.base.identity(row)
        except Exception:self.reject('policy-identity-conflict')
        if value['pid']==self.node['pid']:
            if value!=self.node:self.reject('policy-identity-conflict')
        elif value['imagePathSha256']==self.base.CONSOLE_HASH:
            if self.console is None:
                if self.sealed is not None:self.reject('policy-late-member')
                self.console=dict(value)
            elif value!=self.console:self.reject('policy-identity-conflict')
        else:self.reject('policy-unknown-member')
    def final(self,result):
        # No fabricated current row: the census itself supplies handle-confirmed rows.
        if len(result['livePids'])>2:self.reject('policy-scope-capacity')
        if self.node['pid'] not in result['livePids'] and not self.exit_proof():self.reject('policy-node-missing')
    def seal(self):
        if self.sealed is not None:self.reject('policy-identity-conflict')
        body={'schema':'native-console-baseline/v1','node':dict(self.node),'console':None if self.console is None else dict(self.console)}
        self.sealed={**body,'baselineHash':self.base.digest(body)};return strict(wire(self.sealed))

def wait_ready(exists,read,sample,until,clock=time.monotonic,pause=time.sleep):
    while True:
        if clock()>=until:raise RuntimeError('ready-deadline')
        if exists():
            if clock()>=until:raise RuntimeError('ready-deadline')
            data=read()
            if clock()>=until:raise RuntimeError('ready-deadline')
            return data
        sample()
        if clock()>=until:raise RuntimeError('ready-deadline')
        pause(.05)
def publish(path,data):
    if len(data)>65536:raise RuntimeError('evidence-capacity')
    pending=path.with_suffix('.pending')
    with pending.open('xb') as out:out.write(data);out.flush();os.fsync(out.fileno())
    os.link(pending,path)
def retain(rows,new):
    for row in new:
        if row not in rows:
            if len(rows)>=32:raise RuntimeError('retained-census-capacity')
            rows.append(dict(row))
def drain(sample,poll,clock=time.monotonic,pause=time.sleep):
    until=clock()+5
    while True:
        live=sample()
        if not live and poll()==0:return
        if clock()>=until:raise RuntimeError('normal-drain-deadline')
        pause(.05)
def confirm_normal_exit(poll,consume,until,clock=time.monotonic):
    if poll()!=0:return False
    if clock()>=until:raise RuntimeError('child-deadline')
    consume()
    if clock()>=until:raise RuntimeError('child-deadline')
    return True
def active_deadline(started,clock=time.monotonic):
    elapsed=clock()-started
    if not 0<=elapsed<30:raise RuntimeError('active-deadline')
def before_active(started,callback,clock=time.monotonic):
    active_deadline(started,clock)
    return callback()
def assign_then_check(started,original,assign,clock=time.monotonic):
    # The caller retains both Popen and this opened handle before any rejection.
    # A launch crossing the deadline must still enter the owned cleanup scope.
    if not original or not assign(original):raise RuntimeError('job-assignment')
    active_deadline(started,clock)
def initialize(started,loader,clock=time.monotonic):
    helper,base,census=before_active(started,loader,clock)
    before_active(started,helper.load_windows,clock)
    before_active(started,helper.headroom,clock)
    node,selected=before_active(started,helper.selected_node_path,clock)
    active_deadline(started,clock)
    return helper,base,census,node,selected

def run(sources,buffers,freeze_bytes,frozen,started):
    helper,base,census,node,selected=initialize(started,lambda:load_modules(buffers,sources))
    freeze_sha=sha(freeze_bytes);map_hash=sha(wire(sources))
    OUTPUT.mkdir();(OUTPUT/'temp').mkdir()
    job=child=original=None;reason=cleanup_code=None;emergency=complete=rechecked=clean=normal_exit_confirmed=False
    rows=[];baseline=None;ready_sha=ack_sha=None;peak=[0,0,0];child_started=None
    def resources(reserve=0,extra_entries=0):
        helper.headroom();total,entries=helper.owned_tree_metadata(OUTPUT)
        logs=sum((OUTPUT/key).stat().st_size for key in ('stdout.log','stderr.log') if (OUTPUT/key).exists())
        if logs>65536 or total+reserve>262144 or entries+extra_entries>256 or time.monotonic()-started>=30:raise RuntimeError('resource-budget')
    def recheck():
        fresh,_=inventory()
        if fresh!=sources or read_fixed(HERE/'freeze.json',65536)!=freeze_bytes:raise RuntimeError('source-drift')
    with (OUTPUT/'stdout.log').open('xb') as stdout,(OUTPUT/'stderr.log').open('xb') as stderr:
        try:
            k=helper.kernel;job=before_active(started,lambda:k.CreateJobObjectW(None,None))
            if not job:raise RuntimeError('job-create')
            limits=helper.ExtendedLimits();limits.basic.limitFlags=0x2000|0x200;limits.jobMemoryLimit=1536*1048576
            if not before_active(started,lambda:k.SetInformationJobObject(job,9,ctypes.byref(limits),ctypes.sizeof(limits))):raise RuntimeError('job-limit')
            env={key:value for key,value in os.environ.items() if key.upper() in {'SYSTEMROOT','WINDIR','PATH','PATHEXT'}}
            env.update(TEMP=str(OUTPUT/'temp'),TMP=str(OUTPUT/'temp'),MURMINGLE_COMPOSED_OWNED_BOOTSTRAP_DEV_V1_SUPERVISED='1',OMP_NUM_THREADS='1',UV_THREADPOOL_SIZE='1')
            child_started=time.monotonic()
            child=before_active(started,lambda:subprocess.Popen([node,'--max-old-space-size=256',str(HERE/'node.mjs'),'--bootstrap'],cwd=HERE,env=env,shell=False,creationflags=subprocess.CREATE_NO_WINDOW,stdin=subprocess.PIPE,stdout=stdout,stderr=stderr))
            original=k.OpenProcess(0x1000|0x0100|0x0001,False,child.pid)
            assign_then_check(started,original,lambda handle:k.AssignProcessToJobObject(job,handle))
            actual=helper.process_identity(original);image=helper.image_identity(actual['imagePath'])
            if actual['pid']!=child.pid or image['imagePathSha256']!=selected['imagePathSha256'] or not helper.process_belongs(original,job):raise RuntimeError('original-image')
            initial={'pid':child.pid,'creationFiletime':str(actual['creationFiletime']),**image,'imagePathHashEncoding':helper.IMAGE_HASH_ENCODING,'confirmedOwnJob':True,'inspectionStatus':'confirmed'}
            def consume_completion():
                nonlocal complete
                if baseline is None or ready_sha is None or ack_sha is None:raise RuntimeError('completion-before-ack')
                base.validate_completion(strict(read_fixed(OUTPUT/'completion.json',65536)),ready_sha,ack_sha,freeze_sha,map_hash,baseline);complete=True
            def exit_proof():
                nonlocal normal_exit_confirmed
                # Re-poll actual original child; never infer exit from empty census.
                if not normal_exit_confirmed:
                    normal_exit_confirmed=confirm_normal_exit(child.poll,consume_completion,child_started+25)
                return normal_exit_confirmed
            policy=IncrementalPolicy(initial,base,census,exit_proof);retain(rows,[initial])
            def identity(handle):
                value=helper.process_identity(handle)
                return {'pid':value['pid'],'creationFiletime':str(value['creationFiletime']),**helper.image_identity(value['imagePath']),'imagePathHashEncoding':helper.IMAGE_HASH_ENCODING}
            def sample():
                resources()
                try:result=census.inspect_growing_job(job,list_members=helper.member_ids,open_member=lambda pid:k.OpenProcess(0x1000,False,pid),belongs=helper.process_belongs,identity=identity,close_member=k.CloseHandle,validate_row=policy.accept)
                except census.CensusFailure as error:retain(rows,error.partialRows);raise
                retain(rows,result['historicalRows']);policy.final(result)
                rss,private,count=helper.tree_memory(job);peak[:]=[max(peak[0],rss),max(peak[1],private),max(peak[2],count)]
                if max(rss,private)>1536*1048576:raise RuntimeError('memory-capacity')
                return result['livePids']
            sample()
            startup={'schema':'native-console-start/v1','freezeSha256':freeze_sha,'sourceHashesHash':map_hash,'originalNodePid':child.pid,'originalNodeCreationFiletime':initial['creationFiletime']}
            child.stdin.write(b'COMPOSED_OWNED_BOOTSTRAP_JOB_ASSIGNED_V1\n'+wire(startup)+b'\n');child.stdin.flush();child.stdin.close()
            ready_until=min(time.monotonic()+15,child_started+25)
            ready_data=wait_ready(lambda:(OUTPUT/'ready.json').exists(),lambda:read_fixed(OUTPUT/'ready.json',65536),sample,ready_until)
            ready=strict(ready_data);ready_sha=sha(ready_data);base.validate_ready(ready,freeze_sha,map_hash,policy.node)
            sample()
            if time.monotonic()>=ready_until:raise RuntimeError('ready-deadline')
            baseline=policy.seal();recheck()
            if time.monotonic()>=ready_until:raise RuntimeError('ready-deadline')
            ack_bytes=wire(base.make_ack(ready,ready_sha,freeze_sha,map_hash,baseline));ack_sha=sha(ack_bytes);resources(2*len(ack_bytes),2);publish(OUTPUT/'ack.json',ack_bytes)
            while child.poll() is None:
                if (OUTPUT/'completion.json').exists():consume_completion()
                sample()
                if time.monotonic()>=child_started+25:raise RuntimeError('child-deadline')
                time.sleep(.05)
            if child.poll()!=0:raise RuntimeError('child-nonzero')
            if not exit_proof():raise RuntimeError('normal-exit-unconfirmed')
            drain(sample,child.poll)
        except census.CensusFailure as error:
            reason=error.code;cleanup_code=error.cleanupCode;retain(rows,error.partialRows)
        except census.PolicyFailure as error:
            reason=error.code
        except Exception as error:
            reason=str(error) if type(error) is RuntimeError else 'guardian-failed'
        finally:
            until=time.monotonic()+5
            try:
                if job and helper.member_ids(job):
                    emergency=True;reason=reason or 'emergency-own-job-required'
                    if not helper.kernel.TerminateJobObject(job,1):raise RuntimeError('termination-failed')
                if child and child.poll() is None:
                    emergency=True;reason=reason or 'emergency-original-child-required';child.kill();child.wait(timeout=max(.01,until-time.monotonic()))
                while job and helper.member_ids(job):
                    if time.monotonic()>=until:raise RuntimeError('cleanup-deadline')
                    time.sleep(.05)
                clean=child is None or child.poll() is not None
            except Exception:cleanup_code=cleanup_code or 'guardian-cleanup-failed'
            finally:
                for handle in (original,job):
                    if handle:
                        try:
                            if not helper.kernel.CloseHandle(handle):cleanup_code=cleanup_code or 'guardian-handle-close-failed'
                        except Exception:cleanup_code=cleanup_code or 'guardian-handle-close-failed'
        try:recheck();resources();rechecked=True
        except Exception:reason=reason or 'final-source-or-resource-failed'
        if time.monotonic()-started>40:reason=reason or 'wall-deadline'
        passed=reason is None and cleanup_code is None and clean and not emergency and complete
        result={'schema':'composed-owned-bootstrap-supervisor/v1','status':'complete' if passed else 'failed','reason':reason,'cleanupCode':cleanup_code,'freezeSha256':freeze_sha,'freezeHash':frozen['freezeHash'],'sourceHashes':sources,'sourceHashesRechecked':rechecked,'baseline':baseline,'readySha256':ready_sha,'ackSha256':ack_sha,'completionValidated':complete,'exitCode':None if child is None else child.returncode,'memberCensus':rows,'sampledPeakRssBytes':peak[0],'sampledPeakPrivateBytes':peak[1],'sampledPeakProcesses':peak[2],'emergencyOwnJobTermination':emergency,'ownTreeCleanupConfirmed':clean,'elapsedSeconds':time.monotonic()-started,'trustedHostPathAssumption':True,'binaryOrSignatureAttestation':False,'canonicalAuthority':False,'productionValidated':False}
        data=wire(result);total,entries=helper.owned_tree_metadata(OUTPUT)
        if total+2*len(data)>262144 or entries+2>256:raise RuntimeError('final-evidence-capacity')
        publish(OUTPUT/'supervisor.json',data);helper.owned_tree_metadata(OUTPUT);print(data.decode('utf8'));return 0 if passed else 1

def main():
    if len(sys.argv)==1:print('Inert. Separate source review, prepare and run approval required.');return 0
    if sys.platform!='win32' or sys.argv[1:] not in (['--prepare'],['--run-dev']) or HERE!=REPO/OWN or HERE.drive.upper()!='D:' or OUTPUT.exists() or OUTPUT.is_symlink():raise RuntimeError('fixed-cli-scope')
    started=time.monotonic();sources,buffers=inventory();active_deadline(started);authenticate_old(buffers);active_deadline(started)
    if sys.argv[1]=='--prepare':
        if inventory()[0]!=sources:raise RuntimeError('prepare-source-drift')
        body={'schema':'composed-owned-bootstrap-freeze/v1','sourceHashes':sources}
        with (HERE/'freeze.json').open('xb') as out:out.write(wire({**body,'freezeHash':sha(wire(body))}))
        return 0
    freeze_bytes=read_fixed(HERE/'freeze.json',65536);frozen=validate_freeze(strict(freeze_bytes),sources)
    return run(sources,buffers,freeze_bytes,frozen,started)
if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception:print('Composed bootstrap unavailable.',file=sys.stderr);raise SystemExit(1) from None
