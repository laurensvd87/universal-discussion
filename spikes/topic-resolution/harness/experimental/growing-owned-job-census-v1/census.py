"""Pure ADR157 growing same-Job census. Callbacks are trusted, not authority.

No IO, native calls, global PID lookup, sleep, retry or guardian entry point.
Identity callbacks return projected identities only, never raw executable paths.
"""
import re
import time

ENCODING='win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1'
POLICY_CODES=frozenset({'policy-rejected','policy-unknown-member','policy-node-missing',
    'policy-identity-conflict','policy-late-member','policy-gone-unknown','policy-scope-capacity','baseline-contract'})
CENSUS_CODES=frozenset({'census-deadline','census-capacity','census-round-capacity','census-row-capacity',
    'census-membership-unverifiable','census-open-live-failed','census-job-live-failed',
    'census-identity-live-failed','census-identity-contract','census-identity-changed',
    'census-close-failed','census-handle-alias','census-callback-failed'})|POLICY_CODES

class PolicyFailure(RuntimeError):
    def __init__(self,code):
        self.code=code if type(code) is str and code in POLICY_CODES else 'policy-rejected'
        super().__init__(self.code)

class CensusFailure(RuntimeError):
    def __init__(self,code,rows,cleanup_code=None):
        self.code=code if type(code) is str and code in CENSUS_CODES else 'census-callback-failed'
        self.cleanupCode='census-close-failed' if cleanup_code=='census-close-failed' else None
        self.partialRows=[dict(row) for row in rows[:32]]
        super().__init__(self.code)

def projected_identity(value,pid):
    keys=['pid','creationFiletime','imageBasename','imagePathSha256','imagePathHashEncoding']
    if type(value) is not dict or list(value)!=keys or type(value['pid']) is not int or value['pid']!=pid:
        raise RuntimeError('census-identity-contract')
    creation=value['creationFiletime'];name=value['imageBasename'];digest=value['imagePathSha256']
    if type(creation) is not str or not re.fullmatch('[1-9][0-9]{0,19}',creation) or int(creation)>=(1<<64):
        raise RuntimeError('census-identity-contract')
    if type(name) is not str or not 0<len(name)<=128 or any(ord(c)<32 or ord(c)==127 or c in '/\\' for c in name):
        raise RuntimeError('census-identity-contract')
    if type(digest) is not str or not re.fullmatch('[a-f0-9]{64}',digest) or value['imagePathHashEncoding']!=ENCODING:
        raise RuntimeError('census-identity-contract')
    return dict(value)

