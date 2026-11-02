import type { OrbitClass } from '../../sky/orbits';

/**
 * Black and white, with a small hint of an aurora gradient (purple → blue → green).
 * Canvas drawing reads these so it matches the CSS tokens.
 */
export const AURORA = ['#9a7cff', '#5b9dff', '#3fdcaa'] as const;

export const THEME = {
  accent: '#a9c2ff',
  accentSoft: 'rgba(169,194,255,0.55)',
  accentFaint: 'rgba(169,194,255,0.3)',
  white: '#f5f6f8',
  muted: '#a9abb3',
  skyTop: '#010103',
  skyHorizon: '#0a0d18',
  ground: '#050506',
};

/** A left-to-right aurora gradient for a canvas line or fill between x0 and x1. */
export function auroraGradient(context: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, alpha = 1): CanvasGradient {
  const gradient = context.createLinearGradient(x0, y0, x1, y1);
  const hex = (c: string) => `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${alpha})`;
  gradient.addColorStop(0, hex(AURORA[0]));
  gradient.addColorStop(0.5, hex(AURORA[1]));
  gradient.addColorStop(1, hex(AURORA[2]));
  return gradient;
}

/** Orbit colours follow the gradient outward; they always appear with the orbit's name, so colour is never the only cue. */
export const ORBIT_COLORS: Record<OrbitClass, string> = {
  LEO: '#f5f6f8',
  MEO: '#7fb0ff',
  GEO: '#a98fff',
  GSO: '#a98fff',
  HEO: '#5fe3b5',
};
