import type { Coordinates } from '../../contracts';
import { loadBelow, type BelowLookup } from '../../content/below';
import { WORLD_CITIES, cityById, observerFor, type ReferenceCity } from '../../content/world-cities';
import { ORBIT_LABELS } from '../../sky/orbits';
import { toDatetimeLocalValue, parseDatetimeLocal } from '../../sky/time';
import { MotionSensor, directionWords, type MotionStatus } from '../../sensors/orientation';
import { requestLocation } from '../../sensors/location';
import { keepSatellitesFresh, satelliteDataAgeHours } from '../../sky/live-data';
import type { Observer } from '../../contracts';
import { eventPanel, refreshDetail, regionCard, renderDetail, type DetailContext } from './detail';
import { SPACE_HISTORY } from '../../content/space-history';
import { loadPlaces, type PlacePack } from '../../content/place-profiles';
import { placePanel } from './place-panel';
import { StarNames } from '../../content/star-names';
import { catalogIfLoaded, loadCatalog } from '../../sky/catalog';
import { button, h } from './dom';
import { EarthView } from './earth-view';
import { OrbitsView } from './orbits-view';
import { ORBIT_COLORS } from './palette';
import { catalogThing, computeBackdrop, computeSky, groundPointOf, groundTrackAround, skyPath, type SkySnapshot, type SkyThing } from './sky-model';
import { SkyView } from './sky-view';

type Tab = 'sky' | 'orbits' | 'earth' | 'list';
type ListFilter = 'all' | 'satellite' | 'planet' | 'small' | 'star';

export interface ExploreOptions {
  /** Override the star names service address (tests and local development). */
  starNamesApi?: string;
  at?: Date;
  cityId?: string;
  tab?: Tab;
}

const MOTION_TEXT: Record<MotionStatus, string> = {
  off: 'Drag to look around, or turn on motion to point your phone.',
  waiting: 'Hold your phone flat for a moment so it can find north…',
  on: 'Point your phone at the sky. Objects behind you show an arrow.',
  denied: 'Motion was not allowed, so the view can\u2019t follow your phone. You can still drag to look around.',
  unavailable: 'This browser isn\u2019t sharing your phone\u2019s motion sensors, so the view can\u2019t follow it. Drag to look around, or open SkyGround directly in Safari or Chrome.',
  'no-compass': 'No compass found, so north may be off. Drag to look around if it seems wrong.',
};

