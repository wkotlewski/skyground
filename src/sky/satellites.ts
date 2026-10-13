import {
  SatRecError,
  degreesLat,
  degreesLong,
  degreesToRadians,
  eciToEcf,
  eciToGeodetic,
  ecfToLookAngles,
  gstime,
  json2satrec,
  propagate,
  radiansToDegrees,
} from './satellite-runtime';
import type { Coordinates, EarthSatellite, LookAngles, Observer, SatelliteProvider, Source } from '../contracts';
import snapshotJson from '../../data/snapshots/gp-stations.json';
import { normalizeLongitude } from '../geo';

export const SATELLITE_JS_VERSION = '7.1.0';
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const UNAVAILABLE_AFTER_MS = 72 * 60 * 60 * 1000;

const REQUIRED_OMM_KEYS = [
  'OBJECT_NAME',
  'OBJECT_ID',
  'EPOCH',
  'MEAN_MOTION',
  'ECCENTRICITY',
  'INCLINATION',
  'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER',
  'MEAN_ANOMALY',
  'NORAD_CAT_ID',
  'ELEMENT_SET_NO',
  'BSTAR',
  'MEAN_MOTION_DOT',
  'MEAN_MOTION_DDOT',
] as const;

export interface OmmRecord {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
  [key: string]: unknown;
}

export interface GpSnapshot {
  schemaVersion: number;
  provider: string;
  query: string;
  sourceUrl: string;
  format: string;
  fetchedAtUtc: string;
  reviewedAtUtc: string;
  reviewNote: string;
  policy: string;
  records: OmmRecord[];
}

export type SatelliteOutcome =
  | { status: 'available'; satellite: EarthSatellite; internationalDesignator: string; sharesElementsWith: string[]; inclinationDeg: number }
  | {
      status: 'unavailable';
      id: string;
      noradId: number;
      name: string;
      reason: string;
      epochUtc: string;
      snapshotFetchedAtUtc: string;
    };

