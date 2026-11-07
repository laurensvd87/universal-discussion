"""Public metadata files/fake failures only; no native Job/PG/credentials/model."""
from pathlib import Path
import ctypes,json,subprocess,tempfile,time,types,unittest
R=Path(__file__).resolve().parents[5];F=Path(__file__).resolve().parent;DATA=R/'apps/local-service/data'
D=types.ModuleType('_whole_v2_diagnostics');D.__file__=str(F/'hierarchy-native-driver.py')
exec(compile(Path(D.__file__).read_bytes(),D.__file__,'exec'),D.__dict__)
S=D.load_pinned('supervisor');I=S.I;W=D.load_pinned('windows')

class RecoveryDiagnostics(unittest.TestCase):
 def public(self,work,concurrent=False):
  with tempfile.TemporaryDirectory(prefix='public-recovery-records-',dir=DATA) as value:
   root=Path(value).resolve();self.assertEqual(root.parent,DATA.resolve());run=types.SimpleNamespace(output=root/'output')
   publisher=D.publisher_type(S,I,run)();publisher.prepare()
   code='''import{open,link}from'node:fs/promises';import path from'node:path';
const a=await import(OWNER),p=await import(PUBLICATION),out=OUTPUT;
for(let i=0;i<a.AUTOMATIC18_OWNER_PHASES.length;i++){
 const record=a.automatic18CheckpointRecord(i,i),raw=Buffer.from(JSON.stringify(record)+'\\n'),base=path.join(out,'phase-'+String(i).padStart(2,'0'));
 await (record.schema==='private-owner-automatic18-table-phase/v2'?p.publishSingleCheckpoint:p.publishPairedCheckpoint)(base+'.pending',base+'.json',raw,()=>{});
}process.stdout.write('published73');'''
   code=code.replace('import(OWNER)','import('+json.dumps((F/'automatic-topics-owner-native-check.js').as_uri())+')').replace('import(PUBLICATION)','import('+json.dumps((F/'checkpoint-publication.js').as_uri())+')').replace('out=OUTPUT','out='+json.dumps(str(run.output)))
   reader=D.PrivatePhases(I,run,True,automatic18=True)
   if concurrent:
    code=code.replace("}process.stdout.write", "await new Promise(done=>setTimeout(done,1));}process.stdout.write")
    process=subprocess.Popen([D.NODE,'--max-old-space-size=64','--input-type=module','-e',code],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    deadline=time.monotonic()+15;observations=0
    try:
     while process.poll() is None:
      self.assertLess(time.monotonic(),deadline);reader.check();publisher.check();observations+=1;time.sleep(.002)
     output,error=process.communicate(timeout=5);self.assertEqual(process.returncode,0);self.assertEqual(output,b'published73');self.assertLess(len(error),65536)
     self.assertGreater(observations,1)
    finally:
     if process.poll() is None:process.kill()
     process.communicate(timeout=5)
   else:
    result=subprocess.run([D.NODE,'--max-old-space-size=64','--input-type=module','-e',code],capture_output=True,timeout=15,check=True)
    self.assertEqual(result.stdout,b'published73');self.assertLess(len(result.stderr),65536)
   work(run,publisher,reader)

 def test_real_writer_and_unchanged_publisher_can_be_sampled_concurrently_through_all73_records(self):
  def check(run,publisher,reader):reader.complete();self.assertEqual(len(reader.closed),73);publisher.check()
  self.public(check,concurrent=True)

 def test_all73_real_publications_and_parent_sampler_fit_unchanged128_entry_guard(self):
  def check(run,publisher,reader):
   reader.complete();self.assertEqual(len(reader.closed),73)
   self.assertEqual(len(list(run.output.iterdir())),87)
   for i,stage in enumerate(reader.phases):
    final=run.output/('phase-%02d.json'%i);pending=run.output/('phase-%02d.pending'%i)
    if stage in D.AUTOMATIC18_UPGRADE_PHASES:self.assertFalse(pending.exists());self.assertEqual(final.stat().st_nlink,1)
    else:self.assertTrue(pending.exists());self.assertEqual(final.stat().st_nlink,2)
   publisher.check()
   for i in range(41):(run.output/('public-reserve-%02d'%i)).write_bytes(b'p')
   self.assertEqual(len(list(run.output.iterdir())),128);publisher.check()
   (run.output/'public-overflow').write_bytes(b'p')
   with self.assertRaises(I.Refusal) as error:publisher.check()
   self.assertEqual(error.exception.metadata['code'],'output-count')
  self.public(check)

 def test_single_final_waits_for_pending_retirement_and_rejects_republication(self):
  def check(run,publisher,reader):
   final=run.output/'phase-08.json';pending=run.output/'phase-08.pending';pending.write_bytes(final.read_bytes())
   reader.check();self.assertEqual(len(reader.closed),8)
   pending.unlink();reader.complete();self.assertEqual(len(reader.closed),73)
   pending.write_bytes(final.read_bytes())
   with self.assertRaises(I.Refusal):reader.check()
  self.public(check)

 def test_missing_tampered_wrong_schema_or_paired_extra_records_cannot_complete(self):
  for fault in ('missing-final','tamper','schema','extra-pair','original-pending-missing'):
   def check(run,publisher,reader):
    final=run.output/'phase-08.json';pending=run.output/'phase-08.pending'
    if fault=='missing-final':
     pending.write_bytes(final.read_bytes());reader.check();final.unlink();pending.unlink()
    elif fault=='tamper':
     reader.complete();raw=final.read_bytes();self.assertIn(b'"elapsedMs":8',raw);final.write_bytes(raw.replace(b'"elapsedMs":8',b'"elapsedMs":7'))
    elif fault=='schema':final.write_bytes(final.read_bytes().replace(b'private-owner-automatic18-table-phase/v2',b'private-owner-automatic18-phase/v1'))
    elif fault=='extra-pair':pending.hardlink_to(final)
    else:(run.output/'phase-00.pending').unlink()
    with self.assertRaises((I.Refusal,FileNotFoundError)):reader.complete()
   self.public(check)

 def denied(self):
  error=PermissionError(13,'PRIVATE MESSAGE',r'C:\PRIVATE\path');error.winerror=5;raise error

 def test_filesystem_origin_uses_the_same_first_error_and_deepest_code_object_without_private_text(self):
  sites={self.denied.__func__.__code__:'metadata-open'}
  cls=D.diagnostic_controller_type(S,W,True,filesystem_sites=sites);sites.clear()
  controller=object.__new__(cls);controller.primary=controller.cleanup=None
  try:self.denied()
  except PermissionError as error:controller.remember(error)
  self.assertEqual(controller.primary,{'code':'filesystem-denied','counter':None,'value':None})
  first=dict(controller.filesystem_observations['primary']);self.assertEqual(first['site'],'metadata-open');self.assertEqual(first['winerror'],5);self.assertEqual(first['errno'],13)
  controller.remember(PermissionError('PRIVATE LATER'))
  self.assertEqual(controller.filesystem_observations['primary'],first)
  controller.remember(FileNotFoundError(2,'PRIVATE CLEANUP'),cleanup=True)
  self.assertEqual(controller.filesystem_observations['cleanup']['site'],'unresolved')
  self.assertNotIn('PRIVATE',json.dumps(controller.filesystem_observations));self.assertIsInstance(first['line'],int)

 def test_unknown_error_subclasses_and_invalid_site_maps_never_invoke_hooks(self):
  class Evil(PermissionError):
   @property
   def errno(self):raise AssertionError('Private hook invoked')
  class EvilMap(dict):
   def items(self):raise AssertionError('Private mapping hook invoked')
  self.assertIsNone(D.filesystem_observation(Evil('PRIVATE'),{}))
  self.assertIsNone(D.filesystem_observation(PermissionError('PRIVATE'),EvilMap()))
  for sites in (EvilMap(),{self.denied.__func__.__code__:'PRIVATE TAG'},{'PRIVATE':'metadata-open'}):
   with self.assertRaises(ValueError):D.diagnostic_controller_type(S,W,True,filesystem_sites=sites)

if __name__=='__main__':unittest.main()
