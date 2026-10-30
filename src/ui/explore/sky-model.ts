import type { Coordinates, Observer } from '../../contracts';
import { satelliteGuide, type SatelliteGuide } from '../../content/satellite-guide';
import { planetFact } from '../../content/planet-facts';
import { calculateCelestialBodies } from '../../sky/astronomy';
import { AstroTime, Observer as AstroObserver, Rotation_EQJ_HOR } from 'astronomy-engine';
import { distanceFromEarth, overheadFromEqj, overheadPoint } from '../../sky/overhead';
import { DEEP_SKY, galacticPlane, raDecVector, type DeepSkyObject } from '../../sky/deep-sky';
import { SMALL_BODIES, elementAgeDays, geocentricRaDec, horizonFromEqj, plutoPosition, type SmallBody } from '../../sky/small-bodies';
import starmap from '../../../data/sky/starmap.json';
import { EARTH_RADIUS_KM, orbitFacts, speedKmS, type OrbitFacts } from '../../sky/orbits';
import { calculateSatellites, currentSnapshot, groundTrack, propagateRecord, type OmmRecord } from '../../sky/satellites';
import { starOverhead, starPositions, type Star } from '../../sky/stars';
import { directionVector, type Vec3 } from '../../sensors/orientation';

export type ThingKind = 'satellite' | 'planet' | 'sun' | 'moon' | 'star' | 'asteroid' | 'dwarf-planet' | 'deep-sky';

export interface SatelliteInfo {
  noradId: number;
  record: OmmRecord;
  altitudeKm: number;
  subpoint: Coordinates;
  freshness: 'fresh' | 'stale';
  epochUtc: string;
  orbit: OrbitFacts;
  speedKmS: number;
  guide: SatelliteGuide | null;
}

export interface BodyInfo {
  overhead: Coordinates | null;
  distanceKm: number | null;
  lightMinutes: number | null;
  radiusKm: number | null;
}

export interface SkyThing {
  id: string;
  name: string;
  kind: ThingKind;
  azimuthDeg: number;
  altitudeDeg: number;
  dir: Vec3;
  satellite?: SatelliteInfo;
  body?: BodyInfo;
  star?: Star & { overhead: Coordinates };
  small?: { body: SmallBody | null; distanceKm: number; lightMinutes: number; overhead: Coordinates; elementAgeDays: number | null; raDeg: number; decDeg: number };
  deep?: DeepSkyObject & { overhead: Coordinates };
}

export interface SkySnapshot {
  at: Date;
  observer: Observer;
  things: SkyThing[];
  hidden: Array<{ name: string; reason: string }>;
}

const BODY_KIND: Record<string, ThingKind> = { sun: 'sun', moon: 'moon' };

