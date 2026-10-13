import type { GradeBand } from '../../contracts';
import { cities, type CityId } from '../../content/cities';
import { formatSelectedTime, parseDatetimeLocal, toDatetimeLocalValue } from '../../sky/time';
import { connectPlaces, contentFor, earthCatalog, observerForCity, skyCatalog } from './catalog';
import { canUseSubpoint, safeUrl, visibleItems } from './domain';
import { Scene } from './scene';
import type { Area, ContentTab, Entity, Relation, StartMode, World } from './types';

const SKY_FILTERS: Array<[string, string]> = [
  ['all', 'All'],
  ['satellite', 'Satellites'],
  ['planet', 'Planets'],
];
const EARTH_FILTERS: Array<[string, string]> = [
  ['all', 'All'],
  ['location', 'Locations'],
  ['museum', 'Museums'],
  ['college', 'Colleges'],
  ['historic', 'History'],
];
const GRADES: Array<[GradeBand, string]> = [
  ['K-2', 'K–2'],
  ['3-5', 'Grades 3–5'],
  ['6-8', 'Grades 6–8'],
  ['9-12', 'Grades 9–12'],
];
const SKY_AREAS: Array<[string, Area | null]> = [
  ['All visible sky', { west: 0, east: 360, south: 0, north: 90 }],
  ['High in the sky', { west: 0, east: 360, south: 40, north: 90 }],
  ['Eastern sky', { west: 45, east: 135, south: 0, north: 90 }],
  ['Southern sky', { west: 135, east: 225, south: 0, north: 90 }],
  ['Western sky', { west: 225, east: 315, south: 0, north: 90 }],
  ['Whole sky, including below the horizon', null],
];
const EARTH_AREAS: Array<[string, Area | null]> = [
  ['Anywhere in this pack', null],
  ['Los Angeles area', { west: -118.7, east: -117.9, south: 33.7, north: 34.4 }],
  ['Washington, DC area', { west: -77.2, east: -76.9, south: 38.8, north: 39 }],
];

interface Options {
  at?: Date;
  cityId?: CityId;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...children: Array<Node | string>): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

