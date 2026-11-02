import type { SkyThing } from './sky-model';

/** Layers of the sky, from closest to Earth to farthest away. */
export type SkyLevel = 'all' | 'orbits' | 'leo' | 'meo' | 'geo' | 'planets' | 'stars';

export interface LevelInfo {
  id: SkyLevel;
  label: string;
  /** How far away this layer is, in plain words. */
  range: string;
  /** A few words for the caption. */
  short: string;
  /** How bright the star backdrop stays, so the layer stands out. */
  backdrop: number;
}

/** Farthest first, so the ticker reads top (deep space) to bottom (near Earth). */
export const LEVELS: LevelInfo[] = [
  { id: 'all', short: 'everything', label: 'All', range: 'Everything in your sky', backdrop: 1 },
  { id: 'stars', short: 'light-years away', label: 'Stars', range: 'Stars and galaxies, light-years away', backdrop: 1 },
  { id: 'planets', short: 'light-minutes away', label: 'Planets', range: 'Sun, Moon, planets and asteroids, light-minutes to light-hours away', backdrop: 0.55 },
  { id: 'orbits', short: 'every satellite', label: 'Orbits', range: 'Every satellite: LEO, MEO and GEO together, colour-coded by orbit', backdrop: 0.35 },
  { id: 'geo', short: '35,786 km up', label: 'GEO', range: 'Geostationary and high orbits, about 35,786 km up and beyond', backdrop: 0.35 },
  { id: 'meo', short: '2,000–35,786 km up', label: 'MEO', range: 'Medium Earth orbit, 2,000–35,786 km up, where GPS lives', backdrop: 0.35 },
  { id: 'leo', short: '160–2,000 km up', label: 'LEO', range: 'Low Earth orbit, 160–2,000 km up, where the space stations fly', backdrop: 0.35 },
];

export function levelInfo(level: SkyLevel): LevelInfo {
  return LEVELS.find((item) => item.id === level) ?? LEVELS[0];
}

export function inLevel(thing: SkyThing, level: SkyLevel): boolean {
  switch (level) {
    case 'all':
      return true;
    case 'stars':
      return thing.kind === 'star' || thing.kind === 'deep-sky';
    case 'planets':
      return thing.kind === 'sun' || thing.kind === 'moon' || thing.kind === 'planet' || thing.kind === 'dwarf-planet' || thing.kind === 'asteroid';
    case 'orbits':
      return thing.kind === 'satellite';
    case 'geo': {
      const cls = thing.satellite?.orbit.orbitClass;
      return cls === 'GEO' || cls === 'GSO' || cls === 'HEO';
    }
    case 'meo':
      return thing.satellite?.orbit.orbitClass === 'MEO';
    case 'leo':
      return thing.satellite?.orbit.orbitClass === 'LEO';
  }
}

/** The layer an object belongs to, so picking it can switch the view to where it lives. */
export function levelOf(thing: SkyThing): SkyLevel {
  const cls = thing.satellite?.orbit.orbitClass;
  if (cls === 'LEO') return 'leo';
  if (cls === 'MEO') return 'meo';
  if (cls) return 'geo';
  if (thing.kind === 'star' || thing.kind === 'deep-sky') return 'stars';
  return 'planets';
}
