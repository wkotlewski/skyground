import type { Coordinates } from '../contracts';

/** Country and ocean outlines plus Wikipedia excerpts, loaded only when someone asks what is below. */

export interface Excerpt {
  title: string;
  extract: string;
  url: string;
}

export interface BelowRegion {
  id: string;
  kind: string;
  name: string;
  wikidata: string | null;
  bbox: [number, number, number, number];
  rings: Array<Array<[number, number]>>;
}

export interface BelowAnswer {
  regionId: string | null;
  name: string;
  kind: 'country' | 'water' | 'open-ocean';
  kindLabel: string;
  intro: Excerpt | null;
  history: Excerpt | null;
  retrievedAtUtc: string;
  license: string;
  licenseUrl: string;
}

interface RegionsFile { regions: BelowRegion[] }
interface ArticlesFile {
  retrievedAtUtc: string;
  license: string;
  licenseUrl: string;
  articles: Record<string, { intro: Excerpt | null; history: Excerpt | null }>;
}

/** Even-odd ray casting across every ring, so holes such as lakes and enclaves are respected. */
export function insideRings(point: Coordinates, rings: Array<Array<[number, number]>>): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > point.lat) !== (yj > point.lat) && point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export function findRegion(point: Coordinates, regions: BelowRegion[]): BelowRegion | null {
  for (const region of regions) {
    const [west, south, east, north] = region.bbox;
    if (point.lon < west || point.lon > east || point.lat < south || point.lat > north) continue;
    if (insideRings(point, region.rings)) return region;
  }
  return null;
}

const KIND_LABELS: Record<string, string> = {
  country: 'Country or territory',
  ocean: 'Ocean',
  sea: 'Sea',
  gulf: 'Gulf',
  bay: 'Bay',
};

export class BelowLookup {
  constructor(private regions: BelowRegion[], private articles: ArticlesFile) {}

  at(point: Coordinates): BelowAnswer {
    const region = findRegion(point, this.regions);
    const base = {
      retrievedAtUtc: this.articles.retrievedAtUtc,
      license: this.articles.license,
      licenseUrl: this.articles.licenseUrl,
    };
    if (!region) {
      return { ...base, regionId: null, name: 'Open ocean', kind: 'open-ocean', kindLabel: 'Ocean', intro: null, history: null };
    }
    const linked = region.wikidata ? this.articles.articles[region.wikidata] : undefined;
    return {
      ...base,
      regionId: region.id,
      name: region.name,
      kind: region.kind === 'country' ? 'country' : 'water',
      kindLabel: KIND_LABELS[region.kind] ?? 'Region',
      intro: linked?.intro ?? null,
      history: linked?.history ?? null,
    };
  }
}

let pending: Promise<BelowLookup> | null = null;

export function loadBelow(): Promise<BelowLookup> {
  pending ??= Promise.all([
    import('../../data/below/regions.json'),
    import('../../data/below/articles.json'),
  ]).then(([regions, articles]) => {
    const r = (regions as unknown as { default: RegionsFile }).default;
    const a = (articles as unknown as { default: ArticlesFile }).default;
    return new BelowLookup(r.regions, a);
  });
  return pending;
}

/** Keep the first sentences of an excerpt so a phone card stays short. */
export function shortExcerpt(text: string, maxChars = 320): string {
  if (text.length <= maxChars) return text;
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  let out = '';
  for (const sentence of sentences) {
    if ((out + sentence).length > maxChars && out) break;
    out += sentence;
  }
  return out.trim() || `${text.slice(0, maxChars).trim()}…`;
}
