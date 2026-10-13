import '@fontsource/orbitron/400.css';
import '@fontsource/orbitron/700.css';
import { initialState, reduce, screenFromHash, type Action, type ExploreState } from './ui/session';
import { mountApp } from './ui/render';
import type { SpacePoint } from './ui/space-scene';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');

let state: ExploreState = initialState(new Date());
const hashed = screenFromHash(location.hash);
if (hashed) state = { ...state, screen: hashed };

let scene: { update(points: SpacePoint[]): void; destroy(): void } | null = null;
let sceneToken = 0;

function dispatch(action: Action) {
  const next = reduce(state, action);
  if (next === state && action.type !== 'scene-unavailable') return;
  state = next;
  refresh();
}

const view = mountApp(root, state.selectedTime, dispatch);

function refresh() {
  scene?.destroy();
  scene = null;
  const picture = view.update(state);
  history.replaceState(null, '', `#${state.screen}`);
  const host = document.getElementById('space-scene');
  if (!host || state.screen !== 'S03' || state.sceneUnavailable) return;
  const token = ++sceneToken;
  const points: SpacePoint[] = picture.skyRows.flatMap((row) => {
    if (row.azimuthDeg == null || row.elevationDeg == null) return [];
    return [{
      id: row.id,
      azimuthDeg: row.azimuthDeg,
      elevationDeg: row.elevationDeg,
      kind: row.kind,
      selected: row.id === state.selectedSkyId,
    }];
  });
  void import('./ui/space-scene').then(({ mountSpaceScene }) => {
    if (token !== sceneToken || state.screen !== 'S03' || state.sceneUnavailable) return;
    const mounted = mountSpaceScene(host, points, (id) => {
      const row = picture.skyRows.find((item) => item.id === id);
      if (!row) return;
      dispatch({ type: 'select-sky', id, kind: row.kind });
    });
    if ('error' in mounted) {
      dispatch({ type: 'scene-unavailable' });
      return;
    }
    scene = mounted;
  }).catch(() => {
    if (token === sceneToken) dispatch({ type: 'scene-unavailable' });
  });
}

refresh();
