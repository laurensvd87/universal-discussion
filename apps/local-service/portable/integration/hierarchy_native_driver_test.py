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
        class DefaultLaunchInverse(ast.NodeTransformer):
            def visit_Assign(self,node):
                if len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id=='command':
                    node.value=ast.parse("'\"' + NODE + '\" --max-old-space-size=64 \"' + str(REPO / ENTRY) + '\"'",mode='eval').body
                if (len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id=='environment'
                        and isinstance(node.value,ast.BinOp) and isinstance(node.value.op,ast.Add)
                        and isinstance(node.value.left,ast.Name) and node.value.left.id=='ENV_PREFIX'):
                    node.value = node.value.right
                return self.generic_visit(node)
        self.assertEqual(ast.dump(find(old), include_attributes=False), ast.dump(DefaultLaunchInverse().visit(find(new)), include_attributes=False))
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
        pending, seen = [D.ENTRY,D.PRIVATE_ENTRY,D.HTTP_ENTRY], set()
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
                    # These exact imports belong to function source serialized
                    # into the actual extension page, not the Node harness.
                    browser_imports={
                        './discussion-panel.js':'chromium/discussion-panel.js',
                        './semantic-topic-workspace.js':'chromium/semantic-topic-workspace.js',
                        './semantic-topic-panel.js':'chromium/semantic-topic-panel.js',
                        './canonical-history-panel.js':'chromium/canonical-history-panel.js',
                        '../core/local-discussion-controller.js':'core/local-discussion-controller.js',
                        '../core/local-service-client.js':'core/local-service-client.js',
                        '../core/account-client.js':'core/account-client.js',
                        '../fixtures/indicator-fixtures.js':'fixtures/indicator-fixtures.js',
                        '../core/insight-controller.js':'core/insight-controller.js',
                    }
                    if key=='apps/local-service/harness/run-semantic-workspace-browser-smoke.js' and name in browser_imports:
                        target=D.REPO/'spikes/topic-resolution/browser'/browser_imports[name]
                    self.assertTrue(target.is_relative_to(D.REPO))
                    self.assertTrue(target.is_file(), name)
                    relative = target.relative_to(D.REPO).as_posix()
                    self.assertTrue(relative in maintained, relative)
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
        # Every intermediate Node package scope is either pinned or required
        # absent. A later package.json cannot silently change module parsing.
        for key in seen:
            for parent in Path(key).parents:
                scope = (parent/'package.json').as_posix()
                self.assertTrue(scope in maintained or scope in self.I.scope_absences()
                                or scope in D.NORMAL_SCOPE_ABSENCES, scope)
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
                'pendingAssertions':0,'cases':cases,
                'publicSubjectCases':[{'name':name,'status':'passed'} for name in json.loads((D.REPO/D.PUBLIC_SUBJECT_LEDGER).read_bytes())],
                'publicSourceBindingCases':[{'name':name,'status':'passed'} for name in json.loads((D.REPO/D.PUBLIC_SOURCE_LEDGER).read_bytes())],
                'automaticSubjectCases':[{'name':name,'status':'passed'} for name in json.loads((D.REPO/D.AUTOMATIC_SUBJECT_LEDGER).read_bytes())],
                'automaticRetrievalCases':[{'name':name,'status':'passed'} for name in json.loads((D.REPO/D.AUTOMATIC_RETRIEVAL_LEDGER).read_bytes())],
                'automaticAuthorContextCases':[{'name':name,'status':'passed'} for name in json.loads((D.REPO/D.AUTOMATIC_AUTHOR_CONTEXT_LEDGER).read_bytes())],
                'automaticAuthorInsightCases':[{'name':name,'status':'passed'} for name in json.loads((D.REPO/D.AUTOMATIC_AUTHOR_INSIGHT_LEDGER).read_bytes())],
                'automaticTopicFeedCases':[{'name':name,'status':'passed'} for name in json.loads((D.REPO/D.AUTOMATIC_TOPIC_FEED_LEDGER).read_bytes())],
                'automaticTopicPublicCases':[{'name':name,'status':'passed'} for name in json.loads((D.REPO/D.AUTOMATIC_TOPIC_PUBLIC_LEDGER).read_bytes())],
                'restrictedRoleValidated':True,
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

    def test_public_subject_cases_cannot_be_missing_reordered_or_borrowed(self):
        for change in ('missing','partial','order','name','status','extra'):
            value=self.semantic_result()
            rows=value['proof']['publicSubjectCases']
            if change=='missing':del value['proof']['publicSubjectCases']
            elif change=='partial':rows.pop()
            elif change=='order':rows[0],rows[1]=rows[1],rows[0]
            elif change=='name':rows[0]['name']='borrowed semantic case'
            elif change=='status':rows[0]['status']='skipped'
            elif change=='extra':rows[0]['extra']=True
            self.assertFalse(self.complete(value)['accepted'])

    def test_public_source_cases_cannot_borrow_metadata_or_omit_concurrency(self):
        for change in ('missing','partial','order','name','status','extra'):
            value=self.semantic_result();rows=value['proof']['publicSourceBindingCases']
            if change=='missing':del value['proof']['publicSourceBindingCases']
            elif change=='partial':rows.pop()
            elif change=='order':rows[0],rows[1]=rows[1],rows[0]
            elif change=='name':rows[0]['name']=value['proof']['publicSubjectCases'][0]['name']
            elif change=='status':rows[6]['status']='skipped'
            elif change=='extra':rows[0]['extra']=True
            self.assertFalse(self.complete(value)['accepted'])

    def test_general_subject_cases_cannot_borrow_wikipedia_or_omit_erasure(self):
        for change in ('missing','partial','order','name','status','extra'):
            value=self.semantic_result();rows=value['proof']['automaticSubjectCases']
            if change=='missing':del value['proof']['automaticSubjectCases']
            elif change=='partial':rows.pop()
            elif change=='order':rows[0],rows[1]=rows[1],rows[0]
            elif change=='name':rows[0]['name']=value['proof']['publicSubjectCases'][0]['name']
            elif change=='status':rows[7]['status']='skipped'
            elif change=='extra':rows[0]['extra']=True
            self.assertFalse(self.complete(value)['accepted'])

    def test_indexed_retrieval_cases_cannot_omit_current_coordinator_or_parent_checks(self):
        for change in ('missing','partial','order','name','status','extra'):
            value=self.semantic_result();rows=value['proof']['automaticRetrievalCases']
            if change=='missing':del value['proof']['automaticRetrievalCases']
            elif change=='partial':rows.pop()
            elif change=='order':rows[0],rows[1]=rows[1],rows[0]
            elif change=='name':rows[0]['name']=value['proof']['automaticSubjectCases'][0]['name']
            elif change=='status':rows[7]['status']='skipped'
            elif change=='extra':rows[0]['extra']=True
            self.assertFalse(self.complete(value)['accepted'])

    def test_authored_context_cases_require_exact_completion_and_identity(self):
        for change in ('missing','partial','order','name','status','extra'):
            value=self.semantic_result();rows=value['proof']['automaticAuthorContextCases']
            if change=='missing':del value['proof']['automaticAuthorContextCases']
            elif change=='partial':rows.pop()
            elif change=='order':rows[0],rows[1]=rows[1],rows[0]
            elif change=='name':rows[0]['name']=value['proof']['automaticRetrievalCases'][0]['name']
            elif change=='status':rows[7]['status']='skipped'
            elif change=='extra':rows[0]['extra']=True
            self.assertFalse(self.complete(value)['accepted'])

    def test_authored_ai_reports_require_all_exact_completed_cases(self):
        for change in ('missing','partial','order','name','status','extra'):
            value=self.semantic_result();rows=value['proof']['automaticAuthorInsightCases']
            if change=='missing':del value['proof']['automaticAuthorInsightCases']
            elif change=='partial':rows.pop()
            elif change=='order':rows[0],rows[1]=rows[1],rows[0]
            elif change=='name':rows[0]['name']=value['proof']['automaticAuthorContextCases'][0]['name']
            elif change=='status':rows[5]['status']='skipped'
            elif change=='extra':rows[0]['extra']=True
            self.assertFalse(self.complete(value)['accepted'])

    def test_named_feed_reports_require_every_distinct_completed_case(self):
        for change in ('missing','partial','order','name','status','extra'):
            value=self.semantic_result();rows=value['proof']['automaticTopicFeedCases']
            if change=='missing':del value['proof']['automaticTopicFeedCases']
            elif change=='partial':rows.pop()
            elif change=='order':rows[0],rows[1]=rows[1],rows[0]
            elif change=='name':rows[0]['name']=value['proof']['automaticAuthorContextCases'][0]['name']
            elif change=='status':rows[5]['status']='skipped'
            elif change=='extra':rows[0]['extra']=True
            self.assertFalse(self.complete(value)['accepted'])

    def test_public_topic_bridge_requires_all_exact_completed_cases(self):
        for change in ('missing','partial','order','name','status','extra'):
            value=self.semantic_result();rows=value['proof']['automaticTopicPublicCases']
            if change=='missing':del value['proof']['automaticTopicPublicCases']
            elif change=='partial':rows.pop()
            elif change=='order':rows[0],rows[1]=rows[1],rows[0]
            elif change=='name':rows[0]['name']=value['proof']['automaticTopicFeedCases'][0]['name']
            elif change=='status':rows[6]['status']='skipped'
            elif change=='extra':rows[0]['extra']=True
            self.assertFalse(self.complete(value)['accepted'])

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

    def test_private_job_guard_inverse_changes_only_cpu_ceiling(self):
        normal = D.diagnostic_controller_type(self.S,self.W)
        private = D.diagnostic_controller_type(self.S,self.W,True)
        self.assertIs(normal.job,self.S.Controller.job)
        old = ast.parse((HERE/'hierarchy-native-supervisor.py').read_bytes())
        new = ast.parse(source.read_bytes())
        find = lambda tree:next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='job')
        class Inverse(ast.NodeTransformer):
            changed = 0
            def visit_Compare(self,node):
                if (isinstance(node.left,ast.Name) and node.left.id=='cpu' and len(node.ops)==1
                        and isinstance(node.ops[0],ast.LtE) and len(node.comparators)==1
                        and isinstance(node.comparators[0],ast.Constant) and node.comparators[0].value==300):
                    node.comparators[0].value = 60
                    self.changed += 1
                return self.generic_visit(node)
        inverse = Inverse();adapted = inverse.visit(find(new))
        self.assertEqual(inverse.changed,1)
        self.assertEqual(ast.dump(find(old),include_attributes=False),ast.dump(adapted,include_attributes=False))
        self.assertIs(D.native_api_type(self.W,self.owned_paths).set_limits,self.W._WinAPI.set_limits)
        self.assertIs(private.host,self.S.Controller.host)

    def _job_subject(self,private,cpu=60):
        row = {'cpu':cpu,'committed':1024*D.MIB,'accounting':{'totalProcesses':1,'activeProcesses':1,
            'totalTerminatedProcesses':0,'user100ns':round(cpu*10000000),'kernel100ns':0},
            'physicalFree':1024*D.MIB,'commitFree':1024*D.MIB,'cFree':2048*D.MIB,'dFree':4096*D.MIB}
        cls = D.diagnostic_controller_type(self.S,self.W,private)
        value = object.__new__(cls)
        value.boundary = types.SimpleNamespace(sample=lambda:row)
        value.last_cpu,value.last_peak,value.last_accounting = 0,0,None
        value.job_memory_bytes = 1024*D.MIB
        return value,row

    def test_private_truthful_cpu_samples_and_default_limit_are_separate(self):
        for private,cpu,accepted in ((False,60,True),(False,60.015625,False),
                (True,60.015625,True),(True,300,True),(True,300.000001,False)):
            value,row = self._job_subject(private,cpu)
            if accepted:
                value.job()
                self.assertEqual(value.last_cpu,cpu)
            else:
                with self.assertRaises(self.I.Refusal) as observed:value.job()
                self.assertEqual(observed.exception.metadata,{'code':'resource-limit','counter':'jobCpuSeconds','value':cpu})

    def test_private_cpu_policy_keeps_accounting_memory_process_and_all_floors(self):
        for fault in ('accounting','cpu-regression','peak-regression','account-regression','processes','memory',
                'physicalFree','commitFree','cFree','dFree'):
            value,row = self._job_subject(True,100)
            if fault=='accounting':row['cpu'] = 100.1
            elif fault=='cpu-regression':value.last_cpu = 101
            elif fault=='peak-regression':value.last_peak = row['committed']+1
            elif fault=='account-regression':value.last_accounting = {**row['accounting'],'totalProcesses':2}
            elif fault=='processes':row['accounting'].update(activeProcesses=33,totalProcesses=33)
            elif fault=='memory':row['committed'] += 1
            else:row[fault] -= 1
            with self.assertRaises(self.I.Refusal,msg=fault):value.job()

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

    def private_complete(self, value, upgrade=False):
        return D.private_completion((json.dumps(value,separators=(',',':'))+'\n').encode(),b'',0,upgrade)

    def upgrade_result(self):
        value = self.private_result()
        value['schema'] = 'owner-upgrade-postgres-result/v1'
        proof = value['proof']
        proof['schema'] = 'owner-upgrade-postgres-proof/v1'
        del proof['restoreVerified']
        proof.update(migratedLegacyDataVerified=True,schema9RecoveryRepeated=False,
                     schemaVersion=17,preservedLegacyTables=18)
        proof['cases'] = []
        for name,children in D.UPGRADE_GROUPS:
            proof['cases'].append({'name':name,'depth':0,'status':'passed'})
            proof['cases'].extend({'name':child,'depth':1,'status':'passed'} for child in children)
        return value

    def test_upgrade_proof_accepts_only_its_final_data_claim_and_own_ledger(self):
        value = self.upgrade_result()
        report = self.private_complete(value,True)
        self.assertTrue(report['accepted'])
        self.assertEqual(report,self.S.checked_completion(report))
        self.assertEqual((report['testPoints'],report['outerTests']),(25,3))
        self.assertFalse(self.private_complete(value)['accepted'])
        self.assertFalse(self.private_complete(self.private_result(),True)['accepted'])
        self.assertFalse(self.private_complete(self.semantic_result(),True)['accepted'])
        value['proof']['cases'] = self.private_result()['proof']['cases']
        self.assertEqual(self.private_complete(value,True)['code'],'json-cases')

    def test_upgrade_proof_refuses_recovery_aliases_missing_data_and_weakened_retirement(self):
        faults = (
            ('migratedLegacyDataVerified',False),('migratedLegacyDataVerified',1),
            ('schema9RecoveryRepeated',True),('schema9RecoveryRepeated',0),
            ('schemaVersion',9),('schemaVersion',17.0),('preservedLegacyTables',17),
            ('archiveAuthenticated',False),('receiptBound',False),('completeInput',False),
        )
        for key,bad in faults:
            value = self.upgrade_result();value['proof'][key] = bad
            self.assertEqual(self.private_complete(value,True)['code'],'json-proof',key)
        for fault in ('missing-table','duplicate-table','wrong-order','bool-depth','old-field','missing-field','pending'):
            value = self.upgrade_result();proof = value['proof']
            if fault=='missing-table':proof['cases'].pop(10)
            elif fault=='duplicate-table':proof['cases'][10] = proof['cases'][11]
            elif fault=='wrong-order':proof['cases'][10:12] = reversed(proof['cases'][10:12])
            elif fault=='bool-depth':proof['cases'][10]['depth'] = True
            elif fault=='old-field':proof['restoreVerified'] = True
            elif fault=='missing-field':del proof['schema9RecoveryRepeated']
            else:proof['cleanup']['databases'][0]['pending'] = 1
            self.assertFalse(self.private_complete(value,True)['accepted'],fault)
        self.assertEqual(self.private_complete(self.upgrade_result(),1)['code'],'purpose-type')

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
        def fake_execute(digest,private,http):
            seen.append((digest,private,http));return {'accepted':True}
        with patch.object(D,'execute',fake_execute),contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(D.main(['a'*64]),0)
            self.assertEqual(D.main(['private-restore','b'*64]),0)
            self.assertEqual(D.main(['private-http','c'*64]),0)
            for args in (['private-restore'],['restore','a'*64],['private-restore','a'*64,'D:/other'],
                ['private-restore','A'*64],['private-restore','http://localhost'],['private-http'],
                ['private-http','a'*64,'extra'],['private-http','A'*64]):
                self.assertEqual(D.main(args),2)
        self.assertEqual(seen,[('a'*64,False,False),('b'*64,True,False),('c'*64,True,True)])

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
            self.assertEqual(set(values),{'LOCALAPPDATA','OMP_NUM_THREADS','PATH','SystemRoot','TEMP','TMP','UV_THREADPOOL_SIZE','WINDIR'})
            self.assertEqual(values['LOCALAPPDATA'],'C:\\Users\\Laurens\\AppData\\Local')
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
            def __init__(self,*args,**kwargs):pass
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
        class FakePhases:
            def __init__(self,*args):pass
            def check(self):pass
            def complete(self):pass
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
            patch.object(D,'PrivatePhases',FakePhases),\
            patch.object(D,'publisher_type',return_value=FakePublisher),patch.object(D,'cluster_tree_type',return_value=FakeTree),\
            patch.object(D,'diagnostic_controller_type',return_value=FakeController):
            result = D.execute('a'*64,True)
        self.assertFalse(result['accepted'])
        self.assertEqual(result['primary']['code'],'original-controller-failure')
        self.assertEqual(result['cleanup']['code'],'private-input-close')
        self.assertEqual(events[:3],['input-held','original-retired','close-refused'])
        self.assertEqual(events[3],('published',result,b'invented-failure',b''))

    def _phase_test(self,callback,upgrade=False):
        def check(run):
            run.output.mkdir()
            phases = D.PrivatePhases(self.I,run,upgrade)
            stages = D.UPGRADE_PHASES if upgrade else D.PRIVATE_PHASES
            def publish(index,elapsed=None):
                value = {'schema':'private-owner-upgrade-phase/v1' if upgrade else 'private-owner-restore-phase/v1',
                    'ordinal':index,'stage':stages[index],'elapsedMs':index if elapsed is None else elapsed}
                pending = run.output/('phase-%02d.pending'%index)
                pending.write_bytes(self.I.canonical_json(value))
                os.link(pending,run.output/('phase-%02d.json'%index))
            callback(run,phases,publish)
        self._owned_run_test(check)

    def test_upgrade_requires_all_35_own_phases_including_application_and_retirement(self):
        def check(run,phases,publish):
            self.assertEqual(len(D.UPGRADE_PHASES),35)
            self.assertEqual(D.UPGRADE_PHASES[8:12],('schema9-identity-verified','schema9-grants-verified',
                'hierarchy17-installed','hierarchy17-manifest-verified'))
            self.assertEqual(D.UPGRADE_PHASES[30:32],('migrated-sequences-verified','application-verified'))
            for index in range(33):publish(index)
            phases.check()
            with self.assertRaises(self.I.Refusal):phases.complete()
            publish(33);publish(34);phases.complete()
            self.assertEqual(len(phases.closed),35)
            with self.assertRaises(self.I.Refusal):D.PrivatePhases(self.I,run).check()
        self._phase_test(check,True)

    def test_upgrade_phase_reader_refuses_old_schema_even_with_shared_prefix(self):
        def check(run,phases,publish):
            publish(0)
            p = run.output/'phase-00.pending';value = json.loads(p.read_bytes())
            value['schema'] = 'private-owner-restore-phase/v1';p.write_bytes(self.I.canonical_json(value))
            with self.assertRaises(self.I.Refusal):phases.check()
        self._phase_test(check,True)

    def test_closed_private_phase_prefix_accepts_complete_history_and_partial_next_write(self):
        def check(run,phases,publish):
            phases.check()
            self.assertEqual(phases.closed,[])
            pending = run.output/'phase-00.pending'
            pending.touch()
            phases.check()
            pending.write_bytes(b'{')
            phases.check()
            publish(0)
            phases.check()
            self.assertEqual(len(phases.closed),1)
            with self.assertRaises(self.I.Refusal):phases.complete()
            for index in range(1,len(D.PRIVATE_PHASES)):publish(index)
            phases.complete()
            self.assertEqual(len(phases.closed),33)
        self._phase_test(check)

    def test_phase_schema_identity_clock_and_permanent_publication_are_required(self):
        for fault in ('schema','stage','bool-ordinal','clock','hardlink','changed','missing','unknown'):
            def check(run,phases,publish):
                publish(0);phases.check()
                final,pending = run.output/'phase-00.json',run.output/'phase-00.pending'
                if fault=='hardlink':
                    final.unlink();final.write_bytes(pending.read_bytes())
                elif fault=='missing':final.unlink()
                elif fault=='unknown':(run.output/'phase-99.pending').touch()
                else:
                    value = json.loads(pending.read_bytes())
                    if fault=='schema':value['schema']='semantic-phase'
                    elif fault=='stage':value['stage']='restore-passed'
                    elif fault=='bool-ordinal':value['ordinal']=False
                    elif fault=='clock':value['elapsedMs']=-1
                    else:value['elapsedMs']=1
                    pending.write_bytes(self.I.canonical_json(value))
                with self.assertRaises(self.I.Refusal,msg=fault):phases.check()
            self._phase_test(check)

    def http_proof(self):
        return {'schema':'private-application-http-proof/v1','status':'passed',
            'cases':[{'name':name,'status':'passed'} for name in D.HTTP_CASES],
            'pendingCases':0,'server':{'destinationPort':4185,'canonicalHost':'127.0.0.1:4174','loopbackOnly':True},
            'counts':{'httpRequests':30,'maximumConcurrentHttp':4,'fixtureActors':2},
            'cleanup':{'serverClosed':True,'applicationClosed':True,'appClientClosed':True,'urlClientClosed':True,
                'pendingHttp':0,'pendingDatabase':0},
            'scope':{'realHttp':True,'realDatabase':True,'browser':False,'encoder':False,'provider':False,
                'externalLoginVerified':False,'productionCapacityValidated':False,'testComposition':False},
            'failure':None,'elapsedMs':1000,
            'upgrade':{'schemaVersion':17,'preservedLegacyTables':18,'legacyRowsUnchanged':True}}

    def _http_proof_test(self,callback):
        def check(run):
            run.output.mkdir()
            value = self.http_proof()
            def publish(value):
                pending = run.output/'application-proof.pending.json'
                pending.write_bytes(self.I.canonical_json(value))
                os.link(pending,run.output/'application-proof.json')
            callback(run,D.PrivateHttpProof(self.I,run),value,publish)
        self._owned_run_test(check)

    def test_http_evidence_requires_own_closed_proof_and_preserves_its_identity(self):
        def check(run,proof,value,publish):
            proof.check()
            with self.assertRaises(FileNotFoundError):proof.complete()
            publish(value);proof.complete();proof.check()
            self.assertIsNotNone(proof.digest)
            final,pending = run.output/'application-proof.json',run.output/'application-proof.pending.json'
            raw = final.read_bytes()
            final.rename(run.output/'retained-original-proof.json');pending.unlink()
            pending.write_bytes(raw);os.link(pending,final)
            with self.assertRaises(self.I.Refusal):proof.check()
        self._http_proof_test(check)

    def test_http_proof_refuses_weakened_data_scope_retirement_and_cases(self):
        for fault in ('missing-case','reordered-case','failed-case','failed-status','pending',
                'fixture','encoder','provider','browser','capacity','external-login','real-database',
                'wrong-destination','wrong-host','wrong-upgrade','not-preserved','unclosed','pending-db','extra'):
            def check(run,proof,value,publish):
                if fault=='missing-case':value['cases'].pop()
                elif fault=='reordered-case':value['cases'].reverse()
                elif fault=='failed-case':value['cases'][0]['status']='failed'
                elif fault=='failed-status':value['status']='failed'
                elif fault=='pending':value['pendingCases']=True
                elif fault in ('encoder','provider','browser'):value['scope'][fault]=True
                elif fault=='fixture':value['scope']['testComposition']=True
                elif fault=='capacity':value['scope']['productionCapacityValidated']=True
                elif fault=='external-login':value['scope']['externalLoginVerified']=True
                elif fault=='real-database':value['scope']['realDatabase']=False
                elif fault=='wrong-destination':value['server']['destinationPort']=4174
                elif fault=='wrong-host':value['server']['canonicalHost']='127.0.0.1:4185'
                elif fault=='wrong-upgrade':value['upgrade']['schemaVersion']=9
                elif fault=='not-preserved':value['upgrade']['legacyRowsUnchanged']=False
                elif fault=='unclosed':value['cleanup']['serverClosed']=False
                elif fault=='pending-db':value['cleanup']['pendingDatabase']=True
                else:value['rawPayload']='forbidden'
                publish(value)
                with self.assertRaises(self.I.Refusal,msg=fault):proof.complete()
            self._http_proof_test(check)

    def test_http_mode_is_private_and_uses_only_its_fixed_reviewed_entry(self):
        with self.assertRaises(self.I.Refusal):D.OwnedRun(self.I,False,True)
        run = types.SimpleNamespace(output=D.PRIVATE_RUNS_ROOT/('run-'+'c'*48)/'output',private=True,http=True)
        seen = []
        def launch(executable,command,ps,ts,inherit,flags,environment,cwd,startup,info):
            seen.append(command.value);self.assertEqual(flags,0x8040C)
            info._obj.process,info._obj.thread,info._obj.pid = 111,222,333
            return True
        api = object.__new__(D.native_api_type(self.W,run))
        api.m,api.k = self.B,types.SimpleNamespace(CreateProcessW=launch)
        api.create_process((ctypes.create_string_buffer(16),None),11,12,13)
        self.assertEqual(seen,['"'+D.NODE+'" --max-old-space-size=64 "'+str(D.REPO/D.HTTP_ENTRY)+'"'])

    def test_closed_model_mode_cannot_be_selected_by_path_budget_or_nonprivate_flags(self):
        seen=[]
        with patch.object(D,'execute',side_effect=lambda *args:seen.append(args) or {'accepted':True}),contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(D.main(['private-model','a'*64]),0)
            for args in (['private-model'],['private-model','a'*64,'--heap=512'],['private-model','A'*64],['--model','a'*64]):self.assertEqual(D.main(args),2)
        self.assertEqual(seen,[('a'*64,True,True,True)])
        for private,http,model in ((False,False,True),(True,False,True),(True,True,1),(True,True,'true')):
            with self.assertRaises(self.I.Refusal):D.OwnedRun(self.I,private,http,model)
        run=D.OwnedRun(self.I,True,True,True)
        self.assertIs(run.model,True);self.assertIs(run.private,True);self.assertIs(run.http,True)
        self.assertIs(D.OwnedRun(self.I).model,False)

    def test_model_launch_512_and_true_two_gib_limits_do_not_change_default_api(self):
        run=types.SimpleNamespace(output=self.owned_paths.output,private=True,http=True,model=True)
        seen=[]
        def create(executable,command,ps,ts,inherit,flags,environment,cwd,startup,info):
            seen.append(command.value);info._obj.process,info._obj.thread,info._obj.pid=11,12,13;return True
        def limits(job,kind,pointer,size):
            row=pointer._obj;self.assertEqual((row.basic.flags,row.basic.activeLimit,row.jobMemory),(0x2208,32,2048*D.MIB));return True
        cls=D.native_api_type(self.W,run);api=object.__new__(cls);api.m=self.B;api.k=types.SimpleNamespace(CreateProcessW=create,SetInformationJobObject=limits)
        api.create_process((ctypes.create_string_buffer(16),None),11,12,13);api.set_limits(20)
        self.assertEqual(seen,['"'+D.NODE+'" --max-old-space-size=512 "'+str(D.REPO/D.HTTP_ENTRY)+'" --with-model'])
        for method in ('read_limits','attributes','members','read','close_handle'):
            self.assertIs(getattr(cls,method),getattr(self.W._WinAPI,method))
        default=D.native_api_type(self.W,self.owned_paths);self.assertIs(default.set_limits,self.W._WinAPI.set_limits)

    def test_model_boundary_requires_actual_two_gib_readback_and_retains_all_other_methods(self):
        cls=D.owned_boundary_type(self.W,True);value=object.__new__(cls);value.handles={'job':20};value.limits=None
        row={'bytes':144,'expectedBytes':144,'flags':0x2208,'active':32,'memory':2048*D.MIB}
        value.api=types.SimpleNamespace(read_limits=lambda job:dict(row));value._verify_limits()
        self.assertEqual(value.limits,{'flags':0x2208,'activeProcessLimit':32,'jobMemoryBytes':2048*D.MIB})
        for key,bad in (('memory',1024*D.MIB),('memory',float(2048*D.MIB)),('active',1),('flags',0x3a08),('bytes',0)):
            changed=row[key];row[key]=bad
            with self.assertRaises(self.W.BoundaryFailure):value._verify_limits()
            row[key]=changed
        self.assertIs(D.owned_boundary_type(self.W),self.W.OwnedFixtureProcess)
        self.assertEqual({name for name,method in vars(cls).items() if callable(method)},{'_verify_limits'})

    def test_model_private_controller_keeps_cpu300_and_truthful_peak_and_admission(self):
        value,row=self._job_subject(True,300);value.job_memory_bytes=2048*D.MIB;row['committed']=2048*D.MIB;value.job()
        self.assertEqual(value.last_peak,2048*D.MIB)
        row['committed']+=1
        with self.assertRaises(self.I.Refusal):value.job()
        cls=D.diagnostic_controller_type(self.S,self.W,True)
        host={'physicalFree':3168*D.MIB,'commitFree':3168*D.MIB,'cFree':2048*D.MIB,'dFree':4096*D.MIB}
        control=cls(authenticate=lambda:None,end_pins=lambda:None,host_sample=lambda:host,boundary_factory=lambda:None,validate=lambda *a:None,clock=lambda:0,pause=lambda n:None,job_memory_bytes=2048*D.MIB)
        control.host(startup=True);host['commitFree']-=1
        with self.assertRaises(self.I.Refusal):control.host(startup=True)

    def test_model_extra_input_closure_has_exact_fixed_training_ridge_manifest_and_executables(self):
        self.assertEqual(len(D.MODEL_INPUTS),14);self.assertEqual(len({p for p,_,_ in D.MODEL_INPUTS}),14)
        inputs={p.relative_to(D.REPO).as_posix():(n,h) for p,n,h in D.MODEL_INPUTS}
        manifest_key='spikes/topic-resolution/browser/embedding/.assets/manifest.json'
        raw=(D.REPO/manifest_key).read_bytes();self.assertEqual((len(raw),hashlib.sha256(raw).hexdigest()),inputs[manifest_key])
        for asset in json.loads(raw)['assets']:
            self.assertEqual(inputs['spikes/topic-resolution/browser/embedding/.assets/'+asset['filename']],(asset['bytes'],asset['sha256']))
        loader=(HERE/'private-model-training-inputs.js').read_text(encoding='utf8')
        for name,n,h in re.findall(r"path:'([^']+)',bytes:(\d+),sha256:'([a-f0-9]{64})'",loader):self.assertEqual(inputs[name],(int(n),h))
        self.assertEqual(sum(p.suffix in ('.mjs','.wasm') for p,_,_ in D.MODEL_INPUTS),4)
        self.assertTrue(all(p.is_relative_to(D.REPO) for p,_,_ in D.MODEL_INPUTS))
        with self.assertRaises(self.I.Refusal):D.PrivateInputs(self.I,model=1)

    def test_model_all16_original_input_handles_remain_held_until_authenticated_close(self):
        def check(run):
            records=[]
            for index in range(16):
                name=run.root/('invented-input-'+str(index));raw=('public-invented-'+str(index)).encode();name.write_bytes(raw);records.append((name,len(raw),hashlib.sha256(raw).hexdigest()))
            streams=[]
            def opener(filename):
                stream=filename.open('rb',buffering=0);streams.append(stream);return stream
            with patch.object(D,'PRIVATE_INPUTS',tuple(records[:2])),patch.object(D,'MODEL_INPUTS',tuple(records[2:])):
                guard=D.PrivateInputs(self.I,opener=opener,clock=lambda:D.STARTED+1,model=True)
                try:
                    guard.prepare();self.assertEqual(len(streams),16);self.assertTrue(all(not s.closed for s in streams));guard.finish(D.STARTED+20)
                    self.assertTrue(guard.verified and guard.closed);self.assertTrue(all(s.closed for s in streams))
                finally:guard.close()
                bad=list(records[2:]);bad[5]=(bad[5][0],bad[5][1],'0'*64)
                with patch.object(D,'MODEL_INPUTS',tuple(bad)):
                    broken=D.PrivateInputs(self.I,opener=opener,clock=lambda:D.STARTED+1,model=True)
                    with self.assertRaises(self.I.Refusal):broken.prepare()
                    self.assertTrue(broken.closed);self.assertTrue(all(s.closed for s in streams))
        self._owned_run_test(check)

    def model_proof(self):
        expected=(('real-train-01','aba50dd9302b5448b0e5b4f14792e681810e6238d45d7b524c772a21c4fd5115'),('real-train-04','4c89c4fe4490894cd7877790a4d4021c8a1babd5accf91be0212411c7952b3ff'))
        summary=lambda n:{'count':n,'p50':1,'p95':2,'max':3}
        return {'schema':'private-model-contention-proof/v1','status':'passed','failure':None,'testComposition':False,'elapsedMs':1000,'maximumPending':3,
            'completed':[{'id':name,'sourceInputHash':digest,'operationId':'ingest-'+str(i),'operationDigest':'a'*64,'sourceId':'source-'+str(i),'sourceVersion':'0','topicId':'topic-'+str(i),'supportedPath':['games'] if i==0 else ['nature']} for i,(name,digest) in enumerate(expected)],
            'phases':[{'stage':stage,'elapsedMs':10,'pendingWorkProbeCount':0 if i==0 else 2,'context':summary(3 if i==0 else 2),'topics':summary(3 if i==0 else 2)} for i,stage in enumerate(('baseline','encoder-initialization','body-encoding-1','queue-application-1','body-encoding-2','queue-application-2'))],
            'installed':{'matcherIdentityHash':'4e9b3d3d2053327707d6ff395a8373e6e5ac3195333183ac8516f84195c45524','encoderModelId':'e5-small-q8-browser-main-prefix-v1','packagedAssetsVerified':True},
            'cleanup':{'resourcesClosed':True,'originalsSettled':True,'callerDatabasesClosed':False},
            'scope':{**dict.fromkeys(('realE5','realQueuedApply','realHttp','sharedEncoder','stagedCrawlerClient'),True),**dict.fromkeys(('fullCrawlerDiscovery','storedBackfill','browser','provider','qualityEvaluation','productionValidated','assignmentAuthority'),False)},
            'ownerVerification':{'operations':2,'sources':2,'observations':2},
            'fixtureIsolation':{'retiredHistoricalJobs':0,'emptyBeforeModel':True}}

    def test_model_nested_proof_is_additional_and_cannot_alias_normal_http_evidence(self):
        def check(run,normal,value,publish):
            value['model']=self.model_proof();value['scope']['encoder']=True;value['cleanup'].update(workerClientClosed=True,submitterClientClosed=True);publish(value)
            with self.assertRaises(self.I.Refusal):normal.complete()
            proof=D.PrivateHttpProof(self.I,run,True);proof.complete();proof.check();self.assertIsNotNone(proof.digest)
        self._http_proof_test(check)

    def test_model_proof_refuses_false_assets_scope_pending_rows_hashes_and_timing(self):
        changes=(lambda p:p.update(testComposition=True),lambda p:p.update(maximumPending=9),lambda p:p.update(maximumPending=True),
            lambda p:p['installed'].update(packagedAssetsVerified=False),lambda p:p['installed'].update(matcherIdentityHash='a'*64),
            lambda p:p['cleanup'].update(originalsSettled=False),lambda p:p['cleanup'].update(callerDatabasesClosed=True),
            lambda p:p['scope'].update(qualityEvaluation=True),lambda p:p['scope'].update(realE5=False),
            lambda p:p['ownerVerification'].update(operations=True),lambda p:p['completed'][0].update(sourceInputHash='a'*64),
            lambda p:p['completed'][0].update(sourceVersion=0),lambda p:p['completed'][0].update(supportedPath=['nature','gta']),
            lambda p:p['completed'][1].update(sourceId='source-0'),lambda p:p['phases'].reverse(),
            lambda p:p['phases'][1]['context'].update(p95=0),lambda p:p.update(elapsedMs=float('inf')))
        D.checked_model_proof(self.I,self.model_proof())
        for change in changes:
            proof=self.model_proof();change(proof)
            with self.assertRaises(self.I.Refusal):D.checked_model_proof(self.I,proof)

    def test_model_isolation_requires_exact_bounded_copied_queue_retirement_and_empty_state(self):
        for count in (0,2,16):
            proof=self.model_proof();proof['fixtureIsolation']['retiredHistoricalJobs']=count
            D.checked_model_proof(self.I,proof)
        for isolation in ({'retiredHistoricalJobs':17,'emptyBeforeModel':True},
                {'retiredHistoricalJobs':-1,'emptyBeforeModel':True},
                {'retiredHistoricalJobs':True,'emptyBeforeModel':True},
                {'retiredHistoricalJobs':0.0,'emptyBeforeModel':True},
                {'retiredHistoricalJobs':0,'emptyBeforeModel':False},
                {'retiredHistoricalJobs':0,'emptyBeforeModel':1},
                {'retiredHistoricalJobs':0},
                {'retiredHistoricalJobs':0,'emptyBeforeModel':True,'arbitraryAuthority':True}):
            proof=self.model_proof();proof['fixtureIsolation']=isolation
            with self.assertRaises(self.I.Refusal):D.checked_model_proof(self.I,proof)
        proof=self.model_proof();del proof['fixtureIsolation']
        with self.assertRaises(self.I.Refusal):D.checked_model_proof(self.I,proof)

    def browser_proof(self):
        names=('named-account-and-semantic-directory-search','human-root-in-original-canonical-topic-null-origin',
            'human-reply-and-stored-read-original-destination','second-account-edit-denied-original-body-retained')
        return {'ui':{'schema':'private-application-browser-proof/v1','status':'passed','cases':[{'name':name,'status':'passed'} for name in names],
            'pendingCases':0,'origin':'chrome-extension://'+'b'*32,'canonical':{'topicId':'original-topic','discussionId':'original-discussion','rootId':'root-browser','replyId':'reply-browser'},
            'requests':20,'maxConcurrentRequests':2,'cleanup':{'browserClosed':True,'ownedRootExited':True,'pendingRequests':0,'pendingTasks':0,'profileRemoved':True},
            'scope':{**dict.fromkeys(('realBrowser','realHttpProxy'),True),**dict.fromkeys(('sqlVerifiedByThisHelper','nativeCapture','nativeSidePanel','provider','externalIdentity','productionCapacity'),False)},
            'failure':None,'elapsedMs':100,'transportFailure':None,
            'history':{**dict.fromkeys(('verified','anonymous','originalIdsRead','readOnly','noSourceLinks','flatReplies','layoutWithinBounds'),True),
                'viewportWidth':320,'directoryPages':1,'messagePages':1,'directoryPaginationObserved':False,'messagePaginationObserved':False}},'ownerVerification':{'roots':1,'replies':1,'manualSnapshots':0},
            'runtime':{'chromeExecutableSha256':'177e4939361ccac7b37bb68b0642dff418856d7792c89ccde70d9aabeb14b159','installedDllsPinned':False}}

    def legacy_proof(self):
        return {'schema':'private-original-legacy-adoption-proof/v1','status':'passed','reason':None,'failure':None,
            'counts':{'pages':1,'scanned':1,'pending':1,'eligible':0,'prepared':1,'reclassified':1,'adopted':1},
            'canonicalPreserved':True,'repeatInert':True,'readVerified':True,'resourcesClosed':True,'testComposition':False,
            'scope':{'originalBackupRootsOnly':True,'maximumPages':10,'pageSize':10,'maximumAdoptedRoots':1,
                'contextBasis':'legacy-current-source-context','recapture':False,'qualityEvaluation':False,'canonicalWrites':False,'callerDatabasesClosed':False}}

    def test_legacy_proof_demands_original_scope_canonical_equality_and_inert_real_adoption(self):
        D.checked_legacy_proof(self.I,self.legacy_proof())
        changes=(lambda p:p.update(testComposition=True),lambda p:p.update(canonicalPreserved=False),lambda p:p.update(repeatInert=False),
            lambda p:p.update(readVerified=False),lambda p:p.update(resourcesClosed=False),lambda p:p['counts'].update(adopted=0),
            lambda p:p['counts'].update(adopted=True),lambda p:p['counts'].update(pages=11),lambda p:p['counts'].update(scanned=101),
            lambda p:p['scope'].update(originalBackupRootsOnly=False),lambda p:p['scope'].update(canonicalWrites=True),
            lambda p:p['scope'].update(contextBasis='source-observation-at-root-create'))
        for change in changes:
            value=self.legacy_proof();change(value)
            with self.assertRaises(self.I.Refusal):D.checked_legacy_proof(self.I,value)

    def test_legacy_nonapplicability_never_aliases_successful_adoption_or_incomplete_scan(self):
        value=self.legacy_proof();value.update(status='not-applicable',reason='no-eligible-original-root',canonicalPreserved=False,repeatInert=False,readVerified=False)
        value['counts'].update(pending=0,prepared=0,reclassified=0,adopted=0);D.checked_legacy_proof(self.I,value)
        for change in (lambda p:p.update(reason='original-scan-bound'),lambda p:p.update(repeatInert=True),lambda p:p['counts'].update(adopted=1),lambda p:p.update(canonicalPreserved=True)):
            bad=json.loads(json.dumps(value));change(bad)
            with self.assertRaises(self.I.Refusal):D.checked_legacy_proof(self.I,bad)

    def test_product_mode_is_closed_and_requires_the_private_model_composition(self):
        seen=[]
        with patch.object(D,'execute',side_effect=lambda *args:seen.append(args) or {'accepted':True}),contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(D.main(['private-product','b'*64]),0)
            for args in (['private-product'],['private-product','b'*64,'--url=x'],['private-product','B'*64],['--with-product','b'*64]):self.assertEqual(D.main(args),2)
        self.assertEqual(seen,[('b'*64,True,True,True,True)])
        for values in ((True,True,False,True),(False,True,True,True),(True,True,True,1)):
            with self.assertRaises(self.I.Refusal):D.OwnedRun(self.I,*values)
        self.assertIs(D.OwnedRun(self.I,True,True,True,True).product,True)
        self.assertIs(D.OwnedRun(self.I,True,True,True).product,False)

    def test_product_launch_uses_exact_fixed_flag_and_existing_two_gib_limits(self):
        run=types.SimpleNamespace(output=self.owned_paths.output,private=True,http=True,model=True,product=True);seen=[]
        def launch(executable,command,ps,ts,inherit,flags,environment,cwd,startup,info):
            seen.append(command.value);info._obj.process,info._obj.thread,info._obj.pid=11,12,13;return True
        api=object.__new__(D.native_api_type(self.W,run));api.m=self.B;api.k=types.SimpleNamespace(CreateProcessW=launch)
        api.create_process((ctypes.create_string_buffer(16),None),11,12,13)
        self.assertEqual(seen,['"'+D.NODE+'" --max-old-space-size=512 "'+str(D.REPO/D.HTTP_ENTRY)+'" --with-product'])

    def test_product_input_seventeen_holds_fixed_chrome_executable_without_claiming_its_dll_tree(self):
        self.assertEqual(D.BROWSER_INPUTS,((Path('C:/Program Files/Google/Chrome/Application/chrome.exe'),4525720,
            '177e4939361ccac7b37bb68b0642dff418856d7792c89ccde70d9aabeb14b159'),))
        with self.assertRaises(self.I.Refusal):D.PrivateInputs(self.I,model=False,product=True)
        with self.assertRaises(self.I.Refusal):D.PrivateInputs(self.I,model=True,product=1)
        def check(run):
            records=[];streams=[]
            for index in range(17):
                name=run.root/('invented-product-input-'+str(index));raw=('invented-'+str(index)).encode();name.write_bytes(raw);records.append((name,len(raw),hashlib.sha256(raw).hexdigest()))
            def opener(filename):
                stream=filename.open('rb',buffering=0);streams.append(stream);return stream
            with patch.object(D,'PRIVATE_INPUTS',tuple(records[:2])),patch.object(D,'MODEL_INPUTS',tuple(records[2:16])),patch.object(D,'BROWSER_INPUTS',tuple(records[16:])):
                guard=D.PrivateInputs(self.I,opener=opener,clock=lambda:D.STARTED+1,model=True,product=True)
                try:
                    guard.prepare();self.assertEqual(len(streams),17);self.assertTrue(all(not s.closed for s in streams));guard.finish(D.STARTED+20)
                    self.assertTrue(guard.verified and guard.closed);self.assertTrue(all(s.closed for s in streams))
                finally:guard.close()
        self._owned_run_test(check)

    def test_browser_proof_requires_all_four_actual_ui_cases_cleanup_and_original_row_join(self):
        D.checked_browser_proof(self.I,self.browser_proof())
        changes=(lambda p:p['ui']['cases'].pop(),lambda p:p['ui']['cases'][2].update(status='not-started'),
            lambda p:p['ui']['cleanup'].update(pendingRequests=1),lambda p:p['ui']['cleanup'].update(profileRemoved=False),
            lambda p:p['ui']['cleanup'].update(ownedRootExited=False),lambda p:p['ui']['scope'].update(nativeSidePanel=True),
            lambda p:p['ui']['scope'].update(sqlVerifiedByThisHelper=True),lambda p:p['ui'].update(origin='https://example.test'),
            lambda p:p['ui'].update(maxConcurrentRequests=5),lambda p:p['ui'].update(elapsedMs=float('nan')),
            lambda p:p['ownerVerification'].update(roots=True),lambda p:p['ownerVerification'].update(manualSnapshots=1),
            lambda p:p['ui']['canonical'].update(replyId='root-browser'),lambda p:p.update(rawCredentials='forbidden'),
            lambda p:p['runtime'].update(chromeExecutableSha256='a'*64),lambda p:p['runtime'].update(installedDllsPinned=True),
            lambda p:p['ui']['history'].update(anonymous=False),lambda p:p['ui']['history'].update(originalIdsRead=False),
            lambda p:p['ui']['history'].update(viewportWidth=400),lambda p:p['ui']['history'].update(messagePages=6),
            lambda p:p['ui']['history'].update(layoutWithinBounds=False),lambda p:p['ui'].update(transportFailure={'code':'request-origin'}))
        for change in changes:
            value=self.browser_proof();change(value)
            with self.assertRaises(self.I.Refusal):D.checked_browser_proof(self.I,value)

    def test_browser_evidence_cannot_alias_http_or_model_and_is_mandatory_for_product(self):
        def check(run,normal,value,publish):
            value['model']=self.model_proof();value['scope'].update(encoder=True,browser=True)
            value['cleanup'].update(workerClientClosed=True,submitterClientClosed=True,browserClosed=True);value['browser']=self.browser_proof();value['legacy']=self.legacy_proof();publish(value)
            for proof in (normal,D.PrivateHttpProof(self.I,run,True)):
                with self.assertRaises(self.I.Refusal):proof.complete()
            proof=D.PrivateHttpProof(self.I,run,True,True);proof.complete();proof.check();self.assertIsNotNone(proof.digest)
        self._http_proof_test(check)


if __name__ == '__main__':
    unittest.main()