export function mountPresentation(root: HTMLElement, options: Options = {}) {
  const state = {
    world: 'sky' as World,
    view: 'scene' as 'scene' | 'list',
    start: 'search' as StartMode,
    filter: 'all',
    query: '',
    area: null as Area | null,
    areaLabel: 'All visible sky',
    cityId: options.cityId ?? 'la' as CityId,
    placeObserver: null as { name: string; lat: number; lon: number } | null,
    at: options.at ?? new Date(),
    grade: '3-5' as GradeBand,
    selectedId: '',
    relation: 'nearby' as Relation,
    interest: 'museums',
    radiusKm: 100,
    contentTab: 'media' as ContentTab,
    showContent: false,
    showGround: false,
    status: '',
    statusError: false,
    connectedFrom: '',
  };

  root.replaceChildren(el('a', { class: 'skip', href: '#results' }, 'Skip to starting points'));
  const header = el('header', {},
    el('a', { class: 'brand', href: './' }, 'SKYGROUND'),
    el('nav', { 'aria-label': 'Space or Earth' },
      button('Space', { 'data-world': 'sky', 'aria-pressed': 'true' }),
      button('Earth', { 'data-world': 'earth', 'aria-pressed': 'false' }),
    ),
  );
  const searchInput = el('input', { id: 'search', type: 'search', placeholder: 'ISS, Jupiter, museums…', autocomplete: 'off' });
  const searchForm = el('form', { id: 'search-form' },
    el('label', { class: 'field-label', for: 'search' }, 'Find a space object or data type'),
    el('div', { class: 'search' }, searchInput),
    el('p', { class: 'hint' }, 'Search the calculated sky or the curated places by name.'),
  );
  const areaSelect = el('select', { id: 'area-preset' });
  const areaBox = el('div', { id: 'area-controls' },
    el('label', { class: 'field-label', for: 'area-preset' }, 'Choose an area to begin'),
    areaSelect,
    button('Draw an area in the view', { id: 'draw-area', type: 'button' }),
    el('p', { class: 'hint', id: 'area-hint' }, 'The list shows the same results as the rectangle.'),
    button('Clear selected area', { id: 'clear-area', type: 'button' }),
  );
  const results = el('div', { id: 'results' });
  const count = el('span', { id: 'result-count' }, '0');
  const groundName = el('strong', { id: 'ground-name' }, '');
  const groundPanel = el('div', { id: 'ground-panel', hidden: '' });
  const timeInput = el('input', { id: 'selected-time', type: 'datetime-local' });
  const citySelect = el('select', { id: 'city' });
  for (const id of Object.keys(cities) as CityId[]) {
    citySelect.append(el('option', { value: id }, cities[id].name));
  }
  const gradeSelect = el('select', { id: 'grade' });
  for (const [value, label] of GRADES) gradeSelect.append(el('option', { value }, label));
  gradeSelect.value = state.grade;
  groundPanel.append(
    el('label', { class: 'field-label', for: 'city' }, 'City reference point'),
    citySelect,
    el('label', { class: 'field-label', for: 'selected-time' }, 'Selected time'),
    timeInput,
    el('p', { class: 'hint', id: 'time-readout' }, ''),
    el('label', { class: 'field-label', for: 'grade' }, 'Learning level'),
    gradeSelect,
    button('Apply city and time', { id: 'apply-ground', type: 'button', class: 'primary' }),
  );
  const aside = el('aside', {},
    el('p', { class: 'eyebrow' }, 'Start your connection'),
    el('h1', {}, 'Where will your curiosity take you?'),
    el('div', { class: 'text-tabs', role: 'tablist', 'aria-label': 'Starting method' },
      button('Search', { 'data-start': 'search', 'aria-pressed': 'true' }),
      button('Browse', { 'data-start': 'browse', 'aria-pressed': 'false' }),
      button('Select area', { 'data-start': 'area', 'aria-pressed': 'false' }),
    ),
    searchForm,
    areaBox,
    el('div', { class: 'count-row' }, el('p', { class: 'eyebrow' }, 'Available starting points'), count),
    results,
    el('div', { class: 'ground' },
      (() => {
        const control = button('Change your ground starting point', { id: 'toggle-ground', type: 'button' });
        control.replaceChildren(groundName, el('span', { class: 'hint' }, 'Change your ground starting point'));
        return control;
      })(),
      groundPanel,
    ),
  );
  const kicker = el('p', { class: 'eyebrow', id: 'kicker' }, 'Explore the sky');
  const title = el('h2', { id: 'title' }, 'Your window into space');
  const filters = el('div', { id: 'filters', class: 'chips', 'aria-label': 'Filters' });
  const status = el('p', { id: 'status', role: 'status' });
  const canvas = el('canvas', { id: 'scene', tabindex: '0' });
  canvas.setAttribute('aria-label', 'Horizon chart or world map. Choose an object from the starting points list. Plus and minus zoom the chart.');
  const caption = el('p', { class: 'scene-caption', id: 'caption' }, '');
  const stage = el('section', { id: 'stage', 'aria-label': 'Scene' },
    canvas,
    el('div', { class: 'scene-controls' },
      button('+', { id: 'zoom-in', type: 'button', 'aria-label': 'Zoom in' }),
      button('−', { id: 'zoom-out', type: 'button', 'aria-label': 'Zoom out' }),
    ),
    caption,
  );
  const list = el('section', { id: 'list', class: 'cards', 'aria-label': 'Matching objects', hidden: '' });
  const detail = el('section', { id: 'detail', class: 'panel', 'aria-label': 'Selected details' });
  const main = el('main', {},
    el('div', { class: 'toolbar' },
      el('div', {}, kicker, title),
      el('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Scene or list' },
        button('3D scene', { 'data-view': 'scene', 'aria-pressed': 'true' }),
        button('List', { 'data-view': 'list', 'aria-pressed': 'false' }),
      ),
    ),
    filters,
    status,
    stage,
    list,
    detail,
  );
  root.append(header, el('div', { class: 'shell' }, aside, main));

  const scene = new Scene(canvas, {
    onSelect: (id) => select(items().find((entity) => entity.id === id) ?? null),
    onArea: (area) => {
      state.area = area;
      state.areaLabel = 'Drawn area';
      state.start = 'area';
      render();
    },
  });

  function button(label: string, props: Record<string, string>) {
    return el('button', { type: 'button', ...props }, label);
  }

  function observerPoint() {
    if (state.placeObserver) {
      return {
        name: state.placeObserver.name,
        lat: state.placeObserver.lat,
        lon: state.placeObserver.lon,
        heightMeters: 0,
        locationMode: 'place' as const,
      };
    }
    const city = cities[state.cityId];
    return { ...observerForCity(state.cityId), name: city.name };
  }

  function catalog(): Entity[] {
    if (state.world === 'sky') {
      const observer = observerPoint();
      return skyCatalog(observer, state.at);
    }
    return earthCatalog();
  }

  function items(): Entity[] {
    const query = state.start === 'search' ? state.query : '';
    return visibleItems(catalog(), state.filter, state.start === 'area' ? state.area : null, state.world, query);
  }

  function selected(): Entity | null {
    return catalog().find((entity) => entity.id === state.selectedId) ?? null;
  }

  function setStatus(text: string, error = false) {
    state.status = text;
    state.statusError = error;
    status.textContent = text;
    status.classList.toggle('error', error);
  }

  function fillAreas() {
    const choices = state.world === 'sky' ? SKY_AREAS : EARTH_AREAS;
    const labels = choices.map(([label]) => label);
    if (state.areaLabel === 'Drawn area' && !labels.includes('Drawn area')) labels.push('Drawn area');
    areaSelect.replaceChildren(...labels.map((label) => el('option', { value: label }, label)));
    if (!labels.includes(state.areaLabel)) state.areaLabel = labels[0];
    areaSelect.value = state.areaLabel;
  }

  function render() {
    root.querySelectorAll<HTMLButtonElement>('[data-world]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.world === state.world)));
    root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.view === state.view)));
    root.querySelectorAll<HTMLButtonElement>('[data-start]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.start === state.start)));
    searchForm.hidden = state.start !== 'search';
    areaBox.hidden = state.start !== 'area';
    stage.hidden = state.view !== 'scene';
    list.hidden = state.view !== 'list';
    const sceneButton = root.querySelector<HTMLButtonElement>('[data-view="scene"]');
    if (sceneButton) sceneButton.textContent = state.world === 'sky' ? '3D scene' : 'World map';
    kicker.textContent = state.world === 'sky' ? 'Explore the sky' : 'Explore the world';
    title.textContent = state.world === 'sky' ? 'Your window into space' : 'Your world of connections';
    const searchLabel = searchForm.querySelector('label');
    if (searchLabel) searchLabel.textContent = state.world === 'sky' ? 'Find a space object or data type' : 'Find a place or data type';
    const choices = state.world === 'sky' ? SKY_FILTERS : EARTH_FILTERS;
    if (!choices.some(([id]) => id === state.filter)) state.filter = 'all';
    filters.replaceChildren(...choices.map(([id, label]) => {
      const node = button(label, { 'data-filter': id, 'aria-pressed': String(state.filter === id) });
      node.onclick = () => { state.filter = id; render(); };
      return node;
    }));
    fillAreas();
    const visible = items();
    count.textContent = String(visible.length);
    results.replaceChildren(...visible.map(resultButton));
    if (!visible.length) results.append(el('p', { class: 'hint' }, 'No matches. Try another search, filter, or area.'));
    list.replaceChildren(...visible.map((entity) => {
      const card = el('button', { type: 'button', class: 'entity-card', 'aria-pressed': String(entity.id === state.selectedId) },
        el('strong', {}, entity.name),
        el('small', {}, `${entity.subtitle} · Calculated direction · open for details`),
      );
      card.onclick = () => select(entity);
      return card;
    }));
    if (!visible.length) list.append(el('p', { class: 'hint' }, 'No matches. Try another search, filter, or area.'));
    groundName.textContent = observerPoint().name;
    groundPanel.hidden = !state.showGround;
    timeInput.value = toDatetimeLocalValue(state.at);
    citySelect.value = state.cityId;
    const time = formatSelectedTime(state.at);
    const readout = document.getElementById('time-readout');
    if (readout) readout.textContent = `${time.heading}: ${time.utc}`;
    caption.textContent = state.world === 'sky'
      ? 'Calculated directions · not to scale · below the horizon stays in the list'
      : 'Natural Earth land · public domain · not a street map';
    scene.update({
      world: state.world,
      items: visible,
      selected: state.selectedId,
      mode: state.start,
      area: state.start === 'area' ? state.area : null,
    });
    renderDetail();
    status.textContent = state.status;
    status.classList.toggle('error', state.statusError);
  }

  function resultButton(entity: Entity) {
    const node = el('button', { type: 'button', class: 'result', 'aria-pressed': String(entity.id === state.selectedId) },
      el('strong', {}, entity.name),
      el('small', {}, entity.subtitle),
    );
    node.onclick = () => select(entity);
    return node;
  }

  function renderDetail() {
    const entity = selected();
    detail.replaceChildren();
    if (!entity) {
      detail.append(
        el('p', { class: 'eyebrow' }, 'Object details'),
        el('h2', {}, 'Choose a starting point.'),
        el('p', {}, 'Select an object or place from the list. The scene uses the same records.'),
      );
      return;
    }
    const badge = entity.kind === 'satellite' && entity.subtitle.includes('stale') ? 'Stale elements' : entity.sky || entity.location ? 'Calculated' : 'Position not shown';
    detail.append(
      el('div', { class: 'detail-head' },
        el('p', { class: 'eyebrow' }, entity.subtitle),
        el('span', { class: 'badge' }, badge),
      ),
      el('h2', {}, entity.name),
      el('p', {}, entity.description),
    );
    for (const fact of entity.facts) detail.append(el('p', { class: 'hint' }, fact));
    const href = safeUrl(entity.source.url);
    if (href) {
      const link = el('a', { href, rel: 'noreferrer' }, `Source: ${entity.source.name}`);
      detail.append(link);
    }
    if (entity.world === 'sky') detail.append(connectionControls(entity));
    const actions = el('div', { class: 'detail-actions' });
    const connect = button(entity.world === 'sky' ? 'Connect to Earth' : 'Connect to space', { class: 'primary', id: 'connect' });
    connect.onclick = () => (entity.world === 'sky' ? connectToEarth(entity) : connectToSpace(entity));
    const stories = button('Media & stories', { id: 'stories' });
    stories.onclick = () => { state.showContent = true; renderDetail(); document.getElementById('content')?.focus(); };
    actions.append(connect, stories);
    detail.append(actions);
    if (state.showContent) detail.append(contentBlock(entity));
  }

  function connectionControls(entity: Entity) {
    const relation = el('select', { id: 'relation' });
    relation.append(el('option', { value: 'nearby' }, 'Near the chosen city'));
    const subpoint = el('option', { value: 'subpoint' }, 'Beneath this satellite');
    if (!canUseSubpoint(entity)) subpoint.disabled = true;
    relation.append(subpoint, el('option', { value: 'topic' }, 'Related learning topic'));
    if (entity.kind !== 'satellite') state.relation = 'topic';
    if (state.relation === 'subpoint' && !canUseSubpoint(entity)) state.relation = 'nearby';
    relation.value = state.relation;
    relation.onchange = () => { state.relation = relation.value as Relation; renderDetail(); };
    const interest = el('select', { id: 'interest' });
    for (const [value, label] of [['museums', 'Museums'], ['colleges', 'Colleges'], ['history', 'History'], ['observatories', 'Observatories']] as const) {
      interest.append(el('option', { value }, label));
    }
    interest.value = state.interest;
    interest.onchange = () => { state.interest = interest.value; };
    const radius = el('input', { id: 'radius', type: 'number', min: '1', max: '1000', value: String(state.radiusKm) });
    radius.oninput = () => { state.radiusKm = Number(radius.value); };
    const wrap = el('div', { class: 'connection-form' },
      el('label', { class: 'field-label', for: 'relation' }, 'Connection', relation),
      el('label', { class: 'field-label', for: 'interest' }, 'Interest', interest),
    );
    if (state.relation !== 'topic') wrap.append(el('label', { class: 'field-label', for: 'radius' }, 'Radius in kilometers', radius));
    const rule = state.relation === 'subpoint'
      ? 'A satellite ground point is the place beneath the satellite. It does not show where an instrument is looking.'
      : state.relation === 'topic'
        ? 'A learning topic is not a geographic link. Planets, the Sun, and the Moon have no satellite ground point.'
        : 'Nearby places use the chosen city and radius. No reviewed scientific link is included.';
    wrap.append(el('p', { class: 'hint', id: 'connection-rule' }, rule));
    return wrap;
  }

  function contentBlock(entity: Entity) {
    const tabs = el('div', { class: 'text-tabs', role: 'tablist', 'aria-label': 'Stories' });
    for (const [id, label] of [['media', 'Media'], ['history', 'History'], ['news', 'News'], ['activity', 'Activity']] as const) {
      const tab = button(label, { 'data-content': id, 'aria-pressed': String(state.contentTab === id) });
      tab.onclick = () => { state.contentTab = id; renderDetail(); };
      tabs.append(tab);
    }
    const body = el('div', { id: 'content', tabindex: '-1' });
    for (const item of contentFor(entity, state.contentTab, state.grade)) {
      body.append(el('h3', {}, item.title), el('p', {}, item.text));
    }
    return el('div', {}, tabs, body);
  }

  function connectToEarth(entity: Entity) {
    const radius = Number(state.radiusKm);
    if (state.relation !== 'topic' && (!Number.isFinite(radius) || radius < 1 || radius > 1000)) {
      setStatus('Choose a radius from 1 to 1000 km.', true);
      return;
    }
    if (state.relation === 'subpoint' && !canUseSubpoint(entity)) {
      setStatus('That object has no satellite ground point.', true);
      return;
    }
    const here = observerPoint();
    const matches = connectPlaces({
      entity,
      relation: state.relation,
      interest: state.interest,
      radiusKm: radius,
      observer: { lat: here.lat, lon: here.lon },
    });
    state.connectedFrom = entity.name;
    state.world = 'earth';
    state.filter = 'all';
    state.query = '';
    state.area = null;
    state.start = 'browse';
    state.selectedId = matches[0]?.entity.id ?? '';
    state.showContent = false;
    searchInput.value = '';
    setStatus(matches.length
      ? `${matches.length} places · ${matches[0].explanation}`
      : `No curated places match that connection from ${entity.name}.`);
    render();
  }

  function connectToSpace(entity: Entity) {
    if (entity.kind === 'location') {
      const id = entity.id.replace('city-', '') as CityId;
      if (id in cities) state.cityId = id;
      state.placeObserver = null;
      setStatus(`Sky calculated for ${entity.name}.`);
    } else if (entity.location) {
      state.placeObserver = { name: entity.name, lat: entity.location.lat, lon: entity.location.lon };
      setStatus(`Sky calculated for ${entity.name}. Height was not surveyed, so the calculation uses 0 m.`);
    }
    state.connectedFrom = '';
    state.world = 'sky';
    state.filter = 'all';
    state.query = '';
    state.area = null;
    state.start = 'browse';
    state.selectedId = '';
    searchInput.value = '';
    render();
    const first = items()[0];
    if (first) select(first);
  }

  function select(entity: Entity | null) {
    if (!entity) return;
    if (entity.world !== state.world) {
      state.world = entity.world;
      state.filter = 'all';
      state.area = null;
    }
    state.selectedId = entity.id;
    state.showContent = false;
    if (entity.kind !== 'satellite') state.relation = 'topic';
    setStatus(`${entity.name} · ${entity.subtitle}`);
    render();
  }

  function bootSelection() {
    const visible = items();
    const iss = visible.find((entity) => entity.id === 'norad-25544') ?? visible[0];
    if (iss) state.selectedId = iss.id;
    const time = formatSelectedTime(state.at);
    setStatus(`${visible.length} calculated records · ${time.heading} ${time.utc}`);
    render();
  }

  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest('button');
    if (!target || target.disabled) return;
    if (target.dataset.world === 'sky' || target.dataset.world === 'earth') {
      state.world = target.dataset.world;
      state.filter = 'all';
      state.query = '';
      state.area = null;
      state.selectedId = '';
      state.connectedFrom = '';
      state.start = 'search';
      state.areaLabel = state.world === 'sky' ? 'All visible sky' : 'Anywhere in this pack';
      searchInput.value = '';
      bootSelection();
    }
    if (target.dataset.view === 'scene' || target.dataset.view === 'list') {
      state.view = target.dataset.view;
      render();
    }
    if (target.dataset.start === 'search' || target.dataset.start === 'browse' || target.dataset.start === 'area') {
      state.start = target.dataset.start;
      if (state.start !== 'search') {
        state.query = '';
        searchInput.value = '';
      }
      if (state.start === 'area') {
        const choices = state.world === 'sky' ? SKY_AREAS : EARTH_AREAS;
        const match = choices.find(([label]) => label === state.areaLabel) ?? choices[0];
        state.area = match[1];
        state.areaLabel = match[0];
      }
      render();
    }
  });
  searchForm.onsubmit = (event) => {
    event.preventDefault();
    state.query = searchInput.value;
    render();
  };
  searchInput.oninput = () => {
    state.query = searchInput.value;
    render();
  };
  areaSelect.onchange = () => {
    const choices = state.world === 'sky' ? SKY_AREAS : EARTH_AREAS;
    const match = choices.find(([label]) => label === areaSelect.value);
    state.areaLabel = areaSelect.value;
    state.area = match ? match[1] : null;
    render();
  };
  document.getElementById('clear-area')!.onclick = () => {
    state.area = null;
    state.areaLabel = state.world === 'sky' ? 'Whole sky, including below the horizon' : 'Anywhere in this pack';
    render();
  };
  document.getElementById('draw-area')!.onclick = () => {
    state.start = 'area';
    setStatus('Drag a rectangle on the scene. The list uses the same area.');
    render();
  };
  document.getElementById('zoom-in')!.onclick = () => scene.setZoom(1.25);
  document.getElementById('zoom-out')!.onclick = () => scene.setZoom(0.8);
  document.getElementById('toggle-ground')!.onclick = () => {
    state.showGround = !state.showGround;
    render();
  };
  document.getElementById('apply-ground')!.onclick = () => {
    try {
      state.at = parseDatetimeLocal(timeInput.value);
    } catch {
      setStatus('Enter a valid selected time.', true);
      return;
    }
    state.cityId = citySelect.value as CityId;
    state.placeObserver = null;
    state.grade = gradeSelect.value as GradeBand;
    state.showGround = false;
    state.selectedId = '';
    bootSelection();
  };
  if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 800px)').matches) state.view = 'list';
  bootSelection();
  return { scene };
}
