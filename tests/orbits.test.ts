import { describe, expect, test } from 'vitest';
import { satelliteGuide } from '../src/content/satellite-guide';
import { cities, cityObserver } from '../src/content/cities';
import { GEO_ALTITUDE_KM, orbitFacts, roundTripLightMs, speedKmS } from '../src/sky/orbits';
import { calculateSatellites, freshnessForAge, reviewedSnapshot } from '../src/sky/satellites';

function factsFor(norad: number) {
  const record = reviewedSnapshot.records.find((item) => item.NORAD_CAT_ID === norad);
  if (!record) throw new Error(`missing ${norad}`);
  return orbitFacts({ meanMotionRevPerDay: record.MEAN_MOTION, eccentricity: record.ECCENTRICITY, inclinationDeg: record.INCLINATION });
}

describe('orbit classes from bundled elements', () => {
  test('sorts the catalog into low, medium, geostationary, tilted geosynchronous, and elliptical orbits', () => {
    expect(factsFor(25544).orbitClass).toBe('LEO');
    expect(factsFor(43873).orbitClass).toBe('MEO');
    expect(factsFor(67160).orbitClass).toBe('MEO');
    expect(factsFor(60133).orbitClass).toBe('GEO');
    expect(factsFor(51850).orbitClass).toBe('GEO');
    expect(factsFor(36395).orbitClass).toBe('GSO');
    expect(factsFor(25867).orbitClass).toBe('HEO');
    expect(factsFor(40482).orbitClass).toBe('HEO');
  });

  test('computes sensible heights and periods', () => {
    const iss = factsFor(25544);
    expect(iss.periodMin).toBeGreaterThan(88);
    expect(iss.periodMin).toBeLessThan(95);
    expect(iss.perigeeKm).toBeGreaterThan(350);
    expect(iss.apogeeKm).toBeLessThan(450);
    const gps = factsFor(43873);
    expect(gps.periodMin).toBeCloseTo(718, -1);
    expect((gps.perigeeKm + gps.apogeeKm) / 2).toBeGreaterThan(19_900);
    expect((gps.perigeeKm + gps.apogeeKm) / 2).toBeLessThan(20_500);
    const goes = factsFor(60133);
    expect(Math.abs((goes.perigeeKm + goes.apogeeKm) / 2 - GEO_ALTITUDE_KM)).toBeLessThan(60);
    expect(factsFor(25867).apogeeKm).toBeGreaterThan(100_000);
  });

  test('flags sun-synchronous Earth watchers only', () => {
    expect(factsFor(49260).sunSynchronous).toBe(true);
    expect(factsFor(43013).sunSynchronous).toBe(true);
    expect(factsFor(25544).sunSynchronous).toBe(false);
    expect(factsFor(39574).sunSynchronous).toBe(false);
  });

  test('vis-viva speed and light travel time match textbook values', () => {
    const iss = factsFor(25544);
    expect(speedKmS(iss.semiMajorAxisKm, iss.semiMajorAxisKm)).toBeCloseTo(7.66, 1);
    const goes = factsFor(60133);
    expect(speedKmS(goes.semiMajorAxisKm, goes.semiMajorAxisKm)).toBeCloseTo(3.07, 1);
    expect(roundTripLightMs(GEO_ALTITUDE_KM)).toBeCloseTo(238.7, 0);
  });

  test('rejects impossible elements', () => {
    expect(() => orbitFacts({ meanMotionRevPerDay: 0, eccentricity: 0, inclinationDeg: 0 })).toThrow(RangeError);
    expect(() => orbitFacts({ meanMotionRevPerDay: 15, eccentricity: 1.2, inclinationDeg: 0 })).toThrow(RangeError);
  });
});

describe('catalog coverage', () => {
  test('every bundled satellite has a plain-language guide', () => {
    for (const record of reviewedSnapshot.records) {
      const guide = satelliteGuide[record.NORAD_CAT_ID];
      expect(guide, `guide for ${record.NORAD_CAT_ID}`).toBeTruthy();
      expect(guide.purpose.length).toBeGreaterThan(20);
      expect(guide.groundLink.length).toBeGreaterThan(20);
    }
  });

  test('high orbits keep useful elements longer than low orbits', () => {
    const fiveDays = 5 * 24 * 60 * 60 * 1000;
    expect(freshnessForAge(fiveDays, 92)).toBe('unavailable');
    expect(freshnessForAge(fiveDays, 718)).toBe('fresh');
    expect(freshnessForAge(10 * 24 * 60 * 60 * 1000, 1436)).toBe('stale');
    expect(freshnessForAge(30 * 24 * 60 * 60 * 1000, 1436)).toBe('unavailable');
  });

  test('every satellite in the bundled snapshot has a position when it was downloaded', () => {
    // Use the download time, not the newest epoch: far-out orbits like Chandra's are often published
    // with an epoch days in the future, which would make every low-orbit craft look too old.
    const fetchedAt = new Date(reviewedSnapshot.fetchedAtUtc);
    const outcomes = calculateSatellites(cityObserver(cities.la), fetchedAt);
    expect(outcomes.filter((outcome) => outcome.status !== 'available').map((outcome) => outcome.status === 'unavailable' && outcome.name)).toEqual([]);
  });
});

describe('fresh data', async () => {
  const { adoptSnapshot, currentSnapshot, reviewedSnapshot } = await import('../src/sky/satellites');
  test('an open page adopts only newer, complete snapshots with the same allowlist', () => {
    const newer = { ...reviewedSnapshot, fetchedAtUtc: '2099-01-01T00:00:00Z' };
    expect(adoptSnapshot({ ...newer, records: newer.records.slice(1) })).toBe(false);
    expect(adoptSnapshot({ ...reviewedSnapshot })).toBe(false);
    expect(adoptSnapshot({ nonsense: true })).toBe(false);
    expect(adoptSnapshot(newer)).toBe(true);
    expect(currentSnapshot().fetchedAtUtc).toBe('2099-01-01T00:00:00Z');
  });
});
