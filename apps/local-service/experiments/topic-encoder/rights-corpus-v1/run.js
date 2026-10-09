import { inspect } from './core.js';

const [command, privateFlag, directory, manifestFlag, manifestFile] = process.argv.slice(2);
if (command !== 'inspect' || privateFlag !== '--private-dir' ||
    manifestFlag !== '--manifest' || !directory || !manifestFile || process.argv.length !== 7) {
  process.stderr.write('Usage: run.js inspect --private-dir ABSOLUTE --manifest ABSOLUTE\n');
  process.exitCode = 2;
} else {
  try {
    const result = inspect(directory, manifestFile);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    // Paths, URL strings, page text and exception messages stay out of logs.
    const allowed = new Set(['PRIVATE_DIR_NOT_ABSOLUTE', 'PRIVATE_DIR_UNSAFE', 'MANIFEST_PATH_UNSAFE',
      'INVALID_SCHEMA', 'INVALID_DATE', 'INVALID_FIELD', 'INVALID_SIZE', 'RETENTION_EXPIRED',
      'INVALID_URL', 'SOURCE_OUT_OF_SCOPE', 'INVALID_EVIDENCE_URL',
      'DUPLICATE_ITEM', 'INVALID_LANGUAGE', 'INVALID_CAPTURE_TIME', 'INVALID_TEXT_PATH',
      'TEXT_PATH_UNSAFE', 'INVALID_HASH', 'INVALID_RIGHTS_REVIEW', 'RIGHTS_NOT_CLEARED',
      'INVALID_TEXT', 'INVALID_PAIR', 'DUPLICATE_PAIR', 'INVALID_LABEL', 'INVALID_PAIR_REVIEW',
      'UNPAIRED_ITEM',
      'CORPUS_CHANGED']);
    process.stderr.write(`${allowed.has(error.message) ? error.message : 'CORPUS_IO_OR_FORMAT_ERROR'}\n`);
    process.exitCode = 1;
  }
}
