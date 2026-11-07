"""Pure fake handles only; no DLL loading, C writes or databases."""
from pathlib import Path
import types
import unittest

subject = Path(__file__).with_name('windows_storage.py')
M = types.ModuleType('_compressed_storage_test')
exec(compile(subject.read_bytes(), str(subject), 'exec'), M.__dict__)
FIXED = M.PRIVATE_ROOT + '\\run-' + 'a'*48 + '\\cluster\\nhpg-ABC123\\pgdata\\base\\5\\1234'


class API:
    def __init__(self):
        self.calls = []
        self.flags, self.format, self.allocated, self.close_failed = 0, 2, 4096, False
        self.info_failed = False

    def open_file(self, name):
        self.calls.append('open')
        return 77

    def close_file(self, handle):
        self.calls.append('close')
        if self.close_failed:
            raise RuntimeError('close')

    def info(self, handle):
        self.calls.append('info')
        if self.info_failed:
            raise ValueError('primary')
        return {'attributes': self.flags, 'identity': (1, 2, 3), 'logicalBytes': 65536}

    def allocation(self, handle):
        self.calls.append('allocation')
        return {'allocatedBytes': self.allocated, 'format': self.format}

    def volume(self):
        return {'cFileSystem': 'NTFS', 'cAllocationUnitBytes': 4096, 'cSupportsFileCompression': True}


class StorageTest(unittest.TestCase):
    def test_path_scope_refuses_other_drives_ads_traversal_or_wrong_nonce_before_open(self):
        api = API()
        storage = M.WindowsStorage(api)
        for path in [FIXED.replace('C:', 'D:'), FIXED+':ads', FIXED+'\\..\\1234', FIXED.replace('run-', 'run-A'), FIXED+'\0']:
            with self.assertRaises(M.StorageFailure):
                storage.observe_file(path)
        self.assertEqual(api.calls, [])

    def test_actual_allocation_is_distinct_from_logical_length_and_handle_closes(self):
        api = API()
        storage = M.WindowsStorage(api)
        self.assertEqual(storage.observe_file(FIXED), {'logicalBytes': 65536, 'allocatedBytes': 4096})
        self.assertEqual(api.calls, ['open', 'info', 'allocation', 'info', 'close'])
        self.assertTrue(storage.settled())
        self.assertEqual(storage.volume()['cAllocationUnitBytes'], 4096)

    def test_reparse_directory_negative_or_unknown_format_cannot_confer_a_measurement(self):
        for field, value in [('flags', 0x400), ('flags', 0x10), ('allocated', -1), ('format', 1)]:
            api = API()
            setattr(api, field, value)
            storage = M.WindowsStorage(api)
            with self.assertRaises(M.StorageFailure):
                storage.observe_file(FIXED)
            self.assertEqual(api.calls[-1], 'close')
            self.assertTrue(storage.settled())

    def test_close_failure_blocks_future_observations_and_preserves_the_first_failure(self):
        api = API()
        api.info_failed = api.close_failed = True
        storage = M.WindowsStorage(api)
        with self.assertRaisesRegex(ValueError, 'primary'):
            storage.observe_file(FIXED)
        with self.assertRaisesRegex(M.StorageFailure, 'unsettled'):
            storage.settled()
        with self.assertRaisesRegex(M.StorageFailure, 'unsettled'):
            storage.observe_file(FIXED)
        self.assertEqual(api.calls.count('open'), 1)


if __name__ == '__main__':
    unittest.main()
