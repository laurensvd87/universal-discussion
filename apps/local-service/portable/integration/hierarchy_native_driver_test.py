"""Pure maintained-driver checks. No WinAPI, Job, child or database operations."""
import ast
import contextlib
import ctypes
import io
from pathlib import Path
import types
import unittest

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

    def test_invalid_cli_is_inert(self):
        for args in (None, [], ['x'], ['A'*64], ['a'*64, 'extra'], 'a'*64):
            # Avoid default argv; None here would select the unittest CLI.
            if args is None:
                continue
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(D.main(args), 2)

    def test_only_native_launch_method_changes(self):
        normal = D.native_api_type(self.W)
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
            self.assertEqual(values['TEMP'], str(D.TEMP))
            self.assertEqual(values['TMP'], str(D.TEMP))
            self.assertEqual(values['PATH'], 'D:\\PostgreSQL\\17\\bin;C:\\Windows\\System32;C:\\Windows')
            info._obj.process, info._obj.thread, info._obj.pid = 111, 222, 333
            return True
        api = object.__new__(D.native_api_type(self.W))
        api.m, api.k = self.B, types.SimpleNamespace(CreateProcessW=create_process)
        self.assertEqual(api.create_process((ctypes.create_string_buffer(16), None), 11, 12, 13), (111, 222, 333))
        self.assertEqual(len(seen), 1)

    def test_normal_paths_and_construction_do_not_adopt_or_create_old_output(self):
        old = HERE / 'native-hierarchy-postgres-v2'
        publisher = D.publisher_type(self.S, self.I)()
        tree = D.cluster_tree_type(self.S, self.I)()
        self.assertEqual(publisher.root, D.OUTPUT)
        self.assertEqual(tree.parent, D.CLUSTER_PARENT)
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
        self.assertEqual(len(D.NORMAL_KEYS), 10)
        self.assertEqual(maintained-base, D.NORMAL_KEYS)
        self.assertEqual(len(maintained), 2348)
        self.assertTrue(all((D.REPO/key).is_file() for key in D.NORMAL_KEYS))


if __name__ == '__main__':
    unittest.main()
