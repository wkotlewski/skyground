import { horizonChartPosition } from '../sky/horizon';
import { safeLink } from '../geo';
import type { GradeBand } from '../contracts';
import { cities, type CityId } from '../content/cities';
import type { AppModel, ConnectionMode, InterestFilter, SkyRow } from './model';
import { toDatetimeLocalValue } from '../sky/time';

export interface MountOptions {
  cityId: CityId;
  grade: GradeBand;
  mode: ConnectionMode;
  radiusKm: number;
  interest: InterestFilter;
  minElevationDeg: number;
  selectedTime: Date;
  pane: 'sky' | 'earth';
  onCity: (id: CityId) => void;
  onGrade: (grade: GradeBand) => void;
  onMode: (mode: ConnectionMode) => void;
  onRadius: (km: number) => void;
  onTime: (value: string) => void;
  onUseDeviceClock: () => void;
  onSearch: (value: string) => void;
  onInterest: (interest: InterestFilter) => void;
  onSkyArea: (minElevationDeg: number) => void;
  onSelect: (id: string) => void;
  onPane: (pane: 'sky' | 'earth') => void;
  onToggleSpace: () => void;
}

const SHELL = `
<a class="skip" href="#sky-list">Skip to sky list</a>
<header>
  <a class="brand" href="#sky">SkyGround</a>
  <p class="tag">Calculated sky · curated places</p>
</header>
<main>
  <section class="intro">
    <p class="eyebrow">Your world is a classroom</p>
    <h1>Explore above.<br><span>Discover below.</span></h1>
    <p>Pick a city, a time, and an interest. Sky directions are calculated. Places are a small reviewed set.</p>
  </section>
  <aside class="notice" id="notice">Sky directions use the selected time. Satellite elements come from a reviewed snapshot, not a live feed. A ground point is not a camera footprint. Above the horizon does not mean an object is visible.</aside>
  <section class="toolbar" aria-label="Exploration settings">
    <label>City observer<select id="city"></select></label>
    <label>Learning level<select id="grade">
      <option value="K-2">K–2</option>
      <option value="3-5" selected>3–5</option>
      <option value="6-8">6–8</option>
      <option value="9-12">9–12</option>
    </select></label>
    <label>Earth connection<select id="mode">
      <option value="near-me">Near the chosen city</option>
      <option value="under-satellite">Beneath the selected satellite</option>
      <option value="related-interest">Related to my interest</option>
    </select></label>
    <label>Earth area radius <output id="radius-label" for="radius"></output><input id="radius" type="range" min="10" max="500" step="10"></label>
  </section>
  <section class="toolbar" aria-label="Time and search">
    <label>Selected time<input id="when" type="datetime-local"></label>
    <button type="button" id="device-clock">Set selected time from this device</button>
    <label>Search names<input id="search" type="search" placeholder="Satellite, planet, or place"></label>
    <label>Sky area<select id="sky-area">
      <option value="-90">All directions</option>
      <option value="0">Above the horizon</option>
      <option value="80">Near overhead (80° and higher)</option>
    </select></label>
  </section>
  <p class="small" id="time-readout"></p>
  <nav id="interests" class="chips" aria-label="Interests">
    <button type="button" data-interest="all" aria-pressed="true">Everything</button>
    <button type="button" data-interest="museums" aria-pressed="false">Museums</button>
    <button type="button" data-interest="colleges" aria-pressed="false">Colleges</button>
    <button type="button" data-interest="history" aria-pressed="false">History</button>
    <button type="button" data-interest="space" aria-pressed="false">Space and science</button>
  </nav>
  <div class="view-tabs" role="tablist" aria-label="Sky or Earth">
    <button type="button" id="tab-sky" role="tab">Sky</button>
    <button type="button" id="tab-earth" role="tab">Earth</button>
  </div>
  <div id="warnings" class="warnings" aria-live="polite"></div>
  <div class="explore">
    <section class="panel pane" id="pane-sky" data-pane="sky">
      <div class="panel-heading"><div><p class="eyebrow">Look up</p><h2>Sky directions</h2></div><span class="small" id="sky-count"></span></div>
      <p class="small" id="snapshot-age"></p>
      <div class="chart-wrap"><svg id="sky-chart" viewBox="0 0 400 400" role="img"></svg></div>
      <p class="small">Circle edge = horizon. Center = straight overhead. North is up. Azimuth increases toward the east.</p>
      <button type="button" id="space-toggle">Open 3D sky</button>
      <div id="space-host" hidden></div>
      <p class="legend">In the 3D view, an octahedron is a satellite and a sphere is the Sun, Moon, or a planet. The gold tick is north. Marker size is not distance or brightness.</p>
      <div id="sky-list" aria-live="polite"></div>
    </section>
    <section class="panel pane" id="pane-earth" data-pane="earth">
      <div class="panel-heading"><div><p class="eyebrow">Look around</p><h2>Earth connections</h2></div><span class="small" id="place-count"></span></div>
      <p class="small" id="anchor-label"></p>
      <div class="chart-wrap"><svg id="earth-chart" viewBox="0 0 600 320" role="img" aria-label="Schematic chart of curated places around the search center"></svg><span class="map-label">Schematic · not for navigation</span></div>
      <p class="small">Outlined circles are curated places. A filled mark is the search center. A square is the city when the search center is a satellite ground point.</p>
      <p class="small" id="connection"></p>
      <p class="small" id="coverage"></p>
      <div id="place-list" class="places" aria-live="polite"></div>
    </section>
  </div>
  <section class="bottom">
    <article class="panel">
      <p class="eyebrow">Selected object</p>
      <h2 id="object-name"></h2>
      <ul id="object-detail"></ul>
      <p id="mission" class="mission"></p>
    </article>
    <article class="panel">
      <p class="eyebrow">Credits</p>
      <h2>Sources</h2>
      <ul class="credits">
        <li>Planet, Sun, and Moon directions: Astronomy Engine (MIT), calculated on this device.</li>
        <li>Satellite positions: satellite.js (MIT) using a reviewed CelesTrak GP snapshot. This page does not contact CelesTrak.</li>
        <li>Headings use Orbitron (SIL Open Font License).</li>
        <li>3D sky uses Three.js (MIT) after you open it. Directions come from the calculations above.</li>
        <li>Place cards link to official sites. This app does not copy their articles.</li>
      </ul>
      <a href="https://celestrak.org/usage-policy.php" target="_blank" rel="noopener noreferrer">CelesTrak usage policy</a>
    </article>
  </section>
  <footer>No accounts, ads, or location storage. Precise phone location stays off. City choice is the observer.</footer>
</main>`;

