// Owner-host entrypoint. Both imports are inert. API hotfix and existing other
// roles intentionally use compatible schema17 releases; no implicit upgrade.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runPostgresRuntimeOperator as apiRuntime} from './private-ai-runtime-operator.js';
import {runPostgresRuntimeOperator as existingRuntime} from './postgres-runtime-operator.js';

export function currentRuntimeRole(args) {
  if (!Array.isArray(args) || args.length !== 1) return null;
  if (['preflight','status','service'].includes(args[0])) return 'private-ai17';
  if (['worker','crawler','dashboard'].includes(args[0])) return 'hierarchy17';
  return null;
}
export async function runCurrentPostgresRuntime(args) {
  const role = currentRuntimeRole(args);
  if (role === null) {
    process.stderr.write('Use exactly one operation: preflight, status, service, worker, crawler, or dashboard.\n');
    return 2;
  }
  return (role === 'private-ai17' ? apiRuntime : existingRuntime)(args);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await runCurrentPostgresRuntime(process.argv.slice(2));