export function mountExplore(root: HTMLElement, options: ExploreOptions = {}) {
  const state = {
    tab: options.tab ?? ('sky' as Tab),
    city: cityById(options.cityId ?? 'la') as ReferenceCity,
    live: !options.at,
    at: options.at ?? new Date(),
    selectedId: '',
    picked: null as Coordinates | null,
    motion: 'off' as MotionStatus,
    listFilter: 'all' as ListFilter,
    showStars: true,
    sheetOpen: false,
    sky: null as SkySnapshot | null,
    below: null as BelowLookup | null,
    path: [] as ReturnType<typeof skyPath>,
    pathAt: 0,
    track: [] as Coordinates[],
    trackAt: 0,
    introDismissed: false,
    lookingDown: false,
    myLocation: null as Observer | null,
    places: null as PlacePack | null,
    placeOpen: null as { point: Coordinates; backId: string } | null,
    catalogIndex: -1,
    nameSearch: '',
    backdrop: null as ReturnType<typeof computeBackdrop> | null,
  };

  // ----- Top bar -----
  const cityButton = button('', { class: 'pill', id: 'city-button', 'aria-haspopup': 'dialog' }, () => openSettings());
  const timeButton = button('', { class: 'pill', id: 'time-button', 'aria-haspopup': 'dialog' }, () => openSettings());
  const topbar = h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: './' }, 'SKYGROUND'),
    h('div', { class: 'topbar-pills' }, cityButton, timeButton),
  );

  // ----- Sky view -----
  const skyCanvas = h('canvas', { id: 'sky-canvas', class: 'sky-canvas', tabindex: '0', 'aria-label': 'Sky view. Use arrow keys to look around and Enter to open the object in the centre. The List tab has the same objects as text.' });
  const motionButton = button('Point my phone', { class: 'primary', id: 'motion-button' }, () => toggleMotion());
  const motionStatus = h('p', { class: 'overlay-status', id: 'motion-status', role: 'status' }, MOTION_TEXT.off);
  const viewReadout = h('p', { class: 'view-readout', id: 'view-readout' });
  const nearbyBar = h('div', { class: 'nearby', id: 'nearby', hidden: true });
  const jumpButton = button('Jump to', { class: 'chip small', id: 'jump-button', 'aria-haspopup': 'dialog' }, () => jump.open());
  const aimChip = button('', { class: 'aim-chip', id: 'aim-chip', hidden: true }, () => {
    const id = aimChip.dataset.id;
    if (id) select(id);
  });
  const starsToggle = button('Lines', { class: 'chip small', 'aria-pressed': 'true', 'aria-label': 'Constellation lines' }, () => {
    state.showStars = !state.showStars;
    starsToggle.setAttribute('aria-pressed', String(state.showStars));
    skyView.setStars(state.showStars);
  });
  const intro = h('div', { class: 'intro-card', id: 'intro' },
    h('p', { class: 'eyebrow' }, 'Point · Learn · Connect'),
    h('h1', {}, 'What’s up there, and what’s below it?'),
    h('p', {}, 'Hold your phone up to the sky to find satellites, planets, the Moon, and bright stars. Tap one to learn what it does, how high it orbits, and what place on Earth is beneath it right now.'),
    h('div', { class: 'intro-actions' },
      button('Point my phone', { class: 'primary' }, () => { dismissIntro(); void toggleMotion(true); }),
      button('Drag to explore', { class: 'secondary' }, () => dismissIntro()),
    ),
    h('p', { class: 'hint' }, 'Point my phone asks for your location and motion so the sky matches where you are standing. They stay on your phone and are never saved or shared.'),
  );
  const skySection = h('section', { class: 'view sky-view', id: 'view-sky', 'aria-label': 'Sky' },
    skyCanvas,
    h('div', { class: 'sky-overlay top' }, motionStatus, viewReadout),
    h('div', { class: 'sky-overlay bottom' },
      nearbyBar,
      aimChip,
      h('div', { class: 'sky-controls' },
        motionButton,
        jumpButton,
        starsToggle,
      ),
    ),
    h('div', { class: 'zoom-stack' },
      button('+', { class: 'chip small', 'aria-label': 'Zoom in' }, () => skyView.zoomBy(0.83)),
      button('−', { class: 'chip small', 'aria-label': 'Zoom out' }, () => skyView.zoomBy(1.2)),
    ),
    intro,
  );
  const skyView = new SkyView(skyCanvas, {
    onSelect: (id) => select(id),
    onAim: (thing) => {
      if (!thing) {
        aimChip.hidden = true;
        aimChip.dataset.id = '';
        return;
      }
      aimChip.hidden = false;
      aimChip.dataset.id = thing.id;
      aimChip.replaceChildren(
        h('span', { class: 'aim-dot', style: `background:${thing.satellite ? ORBIT_COLORS[thing.satellite.orbit.orbitClass] : '#fafafa'}` }),
        h('span', {}, h('strong', {}, thing.name), ` · ${aimSubtitle(thing)}`),
        h('span', { class: 'aim-go' }, 'Learn'),
      );
    },
    onSelectStar: (index) => selectCatalog(index),
    onLookBelow: (below) => {
      state.lookingDown = below;
      motionStatus.textContent = below ? 'You are looking down through Earth. Faint objects here are below your horizon.' : MOTION_TEXT[state.motion];
    },
    onView: ({ azimuthDeg, altitudeDeg }) => {
      viewReadout.textContent = describeView(azimuthDeg, altitudeDeg);
    },
    onManualLook: () => {
      nearbyBar.hidden = true;
      aimChip.classList.remove('quiet');
      if (state.motion === 'on' || state.motion === 'waiting' || state.motion === 'no-compass') stopMotion('off');
    },
  });
  const sensor = new MotionSensor((basis) => skyView.setSensorBasis(basis), (status) => setMotion(status));

  // ----- Orbits view -----
  const orbitsView = new OrbitsView({ onSelect: (id) => select(id) });
  orbitsView.element.id = 'view-orbits';

  // ----- Earth view -----
  const earthCanvas = h('canvas', { id: 'earth-canvas', class: 'earth-canvas', tabindex: '0', 'aria-label': 'World map with satellite ground points, the day and night line, and your city. Tap anywhere to see what is there.' });
  const earthInfo = h('div', { class: 'earth-info', id: 'earth-info' });
  const earthSection = h('section', { class: 'view earth-view', id: 'view-earth', 'aria-label': 'Earth' },
    h('div', { class: 'view-intro' },
      h('h1', {}, 'Sky to ground'),
      h('p', {}, 'Every satellite has a ground point: the spot right beneath it. The Sun and Moon have an overhead point. Tap a dot, or tap anywhere to see what is there. Pinch or double-tap to zoom, and drag to move around.'),
    ),
    h('div', { class: 'earth-stage' },
      earthCanvas,
      h('div', { class: 'map-controls' },
        button('−', { class: 'chip small', 'aria-label': 'Zoom out' }, () => earthView.zoomBy(0.66)),
        button('+', { class: 'chip small', 'aria-label': 'Zoom in' }, () => earthView.zoomBy(1.5)),
      ),
    ),
    h('ul', { class: 'legend' },
      h('li', {}, h('span', { class: 'key square' }), 'You (the chosen city)'),
      h('li', {}, h('span', { class: 'key', style: `background:${ORBIT_COLORS.LEO}` }), 'LEO'),
      h('li', {}, h('span', { class: 'key', style: `background:${ORBIT_COLORS.MEO}` }), 'MEO'),
      h('li', {}, h('span', { class: 'key', style: `background:${ORBIT_COLORS.GEO}` }), 'GEO'),
      h('li', {}, h('span', { class: 'key', style: `background:${ORBIT_COLORS.HEO}` }), 'HEO'),
      h('li', {}, h('span', { class: 'key night' }), 'Night side'),
      h('li', {}, h('span', { class: 'key diamond' }), 'Space history'),
    ),
    earthInfo,
    h('p', { class: 'caption' }, 'NASA Blue Marble (2004) under Natural Earth coastlines. Not a live picture. Dashed line: the selected satellite’s path over one orbit before and after now.'),
  );
  const earthView = new EarthView(earthCanvas, {
    onSelect: (id) => select(id),
    onPoint: (point) => openPlace(point, ''),
  });

  // ----- List view -----
  const listFilters = h('div', { class: 'chips', role: 'group', 'aria-label': 'Show' });
  const nameSearch = h('input', { id: 'name-search', type: 'search', placeholder: 'Find a star by name, like Vega or a name you gave', autocomplete: 'off', 'aria-label': 'Find a star by name' });
  const nameResults = h('ul', { class: 'rows', id: 'name-results' });
  nameSearch.addEventListener('input', () => {
    state.nameSearch = nameSearch.value;
    renderNameResults();
  });
  const listBody = h('div', { class: 'list-body', id: 'list-body' });
  const listSection = h('section', { class: 'view list-view', id: 'view-list', 'aria-label': 'List' },
    h('div', { class: 'view-intro' },
      h('h1', {}, 'Start from space'),
      h('p', {}, 'Pick anything up there, even if it is below your horizon, and follow it down to Earth: where it is overhead, what places it passes over, and what happened beneath it.'),
      h('p', { id: 'list-summary', class: 'hint' }, ''),
    ),
    h('div', { class: 'find-names' }, nameSearch),
    nameResults,
    listFilters,
    listBody,
  );

  function renderNameResults() {
    const text = state.nameSearch.trim().toLowerCase();
    const catalog = catalogIfLoaded();
    if (text.length < 2 || !catalog) {
      nameResults.replaceChildren();
      return;
    }
    const rows: HTMLElement[] = [];
    for (const shared of starNames.search(text, 15)) {
      const index = catalog.index.get(shared.star);
      if (index == null) continue;
      const node = button('', { class: 'row' }, () => selectCatalog(index));
      node.append(h('span', { class: 'row-main' }, h('strong', {}, shared.name), h('small', {}, `a name someone gave ${catalogStarLabel(index)}`)));
      rows.push(h('li', {}, node));
    }
    for (let index = 0; index < catalog.count && rows.length < 25; index += 1) {
      const proper = catalog.proper[index];
      if (!proper || !proper.toLowerCase().includes(text)) continue;
      const node = button('', { class: 'row' }, () => selectCatalog(index));
      node.append(h('span', { class: 'row-main' }, h('strong', {}, proper), h('small', {}, `star in ${catalog.constellationNames[catalog.con[index]] ?? catalog.con[index]}`)));
      rows.push(h('li', {}, node));
    }
    nameResults.replaceChildren(...(rows.length ? rows : [h('li', { class: 'hint' }, 'No stars with that name yet.')]));
  }

  function catalogStarLabel(index: number): string {
    const catalog = catalogIfLoaded()!;
    return catalog.proper[index] || catalog.designation[index] || catalog.keys[index].replace('-', ' ').toUpperCase();
  }

  // ----- Sheet, settings, tabs -----
  const sheetBody = h('div', { class: 'sheet-body' });
  const grip = button('', { class: 'sheet-grip', 'aria-label': 'Show more details', 'aria-expanded': 'true' }, () => setPeek(!sheet.classList.contains('peek')));
  const sheet = h('aside', { class: 'sheet', id: 'sheet', 'aria-label': 'Details', hidden: true }, grip, sheetBody);
  const settings = buildSettings();
  const jump = buildJump();
  const tabs = h('nav', { class: 'tabbar', 'aria-label': 'Views' },
    ...(['sky', 'orbits', 'earth', 'list'] as Tab[]).map((tab) => {
      const labels: Record<Tab, string> = { sky: 'Sky', orbits: 'Orbits', earth: 'Earth', list: 'Explore' };
      return button(labels[tab], { 'data-tab': tab, 'aria-pressed': 'false' }, () => setTab(tab));
    }),
  );
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite', id: 'live-region' });
  const views = h('main', { class: 'views', id: 'main' }, skySection, orbitsView.element, earthSection, listSection);
  root.replaceChildren(h('a', { class: 'skip', href: '#main' }, 'Skip to content'), h('div', { class: 'app' }, topbar, views, sheet, tabs, settings.element, jump.element, live));

  // ----- Behaviour -----
  function recompute() {
    if (state.live) state.at = new Date();
    state.sky = computeSky(currentObserver(), state.at, true);
    if (state.tab === 'sky') state.backdrop = computeBackdrop(currentObserver(), state.at);
    const selected = selectedThing();
    if (selected?.satellite) {
      if (Math.abs(state.at.getTime() - state.pathAt) > 10_000 || !state.path.length) {
        const minutes = selected.satellite.orbit.periodMin < 225 ? 12 : 180;
        state.path = skyPath(selected.satellite.record, currentObserver(), state.at, minutes, 24);
        state.pathAt = state.at.getTime();
      }
      if (Math.abs(state.at.getTime() - state.trackAt) > 60_000 || !state.track.length) {
        state.track = groundTrackAround(selected.satellite.record, state.at);
        state.trackAt = state.at.getTime();
      }
    } else {
      state.path = [];
      state.track = [];
    }
  }

  function selectedThing(): SkyThing | null {
    if (state.selectedId.startsWith('cat-') && state.catalogIndex >= 0) return catalogThing(state.catalogIndex, currentObserver(), state.at);
    return state.sky?.things.find((thing) => thing.id === state.selectedId) ?? null;
  }

  /** Open any catalogue star. */
  function selectCatalog(index: number) {
    const thing = catalogThing(index, currentObserver(), state.at);
    if (!thing) return;
    state.catalogIndex = index;
    select(thing.id);
  }

  const starNames = new StarNames(options.starNamesApi);

  function updateNamedStars() {
    const catalog = catalogIfLoaded();
    if (!catalog) return;
    const named = new Map<number, string>();
    for (const [key, names] of starNames.all()) {
      const index = catalog.index.get(key);
      if (index == null || !names.length) continue;
      named.set(index, names.length > 1 ? `${names[0].name} +${names.length - 1}` : names[0].name);
    }
    skyView.setNamedStars(named);
  }

  function detailContext(): DetailContext {
    return {
      sky: state.sky!,
      cityName: placeLabel(),
      below: state.below,
      onShowMap: (thing) => {
        const ground = groundPointOf(thing);
        setTab('earth');
        if (ground) earthView.centreOn(ground.point);
      },
      onShowOrbits: () => setTab('orbits'),
      onTurnTo: (thing) => {
        setTab('sky');
        setPeek(true);
        skyView.lookAt(thing);
      },
      onClose: closeSheet,
      onShowPlace: (point) => openPlace(point, state.selectedId),
      sensorOn: state.motion === 'on',
      starNames,
    };
  }

  function select(id: string) {
    state.placeOpen = null;
    if (!id.startsWith('cat-')) state.catalogIndex = -1;
    else {
      const index = catalogIfLoaded()?.index.get(id.slice(4));
      if (index != null) state.catalogIndex = index;
    }
    if (id.startsWith('event:')) {
      const event = SPACE_HISTORY.find((item) => `event:${item.id}` === id);
      if (event) {
        state.picked = event.location;
        earthView.setPicked(event.location);
        openSheet(eventPanel(event, closeSheet));
      }
      return;
    }
    state.selectedId = id;
    state.picked = null;
    state.pathAt = 0;
    state.trackAt = 0;
    recompute();
    const thing = selectedThing();
    if (!thing) return;
    void ensureBelow();
    openSheet(renderDetail(thing, detailContext()));
    live.textContent = `${thing.name}. ${directionWords(thing.azimuthDeg, thing.altitudeDeg)}.`;
    paint();
  }

  function setPeek(peek: boolean) {
    sheet.classList.toggle('peek', peek);
    grip.setAttribute('aria-expanded', String(!peek));
    grip.setAttribute('aria-label', peek ? 'Show more details' : 'Show fewer details');
    if (peek) sheetBody.scrollTop = 0;
  }

  function openSheet(content: HTMLElement) {
    sheetBody.replaceChildren(content);
    setPeek(false);
    sheet.hidden = false;
    state.sheetOpen = true;
    root.querySelector('.app')?.classList.add('sheet-open');
    sheetBody.scrollTop = 0;
    content.querySelector<HTMLElement>('#detail-title')?.focus({ preventScroll: true });
  }

  /** Open the place card for a spot on Earth, remembering the object it came from. */
  function openPlace(point: Coordinates, backId: string) {
    state.placeOpen = { point, backId };
    state.picked = point;
    earthView.setPicked(point);
    void ensureBelow();
    openSheet(placePanel(point, placeContext()));
  }

  function placeContext() {
    const back = state.placeOpen?.backId ? state.sky?.things.find((thing) => thing.id === state.placeOpen!.backId) : null;
    return {
      below: state.below,
      places: state.places,
      skyFrom: (point: Coordinates) => computeSky({ lat: point.lat, lon: point.lon, heightMeters: 0, locationMode: 'place' }, state.at, false),
      onSelect: (id: string) => select(id),
      onShowOnMap: (point: Coordinates) => {
        state.picked = point;
        setTab('earth');
        earthView.centreOn(point);
        earthView.setPicked(point);
        renderEarthInfo();
      },
      onClose: closeSheet,
      back: back ? { label: back.name, go: () => select(back.id) } : undefined,
    };
  }

  function closeSheet() {
    state.placeOpen = null;
    sheet.hidden = true;
    state.sheetOpen = false;
    state.selectedId = '';
    state.picked = null;
    state.path = [];
    state.track = [];
    root.querySelector('.app')?.classList.remove('sheet-open');
    earthView.setPicked(null);
    paint();
  }

  async function ensureBelow() {
    if (state.below && state.places) return;
    try {
      [state.below, state.places] = await Promise.all([loadBelow(), loadPlaces()]);
    } catch {
      return;
    }
    // Fill in any card that was waiting.
    const region = sheetBody.querySelector('.region');
    const thing = selectedThing();
    if (state.placeOpen && state.sheetOpen) {
      sheetBody.replaceChildren(placePanel(state.placeOpen.point, placeContext()));
    } else if (thing && state.sheetOpen) {
      // Swap in only the sections that needed the place data, so nothing the person typed is lost.
      const fresh = renderDetail(thing, detailContext());
      const notes = sheetBody.querySelector('.notes');
      for (const selector of ['.detail-section.below', '.detail-section.history']) {
        const before = sheetBody.querySelector(selector);
        const after = fresh.querySelector(selector);
        if (before && after) before.replaceWith(after);
        else if (!before && after && notes) notes.before(after);
      }
    } else if (thing && region) {
      const ground = groundPointOf(thing);
      const section = sheetBody.querySelector<HTMLElement>('.detail-section.below');
      if (ground && section) {
        const answer = state.below.at(ground.point);
        section.dataset.region = answer.name;
        region.replaceChildren(regionCard(answer));
      }
    } else if (state.picked && region) {
      region.replaceChildren(regionCard(state.below.at(state.picked)));
    }
    renderEarthInfo();
  }

  function setTab(tab: Tab) {
    if (state.sheetOpen && tab !== state.tab) setPeek(true);
    state.tab = tab;
    for (const node of tabs.querySelectorAll<HTMLButtonElement>('[data-tab]')) node.setAttribute('aria-pressed', String(node.dataset.tab === tab));
    skySection.hidden = tab !== 'sky';
    orbitsView.element.hidden = tab !== 'orbits';
    earthSection.hidden = tab !== 'earth';
    listSection.hidden = tab !== 'list';
    if (tab === 'earth') void ensureBelow();
    paint();
  }

  function paint() {
    const sky = state.sky;
    if (!sky) return;
    cityButton.textContent = state.myLocation ? 'My location' : state.city.name;
    timeButton.textContent = state.live ? 'Now' : timeLabel(state.at);
    if (state.tab === 'sky') {
      if (!state.backdrop) state.backdrop = computeBackdrop(currentObserver(), state.at);
      skyView.setBackdrop(state.backdrop);
      skyView.setSky(sky);
      skyView.setSelected(state.selectedId, state.path);
    } else if (state.tab === 'orbits') {
      orbitsView.update(sky, state.selectedId);
    } else if (state.tab === 'earth') {
      earthView.update(sky, state.selectedId, state.track);
      renderEarthInfo();
    } else {
      renderList();
    }
    const thing = selectedThing();
    if (state.sheetOpen && thing && !state.placeOpen) refreshDetail(sheetBody, thing, detailContext());
  }

  function renderEarthInfo() {
    if (!state.sky) return;
    const sun = state.sky.things.find((thing) => thing.kind === 'sun');
    const items: Node[] = [];
    if (state.picked && state.below) items.push(regionCard(state.below.at(state.picked), 'The place you chose'));
    if (sun?.body?.overhead && state.below) {
      items.push(regionCard(state.below.at(sun.body.overhead), 'Where the Sun is straight overhead'));
    }
    const key = items.map((node) => node.textContent).join('|');
    if (earthInfo.dataset.key !== key) {
      earthInfo.dataset.key = key;
      earthInfo.replaceChildren(...items);
    }
  }

  function renderList() {
    const sky = state.sky!;
    const filters: Array<[ListFilter, string]> = [['all', 'All'], ['satellite', 'Satellites'], ['planet', 'Sun, Moon & planets'], ['small', 'Asteroids & galaxies'], ['star', 'Stars']];
    listFilters.replaceChildren(...filters.map(([id, label]) => button(label, { class: 'chip', 'aria-pressed': String(state.listFilter === id) }, () => { state.listFilter = id; renderList(); })));
    const wanted = sky.things.filter((thing) => state.listFilter === 'all'
      || (state.listFilter === 'planet' ? ['planet', 'sun', 'moon'].includes(thing.kind)
        : state.listFilter === 'small' ? ['asteroid', 'dwarf-planet', 'deep-sky'].includes(thing.kind)
          : thing.kind === state.listFilter));
    const up = wanted.filter((thing) => thing.altitudeDeg > 0).sort((a, b) => b.altitudeDeg - a.altitudeDeg);
    const down = wanted.filter((thing) => thing.altitudeDeg <= 0).sort((a, b) => b.altitudeDeg - a.altitudeDeg);
    const row = (thing: SkyThing) => {
      const node = button('', { class: thing.id === state.selectedId ? 'row selected' : 'row' }, () => select(thing.id));
      node.append(
        h('span', { class: 'row-main' }, h('strong', {}, thing.name), h('small', {}, aimSubtitle(thing))),
        h('span', { class: 'row-dir' }, directionWords(thing.azimuthDeg, thing.altitudeDeg)),
      );
      return h('li', {}, node);
    };
    const summary = root.querySelector('#list-summary');
    const age = satelliteDataAgeHours(state.at);
    if (summary) summary.textContent = `${up.length} above the horizon from ${placeLabel()} and ${down.length} below it. Satellite positions use orbit data updated ${age < 1 ? 'less than an hour' : age < 48 ? `${Math.round(age)} hours` : `${Math.round(age / 24)} days`} ago.`;
    listBody.replaceChildren(
      h('h2', {}, 'Up in your sky'),
      up.length ? h('ul', { class: 'rows' }, ...up.map(row)) : h('p', { class: 'hint' }, 'Nothing here is above the horizon right now. Try another time.'),
      h('h2', {}, 'Below the horizon'),
      down.length ? h('ul', { class: 'rows' }, ...down.map(row)) : h('p', { class: 'hint' }, 'Nothing.'),
      sky.hidden.length ? h('p', { class: 'hint' }, `No position shown for ${sky.hidden.map((item) => item.name).join(', ')}: their orbit data is too old for this time.`) : '',
    );
  }

  function setMotion(status: MotionStatus) {
    state.motion = status;
    if (!state.lookingDown || status !== 'on') motionStatus.textContent = MOTION_TEXT[status];
    const active = status === 'on' || status === 'waiting' || status === 'no-compass';
    motionButton.textContent = active ? 'Stop pointing' : 'Point my phone';
    motionButton.setAttribute('aria-pressed', String(active));
    if (!active) skyView.useManual();
  }

  function currentObserver(): Observer {
    return state.myLocation ?? observerFor(state.city);
  }

  function placeLabel(): string {
    return state.myLocation ? 'where you are' : state.city.name;
  }

  /** Called from a tap: asks for motion first (iOS needs that inside the tap), then location. */
  async function toggleMotion(forceOn = false) {
    if (!forceOn && (state.motion === 'on' || state.motion === 'waiting' || state.motion === 'no-compass')) {
      stopMotion('off');
      return;
    }
    const motion = sensor.start();
    if (!state.myLocation) void useMyLocation();
    await motion;
  }

  async function useMyLocation() {
    motionStatus.textContent = 'Finding where you are so the sky matches your view…';
    const result = await requestLocation();
    if (result.status === 'ok') {
      state.myLocation = result.observer;
      live.textContent = 'Using your location.';
      refresh();
      motionStatus.textContent = state.motion === 'on' ? 'Using your location. Point your phone at the sky.' : `Using your location. ${MOTION_TEXT[state.motion]}`;
    } else {
      const why = result.status === 'denied' ? 'Location was not allowed' : 'Your location could not be found';
      motionStatus.textContent = `${why}, so the sky is calculated for ${state.city.name}. You can pick your city at the top.`;
    }
    settings.syncLocation();
  }

  function stopMotion(status: MotionStatus) {
    sensor.stop();
    setMotion(status);
  }

  function dismissIntro() {
    state.introDismissed = true;
    intro.hidden = true;
    skyCanvas.focus({ preventScroll: true });
  }

  function buildSettings() {
    const dialog = h('div', { class: 'settings', id: 'settings', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'settings-title', hidden: true });
    const citySelect = h('select', { id: 'city-select' });
    const byCountry = new Map<string, ReferenceCity[]>();
    for (const city of WORLD_CITIES) byCountry.set(city.country, [...(byCountry.get(city.country) ?? []), city]);
    for (const [country, list] of byCountry) {
      const group = h('optgroup', { label: country });
      for (const city of list) group.append(h('option', { value: city.id }, city.name));
      citySelect.append(group);
    }
    const timeInput = h('input', { id: 'time-input', type: 'datetime-local' });
    const nowButton = button('Use the current time', { class: 'secondary' }, () => {
      state.live = true;
      state.at = new Date();
      sync();
      refresh();
    });
    const shift = (hours: number) => button(`${hours > 0 ? '+' : '−'}${Math.abs(hours)} h`, { class: 'chip' }, () => {
      state.live = false;
      state.at = new Date(state.at.getTime() + hours * 3_600_000);
      sync();
      refresh();
    });
    const sync = () => {
      citySelect.value = state.city.id;
      timeInput.value = toDatetimeLocalValue(state.at);
      status.textContent = state.live ? 'Following this device’s clock.' : `Selected time: ${state.at.toISOString().replace('.000Z', 'Z')} (UTC)`;
    };
    const status = h('p', { class: 'hint', id: 'time-status' });
    citySelect.addEventListener('change', () => {
      state.city = cityById(citySelect.value);
      state.myLocation = null;
      syncLocation();
      refresh();
    });
    const locationButton = button('Use my location', { class: 'secondary', id: 'location-button' }, () => {
      if (state.myLocation) {
        state.myLocation = null;
        syncLocation();
        refresh();
      } else {
        void useMyLocation();
      }
    });
    const syncLocation = () => {
      locationButton.textContent = state.myLocation ? 'Stop using my location' : 'Use my location';
    };
    timeInput.addEventListener('change', () => {
      try {
        state.at = parseDatetimeLocal(timeInput.value);
        state.live = false;
        sync();
        refresh();
      } catch {
        status.textContent = 'Enter a valid date and time.';
      }
    });
    const close = button('Done', { class: 'primary' }, () => {
      dialog.hidden = true;
      cityButton.focus();
    });
    dialog.append(h('div', { class: 'settings-panel' },
      h('h2', { id: 'settings-title' }, 'Where and when'),
      h('label', { class: 'field-label', for: 'city-select' }, 'Your city'),
      citySelect,
      locationButton,
      h('p', { class: 'hint' }, 'Your location is used only on this phone to calculate your sky. It is never saved or sent anywhere. Or pick the city you are in.'),
      h('label', { class: 'field-label', for: 'time-input' }, 'Time'),
      timeInput,
      h('div', { class: 'chips' }, shift(-6), shift(-1), shift(1), shift(6)),
      nowButton,
      status,
      close,
    ));
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close.click();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close.click();
    });
    return {
      element: dialog,
      syncLocation,
      open() {
        syncLocation();
        sync();
        dialog.hidden = false;
        citySelect.focus();
      },
    };
  }

  function buildJump() {
    const dialog = h('div', { class: 'settings', id: 'jump', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'jump-title', hidden: true });
    const search = h('input', { id: 'jump-search', type: 'search', placeholder: 'Mars, Orion, ISS, Vega…', autocomplete: 'off', 'aria-label': 'Search for a place in space' });
    const results = h('div', { class: 'jump-results', id: 'jump-results' });
    const close = button('Close', { class: 'secondary' }, () => {
      dialog.hidden = true;
      jumpButton.focus();
    });
    const destinations = (): JumpTarget[] => {
      const sky = state.sky;
      const list: JumpTarget[] = [];
      if (sky) {
        for (const thing of sky.things) list.push({ key: thing.id, name: thing.name, group: jumpGroup(thing), dir: thing.dir, thing });
      }
      state.backdrop ??= computeBackdrop(currentObserver(), state.at);
      for (const item of state.backdrop.constellations) {
        if (item.label) list.push({ key: `con-${item.name}`, name: item.name, group: 'Constellations', dir: item.label });
      }
      return list;
    };
    const render = () => {
      const text = search.value.trim().toLowerCase();
      const all = destinations();
      let picks: JumpTarget[];
      if (!text) {
        const featured = new Set(['Orion', 'Ursa Major', 'Cassiopeia', 'Scorpius', 'Cygnus', 'Leo', 'Southern Cross', 'Crux']);
        picks = all.filter((item) => item.group === 'Sun, Moon & planets' || featured.has(item.name) || ['iss', 'm31', 'sgr-a', 'm42', 'lmc'].some((id) => item.key === id || item.key.endsWith(`-${id}`)) || item.name.startsWith('ISS'));
      } else {
        const rank = (item: JumpTarget) => (item.name.toLowerCase() === text ? 0 : item.name.toLowerCase().startsWith(text) ? 1 : 2) + (item.group === 'Constellations' ? 0 : 0.5);
        picks = all.filter((item) => item.name.toLowerCase().includes(text)).sort((a, b) => rank(a) - rank(b));
        const catalog = catalogIfLoaded();
        if (catalog && picks.length < 12) {
          for (let i = 0; i < catalog.count && picks.length < 12; i += 1) {
            if (!catalog.proper[i] || !catalog.proper[i].toLowerCase().includes(text)) continue;
            if (picks.some((item) => item.name === catalog.proper[i])) continue;
            const thing = catalogThing(i, currentObserver(), state.at);
            if (thing) picks.push({ key: thing.id, name: thing.name, group: 'Stars', dir: thing.dir, thing });
          }
        }
      }
      const groups = new Map<string, JumpTarget[]>();
      for (const item of picks.slice(0, 40)) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
      results.replaceChildren(
        ...(picks.length ? [] : [h('p', { class: 'hint' }, 'Nothing by that name yet. Try a planet, constellation, satellite or star.')]),
        ...[...groups].map(([group, items]) => h('div', { class: 'jump-group' },
          h('h3', {}, group),
          h('div', { class: 'chips' }, ...items.map((item) => {
            const below = item.dir[2] < 0;
            return button(item.name + (below ? ' ↓' : ''), { class: 'chip', title: below ? 'Below your horizon right now' : '' }, () => {
              dialog.hidden = true;
              jumpTo(item);
            });
          })),
        )),
      );
    };
    search.addEventListener('input', render);
    dialog.append(h('div', { class: 'settings-panel jump-panel' },
      h('h2', { id: 'jump-title' }, 'Jump to'),
      h('p', { class: 'hint' }, 'Fly the view anywhere in space, even if it is below your horizon, and see what is nearby. ↓ means it is under your feet right now.'),
      search,
      results,
      h('p', { class: 'hint' }, 'To stand somewhere else on Earth, tap the city at the top.'),
      close,
    ));
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close.click();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close.click();
    });
    return {
      element: dialog,
      open() {
        search.value = '';
        render();
        dialog.hidden = false;
        search.focus();
      },
    };
  }

  function jumpTo(target: JumpTarget) {
    if (state.motion === 'on' || state.motion === 'waiting' || state.motion === 'no-compass') stopMotion('off');
    skyView.lookToward(target.dir, 60);
    const near = (state.sky?.things ?? [])
      .filter((thing) => thing.id !== target.key)
      .map((thing) => ({ thing, deg: (Math.acos(Math.max(-1, Math.min(1, thing.dir[0] * target.dir[0] + thing.dir[1] * target.dir[1] + thing.dir[2] * target.dir[2]))) * 180) / Math.PI }))
      .filter((item) => item.deg < 30)
      .sort((a, b) => a.deg - b.deg)
      .slice(0, 6);
    const where = target.dir[2] < 0 ? ' · below your horizon, so you are seeing it through Earth' : '';
    nearbyBar.replaceChildren(
      h('div', { class: 'nearby-head' },
        h('span', {}, h('strong', {}, `Near ${target.name}`), where),
        button('×', { class: 'nearby-close', 'aria-label': 'Hide nearby' }, () => { nearbyBar.hidden = true; aimChip.classList.remove('quiet'); }),
      ),
      h('div', { class: 'nearby-chips' },
        ...(target.thing ? [button(`About ${target.name}`, { class: 'chip small strong' }, () => select(target.key))] : []),
        ...near.map(({ thing, deg }) => button(`${thing.name} · ${Math.round(deg)}°`, { class: 'chip small' }, () => select(thing.id))),
        ...(near.length ? [] : [h('span', { class: 'hint' }, 'Mostly stars here. Tap any dot to learn about it.')]),
      ),
    );
    nearbyBar.hidden = false;
    aimChip.classList.add('quiet');
  }

  function openSettings() {
    settings.open();
  }

  function refresh() {
    state.backdrop = null;
    state.pathAt = 0;
    state.trackAt = 0;
    recompute();
    paint();
  }

  // ----- Start -----
  recompute();
  setTab(state.tab);
  setMotion('off');
  void loadCatalog().then(() => {
    state.backdrop = null;
    updateNamedStars();
    paint();
  });
  starNames.onChange(() => {
    updateNamedStars();
    if (state.nameSearch) renderNameResults();
  });
  void starNames.refresh();
  const namesTimer = setInterval(() => {
    if (typeof document === 'undefined' || !document.hidden) void starNames.refresh();
  }, 2 * 60 * 1000);
  const stopFresh = keepSatellitesFresh(() => {
    live.textContent = 'Newer satellite data loaded.';
    refresh();
  });
  const ticker = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!state.live && state.tab !== 'sky') return;
    recompute();
    paint();
  }, 1000);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.sheetOpen && settings.element.hidden && jump.element.hidden) closeSheet();
  });

  return {
    select,
    setTab,
    state,
    destroy() {
      clearInterval(ticker);
      clearInterval(namesTimer);
      stopFresh();
      sensor.stop();
    },
  };
}