export function parseEpochUtc(epoch: string): Date {
  const iso = epoch.endsWith('Z') ? epoch : `${epoch}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid orbital epoch');
  return date;
}

export function elementAgeMs(epochUtc: string, atUtc: Date): number {
  return Math.abs(atUtc.getTime() - parseEpochUtc(epochUtc).getTime());
}

export function freshnessForAge(ageMs: number): 'fresh' | 'stale' | 'unavailable' {
  if (ageMs >= UNAVAILABLE_AFTER_MS) return 'unavailable';
  if (ageMs >= STALE_AFTER_MS) return 'stale';
  return 'fresh';
}

export function validateOmm(value: unknown): OmmRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const key of REQUIRED_OMM_KEYS) {
    if (record[key] == null || record[key] === '') return null;
  }
  const norad = Number(record.NORAD_CAT_ID);
  if (!Number.isInteger(norad) || norad < 1) return null;
  const numericKeys = [
    'MEAN_MOTION',
    'ECCENTRICITY',
    'INCLINATION',
    'RA_OF_ASC_NODE',
    'ARG_OF_PERICENTER',
    'MEAN_ANOMALY',
    'BSTAR',
    'MEAN_MOTION_DOT',
    'MEAN_MOTION_DDOT',
    'ELEMENT_SET_NO',
  ] as const;
  if (!numericKeys.every((key) => Number.isFinite(Number(record[key])))) return null;
  try {
    parseEpochUtc(String(record.EPOCH));
  } catch {
    return null;
  }
  return { ...record, NORAD_CAT_ID: norad } as OmmRecord;
}

function snapshotSource(snapshot: GpSnapshot): Source {
  return {
    organization: snapshot.provider,
    url: snapshot.sourceUrl,
    fetchedAtUtc: snapshot.fetchedAtUtc,
    reviewedAtUtc: snapshot.reviewedAtUtc,
    rightsStatus: 'approved',
    license: 'public-service-terms',
    licenseUrl: 'https://celestrak.org/usage-policy.php',
  };
}

function elementKey(record: OmmRecord): string {
  return [record.EPOCH, record.MEAN_MOTION, record.ECCENTRICITY, record.INCLINATION, record.RA_OF_ASC_NODE, record.ARG_OF_PERICENTER, record.MEAN_ANOMALY, record.BSTAR].join('|');
}

function unavailable(record: OmmRecord, snapshot: GpSnapshot, reason: string): SatelliteOutcome {
  return {
    status: 'unavailable',
    id: `norad-${record.NORAD_CAT_ID}`,
    noradId: record.NORAD_CAT_ID,
    name: String(record.OBJECT_NAME),
    reason,
    epochUtc: parseEpochUtc(record.EPOCH).toISOString(),
    snapshotFetchedAtUtc: snapshot.fetchedAtUtc,
  };
}

export function propagateRecord(record: OmmRecord, observer: Observer, atUtc: Date, snapshot: GpSnapshot): SatelliteOutcome {
  const validated = validateOmm(record);
  if (!validated) {
    const norad = Number((record as OmmRecord).NORAD_CAT_ID);
    return {
      status: 'unavailable',
      id: `norad-${Number.isFinite(norad) ? norad : 'unknown'}`,
      noradId: Number.isFinite(norad) ? norad : 0,
      name: String(record.OBJECT_NAME ?? 'Unknown object'),
      reason: 'Orbital record is missing required fields.',
      epochUtc: '',
      snapshotFetchedAtUtc: snapshot.fetchedAtUtc,
    };
  }
  const age = elementAgeMs(validated.EPOCH, atUtc);
  const freshness = freshnessForAge(age);
  if (freshness === 'unavailable') {
    return unavailable(validated, snapshot, 'Orbital elements are more than 72 hours from the selected time, so no position is shown.');
  }
  let satrec;
  try {
    satrec = json2satrec(validated);
  } catch {
    return unavailable(validated, snapshot, 'These orbital elements could not be read.');
  }
  if (satrec.satnum !== String(validated.NORAD_CAT_ID)) {
    return unavailable(validated, snapshot, 'The catalog number was not preserved.');
  }
  const propagated = propagate(satrec, atUtc, { communityDecayCheckEnabled: true });
  if (!propagated || satrec.error !== SatRecError.None) {
    return unavailable(validated, snapshot, 'Propagation failed for the selected time, so no position is shown.');
  }
  const gmst = gstime(atUtc);
  const geodetic = eciToGeodetic(propagated.position, gmst);
  const latitude = degreesLat(geodetic.latitude);
  const longitude = normalizeLongitude(degreesLong(geodetic.longitude));
  const altitudeKm = geodetic.height;
  if (![latitude, longitude, altitudeKm].every(Number.isFinite) || altitudeKm < 0) {
    return unavailable(validated, snapshot, 'The propagated position is not a usable point above Earth.');
  }
  const ecf = eciToEcf(propagated.position, gmst);
  const look = ecfToLookAngles(
    {
      longitude: degreesToRadians(observer.lon),
      latitude: degreesToRadians(observer.lat),
      height: observer.heightMeters / 1000,
    },
    ecf,
  );
  const azimuthDeg = ((radiansToDegrees(look.azimuth) % 360) + 360) % 360;
  const elevationDeg = radiansToDegrees(look.elevation);
  if (!Number.isFinite(azimuthDeg) || !Number.isFinite(elevationDeg)) {
    return unavailable(validated, snapshot, 'Look angles could not be calculated.');
  }
  const lookAngles: LookAngles = {
    azimuthDeg,
    elevationDeg,
    calculatedAtUtc: atUtc.toISOString(),
    aboveHorizon: elevationDeg > 0,
    visibility: 'not-assessed',
  };
  const sharesElementsWith = snapshot.records
    .map((other) => validateOmm(other))
    .filter((other): other is OmmRecord => other != null && other.NORAD_CAT_ID !== validated.NORAD_CAT_ID && elementKey(other) === elementKey(validated))
    .map((other) => String(other.OBJECT_NAME));
  const satellite: EarthSatellite = {
    kind: 'satellite',
    id: `norad-${validated.NORAD_CAT_ID}`,
    noradId: validated.NORAD_CAT_ID,
    name: String(validated.OBJECT_NAME),
    epochUtc: parseEpochUtc(validated.EPOCH).toISOString(),
    snapshotFetchedAtUtc: snapshot.fetchedAtUtc,
    subpoint: { lat: latitude, lon: longitude },
    altitudeKm,
    look: lookAngles,
    freshness,
    source: snapshotSource(snapshot),
  };
  return {
    status: 'available',
    satellite,
    internationalDesignator: String(validated.OBJECT_ID),
    sharesElementsWith,
    inclinationDeg: Number(validated.INCLINATION),
  };
}

export function loadSnapshot(value: unknown = snapshotJson): GpSnapshot {
  if (!value || typeof value !== 'object') throw new RangeError('Orbital snapshot is not valid.');
  const snapshot = value as GpSnapshot;
  if (!Array.isArray(snapshot.records) || !snapshot.fetchedAtUtc || !snapshot.sourceUrl) {
    throw new RangeError('Orbital snapshot is not valid.');
  }
  return snapshot;
}

export function calculateSatellites(observer: Observer, atUtc: Date, snapshot: GpSnapshot = loadSnapshot()): SatelliteOutcome[] {
  if (Number.isNaN(atUtc.getTime())) throw new RangeError('Invalid calculation time');
  return snapshot.records.map((record) => propagateRecord(record, observer, atUtc, snapshot));
}

export function groundTrack(record: OmmRecord, start: Date, stepMinutes: number, count: number, snapshot: GpSnapshot): Coordinates[] {
  if (stepMinutes <= 0 || count < 1) throw new RangeError('Invalid ground-track sample');
  const points: Coordinates[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = new Date(start.getTime() + index * stepMinutes * 60 * 1000);
    const outcome = propagateRecord(record, { lat: 0, lon: 0, heightMeters: 0, locationMode: 'city' }, at, snapshot);
    if (outcome.status !== 'available') break;
    points.push(outcome.satellite.subpoint);
  }
  return points;
}

export const satelliteProvider: SatelliteProvider = {
  async calculate(observer, atUtc) {
    return calculateSatellites(observer, atUtc)
      .filter((outcome): outcome is Extract<SatelliteOutcome, { status: 'available' }> => outcome.status === 'available')
      .map((outcome) => outcome.satellite);
  },
};

export const reviewedSnapshot = loadSnapshot();
