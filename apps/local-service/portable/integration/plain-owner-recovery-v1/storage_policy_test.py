"""Pure policy tests: no filesystem creation, WinAPI, archive, process or SQL."""
import unittest
import storage_policy as policy


class PolicyTests(unittest.TestCase):
    def sample(self):
        return {'physicalFree': policy.GIB, 'commitFree': policy.GIB,
                'cFree': policy.C_ADMISSION, 'dFree': policy.D_FLOOR,
                'cFileSystem': 'NTFS', 'cAllocationUnitBytes': 4096,
                'cSupportsFileCompression': True}

    def test_admission_accounts_for_full_physical_budget_and_original_reserves(self):
        self.assertEqual(policy.C_ADMISSION, 6576668672)
        self.assertTrue(policy.resources(self.sample(), admission=True))
        for key in ('physicalFree', 'commitFree', 'cFree', 'dFree'):
            row = self.sample()
            row[key] -= 1
            with self.assertRaises(policy.StorageRefusal, msg=key):
                policy.resources(row, admission=True)

    def test_runtime_c_floor_is_unchanged_not_a_compression_ratio(self):
        row = self.sample()
        row['cFree'] = policy.C_FLOOR
        self.assertTrue(policy.resources(row))
        with self.assertRaises(policy.StorageRefusal):
            policy.resources(row, admission=True)
        row['cFree'] -= 1
        with self.assertRaises(policy.StorageRefusal):
            policy.resources(row)

    def test_unknown_volume_or_unsupported_compression_is_refused(self):
        for key, value in [('cFileSystem', 'ReFS'), ('cSupportsFileCompression', False),
                           ('cSupportsFileCompression', 1), ('cAllocationUnitBytes', 65536),
                           ('cAllocationUnitBytes', True), ('commitFree', None)]:
            row = self.sample()
            row[key] = value
            with self.assertRaises(policy.StorageRefusal):
                policy.resources(row)

    def test_exact_new_owned_c_scope_only(self):
        run = policy.PRIVATE_ROOT + '\\run-' + 'a' * 48
        self.assertEqual(policy.run_path(run), run)
        self.assertEqual(policy.data_path(run, run + '\\cluster\\nhpg-Test123'), run + '\\cluster\\nhpg-Test123')
        for value in [run.lower(), run + '\\..', run.replace('C:', 'D:'), run + '\\child',
                      '\\\\?\\' + run, policy.PRIVATE_ROOT + '\\run-' + 'a' * 47]:
            with self.assertRaises(policy.StorageRefusal):
                policy.run_path(value)
        with self.assertRaises(policy.StorageRefusal):
            policy.data_path(run, run + '\\cluster\\nhpg-x\\..\\outside')

    def test_logical_and_allocated_budgets_are_independent(self):
        rows = [{'relativePath': 'base/1/123', 'logicalBytes': 6 * policy.GIB,
                 'allocatedBytes': 4 * policy.GIB}]
        total = policy.accounting(rows)
        self.assertTrue(policy.run_budget(total, policy.NONCLUSTER_LIMIT))
        rows[0]['allocatedBytes'] += 1
        with self.assertRaises(policy.StorageRefusal):
            policy.accounting(rows)
        rows[0]['allocatedBytes'] = 1
        rows[0]['logicalBytes'] += 1
        with self.assertRaises(policy.StorageRefusal):
            policy.accounting(rows)

    def test_incompressible_data_is_not_admitted_from_optimistic_ratios(self):
        with self.assertRaises(policy.StorageRefusal):
            policy.accounting([{'relativePath': 'base/1/123', 'logicalBytes': 5 * policy.GIB,
                                'allocatedBytes': 5 * policy.GIB}])

    def test_cluster_rounding_and_noncluster_budget(self):
        total = policy.accounting([{'relativePath': 'tiny', 'logicalBytes': 1, 'allocatedBytes': 1}])
        self.assertEqual(total['allocatedBytes'], 4096)
        self.assertTrue(policy.run_budget(total, policy.NONCLUSTER_LIMIT))
        with self.assertRaises(policy.StorageRefusal):
            policy.run_budget(total, policy.NONCLUSTER_LIMIT + 1)

    def test_invalid_missing_duplicate_or_escaping_measurements_are_refused(self):
        row = {'relativePath': 'base/1/123', 'logicalBytes': 1, 'allocatedBytes': 1}
        for name in ['../outside', '/absolute', 'C:/absolute', 'base/../outside',
                     'base//file', 'base\\file', 'base/file:stream']:
            with self.assertRaises(policy.StorageRefusal):
                policy.accounting([{**row, 'relativePath': name}])
        with self.assertRaises(policy.StorageRefusal):
            policy.accounting([row, row])
        with self.assertRaises(policy.StorageRefusal):
            policy.accounting([{'relativePath': 'a', 'logicalBytes': 1}])
        with self.assertRaises(policy.StorageRefusal):
            policy.accounting([{**row, 'allocatedBytes': True}])


if __name__ == '__main__':
    unittest.main()
