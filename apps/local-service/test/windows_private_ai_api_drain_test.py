import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('private_api_drain', Path(__file__).resolve().parents[1] / 'src/ops/windows-private-ai-api-drain.py')
drain = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(drain)
OWN = 999


class Fake:
    def __init__(self):
        self.calls = []
        self.identities = [(drain.API_CREATION, drain.NODE, 259)] * 3
        self.memberships = [[OWN, drain.API_PID], [OWN, drain.API_PID]]
        self.code = 130

    def open(self, pid): self.calls.append(('open', pid)); return 1
    def identity(self, handle): self.calls.append(('identity', handle)); return self.identities.pop(0)
    def detach(self): self.calls.append(('detach',))
    def attach(self, pid): self.calls.append(('attach', pid))
    def members(self): self.calls.append(('members',)); return self.memberships.pop(0)
    def interrupt(self): self.calls.append(('interrupt',))
    def wait(self, handle): self.calls.append(('wait', handle)); return self.code
    def close(self, handle): self.calls.append(('close', handle))


class DrainTests(unittest.TestCase):
    def test_probe_never_signals_and_closes_handle(self):
        fake = Fake(); result = drain.inspect_api('probe', fake, OWN)
        self.assertFalse(result['signalSent']); self.assertNotIn(('interrupt',), fake.calls)
        self.assertEqual(fake.calls[-2:], [('detach',), ('close', 1)])

    def test_one_signal_only_after_final_identity_and_membership_rechecks(self):
        fake = Fake(); result = drain.inspect_api('drain', fake, OWN)
        self.assertTrue(result['exited']); self.assertEqual(result['exitCode'], 130)
        self.assertEqual(fake.calls.count(('interrupt',)), 1)
        signal = fake.calls.index(('interrupt',))
        self.assertEqual(fake.calls[signal-2:signal], [('members',), ('identity', 1)])
        self.assertEqual(fake.calls[-1], ('close', 1))

    def test_stale_identity_or_different_image_never_signals(self):
        for identity in [(drain.API_CREATION + 1, drain.NODE, 259), (drain.API_CREATION, 'other.exe', 259),
                         (drain.API_CREATION, drain.NODE, 0)]:
            fake = Fake(); fake.identities[0] = identity
            with self.assertRaises(RuntimeError): drain.inspect_api('drain', fake, OWN)
            self.assertNotIn(('interrupt',), fake.calls); self.assertEqual(fake.calls[-1], ('close', 1))

    def test_shared_console_or_late_reuse_never_signals(self):
        for late in [False, True]:
            fake = Fake(); fake.memberships[1 if late else 0].append(26784)
            with self.assertRaises(RuntimeError): drain.inspect_api('drain', fake, OWN)
            self.assertNotIn(('interrupt',), fake.calls); self.assertEqual(fake.calls[-1], ('close', 1))
        fake = Fake(); fake.identities[2] = (drain.API_CREATION + 1, drain.NODE, 259)
        with self.assertRaises(RuntimeError): drain.inspect_api('drain', fake, OWN)
        self.assertNotIn(('interrupt',), fake.calls)

    def test_forced_or_default_console_exit_is_not_graceful_success(self):
        for code in [0, 1, 0xC000013A]:
            fake = Fake(); fake.code = code
            with self.assertRaises(RuntimeError): drain.inspect_api('drain', fake, OWN)
            self.assertEqual(fake.calls.count(('interrupt',)), 1); self.assertEqual(fake.calls[-1], ('close', 1))

    def test_no_crawler_worker_dashboard_or_arbitrary_target_cli(self):
        for args in [[], ['drain', 'crawler'], ['worker'], ['drain', '--pid=1'], ['absence', 'all']]:
            self.assertEqual(drain.main(args), 2)


if __name__ == '__main__':
    unittest.main()
