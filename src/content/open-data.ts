import entities from '../../data/snapshots/wikidata-entities.json';
import context from '../../data/snapshots/wikipedia-context.json';
import gibs from '../../data/snapshots/gibs-imagery.json';
import nasaImages from '../../data/snapshots/nasa-images.json';

export interface OpenPlace {
  wikidataId: string;
  name: string;
  lat: number;
  lon: number;
  categories: Array<'museums' | 'colleges' | 'history' | 'space'>;
  region: 'los-angeles' | 'washington-dc';
}

const categories = new Set(['museums', 'colleges', 'history', 'space']);

function validatePlaces(): OpenPlace[] {
  return entities.places.map((place) => {
    if (!/^Q\d+$/.test(place.wikidataId)) throw new Error(`Invalid Wikidata place ${place.name}`);
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) throw new Error(`Invalid coordinate for ${place.name}`);
    if (!place.categories.every((category) => categories.has(category))) throw new Error(`Invalid category for ${place.name}`);
    return place as OpenPlace;
  });
}

export const wikidataPlaces = validatePlaces();
export const wikidataFetchedAt = entities.fetchedAtUtc;

export const wikidataSatellites = entities.satellites.map((record) => {
  if (!/^\d+$/.test(record.noradId)) throw new Error(`Invalid catalog number ${record.noradId}`);
  return record;
});

export const wikipediaContext = context.records.map((record) => {
  if (!record.extract || !record.url.startsWith('https://en.wikipedia.org/wiki/')) throw new Error(`Invalid Wikipedia record ${record.title}`);
  return record;
});

export const gibsImagery = gibs;

export const nasaImagePointers = nasaImages.records.filter((record) => record.studentVisible === false && record.gradeReview === 'not-reviewed');

export function satelliteSourceLines(noradId: string | number): string[] {
  const record = wikidataSatellites.find((item) => item.noradId === String(noradId));
  if (!record) return [];
  return record.items.map((item) => {
    const operators = item.operators.length ? ` Operators: ${item.operators.join(', ')}.` : ' No operator is listed on this Wikidata item.';
    return `Wikidata ${item.wikidataId} ${item.label}. SCN ${noradId}.${operators}`;
  });
}

export function wikipediaLine(wikidataId: string): string | null {
  const record = wikipediaContext.find((item) => item.wikidataId === wikidataId);
  if (!record) return null;
  return `Wikipedia, CC BY-SA: ${record.extract}`;
}

export function nasaImageLine(name: string): string | null {
  const record = nasaImagePointers.find((item) => item.title.toLowerCase().includes(name.toLowerCase()));
  if (!record) return null;
  return `NASA Images catalog ${record.nasaId}, ${record.title}, ${record.dateCreated.slice(0, 10)}. The file is not shown. Rights are asset-specific and grade review is not complete.`;
}
