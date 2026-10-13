import type { GradeBand, Interest, Observer } from '../../contracts';
import { cities, cityObserver, type CityId } from '../../content/cities';
import { places } from '../../content/places';
import { planetFact, planetFactTimestamps } from '../../content/planet-facts';
import { distanceKm, findPlaces } from '../../geo';
import { calculateCelestialBodies } from '../../sky/astronomy';
import { calculateSatellites, reviewedSnapshot } from '../../sky/satellites';
import type { ContentTab, Entity, Match, Point, Relation } from './types';

const celestialSource = {
  name: 'Astronomy Engine',
  url: 'https://github.com/cosinekitty/astronomy',
  license: 'MIT',
  retrievedAt: '2026-10-13T01:50:49.000Z',
};

function horizonLine(altitude: number): string {
  if (altitude > 0) return 'Above the horizon';
  if (altitude === 0) return 'On the horizon';
  return 'Below the horizon';
}

function skyEntityFromBody(body: ReturnType<typeof calculateCelestialBodies>[number]): Entity {
  const fact = planetFact(body.id);
  const facts = fact
    ? fact.measurements.map((measurement) => `${measurement.label}: ${measurement.value} ${measurement.unit} (Wikidata ${measurement.property})`)
    : ['No reviewed size is in the Wikidata snapshot.'];
  if (fact && fact.measurements.filter((measurement) => measurement.label === 'mean radius' && measurement.unit === 'kilometre').length > 1) {
    facts.push('Wikidata lists more than one mean radius. All of them are shown.');
  }
  return {
    id: body.id,
    world: 'sky',
    kind: body.kind,
    name: body.name,
    subtitle: body.kind === 'planet' ? 'Planet' : body.kind === 'moon' ? 'Moon' : 'Sun',
    description: `${horizonLine(body.look.elevationDeg)}. Azimuth ${body.look.azimuthDeg.toFixed(1)}° from north toward east. Elevation ${body.look.elevationDeg.toFixed(1)}°. Visibility was not assessed. Planets, the Sun, and the Moon have no satellite ground point.`,
    source: fact
      ? { name: 'Wikidata', url: fact.sourceUrl, license: planetFactTimestamps.license, retrievedAt: planetFactTimestamps.fetchedAtUtc }
      : celestialSource,
    sky: { azimuthDeg: body.look.azimuthDeg, altitudeDeg: body.look.elevationDeg },
    facts,
  };
}

export function skyCatalog(observer: Observer, at: Date): Entity[] {
  const bodies = calculateCelestialBodies(observer, at).map(skyEntityFromBody);
  const satellites = calculateSatellites(observer, at).map((outcome): Entity => {
    if (outcome.status === 'unavailable') {
      return {
        id: outcome.id,
        world: 'sky',
        kind: 'satellite',
        name: outcome.name,
        subtitle: 'Space station or satellite',
        description: `${outcome.reason} Element epoch ${outcome.epochUtc || 'unavailable'}. Snapshot fetched ${outcome.snapshotFetchedAtUtc}.`,
        source: {
          name: 'CelesTrak GP snapshot',
          url: 'https://celestrak.org/usage-policy.php',
          license: 'public-service-terms',
          retrievedAt: outcome.snapshotFetchedAtUtc,
        },
        facts: [outcome.reason],
      };
    }
    const satellite = outcome.satellite;
    const hours = Math.abs(at.getTime() - Date.parse(satellite.epochUtc)) / 3_600_000;
    const shared = outcome.sharesElementsWith.length
      ? ` This snapshot uses the same elements as ${outcome.sharesElementsWith.join(', ')}.`
      : '';
    return {
      id: satellite.id,
      world: 'sky',
      kind: 'satellite',
      name: satellite.name,
      subtitle: satellite.freshness === 'stale' ? 'Satellite · stale elements' : 'Satellite',
      description: `NORAD ${satellite.noradId}. ${horizonLine(satellite.look.elevationDeg)}. Azimuth ${satellite.look.azimuthDeg.toFixed(1)}°. Elevation ${satellite.look.elevationDeg.toFixed(1)}°. Altitude ${satellite.altitudeKm.toFixed(1)} km. Ground point ${satellite.subpoint.lat.toFixed(2)}°, ${satellite.subpoint.lon.toFixed(2)}°. That point is beneath the satellite, not a camera footprint. Elements are ${hours.toFixed(1)} hours from the selected time.${shared}`,
      source: {
        name: satellite.source.organization,
        url: satellite.source.licenseUrl ?? satellite.source.url,
        license: satellite.source.license ?? 'public-service-terms',
        retrievedAt: satellite.snapshotFetchedAtUtc,
      },
      sky: { azimuthDeg: satellite.look.azimuthDeg, altitudeDeg: satellite.look.elevationDeg },
      groundPoint: satellite.subpoint,
      facts: [
        `Element epoch ${satellite.epochUtc}`,
        `Snapshot fetched ${reviewedSnapshot.fetchedAtUtc}`,
        `Calculated ${satellite.look.calculatedAtUtc}`,
      ],
    };
  });
  return [...satellites, ...bodies];
}