export function computeSky(observer: Observer, at: Date, includeStars = true): SkySnapshot {
  const things: SkyThing[] = [];
  const hidden: SkySnapshot['hidden'] = [];
  for (const outcome of calculateSatellites(observer, at)) {
    if (outcome.status !== 'available') {
      hidden.push({ name: satelliteGuide[outcome.noradId]?.displayName ?? outcome.name, reason: outcome.reason });
      continue;
    }
    const s = outcome.satellite;
    const orbit = orbitFacts({ meanMotionRevPerDay: outcome.record.MEAN_MOTION, eccentricity: outcome.record.ECCENTRICITY, inclinationDeg: outcome.record.INCLINATION });
    const guide = satelliteGuide[s.noradId] ?? null;
    things.push({
      id: s.id,
      name: guide?.displayName ?? s.name,
      kind: 'satellite',
      azimuthDeg: s.look.azimuthDeg,
      altitudeDeg: s.look.elevationDeg,
      dir: directionVector(s.look.azimuthDeg, s.look.elevationDeg),
      satellite: {
        noradId: s.noradId,
        record: outcome.record,
        altitudeKm: s.altitudeKm,
        subpoint: s.subpoint,
        freshness: s.freshness,
        epochUtc: s.epochUtc,
        orbit,
        speedKmS: speedKmS(orbit.semiMajorAxisKm, EARTH_RADIUS_KM + s.altitudeKm),
        guide,
      },
    });
  }
  for (const body of calculateCelestialBodies(observer, at)) {
    const distance = distanceFromEarth(body.id, at);
    const fact = planetFact(body.id);
    const radius = fact?.measurements.find((m) => m.label === 'mean radius' && m.unit === 'kilometre');
    things.push({
      id: body.id,
      name: body.name,
      kind: BODY_KIND[body.id] ?? 'planet',
      azimuthDeg: body.look.azimuthDeg,
      altitudeDeg: body.look.elevationDeg,
      dir: directionVector(body.look.azimuthDeg, body.look.elevationDeg),
      body: {
        overhead: overheadPoint(body.id, at),
        distanceKm: distance?.km ?? null,
        lightMinutes: distance?.lightMinutes ?? null,
        radiusKm: radius ? Number(radius.value) : null,
      },
    });
  }
  for (const item of smallBodyThings(observer, at)) things.push(item);
  for (const object of DEEP_SKY) {
    const vector = raDecVector(object.raDeg, object.decDeg);
    const view = horizonFromEqj(vector, observer, at);
    things.push({
      id: `deep-${object.id}`,
      name: object.name,
      kind: 'deep-sky',
      azimuthDeg: view.azimuthDeg,
      altitudeDeg: view.altitudeDeg,
      dir: directionVector(view.azimuthDeg, view.altitudeDeg),
      deep: { ...object, overhead: overheadFromEqj(vector, at) },
    });
  }
  if (includeStars) {
    for (const { star, azimuthDeg, altitudeDeg } of starPositions(observer, at)) {
      things.push({
        id: `star-${star.id}`,
        name: star.name,
        kind: 'star',
        azimuthDeg,
        altitudeDeg,
        dir: directionVector(azimuthDeg, altitudeDeg),
        star: { ...star, overhead: starOverhead(star, at) },
      });
    }
  }
  return { at, observer, things, hidden };
}

/** Where a satellite will be in the observer's sky over the next minutes, for drawing its path. */
export function skyPath(record: OmmRecord, observer: Observer, start: Date, minutes: number, steps: number): Vec3[] {
  const points: Vec3[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const at = new Date(start.getTime() + (index * minutes * 60_000) / steps);
    const outcome = propagateRecord(record, observer, at, currentSnapshot());
    if (outcome.status !== 'available') break;
    points.push(directionVector(outcome.satellite.look.azimuthDeg, outcome.satellite.look.elevationDeg));
  }
  return points;
}

/** Ground track for one orbit before and after the selected time (capped at a day for high orbits). */
export function groundTrackAround(record: OmmRecord, at: Date): Coordinates[] {
  const period = Math.min(1440, 1440 / record.MEAN_MOTION);
  const steps = 120;
  const stepMinutes = (2 * period) / steps;
  return groundTrack(record, new Date(at.getTime() - period * 60_000), stepMinutes, steps + 1, currentSnapshot());
}

function smallBodyThings(observer: Observer, at: Date): SkyThing[] {
  const out: SkyThing[] = [];
  const pluto = plutoPosition(observer, at);
  out.push({
    id: 'pluto',
    name: 'Pluto',
    kind: 'dwarf-planet',
    azimuthDeg: pluto.azimuthDeg,
    altitudeDeg: pluto.altitudeDeg,
    dir: directionVector(pluto.azimuthDeg, pluto.altitudeDeg),
    small: { body: null, distanceKm: pluto.distanceKm, lightMinutes: pluto.distanceKm / 299792.458 / 60, overhead: overheadFromEqj(raDecVector(pluto.raDeg, pluto.decDeg), at), elementAgeDays: null, raDeg: pluto.raDeg, decDeg: pluto.decDeg },
  });
  for (const body of SMALL_BODIES) {
    const geo = geocentricRaDec(body, at);
    const view = horizonFromEqj(geo.vector, observer, at);
    const km = geo.distanceAu * 149_597_870.7;
    out.push({
      id: `ast-${body.id}`,
      name: body.name,
      kind: body.id === 'ceres' ? 'dwarf-planet' : 'asteroid',
      azimuthDeg: view.azimuthDeg,
      altitudeDeg: view.altitudeDeg,
      dir: directionVector(view.azimuthDeg, view.altitudeDeg),
      small: { body, distanceKm: km, lightMinutes: km / 299792.458 / 60, overhead: overheadFromEqj(geo.vector, at), elementAgeDays: elementAgeDays(body, at), raDeg: geo.raDeg, decDeg: geo.decDeg },
    });
  }
  return out;
}

