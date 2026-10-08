import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CorpusError, safeDiagnostic, parseCorpus, inspectCorpus } from './core.js';

const ownDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(ownDir, '../../../../..');
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

async function privateInput(privateDir, input) {
  if (!path.isAbsolute(privateDir) || !path.isAbsolute(input))
    throw new CorpusError('path', 'ABSOLUTE_PATH_REQUIRED');
  let root, file, repo;
  try { [root, file, repo] = await Promise.all([realpath(privateDir), realpath(input), realpath(repoRoot)]); }
  catch { throw new CorpusError('path', 'PATH_ACCESS'); }
  if (!path.relative(repo, root) || inside(repo, root) ||
      !path.relative(repo, file) || inside(repo, file) || !inside(root, file))
    throw new CorpusError('path', 'PRIVATE_PATH_SCOPE');
  let info;
  try { info = await lstat(input); } catch { throw new CorpusError('path', 'INPUT_STAT'); }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 64 * 1024 * 1024)
    throw new CorpusError('path', 'INPUT_FILE_BOUND');
  try { return await readFile(input); } catch { throw new CorpusError('path', 'INPUT_READ'); }
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--dry-run') {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', datasetOpened: false,
      modelLoaded: false, externalCapabilities: 'denied', inputRequired: true })}\n`);
    return;
  }
  if (process.argv.length !== 7 || process.argv[2] !== '--inspect' ||
      process.argv[3] !== '--private-dir' || process.argv[5] !== '--input')
    throw new CorpusError('arguments', 'EXPECTED_INSPECT_PRIVATE_DIR_INPUT');
  const bytes = await privateInput(process.argv[4], process.argv[6]);
  process.stdout.write(`${JSON.stringify(inspectCorpus(parseCorpus(bytes)), null, 2)}\n`);
}

try { await main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ error: safeDiagnostic(error) })}\n`);
  process.exitCode = 1;
}
