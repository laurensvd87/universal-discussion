import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { compare, fixtures } from './evaluate.js';

for (const [name, pages] of Object.entries(fixtures())) {
  const result = compare(pages);
  process.stdout.write(`${name} (${pages.length} pages): ${JSON.stringify(result.metrics)}\n`);
}
