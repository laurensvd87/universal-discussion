(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const state = { data: null, currentData: null, preview: null, grouping: 'current', chosenGrouping: null, snapshotKey: null, topicId: null, pageId: null, query: '', view: { x: 0, y: 0, w: 1000, h: 700 }, drag: null, moved: false };
  const format = new Intl.NumberFormat('de-DE');
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const svg = (name, attributes = {}) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };
  const growthState = { data: null, window: '24h', view: 'time' };
  const growthTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  function normalizeGrowth(input, current) {
    const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).sort().join(',') === [...keys].sort().join(',');
    if (!exact(input, ['schemaVersion', 'retention', 'points']) || !['catalog-growth/v1', 'catalog-growth/v2'].includes(input.schemaVersion) ||
        !exact(input.retention, ['minuteHours', 'hourlyDays', 'maxPoints']) || input.retention.minuteHours !== 24 ||
        input.retention.hourlyDays !== 90 || input.retention.maxPoints !== 4096 ||
        !Array.isArray(input.points) || input.points.length > 4096) throw new Error('Invalid growth history');
    let previous = null;
    const currentDefinition = input.schemaVersion === 'catalog-growth/v2';
    const counters = ['revision', 'totalSources', 'learnedPages', 'activeTopics', 'totalTopics',
      ...(currentDefinition ? ['multiMemberTopics', 'singletonTopics'] : [])];
    const revisions = new Map();
    const points = input.points.map((row) => {
      if (!exact(row, ['at', 'seriesId', ...counters]) ||
          typeof row.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(row.at) ||
          !Number.isFinite(Date.parse(row.at)) || new Date(row.at).toISOString() !== row.at ||
          typeof row.seriesId !== 'string' || !/^[a-f0-9]{64}$/u.test(row.seriesId) ||
          !counters.every(key => Number.isSafeInteger(row[key]) && row[key] >= 0) ||
          row.learnedPages > row.totalSources || row.activeTopics > row.totalTopics ||
          (currentDefinition ? row.multiMemberTopics + row.singletonTopics !== row.activeTopics : row.activeTopics > row.learnedPages) ||
          (previous && row.at < previous.at) || (revisions.has(row.seriesId) && row.revision < revisions.get(row.seriesId))) {
        throw new Error('Invalid growth point');
      }
      revisions.set(row.seriesId, row.revision);
      previous = row;
      return { ...row, time: Date.parse(row.at) };
    });
    if (points.length && (!current.growthSeriesId || points.at(-1).seriesId !== current.growthSeriesId)) throw new Error('Mismatched growth series');
    return Object.assign(points, { legacy: !currentDefinition });
  }
  function loadGrowth(input, current) {
    try { growthState.data = normalizeGrowth(input, current); }
    catch { growthState.data = null; }
    renderGrowth();
  }
  function renderGrowth() {
    const plot = $('growth-plot'), metrics = $('growth-metrics');
    plot.replaceChildren(); metrics.replaceChildren();
    for (const button of document.querySelectorAll('[data-growth-window]')) button.setAttribute('aria-pressed', String(button.dataset.growthWindow === growthState.window));
    for (const button of document.querySelectorAll('[data-growth-view]')) button.setAttribute('aria-pressed', String(button.dataset.growthView === growthState.view));
    const byPages = growthState.view === 'pages';
    $('growth-chart').setAttribute('viewBox', byPages ? '0 0 840 210' : '0 0 840 180');
    $('growth-chart-title').textContent = byPages ? 'Kanonische Topics mit mindestens zwei Seiten über gelernte Seiten' : 'Verlauf der Katalogzahlen';
    $('growth-key').replaceChildren(...(byPages ? [textElement('span', 'growth-topics', 'Topics (≥2 Seiten); Messpunkte in zeitlicher Reihenfolge')] :
      [textElement('span', 'growth-pages', 'Gelernte Seiten'), textElement('span', 'growth-topics', 'Topics (≥2 Seiten)')]));
    const all = growthState.data;
    if (all?.legacy) {
      $('growth-chart').hidden = true;
      $('growth-status').textContent = 'Legacy-Verlauf (Topics mit mindestens einer Seite). Topics mit mindestens zwei Seiten sind daraus nicht bekannt; neuer Verlauf beginnt mit Version 2.';
      $('growth-chart-description').textContent = 'Legacy-Zahlen werden nicht als Mehrseiten-Topics umgedeutet.';
      return;
    }
    $('growth-chart').hidden = !all?.length;
    if (!all?.length) {
      $('growth-status').textContent = all ? 'Verlauf wird ab jetzt aufgezeichnet.' : 'Verlauf derzeit nicht verfügbar.';
      $('growth-chart-description').textContent = 'Noch keine gültigen Messpunkte.';
      return;
    }
    const latest = all.at(-1);
    const durations = { '1h': 3600000, '24h': 86400000, '7d': 604800000, all: Infinity };
    const points = all.filter(point => point.time >= latest.time - durations[growthState.window]);
    const currentSeries = points.filter(point => point.seriesId === latest.seriesId);
    const first = currentSeries[0];
    const metric = (label, value, delta = null) => {
      const node = textElement('div', 'growth-metric', '');
      node.append(textElement('strong', '', value), textElement('span', '', label));
      if (delta !== null) node.append(textElement('small', '', `Δ ${delta > 0 ? '+' : ''}${format.format(delta)} im Messzeitraum`));
      metrics.append(node);
    };
    metric('gelernte Seiten', format.format(latest.learnedPages), latest.learnedPages - first.learnedPages);
    metric('kanonische Topics (≥2 Seiten)', format.format(latest.multiMemberTopics), latest.multiMemberTopics - first.multiMemberTopics);
    metric('Singleton-Topics (eine Seite)', format.format(latest.singletonTopics), latest.singletonTopics - first.singletonTopics);
    metric('Topics gesamt (inkl. leerer)', format.format(latest.totalTopics));
    const minimum = points[0].time, span = Math.max(60000, latest.time - minimum);
    const maximum = Math.max(1, ...points.map(point => byPages ? point.multiMemberTopics : Math.max(point.learnedPages, point.multiMemberTopics)));
    const maximumPages = Math.max(1, ...points.map(point => point.learnedPages));
    const x = point => 58 + (byPages ? point.learnedPages / maximumPages : (point.time - minimum) / span) * 756;
    const y = value => 140 - value / maximum * 112;
    for (const fraction of [0, .5, 1]) {
      plot.append(svg('line', { x1: 58, x2: 814, y1: y(maximum * fraction), y2: y(maximum * fraction), class: 'growth-grid' }));
      const label = svg('text', { x: 50, y: y(maximum * fraction) + 4, 'text-anchor': 'end', class: 'growth-axis' });
      label.textContent = format.format(Math.round(maximum * fraction)); plot.append(label);
    }
    for (const [point, anchor] of [[points[0], 'start'], [latest, 'end']]) {
      const label = svg('text', { x: anchor === 'start' ? 58 : 814, y: 170, 'text-anchor': anchor, class: 'growth-axis' });
      label.textContent = byPages ? format.format(anchor === 'start' ? 0 : maximumPages) : growthTime.format(new Date(point.time)); plot.append(label);
    }
    if (byPages) {
      const horizontal = svg('text', { x: 436, y: 199, 'text-anchor': 'middle', class: 'growth-axis', 'data-growth-axis': 'x' });
      horizontal.textContent = 'Gelernte Seiten (x)';
      const vertical = svg('text', { x: 58, y: 15, class: 'growth-axis', 'data-growth-axis': 'y' });
      vertical.textContent = 'Topics mit ≥2 Seiten (y)';
      plot.append(horizontal, vertical);
    }
    const segments = [];
    for (const point of points) {
      const previous = segments.at(-1)?.at(-1);
      const recent = previous && previous.time >= latest.time - 86400000;
      if (!previous || point.seriesId !== previous.seriesId || point.time - previous.time > (recent ? 5 * 60000 : 90 * 60000)) segments.push([]);
      segments.at(-1).push(point);
    }
    for (const [key, suffix] of (byPages ? [['multiMemberTopics', 'topics']] : [['learnedPages', 'pages'], ['multiMemberTopics', 'topics']])) {
      for (const segment of segments) {
        const line = svg('path', { d: segment.map((point, index) => `${index ? 'L' : 'M'}${x(point).toFixed(2)},${y(point[key]).toFixed(2)}`).join(' '), class: `growth-line growth-line-${suffix}` });
        plot.append(line);
        const last = segment.at(-1);
        const dot = svg('circle', { cx: x(last), cy: y(last[key]), r: 3, class: `growth-dot-${suffix}` });
        appendTitle(dot, `${growthTime.format(new Date(last.time))}: ${byPages ? `${format.format(last.learnedPages)} gelernte Seiten, ` : ''}${format.format(last[key])} ${key === 'learnedPages' ? 'gelernte Seiten' : 'Topics mit mindestens zwei Seiten'}`);
        plot.append(dot);
      }
    }
    $('growth-chart-description').textContent = `${points.length} Messpunkte. ${byPages ? 'X-Achse: eindeutige gelernte Seiten. Y-Achse: kanonische Topics mit mindestens zwei Seiten. Verbindung in zeitlicher Reihenfolge; Löschungen können nach links und unten führen. ' : ''}Gelernte Seiten aktuell ${latest.learnedPages}, Topics mit mindestens zwei Seiten ${latest.multiMemberTopics}, Singleton-Topics ${latest.singletonTopics}. Änderungen seit ${growthTime.format(new Date(first.time))}: Seiten ${latest.learnedPages - first.learnedPages}, Topics ${latest.multiMemberTopics - first.multiMemberTopics}.`;
    $('growth-status').textContent = points.length === 1 ? `Erster Messpunkt: ${growthTime.format(new Date(latest.time))}. Verlauf wird ab jetzt aufgezeichnet.` :
      `${format.format(points.length)} Messpunkte · Stand ${growthTime.format(new Date(latest.time))} · Δ seit ${growthTime.format(new Date(first.time))}, nur im aktuellen Katalog. Aufzeichnung: 24 h minutengenau, danach stündlich, bis zu 90 Tage.`;
  }

  function showStatus(message) {
    $('status').textContent = message;
    clearTimeout(showStatus.timer);
    if (message) showStatus.timer = setTimeout(() => { $('status').textContent = ''; }, 5000);
  }

  const snapshotHealth = { live: false, failure: null };
  function renderSnapshotHealth() {
    const indicator = $('snapshot-health');
    const publish = (phase, message) => {
      if (indicator.dataset.state !== phase) indicator.dataset.state = phase;
      // Unchanged polling must not repeatedly announce the same live-region text.
      if (indicator.textContent !== message) indicator.textContent = message;
    };
    if (!state.currentData) { publish('empty', 'Noch keine Momentaufnahme geladen.'); return; }
    if (!snapshotHealth.live) {
      publish('static', 'Statische Momentaufnahme · keine automatische Aktualisierung.');
      return;
    }
    const at = Date.parse(state.currentData.generatedAt);
    const clockSkew = Number.isFinite(at) && at > Date.now() + 30000;
    const stale = Number.isFinite(at) && Date.now() - at >= 180000;
    const age = !Number.isFinite(at) ? 'Zeitstand der Momentaufnahme nicht prüfbar.' : clockSkew
      ? 'Zeitstempel mehr als 30 Sekunden in der Zukunft: mögliche Uhrzeitabweichung; Aktualität nicht prüfbar.'
      : stale ? 'Momentaufnahme mindestens 3 Minuten alt.' : '';
    const phase = snapshotHealth.failure ? 'error' : clockSkew ? 'clock-skew' : stale || !Number.isFinite(at) ? 'stale' : 'current';
    const message = snapshotHealth.failure
      ? `${snapshotHealth.failure === 'timeout' ? 'Zeitlimit bei der lokalen Aktualisierung.' : 'Lokale Aktualisierung fehlgeschlagen.'} Letzte geladene Zahlen bleiben sichtbar. ${age} Der Zustand von Crawler und Datenbank ist daraus nicht bekannt.`
      : age ? `${age} Letzte geladene Zahlen bleiben sichtbar; der Zustand von Watcher, Crawler und Datenbank ist daraus nicht bekannt.`
        : 'Lokale Momentaufnahme aktuell · automatische Prüfung alle 3 Sekunden.';
    publish(phase, message);
  }

  function publicUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname ||
          /^(?:\d+\.\d+\.\d+\.\d+|\[.*\])$/u.test(url.hostname) ||
          /(?:^|\.)(?:localhost|local|internal|onion)$/u.test(url.hostname)) return null;
      return url.href;
    } catch { return null; }
  }

  function coordinate(value) { return Number.isFinite(value) && value >= 0 && value <= 1; }
  function safeText(value, fallback = 'Ohne Titel') { return typeof value === 'string' && value.trim() ? value.trim().slice(0, 240) : fallback; }
  function normalize(input) {
    if (!input || ![1, 2].includes(input.schemaVersion) || !Array.isArray(input.topics) || !Array.isArray(input.pages) || !Array.isArray(input.edges) || !input.counts) throw new Error('Unbekanntes Dashboard-Format.');
    if (input.pages.length > 10000 || input.topics.length > 10000 || input.edges.length > 30000) throw new Error('Dashboard-Datei ist zu groß.');
    const topics = [], topicIds = new Set();
    for (const row of input.topics) {
      if (!row || typeof row.id !== 'string' || !row.id || topicIds.has(row.id) || !coordinate(row.x) || !coordinate(row.y)) continue;
      topicIds.add(row.id);
      topics.push({ id: row.id, title: safeText(row.title, 'Unbenanntes Topic'), kind: safeText(row.kind, ''), pageCount: Number.isInteger(row.pageCount) && row.pageCount >= 0 ? row.pageCount : 0, x: row.x, y: row.y });
    }
    const pages = [], pageIds = new Set();
    for (const row of input.pages) {
      if (!row || typeof row.id !== 'string' || !row.id || pageIds.has(row.id) || !topicIds.has(row.topicId) || !coordinate(row.x) || !coordinate(row.y)) continue;
      const url = publicUrl(row.url);
      if (!url) continue;
      const memberships = input.schemaVersion === 2 && row.topicIds !== undefined ? row.topicIds : [row.topicId];
      if (!Array.isArray(memberships) || !memberships.length || memberships.length > input.topics.length ||
          memberships.some(id => typeof id !== 'string' || !topicIds.has(id)) || !memberships.includes(row.topicId) ||
          new Set(memberships).size !== memberships.length) throw new Error('Ungültige Topic-Zuordnung.');
      pageIds.add(row.id);
      pages.push({ id: row.id, title: safeText(row.title), url, host: new URL(url).hostname, topicId: row.topicId,
        topicIds: [...memberships], x: row.x, y: row.y });
    }
    const edges = [];
    for (const row of input.edges) {
      if (row && pageIds.has(row.sourceId) && pageIds.has(row.targetId) && row.sourceId !== row.targetId && Number.isFinite(row.score) && row.score >= -1 && row.score <= 1) edges.push({ sourceId: row.sourceId, targetId: row.targetId, score: row.score });
    }
    const counts = input.counts;
    const number = (value, fallback) => Number.isInteger(value) && value >= 0 ? value : fallback;
    const membership = new Map();
    for (const page of pages) for (const topicId of page.topicIds) {
      if (!membership.has(topicId)) membership.set(topicId, new Set()); membership.get(topicId).add(page.id);
    }
    for (const topic of topics) topic.pageCount = membership.get(topic.id)?.size ?? 0;
    let multiMemberTopics = [...membership.values()].filter(ids => ids.size >= 2).length;
    let singletonTopics = [...membership.values()].filter(ids => ids.size === 1).length;
    if (input.graphLimited === true) {
      if (input.schemaVersion === 2) {
        if (!Number.isSafeInteger(counts.multiMemberTopics) || counts.multiMemberTopics < 0 ||
            !Number.isSafeInteger(counts.singletonTopics) || counts.singletonTopics < 0 ||
            counts.multiMemberTopics + counts.singletonTopics !== counts.topics) throw new Error('Ungültige Topic-Zahlen.');
        multiMemberTopics = counts.multiMemberTopics; singletonTopics = counts.singletonTopics;
      } else { multiMemberTopics = singletonTopics = null; }
    }
    return {
      generatedAt: typeof input.generatedAt === 'string' ? input.generatedAt : '',
      catalogRevision: typeof input.catalogRevision === 'string' && /^[a-f0-9]{64}$/u.test(input.catalogRevision) ? input.catalogRevision : null,
      growthSeriesId: typeof input.growthSeriesId === 'string' && /^[a-f0-9]{64}$/u.test(input.growthSeriesId) ? input.growthSeriesId : null,
      graphLimited: input.graphLimited === true,
      topics, pages, edges,
      counts: { totalSources: number(counts.totalSources, pages.length), learnedSources: input.graphLimited === true ? number(counts.learnedSources, 0) : pages.length, displayedPages: pages.length, topics: number(counts.topics, topics.length), totalTopics: number(counts.totalTopics, topics.length), multiMemberTopics, singletonTopics },
      byTopic: new Map(topics.map((topic) => [topic.id, topic])),
      byPage: new Map(pages.map((page) => [page.id, page])),
    };
  }

  // This file is an untrusted, content-free partition of the exact displayed Source IDs.
  // Never persist it or use its groups for canonical Topic/discussion navigation.
  function normalizePreview(input, current) {
    const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).sort().join(',') === [...names].sort().join(',');
    if (!current.catalogRevision || !exact(input, ['schemaVersion', 'catalogRevision', 'groups']) ||
        input.schemaVersion !== 'grouping-preview/v1' || input.catalogRevision !== current.catalogRevision ||
        !Array.isArray(input.groups) || input.groups.length === 0 || input.groups.length > current.pages.length) {
      throw new Error('Vorschau passt nicht zum aktuellen Katalogstand.');
    }
    const seen = new Set();
    const groups = input.groups.map((group) => {
      if (!exact(group, ['sourceIds']) || !Array.isArray(group.sourceIds) || group.sourceIds.length === 0) {
        throw new Error('Ungültige Vorschaugruppen.');
      }
      for (const id of group.sourceIds) {
        if (typeof id !== 'string' || !current.byPage.has(id) || seen.has(id)) {
          throw new Error('Vorschau enthält unbekannte oder doppelte Source-IDs.');
        }
        seen.add(id);
      }
      return [...group.sourceIds];
    });
    if (seen.size !== current.pages.length) throw new Error('Vorschau muss alle angezeigten Sources genau einmal enthalten.');
    return groups;
  }

  function previewData(current, groups) {
    const assignment = new Map();
    const topics = groups.map((ids, index) => {
      const id = `preview-group-${ids[0]}`;
      const members = ids.map((sourceId) => current.byPage.get(sourceId));
      for (const sourceId of ids) assignment.set(sourceId, id);
      return { id, title: `Topic-Matching-Gruppe ${index + 1}`, kind: 'preview', pageCount: ids.length,
        x: members.reduce((sum, page) => sum + page.x, 0) / ids.length,
        y: members.reduce((sum, page) => sum + page.y, 0) / ids.length };
    });
    const pages = current.pages.map((page) => ({ ...page, topicId: assignment.get(page.id), topicIds: [assignment.get(page.id)] }));
    return { ...current, topics, pages, byTopic: new Map(topics.map((topic) => [topic.id, topic])),
      byPage: new Map(pages.map((page) => [page.id, page])),
      counts: { ...current.counts, topics: topics.length, multiMemberTopics: topics.filter(topic => topic.pageCount >= 2).length,
        singletonTopics: topics.filter(topic => topic.pageCount === 1).length } };
  }

  function updateGrouping() {
    state.data = state.grouping === 'experimental' && state.preview ? previewData(state.currentData, state.preview) : state.currentData;
    $('grouping-preview').hidden = false;
    $('grouping-current').setAttribute('aria-pressed', String(state.grouping === 'current'));
    $('grouping-experimental').setAttribute('aria-pressed', String(state.grouping === 'experimental'));
    $('grouping-experimental').disabled = !state.preview;
    $('grouping-availability').hidden = !!state.preview;
    $('preview-note').hidden = state.grouping !== 'experimental';
    $('map-mode').textContent = state.grouping === 'experimental' ? 'Topic-Matching' : 'Legacy E5';
    $('map-mode').hidden = false;
    $('count-topics').textContent = state.data.counts.multiMemberTopics === null ? '—' : format.format(state.data.counts.multiMemberTopics);
    $('count-singletons').textContent = state.data.counts.singletonTopics === null ? '—' : format.format(state.data.counts.singletonTopics);
    $('topic-metric-label').textContent = 'Topics (≥2 Seiten)';
    $('topic-heading').textContent = state.grouping === 'experimental' ? 'MATCHING-GRUPPEN (INKL. SINGLETONS)' : 'KANONISCHE GRUPPEN (INKL. SINGLETONS)';
    $('count-context').textContent = `${format.format(state.data.pages.length)} eindeutige Seiten · ${format.format(state.data.counts.multiMemberTopics)} Topics mit ≥2 Seiten · ${format.format(state.data.counts.singletonTopics)} Singletons · ${format.format(state.data.counts.totalSources)} Sources gesamt`;
    if (state.data.graphLimited) $('count-context').textContent = `${format.format(state.data.counts.learnedSources)} eindeutige gelernte Seiten · aktuelle kanonische Zuordnung · ${format.format(state.data.counts.totalTopics)} Topic-Container gesamt · Karte pausiert${state.data.counts.multiMemberTopics === null ? '; Legacy-Mehrseitenzahlen unbekannt' : ''}`;
    render();
  }

  function selectGrouping(grouping) {
    if (grouping === 'experimental' && !state.preview) return;
    state.chosenGrouping = grouping;
    if (grouping === state.grouping) return;
    const selectedSourceId = state.pageId || state.data.pages.find((page) => page.topicIds.includes(state.topicId))?.id;
    const hadTopicFilter = !!state.topicId;
    state.grouping = grouping;
    const next = grouping === 'experimental' ? previewData(state.currentData, state.preview) : state.currentData;
    state.topicId = hadTopicFilter && selectedSourceId ? next.byPage.get(selectedSourceId)?.topicId ?? null : null;
    updateGrouping();
  }

  function color(topicId) {
    let hash = 0;
    for (let i = 0; i < topicId.length; i++) hash = (Math.imul(hash, 31) + topicId.charCodeAt(i)) | 0;
    return `hsl(${((hash >>> 0) % 360)} 72% 72%)`;
  }
  function point(item) { return { x: 70 + item.x * 860, y: 58 + item.y * 584 }; }
  function searchable(page) {
    const titles = page.topicIds.map(id => state.data.byTopic.get(id)?.title ?? '').join(' ');
    return `${page.title} ${page.host} ${titles}`.toLocaleLowerCase('de').includes(state.query);
  }
  function visiblePages() { return state.data.pages.filter((page) => (!state.topicId || page.topicIds.includes(state.topicId)) && searchable(page)); }
  function textElement(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; node.textContent = value; return node; }
  function appendTitle(node, title) { const label = svg('title'); label.textContent = title; node.append(label); }

  function renderTopics() {
    const list = $('topic-list');
    list.replaceChildren();
    const topics = [...state.data.topics].sort((a, b) => b.pageCount - a.pageCount || a.title.localeCompare(b.title, 'de'));
    for (const topic of topics) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = `topic-row${topic.id === state.topicId ? ' active' : ''}`;
      button.setAttribute('role', 'listitem'); button.setAttribute('aria-pressed', String(topic.id === state.topicId));
      const dot = textElement('span', 'topic-dot', ''); dot.style.setProperty('--topic-color', color(topic.id));
      button.append(dot, textElement('span', 'topic-title', topic.title), textElement('span', 'topic-count', format.format(topic.pageCount)));
      button.title = topic.title;
      button.addEventListener('click', () => selectTopic(topic.id));
      list.append(button);
    }
    $('clear-filter').hidden = !state.topicId;
  }

  function renderMap(pages) {
    const viewport = $('map-viewport'); viewport.replaceChildren();
    const visible = new Set(pages.map((page) => page.id));
    const selected = state.data.byPage.get(state.pageId);
    const topic = state.data.byTopic.get(state.topicId);
    const selectedTopic = selected?.topicId || topic?.id;
    const edgeLayer = svg('g'), haloLayer = svg('g'), topicLayer = svg('g'), pageLayer = svg('g'), labelLayer = svg('g');
    viewport.append(edgeLayer, haloLayer, topicLayer, pageLayer, labelLayer);
    for (const edge of state.data.edges) {
      if (!visible.has(edge.sourceId) || !visible.has(edge.targetId)) continue;
      const a = point(state.data.byPage.get(edge.sourceId)), b = point(state.data.byPage.get(edge.targetId));
      const highlight = !!selected && (edge.sourceId === selected.id || edge.targetId === selected.id);
      const line = svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `map-edge${highlight ? ' emphasis' : ''}` });
      edgeLayer.append(line);
    }
    if (selected) {
      const a = point(selected);
      for (const topicId of selected.topicIds) {
        const b = point(state.data.byTopic.get(topicId));
        edgeLayer.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'topic-link', stroke: color(topicId) }));
      }
    }
    const ranked = [...state.data.topics].sort((a, b) => b.pageCount - a.pageCount).slice(0, 7);
    for (const item of state.data.topics) {
      const p = point(item), c = color(item.id), isSelected = selected ? selected.topicIds.includes(item.id) : item.id === selectedTopic;
      if (item.pageCount > 1 || isSelected) haloLayer.append(svg('circle', { cx: p.x, cy: p.y, r: Math.min(52, 17 + item.pageCount * 3), class: 'topic-halo', stroke: c }));
      const g = svg('g', { class: `topic-node${isSelected ? ' selected' : ''}` });
      g.append(svg('circle', { cx: p.x, cy: p.y, r: isSelected ? 14 : 10, class: 'outer', stroke: c }));
      g.append(svg('circle', { cx: p.x, cy: p.y, r: isSelected ? 8 : 6, class: 'core', fill: c }));
      appendTitle(g, `${item.title} · ${item.pageCount} Seiten`);
      g.addEventListener('click', (event) => { event.stopPropagation(); if (!state.moved) selectTopic(item.id); });
      topicLayer.append(g);
      if (isSelected || ranked.includes(item)) {
        const label = svg('text', { x: p.x + 15, y: p.y - 12, class: 'map-label' });
        label.textContent = item.title.length > 25 ? `${item.title.slice(0, 24)}…` : item.title;
        labelLayer.append(label);
      }
    }
    for (const item of pages) {
      const p = point(item), isSelected = item.id === state.pageId;
      const g = svg('g', { class: `page-node${isSelected ? ' selected' : ''}` });
      g.append(svg('circle', { cx: p.x, cy: p.y, r: isSelected ? 7 : 4.5, fill: color(item.topicId) }));
      appendTitle(g, `${item.title} · ${item.host}`);
      g.addEventListener('click', (event) => { event.stopPropagation(); if (!state.moved) selectPage(item.id); });
      pageLayer.append(g);
    }
    $('empty-state').hidden = pages.length !== 0;
    $('empty-state').replaceChildren(textElement('strong', '', state.data.graphLimited ? 'Karte aus Kapazitätsgründen nicht enthalten' : 'Keine passenden Seiten'),
      textElement('span', '', state.data.graphLimited ? 'Die Momentaufnahme enthält nur Katalogzahlen und Verlauf, keine Kartenpunkte. Dies ist kein leeres Suchergebnis.' : 'Suche oder Topic-Auswahl ändern.'));
    $('map-title').textContent = topic ? topic.title : 'Alle Seiten';
    $('visible-count').textContent = `${format.format(pages.length)} von ${format.format(state.data.pages.length)} Seiten`;
  }

  function renderSelection() {
    const container = $('selection'); container.replaceChildren();
    $('close-selection').hidden = !state.pageId && !state.topicId;
    const page = state.data.byPage.get(state.pageId);
    const topic = state.data.byTopic.get(page?.topicId || state.topicId);
    if (page) {
      container.append(textElement('span', 'detail-kicker', 'QUELLSEITE'), textElement('h2', '', page.title), textElement('p', 'detail-host', page.host));
      for (const topicId of page.topicIds) {
        const topic = state.data.byTopic.get(topicId);
        const tag = textElement('span', 'detail-topic', '');
        const dot = textElement('span', 'topic-dot', ''); dot.style.setProperty('--topic-color', color(topic.id));
        tag.append(dot, textElement('span', '', topic.title)); container.append(tag);
      }
      const anchor = document.createElement('a'); anchor.className = 'open-link'; anchor.textContent = 'Originalseite öffnen ↗';
      anchor.href = page.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
      container.append(anchor, textElement('span', 'detail-hint', 'Öffnet die öffentliche Website in einem neuen Tab.'));
      const neighbors = state.data.edges
        .filter((edge) => edge.sourceId === page.id || edge.targetId === page.id)
        .map((edge) => ({ page: state.data.byPage.get(edge.sourceId === page.id ? edge.targetId : edge.sourceId), score: edge.score }))
        .filter((entry) => entry.page)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      if (neighbors.length) {
        container.append(textElement('h3', 'neighbor-heading', 'NÄCHSTE SEITEN'));
        const list = textElement('div', 'neighbor-list', '');
        for (const neighbor of neighbors) {
          const button = textElement('button', 'neighbor-row', ''); button.type = 'button';
          button.append(textElement('span', '', neighbor.page.title), textElement('strong', '', neighbor.score.toFixed(2)));
          button.title = `${neighbor.page.title} · Kosinus-Ähnlichkeit ${neighbor.score.toFixed(2)}`;
          button.addEventListener('click', () => { state.topicId = null; state.pageId = neighbor.page.id; render(); });
          list.append(button);
        }
        container.append(list, textElement('span', 'detail-hint', 'Werte stammen aus den ursprünglichen Seitenvektoren.'));
      }
    } else if (topic) {
      container.append(textElement('span', 'detail-kicker', state.grouping === 'experimental' ? 'MATCHING-GRUPPE' : 'LEGACY-TOPIC'), textElement('h2', '', topic.title), textElement('p', 'detail-host', `${format.format(topic.pageCount)} zugeordnete Seiten`));
      container.append(textElement('span', 'detail-hint', 'Wähle einen Seitenpunkt oder einen Eintrag unten, um zur Quelle zu gelangen.'));
    } else {
      const placeholder = textElement('div', 'selection-placeholder', '');
      placeholder.append(textElement('span', '', '↗'), textElement('h2', '', 'Ein Punkt, eine Geschichte.'), textElement('p', '', 'Wähle eine Seite oder ein Topic auf der Karte. Hier findest du den Zusammenhang und den Weg zur Originalseite.'));
      container.append(placeholder);
    }
  }

  function renderPageList(pages) {
    const list = $('page-list'); list.replaceChildren();
    const ordered = [...pages].sort((a, b) => a.title.localeCompare(b.title, 'de'));
    $('list-count').textContent = format.format(ordered.length);
    for (const page of ordered) {
      const row = document.createElement('div');
      row.className = `page-row${page.id === state.pageId ? ' active' : ''}`;
      row.setAttribute('role', 'listitem');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'page-select';
      button.setAttribute('aria-pressed', String(page.id === state.pageId));
      button.setAttribute('aria-label', `Details anzeigen: ${page.title}`);
      const dot = textElement('span', 'page-dot', ''); dot.style.setProperty('--topic-color', color(page.topicId));
      const copy = textElement('span', 'page-copy', ''); copy.append(textElement('strong', '', page.title), textElement('small', '', page.host));
      button.append(dot, copy);
      button.addEventListener('click', () => selectPage(page.id));
      const anchor = textElement('a', 'page-open', '↗');
      anchor.href = page.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
      anchor.setAttribute('aria-label', `Originalseite öffnen: ${page.title}`);
      anchor.title = `Originalseite öffnen: ${page.title}`;
      row.append(button, anchor); list.append(row);
    }
  }

  function render() {
    if (!state.data) return;
    const pages = visiblePages(); renderTopics(); renderMap(pages); renderSelection(); renderPageList(pages);
  }
  function selectTopic(id) { state.topicId = state.topicId === id ? null : id; state.pageId = null; render(); }
  function selectPage(id) { state.pageId = id; render(); }
  function load(raw, { preserve = false, announce = true, preview = null, growth = null } = {}) {
    const next = normalize(raw);
    let nextPreview = null;
    if (preview !== null) {
      try { nextPreview = normalizePreview(preview, next); }
      catch { /* A stale or malformed preview never affects the current view. */ }
    }
    if (!preserve) state.chosenGrouping = null;
    const selectedSourceId = preserve ? state.pageId || state.data?.pages.find((page) => page.topicIds.includes(state.topicId))?.id : null;
    const hadTopicFilter = preserve && !!state.topicId;
    state.grouping = nextPreview && state.chosenGrouping !== 'current' ? 'experimental' : 'current';
    state.preview = nextPreview;
    state.currentData = next;
    state.data = state.grouping === 'experimental' && state.preview ? previewData(next, state.preview) : next;
    state.snapshotKey = JSON.stringify([raw, preview, growth]);
    state.topicId = hadTopicFilter && selectedSourceId ? state.data.byPage.get(selectedSourceId)?.topicId ?? null : null;
    state.pageId = preserve && state.data.byPage.has(state.pageId) ? state.pageId : null;
    if (!preserve) { state.query = ''; $('search-input').value = ''; }
    $('count-learned').textContent = format.format(state.data.counts.learnedSources);
    const date = new Date(state.data.generatedAt);
    $('data-age').textContent = Number.isNaN(date.getTime()) ? 'Lokale Momentaufnahme' : `Stand ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date)}`;
    if (!preserve) state.view = { x: 0, y: 0, w: 1000, h: 700 };
    updateView(); updateGrouping();
    loadGrowth(growth, next);
    renderSnapshotHealth();
    if (announce) showStatus(`${format.format(state.data.pages.length)} erfasste Seiten geladen.`);
  }

  function updateView() { const v = state.view; $('map').setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); }
  function zoom(factor) {
    const v = state.view, width = clamp(v.w * factor, 250, 1000), height = width * .7;
    v.x = clamp(v.x + (v.w - width) / 2, 0, 1000 - width);
    v.y = clamp(v.y + (v.h - height) / 2, 0, 700 - height);
    v.w = width; v.h = height; updateView();
  }
  $('zoom-in').addEventListener('click', () => zoom(.75));
  $('zoom-out').addEventListener('click', () => zoom(1.33));
  $('zoom-reset').addEventListener('click', () => { state.view = { x: 0, y: 0, w: 1000, h: 700 }; updateView(); });
  $('map').addEventListener('wheel', (event) => { event.preventDefault(); zoom(event.deltaY > 0 ? 1.15 : .87); }, { passive: false });
  $('map').addEventListener('pointerdown', (event) => {
    state.drag = { x: event.clientX, y: event.clientY, view: { ...state.view } }; state.moved = false;
    if (event.target === $('map')) $('map').setPointerCapture(event.pointerId);
  });
  $('map').addEventListener('pointermove', (event) => {
    if (!state.drag) return;
    const rect = $('map').getBoundingClientRect();
    const dx = event.clientX - state.drag.x, dy = event.clientY - state.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) state.moved = true;
    if (!state.moved) return;
    state.view.x = clamp(state.drag.view.x - dx * state.view.w / rect.width, 0, 1000 - state.view.w);
    state.view.y = clamp(state.drag.view.y - dy * state.view.h / rect.height, 0, 700 - state.view.h);
    $('map').classList.add('dragging'); updateView();
  });
  const endDrag = () => { state.drag = null; $('map').classList.remove('dragging'); setTimeout(() => { state.moved = false; }, 0); };
  $('map').addEventListener('pointerup', endDrag); $('map').addEventListener('pointercancel', endDrag);
  $('search-input').addEventListener('input', (event) => { state.query = event.target.value.trim().toLocaleLowerCase('de'); render(); });
  $('clear-filter').addEventListener('click', () => { state.topicId = null; state.pageId = null; render(); });
  $('close-selection').addEventListener('click', () => { state.topicId = null; state.pageId = null; render(); });
  $('grouping-current').addEventListener('click', () => selectGrouping('current'));
  $('grouping-experimental').addEventListener('click', () => selectGrouping('experimental'));
  for (const button of document.querySelectorAll('[data-growth-window]')) button.addEventListener('click', () => {
    growthState.window = button.dataset.growthWindow;
    renderGrowth();
  });
  for (const button of document.querySelectorAll('[data-growth-view]')) button.addEventListener('click', () => {
    growthState.view = button.dataset.growthView;
    renderGrowth();
  });
  $('file-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Datei ist zu groß.');
      const input = JSON.parse(await file.text());
      if (embeddedReport) throw new Error('Der lokale Watcher liefert diesen Datenstand.');
      load(input);
    }
    catch (error) { showStatus(`Laden fehlgeschlagen: ${error.message}`); }
    event.target.value = '';
  });
  let embeddedReport = false;
  let bridgePending = false;
  let bridgeSequence = 0;
  let manualPending = false;
  function refreshBridge(manual = false) {
    if (bridgePending) { if (manual) manualPending = true; return; }
    bridgePending = true;
    const sequence = ++bridgeSequence;
    delete globalThis.__topicAtlasSnapshot;
    delete globalThis.__topicAtlasPreview;
    delete globalThis.__topicAtlasGrowth;
    const script = document.createElement('script');
    script.src = `./snapshot.js?refresh=${Date.now()}`;
    let finished = false;
    const finish = () => {
      if (finished || sequence !== bridgeSequence) return false;
      finished = true; clearTimeout(timeout); script.onload = script.onerror = null;
      script.remove(); bridgePending = false; manualPending = false;
      return true;
    };
    const timeout = setTimeout(() => {
      if (!finish()) return;
      snapshotHealth.failure = 'timeout'; renderSnapshotHealth();
    }, 10000);
    script.onload = () => {
      if (finished || sequence !== bridgeSequence) return;
      try {
        const next = globalThis.__topicAtlasSnapshot;
        const preview = globalThis.__topicAtlasPreview ?? null;
        const growth = globalThis.__topicAtlasGrowth ?? null;
        if (!next || typeof next.generatedAt !== 'string' || !next.generatedAt) throw new Error('Ungültiger Snapshot.');
        if (JSON.stringify([next, preview, growth]) === state.snapshotKey) {
          if (manual || manualPending) showStatus('Momentaufnahme unverändert; keine neuen Katalogänderungen bekannt.');
        } else {
          load(next, { preserve: true, announce: false, preview, growth });
          showStatus(`Neuer Datenstand geladen: ${$('data-age').textContent}.`);
        }
        snapshotHealth.failure = null; renderSnapshotHealth();
      } catch {
        snapshotHealth.failure = 'invalid'; renderSnapshotHealth();
        if (manual || manualPending) showStatus('Lokale Aktualisierung fehlgeschlagen. Letzte Momentaufnahme bleibt sichtbar.');
      } finally { finish(); }
    };
    script.onerror = () => {
      if (finished || sequence !== bridgeSequence) return;
      snapshotHealth.failure = 'load'; renderSnapshotHealth();
      if (manual || manualPending) showStatus('Lokale Aktualisierung fehlgeschlagen. Letzte Momentaufnahme bleibt sichtbar.');
      finish();
    };
    document.head.append(script);
  }
  async function loadSnapshot() {
    const embedded = $('dashboard-data');
    if (embedded?.textContent.trim()) {
      const previewElement = $('dashboard-preview-data');
      const preview = previewElement?.textContent.trim() ? JSON.parse(previewElement.textContent) : null;
      let growth = null;
      try {
        const growthElement = $('dashboard-growth-data');
        growth = growthElement?.textContent.trim() ? JSON.parse(growthElement.textContent) : null;
      } catch { /* Malformed history must not discard an otherwise valid map. */ }
      load(JSON.parse(embedded.textContent), { preview, growth });
      embeddedReport = true;
      snapshotHealth.live = true; renderSnapshotHealth();
      $('load-label').hidden = true;
      $('preview-load-label').hidden = true;
      $('refresh-hint').hidden = false;
      refreshBridge();
      setInterval(() => { renderSnapshotHealth(); refreshBridge(); }, 3000);
      return;
    }
    const response = await fetch('./snapshot.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('snapshot.json nicht gefunden.');
    load(await response.json());
    $('reload-button').hidden = false;
    $('load-label').hidden = false;
    $('refresh-hint').hidden = true;
  }
  let manualTimer;
  $('reload-button').addEventListener('click', async () => {
    if (embeddedReport) {
      if (manualTimer) return;
      showStatus('Prüfe den neuesten lokalen Datenstand …');
      manualTimer = setTimeout(() => { manualTimer = undefined; refreshBridge(true); }, 1200);
      return;
    }
    try { await loadSnapshot(); } catch (error) { showStatus(`Aktualisierung fehlgeschlagen: ${error.message}`); }
  });
  loadSnapshot().catch(() => {
    $('data-age').textContent = 'Noch keine Daten geladen';
    $('count-context').textContent = 'Öffne die generierte HTML-Datei oder lade eine JSON-Momentaufnahme.';
    showStatus('Keine eingebetteten Daten gefunden. Bitte JSON laden.');
  });
})();
