// Invented in-memory filesystem only. No filesystem/socket/process invocation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {win32 as path} from 'node:path';
import {createHash} from 'node:crypto';
import {createSpecificityIo,IO_LIMITS} from './io.mjs';
import {SOURCE_CATALOG} from './source-paths.js';
import {specificityIoCatalog} from './driver.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(JSON.stringify(v));
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const clone=structuredClone;
// Cross-language SOURCE fixture: actual walker tests bind this exact240-event trace.
export const PACKAGE_DIRECTORY_PROOF_FIXTURE=Object.freeze([
  {"pathKey":"node_modules/playwright-core","edge":"before","pair":1,"fileType":"directory"},
  {"pathKey":"node_modules/playwright-core/file-000.js","edge":"before","pair":2,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/file-000.js","edge":"after","pair":2,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib","edge":"before","pair":3,"fileType":"directory"},
  {"pathKey":"node_modules/playwright-core/lib/client","edge":"before","pair":4,"fileType":"directory"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-001.js","edge":"before","pair":5,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-001.js","edge":"after","pair":5,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-002.js","edge":"before","pair":6,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-002.js","edge":"after","pair":6,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-003.js","edge":"before","pair":7,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-003.js","edge":"after","pair":7,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-004.js","edge":"before","pair":8,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-004.js","edge":"after","pair":8,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-005.js","edge":"before","pair":9,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-005.js","edge":"after","pair":9,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-006.js","edge":"before","pair":10,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-006.js","edge":"after","pair":10,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-007.js","edge":"before","pair":11,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-007.js","edge":"after","pair":11,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-008.js","edge":"before","pair":12,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-008.js","edge":"after","pair":12,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-009.js","edge":"before","pair":13,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-009.js","edge":"after","pair":13,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-010.js","edge":"before","pair":14,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-010.js","edge":"after","pair":14,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-011.js","edge":"before","pair":15,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-011.js","edge":"after","pair":15,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-012.js","edge":"before","pair":16,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-012.js","edge":"after","pair":16,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-013.js","edge":"before","pair":17,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-013.js","edge":"after","pair":17,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-014.js","edge":"before","pair":18,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-014.js","edge":"after","pair":18,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-015.js","edge":"before","pair":19,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-015.js","edge":"after","pair":19,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-016.js","edge":"before","pair":20,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-016.js","edge":"after","pair":20,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-017.js","edge":"before","pair":21,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-017.js","edge":"after","pair":21,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-018.js","edge":"before","pair":22,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-018.js","edge":"after","pair":22,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-019.js","edge":"before","pair":23,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-019.js","edge":"after","pair":23,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-020.js","edge":"before","pair":24,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-020.js","edge":"after","pair":24,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-021.js","edge":"before","pair":25,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-021.js","edge":"after","pair":25,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-022.js","edge":"before","pair":26,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-022.js","edge":"after","pair":26,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-023.js","edge":"before","pair":27,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-023.js","edge":"after","pair":27,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-024.js","edge":"before","pair":28,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-024.js","edge":"after","pair":28,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-025.js","edge":"before","pair":29,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-025.js","edge":"after","pair":29,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-026.js","edge":"before","pair":30,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-026.js","edge":"after","pair":30,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-027.js","edge":"before","pair":31,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-027.js","edge":"after","pair":31,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-028.js","edge":"before","pair":32,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-028.js","edge":"after","pair":32,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-029.js","edge":"before","pair":33,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-029.js","edge":"after","pair":33,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-030.js","edge":"before","pair":34,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-030.js","edge":"after","pair":34,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-031.js","edge":"before","pair":35,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-031.js","edge":"after","pair":35,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-032.js","edge":"before","pair":36,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-032.js","edge":"after","pair":36,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-033.js","edge":"before","pair":37,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-033.js","edge":"after","pair":37,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-034.js","edge":"before","pair":38,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-034.js","edge":"after","pair":38,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-035.js","edge":"before","pair":39,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-035.js","edge":"after","pair":39,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-036.js","edge":"before","pair":40,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-036.js","edge":"after","pair":40,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-037.js","edge":"before","pair":41,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-037.js","edge":"after","pair":41,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-038.js","edge":"before","pair":42,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client/file-038.js","edge":"after","pair":42,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/client","edge":"after","pair":4,"fileType":"directory"},
  {"pathKey":"node_modules/playwright-core/lib/server","edge":"before","pair":43,"fileType":"directory"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-039.js","edge":"before","pair":44,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-039.js","edge":"after","pair":44,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-040.js","edge":"before","pair":45,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-040.js","edge":"after","pair":45,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-041.js","edge":"before","pair":46,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-041.js","edge":"after","pair":46,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-042.js","edge":"before","pair":47,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-042.js","edge":"after","pair":47,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-043.js","edge":"before","pair":48,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-043.js","edge":"after","pair":48,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-044.js","edge":"before","pair":49,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-044.js","edge":"after","pair":49,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-045.js","edge":"before","pair":50,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-045.js","edge":"after","pair":50,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-046.js","edge":"before","pair":51,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-046.js","edge":"after","pair":51,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-047.js","edge":"before","pair":52,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-047.js","edge":"after","pair":52,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-048.js","edge":"before","pair":53,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-048.js","edge":"after","pair":53,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-049.js","edge":"before","pair":54,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-049.js","edge":"after","pair":54,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-050.js","edge":"before","pair":55,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-050.js","edge":"after","pair":55,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-051.js","edge":"before","pair":56,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-051.js","edge":"after","pair":56,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-052.js","edge":"before","pair":57,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-052.js","edge":"after","pair":57,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-053.js","edge":"before","pair":58,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-053.js","edge":"after","pair":58,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-054.js","edge":"before","pair":59,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-054.js","edge":"after","pair":59,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-055.js","edge":"before","pair":60,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-055.js","edge":"after","pair":60,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-056.js","edge":"before","pair":61,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-056.js","edge":"after","pair":61,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-057.js","edge":"before","pair":62,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-057.js","edge":"after","pair":62,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-058.js","edge":"before","pair":63,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-058.js","edge":"after","pair":63,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-059.js","edge":"before","pair":64,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-059.js","edge":"after","pair":64,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-060.js","edge":"before","pair":65,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-060.js","edge":"after","pair":65,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-061.js","edge":"before","pair":66,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-061.js","edge":"after","pair":66,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-062.js","edge":"before","pair":67,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-062.js","edge":"after","pair":67,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-063.js","edge":"before","pair":68,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-063.js","edge":"after","pair":68,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-064.js","edge":"before","pair":69,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-064.js","edge":"after","pair":69,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-065.js","edge":"before","pair":70,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-065.js","edge":"after","pair":70,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-066.js","edge":"before","pair":71,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-066.js","edge":"after","pair":71,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-067.js","edge":"before","pair":72,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-067.js","edge":"after","pair":72,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-068.js","edge":"before","pair":73,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-068.js","edge":"after","pair":73,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-069.js","edge":"before","pair":74,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-069.js","edge":"after","pair":74,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-070.js","edge":"before","pair":75,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-070.js","edge":"after","pair":75,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-071.js","edge":"before","pair":76,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-071.js","edge":"after","pair":76,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-072.js","edge":"before","pair":77,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-072.js","edge":"after","pair":77,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-073.js","edge":"before","pair":78,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-073.js","edge":"after","pair":78,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-074.js","edge":"before","pair":79,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-074.js","edge":"after","pair":79,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-075.js","edge":"before","pair":80,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-075.js","edge":"after","pair":80,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-076.js","edge":"before","pair":81,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server/file-076.js","edge":"after","pair":81,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/lib/server","edge":"after","pair":43,"fileType":"directory"},
  {"pathKey":"node_modules/playwright-core/lib","edge":"after","pair":3,"fileType":"directory"},
  {"pathKey":"node_modules/playwright-core/types","edge":"before","pair":82,"fileType":"directory"},
  {"pathKey":"node_modules/playwright-core/types/file-077.d.ts","edge":"before","pair":83,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-077.d.ts","edge":"after","pair":83,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-078.d.ts","edge":"before","pair":84,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-078.d.ts","edge":"after","pair":84,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-079.d.ts","edge":"before","pair":85,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-079.d.ts","edge":"after","pair":85,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-080.d.ts","edge":"before","pair":86,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-080.d.ts","edge":"after","pair":86,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-081.d.ts","edge":"before","pair":87,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-081.d.ts","edge":"after","pair":87,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-082.d.ts","edge":"before","pair":88,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-082.d.ts","edge":"after","pair":88,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-083.d.ts","edge":"before","pair":89,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-083.d.ts","edge":"after","pair":89,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-084.d.ts","edge":"before","pair":90,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-084.d.ts","edge":"after","pair":90,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-085.d.ts","edge":"before","pair":91,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-085.d.ts","edge":"after","pair":91,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-086.d.ts","edge":"before","pair":92,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-086.d.ts","edge":"after","pair":92,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-087.d.ts","edge":"before","pair":93,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-087.d.ts","edge":"after","pair":93,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-088.d.ts","edge":"before","pair":94,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-088.d.ts","edge":"after","pair":94,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-089.d.ts","edge":"before","pair":95,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-089.d.ts","edge":"after","pair":95,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-090.d.ts","edge":"before","pair":96,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-090.d.ts","edge":"after","pair":96,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-091.d.ts","edge":"before","pair":97,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-091.d.ts","edge":"after","pair":97,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-092.d.ts","edge":"before","pair":98,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-092.d.ts","edge":"after","pair":98,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-093.d.ts","edge":"before","pair":99,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-093.d.ts","edge":"after","pair":99,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-094.d.ts","edge":"before","pair":100,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-094.d.ts","edge":"after","pair":100,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-095.d.ts","edge":"before","pair":101,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-095.d.ts","edge":"after","pair":101,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-096.d.ts","edge":"before","pair":102,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-096.d.ts","edge":"after","pair":102,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-097.d.ts","edge":"before","pair":103,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-097.d.ts","edge":"after","pair":103,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-098.d.ts","edge":"before","pair":104,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-098.d.ts","edge":"after","pair":104,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-099.d.ts","edge":"before","pair":105,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-099.d.ts","edge":"after","pair":105,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-100.d.ts","edge":"before","pair":106,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-100.d.ts","edge":"after","pair":106,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-101.d.ts","edge":"before","pair":107,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-101.d.ts","edge":"after","pair":107,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-102.d.ts","edge":"before","pair":108,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-102.d.ts","edge":"after","pair":108,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-103.d.ts","edge":"before","pair":109,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-103.d.ts","edge":"after","pair":109,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-104.d.ts","edge":"before","pair":110,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-104.d.ts","edge":"after","pair":110,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-105.d.ts","edge":"before","pair":111,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-105.d.ts","edge":"after","pair":111,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-106.d.ts","edge":"before","pair":112,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-106.d.ts","edge":"after","pair":112,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-107.d.ts","edge":"before","pair":113,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-107.d.ts","edge":"after","pair":113,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-108.d.ts","edge":"before","pair":114,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-108.d.ts","edge":"after","pair":114,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-109.d.ts","edge":"before","pair":115,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-109.d.ts","edge":"after","pair":115,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-110.d.ts","edge":"before","pair":116,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-110.d.ts","edge":"after","pair":116,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-111.d.ts","edge":"before","pair":117,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-111.d.ts","edge":"after","pair":117,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-112.d.ts","edge":"before","pair":118,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-112.d.ts","edge":"after","pair":118,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-113.d.ts","edge":"before","pair":119,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-113.d.ts","edge":"after","pair":119,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-114.d.ts","edge":"before","pair":120,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types/file-114.d.ts","edge":"after","pair":120,"fileType":"file"},
  {"pathKey":"node_modules/playwright-core/types","edge":"after","pair":82,"fileType":"directory"},
  {"pathKey":"node_modules/playwright-core","edge":"after","pair":1,"fileType":"directory"}
]);
for(const event of PACKAGE_DIRECTORY_PROOF_FIXTURE)Object.freeze(event);
const ROOT='D:\\repo',WORK=ROOT+'\\owned\\run1';
const STAGE=['batch-config.js','chromium/page-content-reader.js','core/page-content-policy.js','manifest.json','native-adapter.js','native-rights.js','worker.js'];
const ASSETS=['model.onnx','tokenizer.json','tokenizer_config.json','config.json','special_tokens_map.json','tokenizers.mjs','ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'];
function failure(code){return Object.assign(Error('invented'),{code});}
class MemoryFs{
 constructor(){this.nodes=new Map();this.log=[];this.next=1;this.allocations=[];this.opens=0;this.closes=0;this.reads=0;this.maxRead=0;this.hooks={};this.add('D:\\','directory');this.add(ROOT,'directory');this.add(ROOT+'\\owned','directory');}
 add(p,kind,b=Buffer.alloc(0)){const node={kind,b,ino:BigInt(this.next++),time:1n,nlink:1n};this.nodes.set(p,node);return node;}
 seed(p,b){const parts=[];let at=path.dirname(p);while(!this.nodes.has(at)){parts.push(at);at=path.dirname(at);}for(const d of parts.reverse())this.add(d,'directory');return this.add(p,'file',b);}
 get(p){const n=this.nodes.get(p);if(!n)throw failure('ENOENT');return n;}
 statNode(n){return {dev:1n,ino:n.ino,mode:n.kind==='file'?0o100644n:n.kind==='directory'?0o40755n:0o120777n,size:BigInt(n.virtualSize??n.b.length),birthtimeNs:n.ino,mtimeNs:n.time,ctimeNs:n.time,nlink:n.nlink};}
 adapter(){const self=this;return {async lstat(p){self.log.push(['lstat',p]);await self.hooks.lstat?.(p);return self.statNode(self.get(p));},async realpath(p){self.get(p);return self.hooks.realpath?.(p)??p;},
  async mkdir(p){self.log.push(['mkdir',p]);self.get(path.dirname(p));if(self.nodes.has(p))throw failure('EEXIST');self.add(p,'directory');self.get(path.dirname(p)).time++;},
  async open(p,flags){self.log.push(['open',p,flags]);if(flags==='wx'){self.get(path.dirname(p));if(self.nodes.has(p))throw failure('EEXIST');self.add(p,'file');self.get(path.dirname(p)).time++;}
   const node=self.get(p);if(node.kind!=='file')throw failure('EISDIR');self.opens++;const h=new MemoryFile(self,p,node);await self.hooks.open?.(h,p,flags);return h;},
  async opendir(p){self.log.push(['opendir',p]);const node=self.get(p);if(node.kind!=='directory')throw failure('ENOTDIR');self.opens++;const names=[...self.nodes.keys()].filter(x=>x!==p&&path.dirname(x)===p).map(x=>path.basename(x)).sort();return new MemoryDirectory(self,p,names);},
  async link(from,to){self.log.push(['link',from,to]);await self.hooks.link?.(from,to);if(self.nodes.has(to))throw failure('EEXIST');const n=self.get(from);self.nodes.set(to,n);n.nlink++;n.time++;self.get(path.dirname(to)).time++;}};}
}
class MemoryFile{
 constructor(fs,p,node){this.fs=fs;this.path=p;this.node=node;this.closed=false;}
 async stat(){return this.fs.statNode(this.node);}
 async read(buffer,offset,count,position){this.fs.log.push(['read',this.path,count]);this.fs.reads++;this.fs.maxRead=Math.max(this.fs.maxRead,count);await this.fs.hooks.read?.(this,position);
  const size=this.node.virtualSize??this.node.b.length,n=Math.max(0,Math.min(count,size-position));if(this.node.virtualSize!==undefined)buffer.fill(0,offset,offset+n);else this.node.b.copy(buffer,offset,position,position+n);return {bytesRead:n,buffer};}
 async write(buffer,offset,count,position){this.fs.log.push(['write',this.path,count]);await this.fs.hooks.write?.(this,position);const n=position+count;if(this.node.b.length<n){const b=Buffer.alloc(n);this.node.b.copy(b);this.node.b=b;}buffer.copy(this.node.b,position,offset,offset+count);this.node.time++;return {bytesWritten:count,buffer};}
 async sync(){this.fs.log.push(['sync',this.path]);await this.fs.hooks.sync?.(this);}
 async close(){this.fs.log.push(['close',this.path]);this.fs.closes++;assert.equal(this.closed,false);await this.fs.hooks.close?.(this);this.closed=true;}
}
class MemoryDirectory{
 constructor(fs,p,names){this.fs=fs;this.path=p;this.names=names;this.index=0;this.closed=false;}
 async read(){await this.fs.hooks.dirRead?.(this);return this.index===this.names.length?null:{name:this.names[this.index++]};}
 async close(){this.fs.closes++;assert.equal(this.closed,false);await this.fs.hooks.close?.(this);this.closed=true;}
}
function fixture({packagePaths=null}={}){
 const fs=new MemoryFs(),code=Buffer.from('invented source bytes'),entry={key:'code.js',path:'code.js',kind:'code',maximumBytes:4194304,sha256:null};fs.seed(ROOT+'\\code.js',code);
 const packageRoot='maintained/node_modules/playwright-core';let packageBytes=0;for(let i=0;i<115;i++){const b=Buffer.from('invented '+i);packageBytes+=b.length;const rel=packagePaths===null?'file-'+i+'.js':packagePaths[i];fs.seed(path.join(ROOT,...packageRoot.split('/'),...rel.split('/')),b);}
 const catalog=freeze({schema:'native-specificity-source-catalog/v1',entries:[entry],package:{rootKey:packageRoot,prefix:'node_modules/playwright-core/',files:115,bytes:packageBytes}});
 const directories=['stage','stage/chromium','stage/core','profiles','profiles/batch1','evidence'];
 const ackFiles=['ack.json','finish.ack.json','batch-01.start.ack.json','batch-24.drain.ack.json','cohort.drain.ack.json','model-fitting.ack.json','model-assessment.ack.json','model-checks.ack.json',
  'batch-25.start.ack.json','some.ack.json','evidence/batch-01.start.ack.json'];
 const files=[...STAGE.map(p=>({path:'stage/'+p,maximumBytes:131072})),{path:'evidence/result.json',maximumBytes:524288},{path:'evidence/other.json',maximumBytes:1024},...ackFiles.map(path=>({path,maximumBytes:16384}))];
 const layout=freeze({directories,files});const proofs=[];let guardCalls=0,cleanupCalls=0;
 const config={repoRoot:ROOT,workspaceRoot:WORK,catalog,expectedCatalogHash:digest(catalog),workspaceLayout:layout,expectedWorkspaceLayoutHash:digest(layout),sourceAssetRoot:'spikes/topic-resolution/browser/embedding/.assets',
  guard(){guardCalls++;return true;},cleanupGuard(){cleanupCalls++;return true;},inspectNoReparse(p,c){proofs.push({p,c});const n=fs.get(p);return {schema:'native-specificity-fs-proof/v1',pathKey:c.pathKey,operationNonce:c.operationNonce,edge:c.edge,
   ancestorsChecked:true,openedIdentityChecked:true,attributes:n.kind==='directory'?16:0,identity:{volumeSerial:'7',fileIndex:n.ino.toString(),creationFiletime:n.ino.toString(),size:String(n.virtualSize??n.b.length),fileType:n.kind},atomic:false,requestHash:digest(c),receiptHash:sha('invented receipt')};}};
 return {fs,config,code,entry,proofs,counts:()=>({guardCalls,cleanupCalls}),io:()=>createSpecificityIo(config,fs.adapter())};
}
function stage(){const files=STAGE.map(p=>({path:p,text:'// invented '+p+'\n',bytes:Buffer.byteLength('// invented '+p+'\n'),sha256:sha('// invented '+p+'\n')}));
 const identity={schema:'native-specificity-stage-recipe/v1',panelIdentity:sha('panel'),manifestHash:sha('manifest'),batchId:sha('batch'),batchScopeHash:sha('scope'),sourceHashes:Object.fromEntries(['manifest.json','worker.js','native-adapter.js','native-rights.js','chromium/page-content-reader.js','core/page-content-policy.js'].map(p=>[p,sha('source:'+p)])),files:files.map(({path,bytes,sha256})=>({path,bytes,sha256}))};
 return freeze({...identity,files,sourceBytes:100,outputBytes:files.reduce((n,f)=>n+f.bytes,0),stageIdentity:digest(identity),actualStagePublished:false,layoutVerified:false,nativeReady:false,assignmentAuthority:false});}
async function workspace(f,io){await io.createWorkspace();await io.createDirectory('evidence');}

test('default-inert constructor validates pins/roots/layout before any invented FS callback',()=>{
 const f=fixture(),io=f.io();assert.equal(f.fs.log.length,0);assert.equal(f.proofs.length,0);assert.equal(f.counts().guardCalls,0);assert.equal(io.snapshot().created,false);
 let hooks=0;const bad={...f.config};Object.defineProperty(bad,'catalog',{get(){hooks++;throw Error();}});assert.throws(()=>createSpecificityIo(bad,f.fs.adapter()));
 for(const update of [{expectedCatalogHash:sha('wrong')},{repoRoot:'d:\\repo'},{workspaceRoot:'C:\\outside'}, {inspectNoReparse:null}])assert.throws(()=>createSpecificityIo({...f.config,...update},f.fs.adapter()));
 const layout=clone(f.config.workspaceLayout);layout.files.push({path:'stage/WORKER.js',maximumBytes:1024});assert.throws(()=>createSpecificityIo({...f.config,workspaceLayout:layout,expectedWorkspaceLayoutHash:digest(layout)},f.fs.adapter()));assert.equal(hooks,0);
});

test('ADR194 actual TEST catalog fits inclusive144; entry145 refuses before any filesystem callback',()=>{
 const f=fixture(),catalog=specificityIoCatalog(SOURCE_CATALOG,'test');assert.equal(catalog.entries.length,144);
 const config={...f.config,catalog,expectedCatalogHash:digest(catalog)};
 const io=createSpecificityIo(config,f.fs.adapter());assert.equal(io.snapshot().created,false);
 assert.equal(f.fs.log.length,0);assert.equal(f.proofs.length,0);assert.equal(f.counts().guardCalls,0);
 const over=clone(catalog);over.entries.push({key:'invented-over-cap.js',path:'invented-over-cap.js',kind:'code',maximumBytes:1024,sha256:null});
 assert.throws(()=>createSpecificityIo({...config,catalog:over,expectedCatalogHash:digest(over)},f.fs.adapter()));
 assert.equal(f.fs.log.length,0);assert.equal(f.proofs.length,0);assert.equal(f.counts().guardCalls,0);
});

test('bounded ordinary file read ties Node opened identity, all ancestors, native proof and actual close',async()=>{
 const f=fixture(),io=f.io(),b=await io.readEntry(f.entry);assert.deepEqual(b,f.code);assert.notEqual(b,f.code);assert.equal(f.fs.opens,1);assert.equal(f.fs.closes,1);
 assert.equal(f.proofs.length,2);assert.equal(f.proofs[0].c.edge,'before');assert.equal(f.proofs[1].c.edge,'after');assert.equal(f.proofs[0].c.operationNonce,f.proofs[1].c.operationNonce);
 assert.ok(f.fs.log.some(r=>r[0]==='lstat'&&r[1]==='D:\\'));assert.equal(io.snapshot().openHandles,0);assert.equal(io.snapshot().pendingOriginals,0);
});

test('source descriptors, traversal, symlink ancestors, case aliases and incomplete native proof fail closed',async()=>{
 for(const mutate of [f=>{f.entry={...f.entry,path:'../escape'};},f=>{f.fs.get(ROOT).kind='symlink';},f=>{f.fs.hooks.realpath=p=>p===ROOT?ROOT.toLowerCase():p;},
  f=>{const prior=f.config.inspectNoReparse;f.config.inspectNoReparse=(p,c)=>({...prior(p,c),openedIdentityChecked:false});},
  f=>{const prior=f.config.inspectNoReparse;f.config.inspectNoReparse=(p,c)=>({...prior(p,c),attributes:1024});}]){
  const f=fixture();mutate(f);const io=f.io();await assert.rejects(io.readEntry(f.entry));assert.equal(io.snapshot().failed,true);assert.equal(f.fs.opens,0);
 }
});

test('size overflow before allocation/open and in-place/endstat/opened-object substitutions are rejected',async()=>{
 for(const mutate of [f=>{f.fs.get(ROOT+'\\code.js').virtualSize=4194305;},f=>{f.fs.hooks.open=h=>{h.node={...h.node,ino:99999n};};},f=>{f.fs.hooks.read=h=>{h.node.time++;};},
  f=>{let after=false;f.fs.hooks.open=()=>{after=true;};f.fs.hooks.lstat=p=>{if(after&&p===ROOT+'\\code.js'){const n=f.fs.get(p);f.fs.nodes.set(p,{...n,ino:999n});}};}]){
  const f=fixture();mutate(f);const io=f.io();await assert.rejects(io.readEntry(f.entry));assert.equal(io.snapshot().failed,true);assert.equal(io.snapshot().openHandles,0);assert.equal(f.fs.opens,f.fs.closes);
 }
});

test('complete package walker returns exactly115 fixed-prefix entries in canonical order',async()=>{
 const f=fixture(),io=f.io(),rows=await io.walkPackage(f.config.catalog.package.rootKey);assert.equal(rows.length,115);assert.equal(rows.reduce((n,r)=>n+r.bytes.length,0),f.config.catalog.package.bytes);
 assert.ok(rows.every(r=>r.path.startsWith('node_modules/playwright-core/')));assert.deepEqual(rows.map(r=>r.path),rows.map(r=>r.path).sort());assert.equal(f.fs.opens,f.fs.closes);assert.equal(io.snapshot().openHandles,0);
 const g=fixture();g.fs.seed(path.join(ROOT,...g.config.catalog.package.rootKey.split('/'),'extra.js'),Buffer.from('extra'));await assert.rejects(g.io().walkPackage(g.config.catalog.package.rootKey));
});

test('actual package walker proof contexts equal the parent-consumed literal nested-directory fixture',async()=>{
 const prefix='node_modules/playwright-core/',fileKeys=PACKAGE_DIRECTORY_PROOF_FIXTURE.filter(e=>e.edge==='before'&&e.fileType==='file').map(e=>e.pathKey);
 assert.equal(fileKeys.length,115);assert.equal(new Set(fileKeys).size,115);
 const f=fixture({packagePaths:fileKeys.map(k=>k.slice(prefix.length))}),io=f.io(),rows=await io.walkPackage(f.config.catalog.package.rootKey);
 const pairs=new Map();let next=0;const trace=f.proofs.map(({p,c})=>{if(!pairs.has(c.operationNonce))pairs.set(c.operationNonce,++next);return {pathKey:c.pathKey,edge:c.edge,pair:pairs.get(c.operationNonce),fileType:f.fs.get(p).kind};});
 assert.deepEqual(trace,PACKAGE_DIRECTORY_PROOF_FIXTURE);assert.equal(pairs.size,120);assert.deepEqual(rows.map(r=>r.path),[...fileKeys].sort());
 const dirs=PACKAGE_DIRECTORY_PROOF_FIXTURE.filter(e=>e.edge==='before'&&e.fileType==='directory').map(e=>e.pathKey);
 assert.deepEqual(dirs,['node_modules/playwright-core','node_modules/playwright-core/lib','node_modules/playwright-core/lib/client','node_modules/playwright-core/lib/server','node_modules/playwright-core/types']);
 assert.equal(f.fs.opens,120);assert.equal(f.fs.closes,120);assert.equal(io.snapshot().pendingOriginals,0);assert.equal(io.snapshot().openHandles,0);
 // The parent derives these directory keys from authenticated file inventory;
 // it must not admit arbitrary caller-selected sibling/prefix paths.
 assert.equal(dirs.includes('node_modules'),false);assert.equal(dirs.includes('node_modules/playwright-core/unlisted'),false);
});

test('fresh workspace and exclusive pending/link publication never overwrite and retain both exact bytes',async()=>{
 const f=fixture(),io=f.io();await workspace(f,io);let checks=0;const value=Buffer.from('{"invented":true}');
 const result=await io.publishExclusive({path:'evidence/result.json',bytes:value,beforePublish(){checks++;assert.ok(f.fs.log.some(r=>r[0]==='close'&&r[1].endsWith('.pending')));assert.ok(!f.fs.nodes.has(WORK+'\\evidence\\result.json'));return true;}});
 assert.equal(checks,1);assert.equal(result.sha256,sha(value));assert.equal(result.pendingRetained,true);assert.equal(f.fs.get(result.path),f.fs.get(result.path+'.pending'));assert.deepEqual(await io.readWorkspaceFile('evidence/result.json'),value);
 const order=f.fs.log.map(x=>x[0]);assert.ok(order.lastIndexOf('link')>order.indexOf('sync'));assert.equal(io.snapshot().openHandles,0);
 await assert.rejects(io.publishExclusive({path:'evidence/result.json',bytes:Buffer.from('replacement'),beforePublish:()=>true}));assert.deepEqual(f.fs.get(result.path).b,value);
});

test('publication guard/partial write/link conflicts retain owned pending and never overwrite foreign final',async()=>{
 for(const kind of ['guard','write','link']){
  const f=fixture(),io=f.io();await workspace(f,io);const final=WORK+'\\evidence\\result.json';
  if(kind==='write')f.fs.hooks.write=()=>{throw Error('invented write failure');};if(kind==='link')f.fs.hooks.link=()=>{f.fs.seed(final,Buffer.from('foreign'));};
  await assert.rejects(io.publishExclusive({path:'evidence/result.json',bytes:Buffer.from('owned'),beforePublish:()=>{if(kind==='guard')throw Error('invented');return true;}}));
  assert.ok(f.fs.nodes.has(final+'.pending'));assert.equal(io.snapshot().failed,true);assert.equal(io.snapshot().openHandles,0);
  if(kind==='link')assert.equal(f.fs.get(final).b.toString(),'foreign');else assert.equal(f.fs.nodes.has(final),false);
 }
});

test('seven-file stage has exact fresh layout and can be rechecked without browser/native authority',async()=>{
 const f=fixture(),io=f.io();await io.createWorkspace();const s=stage();let gates=0;const handle=await io.stageExtension({directory:'stage',stage:s,expectedStageIdentity:s.stageIdentity,beforePublish:()=>{gates++;assert.ok(STAGE.every(name=>f.fs.nodes.has(path.join(WORK,'stage',...name.split('/')))));return true;}});
 assert.equal(gates,1);assert.equal(handle.path,WORK+'\\stage');assert.equal(await handle.recheck(),true);assert.equal(f.fs.opens,f.fs.closes);
 f.fs.seed(WORK+'\\stage\\extra.txt',Buffer.from('extra'));await assert.rejects(handle.recheck());assert.equal(io.snapshot().failed,true);
 const g=fixture(),other=g.io();await other.createWorkspace();const bad=clone(s);bad.files[0].text+='changed';await assert.rejects(other.stageExtension({directory:'stage',stage:bad,expectedStageIdentity:s.stageIdentity,beforePublish:()=>true}));assert.equal(g.fs.nodes.has(WORK+'\\stage'),false);
});

test('workspace counters stream every retained entry and enforce bytes without reading file contents',async()=>{
 const f=fixture(),io=f.io();await io.createWorkspace();await io.createDirectory('profiles');await io.createDirectory('profiles/batch1');
 f.fs.seed(WORK+'\\profiles\\batch1\\Local State',Buffer.from('x'));f.fs.seed(WORK+'\\profiles\\batch1\\large-cache',Buffer.alloc(0)).virtualSize=1000000;
 const counts=await io.countWorkspace({directory:'profiles/batch1',scope:'batch'});assert.equal(counts.entries,3);assert.equal(counts.files,2);assert.equal(counts.bytes,1000001);assert.equal(f.fs.reads,0);assert.equal(counts.retained,true);
 f.fs.get(WORK+'\\profiles\\batch1\\large-cache').virtualSize=IO_LIMITS.batchBytes+1;await assert.rejects(io.countWorkspace({directory:'profiles/batch1',scope:'batch'}));assert.ok(f.fs.nodes.has(WORK+'\\profiles\\batch1\\large-cache'));
});

test('a late original close remains charged; no settlement or cleanup success is invented',async()=>{
 const f=fixture();let release;const physical=new Promise(resolve=>{release=resolve;});f.fs.hooks.close=()=>physical;const io=f.io(),reading=io.readEntry(f.entry);
 for(let i=0;i<200&&f.fs.closes===0;i++)await Promise.resolve();assert.equal(f.fs.closes,1);assert.equal(io.snapshot().pendingOriginals,1);assert.equal(io.snapshot().openHandles,1);
 await assert.rejects(io.readEntry(f.entry));assert.equal(io.snapshot().pendingOriginals,1);assert.equal(io.snapshot().busy,true);assert.equal(io.snapshot().openHandles,1);
 release();await assert.rejects(reading);assert.equal(io.snapshot().pendingOriginals,0);assert.equal(io.snapshot().openHandles,0);assert.equal(io.snapshot().busy,false);assert.equal(f.fs.closes,1);
});

test('failed close is not retried or described as closed, while deadline failure still attempts owned cleanup',async()=>{
 const f=fixture();f.fs.hooks.close=()=>{throw Error('invented close');};const io=f.io();await assert.rejects(io.readEntry(f.entry));assert.equal(f.fs.closes,1);assert.equal(io.snapshot().closeUncertain,true);assert.equal(io.snapshot().openHandles,1);
 const g=fixture();let valid=true;g.fs.hooks.read=()=>{valid=false;};g.config.guard=()=>valid;const timed=g.io();await assert.rejects(timed.readEntry(g.entry));assert.equal(g.fs.closes,1);assert.equal(timed.snapshot().openHandles,0);assert.ok(g.counts().cleanupCalls>=2);
});

test('unsafe original promises and handle/proof getters never execute hooks',async()=>{
 for(const kind of ['promise','proof','handle']){
  const f=fixture();let hooks=0;const adapter=f.fs.adapter();
  if(kind==='promise'){const raw=Promise.resolve(undefined);Object.defineProperty(raw,'constructor',{get(){hooks++;throw Error();}});adapter.lstat=()=>raw;}
  if(kind==='proof'){const prior=f.config.inspectNoReparse;f.config.inspectNoReparse=(p,c)=>{const r=prior(p,c);Object.defineProperty(r,'identity',{enumerable:true,get(){hooks++;throw Error();}});return r;};}
  if(kind==='handle')f.fs.hooks.open=h=>{Object.defineProperty(h,'read',{get(){hooks++;throw Error();}});};
  const io=createSpecificityIo(f.config,adapter);await assert.rejects(io.readEntry(f.entry));assert.equal(hooks,0);assert.equal(io.snapshot().failed,true);
 }
});

test('all nine asset pins authenticate structurally before any IO; large streamed mismatch closes normally',async()=>{
 const pins=ASSETS.map(filename=>({filename,bytes:filename==='model.onnx'?118308185:filename==='tokenizer.json'?17082730:32,sha256:filename==='model.onnx'?'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193':filename==='tokenizer.json'?'0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39':sha('invented')}));
 const f=fixture();const bad=clone(pins);bad[8].filename='../../escape';const refused=f.io();await assert.rejects(refused.streamAssets(bad));assert.equal(f.fs.log.length,0);
 const g=fixture();g.fs.seed(ROOT+'\\spikes\\topic-resolution\\browser\\embedding\\.assets\\model.onnx',Buffer.alloc(0)).virtualSize=118308185;
 const streaming=g.io();await assert.rejects(streaming.streamAssets(pins));assert.equal(g.fs.opens,1);assert.equal(g.fs.closes,1);assert.ok(g.fs.reads>100);assert.ok(g.fs.maxRead<=1048576);assert.equal(streaming.snapshot().openHandles,0);
 // Virtual zeros are invented and intentionally do NOT match the actual model.
});

test('pending physical write cannot be closed concurrently or publish after work fault; late close is awaited',async()=>{
 const f=fixture(),io=f.io();await workspace(f,io);let finishWrite,finishClose;
 const write=new Promise(resolve=>{finishWrite=resolve;}),close=new Promise(resolve=>{finishClose=resolve;});
 f.fs.hooks.write=()=>write;f.fs.hooks.close=()=>close;
 const operation=io.publishExclusive({path:'evidence/result.json',bytes:Buffer.from('invented'),beforePublish:()=>true});
 for(let i=0;i<250&&!f.fs.log.some(r=>r[0]==='write');i++)await Promise.resolve();
 assert.ok(f.fs.log.some(r=>r[0]==='write'));assert.equal(io.snapshot().pendingOriginals,1);assert.equal(f.fs.closes,0);
 await assert.rejects(io.readEntry(f.entry));assert.equal(f.fs.closes,0);assert.equal(io.snapshot().pendingOriginals,1);
 finishWrite();for(let i=0;i<40&&f.fs.closes===0;i++)await Promise.resolve();assert.equal(f.fs.closes,1);assert.equal(io.snapshot().pendingOriginals,1);
 finishClose();await assert.rejects(operation);assert.equal(io.snapshot().pendingOriginals,0);assert.equal(io.snapshot().openHandles,0);assert.equal(f.fs.nodes.has(WORK+'\\evidence\\result.json'),false);
});

test('native file identity is independent of Node inode; stale native after proof refuses read',async()=>{
 const f=fixture(),prior=f.config.inspectNoReparse;
 f.config.inspectNoReparse=(p,c)=>{const r=prior(p,c);if(c.edge==='after')r.identity.fileIndex='777777';return r;};
 const io=f.io();await assert.rejects(io.readEntry(f.entry));assert.equal(f.fs.opens,1);assert.equal(f.fs.closes,1);assert.equal(io.snapshot().failed,true);
 assert.ok(f.proofs.every(r=>Object.hasOwn(r.c,'nodeFileIdentityHash')&&!Object.hasOwn(r.c,'nodeIdentityHash')));
});

test('streamed census entry ceiling and case-alias refusal leave every profile file retained',async()=>{
 const f=fixture(),io=f.io();await io.createWorkspace();await io.createDirectory('profiles');await io.createDirectory('profiles/batch1');
 for(let i=0;i<8192;i++)f.fs.seed(WORK+'\\profiles\\batch1\\cache-'+i,Buffer.alloc(0));
 // Do not retain a growing diagnostic array in this deliberately large fake tree.
 f.fs.log={push(){}};f.proofs.push=()=>0;const retained=f.fs.nodes.size;
 await assert.rejects(io.countWorkspace({directory:'profiles/batch1',scope:'batch'}));assert.equal(io.snapshot().failed,true);assert.equal(f.fs.nodes.size,retained);
 const g=fixture(),other=g.io();await other.createWorkspace();await other.createDirectory('profiles');await other.createDirectory('profiles/batch1');
 g.fs.seed(WORK+'\\profiles\\batch1\\Cache',Buffer.alloc(0));g.fs.seed(WORK+'\\profiles\\batch1\\cache',Buffer.alloc(0));await assert.rejects(other.countWorkspace({directory:'profiles/batch1',scope:'batch'}));
 assert.ok(g.fs.nodes.has(WORK+'\\profiles\\batch1\\Cache')&&g.fs.nodes.has(WORK+'\\profiles\\batch1\\cache'));
});

test('late successful open is privately owned before post-settlement deadline check and closed once',async()=>{
 const f=fixture();let valid=true;f.config.guard=()=>valid;f.fs.hooks.open=()=>{valid=false;};const io=f.io();
 await assert.rejects(io.readEntry(f.entry));assert.equal(f.fs.opens,1);assert.equal(f.fs.closes,1);assert.equal(io.snapshot().openHandles,0);assert.equal(io.snapshot().pendingOriginals,0);assert.equal(io.snapshot().failed,true);
 const g=fixture();let release;const original=new Promise(resolve=>{release=resolve;});g.fs.hooks.open=()=>original;
 const other=g.io(),reading=other.readEntry(g.entry);for(let i=0;i<200&&g.fs.opens===0;i++)await Promise.resolve();assert.equal(g.fs.opens,1);assert.equal(other.snapshot().pendingOriginals,1);await assert.rejects(other.readEntry(g.entry));
 release();await assert.rejects(reading);assert.equal(g.fs.closes,1);assert.equal(other.snapshot().openHandles,0);assert.equal(other.snapshot().pendingOriginals,0);
});

test('only exact absent final ACK returns null without bytes, open or native proof; later publication gets full proof',async()=>{
 const f=fixture(),io=f.io();await io.createWorkspace();const proofs=f.proofs.length;
 assert.equal(await io.readPublishedIfPresent('batch-01.start.ack.json'),null);assert.equal(await io.readPublishedIfPresent('ack.json'),null);assert.equal(await io.readPublishedIfPresent('finish.ack.json'),null);
 assert.equal(f.proofs.length,proofs);assert.equal(f.fs.opens,0);assert.equal(f.fs.reads,0);assert.equal(io.snapshot().failed,false);
 const bytes=Buffer.from('{"inventedAck":true}');f.fs.seed(WORK+'\\batch-01.start.ack.json',bytes);
 assert.deepEqual(await io.readPublishedIfPresent('batch-01.start.ack.json'),bytes);assert.equal(f.fs.opens,1);assert.equal(f.fs.closes,1);assert.equal(f.proofs.length,proofs+2);
 f.fs.seed(WORK+'\\finish.ack.json',bytes);assert.deepEqual(await io.readPublishedIfPresent('finish.ack.json'),bytes);assert.equal(f.fs.opens,2);assert.equal(f.fs.closes,2);assert.equal(f.proofs.length,proofs+4);
});

test('nullable ACK API refuses unexpected names before IO and missing/unsafe ancestors never become null',async()=>{
 for(const name of ['some.ack.json','batch-25.start.ack.json','evidence/batch-01.start.ack.json','../ack.json','model-encoding.ack.json']){
  const f=fixture(),io=f.io();await io.createWorkspace();const calls=f.fs.log.length;await assert.rejects(io.readPublishedIfPresent(name));assert.equal(f.fs.log.length,calls);assert.equal(io.snapshot().failed,true);
 }
 for(const kind of ['root','ancestor','symlink','not-directory','denied']){
  const f=fixture(),io=f.io();await io.createWorkspace();
  if(kind==='root')f.fs.nodes.delete(WORK);if(kind==='ancestor')f.fs.nodes.delete(ROOT+'\\owned');if(kind==='symlink')f.fs.get(ROOT+'\\owned').kind='symlink';
  if(kind==='not-directory')f.fs.get(ROOT+'\\owned').kind='file';if(kind==='denied')f.fs.hooks.lstat=p=>{if(p===WORK+'\\ack.json')throw failure('EACCES');};
  await assert.rejects(io.readPublishedIfPresent('ack.json'));assert.equal(io.snapshot().failed,true);assert.equal(f.fs.opens,0);
 }
});

test('observed existing ACK disappearance/replacement/unsafe final cannot fall back to null',async()=>{
 for(const kind of ['vanishes','replacement','symlink','oversize','unsafe-proof']){
  const f=fixture();let unsafeProof=false;const prior=f.config.inspectNoReparse;f.config.inspectNoReparse=(p,c)=>{const r=prior(p,c);return unsafeProof?{...r,attributes:1024}:r;};
  const io=f.io();await io.createWorkspace();const target=WORK+'\\ack.json';f.fs.seed(target,Buffer.from('owned ACK'));let samples=0;
  if(kind==='vanishes'||kind==='replacement')f.fs.hooks.lstat=p=>{if(p===target&&++samples===2){if(kind==='vanishes')f.fs.nodes.delete(p);else f.fs.seed(p,Buffer.from('foreign ACK'));}};
  if(kind==='symlink')f.fs.get(target).kind='symlink';if(kind==='oversize')f.fs.get(target).virtualSize=16385;
  if(kind==='unsafe-proof')unsafeProof=true;
  await assert.rejects(io.readPublishedIfPresent('ack.json'));assert.equal(io.snapshot().failed,true);assert.equal(f.fs.opens,f.fs.closes);
 }
});

test('ACK publication during a negative sample can advance directory metadata but not replace root identity',async()=>{
 const f=fixture(),io=f.io();await io.createWorkspace();let sampled=false;
 f.fs.hooks.lstat=p=>{if(p===WORK+'\\ack.json'&&!sampled){sampled=true;f.fs.get(WORK).time++;throw failure('ENOENT');}};
 const before=f.proofs.length;assert.equal(await io.readPublishedIfPresent('ack.json'),null);assert.equal(f.proofs.length,before);
 const g=fixture(),other=g.io();await other.createWorkspace();g.fs.hooks.lstat=p=>{if(p===WORK+'\\ack.json'){const n=g.fs.get(WORK);g.fs.nodes.set(WORK,{...n,ino:7777n});throw failure('ENOENT');}};
 await assert.rejects(other.readPublishedIfPresent('ack.json'));assert.equal(other.snapshot().failed,true);
});

test('same-byte same-size replacement during original close cannot be adopted by publish or stage',async()=>{
 for(const kind of ['publish','stage']){
  const f=fixture(),io=f.io();await io.createWorkspace();if(kind==='publish')await io.createDirectory('evidence');
  const target=kind==='publish'?WORK+'\\evidence\\result.json.pending':WORK+'\\stage\\batch-config.js';let replaced=false,gates=0,openedIdentity;
  f.fs.hooks.close=h=>{if(h.path===target&&!replaced){openedIdentity=h.node.ino;const sameBytes=Buffer.from(h.node.b);f.fs.seed(target,sameBytes);replaced=true;assert.notEqual(f.fs.get(target).ino,openedIdentity);assert.deepEqual(f.fs.get(target).b,sameBytes);}};
  if(kind==='publish')await assert.rejects(io.publishExclusive({path:'evidence/result.json',bytes:Buffer.from('owned bytes'),beforePublish:()=>{gates++;return true;}}));
  else{const s=stage();await assert.rejects(io.stageExtension({directory:'stage',stage:s,expectedStageIdentity:s.stageIdentity,beforePublish:()=>{gates++;return true;}}));}
  assert.equal(replaced,true);assert.equal(gates,0);assert.equal(f.fs.log.filter(r=>r[0]==='close'&&r[1]===target).length,1);assert.equal(f.fs.log.some(r=>r[0]==='link'),false);
  assert.equal(io.snapshot().failed,true);assert.equal(io.snapshot().openHandles,0);assert.equal(io.snapshot().pendingOriginals,0);assert.equal(f.proofs.some(r=>r.c.edge==='after'&&r.c.pathKey==='workspace:'+target.slice(WORK.length+1).split('\\').join('/')),false);
  assert.ok(f.fs.nodes.has(target));await assert.rejects(io.readEntry(f.entry));assert.equal(f.fs.log.filter(r=>r[0]==='close'&&r[1]===target).length,1);
 }
});