function placeKind(categories: string[]): Entity['kind'] {
  if (categories.includes('museums')) return 'museum';
  if (categories.includes('colleges')) return 'college';
  if (categories.includes('history')) return 'historic';
  return 'space';
}

function placeSubtitle(kind: Entity['kind']): string {
  if (kind === 'museum') return 'Observatory / museum';
  if (kind === 'college') return 'College / university';
  if (kind === 'historic') return 'Historic site';
  return 'Space and science';
}

export function earthCatalog(): Entity[] {
  const cityEntities: Entity[] = (Object.keys(cities) as CityId[]).map((id) => {
    const city = cities[id];
    return {
      id: `city-${id}`,
      world: 'earth',
      kind: 'location',
      name: city.name,
      subtitle: 'City reference point',
      description: 'A city reference point for sky calculations. It is not a phone location. Phone positioning is not used.',
      source: {
        name: 'SkyGround city reference',
        url: 'https://www.naturalearthdata.com/about/terms-of-use/',
        license: 'reference-coordinate',
        retrievedAt: '2026-10-13T01:50:49.000Z',
      },
      location: { lat: city.lat, lon: city.lon },
      facts: [`${city.lat}°, ${city.lon}°`, `Height ${city.heightMeters} m`],
    };
  });
  const placeEntities: Entity[] = places.map((place) => {
    const kind = placeKind(place.categories);
    return {
      id: place.id,
      world: 'earth',
      kind,
      name: place.name,
      subtitle: placeSubtitle(kind),
      description: `${place.prompt} ${place.locationNote}`,
      source: {
        name: place.source.organization,
        url: place.url,
        license: 'official-page',
        retrievedAt: place.source.fetchedAtUtc,
      },
      location: { lat: place.lat, lon: place.lon },
      facts: [place.locationNote, place.source.organization],
    };
  });
  return [...cityEntities, ...placeEntities];
}

function interestCategory(interest: string): Interest | 'space' | 'all' {
  if (interest === 'museums') return 'museums';
  if (interest === 'colleges') return 'colleges';
  if (interest === 'history') return 'history';
  if (interest === 'observatories') return 'space';
  return 'all';
}

export function connectPlaces(input: {
  entity: Entity;
  relation: Relation;
  interest: string;
  radiusKm: number;
  observer: Point;
}): Match[] {
  if (input.relation === 'subpoint' && !input.entity.groundPoint) return [];
  const anchor = input.relation === 'subpoint' && input.entity.groundPoint ? input.entity.groundPoint : input.observer;
  const category = interestCategory(input.interest);
  const radius = input.relation === 'topic' ? 20_000 : input.radiusKm;
  const found = findPlaces(places, anchor, category === 'all' ? 'all' : category, radius);
  return found.map((place) => {
    const entity = earthCatalog().find((item) => item.id === place.id);
    if (!entity) throw new Error(`Missing place ${place.id}`);
    const explanation = input.relation === 'topic'
      ? `${place.name} matches the interest you chose. A shared topic is not a geographic link and is not evidence of a scientific connection.`
      : input.relation === 'subpoint'
        ? `${place.distanceKm.toFixed(0)} km from the satellite ground point. That point is not a camera footprint.`
        : `${place.distanceKm.toFixed(0)} km from the chosen observer. No reviewed scientific link is included.`;
    return { entity, explanation, relation: input.relation };
  });
}

export function contentFor(entity: Entity, tab: ContentTab, grade: GradeBand): { title: string; text: string }[] {
  if (tab === 'activity') {
    const text = grade === 'K-2'
      ? `Point to ${entity.name} and one place on Earth. Tell someone one thing you notice.`
      : grade === '9-12'
        ? `Use the timestamps and the source for ${entity.name}. Separate a geometric relationship from a claim that has evidence.`
        : `Compare ${entity.name} with a place on Earth. Say what each one can help you learn, and name the source.`;
    return [{ title: 'Notice. Compare. Explain.', text: `${text} Discuss this in person. Nothing is uploaded or saved.` }];
  }
  if (tab === 'history') {
    return [{ title: 'No reviewed event', text: 'No reviewed event is attached. A historic event is not inferred from being near a place.' }];
  }
  if (tab === 'news') {
    return [{ title: 'No reviewed news', text: 'No reviewed news story is attached. A headline stays hidden until a publisher, publication date, and grade review exist.' }];
  }
  return [{ title: 'No reviewed media', text: 'No reviewed photo or video is available. An asset needs a creator, source, rights, and grade review before it can appear.' }];
}

export function observerForCity(id: CityId): Observer {
  return cityObserver(cities[id]);
}

export function distanceFrom(observer: Point, place: Point): number {
  return distanceKm(observer, place);
}
