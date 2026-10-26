"""Pure catalog tests. Metadata/hash reads only; no native DLL/Job/process/SQL."""
import json
import hashlib
import os
import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import inventory as S

class CatalogTests(unittest.TestCase):
    def fixture(self, keys=('a.js','folder/b.sql')):
        self.body = {key: ('fixture '+key).encode() for key in keys}
        self.calls = []
        value = {'schema':'native-hierarchy-postgres-catalog/v1', 'files':[
            {'key':key, 'bytes':len(self.body[key]), 'sha256':hashlib.sha256(self.body[key]).hexdigest()}
            for key in sorted(keys)]}
        return value

    def run_catalog(self, value, expected=None, raw=None, pin=None):
        data = S.canonical_json(value) if raw is None else raw
        expected = frozenset(self.body) if expected is None else expected
        def hash_file(key, size):
            self.calls.append(key)
            self.assertEqual(size, len(self.body[key]))
            return hashlib.sha256(self.body[key]).hexdigest()
        return S.authenticate_catalog(data, hashlib.sha256(data).hexdigest() if pin is None else pin,
                                      expected, hash_file)

    def test_exact_canonical_catalog_and_fixed_logical_binary_keys(self):
        value = self.fixture(('@node','@python','a.js'))
        self.assertEqual(self.run_catalog(value), value)
        self.assertEqual(self.calls, sorted(self.body))

    def test_external_file_sha_precedes_json_parse_and_any_body_follow(self):
        value = self.fixture()
        with self.assertRaisesRegex(S.Refusal, 'catalog-file-pin'):
            self.run_catalog(value, raw=b'not even JSON', pin='0'*64)
        self.assertEqual(self.calls, [])

    def test_noncanonical_and_duplicate_json_refused_before_body_reads(self):
        value = self.fixture()
        variants = [json.dumps(value).encode(), S.canonical_json(value)+b'\n',
                    S.canonical_json(value).replace(b'{',b'{"schema":"duplicate",',1),
                    S.canonical_json(value).replace(b'"bytes":',b'"bytes":NaN,"other":',1)]
        for data in variants:
            with self.subTest(data=data[:30]):
                with self.assertRaises(S.Refusal):
                    self.run_catalog(value, raw=data)
                self.assertEqual(self.calls, [])

    def test_order_missing_extra_and_case_aliases_fail_before_body_reads(self):
        value = self.fixture()
        value['files'].reverse()
        with self.assertRaisesRegex(S.Refusal, 'catalog-key-set'):
            self.run_catalog(value)
        value = self.fixture(('A.js','a.js'))
        with self.assertRaisesRegex(S.Refusal, 'catalog-key-set'):
            self.run_catalog(value)
        value = self.fixture(('a.js','a.js/b.sql'))
        with self.assertRaisesRegex(S.Refusal, 'catalog-key-set'):
            self.run_catalog(value)
        value = self.fixture()
        with self.assertRaises(S.Refusal):
            self.run_catalog(value, expected=frozenset({'other.js'}))
        self.assertEqual(self.calls, [])

    def test_path_grammar_rejects_windows_escape_devices_and_unsafe_components(self):
        for key in ('../a','a/../b','/a','C:/a','a\\b','a:b','//server/a','a//b',
                    'a/./b','a.','a ','CON','nul.txt','a/LPT1.js','a/COM9','a/\x00b','a/é.js'):
            with self.subTest(key=key):
                self.assertFalse(S.safe_key(key))
        self.assertTrue(S.safe_key('apps/package-name/@scope/a.js'))

    def test_closed_schema_entry_types_and_byte_limits(self):
        for size in (True,0,-1,128*S.MIB+1,1.0,'1'):
            value = self.fixture()
            value['files'][0]['bytes'] = size
            with self.assertRaisesRegex(S.Refusal, 'catalog-entry'):
                self.run_catalog(value)
            self.assertEqual(self.calls, [])
        value = self.fixture()
        value['files'][0]['command'] = 'not executable authority'
        with self.assertRaisesRegex(S.Refusal, 'catalog-shape'):
            self.run_catalog(value)

    def test_body_pin_mismatch_fails_without_accepting_subset(self):
        value = self.fixture()
        value['files'][0]['sha256'] = '0'*64
        with self.assertRaisesRegex(S.Refusal, 'catalog-content-pin'):
            self.run_catalog(value)
        self.assertEqual(len(self.calls),1)

    def test_raw_and_total_bounds_precede_follow(self):
        value = self.fixture()
        with self.assertRaisesRegex(S.Refusal, 'catalog-input'):
            self.run_catalog(value, raw=b' '*(S.CATALOG_LIMIT+1))
        value = self.fixture(('a','b','c'))
        for row in value['files']:
            row['bytes'] = 128*S.MIB
        with self.assertRaisesRegex(S.Refusal, 'catalog-total'):
            self.run_catalog(value)
        self.assertEqual(self.calls, [])

    def test_streamed_regular_file_hash_and_changed_size(self):
        with tempfile.TemporaryDirectory(prefix='.source-test-', dir=Path(__file__).resolve().parent) as temporary:
            root = Path(temporary)
            path = root/'fixture.dat'
            data = b'a'*140000
            with path.open('wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            self.assertEqual(S.hash_regular_file(root,'fixture.dat',len(data)),hashlib.sha256(data).hexdigest())
            with self.assertRaisesRegex(S.Refusal, 'file-size'):
                S.hash_regular_file(root,'fixture.dat',len(data)-1)
            with self.assertRaises(S.Refusal):
                S.checked_path(root,'../fixture.dat')

    def test_directory_and_symlink_cannot_be_regular_input(self):
        with tempfile.TemporaryDirectory(prefix='.source-test-', dir=Path(__file__).resolve().parent) as temporary:
            root = Path(temporary)
            (root/'directory').mkdir()
            with self.assertRaisesRegex(S.Refusal, 'file-kind'):
                S.checked_path(root,'directory')
            # Simulate the Windows reparse attribute without requiring symbolic
            # link privileges or creating host junctions in a pure test.
            class Info:
                st_mode = 0o100644
                st_file_attributes = 0x400
            self.assertFalse(S.no_reparse(Info()))

    def test_windows_cross_api_ctime_difference_keeps_each_namespace_fenced(self):
        def row(ctime=10,**changes):
            values = dict(st_dev=1,st_ino=2,st_size=3,st_mtime_ns=5,st_birthtime_ns=7,st_ctime_ns=ctime)
            values.update(changes)
            return SimpleNamespace(**values)
        with patch.object(S.os,'name','nt'):
            S.verify_file_identity(row(10),row(20),row(20),row(10),3,3)
            for before,opened,after_open,after in (
                (row(10),row(20),row(21),row(10)),
                (row(10),row(20),row(20),row(11)),
                (row(10),row(20,st_ino=9),row(20),row(10)),
                (row(10),row(20,st_birthtime_ns=8),row(20),row(10)),
                (row(10),row(20),row(20,st_mtime_ns=6),row(10)),
                (row(10),row(20),row(20),row(10,st_size=4))):
                with self.assertRaisesRegex(S.Refusal,'file-identity'):
                    S.verify_file_identity(before,opened,after_open,after,3,3)

class NativeInventoryTests(unittest.TestCase):
    def test_complete_fixed_source_package_and_native_path_inventory_is_readonly(self):
        self.assertEqual(len(S.LOCAL_JS),67)
        self.assertEqual(len(S.SQL_KEYS),11)
        self.assertEqual(len(S.scope_absences()),32)
        self.assertEqual(len(S.fixed_package_inventory(S.REPO)),456)
        native=S.fixed_postgres_inventory()
        self.assertEqual(len(native),1777)
        self.assertEqual(hashlib.sha256('\n'.join(native).encode()).hexdigest(),S.PG_LIST_SHA256)
        self.assertIn('@postgres/lib/vector.dll',native)
        self.assertIn('@postgres/share/extension/vector.control',native)
        self.assertIn('@postgres/share/postgres.bki',native)
        self.assertEqual(len(S.FileCatalog('a'*64)._inventory()),2338)
    def test_native_and_runtime_keys_cannot_select_other_roots(self):
        c=S.FileCatalog('a'*64)
        with patch.object(S,'hash_regular_file',return_value='pin') as read:
            self.assertEqual(c._hash('@postgres/bin/postgres.exe',9),'pin')
            read.assert_called_once_with(S.PG_ROOT,'bin/postgres.exe',9)
        self.assertTrue(S.safe_key('@postgres/share/timezone/Etc/GMT+1'))
        for key in ('@postgres/../secret','@postgres/bin/C:/x','@postgres/bin/nul.dll'):
            self.assertFalse(S.safe_key(key))
        path,size,pin=S.RUNTIME_PINS['@powershell']
        with patch.object(S,'hash_regular_file',return_value=pin):
            self.assertEqual(c._hash('@powershell',size),pin)
            with self.assertRaisesRegex(S.Refusal,'runtime-pin'):c._hash('@powershell',size+1)
    def test_changed_native_list_refuses_without_content_reads(self):
        with patch.object(S,'PG_LIST_SHA256','0'*64):
            with self.assertRaisesRegex(S.Refusal,'postgres-list-pin'):S.fixed_postgres_inventory()
    def test_oversized_native_census_is_bounded_before_pin_acceptance(self):
        with patch.object(S,'PG_FILE_COUNT',1):
            with self.assertRaisesRegex(S.Refusal,'postgres-file-count'):S.fixed_postgres_inventory()
    def test_intervening_node_scope_is_checked_before_packages_or_native_body_reads(self):
        c=S.FileCatalog('a'*64)
        target=S.REPO/next(iter(S.scope_absences()))
        with patch.object(S.os.path,'lexists',side_effect=lambda p:p==target):
            with self.assertRaisesRegex(S.Refusal,'resolution-shadow'):c._inventory()
    def test_max_catalog_count_and_total_are_distinct_native_input_limits(self):
        self.assertEqual(S.CATALOG_LIMIT,1048576)
        keys=frozenset('f'+str(i) for i in range(3001))
        raw=S.canonical_json({'schema':'native-hierarchy-postgres-catalog/v1','files':[]})
        with self.assertRaisesRegex(S.Refusal,'catalog-expected-keys'):
            S.authenticate_catalog(raw,hashlib.sha256(raw).hexdigest(),keys,lambda *_:None)

if __name__=='__main__':unittest.main()
