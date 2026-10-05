// Invented signals and separately authored relevance labels. These coordinates
// simulate an imperfect single-vector signal; they are not measured E5 output.
export const documents = [
  { id: 'toll-query', title: 'Harbor road toll proposal for morning traffic', domain: 'civic.example', vector: [1, 0, 0, 0, 0, 0] },
  { id: 'toll-support', title: 'Harbor road toll proposal could ease morning traffic', domain: 'metro.example', vector: [0.98, 0.11, 0, 0, 0, 0] },
  { id: 'toll-oppose', title: 'Harbor road toll proposal would hurt commuters', domain: 'forum.example', vector: [0.96, -0.15, 0, 0, 0, 0] },
  { id: 'toll-de', title: 'Hafengebühr für den morgendlichen Autoverkehr', domain: 'stadt.example', vector: [0.94, 0.13, 0, 0, 0, 0] },
  { id: 'toll-bus', title: 'Harbor toll and new bus timetable proposal', domain: 'transport.example', vector: [0.72, 0, 0.7, 0, 0, 0] },
  { id: 'bus-only', title: 'New bus timetable proposal for morning routes', domain: 'bus.example', vector: [0, 0, 1, 0, 0, 0] },
  { id: 'harbor-bridge', title: 'Harbor authority proposes bridge repairs', domain: 'works.example', vector: [0.72, 0, 0, 0.7, 0, 0] },
  { id: 'bridge-budget', title: 'Bridge repairs budget faces revision', domain: 'budget.example', vector: [0, 0, 0, 1, 0, 0] },
  { id: 'phone-release', title: 'Arbor phone model seven launched', domain: 'tech.example', vector: [0, 0, 0, 0, 1, 0] },
  { id: 'phone-update', title: 'Arbor phone model seven security update', domain: 'updates.example', vector: [0, 0, 0, 0, 0.94, 0.2] },
  { id: 'phone-eight', title: 'Arbor phone model eight launched months later', domain: 'tech2.example', vector: [0, 0, 0, 0, 0.9, -0.25] },
  { id: 'weak-false-friend', title: 'Harbor road toll proposal satirical fiction', domain: 'fiction.example', vector: [0.999, 0, 0, 0, 0, 0] },
];

// 0 unrelated, 1 adjacent, 2 overlapping/related, 3 same subject.
export const grades = Object.freeze({
  'toll-support': 3, 'toll-oppose': 3, 'toll-de': 3, 'toll-bus': 2,
  'bus-only': 1, 'harbor-bridge': 1, 'bridge-budget': 0,
  'phone-release': 0, 'phone-update': 0, 'phone-eight': 0,
  'weak-false-friend': 0,
});

export const duplicateFlood = Array.from({ length: 24 }, (_, index) => ({
  id: `copy-${String(index).padStart(2, '0')}`,
  title: 'Harbor road toll proposal could ease morning traffic',
  domain: `copy${index}.example`,
  vector: [0.98, 0.11, 0, 0, 0, 0],
}));

export const unrelatedGrowth = Array.from({ length: 128 }, (_, index) => ({
  id: `unrelated-${String(index).padStart(3, '0')}`,
  title: `Synthetic unrelated note ${index}`,
  domain: `unrelated${index}.example`,
  vector: [0, 0, 0, 0, 0, 1 + index / 1000],
}));
