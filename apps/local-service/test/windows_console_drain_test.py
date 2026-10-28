"""Pure injected-port tests; no Windows API, process or console access."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout
from io import StringIO

p = Path(__file__).resolve().parents[1] / 'src/ops/windows-console-drain.py'
spec = importlib.util.spec_from_file_location('drain', p)
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)


class Fake:
    def __init__(self):
        self.events = []
        self.witness = (d.ORIGINALS['crawler'][1], d.NODE, 259)
        self.rows = [100, 4060]
        self.wait_error = False

    def open(self, pid):
        self.events.append(('open', pid))
        return 'original-handle'

    def identity(self, handle):
        self.events.append(('identity', handle))
        return self.witness

    def detach(self): self.events.append('detach')
    def attach(self, pid): self.events.append(('attach', pid))
    def members(self): return self.rows
    def interrupt(self): self.events.append('interrupt')
    def close(self, handle): self.events.append(('close', handle))

    def wait(self, handle):
        self.events.append(('wait', handle))
        if self.wait_error:
            raise RuntimeError('observation-timeout')
        return 130


class Tests(unittest.TestCase):
    def test_absence_mode_never_attaches_or_signals_and_fails_closed(self):
        for present in (None, 19868):
            calls = []
            class AbsenceOnly:
                def absent(self, pid):
                    calls.append(pid)
                    return pid != present
            with patch.object(d, 'WindowsConsole', return_value=AbsenceOnly()), redirect_stdout(StringIO()):
                self.assertEqual(d.main(['absence', 'all']), 0 if present is None else 1)
            self.assertIn(4060, calls)
            self.assertLessEqual(len(calls), 4)

    def test_probe_sends_nothing_and_closes_original_handle(self):
        f = Fake()
        r = d.inspect_or_drain('crawler', 'probe', f, 100)
        self.assertFalse(r['signalSent'])
        self.assertNotIn('interrupt', f.events)
        self.assertEqual(f.events[-2:], ['detach', ('close', 'original-handle')])

    def test_one_interrupt_waits_original_process_without_termination(self):
        f = Fake()
        r = d.inspect_or_drain('crawler', 'drain', f, 100)
        self.assertTrue(r['exited'])
        self.assertEqual(r['exitCode'], 130)
        self.assertEqual(f.events.count('interrupt'), 1)
        self.assertIn(('wait', 'original-handle'), f.events)

    def test_foreign_console_and_reused_process_refuse_before_signal(self):
        for change in ('foreign', 'time', 'image', 'exited'):
            f = Fake()
            if change == 'foreign': f.rows.append(200)
            if change == 'time': f.witness = (1, d.NODE, 259)
            if change == 'image': f.witness = (f.witness[0], 'other.exe', 259)
            if change == 'exited': f.witness = (f.witness[0], d.NODE, 0)
            with self.assertRaises(RuntimeError): d.inspect_or_drain('crawler', 'drain', f, 100)
            self.assertNotIn('interrupt', f.events)
            self.assertEqual(f.events[-1], ('close', 'original-handle'))

    def test_unknown_role_is_inert_and_timeout_never_resends(self):
        f = Fake()
        with self.assertRaises(RuntimeError): d.inspect_or_drain('other', 'drain', f, 100)
        self.assertEqual(f.events, [])
        f.wait_error = True
        with self.assertRaises(RuntimeError): d.inspect_or_drain('crawler', 'drain', f, 100)
        self.assertEqual(f.events.count('interrupt'), 1)
        self.assertEqual(f.events[-2:], ['detach', ('close', 'original-handle')])

    def test_identity_is_rechecked_after_attachment_and_before_signal(self):
        f = Fake()
        identities = iter([f.witness, f.witness, (1, d.NODE, 259)])
        f.identity = lambda _handle: next(identities)
        with self.assertRaises(RuntimeError): d.inspect_or_drain('crawler', 'drain', f, 100)
        self.assertNotIn('interrupt', f.events)

    def test_default_windows_control_termination_is_not_a_graceful_exit(self):
        f = Fake()
        f.wait = lambda _handle: 0xC000013A
        with self.assertRaises(RuntimeError): d.inspect_or_drain('crawler', 'drain', f, 100)
        self.assertEqual(f.events.count('interrupt'), 1)


if __name__ == '__main__': unittest.main()
