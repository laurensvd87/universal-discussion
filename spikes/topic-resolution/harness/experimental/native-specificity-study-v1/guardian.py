"""ADR179 pure phase guardian. Importing this module performs no IO/native work."""
import hashlib
import json
import math


class GuardianFailure(RuntimeError):
    def __init__(self, code):
        super().__init__('Specificity guardian refused')
        self.code = code


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def record(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        raise GuardianFailure('contract')
    return value


def hash_value(value):
    if type(value) is not str or len(value) != 64 or any(c not in '0123456789abcdef' for c in value):
        raise GuardianFailure('contract')
    return value


def integer(value, maximum):
    if type(value) is not int or not 0 <= value <= maximum:
        raise GuardianFailure('contract')
    return value


def finite(value):
    if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
        raise GuardianFailure('contract')
    return value


def identity(value):
    r = record(value, ('pid', 'creationFileTime', 'imagePathHash', 'pathEncoding'))
    integer(r['pid'], 4294967295)
    if r['pid'] == 0 or type(r['creationFileTime']) is not str or not r['creationFileTime'].isascii() or not r['creationFileTime'].isdigit() or not 1 <= len(r['creationFileTime']) <= 20:
        raise GuardianFailure('identity')
    if r['creationFileTime'][0] == '0' or int(r['creationFileTime']) > 18446744073709551615:
        raise GuardianFailure('identity')
    hash_value(r['imagePathHash'])
    if type(r['pathEncoding']) is not str or r['pathEncoding'] != 'win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1':
        raise GuardianFailure('identity')
    return dict(r)


def decode_request(raw, keys):
    if type(raw) is not bytes or len(raw) > 16384:
        raise GuardianFailure('request')
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise GuardianFailure('request')
            result[key] = value
        return result
    try:
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(GuardianFailure('request')))
        record(value, keys)
        if canonical({k: value[k] for k in keys}) != raw:
            raise GuardianFailure('request')
        return value
    except GuardianFailure:
        raise
    except (ValueError, UnicodeError, RecursionError, TypeError):
        raise GuardianFailure('request') from None


RESOURCE_KEYS = ('cpuSeconds', 'jobMembers', 'rssBytes', 'privateBytes', 'commitBytes',
                 'hostPhysicalFree', 'hostCommitFree', 'cFree', 'dFree', 'batchBytes',
                 'batchEntries', 'studyBytes', 'studyEntries', 'evidenceBytes', 'logBytes', 'resultBytes')
MIB = 1048576


