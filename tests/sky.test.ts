import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { cities, cityObserver } from '../src/content/cities';
import { places } from '../src/content/places';
import { resolveObserver, resolveOrientation } from '../src/privacy/location';
import { calculateCelestialBodies } from '../src/sky/astronomy';
import { horizonChartPosition } from '../src/sky/horizon';
import {
  calculateSatellites,
  elementAgeMs,
  freshnessForAge,
  groundTrack,
  propagateRecord,
  reviewedSnapshot,
  validateOmm,
  type OmmRecord,
} from '../src/sky/satellites';
import { formatSelectedTime } from '../src/sky/time';
import { splitTrackAtAntimeridian } from '../src/geo';
import { buildModel } from '../src/ui/model';

const la = cityObserver(cities.la);
const dc = cityObserver(cities.dc);
const laTime = new Date('2026-01-15T08:00:00.000Z');
const dcTime = new Date('2026-06-21T16:00:00.000Z');

/**
 * Apparent azimuth and elevation from JPL Horizons (QUANTITIES=4) for the same
 * sites and instants. Azimuth is degrees from north toward east.
 * Elevation tolerance is wider for the Moon because Astronomy Engine's normal
 * refraction and Horizons' apparent elevation differ below the horizon.
 * Sun and planet elevations stay within 0.12°.
 */
const horizons = [
  { id: 'sun', observer: la, at: laTime, azimuth: 357.600176, elevation: -77.037723, elevationTolerance: 0.12 },
  { id: 'jupiter', observer: la, at: laTime, azimuth: 203.635426, elevation: 77.304024, elevationTolerance: 0.12 },
  { id: 'moon', observer: la, at: laTime, azimuth: 91.872014, elevation: -53.99278, elevationTolerance: 0.7 },
  { id: 'sun', observer: dc, at: dcTime, azimuth: 131.025875, elevation: 68.547449, elevationTolerance: 0.12 },
  { id: 'jupiter', observer: dc, at: dcTime, azimuth: 99.693017, elevation: 45.641669, elevationTolerance: 0.12 },
  { id: 'moon', observer: dc, at: dcTime, azimuth: 81.927439, elevation: -12.300588, elevationTolerance: 0.7 },
];

describe('astronomy reference directions', () => {
  test('matches JPL Horizons at Los Angeles and Washington, DC', () => {
    expect(cities.la).toMatchObject({ lat: 34.0522, lon: -118.2437, heightMeters: 89 });
    expect(cities.dc).toMatchObject({ lat: 38.9072, lon: -77.0369, heightMeters: 22 });
    for (const expected of horizons) {
      const body = calculateCelestialBodies(expected.observer, expected.at).find((item) => item.id === expected.id);
      expect(body, expected.id).toBeTruthy();
      expect(angularDifference(body!.look.azimuthDeg, expected.azimuth)).toBeLessThan(0.01);
      expect(Math.abs(body!.look.elevationDeg - expected.elevation)).toBeLessThan(expected.elevationTolerance);
      expect(Math.sign(body!.look.elevationDeg)).toBe(Math.sign(expected.elevation));
      expect(body!.look.aboveHorizon).toBe(expected.elevation > 0);
      expect(body!.look.visibility).toBe('not-assessed');
      expect('subpoint' in body!).toBe(false);
    }
  });

  test('keeps a negative solar altitude in the full list', () => {
    const sun = calculateCelestialBodies(la, laTime).find((body) => body.id === 'sun');
    expect(sun?.look.elevationDeg).toBeLessThan(0);
    expect(sun?.look.aboveHorizon).toBe(false);
  });
});

describe('selected time labeling', () => {
  test('names the instant as a selected time in UTC', () => {
    const copy = formatSelectedTime(laTime);
    expect(copy.heading).toBe('Selected time');
    expect(copy.utc).toBe('2026-01-15T08:00:00.000Z');
    expect(`${copy.heading} ${copy.utc}`.toLowerCase()).not.toMatch(/\b(now|live)\b/);
  });
});

