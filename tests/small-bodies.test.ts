import { describe, expect, test } from 'vitest';
import { SMALL_BODIES, geocentricRaDec, horizonFromEqj, plutoPosition } from '../src/sky/small-bodies';

/** JPL Horizons astrometric RA/Dec (J2000, geocentre) for 2026-10-30 00:00 UTC (QUANTITIES=1,20). */
const HORIZONS: Record<string, { ra: number; dec: number; au: number; tolDeg: number }> = {
  ceres: { ra: 113.96875, dec: 23.92135, au: 2.22417909483794, tolDeg: 0.2 },
  vesta: { ra: 18.67896, dec: -4.40666, au: 1.53872204062881, tolDeg: 0.2 },
  apophis: { ra: 247.50932, dec: -19.95121, au: 1.38898478411621, tolDeg: 0.5 },
  bennu: { ra: 235.76791, dec: -23.34422, au: 2.21126550181424, tolDeg: 3 },
};

function separationDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const r = Math.PI / 180;
  const c = Math.sin(dec1 * r) * Math.sin(dec2 * r) + Math.cos(dec1 * r) * Math.cos(dec2 * r) * Math.cos((ra1 - ra2) * r);
  return Math.acos(Math.min(1, c)) / r;
}

describe('asteroids from JPL elements', () => {
  const at = new Date('2026-10-30T00:00:00Z');
  for (const [id, ref] of Object.entries(HORIZONS)) {
    test(`${id} lands within ${ref.tolDeg}° of JPL Horizons`, () => {
      const body = SMALL_BODIES.find((item) => item.id === id)!;
      const got = geocentricRaDec(body, at);
      expect(separationDeg(got.raDeg, got.decDeg, ref.ra, ref.dec)).toBeLessThan(ref.tolDeg);
      expect(Math.abs(got.distanceAu - ref.au) / ref.au).toBeLessThan(0.02);
    });
  }

  test('a celestial pole direction sits at the observer latitude due north', () => {
    const view = horizonFromEqj([0, 0, 1], { lat: 34.05, lon: -118.24, heightMeters: 0, locationMode: 'city' }, at);
    expect(view.altitudeDeg).toBeCloseTo(34.05, 0);
    expect(Math.min(view.azimuthDeg, 360 - view.azimuthDeg)).toBeLessThan(1);
  });

  test('Pluto is about 5 billion km away', () => {
    const pluto = plutoPosition({ lat: 0, lon: 0, heightMeters: 0, locationMode: 'city' }, at);
    expect(pluto.distanceKm).toBeGreaterThan(4.9e9);
    expect(pluto.distanceKm).toBeLessThan(5.6e9);
  });
});

describe('deep sky', async () => {
  const { galacticPlane, DEEP_SKY } = await import('../src/sky/deep-sky');
  test('galactic longitude 0 points at the Milky Way centre in Sagittarius', () => {
    const [x, y, z] = galacticPlane()[0].vector;
    const ra = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    const dec = (Math.asin(z) * 180) / Math.PI;
    const centre = DEEP_SKY.find((item) => item.id === 'sgr-a')!;
    expect(ra).toBeCloseTo(centre.raDeg, 0);
    expect(dec).toBeCloseTo(centre.decDeg, 0);
  });
});

describe('backdrop', async () => {
  const { computeBackdrop } = await import('../src/ui/explore/sky-model');
  const { horizonFromEqj } = await import('../src/sky/small-bodies');
  const { raDecVector } = await import('../src/sky/deep-sky');
  test('the star field rotation matches the per-object horizon calculation', () => {
    const observer = { lat: 34.05, lon: -118.24, heightMeters: 0, locationMode: 'city' as const };
    const at = new Date('2026-10-30T06:00:00Z');
    const backdrop = computeBackdrop(observer, at);
    expect(backdrop.stars.length / 6).toBeGreaterThan(1500);
    // The brightest star in the pack is first: Sirius.
    const [x, y, z] = [backdrop.stars[0], backdrop.stars[1], backdrop.stars[2]];
    const view = horizonFromEqj(raDecVector(101.29, -16.72), observer, at);
    const az = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
    expect(az).toBeCloseTo(view.azimuthDeg, 0);
    expect((Math.asin(z) * 180) / Math.PI).toBeCloseTo(view.altitudeDeg, 0);
    expect(backdrop.constellations.some((item) => item.name === 'Orion')).toBe(true);
  });
});
