# Source-only actual AST tests. No guardian main, WinDLL, processes, metadata,
# cluster, binary, output or artifact file reads; all filesystem inputs invented.
import ast,ctypes,hashlib,json,math,os,re,shutil,stat,subprocess,sys,time,types,copy
from ctypes import wintypes
from pathlib import Path
here=Path('apps/local-service/portable/integration/scoped-native-isolated-v2').resolve()
source=(here/'supervise.py').read_text()
tree=ast.parse(source)
allowed={'HERE','REPO','OWN','DRIVER','ADR','OUTPUT','RUN_PARENT','MIB','MEMORY_LIMIT','CPU_SECONDS','ACTIVE_SECONDS','WALL_SECONDS','FIXED_NODE','FIXED_PYTHON','SETTINGS','BINARY_PINS','CASE_NAMES','REQUIRED_SOURCES'}
body=[]
for node in tree.body:
 if isinstance(node,(ast.FunctionDef,ast.ClassDef)):body.append(node)
 elif isinstance(node,ast.Assign):
  names={x.id for x in ast.walk(ast.Tuple(elts=node.targets,ctx=ast.Load())) if isinstance(x,ast.Name)}
  if names<=allowed:body.append(node)
ns=dict(ctypes=ctypes,wintypes=wintypes,hashlib=hashlib,json=json,math=math,os=os,re=re,shutil=shutil,stat=stat,subprocess=subprocess,sys=sys,time=time,Path=Path,__file__=str(here/'supervise.py'))
exec(compile(ast.Module(body=body,type_ignores=[]),'actual-adr174-guardian-ast','exec'),ns)
r=types.SimpleNamespace(**ns);checks=0
def okay(value):
 global checks
 assert value;checks+=1
def reject(fn,code=None):
 global checks
 try:fn()
 except RuntimeError as e:
  if code:assert str(e)==code,(str(e),code)
  checks+=1;return e
 raise AssertionError('expected rejection')
okay(r.parse_args([]) is None)
okay(r.parse_args(['--run-isolated-server','--source-ledger-sha256','a'*64])=='a'*64)
for args in [['--run-isolated-server'],['--run-isolated-server','--source-ledger-sha256','A'*64],['--prepare'],['--run-isolated-server','--source-ledger-sha256','a'*64,'extra']]:reject(lambda:r.parse_args(args),'fixed-cli')
for key in [r.DRIVER,r.OWN+'supervise.py','apps/local-service/portable/node_modules/pg/package.json',r.ADR]:okay(r.source_name(key)==key)
for key in ['apps/local-service/data/private.json','apps/local-service/portable/data/private.js','apps/local-service/portable/integration/x/output/result.js','../secret.js','D:/secret.js',r.OWN+'freeze.json',r.OWN+'source-ledger.json','apps/local-service/portable/x/secret.json','apps/local-service/portable//x.js']:
 reject(lambda:r.source_name(key))
# Invented whole source/binary/freeze bytes. NO binary or data file reads.
real_pins=ns['BINARY_PINS'];ns['BINARY_PINS']={'D:/PostgreSQL/17/bin/postgres.exe':r.sha(b'invented binary')}
files={key:b'invented code' for key in sorted(r.REQUIRED_SOURCES)}
hashes={key:r.sha(value) for key,value in files.items()}
ledger=r.wire(dict(schema='adr174-owned-native-source-ledger/v1',sourceHashes=hashes))
pin=r.sha(ledger);files[r.OWN+'source-ledger.json']=ledger
base=dict(schema='adr174-owned-native-freeze/v1',sourceLedgerSha256=pin,sourceHashes=hashes,binaryHashes=ns['BINARY_PINS'],settings=r.SETTINGS)
freeze=r.wire({**base,'freezeHash':r.sha(r.wire(base))});files[r.OWN+'freeze.json']=freeze
files['D:/PostgreSQL/17/bin/postgres.exe']=b'invented binary'
seen=[]
def read(path,maximum=4194304):
 key=str(path).replace('\\','/')
 if key.startswith(str(r.REPO).replace('\\','/')+'/'):key=key[len(str(r.REPO).replace('\\','/'))+1:]
 seen.append(key);value=files[key];assert 0<len(value)<=maximum;return value