interface JumpTarget {
  key: string;
  name: string;
  group: string;
  dir: [number, number, number];
  thing?: SkyThing;
}

function jumpGroup(thing: SkyThing): string {
  if (thing.kind === 'sun' || thing.kind === 'moon' || thing.kind === 'planet' || thing.kind === 'dwarf-planet') return 'Sun, Moon & planets';
  if (thing.kind === 'satellite') return 'Satellites';
  if (thing.kind === 'star') return 'Stars';
  return 'Asteroids & galaxies';
}

/** "Facing southwest · 35° up" in plain words, so you always know where you are looking. */
export function describeView(azimuthDeg: number, altitudeDeg: number): string {
  const names = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const facing = names[Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8];
  const alt = Math.round(altitudeDeg);
  if (alt >= 80) return 'Looking straight up';
  if (alt <= -80) return 'Looking straight down at the ground';
  if (Math.abs(alt) <= 3) return `Facing ${facing} · along the horizon`;
  return alt > 0 ? `Facing ${facing} · ${alt}° above the horizon` : `Facing ${facing} · ${-alt}° below the horizon`;
}

function aimSubtitle(thing: SkyThing): string {
  if (thing.satellite) return `${thing.satellite.orbit.orbitClass} · ${ORBIT_LABELS[thing.satellite.orbit.orbitClass].name.toLowerCase()}`;
  if (thing.kind === 'star') return `star in ${thing.star?.constellation}`;
  if (thing.kind === 'asteroid') return thing.small?.body?.neo ? 'near-Earth asteroid' : 'asteroid';
  if (thing.kind === 'dwarf-planet') return 'dwarf planet';
  if (thing.kind === 'deep-sky') return `${thing.deep?.type.toLowerCase()} · ${thing.deep?.catalog}`;
  if (thing.kind === 'planet') return 'planet';
  if (thing.kind === 'moon') return 'Earth’s moon';
  return 'our star';
}

function timeLabel(at: Date): string {
  return at.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
