"""Pure maintained-driver checks. No WinAPI, Job, child or database operations."""
import ast
import contextlib
import ctypes
import hashlib
import io
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
source = HERE / 'hierarchy-native-driver.py'
D = types.ModuleType('_hierarchy_driver_test_subject')
D.__file__ = str(source)
exec(compile(source.read_bytes(), str(source), 'exec'), D.__dict__)


class MaintainedDriverTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.S = D.load_pinned('supervisor')
        cls.I = cls.S.I
        cls.W = D.load_pinned('windows')
        cls.B = D.load_pinned('baseline')
        root = D.RUNS_ROOT/('run-'+'a'*48)
        cls.owned_paths = types.SimpleNamespace(output=root/'output', cluster=root/'cluster')

    def test_invalid_cli_is_inert(self):
        for args in (None, [], ['x'], ['A'*64], ['a'*64, 'extra'], 'a'*64):
            # Avoid default argv; None here would select the unittest CLI.
            if args is None:
                continue
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(D.main(args), 2)

    def test_only_native_launch_method_changes(self):
        normal = D.native_api_type(self.W, self.owned_paths)
        methods = {name for name, value in vars(normal).items() if callable(value)}
        self.assertEqual(methods, {'create_process'})
        old = ast.parse((HERE/'native-hierarchy-postgres-v2/windows.py').read_bytes())
        new = ast.parse(source.read_bytes())
        find = lambda tree: next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == 'create_process')
        self.assertEqual(ast.dump(find(old), include_attributes=False), ast.dump(find(new), include_attributes=False))
        self.assertIs(normal.set_limits, self.W._WinAPI.set_limits)
        self.assertIs(normal.attributes, self.W._WinAPI.attributes)
        self.assertIs(normal.members, self.W._WinAPI.members)

    def test_fixed_launch_keeps_suspended_flags_stdio_and_scrubbed_environment(self):
        seen = []
        def create_process(executable, command, process_security, thread_security,
                           inherit, flags, environment, cwd, startup, info):
            seen.append(True)
            self.assertEqual(executable, D.NODE)
            self.assertEqual(command.value, '"'+D.NODE+'" --max-old-space-size=64 "'+str(D.REPO/D.ENTRY)+'"')
            self.assertIsNone(process_security)
            self.assertIsNone(thread_security)
            self.assertIs(inherit, True)
            self.assertEqual(flags, 0x8040C)
            self.assertEqual(cwd, str(D.REPO))
            self.assertEqual((startup.contents.stdin, startup.contents.stdout, startup.contents.stderr), (11, 12, 13))
            self.assertEqual(startup.contents.cb, 112)
            self.assertEqual(startup.contents.flags, 0x101)
            values = dict(item.split('=', 1) for item in environment[:].split('\0') if item)
            self.assertEqual(set(values), {'OMP_NUM_THREADS','PATH','SystemRoot','TEMP','TMP','UV_THREADPOOL_SIZE','WINDIR'})
            self.assertEqual(values['TEMP'], str(self.owned_paths.output/'temp'))
            self.assertEqual(values['TMP'], str(self.owned_paths.output/'temp'))
            self.assertEqual(values['PATH'], 'D:\\PostgreSQL\\17\\bin;C:\\Windows\\System32;C:\\Windows')
            info._obj.process, info._obj.thread, info._obj.pid = 111, 222, 333
            return True
        api = object.__new__(D.native_api_type(self.W, self.owned_paths))
        api.m, api.k = self.B, types.SimpleNamespace(CreateProcessW=create_process)
        self.assertEqual(api.create_process((ctypes.create_string_buffer(16), None), 11, 12, 13), (111, 222, 333))
        self.assertEqual(len(seen), 1)

    def test_normal_paths_and_construction_do_not_adopt_or_create_old_output(self):
        old = HERE / 'native-hierarchy-postgres-v2'
        publisher = D.publisher_type(self.S, self.I, self.owned_paths)()
        tree = D.cluster_tree_type(self.S, self.I, self.owned_paths)()
        self.assertEqual(publisher.root, self.owned_paths.output)
        self.assertEqual(tree.parent, self.owned_paths.cluster)
        self.assertNotEqual(publisher.root, old/'output')
        self.assertNotEqual(tree.parent.name, 'native-hierarchy-postgres-v2')
        self.assertFalse(publisher.prepared)
        self.assertFalse(tree.prepared)

    def test_cluster_guard_is_unchanged_except_owned_prefix_and_marker(self):
        old = ast.parse((HERE/'native-hierarchy-postgres-v2/supervise.py').read_bytes())
        new = ast.parse(source.read_bytes())
        def guard(tree):
            cls = next(n for n in ast.walk(tree) if isinstance(n, ast.ClassDef) and n.name == 'ClusterTree')
            return next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'check')
        class Inverse(ast.NodeTransformer):
            def visit_Constant(self, node):
                if node.value == 'nhpg-[A-Za-z0-9]{1,64}':
                    node.value = 'nhpg2-[A-Za-z0-9]{1,64}'
                elif node.value == 'native-hierarchy-postgres/maintained':
                    node.value = 'native-hierarchy-postgres/v2'
                return node
        self.assertEqual(ast.dump(guard(old), include_attributes=False), ast.dump(Inverse().visit(guard(new)), include_attributes=False))

    def test_catalog_adds_exact_normal_sources_to_original_closed_inventory(self):
        base = self.I.FileCatalog('a'*64)._inventory()
        maintained = D.catalog_type(self.I)('a'*64)._inventory()
        self.assertEqual(len(base), 2338)
        self.assertEqual(len(D.NORMAL_KEYS), 12)
        self.assertEqual(maintained-base, D.NORMAL_KEYS)
        self.assertEqual(len(maintained), 2350)
        self.assertTrue(all((D.REPO/key).is_file() for key in D.NORMAL_KEYS))

    def test_finite_native_error_is_retained_without_altering_first_failure(self):
        def controller(cls):
            value = object.__new__(cls)
            value.primary = value.cleanup = None
            return value
        original = controller(self.S.Controller)
        repaired = controller(D.diagnostic_controller_type(self.S, self.W))
        original.remember(self.W.BoundaryFailure('job-members'), fallback='execution-failure')
        repaired.remember(self.W.BoundaryFailure('job-members'), fallback='execution-failure')
        self.assertEqual(original.primary['code'], 'execution-failure')
        self.assertEqual(repaired.primary['code'], 'native-job-members')
        repaired.remember(self.I.Refusal('later-primary'))
        self.assertEqual(repaired.primary['code'], 'native-job-members')
        repaired.remember(self.W.BoundaryFailure('pipe-read'), cleanup=True)
        self.assertEqual(repaired.cleanup['code'], 'native-pipe-read')
        repaired.remember(self.I.Refusal('later-cleanup'), cleanup=True)
        self.assertEqual(repaired.cleanup['code'], 'native-pipe-read')

    def test_only_exact_allowlisted_exceptions_are_inspected(self):
        calls = []
        class Unknown(Exception):
            @property
            def code(self):
                calls.append(True)
                raise AssertionError('must not inspect')
        class Derived(self.W.BoundaryFailure):
            pass
        cls = D.diagnostic_controller_type(self.S, self.W)
        for error in [Unknown(), Derived('job-members'), self.W.BoundaryFailure('secret/unknown'), None, False, 0]:
            value = object.__new__(cls)
            value.primary = value.cleanup = None
            value.remember(error, fallback='execution-failure')
            self.assertEqual(value.primary['code'], 'execution-failure')
        self.assertEqual(calls, [])
        value = object.__new__(cls)
        value.primary = value.cleanup = None
        value.remember(self.I.Refusal('resource-floor', 'commitFree', 0))
        value.remember(self.W.BoundaryFailure('pipe-read'))
        self.assertEqual(value.primary, {'code':'resource-floor','counter':'commitFree','value':0})

    def _owned_run_test(self, callback):
        base = (D.REPO/'apps/local-service/data').resolve()
        with tempfile.TemporaryDirectory(dir=base, prefix='hierarchy-run-fs-') as generated:
            # Validate the automatic recursive cleanup target before the context
            # can exit. Only this newly created test directory may be removed.
            generated = Path(generated).resolve()
            self.assertTrue(generated.is_relative_to(base))
            self.assertTrue(generated.name.startswith('hierarchy-run-fs-'))
            with patch.object(D, 'RUNS_ROOT', generated/'runs'):
                run = D.OwnedRun(self.I)
                raw = b'{"synthetic":"filesystem-only"}\n'
                run.prepare(raw, hashlib.sha256(raw).hexdigest())
                callback(run)

    def test_owned_control_handles_partial_claim_then_exact_original_child(self):
        def check(run):
            pending = run.root/'child.pending'
            pending.touch(exist_ok=False)
            run.check(1234)
            pending.write_bytes(b'{')
            run.check(1234)
            claim = self.I.canonical_json({'schema':'hierarchy-native-child-claim',
                'nonce':run.nonce,'catalogSha256':hashlib.sha256(run.catalog).hexdigest(),
                'markerSha256':hashlib.sha256(run.marker).hexdigest(),'pid':1234})
            pending.write_bytes(claim)
            os.link(pending,run.root/'child.claim')
            run.check(1234)
            with self.assertRaises(self.I.Refusal):
                run.check(4321)
            run.check(1234)
        self._owned_run_test(check)

    def test_owned_control_rejects_changed_snapshot_without_replacing_it(self):
        def check(run):
            (run.root/'reviewed-sources.json').write_bytes(b'{"synthetic":"changed"}\n')
            with self.assertRaises(self.I.Refusal):
                run.check()
        self._owned_run_test(check)

    def test_legal_claim_publication_does_not_depend_on_atomic_directory_enumeration(self):
        def check(run):
            claim = self.I.canonical_json({'schema':'hierarchy-native-child-claim',
                'nonce':run.nonce,'catalogSha256':hashlib.sha256(run.catalog).hexdigest(),
                'markerSha256':hashlib.sha256(run.marker).hexdigest(),'pid':1234})
            (run.root/'child.pending').write_bytes(claim)
            os.link(run.root/'child.pending',run.root/'child.claim')
            run.check(1234)
            original = os.scandir
            @contextlib.contextmanager
            def incomplete_listing(path):
                with original(path) as entries:
                    yield (entry for entry in entries if entry.name not in {'child.pending','child.claim'})
            with patch.object(D.os, 'scandir', incomplete_listing):
                run.check(1234)
        self._owned_run_test(check)

    def test_owned_control_refuses_disappearing_attempt_and_unknown_entries(self):
        def check(run):
            pending = run.root/'child.pending'
            pending.touch(exist_ok=False)
            run.check()
            pending.unlink()
            with self.assertRaises(self.I.Refusal):
                run.check()
            # A new fresh run, not a repaired/reused attempt.
            other = D.OwnedRun(self.I)
            other.prepare(run.catalog, hashlib.sha256(run.catalog).hexdigest())
            (other.root/'unexpected').touch()
            with self.assertRaises(self.I.Refusal):
                other.check()
        self._owned_run_test(check)


if __name__ == '__main__':
    unittest.main()
