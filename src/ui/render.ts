import type { GradeBand } from '../contracts';
import type { CityId } from '../content/cities';
import { earthRegions, skyRegions } from '../content/regions';
import { safeLink } from '../geo';
import { landPath, projectLonLat, WORLD_SOURCE } from '../content/world';
import {
  project,
  type Action,
  type ConnectionOrigin,
  type ContentTab,
  type ExploreState,
  type ExploreView,
  type RecoveryId,
  type ScreenId,
  type SkyFilter,
} from './session';
import type { ConnectionMode, InterestFilter } from './model';

const GRADES: Array<[GradeBand, string]> = [
  ['K-2', 'K–2'],
  ['3-5', 'Grades 3–5'],
  ['6-8', 'Grades 6–8'],
  ['9-12', 'Grades 9–12'],
];

const INTERESTS: Array<[InterestFilter, string]> = [
  ['all', 'All interests'],
  ['museums', 'Museums'],
  ['colleges', 'Colleges'],
  ['history', 'History'],
  ['space', 'Space and science'],
];

const RECOVERIES: Array<[RecoveryId, string]> = [
  ['empty', 'No matching results'],
  ['stale', 'Old orbital data'],
  ['webgl', '3D not available'],
  ['location', 'Location permission declined'],
  ['offline', 'Offline or provider unavailable'],
  ['below', 'Nothing above the horizon'],
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string> = {},
  ...children: Array<Node | string | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

function button(label: string, props: Record<string, string>, extra?: string): HTMLButtonElement {
  const node = el('button', { type: 'button', ...props }, label);
  if (extra) node.append(el('small', {}, extra));
  return node;
}

function skyButtons(view: ExploreView): HTMLElement {
  const list = el('div', { class: 'results', id: 'sky-list' });
  if (!view.skyRows.length) {
    list.append(el('p', { class: 'note' }, 'No sky objects match. Clear the search or choose another sky area.'), button('Open recovery', { 'data-action': 'go', 'data-screen': 'S16' }));
  }
  for (const row of view.skyRows) {
    const detail = row.status === 'unavailable'
      ? 'Position not shown'
      : `${row.horizonLabel} · azimuth ${row.azimuthDeg?.toFixed(1)}° · elevation ${row.elevationDeg?.toFixed(1)}°`;
    const node = button(row.name, {
      class: 'result',
      'data-action': 'select-sky',
      'data-id': row.id,
      'data-kind': row.kind,
    }, `${row.kind} · ${detail}${row.freshness === 'stale' ? ' · stale elements' : ''}`);
    list.append(node);
  }
  return list;
}

function placeButtons(view: ExploreView): HTMLElement {
  const list = el('div', { class: 'results', id: 'place-list' });
  if (!view.places.length) {
    list.append(
      el('p', { class: 'note' }, 'No curated places match. Widen the radius, change the interest, or pick the other city.'),
      button('Change criteria', { 'data-action': 'go', 'data-screen': 'S08' }),
    );
  }
  for (const place of view.places) {
    list.append(button(place.name, {
      class: 'result',
      'data-action': 'choose-place',
      'data-id': place.id,
    }, `${place.categories} · ${view.placeReasons[place.id] ?? ''}`));
  }
  return list;
}

function map(view: ExploreView): HTMLElement {
  const frame = el('div', { class: 'map', id: 'earth-map' });
  if (!view.landEnabled) {
    frame.append(el('p', {}, 'World basemap is not connected.'));
    return frame;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 360 180');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Natural Earth land. Place buttons sit on this map.');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', landPath());
  path.setAttribute('data-kind', 'land');
  svg.append(path);
  frame.append(svg);
  const mark = (lat: number, lon: number, className: string, label: string) => {
    const point = projectLonLat(lon, lat);
    const node = el('span', { class: className, title: label });
    node.style.left = `${(point.x / 360) * 100}%`;
    node.style.top = `${(point.y / 180) * 100}%`;
    node.setAttribute('aria-hidden', 'true');
    return node;
  };
  frame.append(mark(view.anchor.lat, view.anchor.lon, view.anchorKind === 'subpoint' ? 'mark subpoint' : 'mark observer', view.anchorKind === 'subpoint' ? 'Satellite ground point' : 'Observer'));
  for (const place of view.places) {
    const point = projectLonLat(place.lon, place.lat);
    const hit = button(place.name, {
      class: 'map-hit',
      'data-action': 'choose-place',
      'data-id': place.id,
      'data-kind': 'place',
    });
    hit.style.left = `${(point.x / 360) * 100}%`;
    hit.style.top = `${(point.y / 180) * 100}%`;
    frame.append(hit);
  }
  frame.append(el('p', { class: 'note' }, `${WORLD_SOURCE.name}. ${WORLD_SOURCE.license}. Outlined marks are places. The filled mark is the search center.`));
  return frame;
}

function screenBody(view: ExploreView): HTMLElement {
  const body = el('div', { class: 'screen', id: 'screen-body' });
  body.append(el('p', { class: 'eyebrow' }, view.eyebrow), el('h1', {}, view.title), el('p', {}, view.lede));
  switch (view.screen) {
    case 'S01':
      body.append(
        button('Start on Earth', { class: 'option', 'data-action': 'go', 'data-screen': 'S02' }, 'Search a place'),
        button('Start in space', { class: 'option', 'data-action': 'go', 'data-screen': 'S03' }, 'Explore space'),
        button('Start with an area', { class: 'option', 'data-action': 'go', 'data-screen': 'S07' }, 'Select a region'),
        el('p', { class: 'note' }, 'A chosen city works without phone location.'),
      );
      break;
    case 'S02':
      body.append(
        field('Search a location or category', 'search', 'ground-search', 'ground-query', view.groundQuery),
        el('div', { class: 'chips' },
          button('Locations', { 'data-action': 'browse-interest', 'data-interest': 'all', 'data-screen': 'S09' }),
          button('Museums', { 'data-action': 'browse-interest', 'data-interest': 'museums', 'data-screen': 'S10' }),
          button('Colleges', { 'data-action': 'browse-interest', 'data-interest': 'colleges', 'data-screen': 'S10' }),
        ),
        groundList(view),
        button('Select on the world map', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S11' }),
      );
      break;
    case 'S03':
      body.append(sceneChrome(view), el('div', { id: 'space-scene', class: 'scene-host' }));
      if (view.sceneUnavailable) {
        body.append(el('p', { class: 'note' }, '3D sky needs WebGL. The list still has every calculated direction.'), button('Use the space list', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S04' }));
      }
      body.append(el('p', { class: 'note' }, 'Calculated directions. Drag the scene to look around. The list is the accessible way to choose.'), skyButtons(view), button('Select a sky region', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S07' }));
      break;
    case 'S04':
      body.append(
        field('Search objects', 'search', 'sky-search', 'sky-query', view.skyQuery),
        toggle('3D scene', 'S03', 'List', 'S04', false),
        skyButtons(view),
      );
      break;
    case 'S05':
    case 'S06':
      body.append(objectDetail(view));
      break;
    case 'S07':
      body.append(
        toggle('Sky area', 'S07', 'Earth area', 'S11', true),
        selectField('Region', 'sky-region', 'sky-region', view.skyRegionId, skyRegions.map((region) => [region.id, region.label])),
        el('p', {}, `${view.skyRows.length} objects in this angular region.`),
        skyButtons(view),
        button('Connect this area', { class: 'primary', 'data-action': 'open-connection', 'data-origin': 'sky-area' }),
        button('Clear area', { class: 'ghost', 'data-action': 'clear-sky-region' }),
      );
      break;
    case 'S08':
      body.append(connectionSheet(view));
      break;
    case 'S09':
      body.append(
        toggle('World map', 'S09', 'List', 'S10', true),
        interestChips(view),
        map(view),
        el('p', {}, view.connection),
        placeButtons(view),
        button('Select a ground area', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S11' }),
        button('See this location’s sky', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S03' }),
      );
      break;
    case 'S10':
      body.append(
        field('Search these results', 'search', 'place-search', 'place-query', view.placeQuery),
        toggle('World map', 'S09', 'List', 'S10', false),
        interestChips(view),
        placeButtons(view),
        button('Change connection', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S08' }),
      );
      break;
    case 'S11':
      body.append(
        toggle('Sky area', 'S07', 'Earth area', 'S11', false),
        selectField('Choose region', 'earth-region', 'earth-region', view.earthRegionId, earthRegions.map((region) => [region.id, region.label])),
        el('p', {}, `Representative observer: ${view.regionObserverName}. Confirm it before calculating the sky.`),
        button(`Use ${view.regionObserverName} as the sky observer`, { class: 'primary', 'data-action': 'use-region-observer' }),
        button('Browse places in this area', { class: 'secondary', 'data-action': 'browse-region' }),
      );
      break;
    case 'S12':
      body.append(placeDetail(view));
      break;
    case 'S13':
      body.append(contentTabs(view), button('Inspect sources and credits', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S15' }), button('Make your own connection', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S14' }));
      break;
    case 'S14':
      body.append(
        el('p', { class: 'eyebrow' }, `Guided learning / ${GRADES.find(([id]) => id === view.grade)?.[1] ?? view.grade}`),
        el('ol', { class: 'steps' }, ...view.activitySteps.map((step) => el('li', {}, step))),
        button('Ready to share my idea', { class: 'primary', 'data-action': 'complete-activity', id: 'complete-activity' }),
        view.activityReady ? el('p', { id: 'activity-feedback' }, 'Ready to discuss in person. Nothing is uploaded or saved.') : el('p', { id: 'activity-feedback', class: 'note' }, 'No student answer is stored.'),
        button('Start a new exploration', { class: 'secondary', 'data-action': 'new-exploration' }),
        button('Inspect activity evidence', { class: 'ghost', 'data-action': 'go', 'data-screen': 'S15' }),
      );
      break;
    case 'S15': {
      const links = [
        button(view.returnLabel, { class: 'primary', 'data-action': 'go', 'data-screen': view.sourceReturn }),
      ];
      if (view.selectedPlace) links.push(button('Open the selected place', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S12' }));
      if (view.selectedSky) links.push(button('Open the selected object', { class: 'secondary', 'data-action': 'go', 'data-screen': view.selectedSky.kind === 'satellite' ? 'S05' : 'S06' }));
      body.append(el('ul', { class: 'sources' }, ...view.sourceLines.map((line) => el('li', {}, line))), ...links);
      break;
    }
    case 'S16':
      body.append(
        selectField('State', 'recovery', 'recovery', view.recoveryId, RECOVERIES),
        button('Change criteria', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S08' }),
        button('Use the space list', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S04' }),
        button('Choose a city', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S02' }),
        button('Change the selected time', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S03' }),
      );
      break;
    default:
      break;
  }
  return body;
}

function field(label: string, type: string, id: string, action: string, value: string): HTMLElement {
  const input = el('input', { id, type, 'data-action': action });
  if (type === 'search') input.setAttribute('autocomplete', 'off');
  input.value = value;
  return el('label', { class: 'field', for: id }, label, input);
}

function groundList(view: ExploreView): HTMLElement {
  const list = el('div', { class: 'results', id: 'ground-results' });
  if (!view.groundHits.length) {
    list.append(el('p', { class: 'note' }, 'No records match. Try another name, or choose an area.'));
  }
  for (const hit of view.groundHits) {
    const props: Record<string, string> = { class: 'result', 'data-action': hit.action, 'data-id': hit.cityId ?? hit.id };
    list.append(button(hit.name, props, hit.detail));
  }
  return list;
}

function toggle(first: string, firstScreen: ScreenId, second: string, secondScreen: ScreenId, firstOn: boolean): HTMLElement {
  return el('div', { class: 'toggle', role: 'group' },
    button(first, { 'data-action': 'go', 'data-screen': firstScreen, 'aria-pressed': String(firstOn) }),
    button(second, { 'data-action': 'go', 'data-screen': secondScreen, 'aria-pressed': String(!firstOn) }),
  );
}

function selectField(label: string, id: string, action: string, value: string, options: Array<[string, string]>): HTMLElement {
  const select = el('select', { id, 'data-action': action });
  for (const [optionValue, text] of options) {
    const option = el('option', { value: optionValue }, text);
    if (optionValue === value) option.selected = true;
    select.append(option);
  }
  return el('label', { class: 'field', for: id }, label, select);
}

function sceneChrome(view: ExploreView): HTMLElement {
  return el('div', {},
    el('p', { class: 'badge' }, view.statusLabel),
    toggle('3D scene', 'S03', 'List', 'S04', true),
    el('div', { class: 'chips' },
      filterChip('All', 'all', view.skyFilter),
      filterChip('Satellites', 'satellites', view.skyFilter),
      filterChip('Sun, Moon, and planets', 'sky-bodies', view.skyFilter),
    ),
  );
}

function filterChip(label: string, filter: SkyFilter, current: SkyFilter): HTMLButtonElement {
  return button(label, { 'data-action': 'sky-filter', 'data-filter': filter, 'aria-pressed': String(filter === current) });
}

function objectDetail(view: ExploreView): HTMLElement {
  const sky = view.selectedSky;
  const wrap = el('div', {});
  if (!sky) {
    wrap.append(el('p', {}, 'Choose an object from the list.'), button('Open the space list', { 'data-action': 'go', 'data-screen': 'S04' }));
    return wrap;
  }
  wrap.append(el('p', { class: 'badge' }, view.statusLabel));
  for (const line of sky.detail) wrap.append(el('p', {}, line));
  for (const line of view.factLines) wrap.append(el('p', {}, line));
  if (view.screen === 'S05') {
    wrap.append(button('Connect to Earth', { class: 'primary', 'data-action': 'open-connection', 'data-origin': 'satellite' }));
  } else {
    wrap.append(button('Find related places', { class: 'primary', 'data-action': 'open-connection', 'data-origin': 'planet' }));
  }
  wrap.append(button('Inspect data and sources', { class: 'ghost', 'data-action': 'go', 'data-screen': 'S15' }));
  return wrap;
}

function connectionSheet(view: ExploreView): HTMLElement {
  const wrap = el('div', { id: 'connection-sheet' });
  for (const choice of view.choices) {
    const node = button(choice.label, {
      class: 'option',
      'data-action': 'relation',
      'data-relation': choice.id,
      'aria-pressed': String(choice.pressed),
    }, choice.detail);
    if (choice.disabled) node.disabled = true;
    wrap.append(node);
    if (choice.disabled && choice.reason) wrap.append(el('p', { class: 'note' }, choice.reason));
  }
  const interest = selectField('I’m interested in', 'interest', 'interest', view.interest, INTERESTS);
  wrap.append(interest);
  if (!view.radiusHidden) {
    const range = el('input', { id: 'radius', type: 'range', min: '25', max: '500', step: '25', 'data-action': 'radius' });
    range.value = String(view.radiusKm);
    wrap.append(el('label', { class: 'field', for: 'radius' }, `Search radius ${view.radiusKm} km`, range));
  }
  wrap.append(el('p', {}, view.connection), button('Explore connected places', { class: 'primary', 'data-action': 'apply-connection' }));
  return wrap;
}

function interestChips(view: ExploreView): HTMLElement {
  const row = el('div', { class: 'chips' });
  for (const [id, label] of INTERESTS) {
    row.append(button(label, { 'data-action': 'interest', 'data-interest': id, 'aria-pressed': String(view.interest === id) }));
  }
  return row;
}

function placeDetail(view: ExploreView): HTMLElement {
  const place = view.selectedPlace;
  const wrap = el('div', {});
  if (!place) {
    wrap.append(el('p', {}, 'Choose a place from the map or the list.'), button('Open the place list', { 'data-action': 'go', 'data-screen': 'S10' }));
    return wrap;
  }
  wrap.append(
    el('p', {}, place.categories.join(' / ')),
    el('p', {}, view.placeReasons[place.id] ?? view.connection),
    el('p', {}, place.locationNote),
    el('p', {}, place.prompt),
  );
  const href = safeLink(place.url);
  if (href) {
    const link = el('a', { href, rel: 'noreferrer' }, `Official page: ${place.source.organization}`);
    wrap.append(link);
  }
  wrap.append(
    button('Open media and stories', { class: 'primary', 'data-action': 'go', 'data-screen': 'S13' }),
    button('See the sky here', { class: 'secondary', 'data-action': 'use-place-observer' }, 'Use this place as the sky observer'),
    button('Try a learning activity', { class: 'secondary', 'data-action': 'go', 'data-screen': 'S14' }),
    button('View sources', { class: 'ghost', 'data-action': 'go', 'data-screen': 'S15' }),
  );
  return wrap;
}

function contentTabs(view: ExploreView): HTMLElement {
  const copy: Record<ContentTab, string> = {
    media: 'No reviewed photo or video is available. An asset needs a creator, source, rights, and grade review before it can appear.',
    history: 'No reviewed event is attached. A historic event is not inferred from being near a place.',
    news: 'No reviewed news story is attached. Headlines stay hidden until a publisher, publication date, and grade review exist.',
  };
  return el('div', {},
    el('div', { class: 'toggle', role: 'group' },
      tabButton('Media', 'media', view.contentTab),
      tabButton('History', 'history', view.contentTab),
      tabButton('News', 'news', view.contentTab),
    ),
    el('p', { id: 'content-panel' }, copy[view.contentTab]),
  );
}

function tabButton(label: string, tab: ContentTab, current: ContentTab): HTMLButtonElement {
  return button(label, { 'data-action': 'content-tab', 'data-tab': tab, 'aria-pressed': String(tab === current) });
}

function context(view: ExploreView, grade: GradeBand): HTMLElement {
  const time = el('input', { id: 'selected-time', type: 'datetime-local', 'data-action': 'time' });
  time.value = view.timeValue;
  const gradeSelect = el('select', { id: 'grade', 'data-action': 'grade' });
  for (const [value, label] of GRADES) {
    const option = el('option', { value }, label);
    if (value === grade) option.selected = true;
    gradeSelect.append(option);
  }
  return el('section', { class: 'context', 'aria-label': 'Observer and time' },
    el('p', {}, view.timeHeading),
    el('p', {}, `${view.timeUtc} · ${view.timeLocal}`),
    el('label', { class: 'field', for: 'selected-time' }, 'Change the selected time', time),
    button('Use the device clock', { 'data-action': 'device-clock' }),
    el('p', {}, `Observer: ${view.observerName}`),
    el('p', { class: 'note' }, view.observerNote),
    el('label', { class: 'field', for: 'grade' }, 'Learning level', gradeSelect),
    el('p', { class: 'note' }, view.coverageNote),
  );
}

function paint(root: HTMLElement, view: ExploreView): void {
  const screen = el('div', { class: 'shell' });
  const header = el('header', { class: 'top' },
    view.canBack ? button('Back', { 'data-action': 'back' }) : el('p', { class: 'brand' }, 'SkyGround'),
    el('div', { class: 'toggle', role: 'group', 'aria-label': 'Space or Earth' },
      button('Space', { 'data-action': 'go', 'data-screen': 'S03', 'aria-pressed': String(view.screen === 'S03' || view.screen === 'S04') }),
      button('Earth', { 'data-action': 'go', 'data-screen': 'S09', 'aria-pressed': String(view.screen === 'S09' || view.screen === 'S10') }),
    ),
  );
  screen.append(header, context(view, view.grade), screenBody(view));
  root.replaceChildren(screen);
}

function actionFrom(target: HTMLElement): Action | null {
  const name = target.dataset.action;
  if (!name) return null;
  switch (name) {
    case 'go':
      return { type: 'go', screen: target.dataset.screen as ScreenId };
    case 'back':
      return { type: 'back' };
    case 'choose-city':
      return { type: 'choose-city', id: target.dataset.id as CityId };
    case 'choose-place':
      return { type: 'choose-place', id: target.dataset.id ?? '' };
    case 'select-sky':
      return { type: 'select-sky', id: target.dataset.id ?? '', kind: target.dataset.kind as 'satellite' | 'planet' | 'moon' | 'sun' };
    case 'sky-filter':
      return { type: 'sky-filter', filter: target.dataset.filter as SkyFilter };
    case 'relation':
      return { type: 'relation', relation: target.dataset.relation as ConnectionMode };
    case 'open-connection':
      return { type: 'open-connection', origin: target.dataset.origin as ConnectionOrigin };
    case 'apply-connection':
      return { type: 'apply-connection' };
    case 'use-place-observer':
      return { type: 'use-place-observer' };
    case 'use-region-observer':
      return { type: 'use-region-observer' };
    case 'browse-region':
      return { type: 'browse-region' };
    case 'clear-sky-region':
      return { type: 'clear-sky-region' };
    case 'complete-activity':
      return { type: 'complete-activity' };
    case 'new-exploration':
      return { type: 'new-exploration' };
    case 'content-tab':
      return { type: 'content-tab', tab: target.dataset.tab as ContentTab };
    case 'browse-interest':
      return { type: 'browse-interest', interest: target.dataset.interest as InterestFilter, screen: target.dataset.screen as ScreenId };
    case 'device-clock':
      return { type: 'device-clock', now: new Date() };
    case 'interest':
      return { type: 'interest', interest: target.dataset.interest as InterestFilter };
    default:
      return null;
  }
}

export function mountApp(root: HTMLElement, selectedTime: Date, dispatch: (action: Action) => void): { update(state: ExploreState): ExploreView } {
  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
    if (!target || (target instanceof HTMLButtonElement && target.disabled)) return;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return;
    const action = actionFrom(target);
    if (action) dispatch(action);
  });
  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.action === 'ground-query') dispatch({ type: 'ground-query', query: target.value });
    if (target.dataset.action === 'sky-query') dispatch({ type: 'sky-query', query: target.value });
    if (target.dataset.action === 'place-query') dispatch({ type: 'place-query', query: target.value });
    if (target.dataset.action === 'radius') dispatch({ type: 'radius', km: Number(target.value) });
    if (target.dataset.action === 'time') dispatch({ type: 'time', value: target.value });
  });
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.dataset.action === 'grade') dispatch({ type: 'grade', grade: target.value as GradeBand });
    if (target.dataset.action === 'sky-region') dispatch({ type: 'sky-region', id: target.value });
    if (target.dataset.action === 'earth-region') dispatch({ type: 'earth-region', id: target.value });
    if (target.dataset.action === 'interest') dispatch({ type: 'interest', interest: target.value as InterestFilter });
    if (target.dataset.action === 'recovery') dispatch({ type: 'recovery', id: target.value as RecoveryId });
  });
  void selectedTime;
  return {
    update(next) {
      const view = project(next);
      const active = document.activeElement;
      const activeId = active instanceof HTMLElement ? active.id : '';
      const selectionStart = active instanceof HTMLInputElement ? active.selectionStart : null;
      paint(root, view);
      if (activeId) {
        const again = document.getElementById(activeId);
        if (again instanceof HTMLElement) {
          again.focus();
          if (again instanceof HTMLInputElement && selectionStart != null) again.setSelectionRange(selectionStart, selectionStart);
        }
      }
      return view;
    },
  };
}
