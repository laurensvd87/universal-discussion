(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const state = { data: null, currentData: null, preview: null, grouping: 'current', snapshotKey: null, topicId: null, pageId: null, query: '', view: { x: 0, y: 0, w: 1000, h: 700 }, drag: null, moved: false };
  const previewOptIn = new URL(location.href).searchParams.get('preview') === '1';
  const format = new Intl.NumberFormat('de-DE');
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const svg = (name, attributes = {}) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };

  function showStatus(message) {
    $('status').textContent = message;
    clearTimeout(showStatus.timer);
    if (message) showStatus.timer = setTimeout(() => { $('status').textContent = ''; }, 5000);
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
    if (!input || input.schemaVersion !== 1 || !Array.isArray(input.topics) || !Array.isArray(input.pages) || !Array.isArray(input.edges) || !input.counts) throw new Error('Unbekanntes Dashboard-Format.');
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
      pageIds.add(row.id);
      pages.push({ id: row.id, title: safeText(row.title), url, host: new URL(url).hostname, topicId: row.topicId, x: row.x, y: row.y });
    }
    const edges = [];
    for (const row of input.edges) {
      if (row && pageIds.has(row.sourceId) && pageIds.has(row.targetId) && row.sourceId !== row.targetId && Number.isFinite(row.score) && row.score >= -1 && row.score <= 1) edges.push({ sourceId: row.sourceId, targetId: row.targetId, score: row.score });
    }
    const counts = input.counts;
    const number = (value, fallback) => Number.isInteger(value) && value >= 0 ? value : fallback;
    return {
      generatedAt: typeof input.generatedAt === 'string' ? input.generatedAt : '',
      catalogRevision: typeof input.catalogRevision === 'string' && /^[a-f0-9]{64}$/u.test(input.catalogRevision) ? input.catalogRevision : null,
      topics, pages, edges,
      counts: { totalSources: number(counts.totalSources, pages.length), learnedSources: number(counts.learnedSources, pages.length), displayedPages: pages.length, topics: number(counts.topics, topics.length), totalTopics: number(counts.totalTopics, topics.length) },
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
      const id = `preview-group-${index + 1}`;
      const members = ids.map((sourceId) => current.byPage.get(sourceId));
      for (const sourceId of ids) assignment.set(sourceId, id);
      return { id, title: `Experimentelle Gruppe ${index + 1}`, kind: 'preview', pageCount: ids.length,
        x: members.reduce((sum, page) => sum + page.x, 0) / ids.length,
        y: members.reduce((sum, page) => sum + page.y, 0) / ids.length };
    });
    const pages = current.pages.map((page) => ({ ...page, topicId: assignment.get(page.id) }));
    return { ...current, topics, pages, byTopic: new Map(topics.map((topic) => [topic.id, topic])),
      byPage: new Map(pages.map((page) => [page.id, page])),
      counts: { ...current.counts, topics: topics.length } };
  }

  function updateGrouping() {
    state.data = state.grouping === 'experimental' && state.preview ? previewData(state.currentData, state.preview) : state.currentData;
    $('grouping-preview').hidden = !state.preview;
    $('grouping-current').setAttribute('aria-pressed', String(state.grouping === 'current'));
    $('grouping-experimental').setAttribute('aria-pressed', String(state.grouping === 'experimental'));
    $('preview-note').hidden = state.grouping !== 'experimental';
    $('count-topics').textContent = format.format(state.data.counts.topics);
    $('topic-metric-label').textContent = state.grouping === 'experimental' ? 'Vorschaugruppen' : 'Topics';
    $('topic-heading').textContent = state.grouping === 'experimental' ? 'VORSCHAUGRUPPEN' : 'TOPICS';
    render();
  }

  function selectGrouping(grouping) {
    if (grouping === state.grouping || (grouping === 'experimental' && !state.preview)) return;
    state.grouping = grouping;
    state.topicId = null;
    updateGrouping();
  }

  function color(topicId) {
    let hash = 0;
    for (let i = 0; i < topicId.length; i++) hash = (Math.imul(hash, 31) + topicId.charCodeAt(i)) | 0;
    return `hsl(${((hash >>> 0) % 360)} 72% 72%)`;
  }
  function point(item) { return { x: 70 + item.x * 860, y: 58 + item.y * 584 }; }
  function searchable(page) {
    const topic = state.data.byTopic.get(page.topicId);
    return `${page.title} ${page.host} ${topic?.title || ''}`.toLocaleLowerCase('de').includes(state.query);
  }
  function visiblePages() { return state.data.pages.filter((page) => (!state.topicId || page.topicId === state.topicId) && searchable(page)); }
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
      const a = point(selected), b = point(state.data.byTopic.get(selected.topicId));
      edgeLayer.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'topic-link', stroke: color(selected.topicId) }));
    }
    const ranked = [...state.data.topics].sort((a, b) => b.pageCount - a.pageCount).slice(0, 7);
    for (const item of state.data.topics) {
      const p = point(item), c = color(item.id), isSelected = item.id === selectedTopic;
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
      if (topic) {
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
      container.append(textElement('span', 'detail-kicker', state.grouping === 'experimental' ? 'VORSCHAUGRUPPE' : 'TOPIC'), textElement('h2', '', topic.title), textElement('p', 'detail-host', `${format.format(topic.pageCount)} zugeordnete Seiten`));
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
  function load(raw, { preserve = false, announce = true } = {}) {
    const next = normalize(raw);
    if (!preserve || !state.currentData || state.currentData.catalogRevision !== next.catalogRevision || !next.catalogRevision) {
      state.preview = null;
      state.grouping = 'current';
    }
    state.currentData = next;
    state.data = state.grouping === 'experimental' && state.preview ? previewData(next, state.preview) : next;
    state.snapshotKey = JSON.stringify(raw);
    state.topicId = preserve && state.data.byTopic.has(state.topicId) ? state.topicId : null;
    state.pageId = preserve && state.data.byPage.has(state.pageId) ? state.pageId : null;
    if (state.pageId && state.topicId && state.data.byPage.get(state.pageId).topicId !== state.topicId) {
      state.topicId = state.data.byPage.get(state.pageId).topicId;
    }
    if (!preserve) { state.query = ''; $('search-input').value = ''; }
    $('count-learned').textContent = format.format(state.data.counts.learnedSources);
    $('count-topics').textContent = format.format(state.data.counts.topics);
    $('count-context').textContent = `${format.format(state.data.counts.totalSources)} Sources gesamt · ${format.format(state.data.counts.totalTopics)} Topics gesamt`;
    const date = new Date(state.data.generatedAt);
    $('data-age').textContent = Number.isNaN(date.getTime()) ? 'Lokale Momentaufnahme' : `Stand ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date)}`;
    if (!preserve) state.view = { x: 0, y: 0, w: 1000, h: 700 };
    updateView(); updateGrouping();
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
  $('file-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Datei ist zu groß.');
      const input = JSON.parse(await file.text());
      if (input?.schemaVersion === 'grouping-preview/v1') {
        if (!previewOptIn || !state.currentData || file.size > 256 * 1024) throw new Error('Vorschau ist nicht verfügbar.');
        state.preview = normalizePreview(input, state.currentData);
        state.grouping = 'experimental';
        state.topicId = null;
        updateGrouping();
        showStatus('Experimentelle Gruppierung nur für diese Ansicht geladen.');
      } else if (!previewOptIn || !embeddedReport) load(input);
      else throw new Error('Hier ist nur eine Gruppierungsvorschau zulässig.');
    }
    catch (error) { showStatus(`Laden fehlgeschlagen: ${error.message}`); }
    event.target.value = '';
  });
  let embeddedReport = false;
  let bridgePending = false;
  let manualPending = false;
  function refreshBridge(manual = false) {
    if (bridgePending) { if (manual) manualPending = true; return; }
    bridgePending = true;
    delete globalThis.__topicAtlasSnapshot;
    const script = document.createElement('script');
    script.src = `./snapshot.js?refresh=${Date.now()}`;
    const finish = () => { script.remove(); bridgePending = false; manualPending = false; };
    script.onload = () => {
      try {
        const next = globalThis.__topicAtlasSnapshot;
        if (!next || typeof next.generatedAt !== 'string' || !next.generatedAt) throw new Error('Ungültiger Snapshot.');
        if (JSON.stringify(next) === state.snapshotKey) {
          if (manual || manualPending) showStatus('Kein neuer Datenstand. Prüfe, ob der Watcher läuft.');
        } else {
          load(next, { preserve: true, announce: false });
          showStatus(`Neuer Datenstand geladen: ${$('data-age').textContent}.`);
        }
      } catch (error) {
        if (manual || manualPending) showStatus(`Aktualisierung fehlgeschlagen: ${error.message}`);
      } finally { finish(); }
    };
    script.onerror = () => {
      if (manual || manualPending) showStatus('Kein neuer Datenstand gefunden. Prüfe, ob der Watcher läuft.');
      finish();
    };
    document.head.append(script);
  }
  async function loadSnapshot() {
    const embedded = $('dashboard-data');
    if (embedded?.textContent.trim()) {
      load(JSON.parse(embedded.textContent));
      embeddedReport = true;
      $('load-label').hidden = true;
      $('preview-load-label').hidden = !previewOptIn;
      $('refresh-hint').hidden = false;
      refreshBridge();
      setInterval(() => refreshBridge(), 3000);
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
