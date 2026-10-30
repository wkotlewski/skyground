/**
 * Orbit classes and simple orbit facts computed from GP mean elements.
 * Mean elements are averaged, so these numbers are good for learning and comparison,
 * not for operations.
 */

export const EARTH_MU_KM3_S2 = 398600.4418;
export const EARTH_RADIUS_KM = 6378.137;
/** Geostationary radius from Earth's centre and altitude above the equator. */
export const GEO_RADIUS_KM = 42164;
export const GEO_ALTITUDE_KM = GEO_RADIUS_KM - EARTH_RADIUS_KM;

export type OrbitClass = 'LEO' | 'MEO' | 'GEO' | 'GSO' | 'HEO';

export interface OrbitFacts {
  orbitClass: OrbitClass;
  periodMin: number;
  lapsPerDay: number;
  semiMajorAxisKm: number;
  perigeeKm: number;
  apogeeKm: number;
  eccentricity: number;
  inclinationDeg: number;
  sunSynchronous: boolean;
}

export const ORBIT_LABELS: Record<OrbitClass, { short: string; name: string; band: string }> = {
  LEO: { short: 'LEO', name: 'Low Earth orbit', band: 'about 160 to 2,000 km up' },
  MEO: { short: 'MEO', name: 'Medium Earth orbit', band: '2,000 km up to just below geostationary height' },
  GEO: { short: 'GEO', name: 'Geostationary orbit', band: 'about 35,786 km above the equator' },
  GSO: { short: 'GSO', name: 'Geosynchronous orbit (tilted)', band: 'geostationary height, but tilted from the equator' },
  HEO: { short: 'HEO', name: 'Highly elliptical orbit', band: 'swings from close to Earth out to tens of thousands of km' },
};

export function orbitFacts(input: { meanMotionRevPerDay: number; eccentricity: number; inclinationDeg: number }): OrbitFacts {
  const { meanMotionRevPerDay: n, eccentricity: e, inclinationDeg: i } = input;
  if (!(n > 0) || !(e >= 0 && e < 1) || !Number.isFinite(i)) throw new RangeError('Invalid mean elements');
  const periodMin = 1440 / n;
  const nRadS = (n * 2 * Math.PI) / 86400;
  const a = Math.cbrt(EARTH_MU_KM3_S2 / (nRadS * nRadS));
  const perigeeKm = a * (1 - e) - EARTH_RADIUS_KM;
  const apogeeKm = a * (1 + e) - EARTH_RADIUS_KM;
  return {
    orbitClass: classify(periodMin, e, i, apogeeKm),
    periodMin,
    lapsPerDay: n,
    semiMajorAxisKm: a,
    perigeeKm,
    apogeeKm,
    eccentricity: e,
    inclinationDeg: i,
    // Sun-synchronous orbits are low and slightly retrograde (about 96° to 102°).
    sunSynchronous: apogeeKm < 2000 && i > 95 && i < 103,
  };
}

function classify(periodMin: number, e: number, i: number, apogeeKm: number): OrbitClass {
  if (e >= 0.25) return 'HEO';
  if (Math.abs(periodMin - 1436.07) < 15) return i < 3 && e < 0.01 ? 'GEO' : 'GSO';
  if (apogeeKm <= 2000) return 'LEO';
  return 'MEO';
}

/** Orbital speed from the vis-viva equation at a distance from Earth's centre. */
export function speedKmS(semiMajorAxisKm: number, radiusKm: number): number {
  if (!(semiMajorAxisKm > 0) || !(radiusKm > 0)) throw new RangeError('Invalid radius');
  return Math.sqrt(EARTH_MU_KM3_S2 * (2 / radiusKm - 1 / semiMajorAxisKm));
}

/** Time for light or radio to travel straight up to a height and back down. */
export function roundTripLightMs(altitudeKm: number): number {
  return ((2 * altitudeKm) / 299792.458) * 1000;
}

export function formatDuration(minutes: number): string {
  if (minutes < 120) return `${Math.round(minutes)} minutes`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
}
