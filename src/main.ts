import '@fontsource/orbitron/400.css';
import '@fontsource/orbitron/700.css';
import type { GradeBand } from './contracts';
import { cities, type CityId } from './content/cities';
import { places } from './content/places';
import { parseDatetimeLocal, toDatetimeLocalValue } from './sky/time';
import { buildModel, type ConnectionMode, type InterestFilter } from './ui/model';
import { mountApp, setPane } from './ui/render';
import type { SpacePoint } from './ui/space-scene';

const state = {
  cityId: 'la' as CityId,
  grade: '3-5' as GradeBand,
  mode: 'near-me' as ConnectionMode,
  radiusKm: 100,
  interest: 'all' as InterestFilter,
  search: '',
  minElevationDeg: -90,
  selectedTime: new Date(),
  selectedId: 'sun',
  pane: (location.hash === '#earth' ? 'earth' : 'sky') as 'sky' | 'earth',
  spaceOpen: false,
};

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');

let scene: { update(points: SpacePoint[]): void; destroy(): void } | null = null;

function current() {
  return buildModel({
    city: cities[state.cityId],
    atUtc: state.selectedTime,
    mode: state.mode,
    radiusKm: state.radiusKm,
    interest: state.interest,
    grade: state.grade,
    search: state.search,
    minElevationDeg: state.minElevationDeg,
    selectedId: state.selectedId,
    places,
  });
}

function spacePoints(): SpacePoint[] {
  const model = current();
  return model.skyRows.flatMap((row) => {
    if (row.azimuthDeg == null || row.elevationDeg == null) return [];
    return [{
      id: row.id,
      azimuthDeg: row.azimuthDeg,
      elevationDeg: row.elevationDeg,
      kind: row.kind,
      selected: row.id === model.selectedId,
    }];
  });
}

function refresh() {
  const model = current();
  state.mode = model.effectiveMode;
  view.update(model);
  if (scene) scene.update(spacePoints());
}

const view = mountApp(root, {
  cityId: state.cityId,
  grade: state.grade,
  mode: state.mode,
  radiusKm: state.radiusKm,
  interest: state.interest,
  minElevationDeg: state.minElevationDeg,
  selectedTime: state.selectedTime,
  pane: state.pane,
  onCity: (id) => { state.cityId = id; refresh(); },
  onGrade: (grade) => { state.grade = grade; refresh(); },
  onMode: (mode) => { state.mode = mode; refresh(); },
  onRadius: (km) => { state.radiusKm = km; refresh(); },
  onTime: (value) => {
    try {
      state.selectedTime = parseDatetimeLocal(value);
    } catch {
      const input = document.getElementById('when');
      if (input instanceof HTMLInputElement) input.value = toDatetimeLocalValue(state.selectedTime);
    }
    refresh();
  },
  onUseDeviceClock: () => {
    state.selectedTime = new Date();
    const input = document.getElementById('when');
    if (input instanceof HTMLInputElement) input.value = toDatetimeLocalValue(state.selectedTime);
    refresh();
  },
  onSearch: (value) => { state.search = value; refresh(); },
  onInterest: (interest) => { state.interest = interest; refresh(); },
  onSkyArea: (minElevationDeg) => { state.minElevationDeg = minElevationDeg; refresh(); },
  onSelect: (id) => { state.selectedId = id; refresh(); },
  onPane: (pane) => { state.pane = pane; setPane(pane); },
  onToggleSpace: () => { void toggleSpace(); },
});

async function toggleSpace() {
  state.spaceOpen = !state.spaceOpen;
  view.setSpaceOpen(state.spaceOpen);
  if (!state.spaceOpen) {
    scene?.destroy();
    scene = null;
    return;
  }
  const host = view.spaceHost();
  host.replaceChildren();
  const module = await import('./ui/space-scene');
  const mounted = module.mountSpaceScene(host, spacePoints(), (id) => {
    state.selectedId = id;
    refresh();
  });
  if ('error' in mounted) {
    host.textContent = mounted.error;
    return;
  }
  scene = mounted;
}

window.addEventListener('hashchange', () => {
  state.pane = location.hash === '#earth' ? 'earth' : 'sky';
  setPane(state.pane);
});

refresh();
