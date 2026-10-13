import facts from '../../data/snapshots/planet-facts.json';

export interface PlanetMeasurement {
  property: string;
  label: string;
  value: number;
  unit: string;
}

export interface PlanetFact {
  id: string;
  wikidataId: string;
  name: string;
  measurements: PlanetMeasurement[];
  sourceUrl: string;
}

const fetchedAtUtc = facts.fetchedAtUtc;
const reviewedAtUtc = facts.reviewedAtUtc;

function validate(): PlanetFact[] {
  return facts.records.map((record) => {
    if (!/^Q\d+$/.test(record.wikidataId)) throw new Error(`Invalid Wikidata id for ${record.id}`);
    const measurements = record.measurements.map((measurement) => {
      if (!Number.isFinite(measurement.value)) throw new Error(`Invalid measurement for ${record.id}`);
      return measurement;
    });
    return {
      id: record.id,
      wikidataId: record.wikidataId,
      name: record.name,
      measurements,
      sourceUrl: `https://www.wikidata.org/wiki/${record.wikidataId}`,
    };
  });
}

export const planetFacts = validate();

export function planetFact(id: string): PlanetFact | undefined {
  return planetFacts.find((fact) => fact.id === id);
}

export const planetFactTimestamps = { fetchedAtUtc, reviewedAtUtc, license: facts.license, provider: facts.provider };
