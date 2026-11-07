"""Pure maintained-supervisor budget tests: no native API, process or deletion."""
import ast
import hashlib
from pathlib import Path
import types
import unittest

HERE = Path(__file__).resolve().parent
OLD = HERE.parent/'native-hierarchy-postgres-v2'/'supervise.py'
CURRENT = HERE/'hierarchy-native-supervisor.py'
OLD_SHA = '2ccaf30294cd0edc87e126aeb152ca76a100e2cc289f2dc5f652241f33cae334'
S = types.ModuleType('_maintained_budget_test')
S.__file__ = str(CURRENT)
exec(compile(CURRENT.read_bytes(), str(CURRENT), 'exec'), S.__dict__)


def resources(free=4096*S.MIB, peak=0, cpu=0):
    return {'physicalFree': free, 'commitFree': free, 'cFree': 2048*S.MIB,
            'dFree': 4096*S.MIB, 'cpu': cpu, 'committed': peak,
            'accounting': {'totalProcesses': 1, 'activeProcesses': 0,
                           'totalTerminatedProcesses': 1,
                           'user100ns': int(cpu*10000000), 'kernel100ns': 0}}


class Boundary:
    def __init__(self, memory=1024*S.MIB):
        self.row = {k: False for k in S.SNAPSHOT_KEYS}
        self.row.update(exitCode=None, stdoutBytes=0, stderrBytes=0,
                        limits={'flags': 0x2208, 'activeProcessLimit': 32,
                                'jobMemoryBytes': memory})
        self.resources = resources()
        self.snapshot_calls = self.terminations = 0

    def snapshot(self):
        self.snapshot_calls += 1
        return dict(self.row, limits=dict(self.row['limits']))

    def sample(self): return self.resources
    def initialize(self, guard): self.row['initialized'] = True; guard()
    def launch_suspended(self, guard): self.row['processCreated'] = True; guard()
    def assign_and_resume(self, guard):
        self.row.update(assigned=True, membershipVerified=True, resumed=True); guard()
    def poll_exit(self): self.row.update(exited=True, exitCode=0, stdoutEof=True, stderrEof=True)
    def read_available(self, stream): return {'data': b'', 'eof': True}
    def normal_retirement_ready(self): return self.row['exited']
    def terminate_owned(self): self.terminations += 1; self.poll_exit(); self.row['emergency'] = True
    def close(self): self.row.update(completeEmptyJob=True, allHandlesClosed=True); return self.snapshot()


def controller(boundary=None, host=None, **options):
    boundary = boundary or Boundary()
    return S.Controller(authenticate=lambda: None, end_pins=lambda: None,
        host_sample=host or (lambda: resources()), boundary_factory=lambda: boundary,
        validate=lambda *args: {'schema': 'native-hierarchy-postgres-json-report/v2',
            'accepted': True, 'code': 'complete', 'stdoutBytes': 0, 'stderrBytes': 0,
            'stdoutSha256': 'a'*64, 'stderrSha256': 'b'*64, 'testPoints': 25, 'outerTests': 3},
        clock=lambda: 0, pause=lambda seconds: None, **options)


