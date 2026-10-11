/*
 * Signal coverage editor on cwpcso.com/radio-staff: cell towers and weak-signal areas on the
 * Liberty County map. Points are fractions of the map (0-1), the same as the bot uses.
 */
window.createCoverageMap = (options) => {
  const { save, toast } = options;
  const $ = (id) => document.getElementById(id);
  const svg = $('mapSvg');
  const map = $('map');
  const wrap = $('mapWrap');
  const editor = $('editor');
  const drawBar = $('drawBar');
  const saveButton = $('covSave');
  const resetButton = $('covReset');
  const NS = 'http://www.w3.org/2000/svg';
  const LIMITS = { towers: 60, zones: 40, zonePoints: 40, minRange: 0.03, maxRange: 0.6, minStrength: 0.1, maxStrength: 0.9 };

  let saved = { towers: [], zones: [], buildings: false };
  let draft = { towers: [], zones: [], buildings: false };
  let positions = [];
  let mode = 'select';
  let selected = null; // { kind: 'tower' | 'zone', id }
  let drawing = [];
  let drag = null;
  let zoom = 1;
  let saving = false;

  const copy = (value) => JSON.parse(JSON.stringify(value));
  const dirty = () => JSON.stringify(draft) !== JSON.stringify(saved);
  const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const round = (value) => Math.round(value * 100000) / 100000;
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const v = (fraction) => (fraction * 1000).toFixed(1);
  const isBuilding = (zone) => zone.kind === 'building';
  const drawingMode = () => mode === 'area' || mode === 'building';

  function el(tag, attrs = {}, parent = svg) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    parent.appendChild(node);
    return node;
  }

  function pointFrom(event) {
    const box = svg.getBoundingClientRect();
    return { left: round(clamp01((event.clientX - box.left) / box.width)), top: round(clamp01((event.clientY - box.top) / box.height)) };
  }

  function signalColor(signal) {
    if (!Number.isFinite(signal) || signal >= 0.8) return '#2fbf71';
    if (signal >= 0.55) return '#c9c23a';
    if (signal >= 0.3) return '#e08a2b';
    return '#d9443a';
  }

  function find(kind, id) {
    return (kind === 'tower' ? draft.towers : draft.zones).find((item) => item.id === id) || null;
  }

  /* ---------- drawing ---------- */

  function draw() {
    svg.replaceChildren();
    svg.classList.toggle('placing', mode !== 'select');
    for (const zone of draft.zones) {
      const isSelected = selected?.kind === 'zone' && selected.id === zone.id;
      const polygon = el('polygon', {
        points: zone.points.map((point) => `${v(point.left)},${v(point.top)}`).join(' '),
        class: `zone${isBuilding(zone) ? ` building${draft.buildings ? '' : ' off'}` : ''}${isSelected ? ' sel' : ''}`,
        'fill-opacity': (0.15 + 0.4 * (1 - zone.strength)).toFixed(2),
        'vector-effect': 'non-scaling-stroke',
        'data-zone': zone.id,
      });
      el('title', {}, polygon).textContent = `${zone.name} · ${Math.round(zone.strength * 100)}% signal inside${isBuilding(zone) && !draft.buildings ? ' (building interference is off)' : ''}`;
      if (isSelected) {
        zone.points.forEach((point, index) => {
          el('circle', { cx: v(point.left), cy: v(point.top), r: 7 / zoom, class: 'corner', 'data-zone': zone.id, 'data-corner': index });
        });
      }
    }
    for (const tower of draft.towers) {
      const isSelected = selected?.kind === 'tower' && selected.id === tower.id;
      el('circle', { cx: v(tower.left), cy: v(tower.top), r: v(tower.range), class: `range${isSelected ? ' sel' : ''}`, 'vector-effect': 'non-scaling-stroke' });
      el('circle', { cx: v(tower.left), cy: v(tower.top), r: v(tower.range * 0.6), class: 'clear', 'vector-effect': 'non-scaling-stroke' });
      const size = 11 / zoom;
      const group = el('g', { class: `tower${isSelected ? ' sel' : ''}`, 'data-tower': tower.id });
      el('circle', { cx: v(tower.left), cy: v(tower.top), r: size * 1.25, class: 'tower-hit' }, group);
      el('path', {
        d: `M${v(tower.left)} ${(tower.top * 1000 - size).toFixed(1)}l${(size * 0.75).toFixed(1)} ${(size * 1.9).toFixed(1)}h${(-size * 1.5).toFixed(1)}z`,
        class: 'tower-icon',
      }, group);
      el('title', {}, group).textContent = `${tower.name} · range ${Math.round(tower.range * 100)}% of the map`;
    }
    for (const unit of positions) {
      const dot = el('circle', { cx: v(unit.left), cy: v(unit.top), r: 6 / zoom, class: 'unit', fill: signalColor(unit.signal) });
      el('title', {}, dot).textContent = `${unit.name} · ${Number.isFinite(unit.signal) ? `${Math.round(unit.signal * 100)}% signal` : 'clear'}`;
    }
    if (drawing.length) {
      el('polyline', { points: drawing.map((point) => `${v(point.left)},${v(point.top)}`).join(' '), class: 'drawing', 'vector-effect': 'non-scaling-stroke' });
      for (const point of drawing) el('circle', { cx: v(point.left), cy: v(point.top), r: 5 / zoom, class: 'corner' });
    }
    drawBar.hidden = !drawingMode();
    drawBar.querySelector('span').textContent = mode === 'building' ? 'Tap the map to add the tunnel or garage corners.' : 'Tap the map to add corners.';
    $('covBuildings').checked = Boolean(draft.buildings);
    $('drawDone').disabled = drawing.length < 3;
    for (const button of document.querySelectorAll('[data-mode]')) button.classList.toggle('on', button.dataset.mode === mode);
    const changed = dirty();
    saveButton.disabled = !changed || saving;
    resetButton.disabled = !changed || saving;
    const buildings = draft.zones.filter(isBuilding).length;
    const weak = draft.zones.length - buildings;
    $('covState').textContent = changed ? 'Not saved yet'
      : `${draft.towers.length} tower${draft.towers.length === 1 ? '' : 's'} · ${weak} weak area${weak === 1 ? '' : 's'} · ${buildings} tunnel${buildings === 1 ? '' : 's'}/garage${buildings === 1 ? '' : 's'}`;
    $('covState').classList.toggle('warn', changed);
    drawEditor();
  }

  function drawEditor() {
    const item = selected && find(selected.kind, selected.id);
    if (!item) {
      editor.hidden = true;
      return;
    }
    editor.hidden = false;
    const tower = selected.kind === 'tower';
    const sliderValue = tower ? Math.round(item.range * 100) : Math.round(item.strength * 100);
    // Only rebuild when the selection changes, so typing and sliding keep focus.
    if (editor.dataset.for !== `${selected.kind}:${item.id}`) {
      editor.dataset.for = `${selected.kind}:${item.id}`;
      editor.innerHTML = `<label class="rs-field"><span>Name</span><input id="edName" maxlength="40"></label>
        <label class="rs-field"><span id="edLabel"></span><input id="edSlider" type="range"></label>
        <div class="rs-editor-row"><span id="edHint" class="rs-fine"></span><button type="button" id="edDelete" class="rs-btn rs-kick">Delete</button></div>`;
      const name = $('edName');
      const slider = $('edSlider');
      name.value = item.name;
      slider.min = tower ? Math.round(LIMITS.minRange * 100) : Math.round(LIMITS.minStrength * 100);
      slider.max = tower ? Math.round(LIMITS.maxRange * 100) : Math.round(LIMITS.maxStrength * 100);
      slider.step = 1;
      name.addEventListener('input', () => {
        const current = selected && find(selected.kind, selected.id);
        if (current) current.name = name.value.slice(0, 40);
        draw();
      });
      slider.addEventListener('input', () => {
        const current = selected && find(selected.kind, selected.id);
        if (!current) return;
        if (selected.kind === 'tower') current.range = Number(slider.value) / 100;
        else current.strength = Number(slider.value) / 100;
        draw();
      });
      $('edDelete').addEventListener('click', () => {
        if (!selected) return;
        if (selected.kind === 'tower') draft.towers = draft.towers.filter((entry) => entry.id !== selected.id);
        else draft.zones = draft.zones.filter((entry) => entry.id !== selected.id);
        selected = null;
        draw();
      });
    }
    $('edSlider').value = sliderValue;
    $('edLabel').textContent = tower ? `Range: ${sliderValue}% of the map` : `Signal inside: ${sliderValue}%`;
    $('edHint').textContent = tower
      ? 'Clear inside the inner ring, fading out past the outer ring. Drag the tower to move it.'
      : `Lower is weaker. Drag the area or its corners to move them.${isBuilding(item) && !draft.buildings ? ' Only counts while building interference is on.' : ''}`;
  }

  /* ---------- editing ---------- */

  function setMode(next) {
    mode = next;
    drawing = [];
    if (next !== 'select') selected = null;
    draw();
  }

  svg.addEventListener('pointerdown', (event) => {
    const point = pointFrom(event);
    if (mode === 'tower') {
      if (draft.towers.length >= LIMITS.towers) return toast(`Up to ${LIMITS.towers} towers.`, true);
      const tower = { id: newId('tower'), name: `Tower ${draft.towers.length + 1}`, left: point.left, top: point.top, range: 0.2 };
      draft.towers.push(tower);
      selected = { kind: 'tower', id: tower.id };
      mode = 'select';
      return draw();
    }
    if (drawingMode()) {
      if (drawing.length >= LIMITS.zonePoints) return toast(`Up to ${LIMITS.zonePoints} corners per area.`, true);
      drawing.push(point);
      return draw();
    }
    const towerId = event.target.closest('[data-tower]')?.dataset.tower;
    const zoneId = event.target.dataset?.zone;
    const corner = event.target.dataset?.corner;
    if (towerId) {
      selected = { kind: 'tower', id: towerId };
      drag = { kind: 'tower', id: towerId };
    } else if (zoneId && corner !== undefined) {
      drag = { kind: 'corner', id: zoneId, corner: Number(corner) };
    } else if (zoneId) {
      selected = { kind: 'zone', id: zoneId };
      drag = { kind: 'zone', id: zoneId, from: point };
    } else {
      selected = null;
      return draw();
    }
    svg.setPointerCapture(event.pointerId);
    event.preventDefault();
    draw();
  });

  svg.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const point = pointFrom(event);
    if (drag.kind === 'tower') {
      const tower = find('tower', drag.id);
      if (tower) Object.assign(tower, point);
    } else if (drag.kind === 'corner') {
      const zone = find('zone', drag.id);
      if (zone?.points[drag.corner]) zone.points[drag.corner] = point;
    } else {
      const zone = find('zone', drag.id);
      if (!zone) return;
      const dx = point.left - drag.from.left;
      const dy = point.top - drag.from.top;
      drag.from = point;
      zone.points = zone.points.map((corner) => ({ left: round(clamp01(corner.left + dx)), top: round(clamp01(corner.top + dy)) }));
    }
    draw();
  });
  const endDrag = () => { drag = null; };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  for (const button of document.querySelectorAll('[data-mode]')) {
    button.addEventListener('click', () => setMode(button.dataset.mode === mode && mode !== 'select' ? 'select' : button.dataset.mode));
  }
  $('drawDone').addEventListener('click', () => {
    if (drawing.length < 3) return;
    if (draft.zones.length >= LIMITS.zones) return toast(`Up to ${LIMITS.zones} areas in all.`, true);
    const building = mode === 'building';
    const count = draft.zones.filter((entry) => isBuilding(entry) === building).length + 1;
    const zone = building
      ? { id: newId('area'), kind: 'building', name: `Tunnel / garage ${count}`, points: drawing, strength: 0.25 }
      : { id: newId('area'), kind: 'weak', name: `Weak area ${count}`, points: drawing, strength: 0.35 };
    draft.zones.push(zone);
    drawing = [];
    mode = 'select';
    selected = { kind: 'zone', id: zone.id };
    draw();
  });
  $('drawCancel').addEventListener('click', () => setMode('select'));
  $('covBuildings').addEventListener('change', (event) => {
    draft.buildings = event.target.checked;
    draw();
  });

  function setZoom(next) {
    const before = { x: wrap.scrollLeft + wrap.clientWidth / 2, y: wrap.scrollTop + wrap.clientHeight / 2, width: map.offsetWidth };
    zoom = Math.max(1, Math.min(4, next));
    map.style.width = `${zoom * 100}%`;
    const scale = map.offsetWidth / before.width;
    wrap.scrollLeft = before.x * scale - wrap.clientWidth / 2;
    wrap.scrollTop = before.y * scale - wrap.clientHeight / 2;
    $('zoomLevel').textContent = `${zoom}x`;
    draw();
  }
  $('zoomIn').addEventListener('click', () => setZoom(zoom + 1));
  $('zoomOut').addEventListener('click', () => setZoom(zoom - 1));

  resetButton.addEventListener('click', () => {
    draft = copy(saved);
    selected = null;
    setMode('select');
  });
  saveButton.addEventListener('click', async () => {
    if (!dirty() || saving) return;
    saving = true;
    draw();
    const result = await save(copy(draft));
    saving = false;
    if (result) {
      saved = copy(result);
      draft = copy(result);
      if (selected && !find(selected.kind, selected.id)) selected = null;
    }
    draw();
  });
  window.addEventListener('beforeunload', (event) => {
    if (dirty()) event.preventDefault();
  });

  return {
    /** New data from the bot: the saved map (kept out of an unsaved draft) and where units are. */
    update(coverage, units) {
      const fresh = { towers: coverage?.towers || [], zones: coverage?.zones || [], buildings: coverage?.buildings === true };
      const wasDirty = dirty();
      saved = copy(fresh);
      if (!wasDirty) draft = copy(fresh);
      positions = Array.isArray(units) ? units : [];
      if (selected && !find(selected.kind, selected.id)) selected = null;
      if (!drag) draw();
    },
  };
};
