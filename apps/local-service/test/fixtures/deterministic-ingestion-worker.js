// Synthetic identity seam only; all validation/planning/readonly repository code
// is the real implementation. Separate full/incremental workers get same IDs.
import crypto from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
let serial=0;
crypto.randomUUID=()=>`00000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
syncBuiltinESMExports();
await import('../../src/application/ingestion-worker.js');