class PhaseGuardian:
    """Trusted capabilities are synchronous and source-authenticated by the owner.

    `members` supplies fresh same-Job identities (not global PID enumeration);
    `census` is the unchanged held-handle <=8-identity census, only at baseline
    membership. `publish` must exclusively publish the supplied canonical bytes.
    The API does not authenticate a capability from matching caller hashes.
    """
    def __init__(self, config, capabilities, *, started_at=None):
        c = record(config, ('phase', 'freezeHash', 'manifestHash', 'nodeIdentityHash',
                            'sourceMapHash', 'batchIds', 'node', 'console'))
        record(capabilities, ('clock', 'resources', 'members', 'census', 'recheck', 'publish'))
        if any(not callable(v) for v in capabilities.values()):
            raise GuardianFailure('contract')
        if type(c['phase']) is not str or c['phase'] not in ('train-cal', 'test'):
            raise GuardianFailure('contract')
        self.phase = c['phase']
        self.count = 24 if self.phase == 'train-cal' else 18
        if type(c['batchIds']) is not list or len(c['batchIds']) != self.count:
            raise GuardianFailure('contract')
        self.batch_ids = tuple(hash_value(v) for v in c['batchIds'])
        if len(set(self.batch_ids)) != self.count:
            raise GuardianFailure('contract')
        self.bindings = {k: hash_value(c[k]) for k in ('freezeHash', 'manifestHash', 'nodeIdentityHash', 'sourceMapHash')}
        self.node = identity(c['node'])
        self.console = None if c['console'] is None else identity(c['console'])
        if self.console is not None and self.console['pid'] == self.node['pid']:
            raise GuardianFailure('identity')
        if digest(self.node) != self.bindings['nodeIdentityHash']:
            raise GuardianFailure('identity')
        self.cap = dict(capabilities)
        self.fault = None
        self.state = 'capture'
        self.index = 0
        self.batch_started = None
        self.batch_cpu = None
        self.model_started = None
        self.model_stage = None
        self.stage_started = None
        self.capture_hash = None
        self.console_gone = False
        self.drain_started = None
        self.request_observation = None
        self._publish_ticket = None
        self._capture_transition_at = None
        self.previous_ack = None
        self.receipts = []
        self.pending = {}
        self.next_ticket = 0
        self.last_time = None
        self.last_cpu = 0
        initial = self._clock()
        self.started = initial if started_at is None else finite(started_at)
        if self.started > initial:
            self._fail('clock-start')
        self.capture_started_cpu = None
        self.check()

    def _fail(self, code):
        if self.fault is None:
            self.fault = code
        raise GuardianFailure(self.fault)

    def _clock(self):
        expected = self._callback_state()
        try:
            value = self.cap['clock']()
            self._callback_fence(expected)
            value = finite(value)
        except Exception:
            self._fail('clock')
        if self.last_time is not None and value < self.last_time:
            self._fail('clock')
        self.last_time = value
        return value

    def _callback_state(self):
        return (self.state, self.index, self.model_started, self.model_stage,
                self.request_observation, self.batch_started, self.previous_ack)

    def _callback_fence(self, expected):
        if self.fault is not None:
            raise GuardianFailure(self.fault)
        if self.state == 'complete':
            self._fail('terminal')
        if self._callback_state() != expected:
            self._fail('callback-state')

    def check(self):
        if self.fault is not None:
            raise GuardianFailure(self.fault)
        if self.state == 'complete':
            self._fail('terminal')
        self._clock()
        expected = self._callback_state()
        try:
            snapshot = self.cap['resources']()
            self._callback_fence(expected)
            r = dict(record(snapshot, RESOURCE_KEYS))
            cpu = finite(r['cpuSeconds'])
            for k in RESOURCE_KEYS[1:]:
                integer(r[k], 2**63 - 1)
        except Exception:
            self._fail('resources')
        now = self._clock()
        if cpu < self.last_cpu:
            self._fail('cpu-regressed')
        self.last_cpu = cpu
        active = 9420 if self.phase == 'train-cal' else 7005
        if now - self.started >= active:
            self._fail('phase-deadline')
        if cpu > (1920 if self.phase == 'train-cal' else 1395):
            self._fail('phase-cpu')
        if self.capture_started_cpu is not None and self.model_started is None and cpu - self.capture_started_cpu > self.count * 60:
            self._fail('capture-cpu')
        capture_time = now if self._capture_transition_at is None else self._capture_transition_at
        if self.model_started is None and capture_time - self.started >= self.count * 360:
            self._fail('capture-deadline')
        if self.drain_started is not None and now - self.drain_started >= 15:
            self._fail('drain-deadline')
        if self.batch_started is not None:
            if now - self.batch_started >= 360:
                self._fail('batch-deadline')
            if cpu - self.batch_cpu > 60:
                self._fail('batch-cpu')
        if self.model_started is not None:
            total = 780 if self.phase == 'train-cal' else 525
            if now - self.model_started >= total:
                self._fail('model-deadline')
            stage_limit = {'encoding': 540 if self.phase == 'train-cal' else 405,
                           'fitting': 180, 'assessment': 60, 'checks': 60}[self.model_stage]
            if now - self.stage_started >= stage_limit:
                self._fail('model-stage-deadline')
        if r['jobMembers'] > 128 or max(r['rssBytes'], r['privateBytes'], r['commitBytes']) > 1536 * MIB:
            self._fail('memory')
        if min(r['hostPhysicalFree'], r['hostCommitFree']) < 1024 * MIB or r['cFree'] < 2048 * MIB or r['dFree'] < 4096 * MIB:
            self._fail('headroom')
        if r['batchBytes'] > 512 * MIB or r['batchEntries'] > 8192 or r['studyBytes'] > 8192 * MIB or r['studyEntries'] > 344064:
            self._fail('disk')
        if r['evidenceBytes'] > 32 * MIB or r['logBytes'] > MIB or r['resultBytes'] > 512 * 1024:
            self._fail('evidence')
        return {'observedAt': now, 'cpuSeconds': cpu}

    def start_operation(self, label):
        self.check()
        if label not in ('members', 'census', 'recheck', 'publish', 'native') or len(self.pending) >= 128:
            self._fail('operation')
        self.next_ticket += 1
        self.pending[self.next_ticket] = label
        return self.next_ticket

    def settle_operation(self, ticket):
        # Called only when the ORIGINAL physically settles, even after a fault.
        if type(ticket) is not int or ticket not in self.pending:
            self._fail('operation')
        del self.pending[ticket]
        return self.check()

    def _io(self, label, *args):
        if label == 'publish' and self._publish_ticket is not None:
            self._fail('publish-reentry')
        ticket = self.start_operation(label)
        if label == 'publish':
            self._publish_ticket = ticket
        try:
            value = self.cap[label](*args)
        except Exception:
            del self.pending[ticket]  # synchronous throw is physical settlement
            if label == 'publish':
                self._publish_ticket = None
            self._fail('io-' + label)
        if type(value) not in (dict, list, bytes, str, bool, int, float, type(None)):
            # No then/await/descriptor hooks. Refused async/unsafe originals
            # remain charged; the outer owner must track/settle them.
            self._fail('async-capability')
        try:
            self.settle_operation(ticket)
        finally:
            if label == 'publish':
                self._publish_ticket = None
        return value

    def begin_batch(self, batch_id):
        self.check()
        if self.state != 'capture' or self.batch_started is not None or self.request_observation is not None or self.pending or self.index >= self.count or batch_id != self.batch_ids[self.index]:
            self._fail('batch-order')
        self.batch_started = self._clock()
        self.batch_cpu = self.last_cpu
        if self.capture_started_cpu is None:
            self.capture_started_cpu = self.last_cpu

    def _baseline(self):
        expected = [self.node] + ([] if self.console is None else [self.console])
        rows = self._io('members')
        if type(rows) is not list or len(rows) > 8:
            self._fail('membership')
        try:
            rows = [identity(r) for r in rows]
        except GuardianFailure:
            self._fail('identity')
        # Console may disappear; its first exact identity can never be replaced.
        if len({r['pid'] for r in rows}) != len(rows) or self.node not in rows or any(r not in expected for r in rows):
            self._fail('identity')
        if self.console is not None:
            if self.console in rows and self.console_gone:
                self._fail('identity')
            if self.console not in rows:
                self.console_gone = True
        census = self._io('census')
        if type(census) is not list or len(census) > 8:
            self._fail('census')
        try:
            census = [identity(r) for r in census]
        except GuardianFailure:
            self._fail('census')
        if len({r['pid'] for r in census}) != len(census) or sorted(census, key=lambda r: r['pid']) != sorted(rows, key=lambda r: r['pid']):
            self._fail('census')

    def _barrier(self, request, kind, observed):
        if self.pending:
            self._fail('pending')
        self._baseline()
        if self._io('recheck', dict(self.bindings)) is not True:
            self._fail('source-stage')
        self._baseline()  # IO may have allowed console replacement/late member
        self.check()
        if self.pending:
            self._fail('pending')
        body = {'schema': 'native-specificity-' + kind + '-ack/v1', **self.bindings,
                'phase': self.phase, 'requestHash': hashlib.sha256(request).hexdigest(),
                'previousAckHash': self.previous_ack, 'observedAt': observed}
        raw = canonical(body)
        # Trusted publisher calls this immediately before its exclusive link,
        # AFTER its pending write/close; never accepts a count-only boolean.
        called = [False]
        def before_publish():
            if called[0]:
                self._fail('publish-reentry')
            called[0] = True
            self._baseline()
            self.check()
            if self._publish_ticket is None or self.pending != {self._publish_ticket: 'publish'}:
                self._fail('pending')
        value = self._io('publish', kind, raw, before_publish)
        if self.pending:
            self._fail('pending')
        if not called[0] or value != hashlib.sha256(raw).hexdigest():
            self._fail('publication')
        self.previous_ack = hashlib.sha256(raw).hexdigest()
        self.drain_started = None
        self.request_observation = None
        return raw

    def observe_request(self, kind):
        """FIRST complete-path observation, BEFORE request read/residual polling.

        No browser identities are admitted here. The outer native owner may
        poll its known residual Job PID subset under this existing local lease.
        """
        if self.fault is not None:
            raise GuardianFailure(self.fault)
        observed = self._clock()
        if type(kind) is not str or kind not in ('batch-drain', 'cohort-drain') or self.request_observation is not None or self.state != 'capture':
            self._fail('request-observation')
        if kind == 'batch-drain':
            if self.batch_started is None or self.index >= self.count:
                self._fail('request-observation')
        elif self.index != self.count or self.batch_started is not None or self.model_started is not None:
            self._fail('request-observation')
        if kind == 'cohort-drain':
            # Capture cutoff belongs to FIRST observation, not later ACK IO.
            # Sample CPU freshly before transition; no stale CPU bypass.
            self._capture_transition_at = observed
            try:
                self.check()
            finally:
                self._capture_transition_at = None
        self.request_observation = (kind, self.index, observed)
        self.drain_started = observed
        if kind == 'cohort-drain':
            self.model_started = observed
            self.model_stage = 'encoding'
            self.stage_started = observed
        self.check()
        return observed

    def _observed(self, kind):
        self.check()
        if self.request_observation is None or self.request_observation[:2] != (kind, self.index):
            self._fail('request-observation')
        return self.request_observation[2]

    def batch_barrier(self, raw):
        observed = self._observed('batch-drain')
        keys = ('schema', 'freezeHash', 'manifestHash', 'nodeIdentityHash', 'sourceMapHash',
                'phase', 'batchId', 'batchIndex', 'batchCaptureHash', 'captureSummaryHash', 'previousAckHash')
        try:
            r = decode_request(raw, keys)
            hash_value(r['batchCaptureHash']); hash_value(r['captureSummaryHash'])
        except GuardianFailure:
            self._fail('request')
        if self.state != 'capture' or self.batch_started is None or r['schema'] != 'native-specificity-batch-drain-request/v1' or r['phase'] != self.phase or any(r[k] != v for k, v in self.bindings.items()) or r['batchId'] != self.batch_ids[self.index] or type(r['batchIndex']) is not int or r['batchIndex'] != self.index + 1 or r['previousAckHash'] != self.previous_ack:
            self._fail('batch-request')
        ack = self._barrier(raw, 'batch-drain', observed)
        self.receipts.append(self.previous_ack)
        self.index += 1
        self.batch_started = None
        self.batch_cpu = None
        return ack

    def cohort_barrier(self, raw):
        observed = self._observed('cohort-drain')
        keys = ('schema', 'freezeHash', 'manifestHash', 'nodeIdentityHash', 'sourceMapHash',
                'phase', 'accounted', 'captureHash', 'batchReceiptHashes', 'previousAckHash')
        try:
            r = decode_request(raw, keys); hash_value(r['captureHash'])
        except GuardianFailure:
            self._fail('request')
        if self.state != 'capture' or self.index != self.count or self.batch_started is not None or r['schema'] != 'native-specificity-cohort-drain-request/v1' or r['phase'] != self.phase or any(r[k] != v for k, v in self.bindings.items()) or type(r['accounted']) is not int or r['accounted'] != self.count * 4 or r['batchReceiptHashes'] != self.receipts or r['previousAckHash'] != self.previous_ack:
            self._fail('cohort-request')
        ack = self._barrier(raw, 'cohort-drain', observed)
        self.capture_hash = r['captureHash']
        self.state = 'model'
        return ack

    def advance_model(self, stage):
        observed = self._clock()  # FIRST stage-path observation, before resource IO
        self.check()
        order = ['encoding', 'fitting' if self.phase == 'train-cal' else 'assessment', 'checks']
        if self.state != 'model' or self.pending or self.model_stage not in order or order.index(self.model_stage) + 1 >= len(order) or stage != order[order.index(self.model_stage) + 1]:
            self._fail('model-order')
        self.model_stage = stage
        self.stage_started = observed
        self.check()

    def complete(self):
        self.check()
        if self.state != 'model' or self.model_stage != 'checks' or self.pending:
            self._fail('completion')
        self._baseline()
        if self._io('recheck', dict(self.bindings)) is not True:
            self._fail('source-stage')
        self._baseline()
        self.check()
        if self.pending:
            self._fail('pending')
        self.state = 'complete'
        return {'phase': self.phase, 'captureHash': self.capture_hash, 'batchReceiptHashes': list(self.receipts),
                'finalAckHash': self.previous_ack, 'cpuSeconds': self.last_cpu, 'pending': 0}

    def fail(self, code='owner-failure'):
        if code not in ('owner-failure', 'physical-unsettled', 'normal-drain-failed'):
            code = 'owner-failure'
        self._fail(code)