export interface Backdrop {
  /** x, y, z (east, north, up), magnitude, colour index for each star. */
  stars: Float32Array;
  constellations: Array<{ name: string; rank: number; label: Vec3 | null; lines: Vec3[][] }>;
  milkyWay: Array<{ dir: Vec3; glow: number }>;
}

const STAR_VECTORS = (() => {
  const data = (starmap as { stars: number[] }).stars;
  const out: Array<[number, number, number, number, number]> = [];
  for (let index = 0; index < data.length; index += 4) {
    const [x, y, z] = raDecVector(data[index], data[index + 1]);
    out.push([x, y, z, data[index + 2], data[index + 3]]);
  }
  return out;
})();
const CONSTELLATIONS = (starmap as unknown as { constellations: Array<{ name: string; rank: number; label: [number, number] | null; lines: Array<Array<[number, number]>> }> }).constellations;
const MILKY_WAY = galacticPlane(3);

/** Star field, constellation lines, and the Milky Way for one observer and time, using one rotation matrix. */
export function computeBackdrop(observer: Observer, at: Date): Backdrop {
  const rot = Rotation_EQJ_HOR(new AstroTime(at), new AstroObserver(observer.lat, observer.lon, observer.heightMeters)).rot;
  // Horizontal frame from astronomy-engine is x = north, y = west, z = up; ours is east, north, up.
  const toLocal = (v: [number, number, number]): Vec3 => {
    const north = rot[0][0] * v[0] + rot[1][0] * v[1] + rot[2][0] * v[2];
    const west = rot[0][1] * v[0] + rot[1][1] * v[1] + rot[2][1] * v[2];
    const up = rot[0][2] * v[0] + rot[1][2] * v[1] + rot[2][2] * v[2];
    return [-west, north, up];
  };
  const stars = new Float32Array(STAR_VECTORS.length * 5);
  STAR_VECTORS.forEach(([x, y, z, mag, bv], index) => {
    const local = toLocal([x, y, z]);
    stars.set([local[0], local[1], local[2], mag, bv], index * 5);
  });
  return {
    stars,
    constellations: CONSTELLATIONS.map((item) => ({
      name: item.name,
      rank: item.rank,
      label: item.label ? toLocal(raDecVector(item.label[0], item.label[1])) : null,
      lines: item.lines.map((line) => line.map(([ra, dec]) => toLocal(raDecVector(ra, dec)))),
    })),
    milkyWay: MILKY_WAY.map((point) => ({ dir: toLocal(point.vector), glow: point.glow })),
  };
}

export function groundPointOf(thing: SkyThing): { point: Coordinates; label: string } | null {
  if (thing.satellite) return { point: thing.satellite.subpoint, label: 'Ground point' };
  if (thing.body?.overhead) return { point: thing.body.overhead, label: 'Overhead point' };
  if (thing.star) return { point: thing.star.overhead, label: 'Overhead point' };
  if (thing.small) return { point: thing.small.overhead, label: 'Overhead point' };
  if (thing.deep) return { point: thing.deep.overhead, label: 'Overhead point' };
  return null;
}

/**
 * Where an object's ground point or overhead point goes next.
 * Satellites: one orbit ahead (capped at a day). Everything else: the next 24 hours as Earth turns beneath it.
 */
export function upcomingPath(thing: SkyThing, at: Date, steps = 96): Coordinates[] {
  if (thing.satellite) {
    const minutes = Math.min(1440, thing.satellite.orbit.periodMin);
    return groundTrack(thing.satellite.record, at, minutes / steps, steps + 1, currentSnapshot());
  }
  const start = groundPointOf(thing)?.point;
  if (!start) return [];
  const points: Coordinates[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const hours = (24 * index) / steps;
    const later = new Date(at.getTime() + hours * 3_600_000);
    const body = thing.body ? overheadPoint(thing.id, later) : null;
    // Fixed directions drift west by one turn per sidereal day (about 15.04° per hour).
    points.push(body ?? { lat: start.lat, lon: ((((start.lon - 15.041 * hours) + 180) % 360) + 360) % 360 - 180 });
  }
  return points;
}
