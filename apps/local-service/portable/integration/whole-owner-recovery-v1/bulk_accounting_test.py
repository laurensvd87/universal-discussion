"""No native work: verifies real controller failure latch and diagnostic projection."""
from pathlib import Path
import types
import unittest

SOURCE=Path(__file__).with_name('hierarchy-native-driver.py')
D=types.ModuleType('_bulk_accounting_subject');D.__file__=str(SOURCE)
exec(compile(SOURCE.read_bytes(),str(SOURCE),'exec'),D.__dict__)
S=D.load_pinned('supervisor');W=D.load_pinned('windows')

class BulkAccountingTest(unittest.TestCase):
    def test_absent_or_invalid_sample_cannot_be_invented(self):
        for sample in (None,{}, {'user100ns':3000000000}):
            self.assertIsNone(D.validated_accounting_projection(types.SimpleNamespace(last_accounting=sample)))

    def test_actual_cpu_refusal_keeps_same_counter_value_and_validated_aggregate_split(self):
        account={'totalProcesses':7,'activeProcesses':4,'totalTerminatedProcesses':0,
                 'user100ns':5900000000,'kernel100ns':100468750}
        row={**{key:16*D.MIB*1024 for key in ('physicalFree','commitFree','cFree','dFree')},
             'cpu':600.046875,'committed':256*D.MIB,'accounting':account}
        controller=object.__new__(D.diagnostic_controller_type(S,W,private=True))
        controller.boundary=types.SimpleNamespace(sample=lambda:row)
        controller.last_cpu=controller.last_peak=0;controller.last_accounting=None
        controller.job_memory_bytes=1024*D.MIB
        with self.assertRaises(S.Refusal) as raised:controller.job()
        self.assertEqual(raised.exception.metadata,{'code':'resource-limit','counter':'jobCpuSeconds','value':600.046875})
        report=D.validated_accounting_projection(controller)
        self.assertEqual(report['user100ns'],5900000000)
        self.assertEqual(report['kernel100ns'],100468750)
        account['user100ns']=0
        self.assertEqual(report['user100ns'],5900000000)

    def test_unvalidated_regressing_sample_does_not_replace_last_validated_one(self):
        account={'totalProcesses':7,'activeProcesses':4,'totalTerminatedProcesses':0,
                 'user100ns':100,'kernel100ns':100}
        controller=object.__new__(D.diagnostic_controller_type(S,W,private=True))
        controller.last_cpu=0.00002;controller.last_peak=1024;controller.last_accounting=dict(account)
        controller.job_memory_bytes=1024*D.MIB
        controller.boundary=types.SimpleNamespace(sample=lambda:{'cpu':0,'committed':1024,
            'accounting':{**account,'user100ns':0,'kernel100ns':0}})
        with self.assertRaises(S.Refusal):controller.job()
        self.assertEqual(D.validated_accounting_projection(controller)['user100ns'],100)

if __name__=='__main__':unittest.main()
