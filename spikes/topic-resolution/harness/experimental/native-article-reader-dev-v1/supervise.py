"""ADR168 default-inert composed baseline/browser guardian. No old main calls."""
import ctypes
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
import types
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
REPO=HERE.parents[4]
OWN='spikes/topic-resolution/harness/experimental/native-article-reader-dev-v1/'
BASE='spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/'
V151='spikes/topic-resolution/harness/experimental/native-extension-startup-dev-v1/'
V158='spikes/topic-resolution/harness/experimental/composed-owned-bootstrap-dev-v1/'
V153='spikes/topic-resolution/harness/experimental/native-bootstrap-process-dev-v1/'
V155='spikes/topic-resolution/harness/experimental/native-console-baseline-dev-v1/'
V157='spikes/topic-resolution/harness/experimental/growing-owned-job-census-v1/'
ADDITIONS=[BASE+'freeze.json',V151+'run.mjs',V151+'freeze.json',V158+'run.py',V158+'freeze.json',V153+'run.py',V153+'freeze.json',V155+'baseline.py',V155+'freeze.json',V157+'census.py',OWN+'run.mjs',OWN+'supervise.py',OWN+'source-ledger.js',OWN+'article-owner.mjs',OWN+'native-adapter.js',OWN+'worker.js',OWN+'manifest.json',OWN+'fixtures.js',OWN+'test.mjs',OWN+'README.md','decisions/ADR-168-native-article-reader-dev.md','spikes/topic-resolution/harness/experimental/exact-browser-infrastructure-v1/compatibility-variant.mjs']
PINS={'base':'770eb68ef044dadbb6ef0f2edf2c927b643480e7d06cbf496319b1cab9d457ec','v151':'0d470f5315e9c7cd9fe910ccae91ffad67119a5e356d5c21f7bd62bebf9ac021','v158':'757989d78e7fabe070b4cfd6c9f87b73ad477d222e421ec1d54804103672bc1a','v153':'2e78d5d1d3bf9f72eb799f6f3f6fbffd38c63caf628020abc6904f6038b25028','v155':'487231c5608b16610e04d0905ea6cd01b84af64004386af66e8c619db517ee43'}
RUN158_PIN='f79957e5acfb7bc856d051015fe4db5ec9cd7dd74951799cbb95c43612cd02d4'
DEV='spikes/topic-resolution/harness/experimental/playwright-dev-v1/'
PREFIX='node_modules/playwright-core/'
PACKAGE=REPO/DEV/PREFIX
INTEGRITY='sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ=='
OUTPUT=HERE/'output'
STAGE_FILES={'manifest.json':OWN+'manifest.json','worker.js':OWN+'worker.js','native-adapter.js':OWN+'native-adapter.js','native-rights.js':BASE+'native-rights.js','chromium/page-content-reader.js':'spikes/topic-resolution/browser/chromium/page-content-reader.js','core/page-content-policy.js':'spikes/topic-resolution/browser/core/page-content-policy.js'}
def sha(data):return hashlib.sha256(data).hexdigest()
def wire(value):return json.dumps(value,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode('utf8')
def strict(data):
    value=json.loads(data.decode('utf8'))
    if wire(value)!=data:raise RuntimeError('canonical-json-required')
    return value
def exact(value,keys):
    if type(value) is not dict or list(value)!=keys:raise RuntimeError('metadata-schema')
    return value
def require(value):
    if value is not True:raise RuntimeError('metadata-linkage')
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
def parse_paths(data):
    matches=re.findall(r'export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\);',data.decode('utf8'))
    if len(matches)!=1:raise RuntimeError('literal-source-schema')
    names=json.loads(matches[0])
    if type(names) is not list or len(names)!=72 or len(set(names))!=72 or names!=sorted(names):raise RuntimeError('literal-source-capacity')
    for name in names:
        if type(name) is not str or not re.fullmatch('[A-Za-z0-9._/-]{1,240}',name) or name.startswith('/') or any(p in ('','.','..') for p in name.split('/')):raise RuntimeError('literal-source-path')
    if BASE+'source-paths.js' not in names:raise RuntimeError('literal-source-closure')
    return names
def package_files():
    out=[];total=0
    def walk(directory,depth=0):
        nonlocal total
        info=directory.lstat()
        if depth>8 or not stat.S_ISDIR(info.st_mode) or getattr(info,'st_file_attributes',0)&0x400 or directory.is_symlink() or directory.resolve()!=directory:raise RuntimeError('package-tree')
        children=sorted(directory.iterdir(),key=lambda p:p.name)
        if len(children)>128:raise RuntimeError('package-capacity')
        for path in children:
            info=path.lstat()
            if getattr(info,'st_file_attributes',0)&0x400 or path.is_symlink() or path.resolve()!=path:raise RuntimeError('package-tree')
            if stat.S_ISDIR(info.st_mode):walk(path,depth+1)
            elif stat.S_ISREG(info.st_mode):
                total+=info.st_size
                if not 0<info.st_size<=4194304 or total>16777216 or len(out)>=128:raise RuntimeError('package-capacity')
                out.append(PREFIX+path.relative_to(PACKAGE).as_posix())
            else:raise RuntimeError('package-tree')
    walk(PACKAGE)
    if len(out)!=115 or total!=13656167:raise RuntimeError('package-identity')
    return out
def authenticate(buffers,pins=PINS):
    metadata={}
    for prefix,pin in [(BASE,pins['base']),(V151,pins['v151']),(V158,pins['v158']),(V153,pins['v153']),(V155,pins['v155'])]:
        data=buffers[prefix+'freeze.json']
        if sha(data)!=pin:raise RuntimeError('fixed-freeze-pin')
        metadata[prefix]=strict(data)
    for prefix,name in [(V151,'run.mjs'),(V158,'run.py'),(V153,'run.py'),(V155,'baseline.py')]:
        if sha(buffers[prefix+name])!=metadata[prefix]['sourceHashes'][prefix+name]:raise RuntimeError('fixed-code-pin')
    if sha(buffers[V158+'run.py'])!=RUN158_PIN or sha(buffers[V153+'run.py'])!='5865e5bbf769549ca5cd2e58f635b7cfee1e94d264fc4a82fd59ec42f66d0e27' or sha(buffers[V155+'baseline.py'])!='03cc1268b8772a8ae2b46c6af24de3fdad74b6abcb459825c7f9d5ec4be73527' or sha(buffers[V157+'census.py'])!=metadata[V158]['sourceHashes'][V157+'census.py']:raise RuntimeError('component-code-pin')
def inventory(read=read_fixed,list_package=package_files,base_pin=PINS['base'],auth=authenticate):
    base_bytes=read(REPO/BASE/'freeze.json',65536)
    if sha(base_bytes)!=base_pin:raise RuntimeError('base-freeze-pin')
    base=strict(base_bytes);literal=read(REPO/BASE/'source-paths.js')
    if sha(literal)!=base['sourceHashes'][BASE+'source-paths.js']:raise RuntimeError('literal-source-pin')
    names=parse_paths(literal);packages=list_package()
    if type(packages) is not list or len(packages)!=115 or len(set(packages))!=115:raise RuntimeError('package-capacity')
    for name in packages:
        if type(name) is not str or not name.startswith(PREFIX) or not re.fullmatch('[A-Za-z0-9._/-]{1,256}',name) or any(p in ('','.','..') for p in name.split('/')):raise RuntimeError('package-path')
    sources={};buffers={}
    for key in names+packages:
        data=literal if key==BASE+'source-paths.js' else read(PACKAGE/key[len(PREFIX):] if key.startswith(PREFIX) else REPO/key)
        buffers[key]=data;sources[key]=sha(data)
    if len(sources)!=187 or sources!=base['sourceHashes'] or list(sources)!=list(base['sourceHashes']):raise RuntimeError('base-source-drift')
    pkg=json.loads(buffers[PREFIX+'package.json']);lock=json.loads(buffers[DEV+'package-lock.json'])
    if pkg.get('name')!='playwright-core' or pkg.get('version')!='1.64.1' or lock.get('packages',{}).get(PREFIX[:-1],{}).get('integrity')!=INTEGRITY:raise RuntimeError('package-identity')
    for key in ADDITIONS:
        buffers[key]=base_bytes if key==BASE+'freeze.json' else read(REPO/key,65536 if key.endswith('freeze.json') else 4194304);sources[key]=sha(buffers[key])
    if len(sources)!=209:raise RuntimeError('source-count')
    auth(buffers)
    if sources['spikes/topic-resolution/harness/experimental/exact-browser-infrastructure-v1/compatibility-variant.mjs']!='2d0309b15a7a74fe7a440c041a3c7592c7369b67258cb2f46db4c2723e71c07d':raise RuntimeError('infrastructure-code-pin')
    if read(REPO/BASE/'source-paths.js')!=literal or read(REPO/BASE/'freeze.json',65536)!=base_bytes:raise RuntimeError('initial-source-drift')
    return sources,buffers
def validate_freeze(f,sources):
    exact(f,['schema','sourceHashes','freezeHash'])
    require(f['schema']=='native-article-reader-dev-freeze/v1' and f['sourceHashes']==sources and list(f['sourceHashes'])==list(sources) and f['freezeHash']==sha(wire({'schema':f['schema'],'sourceHashes':sources})))
    return f
def load_components(buffers,sources):
    authenticate(buffers)
    data=buffers[V158+'run.py']
    if sha(data)!=sources[V158+'run.py']:raise RuntimeError('component-source-drift')
    composed=types.ModuleType('_adr160_verified_158');composed.__file__=str(REPO/V158/'run.py')
    exec(compile(data,composed.__file__,'exec'),composed.__dict__)
    helper,base,census=composed.load_modules(buffers,sources)
    return composed,helper,base,census
def bootstrap_initialize(started,buffers,sources,loader=load_components,clock=time.monotonic):
    if not 0<=clock()-started<30:raise RuntimeError('bootstrap-deadline')
    composed,helper,base,census=loader(buffers,sources)
    helper,base,census,node,selected=composed.initialize(started,lambda:(helper,base,census),clock)
    return composed,helper,base,census,node,selected
def stage_layout(stage,inspect=os.lstat,list_directory=os.listdir):
    layout={'':['chromium','core','manifest.json','native-adapter.js','native-rights.js','worker.js'],'chromium':['page-content-reader.js'],'core':['page-content-policy.js']}
    for sub,expected in layout.items():
        directory=stage/sub if sub else stage;meta=inspect(directory)
        if getattr(meta,'st_file_attributes',0)&0x400 or not stat.S_ISDIR(meta.st_mode) or sorted(list_directory(directory))!=expected:raise RuntimeError('stage-layout')
        for name in expected:
            info=inspect(directory/name);is_directory=sub=='' and name in ('chromium','core')
            if getattr(info,'st_file_attributes',0)&0x400 or (not stat.S_ISDIR(info.st_mode) if is_directory else not stat.S_ISREG(info.st_mode)):raise RuntimeError('stage-layout')
def publish(path,data,before_link=lambda:None):
    if len(data)>65536:raise RuntimeError('evidence-file-capacity')
    pending=path.with_suffix('.pending')
    with pending.open('xb') as out:out.write(data);out.flush();os.fsync(out.fileno())
    before_link();os.link(pending,path)
def output_bounds(root=OUTPUT,scan=os.scandir,inspect=os.lstat):
    pending=[(str(root),False)];total=evidence=entries=0
    while pending:
        directory,is_temp=pending.pop()
        try:info=inspect(directory)
        except FileNotFoundError:
            if directory==str(root):raise
            continue
        if getattr(info,'st_file_attributes',0)&0x400 or not stat.S_ISDIR(info.st_mode):raise RuntimeError('output-tree')
        try:children=scan(directory)
        except FileNotFoundError:
            if directory==str(root):raise
            continue
        with children:
            for entry in children:
                entries+=1
                if entries>8192:raise RuntimeError('output-entry-capacity')
                try:info=entry.stat(follow_symlinks=False)
                except FileNotFoundError:continue
                if getattr(info,'st_file_attributes',0)&0x400:raise RuntimeError('output-reparse')
                temp=is_temp or directory==str(root) and entry.name=='temp'
                if stat.S_ISDIR(info.st_mode):pending.append((entry.path,temp))
                elif stat.S_ISREG(info.st_mode):
                    if directory==str(root) and entry.name=='temp':raise RuntimeError('temp-directory-required')
                    total+=info.st_size
                    if not temp:
                        evidence+=info.st_size
                        if info.st_size>65536 or evidence>1048576:raise RuntimeError('evidence-capacity')
                    if total>512*1048576:raise RuntimeError('output-byte-capacity')
                else:raise RuntimeError('output-type')
    logs=sum((root/key).stat().st_size for key in ('stdout.log','stderr.log') if (root/key).exists())
    if logs>65536:raise RuntimeError('log-capacity')
    return total,evidence,entries
def integer(value,maximum=9007199254740991):require(type(value) is int and 0<=value<=maximum)
def reserve_receipt(total,evidence,entries,length):
    if total+2*length>512*1048576 or evidence+2*length>1048576 or entries+2>8192:raise RuntimeError('receipt-capacity')
FIXTURE_EXPECTED=json.loads('[{"id":"native-article-dev-001","htmlSha256":"61bfb819753e75701371096f58653fe2298eabaa35393d22475cfbfdd3bbd28c","rawTitleSha256":"2cca24474a143787eae9ac4dfe9bbce3d5e5f8fc2aea01d0c07c07c59126168b","effectiveTitleSha256":"2cca24474a143787eae9ac4dfe9bbce3d5e5f8fc2aea01d0c07c07c59126168b","bodySha256":"231d708d8769eddea253db3efd0065da51e98214f98001737e36caedab165e5c","extractorVersion":"main-text-prefix/v1"},{"id":"native-article-dev-002","htmlSha256":"0b088a2babd700e02825bed5b5fe8210a9c90fa1aa6cf66396a28b8f3e05789d","rawTitleSha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","effectiveTitleSha256":"12ca17b49af2289436f303e0166030a21e525d266e209267433801a8fd4071a0","bodySha256":"cf32d97ba9a7fef6f67d08d4ef09a1903383dfdfe44a2c6ddf57ad8299f095df","extractorVersion":"article-container-prefix/v1"},{"id":"native-article-dev-003","htmlSha256":"36ef6ddc54f0df7d589c27585b9fb3e8343c81dc836a6a7edf87fef6e6397bc4","rawTitleSha256":null,"effectiveTitleSha256":null,"bodySha256":null,"extractorVersion":null},{"id":"native-article-dev-004","htmlSha256":"ba5b2431b9fe61fdccc6e12dd78d5839efd54a38883ee25036281480162805dd","rawTitleSha256":"dd4ed4fd251360548dc05e4895baa8ba9676763c615015dafa204abdacfee073","effectiveTitleSha256":"dd4ed4fd251360548dc05e4895baa8ba9676763c615015dafa204abdacfee073","bodySha256":"7f88e913e4088a05acc1943ccac0d3e6937d0f30c11d0ded03e09a1dbc1b7f42","extractorVersion":"main-text-prefix/v1"}]')
OPERATION_STAGES=["launch","blank-anchor","fixture-route","socket-deny","browser-cdp","download-deny","anchor-session","anchor-info","discovery","census","extension-load","worker-lookup","worker-wait","native-window","native-begin","article-new-page","article-session","article-info","article-authenticate","article-foreground","page-enable","frame-tree","network-enable","fixture-navigate","fixture-dcl","native-tab","native-locate","native-snapshot","native-skip","native-observe","head-mutation","native-bad-document","article-close","retirement-drain","article-detach","native-end","close-context","close-browser"]
def validate_variant(v,variant):
    exact(v,['schema','status','cases','preLoadCensus','postLoadCensus','finalCensus','events','callbackRows','callbackSummary','operationRows','contextCloseAttempts','browserCloseAttempts','contextClosed','browserClosed','physicalOperationsDrained','callbacksDrained','pending','elapsedMs','publicRequests','modelCalls','rawInputPersisted','syntheticTransportOnly','nativeWriteAuthority','productionValidated','assignmentAuthority'])
    require(variant=='article' and v['schema']=='native-article-diagnostic/v1' and v['status']=='complete')
    for key in ['contextClosed','browserClosed','physicalOperationsDrained','callbacksDrained','syntheticTransportOnly']:require(v[key] is True)
    for key in ['rawInputPersisted','nativeWriteAuthority','productionValidated','assignmentAuthority']:require(v[key] is False)
    for key in ['pending','publicRequests','modelCalls']:require(type(v[key]) is int and v[key]==0)
    for key in ['contextCloseAttempts','browserCloseAttempts']:require(type(v[key]) is int and v[key]==1)
    integer(v['events'],4096);integer(v['callbackRows'],32);integer(v['operationRows'],256)
    s=exact(v['callbackSummary'],['callbackCalls','totalObserved','invalidCallbacks','retained','dropped','counts','firstFault'])
    for key in ['callbackCalls','totalObserved','invalidCallbacks','retained','dropped']:integer(s[key],4096)
    keys=['disconnected','page','worker','anchor-navigation','anchor-dialog','anchor-download','anchor-crash','anchor-worker','article-dialog','article-download','article-crash','article-worker','article-navigation','target-created','target-info-changed','target-destroyed','target-crashed','frame-committed']
    exact(s['counts'],keys)
    for count in s['counts'].values():integer(count,4096)
    require(s['invalidCallbacks']==0 and s['firstFault'] is None and s['callbackCalls']==s['totalObserved'] and s['totalObserved']==s['retained']+s['dropped']==sum(s['counts'].values()) and s['retained']==v['callbackRows']==min(32,s['totalObserved']) and s['callbackCalls']<=v['events'])
    require(type(v['elapsedMs']) in (int,float) and math.isfinite(v['elapsedMs']) and 0<=v['elapsedMs']<=350000)
    require(type(v['cases']) is list and len(v['cases'])==4)
    import re
    for index,row in enumerate(v['cases'],1):
        require(type(row) is dict and row.get('caseId')=='native-article-dev-'+str(index).zfill(3) and type(row.get('ordinal')) is int and row.get('ordinal')==index)
        if index in (1,2):
            exact(row,['caseId','ordinal','status','htmlSha256','rawTitleSha256','effectiveTitleSha256','bodySha256','extractorVersion','successfulPublications'])
            require(row['status']=='collected' and type(row['successfulPublications']) is int and row['successfulPublications']==1 and row['extractorVersion']==('main-text-prefix/v1' if index==1 else 'article-container-prefix/v1'))
            for name in ['htmlSha256','rawTitleSha256','effectiveTitleSha256','bodySha256']:require(row[name]==FIXTURE_EXPECTED[index-1][name])
        elif index==3:
            exact(row,['caseId','ordinal','status','bodyRead','successfulPublications']);require(row['status']=='head-denied' and row['bodyRead'] is False and row['successfulPublications']==0)
        else:
            exact(row,['caseId','ordinal','status','baselineBodySha256','sameNativeDocument','mutationDenied','badDocumentRefused','badDocumentRefusalCode','validTargetRecheck','successfulPublications'])
            require(row['status']=='mutation-and-bad-document-refused' and row['sameNativeDocument'] is True and row['mutationDenied'] is True and row['badDocumentRefused'] is True and row['badDocumentRefusalCode']=='native-execution' and row['validTargetRecheck'] is True and row['successfulPublications']==0)
            require(row['baselineBodySha256']==FIXTURE_EXPECTED[3]['bodySha256'])
    for name,phase in [('preLoadCensus','pre-load'),('postLoadCensus','post-load'),('finalCensus','final')]:
        c=exact(v[name],['phase','targets','blankPages','ownExtensionWorkers','otherTargets','ownExtensionEquality','infrastructureTargets','infrastructureEquality','anchorEquality','browserTargets','articleTargets','articleTombstones'])
        require(c['phase']==phase and c['blankPages']==1 and c['otherTargets']==0 and c['infrastructureTargets']==2 and c['infrastructureEquality'] is True and c['anchorEquality'] is True and c['ownExtensionEquality'] is True and c['articleTargets']==0)
        integer(c['targets'],32);integer(c['browserTargets'],28);integer(c['ownExtensionWorkers'],1);integer(c['articleTombstones'],4)
        require(c['targets']==3+c['ownExtensionWorkers']+c['browserTargets'])
    require(v['finalCensus']['articleTombstones']==4)
    return v

def validate_request(value,index,variant,context):
    expected={'schema':'baselined-startup-drain-request/v1','variantIndex':index,'variantHash':sha(wire(variant)),**context}
    require(value==expected and list(value)==list(expected) and type(value['variantIndex']) is int);return value
def drain_ack(request,request_sha):
    return {'schema':'baselined-startup-drain-ack/v1','requestSha256':request_sha,'variantIndex':request['variantIndex'],'freezeSha256':request['freezeSha256'],'sourceHashesHash':request['sourceHashesHash'],'readySha256':request['readySha256'],'startupAckSha256':request['startupAckSha256'],'baselineHash':request['baselineHash'],'originalNodePid':request['originalNodePid'],'originalNodeCreationFiletime':request['originalNodeCreationFiletime'],'browserResidualAbsent':True}
def barrier(until,node_pid,allowed,poll,members,sample,recheck,publish_ack,guard,clock=time.monotonic,pause=time.sleep):
    # until is created once at FIRST complete request observation, never reset.
    def check():
        guard()
        if clock()>=until:raise RuntimeError('browser-drain-deadline')
        if poll() is not None:raise RuntimeError('node-exited-before-ack')
        live=members()
        if node_pid not in live:raise RuntimeError('node-not-live-before-ack')
        return live
    while True:
        live=check()
        if set(live).issubset(allowed):
            exact_live=sample()
            require(node_pid in exact_live and set(exact_live).issubset(allowed))
            check();recheck();live=check()
            if not set(live).issubset(allowed):raise RuntimeError('browser-growth-before-ack')
            def before_link():
                current=check()
                if not set(current).issubset(allowed):raise RuntimeError('browser-growth-before-ack')
                # Source/stage IO may outlive a console incarnation. Reinspect
                # exact held-handle identity AFTER that IO, not just its PID set.
                final_exact=sample()
                require(node_pid in final_exact and set(final_exact).issubset(allowed))
                current=check()
                if not set(current).issubset(allowed):raise RuntimeError('browser-growth-before-ack')
            publish_ack(before_link);check();return
        pause(.05)
def validate_result(r,frozen,freeze_sha,map_hash,ready_sha,ack_sha,baseline,variants,pairs):
    exact(r,['schema','status','freezeHash','freezeSha256','sourceHashesHash','readySha256','startupAckSha256','baselineHash','diagnostic','drainPairs','trace','callbacks','sourceHashesRechecked','stageBytesRechecked','publicRequests','modelCalls','rawInputPersisted','syntheticTransportOnly','completeOsEgressIsolation','productionValidated','assignmentAuthority'])
    expected={'schema':'native-article-reader-dev-result/v1','status':'complete','freezeHash':frozen['freezeHash'],'freezeSha256':freeze_sha,'sourceHashesHash':map_hash,'readySha256':ready_sha,'startupAckSha256':ack_sha,'baselineHash':baseline['baselineHash'],'diagnostic':variants[0],'drainPairs':pairs,'sourceHashesRechecked':True,'stageBytesRechecked':True,'publicRequests':0,'modelCalls':0,'rawInputPersisted':False,'syntheticTransportOnly':True,'completeOsEgressIsolation':False,'productionValidated':False,'assignmentAuthority':False}
    for key,value in expected.items():require(type(r[key]) is type(value) and r[key]==value)
    require(type(r['trace']) is list and 2<=len(r['trace'])<=512 and len(r['trace'])%2==0 and len(r['trace'])==2*r['diagnostic']['operationRows'])
    for i in range(0,len(r['trace']),2):
        a=exact(r['trace'][i],['stage','event']);b=exact(r['trace'][i+1],['stage','event'])
        require(a['stage'] in OPERATION_STAGES and a['event']=='before' and b=={'stage':a['stage'],'event':'after'})
    require(type(r['callbacks']) is list and len(r['callbacks'])==r['diagnostic']['callbackRows']<=32)
    for i,row in enumerate(r['callbacks'],1):
        exact(row,['schema','kind','ordinal']);require(row['schema']=='native-article-callback/v1' and row['ordinal']==i and row['kind'] in r['diagnostic']['callbackSummary']['counts'])
    return r
def validate_completion_record(value,result_bytes,frozen,freeze_sha,map_hash,ready_sha,ack_sha,baseline,node,variants,pairs):
    expected={'schema':'baselined-startup-complete/v1','freezeSha256':freeze_sha,'sourceHashesHash':map_hash,'readySha256':ready_sha,'startupAckSha256':ack_sha,'baselineHash':baseline['baselineHash'],'originalNodePid':node['pid'],'originalNodeCreationFiletime':node['creationFiletime'],'resultSha256':sha(result_bytes),'drainPairs':pairs}
    require(len(pairs)==1 and len(variants)==1 and value==expected and list(value)==list(expected))
    validate_result(strict(result_bytes),frozen,freeze_sha,map_hash,ready_sha,ack_sha,baseline,variants,pairs)
    return True

class JobAccounting(ctypes.Structure):
    _fields_=[('TotalUserTime',ctypes.c_longlong),('TotalKernelTime',ctypes.c_longlong),('ThisPeriodTotalUserTime',ctypes.c_longlong),('ThisPeriodTotalKernelTime',ctypes.c_longlong),('TotalPageFaultCount',ctypes.c_uint32),('TotalProcesses',ctypes.c_uint32),('ActiveProcesses',ctypes.c_uint32),('TotalTerminatedProcesses',ctypes.c_uint32)]
def cpu_seconds(value):
    if type(value.TotalUserTime) is not int or type(value.TotalKernelTime) is not int or min(value.TotalUserTime,value.TotalKernelTime)<0:raise RuntimeError('cpu-accounting')
    seconds=(value.TotalUserTime+value.TotalKernelTime)/10000000
    if not math.isfinite(seconds) or seconds>60:raise RuntimeError('cpu-capacity')
    return seconds
def job_cpu(kernel,job):
    value=JobAccounting()
    if not kernel.QueryInformationJobObject(job,1,ctypes.byref(value),ctypes.sizeof(value),None):raise RuntimeError('cpu-accounting')
    return cpu_seconds(value)

def run(started,sources,buffers,freeze_bytes,frozen):
    # Authenticity before exec; use158 initializer preserving its original30s cap.
    if len(wire(sources))+24576>65536:raise RuntimeError('worst-report-capacity')
    composed,helper,base,census,node,selected=bootstrap_initialize(started,buffers,sources)
    freeze_sha=sha(freeze_bytes);map_hash=sha(wire(sources))
    OUTPUT.mkdir();(OUTPUT/'temp').mkdir()
    job=child=original=None;reason=cleanup_code=None;emergency=clean=rechecked=complete=False
    rows=[];baseline=None;ready_sha=ack_sha=None;peak=[0,0,0];peak_cpu=0;variants=[];pairs=[];child_started=None;exit_confirmed=False
    def guard():
        nonlocal peak_cpu
        helper.headroom();output_bounds()
        if time.monotonic()-started >=360:raise RuntimeError('active-deadline')
        if child_started is not None and not exit_confirmed and time.monotonic()>=child_started+350:raise RuntimeError('child-deadline')
        if job:
            peak_cpu=max(peak_cpu,job_cpu(helper.kernel,job))
            rss,private,count=helper.tree_memory(job);peak[:]=[max(peak[0],rss),max(peak[1],private),max(peak[2],count)]
            if max(rss,private)>1536*1048576:raise RuntimeError('memory-capacity')
    def recheck(stage=False):
        fresh,_=inventory()
        if fresh!=sources or read_fixed(HERE/'freeze.json',65536)!=freeze_bytes:raise RuntimeError('source-drift')
        if stage:
            stage_layout(OUTPUT/'staged-extension')
            for target,source in STAGE_FILES.items():
                if sha(read_fixed(OUTPUT/'staged-extension'/target))!=sources[source] or sha(read_fixed(REPO/source))!=sources[source]:raise RuntimeError('stage-drift')
            stage_layout(OUTPUT/'staged-extension')
        guard()
    with (OUTPUT/'stdout.log').open('xb') as stdout,(OUTPUT/'stderr.log').open('xb') as stderr:
        try:
            k=helper.kernel;job=composed.before_active(started,lambda:k.CreateJobObjectW(None,None))
            if not job:raise RuntimeError('job-create')
            limits=helper.ExtendedLimits();limits.basic.limitFlags=0x2000|0x200;limits.jobMemoryLimit=1536*1048576
            if not composed.before_active(started,lambda:k.SetInformationJobObject(job,9,ctypes.byref(limits),ctypes.sizeof(limits))):raise RuntimeError('job-limit')
            env={key:value for key,value in os.environ.items() if key.upper() in {'SYSTEMROOT','WINDIR','PATH','PATHEXT'}}
            env.update(TEMP=str(OUTPUT/'temp'),TMP=str(OUTPUT/'temp'),MURMINGLE_NATIVE_ARTICLE_READER_DEV_V1_SUPERVISED='1',OMP_NUM_THREADS='1',UV_THREADPOOL_SIZE='1')
            child_started=time.monotonic();child=composed.before_active(started,lambda:subprocess.Popen([node,'--max-old-space-size=256',str(HERE/'run.mjs'),'--run-dev'],cwd=HERE,env=env,shell=False,creationflags=subprocess.CREATE_NO_WINDOW,stdin=subprocess.PIPE,stdout=stdout,stderr=stderr))
            original=k.OpenProcess(0x1000|0x0100|0x0001,False,child.pid);composed.assign_then_check(started,original,lambda handle:k.AssignProcessToJobObject(job,handle))
            actual=helper.process_identity(original);image=helper.image_identity(actual['imagePath'])
            if actual['pid']!=child.pid or image['imagePathSha256']!=selected['imagePathSha256'] or not helper.process_belongs(original,job):raise RuntimeError('original-image')
            initial={'pid':child.pid,'creationFiletime':str(actual['creationFiletime']),**image,'imagePathHashEncoding':helper.IMAGE_HASH_ENCODING,'confirmedOwnJob':True,'inspectionStatus':'confirmed'}
            def validate_completion():
                nonlocal complete
                value=strict(read_fixed(OUTPUT/'completion.json',65536));result_bytes=read_fixed(OUTPUT/'result.json',65536)
                complete=validate_completion_record(value,result_bytes,frozen,freeze_sha,map_hash,ready_sha,ack_sha,baseline,policy.node,variants,pairs)
            def exit_proof():
                nonlocal exit_confirmed
                if not exit_confirmed:exit_confirmed=composed.confirm_normal_exit(child.poll,validate_completion,child_started+350)
                return exit_confirmed
            policy=composed.IncrementalPolicy(initial,base,census,exit_proof);composed.retain(rows,[initial])
            def identify(handle):
                value=helper.process_identity(handle)
                return {'pid':value['pid'],'creationFiletime':str(value['creationFiletime']),**helper.image_identity(value['imagePath']),'imagePathHashEncoding':helper.IMAGE_HASH_ENCODING}
            def sample():
                guard()
                try:result=census.inspect_growing_job(job,list_members=helper.member_ids,open_member=lambda pid:k.OpenProcess(0x1000,False,pid),belongs=helper.process_belongs,identity=identify,close_member=k.CloseHandle,validate_row=policy.accept)
                except census.CensusFailure as error:composed.retain(rows,error.partialRows);raise
                composed.retain(rows,result['historicalRows']);policy.final(result);return result['livePids']
            sample();startup={'schema':'native-console-start/v1','freezeSha256':freeze_sha,'sourceHashesHash':map_hash,'originalNodePid':child.pid,'originalNodeCreationFiletime':initial['creationFiletime']}
            child.stdin.write(b'NATIVE_ARTICLE_READER_DEV_JOB_ASSIGNED_V1\n'+wire(startup)+b'\n');child.stdin.flush();child.stdin.close()
            ready_until=min(time.monotonic()+15,started+30)
            ready_bytes=composed.wait_ready(lambda:(OUTPUT/'ready.json').exists(),lambda:read_fixed(OUTPUT/'ready.json',65536),sample,ready_until)
            ready=strict(ready_bytes);ready_sha=sha(ready_bytes);base.validate_ready(ready,freeze_sha,map_hash,policy.node);sample();composed.active_deadline(started)
            if time.monotonic()>=ready_until:raise RuntimeError('ready-deadline')
            baseline=policy.seal();recheck();composed.active_deadline(started)
            if time.monotonic()>=ready_until or child.poll() is not None:raise RuntimeError('startup-ack-deadline-or-exit')
            ack_data=wire(base.make_ack(ready,ready_sha,freeze_sha,map_hash,baseline));ack_sha=sha(ack_data)
            def startup_before_link():
                composed.active_deadline(started)
                if time.monotonic()>=ready_until or child.poll() is not None:raise RuntimeError('startup-ack-deadline-or-exit')
                sample()
                if child.poll() is not None or time.monotonic()>=ready_until:raise RuntimeError('startup-ack-deadline-or-exit')
            publish(OUTPUT/'ack.json',ack_data,startup_before_link)
            context={'readySha256':ready_sha,'startupAckSha256':ack_sha,'freezeSha256':freeze_sha,'sourceHashesHash':map_hash,'baselineHash':baseline['baselineHash'],'originalNodePid':child.pid,'originalNodeCreationFiletime':initial['creationFiletime']}
            allowed={initial['pid']}
            if baseline['console'] is not None:allowed.add(baseline['console']['pid'])
            for index,name in [(1,'article')]:
                variant_started=None
                while not (OUTPUT/('drain-'+str(index)+'.request.json')).exists():
                    guard()
                    if child.poll() is not None or child.pid not in helper.member_ids(job):raise RuntimeError('node-exited-before-drain-request')
                    marker=OUTPUT/('variant-'+str(index)+'.started.json')
                    if marker.exists() and variant_started is None:
                        value=strict(read_fixed(marker,65536));require(value=={'schema':'baselined-startup-variant-started/v1','variantIndex':index,'freezeSha256':freeze_sha});variant_started=time.monotonic()
                    if variant_started is not None and time.monotonic()-variant_started>=350:raise RuntimeError('variant-deadline')
                    time.sleep(.05)
                drain_until=time.monotonic()+15 # Non-sliding FIRST complete observation.
                request_bytes=read_fixed(OUTPUT/('drain-'+str(index)+'.request.json'),65536);request_sha=sha(request_bytes)
                marker=strict(read_fixed(OUTPUT/('variant-'+str(index)+'.started.json'),65536));require(marker=={'schema':'baselined-startup-variant-started/v1','variantIndex':index,'freezeSha256':freeze_sha})
                if variant_started is not None and time.monotonic()-variant_started>=350:raise RuntimeError('variant-deadline')
                variant=validate_variant(strict(read_fixed(OUTPUT/('variant-'+str(index)+'.result.json'),65536)),name)
                request=validate_request(strict(request_bytes),index,variant,context);ack=wire(drain_ack(request,request_sha))
                barrier(drain_until,child.pid,allowed,child.poll,lambda:helper.member_ids(job),sample,lambda:recheck(True),lambda before:publish(OUTPUT/('drain-'+str(index)+'.ack.json'),ack,before),guard)
                variants.append(variant);pairs.append({'requestSha256':request_sha,'ackSha256':sha(ack),'variantHash':request['variantHash']})
            while child.poll() is None:
                sample() # Keep exact identity policy through completion/exit races.
                time.sleep(.05)
            if not exit_proof():raise RuntimeError('normal-exit-unconfirmed')
            composed.drain(sample,child.poll);recheck(True)
        except census.CensusFailure as error:reason=error.code;cleanup_code=error.cleanupCode;composed.retain(rows,error.partialRows)
        except census.PolicyFailure as error:reason=error.code
        except Exception as error:reason=str(error) if type(error) is RuntimeError else 'guardian-failed'
        finally:
            until=time.monotonic()+60
            try:
                if job and helper.member_ids(job):
                    emergency=True;reason=reason or 'emergency-own-job-required'
                    if not helper.kernel.TerminateJobObject(job,1):raise RuntimeError('termination-failed')
                if child and child.poll() is None:emergency=True;reason=reason or 'emergency-original-child-required';child.kill();child.wait(timeout=max(.01,until-time.monotonic()))
                while job and helper.member_ids(job):
                    if time.monotonic()>=until:raise RuntimeError('cleanup-deadline')
                    time.sleep(.05)
                clean=child is None or child.poll() is not None
            except Exception:cleanup_code=cleanup_code or 'guardian-cleanup-failed'
            finally:
                if job:
                    try:peak_cpu=max(peak_cpu,job_cpu(helper.kernel,job))
                    except Exception:reason=reason or 'final-cpu-accounting-or-capacity'
                for handle in (original,job):
                    if handle:
                        try:
                            if not helper.kernel.CloseHandle(handle):cleanup_code=cleanup_code or 'guardian-handle-close-failed'
                        except Exception:cleanup_code=cleanup_code or 'guardian-handle-close-failed'
        try:
            fresh,_=inventory();require(fresh==sources and read_fixed(HERE/'freeze.json',65536)==freeze_bytes);output_bounds();rechecked=True
        except Exception:reason=reason or 'final-source-or-resource-failed'
        if time.monotonic()-started>420:reason=reason or 'wall-deadline'
        passed=reason is None and cleanup_code is None and clean and not emergency and complete
        receipt={'schema':'native-article-reader-dev-supervisor/v1','status':'complete' if passed else 'failed','reason':reason,'cleanupCode':cleanup_code,'freezeSha256':freeze_sha,'freezeHash':frozen['freezeHash'],'sourceHashes':sources,'sourceHashesRechecked':rechecked,'baseline':baseline,'readySha256':ready_sha,'startupAckSha256':ack_sha,'drainPairs':pairs,'variants':variants,'completionValidated':complete,'exitCode':None if child is None else child.returncode,'memberCensus':rows,'jobTotalCpuSeconds':peak_cpu,'cpuLimitSeconds':60,'activeLimitSeconds':360,'wallLimitSeconds':420,'sampledPeakRssBytes':peak[0],'sampledPeakPrivateBytes':peak[1],'sampledPeakProcesses':peak[2],'emergencyOwnJobTermination':emergency,'ownTreeCleanupConfirmed':clean,'elapsedSeconds':time.monotonic()-started,'trustedHostPathAssumption':True,'binaryOrSignatureAttestation':False,'completeOsEgressIsolation':False,'productionValidated':False,'assignmentAuthority':False}
        data=wire(receipt);total,evidence,entries=output_bounds();reserve_receipt(total,evidence,entries,len(data))
        publish(OUTPUT/'supervisor.json',data);output_bounds();print(data.decode('utf8'));return 0 if passed else 1
def main():
    if len(sys.argv)==1:print('Inert. Separate review, preparation and run approval required.');return 0
    if sys.platform!='win32' or sys.argv[1:] not in (['--prepare'],['--run-dev']) or HERE!=REPO/OWN or HERE.drive.upper()!='D:' or OUTPUT.exists() or OUTPUT.is_symlink():raise RuntimeError('fixed-cli-scope')
    started=time.monotonic();sources,buffers=inventory()
    if time.monotonic()-started>=30:raise RuntimeError('bootstrap-deadline')
    if sys.argv[1]=='--prepare':
        if inventory()[0]!=sources:raise RuntimeError('prepare-source-drift')
        body={'schema':'native-article-reader-dev-freeze/v1','sourceHashes':sources}
        with (HERE/'freeze.json').open('xb') as out:out.write(wire({**body,'freezeHash':sha(wire(body))}))
        return 0
    freeze_bytes=read_fixed(HERE/'freeze.json',65536);frozen=validate_freeze(strict(freeze_bytes),sources)
    return run(started,sources,buffers,freeze_bytes,frozen)
if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception:print('Baselined startup unavailable.',file=sys.stderr);raise SystemExit(1) from None







