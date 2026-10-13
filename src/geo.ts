import type { Coordinates } from './contracts';

export function distanceKm(a: Coordinates, b: Coordinates): number {
  for (const point of [a, b]) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) {
      throw new RangeError('Invalid latitude or longitude');
    }
  }
  const rad = (n: number) => (n * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function findPlaces<T extends Coordinates & { id: string; categories: string[] }>(
  places: T[],
  anchor: Coordinates,
  interest: string,
  radiusKm: number,
): Array<T & { distanceKm: number }> {
  if (!Number.isFinite(radiusKm) || radiusKm < 0) throw new RangeError('Invalid radius');
  return places
    .filter((place) => interest === 'all' || place.categories.includes(interest))
    .map((place) => ({ ...place, distanceKm: distanceKm(anchor, place) }))
    .filter((place) => place.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
}

export function safeLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : null;
  } catch {
    return null;
  }
}

export function groundAnchor(
  mode: string,
  observer: Coordinates,
  satellite: { kind?: string; subpoint?: Coordinates } | null | undefined,
): Coordinates {
  if (mode === 'near-me' || mode === 'related-interest') return observer;
  if (mode === 'under-satellite' && satellite?.kind === 'satellite' && satellite.subpoint) return satellite.subpoint;
  throw new RangeError('Only Earth satellites have a satellite ground anchor');
}

/** Longitude in degrees, wrapped to [-180, 180]. */
export function normalizeLongitude(lon: number): number {
  if (!Number.isFinite(lon)) throw new RangeError('Invalid longitude');
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/**
 * Split a ground track where consecutive longitudes jump across the antimeridian.
 * Each returned segment can be drawn without a line across the whole map.
 */
export function splitTrackAtAntimeridian(points: Coordinates[]): Coordinates[][] {
  const segments: Coordinates[][] = [];
  let current: Coordinates[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) throw new RangeError('Invalid track point');
    const prev = current.at(-1);
    if (prev && Math.abs(normalizeLongitude(point.lon) - normalizeLongitude(prev.lon)) > 180) {
      segments.push(current);
      current = [];
    }
    current.push({ lat: point.lat, lon: normalizeLongitude(point.lon) });
  }
  if (current.length) segments.push(current);
  return segments;
}