context=r.source_snapshot(pin,read);okay(context['sourceHashes']==hashes);okay(seen[0]==r.OWN+'source-ledger.json')
seen.clear();reject(lambda:r.source_snapshot('f'*64,read),'ledger-pin');okay(seen==[r.OWN+'source-ledger.json'])
# A valid authenticated but unsafe list must fail BEFORE following ANY source key.
poison={**hashes,'apps/local-service/data/private.json':'a'*64}
bad=r.wire(dict(schema='adr174-owned-native-source-ledger/v1',sourceHashes=dict(sorted(poison.items()))))
files[r.OWN+'source-ledger.json']=bad;seen.clear()
reject(lambda:r.source_snapshot(r.sha(bad),read),'source-scope');okay(seen==[r.OWN+'source-ledger.json'])
files[r.OWN+'source-ledger.json']=ledger;seen.clear();files[r.REQUIRED_SOURCES[0]]=b'drift'
reject(lambda:r.source_snapshot(pin,read),'source-drift');okay('apps/local-service/data/private.json' not in seen)
files[r.REQUIRED_SOURCES[0]]=b'invented code';ns['BINARY_PINS']=real_pins
reject(lambda:r.strict(b'{"a":1,"a":2}'),'duplicate-json-key');reject(lambda:r.strict(b'{"a":NaN}'),'nonfinite-json')
okay(r.cpu_seconds(500000000,100000000)==60)
for ticks in [(-1,0),(False,1),(1.0,0)]:reject(lambda:r.cpu_seconds(*ticks),'own-job-cpu-invalid')
calls=[];reject(lambda:r.before_active(0,lambda:calls.append('DLL'),clock=lambda:360),'active-deadline');okay(calls==[])
calls=[];child=types.SimpleNamespace(pid=71)
error=reject(lambda:r.assign_then_release(child,lambda pid:calls.append('open') or 9,lambda h:calls.append('assign') or True,lambda:calls.append('handshake'),lambda:r.active_deadline(0,360)),'active-deadline')
okay(calls==['open','assign'] and error.owned_handle==9)
calls=[];r.assign_then_release(child,lambda pid:9,lambda h:calls.append('assign') or True,lambda:calls.append('handshake'),lambda:calls.append('deadline'))
okay(calls==['assign','deadline','handshake'])
reject(lambda:r.reserve_report(512*r.MIB,0,1),'receipt-capacity');reject(lambda:r.reserve_report(0,8192,1),'receipt-capacity');r.reserve_report(0,0,262144)
# Actual parsed result validator with invented synthetic closed lifecycle.
control=dict(pendingPhysical=0,pendingTasks=0,clients=8,acquisitionUncertain=False,closeUncertain=False,dropUncertain=False,closed=True,fault=None,dropFinished=True,sinkFailed=False,timerFailed=False,controllerBusy=False)
proof=dict(schema='adr167-native-result/v1',status='passed',nativeExecuted=True,cases=[dict(name=name,status='passed') for name in r.CASE_NAMES],cleanup=dict(status='dropped'),closedClients=8,control=control)
life=dict(schema='adr174-owned-postgres-lifecycle/v1',status='passed',syntheticOnly=True,runDirectory=str(here/'invented'),server=dict(port=55433,postmasterPid=1,version=170011,ownershipVerified=True),cleanup=dict(reason='verified-own-server-smart-stopped',stopped=True,childExited=True,clientsClosed=True,physicalSettled=True,directoryRetained=True),checks=proof,elapsedMilliseconds=350000,connectionRefusal=None)
ctx=dict(freezeSha256='b'*64,sourceHashes={})
result=dict(schema='adr174-owned-native-result/v1',status='passed',freezeFileSha256='b'*64,sourceHashes={},binaryHashes=real_pins,lifecycle=life,nativeProof=proof)
okay(r.validate_result(result,ctx,here/'invented') is result)
mutations=[lambda v:v['lifecycle']['cleanup'].update(physicalSettled=False),lambda v:v['lifecycle']['server'].update(port=55432),lambda v:v['nativeProof']['control'].update(pendingPhysical=1),lambda v:v['nativeProof']['control'].update(acquisitionUncertain=True),lambda v:v['nativeProof']['control'].update(fault='late'),lambda v:v['nativeProof']['cases'].pop(),lambda v:v.update(freezeFileSha256='a'*64),lambda v:v['nativeProof']['cleanup'].update(status='retained'),lambda v:v['nativeProof'].update(closedClients=7),lambda v:v['nativeProof']['control'].update(pendingTasks=False)]
for change in mutations:
 bad=copy.deepcopy(result);change(bad);reject(lambda:r.validate_result(bad,ctx,here/'invented'))
