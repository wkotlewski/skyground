import type { Observer } from '../contracts';
import { horizonFromEqj } from './small-bodies';
import { raDecVector } from './deep-sky';
import { starOverhead, type Star } from './stars';

/**
 * About 9,000 naked-eye stars from the HYG database v4.1 (CC BY-SA 4.0).
 * Loaded after the sky first draws, so the page opens quickly.
 */
export interface StarCatalog {
  count: number;
  keys: string[];
  /** x, y, z (J2000 unit vector), magnitude, colour index, light-years (0 when unknown), per star. */
  data: Float32Array;
  ra: Float32Array;
  dec: Float32Array;
  proper: string[];
  designation: string[];
  con: string[];
  spect: string[];
  constellationNames: Record<string, string>;
  index: Map<string, number>;
}

interface CatalogFile {
  count: number;
  keys: string[];
  numbers: number[];
  proper: string[];
  designation: string[];
  con: string[];
  spect: string[];
  constellations: Record<string, string>;
}

export const CATALOG_STRIDE = 6;
let pending: Promise<StarCatalog> | null = null;
let ready: StarCatalog | null = null;

export function buildCatalog(file: CatalogFile): StarCatalog {
  const data = new Float32Array(file.count * CATALOG_STRIDE);
  const ra = new Float32Array(file.count);
  const dec = new Float32Array(file.count);
  for (let i = 0; i < file.count; i += 1) {
    const [r, d, mag, ci, ly] = file.numbers.slice(i * 5, i * 5 + 5);
    const [x, y, z] = raDecVector(r, d);
    data.set([x, y, z, mag, ci, ly], i * CATALOG_STRIDE);
    ra[i] = r;
    dec[i] = d;
  }
  return {
    count: file.count,
    keys: file.keys,
    data,
    ra,
    dec,
    proper: file.proper,
    designation: file.designation,
    con: file.con,
    spect: file.spect,
    constellationNames: file.constellations,
    index: new Map(file.keys.map((key, i) => [key, i])),
  };
}

export function loadCatalog(): Promise<StarCatalog> {
  pending ??= import('../../data/sky/catalog.json').then((module) => {
    ready = buildCatalog((module as unknown as { default: CatalogFile }).default);
    return ready;
  });
  return pending;
}

export function catalogIfLoaded(): StarCatalog | null {
  return ready;
}

/** A readable name: traditional name, else Bayer/Flamsteed designation, else HIP or HYG number. */
export function catalogStarName(catalog: StarCatalog, i: number): string {
  if (catalog.proper[i]) return catalog.proper[i];
  const designation = catalog.designation[i];
  if (designation) {
    const [first, ...rest] = designation.split(' ');
    const con = rest.pop() ?? '';
    return `${[first, ...rest].join(' ')} ${catalog.constellationNames[con] ?? con}`.trim();
  }
  const key = catalog.keys[i];
  return key.startsWith('hip-') ? `HIP ${key.slice(4)}` : `HYG ${key.slice(4)}`;
}

/** Find a catalogue star by its traditional name, so the bright-star cards share names with the catalogue. */
export function catalogKeyForProper(catalog: StarCatalog, proper: string): string | null {
  const base = proper.replace(/\s*\(.*\)$/, '');
  const i = catalog.proper.findIndex((name) => name === base);
  return i >= 0 ? catalog.keys[i] : null;
}

/** Turn catalogue star i into the same shape the bright-star cards use. */
export function catalogStar(catalog: StarCatalog, i: number, observer: Observer, at: Date) {
  const o = i * CATALOG_STRIDE;
  const raDeg = catalog.ra[i];
  const decDeg = catalog.dec[i];
  const name = catalogStarName(catalog, i);
  const star: Star = {
    id: catalog.keys[i],
    name,
    constellation: catalog.constellationNames[catalog.con[i]] ?? catalog.con[i],
    raHours: raDeg / 15,
    decDeg,
    magnitude: catalog.data[o + 3],
    lightYears: catalog.data[o + 5] || null,
  };
  const view = horizonFromEqj(raDecVector(raDeg, decDeg), observer, at);
  return { star, ...view, overhead: starOverhead(star, at), spect: catalog.spect[i], colorIndex: catalog.data[o + 4] };
}

/** Plain-words colour and approximate surface temperature from the B−V colour index (Ballesteros 2012). */
export function starColour(ci: number): { words: string; kelvin: number } {
  const kelvin = Math.round((4600 * (1 / (0.92 * ci + 1.7) + 1 / (0.92 * ci + 0.62))) / 100) * 100;
  const words = ci < 0 ? 'blue-white' : ci < 0.3 ? 'white' : ci < 0.6 ? 'yellow-white' : ci < 0.9 ? 'yellow, like the Sun' : ci < 1.4 ? 'orange' : 'red-orange';
  return { words, kelvin };
}