export function mountApp(root: HTMLElement, options: MountOptions): { update(model: AppModel): void; spaceHost(): HTMLElement; setSpaceOpen(open: boolean): void } {
  root.innerHTML = SHELL;
  const city = must<HTMLSelectElement>('city');
  for (const entry of Object.values(cities)) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    city.append(option);
  }
  city.value = options.cityId;
  must<HTMLSelectElement>('grade').value = options.grade;
  must<HTMLSelectElement>('mode').value = options.mode;
  const radius = must<HTMLInputElement>('radius');
  radius.value = String(options.radiusKm);
  must<HTMLInputElement>('when').value = toDatetimeLocalValue(options.selectedTime);
  must<HTMLSelectElement>('sky-area').value = String(options.minElevationDeg);
  city.addEventListener('change', () => options.onCity(city.value as CityId));
  must<HTMLSelectElement>('grade').addEventListener('change', () => options.onGrade(must<HTMLSelectElement>('grade').value as GradeBand));
  must<HTMLSelectElement>('mode').addEventListener('change', () => options.onMode(must<HTMLSelectElement>('mode').value as ConnectionMode));
  radius.addEventListener('input', () => options.onRadius(Number(radius.value)));
  must<HTMLInputElement>('when').addEventListener('change', () => options.onTime(must<HTMLInputElement>('when').value));
  must<HTMLButtonElement>('device-clock').addEventListener('click', options.onUseDeviceClock);
  must<HTMLInputElement>('search').addEventListener('input', () => options.onSearch(must<HTMLInputElement>('search').value));
  must<HTMLSelectElement>('sky-area').addEventListener('change', () => options.onSkyArea(Number(must<HTMLSelectElement>('sky-area').value)));
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-interest]')) {
    button.addEventListener('click', () => options.onInterest(button.dataset.interest as InterestFilter));
  }
  must<HTMLButtonElement>('tab-sky').addEventListener('click', () => options.onPane('sky'));
  must<HTMLButtonElement>('tab-earth').addEventListener('click', () => options.onPane('earth'));
  must<HTMLButtonElement>('space-toggle').addEventListener('click', options.onToggleSpace);
  root.addEventListener('sky-select', (event) => {
    const id = (event as CustomEvent<string>).detail;
    if (id) options.onSelect(id);
  });
  setPane(options.pane);
  return {
    update(model) {
      paint(model);
    },
    spaceHost: () => must('space-host'),
    setSpaceOpen(open) {
      const host = must('space-host');
      host.hidden = !open;
      must<HTMLButtonElement>('space-toggle').textContent = open ? 'Close 3D sky' : 'Open 3D sky';
    },
  };
}

