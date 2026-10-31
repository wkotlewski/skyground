import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { cities, cityObserver } from '../src/content/cities';
import { contentFor, earthCatalog, skyCatalog } from '../src/ui/present/catalog';
import { places } from '../src/content/places';
import { resolveObserver, resolveOrientation } from '../src/privacy/location';
import { calculateCelestialBodies } from '../src/sky/astronomy';
import { horizonChartPosition } from '../src/sky/horizon';
import {
  calculateSatellites,
  elementAgeMs,
  freshnessForAge,
  groundTrack,
  loadSnapshot,
  propagateRecord,
  validateOmm,
  type OmmRecord,
} from '../src/sky/satellites';
import { formatSelectedTime } from '../src/sky/time';
import { splitTrackAtAntimeridian } from '../src/geo';
import { buildModel } from '../src/ui/model';

/** Pinned 2026-10-12 stations snapshot. Reference outputs below were computed from these exact elements. */
const reviewedSnapshot = loadSnapshot(JSON.parse(readFileSync('tests/fixtures/gp-stations-2026-10-12.json', 'utf8')));
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
    const iss = calculateSatellites(la, at, reviewedSnapshot).find((item) => item.status === 'available' && item.satellite.noradId === 25544);
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
    const fromDc = calculateSatellites(dc, at, reviewedSnapshot).find((item) => item.status === 'available' && item.satellite.noradId === 25544);
    if (fromDc?.status !== 'available') throw new Error('missing ISS');
    expect(fromDc.satellite.look.azimuthDeg).toBeCloseTo(83.8913, 3);
    expect(fromDc.satellite.look.elevationDeg).toBeCloseTo(-41.0609, 3);
    expect(fromDc.satellite.subpoint).toEqual(iss.satellite.subpoint);
  });

  test('keeps a six-digit NORAD id', () => {
    const soyuz = calculateSatellites(la, at, reviewedSnapshot).find((item) => item.status === 'available' && item.satellite.noradId === 100057);
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
    const stale = calculateSatellites(la, staleAt, reviewedSnapshot).find((item) => (item.status === 'available' ? item.satellite.noradId : item.noradId) === 25544);
    expect(stale?.status).toBe('available');
    if (stale?.status === 'available') expect(stale.satellite.freshness).toBe('stale');
    const hidden = calculateSatellites(la, oldAt, reviewedSnapshot).find((item) => item.status === 'unavailable' && item.noradId === 25544);
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
      snapshot: reviewedSnapshot,
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

  test('wide windows put details beside the view and phones use a bottom sheet', () => {
    const css = readFileSync('styles.css', 'utf8');
    expect(css).toMatch(/\.app\.sheet-open\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) 400px/);
    expect(css).toMatch(/\.sheet\s*\{[^}]*max-height:\s*62vh/);
    expect(css).toMatch(/min-height:\s*var\(--sg-touch\)/);
  });
});

describe('open data funnel', () => {
  test('space and earth records come from the bundled open snapshots', () => {
    const sky = skyCatalog(cityObserver(cities.la), new Date('2026-10-30T12:00:00.000Z'));
    const iss = sky.find((entity) => entity.id === 'norad-25544');
    const jupiter = sky.find((entity) => entity.id === 'jupiter');
    if (!iss || !jupiter) throw new Error('missing sky records');
    expect(iss.facts.join(' ')).toMatch(/Wikidata Q25271/);
    expect(iss.facts.join(' ')).toMatch(/National Aeronautics and Space Administration/);
    expect(jupiter.facts.join(' ')).toMatch(/NASA Images catalog PIA/);
    expect(jupiter.facts.join(' ')).toMatch(/not shown/);
    const earth = earthCatalog();
    expect(earth.some((entity) => entity.id.startsWith('wd-Q'))).toBe(true);
    expect(earth.some((entity) => entity.facts.join(' ').includes('CC BY-SA'))).toBe(true);
    const status = JSON.parse(readFileSync('data/snapshots/open-source-status.json', 'utf8')) as { sources: Array<{ id: string; result: string }> };
    expect(status.sources.find((source) => source.id === 'places')?.result).toBe('failed');
    const news = JSON.parse(readFileSync('data/snapshots/nasa-news.json', 'utf8')) as { records: Array<{ studentVisible: boolean }> };
    expect(news.records.every((record) => record.studentVisible === false)).toBe(true);
    expect(contentFor(jupiter, 'news', '6-8')[0]?.text).toMatch(/grade review/);
  });
});

describe('client boundaries', () => {
  test('application source never contacts providers and never stores coordinates', () => {
    const files = walk('src').filter((file) => file.endsWith('.ts'));
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    // The only network request is for this site's own published snapshot.
    const fetchers = files.filter((file) => /fetch\s*\(/.test(readFileSync(file, 'utf8'))).sort();
    expect(fetchers).toEqual([join('src', 'content', 'star-names.ts'), join('src', 'sky', 'live-data.ts')].sort());
    // Star names go only to the configured SkyGround service, with no cookies.
    const names = readFileSync(join('src', 'content', 'star-names.ts'), 'utf8');
    expect(names).toMatch(/STAR_NAMES_API/);
    expect(names.match(/credentials: 'omit'/g)?.length).toBe(3);
    expect(readFileSync(join('src', 'sky', 'live-data.ts'), 'utf8')).toMatch(/const PATH = '\.\/data\/gp-catalog\.json'/);
    expect(source).not.toMatch(/celestrak\.org\/NORAD|ssd-api\.jpl|api\.worldbank|query\.wikidata/);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/i);
    expect(source).not.toMatch(/data\/sky\.js|demo-iss/);
    expect(readFileSync('data/sky.js', 'utf8')).toMatch(/NOT live/);
  });

  test('location is read in one module, only from a tap, rounded, and kept in memory', () => {
    const files = walk('src').filter((file) => file.endsWith('.ts'));
    const users = files.filter((file) => /navigator\.geolocation/.test(readFileSync(file, 'utf8')));
    expect(users).toEqual([join('src', 'sensors', 'location.ts')]);
    const location = readFileSync(join('src', 'sensors', 'location.ts'), 'utf8');
    expect(location).toMatch(/Must be called from a tap/);
    expect(location).toMatch(/Math\.round\(latitude \* 1000\) \/ 1000/);
    expect(location).not.toMatch(/watchPosition/);
  });

  test('motion sensors live in one module and start only from a tap', () => {
    const files = walk('src').filter((file) => file.endsWith('.ts'));
    const users = files.filter((file) => /deviceorientation/i.test(readFileSync(file, 'utf8')));
    expect(users).toEqual([join('src', 'sensors', 'orientation.ts')]);
    const sensor = readFileSync(join('src', 'sensors', 'orientation.ts'), 'utf8');
    expect(sensor).toMatch(/requestPermission/);
    expect(sensor).toMatch(/Must be called from a tap/);
    const app = readFileSync(join('src', 'ui', 'explore', 'app.ts'), 'utf8');
    // The only calls to start the sensor are inside click handlers.
    expect(app.match(/sensor\.start\(\)/g)).toHaveLength(1);
    expect(app).toMatch(/async function toggleMotion/);
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
