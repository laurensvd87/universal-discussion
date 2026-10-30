"""New allocation boundaries, ordinary disposable workspace files/fake metadata.
No WinAPI/DLL loading, archive reads, child processes or PostgreSQL work.
"""
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

SOURCE=Path(__file__).with_name('hierarchy-native-driver.py')
D=types.ModuleType('_compressed_driver_test')
D.__file__=str(SOURCE)
exec(compile(SOURCE.read_bytes(),str(SOURCE),'exec'),D.__dict__)
S=D.load_pinned('supervisor')
I=S.I


class Reader:
    def __init__(self,logical=1,allocated=1,missing=False):
        self.logical,self.allocated,self.missing=logical,allocated,missing
        self.names=[]
        self.closed_checks=0

    def observe_file(self,path):
        self.names.append(path)
        if self.missing:raise FileNotFoundError()
        return {'logicalBytes':self.logical,'allocatedBytes':self.allocated}

    def settled(self):
        self.closed_checks+=1
        return True


class CompressedDriverTest(unittest.TestCase):
    def test_actual_storage_modules_authenticate_the_new_namespace_before_native_use(self):
        storage=D.load_pinned('storage-native')
        self.assertEqual(Path(storage.PRIVATE_ROOT),D.PRIVATE_RUNS_ROOT)
        self.assertTrue(D.load_pinned('storage-policy').__file__.startswith(str(SOURCE.parent)))

    def test_real_owned_run_purpose_requires_the_allocated_wrapper_before_any_write(self):
        run=D.OwnedRun(I,private=True,http=True,automatic18=True,browser=True)
        self.assertTrue(run.compressed_owner)
        self.assertIsNone(run.storage_reader)
        self.assertEqual(run.runs_root,D.PRIVATE_RUNS_ROOT)
        with self.assertRaises(I.Refusal):D.cluster_tree_type(S,I,run)
        run.storage_reader=Reader()
        self.assertEqual(type(D.cluster_tree_type(S,I,run)()).__name__,'CompressedClusterTree')
        ordinary=D.OwnedRun(I,private=True,http=True)
        self.assertFalse(ordinary.compressed_owner)

    def test_source_gate_closes_actual_entry_even_with_literal_valid_arguments(self):
        with patch.object(D,'COMPRESSED_SOURCE_REVIEW_COMPLETE',False),patch.object(D,'execute',side_effect=AssertionError('must stay inert')):
            for args in [[],['a'*64],['private-automatic18-browser','a'*64],
                    ['bulk-automatic18-browser','a'*64],['bulk-automatic18-browser','A'*64]]:
                self.assertEqual(D.compressed_main(args),2)

    def test_new_actual_cli_dispatches_only_complete_fixed_browser_purpose(self):
        import contextlib
        import io
        calls=[]
        with patch.object(D,'COMPRESSED_SOURCE_REVIEW_COMPLETE',True),patch.object(D,'execute',side_effect=lambda *a,**k:(calls.append((a,k)) or {'accepted':False})),contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(D.compressed_main(['bulk-automatic18-browser','a'*64]),1)
            for args in [['private-restore','a'*64],['private-automatic18','a'*64],['a'*64],['bulk-automatic18-browser','a'*64,'extra']]:
                self.assertEqual(D.compressed_main(args),2)
        self.assertEqual(calls,[(('a'*64,True,True),{'automatic18':True,'browser':True})])

    def test_compressed_tree_adds_an_allocation_guard_after_the_original_guard(self):
        run=types.SimpleNamespace(cluster=Path('fixture-only'),private=True,compressed_owner=True,storage_reader=Reader())
        tree=D.cluster_tree_type(S,I,run)()
        self.assertEqual(type(tree).__name__,'CompressedClusterTree')
        self.assertEqual(type(tree).__bases__[0].__name__,'ClusterTree')
        with self.assertRaises(I.Refusal):
            D.cluster_tree_type(S,I,types.SimpleNamespace(**{**run.__dict__,'storage_reader':None}))

    def test_allocated_and_logical_caps_are_independent_and_round_up(self):
        with tempfile.TemporaryDirectory(dir=D.REPO/'apps/local-service/data',prefix='compressed-budget-unit-') as value:
            root=Path(value);(root/'public.txt').write_bytes(b'public')
            reader=Reader(logical=65536,allocated=1)
            self.assertEqual(D.measure_cluster_allocations(I,root,reader),{'files':1,'logicalBytes':65536,'allocatedBytes':4096})
            self.assertEqual(reader.closed_checks,1)
            for reader in [Reader(allocated=4096*D.MIB+1),Reader(logical=6144*D.MIB+1)]:
                with self.assertRaises(I.Refusal):D.measure_cluster_allocations(I,root,reader)
            reader=Reader(missing=True)
            self.assertEqual(D.measure_cluster_allocations(I,root,reader)['files'],0)

    def test_noncluster_measurement_skips_cluster_and_bounds_real_allocation(self):
        with tempfile.TemporaryDirectory(dir=D.REPO/'apps/local-service/data',prefix='compressed-budget-unit-') as value:
            root=Path(value);(root/'run.json').write_text('public')
            (root/'cluster').mkdir();(root/'cluster'/'not-output.txt').write_text('public')
            output=root/'output';output.mkdir();(output/'proof.json').write_text('public')
            run=types.SimpleNamespace(root=root,output=output)
            reader=Reader(allocated=1)
            self.assertEqual(D.measure_noncluster_allocations(I,run,reader),8192)
            self.assertEqual(len(reader.names),2)
            self.assertFalse(any('not-output.txt' in name for name in reader.names))
            with self.assertRaises(I.Refusal):D.measure_noncluster_allocations(I,run,Reader(allocated=128*D.MIB+1))


if __name__=='__main__':unittest.main()