def inspect_growing_job(job,*,list_members,open_member,belongs,identity,close_member,validate_row,clock=time.monotonic):
    """Return detached historicalRows/currentRows/livePids/rounds.

    validate_row receives each confirmed identity immediately, plus explicit gone
    records; it owns immutable known-vs-unknown absence/Node-exit policy. Returning
    False rejects. Only PolicyFailure exports its finite policy code. An exception
    or unverifiable still-live member is never retried. All successfully opened
    handles remain held until final coherence, and every one is closed once.
    """
    rows=[];observed=[];handles={};original={};inspected=set();gone=set();result=None;failure=None;until=None
    try:
        def now():
            value=clock()
            if type(value) not in (int,float) or not -float('inf')<value<float('inf'):raise RuntimeError('census-deadline')
            return value
        until=now()+2
        def deadline():
            if now()>=until:raise RuntimeError('census-deadline')
        def fresh():
            deadline()
            try:ids=list_members(job)
            except Exception:raise RuntimeError('census-membership-unverifiable') from None
            deadline()
            if type(ids) is not list or len(ids)>8 or any(type(pid) is not int or not 0<pid<=0xffffffff for pid in ids) or len(set(ids))!=len(ids):
                raise RuntimeError('census-capacity')
            for pid in ids:
                if pid not in observed:
                    if len(observed)>=8:raise RuntimeError('census-capacity')
                    observed.append(pid)
            return list(ids)
        def retain(row):
            if row not in rows:
                if len(rows)>=32:raise RuntimeError('census-row-capacity')
                rows.append(dict(row))
        def policy(row):
            retain(row);deadline()
            try:accepted=validate_row(dict(row))
            except PolicyFailure:raise
            except Exception:raise RuntimeError('policy-rejected') from None
            deadline()
            if accepted is False:raise RuntimeError('policy-rejected')
        def absent(pid):
            row={'pid':pid,'creationFiletime':None,'imageBasename':None,'imagePathSha256':None,
                'imagePathHashEncoding':ENCODING,'confirmedOwnJob':None,'inspectionStatus':'gone'}
            if pid not in gone:policy(row);gone.add(pid)
        def confirm(pid,handle):
            deadline()
            try:
                if belongs(handle,job) is not True:raise RuntimeError('census-job-live-failed')
            except Exception:
                if pid not in fresh():absent(pid);return None
                raise RuntimeError('census-job-live-failed') from None
            try:value=identity(handle)
            except Exception:
                if pid not in fresh():absent(pid);return None
                raise RuntimeError('census-identity-live-failed') from None
            # Malformed projected identity is fatal, even if the process exits.
            value=projected_identity(value,pid);deadline()
            try:
                if belongs(handle,job) is not True:raise RuntimeError('census-job-live-failed')
            except Exception:
                if pid not in fresh():absent(pid);return None
                raise RuntimeError('census-job-live-failed') from None
            row={**value,'confirmedOwnJob':True,'inspectionStatus':'confirmed'}
            # Never permit a transient, inspected unknown to vanish into success.
            policy(row)
            if pid in original and value!=original[pid]:raise RuntimeError('census-identity-changed')
            original[pid]=dict(value)
            return row
        live=fresh()
        for round_number in range(1,10):
            deadline()
            # observed is growing: snapshots during inspection can append entries.
            pending=[pid for pid in observed if pid not in inspected]
            for pid in pending:
                if pid not in fresh():absent(pid);inspected.add(pid);continue
                deadline()
                try:handle=open_member(pid)
                except Exception:
                    if pid not in fresh():absent(pid);inspected.add(pid);continue
                    raise RuntimeError('census-open-live-failed') from None
                if handle is None or handle is False or handle==0:
                    if pid not in fresh():absent(pid);inspected.add(pid);continue
                    raise RuntimeError('census-open-live-failed')
                if any(handle==held for held in handles.values()):raise RuntimeError('census-handle-alias')
                handles[pid]=handle # Held until finally, including policy failure.
                confirm(pid,handle);inspected.add(pid)
            live=fresh()
            if any(pid not in inspected for pid in observed):continue
            current={}
            for pid in live:
                if pid not in handles:raise RuntimeError('census-identity-changed')
                row=confirm(pid,handles[pid])
                if row is not None:current[pid]=row
            final=fresh()
            if any(pid not in inspected for pid in observed):continue
            if any(pid not in current for pid in final):
                # A previously absent PID returning cannot be silently reopened.
                raise RuntimeError('census-identity-changed')
            for pid in observed:
                if pid not in final:absent(pid)
            deadline()
            result={'historicalRows':[dict(row) for row in rows],
                'currentRows':[dict(current[pid]) for pid in final],'livePids':list(final),'rounds':round_number}
            break
        if result is None:raise RuntimeError('census-round-capacity')
    except Exception as error:
        code=error.code if isinstance(error,PolicyFailure) else str(error) if type(error) is RuntimeError and str(error) in CENSUS_CODES else 'census-callback-failed'
        failure=CensusFailure(code,rows)
    finally:
        close_failed=False
        for handle in handles.values():
            try:
                closed=close_member(handle)
                if closed is False or (type(closed) in (int,float) and closed==0):close_failed=True
            except Exception:close_failed=True
        if close_failed:
            failure=CensusFailure(failure.code if failure is not None else 'census-close-failed',rows,'census-close-failed')
        if failure is None and until is not None:
            try:deadline()
            except Exception:failure=CensusFailure('census-deadline',rows)
    if failure is not None:raise failure from None
    return result
