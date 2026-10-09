// Aggregate-only adapter for synthetic train and validation records.
const LANGUAGES = new Set(['en', 'de', 'nl', 'fr', 'es']);
const fail = code => { throw new TypeError(code); };

export function validatePartition(rows, split, expectedCount, expectedFamilies) {
  if (!Array.isArray(rows) || rows.length !== expectedCount) fail('ROW_COUNT');
  const ids = new Set(), events = new Map(), families = new Map();
  for (const row of rows) {
    if (!row || row.split !== split || typeof row.id !== 'string' || !row.id ||
        ids.has(row.id) || typeof row.family !== 'string' || !row.family ||
        typeof row.development !== 'string' || !row.development ||
        typeof row.topicLabel !== 'string' || !row.topicLabel ||
        !LANGUAGES.has(row.language) || typeof row.viewpoint !== 'string' ||
        !row.viewpoint || typeof row.viewpointStyle !== 'string' ||
        !row.viewpointStyle || typeof row.title !== 'string' || !row.title.trim() ||
        typeof row.body !== 'string' || !row.body.trim()) fail('SCHEMA');
    ids.add(row.id);
    const event = events.get(row.topicLabel) ?? [];
    event.push(row);
    events.set(row.topicLabel, event);
    const family = families.get(row.family) ?? new Set();
    family.add(row.topicLabel);
    families.set(row.family, family);
  }
  if (families.size !== expectedFamilies || events.size !== expectedFamilies * 2 ||
      [...families.values()].some(eventsInFamily => eventsInFamily.size !== 2))
    fail('EVENT_STRUCTURE');
  for (const members of events.values()) {
    if (members.length !== 10 || new Set(members.map(row => row.family)).size !== 1 ||
        new Set(members.map(row => row.development)).size !== 1) fail('EVENT_STRUCTURE');
    for (const language of LANGUAGES) {
      const pair = members.filter(row => row.language === language);
      if (pair.length !== 2 || new Set(pair.map(row => row.viewpoint)).size !== 2 ||
          new Set(pair.map(row => row.viewpointStyle)).size !== 2)
        fail('VIEWPOINT_BALANCE');
    }
  }
  return rows.map(row => ({ id: row.id, eventKey: row.topicLabel,
    title: row.title, lead: row.body.slice(0, 384), lang: row.language,
    categories: [row.family] }));
}

export function verifyIsolation(train, validation) {
  if (new Set(train.concat(validation).map(doc => doc.id)).size !== train.length + validation.length ||
      train.some(a => validation.some(b => a.eventKey === b.eventKey ||
        a.categories[0] === b.categories[0]))) fail('SPLIT_LEAKAGE');
  return true;
}
