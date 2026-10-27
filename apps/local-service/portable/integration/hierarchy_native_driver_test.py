"""Pure maintained-driver checks. No WinAPI, Job, child or database operations."""
import ast
import contextlib
import ctypes
import hashlib
import io
import json
import os
import re
import stat
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

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
        root = D.RUNS_ROOT/('run-'+'a'*48)
        cls.owned_paths = types.SimpleNamespace(output=root/'output', cluster=root/'cluster')

    def test_invalid_cli_is_inert(self):
        for args in (None, [], ['x'], ['A'*64], ['a'*64, 'extra'], 'a'*64):
            # Avoid default argv; None here would select the unittest CLI.
            if args is None:
                continue
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(D.main(args), 2)

    def test_only_native_launch_method_changes(self):
        normal = D.native_api_type(self.W, self.owned_paths)
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
            self.assertEqual(values['TEMP'], str(self.owned_paths.output/'temp'))
            self.assertEqual(values['TMP'], str(self.owned_paths.output/'temp'))
            self.assertEqual(values['PATH'], 'D:\\PostgreSQL\\17\\bin;C:\\Windows\\System32;C:\\Windows')
            info._obj.process, info._obj.thread, info._obj.pid = 111, 222, 333
            return True
        api = object.__new__(D.native_api_type(self.W, self.owned_paths))
        api.m, api.k = self.B, types.SimpleNamespace(CreateProcessW=create_process)
        self.assertEqual(api.create_process((ctypes.create_string_buffer(16), None), 11, 12, 13), (111, 222, 333))
        self.assertEqual(len(seen), 1)

    def test_normal_paths_and_construction_do_not_adopt_or_create_old_output(self):
        old = HERE / 'native-hierarchy-postgres-v2'
        publisher = D.publisher_type(self.S, self.I, self.owned_paths)()
        tree = D.cluster_tree_type(self.S, self.I, self.owned_paths)()
        self.assertEqual(publisher.root, self.owned_paths.output)
        self.assertEqual(tree.parent, self.owned_paths.cluster)
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
            def visit_Name(self, node):
                if node.id == 'cluster_byte_limit':
                    return ast.parse('512*MIB',mode='eval').body
                if node.id == 'cluster_marker':
                    return ast.Constant(value='native-hierarchy-postgres/v2')
                return node
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
        self.assertEqual(maintained-base, D.NORMAL_KEYS)
        self.assertEqual(len(maintained), 2338+len(D.NORMAL_KEYS))
        self.assertTrue(all((D.REPO/key).is_file() for key in D.NORMAL_KEYS))
        self.assertEqual(D.ENTRY, D.OWN+'semantic-native-check.js')
        self.assertIn(D.SEMANTIC_LEDGER, D.NORMAL_KEYS)
        self.assertFalse(base & D.NORMAL_KEYS)
        # Source-only closure: never imports JS, invokes an entrypoint or follows
        # runtime-selected imports. Every literal relative reference must exist,
        # and each recursively imported JS file belongs to the fixed catalog.
        patterns = (
            r'''(?ms)^\s*(?:import|export)\s+(?:(?!;).)*?\bfrom\s*['"]([^'"]+)['"]''',
            r'''(?m)^\s*import\s*['"]([^'"]+)['"]''',
            r'''\bimport\(\s*['"]([^'"]+)['"]\s*\)''',
        )
        pending, seen = [D.ENTRY,D.PRIVATE_ENTRY], set()
        while pending:
            key = pending.pop()
            if key in seen:
                continue
            seen.add(key)
            self.assertIn(key, maintained)
            text = (D.REPO/key).read_text(encoding='utf-8')
            for pattern in patterns:
                for name in re.findall(pattern, text):
                    if not name.startswith('.'):
                        continue
                    target = (D.REPO/key).parent.joinpath(name).resolve()
                    self.assertTrue(target.is_relative_to(D.REPO))
                    self.assertTrue(target.is_file(), name)
                    relative = target.relative_to(D.REPO).as_posix()
                    self.assertIn(relative, maintained)
                    if target.suffix in ('.js', '.mjs'):
                        pending.append(relative)
        self.assertIn('spikes/topic-resolution/browser/core/local-service-client.js', seen)
        self.assertIn('spikes/topic-resolution/browser/core/local-service-session.js', seen)
        self.assertIn('spikes/topic-resolution/browser/core/account-auth-response.js', seen)
        self.assertIn('spikes/topic-resolution/browser/core/community-contract.js', seen)
        self.assertIn('spikes/topic-resolution/browser/core/topic-space-contract.js', seen)
        self.assertIn('apps/local-service/portable/canonical-v4/hierarchy-installation.js', seen)
        self.assertIn('apps/local-service/src/application/installed-hierarchy-matcher.js', seen)
        self.assertIn('apps/topic-dashboard/src/data/postgres-catalog.js', seen)
        self.assertIn('apps/local-service/src/ops/postgres-backup-operator.js',seen)
        self.assertIn('apps/local-service/src/ops/windows-backup-protection.js',seen)
        self.assertIn('apps/local-service/portable/src/windows-dpapi-password.js',seen)
        self.assertIn(D.OWN+'private-owner-storage.js',seen)
        # The numeric loader reads these fixed data URLs, which the literal
        # module-reference traversal above cannot discover. No encoder weights
        # or inference runtime are needed by owner matcher registration.
        for key in (
            'apps/local-service/assets/hierarchy/root-model.json',
            'apps/local-service/assets/hierarchy/root-policy.json',
            'apps/local-service/assets/hierarchy/input-definition.json',
            'apps/local-service/assets/hierarchy/gta-detail.json',
            'spikes/topic-resolution/browser/embedding/.assets/manifest.json',
        ):
            self.assertIn(key, maintained)

    def test_new_resolution_scopes_cannot_shadow_the_reviewed_entry(self):
        original = D.os.path.lexists
        for key in D.NORMAL_SCOPE_ABSENCES:
            with patch.object(D.os.path, 'lexists', side_effect=lambda path: str(path)==str(D.REPO/key) or original(path)):
                with self.assertRaises(self.I.Refusal):
                    D.catalog_type(self.I)('a'*64)._inventory()

    def semantic_result(self):
        groups = json.loads((D.REPO/D.SEMANTIC_LEDGER).read_bytes())
        cases = []
        for group in groups:
            cases.append({'name':group['name'],'depth':0,'status':'passed'})
            cases.extend({'name':name,'depth':1,'status':'passed'} for name in group['children'])
        databases = [{'name':'murmingle_hierarchy_fixture_20261026_'+suffix,
            'oid':str(17000+index), 'created':True,'closed':True,'dropped':True,
            'pending':0,'cleanupFailures':0} for index,suffix in enumerate(('a','b'))]
        return {'schema':'canonical-semantic-postgres-result/v1','accepted':True,'primary':None,
            'server':{'port':55433,'version':170011,'ownershipVerified':True},
            'cleanup':{'reason':'verified-own-server-smart-stopped','stopped':True,'childExited':True,
                'clientsClosed':True,'physicalSettled':True,'directoryRetained':True},
            'proof':{'schema':'canonical-semantic-postgres-proof/v1','status':'passed','nativeExecuted':True,
                'pendingAssertions':0,'cases':cases,'restrictedRoleValidated':True,
                'concurrencyScope':'head-switch-vs-apply-and-mvcc-read','multiUserLoadValidated':False,
                'semanticQualityMeasured':False,'lastObservedSqlFailure':None,
                'cleanup':{'status':'passed','used':2,'finished':True,'adminClosed':True,'failureCount':0,'databases':databases}}}

    def complete(self, value):
        return D.semantic_completion((json.dumps(value,separators=(',',':'))+'\n').encode(),b'',0)

    def test_semantic_completion_binds_its_own_cases_and_frozen_transport(self):
        value=self.semantic_result()
        self.assertEqual(len(value['proof']['cases']),25)
        report=self.complete(value)
        self.assertTrue(report['accepted'])
        self.assertEqual(self.S.checked_completion(report),report)
        self.assertEqual(report['code'],'complete')
        value['schema']='native-hierarchy-postgres-result/v2'
        self.assertEqual(self.complete(value)['code'],'json-proof')

    def test_semantic_case_identity_order_depth_and_completion_are_required(self):
        for change in ('name','order','depth','bool-depth','missing','status','extra'):
            value=self.semantic_result();cases=value['proof']['cases']
            if change=='name':cases[1]['name']='a different successful assertion'
            elif change=='order':cases[1],cases[2]=cases[2],cases[1]
            elif change=='depth':cases[1]['depth']=0
            elif change=='bool-depth':cases[1]['depth']=True
            elif change=='missing':cases.pop()
            elif change=='status':cases[1]['status']='failed'
            else:cases[1]['extra']=True
            self.assertEqual(self.complete(value)['code'],'json-cases',change)

    def test_semantic_roles_scope_and_honest_quality_flags_are_required(self):
        changes={'restrictedRoleValidated':False,'nativeExecuted':False,'pendingAssertions':True,
            'concurrencyScope':'many-user-load','multiUserLoadValidated':True,
            'semanticQualityMeasured':True,'lastObservedSqlFailure':{'caseIndex':1,'role':'owner','sqlState':'P0001'}}
        for key,replacement in changes.items():
            value=self.semantic_result();value['proof'][key]=replacement
            self.assertEqual(self.complete(value)['code'],'json-proof',key)

    def test_semantic_normal_physical_and_database_cleanup_are_required(self):
        for key in ('stopped','childExited','clientsClosed','physicalSettled','directoryRetained'):
            value=self.semantic_result();value['cleanup'][key]=False
            self.assertEqual(self.complete(value)['code'],'json-cleanup',key)
        for bad in ('0','01','4294967296','１２３',123,True):
            value=self.semantic_result();value['proof']['cleanup']['databases'][0]['oid']=bad
            self.assertEqual(self.complete(value)['code'],'json-cleanup',repr(bad))
        value=self.semantic_result();value['proof']['cleanup']['databases'][1]['oid']=value['proof']['cleanup']['databases'][0]['oid']
        self.assertEqual(self.complete(value)['code'],'json-cleanup')
        value=self.semantic_result();value['proof']['cleanup']['databases'][0]['pending']=True
        self.assertEqual(self.complete(value)['code'],'json-cleanup')

    def test_semantic_output_bounds_encoding_and_duplicate_fields(self):
        for stdout,stderr,exit_code,expected in (
            ('x',b'',0,'input-type'),(b'x'*262145,b'',0,'stdout-limit'),
            (b'{}\n',b'x'*65537,0,'stderr-limit'),(b'{}\n',b'',True,'exit-status'),
            (b'{}\n',b'',1,'exit-status'),(b'{}',b'',0,'json-encoding'),
            (b'{}\n{}\n',b'',0,'json-encoding'),(b'{"a":1,"a":1}\n',b'',0,'json-encoding'),
            (b'{"a":NaN}\n',b'',0,'json-encoding'),(b'\xff\n',b'',0,'json-encoding')):
            self.assertEqual(D.semantic_completion(stdout,stderr,exit_code)['code'],expected)

    def test_finite_native_error_is_retained_without_altering_first_failure(self):
        def controller(cls):
            value = object.__new__(cls)
            value.primary = value.cleanup = None
            return value
        original = controller(self.S.Controller)
        repaired = controller(D.diagnostic_controller_type(self.S, self.W))
        original.remember(self.W.BoundaryFailure('job-members'), fallback='execution-failure')
        repaired.remember(self.W.BoundaryFailure('job-members'), fallback='execution-failure')
        self.assertEqual(original.primary['code'], 'execution-failure')
        self.assertEqual(repaired.primary['code'], 'native-job-members')
        repaired.remember(self.I.Refusal('later-primary'))
        self.assertEqual(repaired.primary['code'], 'native-job-members')
        repaired.remember(self.W.BoundaryFailure('pipe-read'), cleanup=True)
        self.assertEqual(repaired.cleanup['code'], 'native-pipe-read')
        repaired.remember(self.I.Refusal('later-cleanup'), cleanup=True)
        self.assertEqual(repaired.cleanup['code'], 'native-pipe-read')

    def test_only_exact_allowlisted_exceptions_are_inspected(self):
        calls = []
        class Unknown(Exception):
            @property
            def code(self):
                calls.append(True)
                raise AssertionError('must not inspect')
        class Derived(self.W.BoundaryFailure):
            pass
        cls = D.diagnostic_controller_type(self.S, self.W)
        for error in [Unknown(), Derived('job-members'), self.W.BoundaryFailure('secret/unknown'), None, False, 0]:
            value = object.__new__(cls)
            value.primary = value.cleanup = None
            value.remember(error, fallback='execution-failure')
            self.assertEqual(value.primary['code'], 'execution-failure')
        self.assertEqual(calls, [])
        value = object.__new__(cls)
        value.primary = value.cleanup = None
        value.remember(self.I.Refusal('resource-floor', 'commitFree', 0))
        value.remember(self.W.BoundaryFailure('pipe-read'))
        self.assertEqual(value.primary, {'code':'resource-floor','counter':'commitFree','value':0})

    def _owned_run_test(self, callback):
        base = (D.REPO/'apps/local-service/data').resolve()
        with tempfile.TemporaryDirectory(dir=base, prefix='hierarchy-run-fs-') as generated:
            # Validate the automatic recursive cleanup target before the context
            # can exit. Only this newly created test directory may be removed.
            generated = Path(generated).resolve()
            self.assertTrue(generated.is_relative_to(base))
            self.assertTrue(generated.name.startswith('hierarchy-run-fs-'))
            with patch.object(D, 'RUNS_ROOT', generated/'runs'):
                run = D.OwnedRun(self.I)
                raw = b'{"synthetic":"filesystem-only"}\n'
                run.prepare(raw, hashlib.sha256(raw).hexdigest())
                callback(run)

    def test_owned_control_handles_partial_claim_then_exact_original_child(self):
        def check(run):
            pending = run.root/'child.pending'
            pending.touch(exist_ok=False)
            run.check(1234)
            pending.write_bytes(b'{')
            run.check(1234)
            claim = self.I.canonical_json({'schema':'hierarchy-native-child-claim',
                'nonce':run.nonce,'catalogSha256':hashlib.sha256(run.catalog).hexdigest(),
                'markerSha256':hashlib.sha256(run.marker).hexdigest(),'pid':1234})
            pending.write_bytes(claim)
            os.link(pending,run.root/'child.claim')
            run.check(1234)
            with self.assertRaises(self.I.Refusal):
                run.check(4321)
            run.check(1234)
        self._owned_run_test(check)

    def test_owned_control_rejects_changed_snapshot_without_replacing_it(self):
        def check(run):
            (run.root/'reviewed-sources.json').write_bytes(b'{"synthetic":"changed"}\n')
            with self.assertRaises(self.I.Refusal):
                run.check()
        self._owned_run_test(check)

    def test_legal_claim_publication_does_not_depend_on_atomic_directory_enumeration(self):
        def check(run):
            claim = self.I.canonical_json({'schema':'hierarchy-native-child-claim',
                'nonce':run.nonce,'catalogSha256':hashlib.sha256(run.catalog).hexdigest(),
                'markerSha256':hashlib.sha256(run.marker).hexdigest(),'pid':1234})
            (run.root/'child.pending').write_bytes(claim)
            os.link(run.root/'child.pending',run.root/'child.claim')
            run.check(1234)
            original = os.scandir
            @contextlib.contextmanager
            def incomplete_listing(path):
                with original(path) as entries:
                    yield (entry for entry in entries if entry.name not in {'child.pending','child.claim'})
            with patch.object(D.os, 'scandir', incomplete_listing):
                run.check(1234)
        self._owned_run_test(check)

    def test_owned_control_refuses_disappearing_attempt_and_unknown_entries(self):
        def check(run):
            pending = run.root/'child.pending'
            pending.touch(exist_ok=False)
            run.check()
            pending.unlink()
            with self.assertRaises(self.I.Refusal):
                run.check()
            # A new fresh run, not a repaired/reused attempt.
            other = D.OwnedRun(self.I)
            other.prepare(run.catalog, hashlib.sha256(run.catalog).hexdigest())
            (other.root/'unexpected').touch()
            with self.assertRaises(self.I.Refusal):
                other.check()
        self._owned_run_test(check)

    def private_result(self):
        value = self.semantic_result()
        value['schema'] = 'owner-restore-postgres-result/v1'
        groups = (
            ('Private restored schema and grant boundaries',[
                'Restored fixed schema9 identities and primary-key collations',
                'Restored owner and execute-only role boundaries']),
            ('Private full-data snapshot fingerprints',['Restored snapshot table: '+name for name in D.RESTORED_TABLES]),
            ('Private restored generated ordinal safety',['Restored identity and ordinal sequences cannot reuse stored keys']),
        )
        cases = []
        for name,children in groups:
            cases.append({'name':name,'depth':0,'status':'passed'})
            cases.extend({'name':child,'depth':1,'status':'passed'} for child in children)
        value['proof'] = {'schema':'owner-restore-postgres-proof/v1','status':'passed','primary':None,
            'cases':cases,'pendingAssertions':0,'ownerData':True,'syntheticOnly':False,
            'archiveAuthenticated':True,'receiptBound':True,'completeInput':True,'restoreVerified':True,
            'cleanup':value['proof']['cleanup']}
        return value

    def private_complete(self, value):
        return D.private_completion((json.dumps(value,separators=(',',':'))+'\n').encode(),b'',0)

    def test_private_completion_has_its_own_owner_data_ledger(self):
        value = self.private_result()
        report = self.private_complete(value)
        self.assertTrue(report['accepted'])
        self.assertEqual(report,self.S.checked_completion(report))
        self.assertEqual(sum(row['depth']==1 for row in value['proof']['cases']),22)
        self.assertEqual(len(D.RESTORED_TABLES),19)
        self.assertEqual(len(set(D.RESTORED_TABLES)),19)
        self.assertFalse(self.private_complete(self.semantic_result())['accepted'])
        self.assertFalse(self.complete(value)['accepted'])

    def test_private_requires_every_authentication_and_retirement_flag(self):
        for key in ('archiveAuthenticated','receiptBound','completeInput','restoreVerified','ownerData'):
            for bad in (False,1,None):
                value = self.private_result();value['proof'][key] = bad
                self.assertEqual(self.private_complete(value)['code'],'json-proof')
        for bad in (True,0,None):
            value = self.private_result();value['proof']['syntheticOnly'] = bad
            self.assertEqual(self.private_complete(value)['code'],'json-proof')
        for key in ('stopped','physicalSettled','clientsClosed','childExited'):
            value = self.private_result();value['cleanup'][key] = False
            self.assertEqual(self.private_complete(value)['code'],'json-cleanup')
        for key,bad in (('pending',True),('dropped',False),('oid','4294967296')):
            value = self.private_result();value['proof']['cleanup']['databases'][0][key] = bad
            self.assertEqual(self.private_complete(value)['code'],'json-cleanup')

    def test_private_refuses_missing_duplicate_reordered_or_semantic_cases(self):
        for change in ('missing','duplicate','order','bool-depth','semantic','extra'):
            value = self.private_result();cases = value['proof']['cases']
            if change == 'missing':cases.pop()
            elif change == 'duplicate':cases[4] = cases[5]
            elif change == 'order':cases[4],cases[5] = cases[5],cases[4]
            elif change == 'bool-depth':cases[4]['depth'] = True
            elif change == 'semantic':value['proof']['cases'] = self.semantic_result()['proof']['cases']
            else:cases[4]['payload'] = 'untrusted'
            self.assertEqual(self.private_complete(value)['code'],'json-cases',change)

    def test_closed_private_cli_cannot_select_a_path_or_host(self):
        seen = []
        def fake_execute(digest,private):
            seen.append((digest,private));return {'accepted':True}
        with patch.object(D,'execute',fake_execute),contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(D.main(['a'*64]),0)
            self.assertEqual(D.main(['private-restore','b'*64]),0)
            for args in (['private-restore'],['restore','a'*64],['private-restore','a'*64,'D:/other'],
                ['private-restore','A'*64],['private-restore','http://localhost']):
                self.assertEqual(D.main(args),2)
        self.assertEqual(seen,[('a'*64,False),('b'*64,True)])

    def test_private_control_uses_separate_purpose_and_claim(self):
        def check(normal):
            with patch.object(D,'PRIVATE_RUNS_ROOT',normal.root/'private-runs'):
                run = D.OwnedRun(self.I,True)
                run.prepare(normal.catalog,hashlib.sha256(normal.catalog).hexdigest())
                self.assertNotEqual(run.runs_root,normal.runs_root)
                self.assertEqual(json.loads(run.marker)['schema'],'private-hierarchy-native-owned-run')
                claim = self.I.canonical_json({'schema':'private-hierarchy-native-child-claim',
                    'nonce':run.nonce,'catalogSha256':hashlib.sha256(run.catalog).hexdigest(),
                    'markerSha256':hashlib.sha256(run.marker).hexdigest(),'pid':1234})
                (run.root/'child.pending').write_bytes(claim)
                os.link(run.root/'child.pending',run.root/'child.claim')
                run.check(1234)
                wrong = json.loads(claim);wrong['schema'] = normal.claim_schema
                (run.root/'child.pending').write_bytes(self.I.canonical_json(wrong))
                with self.assertRaises(self.I.Refusal):run.check(1234)
        self._owned_run_test(check)

    def _inputs_test(self, callback):
        def check(run):
            filename = run.root/'invented-encrypted-input'
            raw = b'pure-invented-encrypted-bytes'
            filename.write_bytes(raw)
            streams = []
            def opener(path):
                stream = path.open('rb',buffering=0);streams.append(stream);return stream
            guard = D.PrivateInputs(self.I,opener=opener,clock=lambda:D.STARTED+1)
            with patch.object(D,'PRIVATE_INPUTS',((filename,len(raw),hashlib.sha256(raw).hexdigest()),)):
                try:callback(guard,streams,filename)
                finally:guard.close()
            self.assertTrue(all(s.closed for s in streams))
        self._owned_run_test(check)

    def test_private_inputs_remain_open_until_verified_final_retirement(self):
        def check(guard,streams,filename):
            guard.prepare();guard.check()
            self.assertFalse(streams[0].closed)
            self.assertFalse(guard.verified)
            guard.finish(D.STARTED+20)
            self.assertTrue(guard.verified)
            self.assertTrue(guard.closed)
            guard.close()
            with self.assertRaises(self.I.Refusal):guard.check()
        self._inputs_test(check)

    def test_private_hash_change_and_original_deadline_refuse(self):
        def check(guard,streams,filename):
            guard.prepare()
            filename.write_bytes(b'mutated')
            with self.assertRaises(self.I.Refusal):guard.check()
            self.assertFalse(guard.verified)
        self._inputs_test(check)
        def expired(guard,streams,filename):
            guard.clock = lambda:D.STARTED+361
            with self.assertRaises(self.I.Refusal):guard.prepare()
            self.assertEqual(streams,[])
        self._inputs_test(expired)

    def test_private_open_and_fstat_failures_close_all_original_handles(self):
        def failed_stat(guard,streams,filename):
            with patch.object(D.os,'fstat',side_effect=OSError('invented-stat-failure')):
                with self.assertRaises(OSError):guard.prepare()
            self.assertEqual(len(streams),1)
            self.assertTrue(streams[0].closed)
            self.assertFalse(guard.verified)
        self._inputs_test(failed_stat)
        def failed_open(guard,streams,filename):
            guard.opener = lambda _: (_ for _ in ()).throw(PermissionError('invented'))
            with self.assertRaises(PermissionError):guard.prepare()
            self.assertEqual(streams,[])
        self._inputs_test(failed_open)

    def test_wrong_encrypted_input_digest_closes_handle_and_never_verifies(self):
        def check(guard,streams,filename):
            size = filename.stat().st_size
            with patch.object(D,'PRIVATE_INPUTS',((filename,size,'0'*64),)):
                with self.assertRaises(self.I.Refusal):guard.prepare()
            self.assertTrue(streams[0].closed)
            self.assertFalse(guard.verified)
        self._inputs_test(check)

    def test_failed_final_close_cannot_authorize_private_completion(self):
        def check(guard,streams,filename):
            original = guard.opener
            class FailCloseOnce:
                def __init__(self,stream):self.stream,self.failed = stream,False
                def __getattr__(self,name):return getattr(self.stream,name)
                def close(self):
                    if not self.failed:
                        self.failed = True
                        raise OSError('invented-close-failure')
                    self.stream.close()
            guard.opener = lambda path:FailCloseOnce(original(path))
            guard.prepare()
            with self.assertRaises(OSError):guard.finish(D.STARTED+20)
            self.assertFalse(guard.verified)
            self.assertFalse(guard.closed)
            guard.close()
            self.assertTrue(guard.closed)
        self._inputs_test(check)

    def test_private_launch_cannot_choose_other_entry_or_inherit_credentials(self):
        run = types.SimpleNamespace(output=D.PRIVATE_RUNS_ROOT/('run-'+'b'*48)/'output',private=True)
        seen = []
        def create_process(executable,command,ps,ts,inherit,flags,environment,cwd,startup,info):
            seen.append(command.value)
            self.assertEqual(executable,D.NODE)
            self.assertEqual(flags,0x8040C)
            self.assertIs(inherit,True)
            values = dict(item.split('=',1) for item in environment[:].split('\0') if item)
            self.assertEqual(set(values),{'OMP_NUM_THREADS','PATH','SystemRoot','TEMP','TMP','UV_THREADPOOL_SIZE','WINDIR'})
            self.assertEqual(values['TEMP'],str(run.output/'temp'))
            info._obj.process,info._obj.thread,info._obj.pid = 111,222,333
            return True
        api = object.__new__(D.native_api_type(self.W,run))
        api.m,api.k = self.B,types.SimpleNamespace(CreateProcessW=create_process)
        api.create_process((ctypes.create_string_buffer(16),None),11,12,13)
        self.assertEqual(seen,['"'+D.NODE+'" --max-old-space-size=64 "'+str(D.REPO/D.PRIVATE_ENTRY)+'"'])

    def test_private_tree_can_hold_real_database_without_raising_default_bound(self):
        def check(private,size):
            run = types.SimpleNamespace(cluster=Path('D:/invented-only/cluster'),private=private)
            tree = D.cluster_tree_type(self.S,self.I,run)()
            tree.prepared = True
            directory = tree.parent/'nhpg-invented'
            directory_stat = lambda path:types.SimpleNamespace(st_dev=1,st_ino=1 if path==tree.parent else 2)
            tree.directory_info = directory_stat
            data_stat = types.SimpleNamespace(st_mode=stat.S_IFREG,st_size=size)
            top = types.SimpleNamespace(name='nhpg-invented')
            data = types.SimpleNamespace(name='invented-table',path=str(directory/'invented-table'),stat=lambda **_:data_stat)
            @contextlib.contextmanager
            def scan(path):yield iter([top] if path==tree.parent else [data])
            with patch.object(D.os,'scandir',scan),patch.object(D.os.path,'lexists',side_effect=lambda path:path==tree.parent):
                tree.check()
        check(True,700*D.MIB)
        with self.assertRaises(self.I.Refusal):check(False,700*D.MIB)
        check(True,6144*D.MIB)
        with self.assertRaises(self.I.Refusal):check(True,6144*D.MIB+1)

    def test_bad_input_and_failed_close_preserve_original_input_failure(self):
        def check(guard,streams,filename):
            original = guard.opener
            class FailCloseOnce:
                def __init__(self,stream):self.stream,self.failed = stream,False
                def __getattr__(self,name):return getattr(self.stream,name)
                def close(self):
                    if not self.failed:
                        self.failed = True
                        raise OSError('invented-secondary-close')
                    self.stream.close()
            guard.opener = lambda path:FailCloseOnce(original(path))
            with patch.object(D,'PRIVATE_INPUTS',((filename,filename.stat().st_size,'0'*64),)):
                with self.assertRaises(self.I.Refusal) as observed:guard.prepare()
            self.assertEqual(observed.exception.metadata['code'],'private-input-pin')
            self.assertTrue(guard.close_failed)
            self.assertFalse(guard.verified)
            guard.close()
        self._inputs_test(check)

    def test_final_input_close_failure_preserves_failed_controller_publication(self):
        events = []
        I,S = self.I,self.S
        class FakeInputs:
            closed = close_failed = False
            def __init__(self,*args):pass
            def prepare(self):events.append('input-held')
            def check(self):pass
            def close(self):events.append('close-refused');raise OSError('invented-close')
        class FakeCatalog:
            raw = b'{}'
            def __init__(self,*args):pass
            def authenticate(self):pass
            def end_pins(self):pass
        class FakeRun:
            output,cluster = Path('D:/invented/output'),Path('D:/invented/cluster')
            def __init__(self,*args):pass
            def prepare(self,*args):pass
            def check(self,*args):pass
        class FakePublisher:
            prepared = False
            def prepare(self):self.prepared = True
            def check(self):pass
            def publish(self,result,stdout,stderr,checkpoint):
                checkpoint();events.append(('published',result,stdout,stderr))
        class FakeTree:
            def prepare(self):pass
            def check(self):pass
        class FakeController:
            remember = S.Controller.remember
            def __init__(self,**ports):
                self.ports,self.primary,self.cleanup = ports,None,None
                self.boundary,self.normal_deadline = None,None
                self.buffers = {'stdout':b'invented-failure','stderr':b''}
            def now(self,*args):pass
            def run(self):
                self.ports['authenticate']()
                self.primary = {'code':'original-controller-failure','counter':None,'value':None}
                events.append('original-retired')
                return {'accepted':False,'primary':self.primary,'cleanup':None}
        baseline = types.SimpleNamespace(abi=lambda:{'valid':True},WindowsNative=lambda:types.SimpleNamespace(resources=lambda _: {'dFree':11264*D.MIB}))
        libraries = {'supervisor':S,'windows':self.W,'baseline':baseline}
        with patch.object(D,'load_pinned',side_effect=lambda name:libraries[name]),patch.object(D,'catalog_type',return_value=FakeCatalog),\
            patch.object(D,'OwnedRun',FakeRun),patch.object(D,'PrivateInputs',FakeInputs),\
            patch.object(D,'publisher_type',return_value=FakePublisher),patch.object(D,'cluster_tree_type',return_value=FakeTree),\
            patch.object(D,'diagnostic_controller_type',return_value=FakeController):
            result = D.execute('a'*64,True)
        self.assertFalse(result['accepted'])
        self.assertEqual(result['primary']['code'],'original-controller-failure')
        self.assertEqual(result['cleanup']['code'],'private-input-close')
        self.assertEqual(events[:3],['input-held','original-retired','close-refused'])
        self.assertEqual(events[3],('published',result,b'invented-failure',b''))


if __name__ == '__main__':
    unittest.main()