describe('satellite snapshot propagation', () => {
  const at = new Date('2026-10-12T03:30:00.000Z');

  test('propagates ISS with satellite.js 7.1.0 reference output', () => {
    const iss = calculateSatellites(la, at).find((item) => item.status === 'available' && item.satellite.noradId === 25544);
    expect(iss?.status).toBe('available');
    if (iss?.status !== 'available') return;
    expect(iss.satellite.subpoint.lat).toBeCloseTo(7.08006, 3);
    expect(iss.satellite.subpoint.lon).toBeCloseTo(13.68154, 3);
    expect(iss.satellite.altitudeKm).toBeCloseTo(422.283, 2);
    expect(iss.satellite.look.azimuthDeg).toBeCloseTo(57.2084, 3);
    expect(iss.satellite.look.elevationDeg).toBeCloseTo(-58.2201, 3);
    expect(iss.satellite.altitudeKm).toBeGreaterThan(300);
    expect(iss.satellite.altitudeKm).toBeLessThan(500);
    expect(Math.abs(iss.satellite.subpoint.lat)).toBeLessThanOrEqual(iss.inclinationDeg + 0.2);
    const fromDc = calculateSatellites(dc, at).find((item) => item.status === 'available' && item.satellite.noradId === 25544);
    if (fromDc?.status !== 'available') throw new Error('missing ISS');
    expect(fromDc.satellite.look.azimuthDeg).toBeCloseTo(83.8913, 3);
    expect(fromDc.satellite.look.elevationDeg).toBeCloseTo(-41.0609, 3);
    expect(fromDc.satellite.subpoint).toEqual(iss.satellite.subpoint);
  });

  test('keeps a six-digit NORAD id', () => {
    const soyuz = calculateSatellites(la, at).find((item) => item.status === 'available' && item.satellite.noradId === 100057);
    expect(soyuz?.status).toBe('available');
    if (soyuz?.status !== 'available') return;
    expect(String(soyuz.satellite.noradId)).toHaveLength(6);
    expect(soyuz.satellite.id).toBe('norad-100057');
    expect(soyuz.satellite.name).toBe('SOYUZ-MS 29');
    expect(soyuz.sharesElementsWith.length).toBeGreaterThan(0);
  });

  test('marks stale elements and hides positions after 72 hours', () => {
    const epoch = reviewedSnapshot.records[0].EPOCH;
    const staleAt = new Date(Date.parse(`${epoch}Z`) + 30 * 60 * 60 * 1000);
    const oldAt = new Date(Date.parse(`${epoch}Z`) + 80 * 60 * 60 * 1000);
    expect(freshnessForAge(elementAgeMs(epoch, staleAt))).toBe('stale');
    expect(freshnessForAge(elementAgeMs(epoch, oldAt))).toBe('unavailable');
    const stale = calculateSatellites(la, staleAt).find((item) => (item.status === 'available' ? item.satellite.noradId : item.noradId) === 25544);
    expect(stale?.status).toBe('available');
    if (stale?.status === 'available') expect(stale.satellite.freshness).toBe('stale');
    const hidden = calculateSatellites(la, oldAt).find((item) => item.status === 'unavailable' && item.noradId === 25544);
    expect(hidden?.status).toBe('unavailable');
    if (hidden?.status === 'unavailable') expect(hidden.reason).toMatch(/72 hours/);
  });

  test('reports invalid propagation without a ground point', () => {
    const iss = reviewedSnapshot.records.find((record) => record.NORAD_CAT_ID === 25544);
    expect(iss).toBeTruthy();
    const broken = { ...iss!, ECCENTRICITY: 1.5 };
    const outcome = propagateRecord(broken, la, at, reviewedSnapshot);
    expect(outcome.status).toBe('unavailable');
    expect(outcome).not.toHaveProperty('satellite');
  });

  test('rejects a record that is missing fields', () => {
    expect(validateOmm({ OBJECT_NAME: 'Broken' })).toBeNull();
  });

  test('splits an ISS ground track at the antimeridian', () => {
    const iss = reviewedSnapshot.records.find((record) => record.NORAD_CAT_ID === 25544) as OmmRecord;
    const track = groundTrack(iss, at, 3, 40, reviewedSnapshot);
    expect(track.length).toBeGreaterThan(10);
    for (const point of track) expect(Math.abs(point.lat)).toBeLessThanOrEqual(51.6314 + 0.2);
    const segments = splitTrackAtAntimeridian(track);
    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      for (let index = 1; index < segment.length; index += 1) {
        expect(Math.abs(segment[index].lon - segment[index - 1].lon)).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('horizon chart compass', () => {
  test('puts north on top and east on the right', () => {
    const north = horizonChartPosition(0, 0);
    const east = horizonChartPosition(90, 0);
    const overhead = horizonChartPosition(45, 90);
    expect(north && east && overhead).toBeTruthy();
    expect(north!.y).toBeLessThan(200);
    expect(north!.x).toBeCloseTo(200);
    expect(east!.x).toBeGreaterThan(200);
    expect(east!.y).toBeCloseTo(200);
    expect(overhead).toEqual({ x: 200, y: 200 });
    expect(horizonChartPosition(10, -5)).toBeNull();
  });
});

describe('connections', () => {
  test('city mode finds Los Angeles places and does not invent a sky link', () => {
    const model = buildModel({
      city: cities.la,
      atUtc: new Date('2026-10-12T03:30:00.000Z'),
      mode: 'near-me',
      radiusKm: 100,
      interest: 'all',
      grade: '6-8',
      search: '',
      minElevationDeg: -90,
      selectedId: 'jupiter',
      places,
    });
    expect(model.places.map((place) => place.id)).toEqual(['griffith', 'caltech', 'jpl']);
    expect(model.connection).toMatch(/No reviewed scientific link/);
    expect(model.timeHeading).toBe('Selected time');
  });

  test('a planet cannot switch the search center to a satellite ground point', () => {
    const model = buildModel({
      city: cities.la,
      atUtc: new Date('2026-10-12T03:30:00.000Z'),
      mode: 'under-satellite',
      radiusKm: 500,
      interest: 'all',
      grade: '9-12',
      search: '',
      minElevationDeg: -90,
      selectedId: 'jupiter',
      places,
    });
    expect(model.effectiveMode).toBe('near-me');
    expect(model.anchorKind).toBe('city');
    expect(model.warnings.join(' ')).toMatch(/do not have an artificial-satellite ground point/);
  });

  test('a below-horizon satellite still has a ground point, and it is not Los Angeles', () => {
    const model = buildModel({
      city: cities.la,
      atUtc: new Date('2026-10-12T03:30:00.000Z'),
      mode: 'under-satellite',
      radiusKm: 100,
      interest: 'space',
      grade: '6-8',
      search: '',
      minElevationDeg: -90,
      selectedId: 'norad-25544',
      places,
    });
    expect(model.effectiveMode).toBe('under-satellite');
    expect(model.anchorKind).toBe('subpoint');
    expect(model.anchor.lat).toBeCloseTo(7.08, 1);
    expect(model.places).toHaveLength(0);
    expect(model.connection).toMatch(/does not mean the satellite is imaging/);
    expect(model.selectedDetail.join(' ')).toMatch(/SOYUZ-MS 29|CREW DRAGON 13/);
  });
});

describe('privacy and layout', () => {
  test('location denial drops the device fix and sensor denial stays north-up', () => {
    const denied = resolveObserver({
      city: cities.la,
      preciseRequested: true,
      permission: 'denied',
      device: { lat: 1, lon: 2, heightMeters: 3 },
    });
    expect(denied.status).toBe('denied');
    expect(denied.observer).toMatchObject({ lat: cities.la.lat, lon: cities.la.lon, locationMode: 'city' });
    expect(denied.observer).not.toMatchObject({ lat: 1, lon: 2 });
    const idle = resolveObserver({ city: cities.dc, preciseRequested: false, permission: 'not-requested', device: null });
    expect(idle.status).toBe('city');
    expect(resolveOrientation({ requested: true, permission: 'denied', headingDeg: 90 })).toEqual({
      mode: 'manual-north-up',
      headingDeg: 0,
      reason: 'denied',
    });
  });

  test('wide windows keep the observer beside the screen', () => {
    const css = readFileSync('styles.css', 'utf8');
    expect(css).toMatch(/min-width:\s*900px/);
    expect(css).toMatch(/grid-template-columns:\s*280px 1fr/);
    expect(css).toMatch(/min-height:\s*var\(--sg-touch\)/);
  });
});

describe('client boundaries', () => {
  test('application source does not fetch providers or store coordinates', () => {
    const source = walk('src').filter((file) => file.endsWith('.ts')).map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toMatch(/fetch\s*\(/);
    expect(source).not.toMatch(/localStorage|sessionStorage|navigator\.geolocation|deviceorientation/i);
    expect(source).not.toMatch(/data\/sky|demo-iss/);
    expect(readFileSync('data/sky.js', 'utf8')).toMatch(/NOT live/);
  });
});

function angularDifference(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
