// Maintained fixed native check. No argument, environment or path selectors.
// Actual execution requires authenticated inputs and a separate run decision.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectEntryResult } from './native-hierarchy-postgres-v2/entry.js';

export async function runHierarchyNativeCheck() {
  if (arguments.length) throw new TypeError('Hierarchy check accepts no selectors');
  const { runNativeSqlProof } = await import('./hierarchy-native-context.js');
  return projectEntryResult(await runNativeSqlProof());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    process.stderr.write('Hierarchy check accepts no selectors.\n');
    process.exitCode = 2;
  } else void runHierarchyNativeCheck().then(result => {
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.accepted) process.exitCode = 1;
  }, () => {
    process.stdout.write('{"schema":"native-hierarchy-postgres-result/v2","accepted":false,"failure":"native-proof-incomplete"}\n');
    process.exitCode = 1;
  });
}