for change in [lambda v:v['lifecycle'].pop('connectionRefusal'),lambda v:v['lifecycle'].update(connectionRefusal={'stage':'identity-query-unavailable'}),lambda v:v['lifecycle'].update(connectionRefusal=False)]:
 bad=copy.deepcopy(result);change(bad);reject(lambda:r.validate_result(bad,ctx,here/'invented'),'unexpected-connection-refusal')
reject(lambda:r.source_name('apps/local-service/data/adr167-scoped-native-check-20261020.mjs'),'source-scope')
# The actual main guard remains the ONLY invocation site; AST definitions never WinDLL/Popen.
okay('0x1000|0x0100|0x0001' in source and 'SCOPED_NATIVE_OWN_JOB_ASSIGNED_V1' in source)
okay('pg_cancel_backend' not in source and 'TerminateProcess' not in source)

marker=r.wire(dict(schema='adr174-sql-phase-started/v1'));state=dict(firstObserved=None,sha256=None)
now=[119.9];r.observe_sql_phase(state,0,lambda:marker,clock=lambda:now[0]);okay(state['firstObserved']==119.9)
now[0]=200;r.observe_sql_phase(state,0,lambda:marker,clock=lambda:now[0]);okay(state['firstObserved']==119.9)
reject(lambda:r.observe_sql_phase(state,0,lambda:None,clock=lambda:200),'sql-marker-disappeared')
reject(lambda:r.observe_sql_phase(state,0,lambda:marker+b' ',clock=lambda:200),'sql-marker-drift')
for elapsed in [120,121]:
 s=dict(firstObserved=None,sha256=None);reject(lambda:r.observe_sql_phase(s,0,lambda:marker,clock=lambda:elapsed),'startup-deadline');okay(s['firstObserved'] is None)
s=dict(firstObserved=None,sha256=None);now[0]=119
def delayed():now[0]=120;return marker
reject(lambda:r.observe_sql_phase(s,0,delayed,clock=lambda:now[0]),'startup-deadline');okay(s['firstObserved'] is None)
s=dict(firstObserved=None,sha256=None);r.observe_sql_phase(s,0,lambda:None,clock=lambda:1);okay(s['firstObserved'] is None)
reject(lambda:r.observe_sql_phase(s,0,lambda:r.wire(dict(schema='wrong')),clock=lambda:1),'sql-marker-schema')
reject(lambda:r.observe_sql_phase(s,0,lambda:r.wire(dict(schema='adr174-sql-phase-started/v1',extra=1)),clock=lambda:1))
s=dict(firstObserved=1,sha256=r.sha(marker));reject(lambda:r.observe_sql_phase(s,0,lambda:marker,clock=lambda:241),'post-startup-deadline')
calls=[];reject(lambda:r.startup_deadline(0,120),'startup-deadline');okay(calls==[])
# Literal case list and default settings agree with actual CODE, not output.
check=(r.REPO/'apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-native-v2/check.js').read_text()
literal=re.search(r'export const CASE_NAMES=Object.freeze\((\[[\s\S]*?\])\);',check).group(1)
okay(ast.literal_eval(literal)==r.CASE_NAMES)
okay('observe_sql_phase(sql_phase,started,read_marker)' in source and source.count('startup_deadline(started,time.monotonic())')>=3)

seen=[]
def published(path,maximum):
 seen.append(path.name);assert maximum==1024;return marker
