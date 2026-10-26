"""Pure ADR155 exact baseline identities. No IO/native/canonical authority."""
import hashlib
import json
import re

ENCODING = 'win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1'
def path_hash(path):
    return hashlib.sha256((ENCODING + '\0' + path.lower()).encode('utf8')).hexdigest()
NODE_HASH = path_hash(r'c:\program files\nodejs\node.exe')
CONSOLE_HASH = path_hash(r'c:\windows\system32\conhost.exe')
def fail():
    raise RuntimeError('baseline-contract')
def integer(value):
    if type(value) is not int or not 0 < value <= 0xffffffff:
        fail()
def exact(value, keys):
    if type(value) is not dict or list(value) != keys:
        fail()
    return value
def digest(value):
    return hashlib.sha256(json.dumps(value,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode('utf8')).hexdigest()
def identity(row):
    exact(row,['pid','creationFiletime','imageBasename','imagePathSha256','imagePathHashEncoding','confirmedOwnJob','inspectionStatus'])
    integer(row['pid'])
    if row['inspectionStatus'] != 'confirmed' or row['confirmedOwnJob'] is not True:
        fail()
    creation=row['creationFiletime']
    if type(creation) is not str or not re.fullmatch('[1-9][0-9]{0,19}',creation) or int(creation) >= 1<<64:
        fail()
    basename=row['imageBasename']
    if type(basename) is not str or not 0<len(basename)<=128 or any(ord(c)<32 or ord(c)==127 or c in '/\\' for c in basename):
        fail()
    if row['imagePathHashEncoding'] != ENCODING or type(row['imagePathSha256']) is not str or not re.fullmatch('[a-f0-9]{64}',row['imagePathSha256']):
        fail()
    return {k:row[k] for k in ['pid','creationFiletime','imagePathSha256','imagePathHashEncoding']}

class ExactConsoleBaseline:
    def __init__(self,node):
        self.node=identity(node)
        if self.node['imagePathSha256'] != NODE_HASH:
            fail()
        self.console=None
        self.sealed=None
    def observe(self,records,live_pids,node_exit_allowed=False):
        if type(node_exit_allowed) is not bool or type(records) is not list or len(records)>8 or type(live_pids) is not list or len(live_pids)>2 or len(set(live_pids))!=len(live_pids):
            fail()
        for pid in live_pids:integer(pid)
        seen={}
        for row in records:
            if type(row) is not dict or 'pid' not in row or row['pid'] in seen:
                fail()
            integer(row['pid']);seen[row['pid']]=row
            if row.get('inspectionStatus')=='gone':
                exact(row,['pid','creationFiletime','imageBasename','imagePathSha256','imagePathHashEncoding','confirmedOwnJob','inspectionStatus'])
                if row['pid'] in live_pids or any(row[k] is not None for k in ['creationFiletime','imageBasename','imagePathSha256','confirmedOwnJob']) or row['imagePathHashEncoding']!=ENCODING:
                    fail()
                known_console=self.console is not None and row['pid']==self.console['pid']
                expected_node=node_exit_allowed and self.sealed is not None and row['pid']==self.node['pid']
                if not (known_console or expected_node):
                    fail()
                continue
            value=identity(row)
            if value['pid']==self.node['pid']:
                if value!=self.node:fail()
            elif value['imagePathSha256']==CONSOLE_HASH:
                if self.console is None:
                    if self.sealed is not None:fail()
                    self.console=dict(value)
                elif value!=self.console:fail()
            else:fail()
        for pid in live_pids:
            if pid not in seen or seen[pid]['inspectionStatus']!='confirmed':fail()
        if self.node['pid'] not in live_pids and not node_exit_allowed:fail()
        if node_exit_allowed and self.sealed is None:fail()
        return self.snapshot()
    def snapshot(self):
        return {'schema':'native-console-baseline/v1','node':dict(self.node),'console':None if self.console is None else dict(self.console)}
    def seal(self):
        if self.sealed is not None:fail()
        body=self.snapshot();self.sealed={**body,'baselineHash':digest(body)}
        return json.loads(json.dumps(self.sealed))
def validate_ready(value,freeze_sha,map_hash,node):
    exact(value,['schema','freezeSha256','sourceHashesHash','originalNodePid','originalNodeCreationFiletime','baselineHash'])
    if value!={'schema':'native-console-ready/v1','freezeSha256':freeze_sha,'sourceHashesHash':map_hash,
     'originalNodePid':node['pid'],'originalNodeCreationFiletime':node['creationFiletime'],'baselineHash':'pending'}:fail()
    if type(value['originalNodePid']) is not int:fail()
    return value
def make_ack(ready,ready_sha,freeze_sha,map_hash,baseline):
    validate_ready(ready,freeze_sha,map_hash,baseline['node'])
    body={k:v for k,v in baseline.items() if k!='baselineHash'}
    if baseline['baselineHash']!=digest(body):fail()
    return {'schema':'native-console-ack/v1','readySha256':ready_sha,'freezeSha256':freeze_sha,'sourceHashesHash':map_hash,
     'originalNodePid':baseline['node']['pid'],'originalNodeCreationFiletime':baseline['node']['creationFiletime'],
     'baseline':baseline,'baselineHash':baseline['baselineHash']}
def validate_completion(value,ready_sha,ack_sha,freeze_sha,map_hash,baseline):
    exact(value,['schema','readySha256','ackSha256','freezeSha256','sourceHashesHash','originalNodePid','originalNodeCreationFiletime','baselineHash',
     'noBrowserImport','noModelCalls','noContentRead','noCanonicalWrites'])
    expected={'schema':'native-console-complete/v1','readySha256':ready_sha,'ackSha256':ack_sha,'freezeSha256':freeze_sha,'sourceHashesHash':map_hash,
     'originalNodePid':baseline['node']['pid'],'originalNodeCreationFiletime':baseline['node']['creationFiletime'],'baselineHash':baseline['baselineHash'],
     'noBrowserImport':True,'noModelCalls':True,'noContentRead':True,'noCanonicalWrites':True}
    if any(type(value[k]) is not type(v) or value[k]!=v for k,v in expected.items()):fail()
    return True
