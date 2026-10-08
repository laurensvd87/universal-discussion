import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const SHA = Object.freeze({
  train: '2f229a606e9eaad34eb35a6b908d3f3321ba825da8a1e68494f6710f0dd89d27',
  validation: '71bd27e34e48ccc239199559e0fe61c5de556860e9fde74d20f3fd27439cdd3e',
});
// Evaluation metadata only. These broad entities distinguish different
// developments of the same entity; the matcher never receives this mapping.
const BROAD = new Map([
  [['northbridge_flood_gate', 'northbridge_gate_contract'], 'northbridge_east_reach_gate'],
  [['atlas4_battery_recall', 'atlas5_heat_update'], 'atlas_mobile'],
  [['harbor_rent_cap', 'harbor_rental_tax'], 'harbor_city_housing_and_visitors'],
  [['kestrel_exoplanet_claim', 'kestrel_launch_delay'], 'kestrel_2_program'],
  [['tigers_coach_suspension', 'tigers_stadium_redevelopment'], 'tigers_club'],
  [['nimbus_v2_price', 'nimbus_v1_warranty'], 'nimbus_home_battery'],
  [['morrow_vaccine_booking', 'morrow_vaccine_storage'], 'morrow_county_vaccine_program'],
  [['aurora_lens_delamination', 'aurora_a9_firmware'], 'aurora_imaging'],
  [['pioneer_van_connector', 'pioneer_trail_navigation_update'], 'pioneer_trail_van'],
].flatMap(([families, broad]) => families.map(family => [family, broad])));

export async function loadTrainValidation() {
  const splits = {}, seen = new Set(), families = new Map();
  for (const [split, sha] of Object.entries(SHA)) {
    const bytes = await readFile(new URL(`../luna-corpus/${split}.jsonl`, import.meta.url));
    if (bytes.length > 512 * 1024 || createHash('sha256').update(bytes).digest('hex') !== sha)
      throw new Error(`Frozen ${split} corpus mismatch`);
    const rows = bytes.toString('utf8').trim().split(/\r?\n/u).map(line => JSON.parse(line));
    for (const row of rows) {
      if (row.split !== split || typeof row.id !== 'string' || seen.has(row.id) ||
          typeof row.title !== 'string' || typeof row.body !== 'string' ||
          typeof row.family !== 'string' || typeof row.topicLabel !== 'string' ||
          typeof row.viewpoint !== 'string') throw new Error('Invalid training/validation row');
      seen.add(row.id);
      if (families.has(row.family) && families.get(row.family) !== split)
        throw new Error('Family leakage');
      families.set(row.family, split);
      row.family = BROAD.get(row.family) ?? row.family;
    }
    splits[split] = rows;
  }
  if (splits.train.length !== 80 || splits.validation.length !== 20) throw new Error('Unexpected corpus size');
  return splits;
}