okay(r.read_sql_marker(published)==marker);okay(seen==['sql-started.json','sql-started.pending','sql-started.json'])
seen=[]
def absent(path,maximum):seen.append(path.name);raise FileNotFoundError()
okay(r.read_sql_marker(absent) is None);okay(seen==['sql-started.json'])
def mismatch(path,maximum):return marker if path.name=='sql-started.json' else marker+b' '
reject(lambda:r.read_sql_marker(mismatch),'sql-marker-publication-drift')
def missing_pending(path,maximum):
 if path.name.endswith('pending'):raise FileNotFoundError()
 return marker
try:r.read_sql_marker(missing_pending)
except FileNotFoundError:checks+=1
else:raise AssertionError('must not retry missing pending')

calls=[];reject(lambda:r.before_startup(0,lambda:calls.append('DLL'),clock=lambda:120),'startup-deadline');okay(calls==[])
normalize=lambda value:value.replace('\\','/')
okay(r.fixed_runtime_paths(r.FIXED_NODE,r.FIXED_PYTHON,normalize).replace('\\','/')==r.FIXED_NODE)
reject(lambda:r.fixed_runtime_paths('D:/other/node.exe',r.FIXED_PYTHON,normalize),'fixed-runtime-path')
reject(lambda:r.fixed_runtime_paths(r.FIXED_NODE,'D:/other/python.exe',normalize),'fixed-runtime-path')
driver=(r.REPO/r.DRIVER).read_text()
pins=re.search(r'export const NATIVE_BINARY_PINS=Object.freeze\((\{[\s\S]*?\})\);',driver).group(1)
okay(ast.literal_eval(pins)==real_pins and len(real_pins)==9)
okay('before_startup(started,load_windows)' in source and '128*MIB' in source)

calls=[];state=dict(assigned=False)
class MembershipFailure:
 def AssignProcessToJobObject(self,job,owned):calls.append('assign');return True
 def IsProcessInJob(self,owned,job,target):calls.append('membership');return False
def latch():state['assigned']=True;calls.append('latch')
error=reject(lambda:r.assign_then_release(child,lambda pid:9,lambda owned:r.assign_verified(MembershipFailure(),7,owned,latch),lambda:calls.append('release'),lambda:calls.append('deadline')),'own-node-membership-unverified')
okay(state['assigned'] and calls==['assign','latch','membership'] and error.owned_handle==9)
class MembershipSuccess(MembershipFailure):
 def IsProcessInJob(self,owned,job,target):target._obj.value=True;calls.append('membership');return True
calls=[];r.assign_then_release(child,lambda pid:9,lambda owned:r.assign_verified(MembershipSuccess(),7,owned,latch),lambda:calls.append('release'),lambda:calls.append('deadline'))
okay(calls==['assign','latch','membership','deadline','release'])

# Exact ONE parent package exception; no expansion to neighboring data/package paths.
okay(r.source_name('apps/local-service/package.json')=='apps/local-service/package.json')
for name in ['apps/local-service/private.json','apps/local-service/package-lock.json','apps/local-service/data/package.json']:reject(lambda:r.source_name(name))
# Actual walker with an injected dynamic filesystem; no real directory inspection.
root=Path('invented-root');childdir=root/'removed-child';leaf=root/'gone-file'
directory=types.SimpleNamespace(st_mode=stat.S_IFDIR,st_size=0,st_file_attributes=0)
regular=types.SimpleNamespace(st_mode=stat.S_IFREG,st_size=17,st_file_attributes=0)
visited=[]
def verify(path):visited.append(path)
def disappearing(path):
 if path==root:return directory
 if path==childdir:
  if visited.count(childdir):raise FileNotFoundError()
  return directory
 if path==leaf:raise FileNotFoundError()
 raise AssertionError(path)
def children(path):
 if path==root:return iter([childdir,leaf])
 raise AssertionError('removed queued descendant must not enumerate')
okay(r.disk_usage([root],verify=verify,metadata=disappearing,list_directory=children,check_evidence=lambda:None)==(0,2))
okay(childdir in visited)
def denied(path):
 if path==childdir:raise PermissionError()
