import { Body, GeoVector, HelioVector, KM_PER_AU, Rotation_EQJ_HOR, RotateVector, Vector, Observer as AstroObserver, AstroTime } from 'astronomy-engine';
import pack from '../../data/sky/small-bodies.json';
import type { Observer } from '../contracts';

/**
 * Asteroids from JPL osculating elements, moved forward with two-body (Kepler) motion.
 * That ignores pulls from the planets, so positions drift slowly from the truth as the elements age.
 * They are good for finding a body's general direction, which is what this page needs.
 */

export interface SmallBody {
  id: string;
  name: string;
  designation: string;
  kind: string;
  neo: boolean;
  pha: boolean;
  epochJd: number;
  a: number;
  e: number;
  i: number;
  om: number;
  w: number;
  ma: number;
  n: number;
  diameterKm: number | null;
  extentKm: string | null;
  note: string;
  sourceUrl: string;
}

export const SMALL_BODY_SOURCE = { name: 'NASA JPL Small-Body Database', url: pack.sourceUrl, fetchedAtUtc: pack.fetchedAtUtc };
export const SMALL_BODIES: SmallBody[] = (pack as { bodies: SmallBody[] }).bodies;

const RAD = Math.PI / 180;
const OBLIQUITY_J2000 = 23.4392911 * RAD;
const JD_UNIX_EPOCH = 2440587.5;

function julianDay(date: Date): number {
  return date.getTime() / 86_400_000 + JD_UNIX_EPOCH;
}

function solveKepler(meanAnomaly: number, e: number): number {
  let E = e < 0.8 ? meanAnomaly : Math.PI;
  for (let step = 0; step < 30; step += 1) {
    const delta = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

/** Heliocentric position in AU, equatorial J2000 axes (the same frame astronomy-engine calls EQJ). */
export function heliocentricEqj(body: SmallBody, date: Date): [number, number, number] {
  const days = julianDay(date) - body.epochJd;
  const M = ((body.ma + body.n * days) % 360) * RAD;
  const E = solveKepler(M, body.e);
  const xv = body.a * (Math.cos(E) - body.e);
  const yv = body.a * Math.sqrt(1 - body.e * body.e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.hypot(xv, yv);
  const om = body.om * RAD, w = body.w * RAD, i = body.i * RAD;
  const xe = r * (Math.cos(om) * Math.cos(v + w) - Math.sin(om) * Math.sin(v + w) * Math.cos(i));
  const ye = r * (Math.sin(om) * Math.cos(v + w) + Math.cos(om) * Math.sin(v + w) * Math.cos(i));
  const ze = r * Math.sin(v + w) * Math.sin(i);
  return [xe, ye * Math.cos(OBLIQUITY_J2000) - ze * Math.sin(OBLIQUITY_J2000), ye * Math.sin(OBLIQUITY_J2000) + ze * Math.cos(OBLIQUITY_J2000)];
}

/** Geocentric astrometric RA and Dec (J2000), corrected for light travel time. */
export function geocentricRaDec(body: SmallBody, date: Date): { raDeg: number; decDeg: number; distanceAu: number; vector: [number, number, number] } {
  const earth = HelioVector(Body.Earth, date);
  let target = heliocentricEqj(body, date);
  let geo: [number, number, number] = [target[0] - earth.x, target[1] - earth.y, target[2] - earth.z];
  // Light-time: we see where the body was when the light left it.
  const lightDays = Math.hypot(...geo) * (KM_PER_AU / 299792.458) / 86400;
  target = heliocentricEqj(body, new Date(date.getTime() - lightDays * 86_400_000));
  geo = [target[0] - earth.x, target[1] - earth.y, target[2] - earth.z];
  const distanceAu = Math.hypot(...geo);
  const raDeg = ((Math.atan2(geo[1], geo[0]) / RAD) % 360 + 360) % 360;
  const decDeg = Math.asin(geo[2] / distanceAu) / RAD;
  return { raDeg, decDeg, distanceAu, vector: geo };
}

/** Azimuth (from north, toward east) and altitude for an EQJ direction vector. */
export function horizonFromEqj(vector: [number, number, number], observer: Observer, date: Date): { azimuthDeg: number; altitudeDeg: number } {
  const site = new AstroObserver(observer.lat, observer.lon, observer.heightMeters);
  const time = new AstroTime(date);
  const hor = RotateVector(Rotation_EQJ_HOR(time, site), new Vector(vector[0], vector[1], vector[2], time));
  const length = Math.hypot(hor.x, hor.y, hor.z);
  // Horizontal frame: x = north, y = west, z = up.
  const azimuthDeg = ((Math.atan2(-hor.y, hor.x) / RAD) % 360 + 360) % 360;
  return { azimuthDeg, altitudeDeg: Math.asin(hor.z / length) / RAD };
}

export function smallBodyPositions(observer: Observer, date: Date) {
  return SMALL_BODIES.map((body) => {
    const geo = geocentricRaDec(body, date);
    return { body, ...horizonFromEqj(geo.vector, observer, date), distanceKm: geo.distanceAu * KM_PER_AU, raDeg: geo.raDeg, decDeg: geo.decDeg };
  });
}

/** Pluto from astronomy-engine, which models it directly. */
export function plutoPosition(observer: Observer, date: Date) {
  const geo = GeoVector(Body.Pluto, date, true);
  const vector: [number, number, number] = [geo.x, geo.y, geo.z];
  const distanceAu = Math.hypot(...vector);
  return {
    ...horizonFromEqj(vector, observer, date),
    distanceKm: distanceAu * KM_PER_AU,
    raDeg: ((Math.atan2(geo.y, geo.x) / RAD) % 360 + 360) % 360,
    decDeg: Math.asin(geo.z / distanceAu) / RAD,
  };
}

export function elementAgeDays(body: SmallBody, date: Date): number {
  return Math.abs(julianDay(date) - body.epochJd);
}
