/** Country profiles (World Bank, CC BY 4.0) and timelines (Wikidata, CC0), loaded with the region pack. */
export interface Indicator { value: number; year: number }
export interface PlaceProfile {
  population?: Indicator; under15?: Indicator; urban?: Indicator; gdpPerPerson?: Indicator; unemployment?: Indicator;
  poverty?: Indicator; primaryCompletion?: Indicator; literacy?: Indicator; tertiary?: Indicator; lifeExpectancy?: Indicator;
  childMortality?: Indicator; electricity?: Indicator; internet?: Indicator;
}
export interface TimelineEntry { year: number; title: string; kind: string; article: string }
export interface PlaceRecord { profile: PlaceProfile | null; timeline: TimelineEntry[]; founded: number | null }
export interface PlacePack {
  sources: Record<'profile' | 'timeline', { name: string; url: string; license: string; licenseUrl: string }>;
  retrievedAtUtc: string;
  places: Record<string, PlaceRecord>;
}

let pending: Promise<PlacePack> | null = null;

export function loadPlaces(): Promise<PlacePack> {
  pending ??= import('../../data/places/places.json').then((module) => (module as unknown as { default: PlacePack }).default);
  return pending;
}

export function yearLabel(year: number): string {
  if (year < -9999) return `${Math.round(-year / 1000).toLocaleString('en-US')} thousand years ago`;
  return year < 0 ? `${-year} BCE` : `${year}`;
}