class BudgetTests(unittest.TestCase):
    def test_full_data_active_normal_absolute_epochs_are_exact_and_finite(self):
        for limit in (600,620,630):
            c=controller();c.clock=lambda:limit-0.001
            self.assertEqual(c.now(limit),limit-0.001)
            c.clock=lambda:limit
            with self.assertRaises(S.Refusal) as raised:c.now(limit)
            self.assertEqual(raised.exception.metadata,{'code':'deadline','counter':'epochSeconds','value':limit})
        c=controller();c.clock=lambda:599.999;c.guard()
        c.clock=lambda:600
        with self.assertRaises(S.Refusal):c.guard()
        c=controller();c.clock=lambda:629.999;c.now()
        c.clock=lambda:630
        with self.assertRaises(S.Refusal):c.now()

    def test_exit_after_active_epoch_cannot_renew_the_original_deadline(self):
        for observed,accepted in ((599,True),(600,False)):
            boundary=Boundary();c=controller(boundary);epoch=[0]
            c.clock=lambda:epoch[0]
            original_poll=boundary.poll_exit
            def poll():epoch[0]=observed;original_poll()
            boundary.poll_exit=poll
            result=c.run();self.assertEqual(result['accepted'],accepted,result)
            if accepted:
                self.assertEqual(c.normal_deadline,619)
                self.assertEqual(boundary.terminations,0)
            else:
                self.assertIsNone(c.normal_deadline)
                self.assertEqual(result['primary']['code'],'deadline')

    def test_poll_cap_remains_bounded_by_new_absolute_epoch(self):
        c=controller();c.ticks=62999;c.wait_tick();self.assertEqual(c.ticks,63000)
        with self.assertRaises(S.Refusal):c.wait_tick()

    def test_complete_byte_and_ast_inverse_to_pinned_predecessor(self):
        raw = OLD.read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), OLD_SHA)
        source = CURRENT.read_bytes().decode('utf-8')
        source = source.replace("HERE = Path(__file__).resolve().parent.parent / 'native-hierarchy-postgres-v2'", "HERE = Path(__file__).resolve().parent / 'native-hierarchy-postgres-v2'")
        start=source.index('class Controller:');end=source.index('\nclass ',start+10)
        part=source[start:end]
        for current,previous in [('63000','39000'),('630','390'),('620','380'),('600','360')]:part=part.replace(current,previous)
        source=source[:start]+part+source[end:]
        source = source.replace("# Maintained copy: frozen inventory/default output remain at the fixed predecessor.\n# Only the closed Job-memory budget is parameterized; no public CLI selector.\nHERE = Path(__file__).resolve().parent / 'native-hierarchy-postgres-v2'", 'HERE = Path(__file__).resolve().parent')
        check = "    require(type(job_memory_bytes) is int and job_memory_bytes in (1024*MIB, 2048*MIB), 'job-memory-budget')\n"
        self.assertEqual(source.count(check), 2)
        source = source.replace('def checked_snapshot(boundary, job_memory_bytes=1024*MIB):\n'+check,
                                'def checked_snapshot(boundary):\n')
        source = source.replace("'jobMemoryBytes': job_memory_bytes}", "'jobMemoryBytes': 1024*MIB}")
        source = source.replace('validate, clock, pause, workspace_check=lambda: None, started_at=None,\n                 job_memory_bytes=1024*MIB):\n    '+check+'        self.job_memory_bytes = job_memory_bytes\n',
                                'validate, clock, pause, workspace_check=lambda: None, started_at=None):\n')
        self.assertEqual(source.count('checked_snapshot(self.boundary, self.job_memory_bytes)'), 7)
        source = source.replace('checked_snapshot(self.boundary, self.job_memory_bytes)', 'checked_snapshot(self.boundary)')
        self.assertEqual(source.count('(self.job_memory_bytes + 1120*MIB if startup else 1024*MIB)'), 2)
        source = source.replace('(self.job_memory_bytes + 1120*MIB if startup else 1024*MIB)', '(2144 if startup else 1024)*MIB')
        source = source.replace("require(peak <= self.job_memory_bytes, 'resource-limit'", "require(peak <= 1024*MIB, 'resource-limit'")
        self.assertEqual(source.encode('utf-8'), raw)
        self.assertEqual(ast.dump(ast.parse(source)), ast.dump(ast.parse(raw)))
        self.assertEqual(S.HERE, OLD.parent)

    def test_strict_closed_budget_before_snapshot_or_constructor_clock(self):
        for value in (True, False, None, '2147483648', 2147483648.0, 0, 512*S.MIB, 3*1024*S.MIB):
            boundary = Boundary()
            with self.assertRaises(S.Refusal): S.checked_snapshot(boundary, value)
            self.assertEqual(boundary.snapshot_calls, 0)
            with self.assertRaises(S.Refusal): controller(job_memory_bytes=value)

    def test_snapshot_requires_exact_real_readback_for_selected_budget(self):
        for memory in (1024*S.MIB, 2048*S.MIB):
            boundary = Boundary(memory)
            self.assertEqual(S.checked_snapshot(boundary, memory)['limits']['jobMemoryBytes'], memory)
            with self.assertRaises(S.Refusal): S.checked_snapshot(boundary, 3072*S.MIB-memory)
            boundary.row['limits']['jobMemoryBytes'] = float(memory)
            with self.assertRaises(S.Refusal): S.checked_snapshot(boundary, memory)
        self.assertEqual(S.checked_snapshot(Boundary())['limits']['jobMemoryBytes'], 1024*S.MIB)

    def test_startup_margin_default2144_and_feature3168_ongoing_floors_unchanged(self):
        for budget, admission in ((1024*S.MIB, 2144*S.MIB), (2048*S.MIB, 3168*S.MIB)):
            host = resources(admission)
            c = controller(job_memory_bytes=budget, host=lambda: host)
            c.host(startup=True)
            for key in ('physicalFree', 'commitFree'):
                host[key] = admission-1
                with self.assertRaises(S.Refusal): c.host(startup=True)
                host[key] = admission
            host.update(physicalFree=1024*S.MIB, commitFree=1024*S.MIB)
            c.host()
            for key, floor in (('physicalFree',1024*S.MIB),('commitFree',1024*S.MIB),('cFree',2048*S.MIB),('dFree',4096*S.MIB)):
                host[key] = floor-1
                with self.assertRaises(S.Refusal): c.host()
                host[key] = floor

    def test_peak_and_cpu_limits_preserve_exact_observed_counters(self):
        for budget in (1024*S.MIB, 2048*S.MIB):
            boundary = Boundary(budget)
            c = controller(boundary, job_memory_bytes=budget); c.boundary = boundary
            boundary.resources = resources(peak=budget, cpu=60); c.job()
            self.assertEqual(c.last_peak, budget)
            boundary.resources['committed'] = budget+1
            with self.assertRaises(S.Refusal): c.job()
            fresh = controller(boundary, job_memory_bytes=budget); fresh.boundary = boundary
            boundary.resources = resources(peak=0, cpu=61)
            with self.assertRaises(S.Refusal): fresh.job()

    def test_full_fake_success_default_and_feature_have_same_cleanup_and_completion(self):
        for budget in (1024*S.MIB, 2048*S.MIB):
            boundary = Boundary(budget)
            result = controller(boundary, job_memory_bytes=budget).run()
            self.assertTrue(result['accepted'], result)
            self.assertEqual(result['cleanupClassification'], 'verified-normal')
            self.assertEqual(result['native']['limits']['jobMemoryBytes'], budget)
            self.assertTrue(result['endPinsChecked'])
            self.assertEqual(result['completion']['testPoints'], 25)
            self.assertEqual(boundary.terminations, 0)

    def test_feature_admission_refusal_does_not_construct_native_boundary(self):
        events = []
        c = controller(host=lambda: resources(3168*S.MIB-1), job_memory_bytes=2048*S.MIB)
        c.boundary_factory = lambda: events.append('FORBIDDEN')
        result = c.run()
        self.assertFalse(result['accepted']); self.assertEqual(events, [])
        self.assertEqual(result['primary']['code'], 'resource-floor')

    def test_unrelated_functions_classes_and_main_have_identical_ast(self):
        old = ast.parse(OLD.read_bytes()); new = ast.parse(CURRENT.read_bytes())
        select = lambda tree: {n.name: ast.dump(n) for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name not in ('Controller','checked_snapshot')}
        self.assertEqual(select(old), select(new))


if __name__ == '__main__': unittest.main()
