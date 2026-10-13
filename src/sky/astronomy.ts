import { Body, Equator, Horizon, Observer as AstroObserver } from 'astronomy-engine';
import type { AstronomyProvider, CelestialBody, LookAngles, Observer, Source } from '../contracts';

export const ASTRONOMY_ENGINE_VERSION = '2.1.19';

const LIBRARY_REVIEWED_AT_UTC = '2026-10-13T01:50:49.000Z';

const astronomySource: Source = {
  organization: 'Astronomy Engine',
  url: 'https://github.com/cosinekitty/astronomy',
  fetchedAtUtc: LIBRARY_REVIEWED_AT_UTC,
  reviewedAtUtc: LIBRARY_REVIEWED_AT_UTC,
  rightsStatus: 'approved',
  license: 'MIT',
  licenseUrl: 'https://github.com/cosinekitty/astronomy/blob/master/LICENSE',
};

const BODIES: Array<{ id: string; name: string; kind: CelestialBody['kind']; body: Body }> = [
  { id: 'sun', name: 'Sun', kind: 'sun', body: Body.Sun },
  { id: 'moon', name: 'Moon', kind: 'moon', body: Body.Moon },
  { id: 'mercury', name: 'Mercury', kind: 'planet', body: Body.Mercury },
  { id: 'venus', name: 'Venus', kind: 'planet', body: Body.Venus },
  { id: 'mars', name: 'Mars', kind: 'planet', body: Body.Mars },
  { id: 'jupiter', name: 'Jupiter', kind: 'planet', body: Body.Jupiter },
  { id: 'saturn', name: 'Saturn', kind: 'planet', body: Body.Saturn },
  { id: 'uranus', name: 'Uranus', kind: 'planet', body: Body.Uranus },
  { id: 'neptune', name: 'Neptune', kind: 'planet', body: Body.Neptune },
];

export function calculateCelestialBodies(observer: Observer, atUtc: Date): CelestialBody[] {
  if (Number.isNaN(atUtc.getTime())) throw new RangeError('Invalid calculation time');
  const site = new AstroObserver(observer.lat, observer.lon, observer.heightMeters);
  return BODIES.map((entry) => {
    const equator = Equator(entry.body, atUtc, site, true, true);
    const horizon = Horizon(atUtc, site, equator.ra, equator.dec, 'normal');
    const look: LookAngles = {
      azimuthDeg: horizon.azimuth,
      elevationDeg: horizon.altitude,
      calculatedAtUtc: atUtc.toISOString(),
      aboveHorizon: horizon.altitude > 0,
      visibility: 'not-assessed',
    };
    return {
      kind: entry.kind,
      id: entry.id,
      name: entry.name,
      look,
      source: astronomySource,
    };
  });
}

export const astronomyProvider: AstronomyProvider = {
  async calculate(observer, atUtc) {
    return calculateCelestialBodies(observer, atUtc);
  },
};