try:r.disk_usage([root],verify=denied,metadata=lambda path:directory,list_directory=lambda path:iter([childdir]) if path==root else iter([]),check_evidence=lambda:None)
except PermissionError:checks+=1
else:raise AssertionError('must not ignore permission failure')
def absent_root(path):raise FileNotFoundError()
try:r.disk_usage([root],verify=absent_root,metadata=lambda path:directory,list_directory=lambda path:iter([]),check_evidence=lambda:None)
except FileNotFoundError:checks+=1
else:raise AssertionError('required root must not disappear')
seenroot=[0]
def removed_root(path):
 if path==root:
  seenroot[0]+=1
  if seenroot[0]>1:raise FileNotFoundError()
try:r.disk_usage([root],verify=removed_root,metadata=lambda path:directory,list_directory=lambda path:iter([]),check_evidence=lambda:None)
except FileNotFoundError:checks+=1
else:raise AssertionError('required root disappearance at end must fail')
reparse=types.SimpleNamespace(st_mode=stat.S_IFDIR,st_size=0,st_file_attributes=0x400)
reject(lambda:r.disk_usage([root],verify=lambda path:None,metadata=lambda path:reparse,list_directory=lambda path:iter([]),check_evidence=lambda:None),'owned-tree-reparse')
reject(lambda:r.disk_usage([root],verify=lambda path:None,metadata=lambda path:regular,list_directory=lambda path:iter([]),check_evidence=lambda:None),'owned-directory-type')
# Queued descendant scandir absence is also benign, with its entry charged.
def removed_scan(path):
 if path==root:return iter([childdir])
 raise FileNotFoundError()
okay(r.disk_usage([root],verify=lambda path:None,metadata=lambda path:directory,list_directory=removed_scan,check_evidence=lambda:None)==(0,1))
# Atomic ownership publication: missing final allowed during prep, never parse partial.
run=r.RUN_PARENT/'adr174-Invented';ownership=r.wire(dict(schema='adr174-owned-postgres/v1',nonce='a'*48,runDirectory=str(run)));seen=[]
def run_exists(path):return path in [r.RUN_PARENT,run,run/'ownership.json']
def owned_read(path,maximum):seen.append(path.name);assert maximum==4096;return ownership
kwargs=dict(exists=run_exists,list_directory=lambda path:iter([run]),verify=lambda path:None,is_directory=lambda path:True)
okay(r.new_run_directory(set(),owned_read,**kwargs)==run)
okay(seen==['ownership.json','ownership.pending','ownership.json'])
okay(r.new_run_directory(set(),lambda *a:(_ for _ in ()).throw(AssertionError('must not read absent final')),**{**kwargs,'exists':lambda path:path in [r.RUN_PARENT,run]})==run)
def partial(path,maximum):return ownership if path.name=='ownership.json' else b''
reject(lambda:r.new_run_directory(set(),partial,**kwargs),'ownership-publication-drift')
try:r.new_run_directory(set(),lambda *a:(_ for _ in ()).throw(FileNotFoundError()),**kwargs)
except FileNotFoundError:checks+=1
else:raise AssertionError('missing published marker proof is fatal')
reject(lambda:r.new_run_directory(set(),owned_read,**{**kwargs,'exists':lambda path:False,'expected':run}),'owned-run-directory-disappeared')
try:r.new_run_directory(set(),lambda path,maximum:b'{',**kwargs)
except ValueError:checks+=1
else:raise AssertionError('must not retry or accept malformed published ownership')
reject(lambda:r.disk_usage([root],verify=lambda path:None,metadata=lambda path:directory if path==root else regular,list_directory=lambda path:iter([leaf]*8193) if path==root else iter([]),check_evidence=lambda:None),'owned-entry-capacity')
oversize=types.SimpleNamespace(st_mode=stat.S_IFREG,st_size=512*r.MIB+1,st_file_attributes=0)
reject(lambda:r.disk_usage([root],verify=lambda path:None,metadata=lambda path:directory if path==root else oversize,list_directory=lambda path:iter([leaf]) if path==root else iter([]),check_evidence=lambda:None),'owned-disk-capacity')
print('ADR174 actual guardian pure AST:',checks,'checks passed; no native/file inventory actions')







