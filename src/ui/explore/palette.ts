import type { OrbitClass } from '../../sky/orbits';

/** Purple, black, and white. Canvas drawing reads these so it matches the CSS tokens. */
export const THEME = {
  accent: '#b48cff',
  accentSoft: 'rgba(180,140,255,0.6)',
  accentFaint: 'rgba(180,140,255,0.35)',
  white: '#f7f5fc',
  muted: '#b9b3c9',
  skyTop: '#020107',
  skyHorizon: '#140b2e',
  ground: '#07050c',
};

/** Orbit colours always appear with the orbit's name as text, so colour is never the only cue. */
export const ORBIT_COLORS: Record<OrbitClass, string> = {
  LEO: '#f7f5fc',
  MEO: '#c9b3ff',
  GEO: '#9b5cff',
  GSO: '#9b5cff',
  HEO: '#e58cff',
};