export function setPane(pane: 'sky' | 'earth'): void {
  document.getElementById('pane-sky')?.classList.toggle('is-active', pane === 'sky');
  document.getElementById('pane-earth')?.classList.toggle('is-active', pane === 'earth');
  const skyTab = document.getElementById('tab-sky');
  const earthTab = document.getElementById('tab-earth');
  skyTab?.setAttribute('aria-selected', String(pane === 'sky'));
  earthTab?.setAttribute('aria-selected', String(pane === 'earth'));
  if (location.hash !== `#${pane}`) history.replaceState(null, '', `#${pane}`);
}

function paint(model: AppModel): void {
  const mode = must<HTMLSelectElement>('mode');
  const under = mode.querySelector('option[value="under-satellite"]') as HTMLOptionElement;
  under.disabled = !model.satelliteAnchorAllowed;
  if (mode.value !== model.effectiveMode) mode.value = model.effectiveMode;
  must('radius-label').textContent = `${must<HTMLInputElement>('radius').value} km`;
  must('time-readout').textContent = `${model.timeHeading}: ${model.timeLocal} (${model.timeUtc})`;
  must('snapshot-age').textContent = `Satellite snapshot fetched ${model.snapshotFetchedAtUtc}. Ages are measured from each element epoch to the selected time.`;
  must('sky-count').textContent = `${model.skyRows.length} shown`;
  must('anchor-label').textContent = model.anchorLabel;
  must('connection').textContent = model.connection;
  must('coverage').textContent = model.coverageNote;
  must('place-count').textContent = `${model.places.length} curated places`;
  const warnings = must('warnings');
  warnings.replaceChildren();
  for (const warning of model.warnings) warnings.append(textEl('p', warning));
  drawSky(model.skyRows, model.selectedId);
  drawSkyList(model);
  drawEarth(model);
  must('object-name').textContent = model.selectedName;
  const detail = must('object-detail');
  detail.replaceChildren();
  for (const line of model.selectedDetail) detail.append(textEl('li', line));
  must('mission').textContent = model.mission;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-interest]')) {
    button.setAttribute('aria-pressed', String(button.dataset.interest === model.interest));
  }
}

function drawSky(rows: SkyRow[], selectedId: string): void {
  const svg = mustSvg('sky-chart');
  svg.replaceChildren();
  svg.setAttribute('aria-label', 'Horizon chart of calculated sky directions. North is up. The list below has the same objects.');
  svg.append(circle(200, 200, 155, 'rim'));
  svg.append(circle(200, 200, 78, 'guide'));
  svg.append(path('M45 200H355M200 45V355', 'guide'));
  for (const [label, x, y] of [['N', 200, 28], ['E', 372, 204], ['S', 200, 386], ['W', 28, 204]] as const) {
    svg.append(svgText(label, x, y));
  }
  rows.forEach((row, index) => {
    if (row.azimuthDeg == null || row.elevationDeg == null) return;
    const point = horizonChartPosition(row.azimuthDeg, row.elevationDeg);
    if (!point) return;
    const marker = circle(point.x, point.y, row.id === selectedId ? 9 : 5, row.kind === 'satellite' ? 'sat' : 'body');
    svg.append(marker);
    svg.append(svgText(row.name, point.x, point.y + 18 + (index % 3) * 11));
  });
}

function drawSkyList(model: AppModel): void {
  const list = must('sky-list');
  list.replaceChildren();
  const above = model.skyRows.filter((row) => (row.elevationDeg ?? -1) > 0);
  const below = model.skyRows.filter((row) => row.elevationDeg != null && row.elevationDeg <= 0);
  const hidden = model.skyRows.filter((row) => row.status === 'unavailable');
  list.append(sectionList('Above the horizon', above, model.selectedId));
  list.append(sectionList('On or below the horizon', below, model.selectedId));
  list.append(sectionList('Position not shown', hidden, model.selectedId));
}

