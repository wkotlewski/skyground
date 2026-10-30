import { EquatorFromVector, Horizon, Observer as AstroObserver, Rotation_EQJ_EQD, RotateVector, SiderealTime, Spherical, VectorFromSphere } from 'astronomy-engine';
import type { Coordinates, Observer } from '../contracts';
import { normalizeLongitude } from '../geo';

/**
 * Bright stars as sky landmarks. Positions are J2000 catalog values (Yale Bright Star Catalog / SIMBAD),
 * precessed to the selected date. Distances are rounded parallax distances; null where estimates disagree a lot.
 */
export interface Star {
  id: string;
  name: string;
  constellation: string;
  raHours: number;
  decDeg: number;
  magnitude: number;
  lightYears: number | null;
}

export const STARS: Star[] = [
  { id: 'sirius', name: 'Sirius', constellation: 'Canis Major', raHours: 6.7525, decDeg: -16.716, magnitude: -1.46, lightYears: 8.6 },
  { id: 'canopus', name: 'Canopus', constellation: 'Carina', raHours: 6.3992, decDeg: -52.696, magnitude: -0.74, lightYears: 310 },
  { id: 'alpha-centauri', name: 'Alpha Centauri', constellation: 'Centaurus', raHours: 14.66, decDeg: -60.834, magnitude: -0.27, lightYears: 4.4 },
  { id: 'arcturus', name: 'Arcturus', constellation: 'Boötes', raHours: 14.261, decDeg: 19.182, magnitude: -0.05, lightYears: 37 },
  { id: 'vega', name: 'Vega', constellation: 'Lyra', raHours: 18.6156, decDeg: 38.784, magnitude: 0.03, lightYears: 25 },
  { id: 'capella', name: 'Capella', constellation: 'Auriga', raHours: 5.2782, decDeg: 45.998, magnitude: 0.08, lightYears: 43 },
  { id: 'rigel', name: 'Rigel', constellation: 'Orion', raHours: 5.2423, decDeg: -8.202, magnitude: 0.13, lightYears: null },
  { id: 'procyon', name: 'Procyon', constellation: 'Canis Minor', raHours: 7.655, decDeg: 5.225, magnitude: 0.34, lightYears: 11.5 },
  { id: 'achernar', name: 'Achernar', constellation: 'Eridanus', raHours: 1.6286, decDeg: -57.237, magnitude: 0.46, lightYears: 139 },
  { id: 'betelgeuse', name: 'Betelgeuse', constellation: 'Orion', raHours: 5.9195, decDeg: 7.407, magnitude: 0.5, lightYears: null },
  { id: 'altair', name: 'Altair', constellation: 'Aquila', raHours: 19.8464, decDeg: 8.868, magnitude: 0.76, lightYears: 16.7 },
  { id: 'acrux', name: 'Acrux', constellation: 'Crux (Southern Cross)', raHours: 12.4433, decDeg: -63.099, magnitude: 0.76, lightYears: null },
  { id: 'aldebaran', name: 'Aldebaran', constellation: 'Taurus', raHours: 4.5987, decDeg: 16.509, magnitude: 0.86, lightYears: 65 },
  { id: 'antares', name: 'Antares', constellation: 'Scorpius', raHours: 16.4901, decDeg: -26.432, magnitude: 0.96, lightYears: null },
  { id: 'spica', name: 'Spica', constellation: 'Virgo', raHours: 13.4199, decDeg: -11.161, magnitude: 0.97, lightYears: 250 },
  { id: 'pollux', name: 'Pollux', constellation: 'Gemini', raHours: 7.7553, decDeg: 28.026, magnitude: 1.14, lightYears: 34 },
  { id: 'fomalhaut', name: 'Fomalhaut', constellation: 'Piscis Austrinus', raHours: 22.9608, decDeg: -29.622, magnitude: 1.16, lightYears: 25 },
  { id: 'deneb', name: 'Deneb', constellation: 'Cygnus', raHours: 20.6905, decDeg: 45.28, magnitude: 1.25, lightYears: null },
  { id: 'regulus', name: 'Regulus', constellation: 'Leo', raHours: 10.1395, decDeg: 11.967, magnitude: 1.35, lightYears: 79 },
  { id: 'castor', name: 'Castor', constellation: 'Gemini', raHours: 7.5767, decDeg: 31.888, magnitude: 1.58, lightYears: 51 },
  { id: 'polaris', name: 'Polaris (North Star)', constellation: 'Ursa Minor', raHours: 2.5303, decDeg: 89.264, magnitude: 1.98, lightYears: null },
];

function ofDate(star: Star, atUtc: Date): { ra: number; dec: number } {
  const j2000 = VectorFromSphere(new Spherical(star.decDeg, star.raHours * 15, 1), atUtc);
  const equator = EquatorFromVector(RotateVector(Rotation_EQJ_EQD(atUtc), j2000));
  return { ra: equator.ra, dec: equator.dec };
}

export function starPositions(observer: Observer, atUtc: Date): Array<{ star: Star; azimuthDeg: number; altitudeDeg: number }> {
  const site = new AstroObserver(observer.lat, observer.lon, observer.heightMeters);
  return STARS.map((star) => {
    const { ra, dec } = ofDate(star, atUtc);
    const horizon = Horizon(atUtc, site, ra, dec, 'normal');
    return { star, azimuthDeg: horizon.azimuth, altitudeDeg: horizon.altitude };
  });
}

/** Where on Earth the star is straight overhead. */
export function starOverhead(star: Star, atUtc: Date): Coordinates {
  const { ra, dec } = ofDate(star, atUtc);
  return { lat: dec, lon: normalizeLongitude((ra - SiderealTime(atUtc)) * 15) };
}

/** Year the light we see left the star, for well-measured nearby stars. */
export function lightLeftYear(star: Star, atUtc: Date): number | null {
  if (star.lightYears == null || star.lightYears > 400) return null;
  return Math.round(atUtc.getUTCFullYear() - star.lightYears);
}
