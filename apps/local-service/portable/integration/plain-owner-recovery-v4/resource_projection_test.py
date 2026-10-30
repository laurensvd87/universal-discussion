"""Pure adapter/source integration: no native reads, filesystem writes or SQL."""
from pathlib import Path
import ast
import types
import unittest

SOURCE=Path(__file__).with_name('hierarchy-native-driver.py')
D=types.ModuleType('_resource_projection');D.__file__=str(SOURCE)
exec(compile(SOURCE.read_bytes(),str(SOURCE),'exec'),D.__dict__)
I=D.load_pinned('inventory');P=D.load_pinned('storage-policy')

class ResourceProjectionTest(unittest.TestCase):
    def sample(self):
        return {'physicalFree':P.GIB,'commitFree':P.GIB,'cFree':P.C_ADMISSION,
                'dFree':P.D_ADMISSION,'cFileSystem':'NTFS','cAllocationUnitBytes':4096,
                'cSupportsFileCompression':True}

    def test_first_failed_counter_is_retained_after_later_snapshot_mutation(self):
        for name,code in [('physicalFree','compressed-physical-floor'),('commitFree','compressed-commit-floor'),
                          ('cFree','compressed-c-floor'),('dFree','compressed-d-floor')]:
            row=self.sample();row[name]-=1;first=row[name]
            with self.assertRaises(I.Refusal) as raised:D.checked_resource_policy(I,P,row,admission=True)
            row[name]=0
            self.assertEqual(raised.exception.metadata,{'code':code,'counter':name,'value':first})

    def test_original_runtime_and_new_admission_boundaries_are_distinct(self):
        row=self.sample();row['dFree']=P.D_FLOOR
        self.assertTrue(D.checked_resource_policy(I,P,row,admission=False))
        with self.assertRaises(I.Refusal) as raised:D.checked_resource_policy(I,P,row,admission=True)
        self.assertEqual(raised.exception.metadata['value'],4294967296)

    def test_known_shape_volume_integer_refusals_stay_finite_without_counter(self):
        for change,code in [({'physicalFree':True},'storage-integer'),({'cFileSystem':'ReFS'},'compressed-volume')]:
            with self.assertRaises(I.Refusal) as raised:D.checked_resource_policy(I,P,{**self.sample(),**change})
            self.assertEqual(raised.exception.metadata,{'code':code,'counter':None,'value':None})
        with self.assertRaises(I.Refusal) as raised:D.checked_resource_policy(I,P,{'secret':'never returned'})
        self.assertEqual(raised.exception.metadata,{'code':'compressed-resource-shape','counter':None,'value':None})

    def test_unknown_errors_do_not_execute_code_accessors_or_emit_raw_text(self):
        class Subclass(P.StorageRefusal):
            @property
            def code(self):raise AssertionError('accessor must remain inert')
            def __init__(self):Exception.__init__(self,'private text')
        subclass=Subclass()
        def fail(*a,**k):raise subclass
        policy=types.SimpleNamespace(StorageRefusal=P.StorageRefusal,resources=fail)
        with self.assertRaises(Subclass) as raised:D.checked_resource_policy(I,policy,self.sample())
        self.assertIs(raised.exception,subclass)
        for code,value in [('private text',1),('compressed-d-floor',True),('compressed-d-floor',-1)]:
            def exact_fail(*a,**k):raise P.StorageRefusal(code)
            policy=types.SimpleNamespace(StorageRefusal=P.StorageRefusal,resources=exact_fail)
            with self.assertRaises(I.Refusal) as raised:D.checked_resource_policy(I,policy,{'dFree':value})
            self.assertEqual(raised.exception.metadata,{'code':'compressed-resource-refusal','counter':None,'value':None})

    def test_real_parent_keeps_both_original_admission_sites_and_uses_pure_adapter(self):
        tree=ast.parse(SOURCE.read_bytes());execute=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='execute')
        authenticate=next(n for n in execute.body if isinstance(n,ast.FunctionDef) and n.name=='authenticate')
        admission=[n for n in ast.walk(authenticate) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name)
                   and n.func.id=='checked_storage_resources' and any(k.arg=='admission' and isinstance(k.value,ast.Constant)
                       and k.value.value is True for k in n.keywords)]
        self.assertEqual(len(admission),2)
        actual=next(n for n in execute.body if isinstance(n,ast.FunctionDef) and n.name=='checked_storage_resources')
        self.assertEqual(sum(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='checked_resource_policy'
                             for n in ast.walk(actual)),1)

if __name__=='__main__':unittest.main()
