// Invented vectors emulate geometry only. They are not measured E5 vectors.
const angleVector = angle => [Math.cos(angle), Math.sin(angle), ...Array(382).fill(0)];
const page = (id, topicLabel, family, title, angle, viewpoint = 'report') => ({
  document: { id, topicLabel, family, title, body: `${title}. A separately invented article summary about this event.`, viewpoint },
  vector: angleVector(angle),
});

export function observedShape() {
  const trueAngle = Math.acos(0.90963);
  const wrongAngle = trueAngle + Math.acos(0.91400);
  return [
    page('announcement-a', 'announcement', 'tariffs', 'Trump announces reciprocal tariffs on April 2', 0, 'critical'),
    page('announcement-b', 'announcement', 'tariffs', 'Trump promises American Dream in tariff announcement', trueAngle, 'supportive'),
    page('exemptions', 'exemptions', 'tariffs', 'Tariff exemptions announced on April 9', wrongAngle),
  ];
}

export function sameEventCrowd(count = 7) {
  if (!Number.isInteger(count) || count < 2 || count > 128) throw new TypeError('Invalid crowd size');
  return Array.from({ length: count }, (_, i) => page(`view-${String(i).padStart(3, '0')}`,
    'announcement', 'tariffs', `Publisher p${i} on the April 2 reciprocal tariff announcement`,
    (i - (count - 1) / 2) * (0.4 / Math.max(1, count - 1)), i % 2 ? 'supportive' : 'critical'));
}

export function adjacentDevelopments() {
  const first = sameEventCrowd(7);
  return [...first,
    page('exemption-a', 'exemptions', 'tariffs', 'April 9 tariff exemption decision', 0.38),
    page('exemption-b', 'exemptions', 'tariffs', 'April 9 exemptions reshape tariff plan', 0.42),
  ];
}

export function fixtureInputs(rows) {
  return { documents: rows.map(row => row.document),
    vectors: new Map(rows.map(row => [row.document.id, row.vector])) };
}