function sectionList(title: string, rows: SkyRow[], selectedId: string): HTMLElement {
  const wrap = document.createElement('section');
  wrap.append(textEl('h3', title));
  if (!rows.length) {
    wrap.append(textEl('p', 'None in this filter.', 'small'));
    return wrap;
  }
  for (const row of rows) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sky-choice';
    button.setAttribute('aria-pressed', String(row.id === selectedId));
    const bits = [row.name, row.horizonLabel];
    if (row.azimuthDeg != null && row.elevationDeg != null) bits.push(`azimuth ${row.azimuthDeg.toFixed(0)}°`, `elevation ${row.elevationDeg.toFixed(0)}°`);
    if (row.freshness) bits.push(row.freshness);
    if (row.unavailableReason) bits.push(row.unavailableReason);
    button.textContent = bits.join(' · ');
    button.addEventListener('click', () => button.dispatchEvent(new CustomEvent('sky-select', { bubbles: true, detail: row.id })));
    wrap.append(button);
  }
  return wrap;
}

function project(lat: number, lon: number, anchor: { lat: number; lon: number }, radiusKm: number): { x: number; y: number } | null {
  const latSpan = Math.max(radiusKm, 1) / 111;
  const lonSpan = latSpan / Math.max(0.2, Math.cos((anchor.lat * Math.PI) / 180));
  const x = 300 + ((lon - anchor.lon) / lonSpan) * 240;
  const y = 160 - ((lat - anchor.lat) / latSpan) * 120;
  if (x < 16 || x > 584 || y < 16 || y > 304) return null;
  return { x, y };
}

function drawEarth(model: AppModel): void {
  const svg = mustSvg('earth-chart');
  svg.replaceChildren();
  for (let x = 0; x <= 600; x += 60) svg.append(path(`M${x} 0V320`, 'grid'));
  for (let y = 0; y <= 320; y += 40) svg.append(path(`M0 ${y}H600`, 'grid'));
  const center = project(model.anchor.lat, model.anchor.lon, model.anchor, model.radiusKm) ?? { x: 300, y: 160 };
  svg.append(circle(center.x, center.y, 8, model.anchorKind === 'subpoint' ? 'subpoint' : 'center'));
  svg.append(svgText(model.anchorKind === 'subpoint' ? 'Ground point' : 'City', center.x + 36, center.y - 10));
  if (model.anchorKind === 'subpoint') {
    const city = project(model.observer.lat, model.observer.lon, model.anchor, model.radiusKm);
    if (city) {
      const mark = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      mark.setAttribute('x', String(city.x - 6));
      mark.setAttribute('y', String(city.y - 6));
      mark.setAttribute('width', '12');
      mark.setAttribute('height', '12');
      mark.dataset.kind = 'observer';
      svg.append(mark);
      svg.append(svgText('City', city.x, city.y - 12));
    }
  }
  model.places.forEach((place, index) => {
    const point = project(place.lat, place.lon, model.anchor, model.radiusKm);
    if (!point) return;
    svg.append(circle(point.x, point.y, 12, 'place'));
    svg.append(svgText(String(index + 1), point.x, point.y + 4));
  });
  const list = must('place-list');
  list.replaceChildren();
  model.places.forEach((place, index) => {
    const card = document.createElement('article');
    card.className = 'place';
    card.append(textEl('h3', `${index + 1}. ${place.name}`));
    card.append(textEl('p', `${place.distanceKm.toFixed(1)} km from the search center · ${place.categories}`));
    card.append(textEl('p', place.locationNote));
    card.append(textEl('p', place.prompt));
    const href = safeLink(place.url);
    if (href) {
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Official site, with a grown-up';
      card.append(link);
    }
    list.append(card);
  });
}

function circle(cx: number, cy: number, r: number, kind: string): SVGCircleElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  node.setAttribute('cx', String(cx));
  node.setAttribute('cy', String(cy));
  node.setAttribute('r', String(r));
  node.dataset.kind = kind;
  return node;
}

function path(d: string, kind: string): SVGPathElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  node.setAttribute('d', d);
  node.dataset.kind = kind;
  return node;
}

function svgText(value: string, x: number, y: number): SVGTextElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  node.setAttribute('x', String(x));
  node.setAttribute('y', String(y));
  node.setAttribute('text-anchor', 'middle');
  node.textContent = value;
  return node;
}

function textEl(tag: string, text: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function must<T extends HTMLElement | SVGElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

function mustSvg(id: string): SVGSVGElement {
  return must<SVGSVGElement>(id);
}

export function panesForWidth(width: number, pane: 'sky' | 'earth'): { sky: boolean; earth: boolean } {
  if (width >= 801) return { sky: true, earth: true };
  return pane === 'earth' ? { sky: false, earth: true } : { sky: true, earth: false };
}
