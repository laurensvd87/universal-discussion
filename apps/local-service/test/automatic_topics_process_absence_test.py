"""Pure census classification only: no WinAPI, subprocess, signal or live host."""
import importlib.util
from pathlib import Path
import unittest

FILE = Path(__file__).resolve().parents[1] / 'src/ops/automatic-topics-process-absence.py'
spec = importlib.util.spec_from_file_location('_absence', FILE)
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)
NODE = 'C:/Program Files/nodejs/node.exe'


class AbsenceTest(unittest.TestCase):
    def run_census(self, nodes, parent_name='powershell.exe', args=None):
        return M.writers_absent({'parentId': 101, 'parentName': parent_name, 'nodes': nodes},
                               101, lambda command: args[command], M.REPO)

    def test_empty_and_unrelated_editor(self):
        self.assertTrue(self.run_census([]))
        command = 'editor'
        nodes = [{'id': 200, 'image': NODE, 'command': command}]
        self.assertTrue(self.run_census(nodes, args={command: [NODE, 'C:/Other/editor-server.js', str(M.REPO)]}))

    def test_every_supported_writer_blocks_without_signaling(self):
        for leaf in M.WRITERS:
            with self.subTest(leaf=leaf):
                command = 'node ' + leaf
                self.assertFalse(self.run_census([{'id': 200, 'image': NODE, 'command': command}],
                                                args={command: [NODE, leaf]}))

    def test_only_exact_capture_parent_is_excluded(self):
        command = 'capture'
        row = {'id': 101, 'image': NODE, 'command': command}
        args = {command: [NODE, str(M.CAPTURE), '--capture']}
        self.assertTrue(self.run_census([row], 'node.exe', args))
        other_command = 'node automatic-topics-quiesced-backup.js --capture'
        other = {'id': 202, 'image': NODE, 'command': other_command}
        args[other_command] = [NODE, str(M.CAPTURE), '--capture']
        self.assertFalse(self.run_census([row, other], 'node.exe', args))
        for invalid in ([NODE, str(M.CAPTURE), '--unexpected'], [NODE, '--import', 'hook.js', str(M.CAPTURE), '--capture'], [NODE, 'C:/Other/wrapper.js']):
            with self.subTest(invalid=invalid):
                self.assertFalse(self.run_census([row], 'node.exe', {command: invalid}))

    def test_workspace_script_and_opaque_process_block(self):
        row = {'id': 200, 'image': NODE, 'command': 'worker'}
        self.assertFalse(self.run_census([row], args={'worker': [NODE, str(M.REPO / 'apps/local-service/data/other-writer.mjs')]}))
        for patch in ({'image': None}, {'command': None}, {'command': ''}):
            with self.subTest(patch=patch):
                self.assertFalse(self.run_census([{**row, **patch}], args={}))

    def test_duplicates_incomplete_census_and_arbitrary_rows_refuse(self):
        row = {'id': 200, 'image': NODE, 'command': 'editor'}
        args = {'editor': [NODE, 'C:/Other/editor.js']}
        for nodes in ([row, row], [{**row, 'id': True}], [{**row, 'secret': 'not-printed'}]):
            with self.subTest(nodes=nodes):
                with self.assertRaises(RuntimeError):
                    self.run_census(nodes, args=args)
        with self.assertRaises(RuntimeError):
            self.run_census([], 'node.exe', {})


if __name__ == '__main__':
    unittest.main()
