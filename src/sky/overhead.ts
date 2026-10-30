import { AstroTime, Body, EquatorFromVector, GeoVector, KM_PER_AU, Rotation_EQJ_EQD, RotateVector, SiderealTime, Vector } from 'astronomy-engine';
import type { Coordinates } from '../contracts';
import { normalizeLongitude } from '../geo';

/**
 * The place on Earth where a Sun, Moon, or planet is straight overhead (its geographic position).
 * This is a geometric point, not a satellite ground point: nothing is orbiting above it.
 */

const BODIES: Record<string, Body> = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
};

export function overheadPoint(bodyId: string, atUtc: Date): Coordinates | null {
  const body = BODIES[bodyId];
  if (!body || Number.isNaN(atUtc.getTime())) return null;
  const ofDate = RotateVector(Rotation_EQJ_EQD(atUtc), GeoVector(body, atUtc, true));
  const equator = EquatorFromVector(ofDate);
  const lon = normalizeLongitude((equator.ra - SiderealTime(atUtc)) * 15);
  return { lat: equator.dec, lon };
}

/** Distance from Earth's centre and the one-way light travel time. */
export function distanceFromEarth(bodyId: string, atUtc: Date): { km: number; lightMinutes: number } | null {
  const body = BODIES[bodyId];
  if (!body) return null;
  const vector = GeoVector(body, atUtc, true);
  const km = Math.hypot(vector.x, vector.y, vector.z) * KM_PER_AU;
  return { km, lightMinutes: km / 299792.458 / 60 };
}

/** Overhead point for a J2000 (EQJ) direction, such as an asteroid or a galaxy. */
export function overheadFromEqj(vector: [number, number, number], atUtc: Date): Coordinates {
  const ofDate = RotateVector(Rotation_EQJ_EQD(atUtc), new Vector(vector[0], vector[1], vector[2], new AstroTime(atUtc)));
  const equator = EquatorFromVector(ofDate);
  return { lat: equator.dec, lon: normalizeLongitude((equator.ra - SiderealTime(atUtc)) * 15) };
}
