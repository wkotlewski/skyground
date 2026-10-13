import type { Observer } from '../contracts';
import type { City } from '../content/cities';
import { cityObserver } from '../content/cities';

export interface DeviceFix {
  lat: number;
  lon: number;
  heightMeters: number;
}

/**
 * Choose an observer without storing coordinates.
 * A denied or skipped precise-location request always falls back to the city.
 * Device coordinates are not returned in that case, even if a reading was supplied.
 */
export function resolveObserver(input: {
  city: City;
  preciseRequested: boolean;
  permission: 'granted' | 'denied' | 'unavailable' | 'not-requested';
  device: DeviceFix | null;
}): { observer: Observer; status: 'city' | 'device' | 'denied' } {
  const allowed = input.preciseRequested && input.permission === 'granted' && input.device && finiteFix(input.device);
  if (allowed && input.device) {
    return {
      status: 'device',
      observer: {
        lat: input.device.lat,
        lon: input.device.lon,
        heightMeters: input.device.heightMeters,
        locationMode: 'device',
      },
    };
  }
  return {
    status: input.preciseRequested && input.permission === 'denied' ? 'denied' : 'city',
    observer: cityObserver(input.city),
  };
}

function finiteFix(fix: DeviceFix): boolean {
  return [fix.lat, fix.lon, fix.heightMeters].every(Number.isFinite) && Math.abs(fix.lat) <= 90 && Math.abs(fix.lon) <= 180;
}

export type OrientationResolution =
  | { mode: 'manual-north-up'; headingDeg: 0; reason: 'not-requested' | 'denied' | 'unavailable' }
  | { mode: 'sensor'; headingDeg: number };

/** Sensor heading is optional. Denial and missing sensors stay north-up. */
export function resolveOrientation(input: {
  requested: boolean;
  permission: 'granted' | 'denied' | 'unavailable';
  headingDeg: number | null;
}): OrientationResolution {
  if (!input.requested || input.permission !== 'granted' || input.headingDeg == null || !Number.isFinite(input.headingDeg)) {
    const reason = !input.requested ? 'not-requested' : input.permission === 'denied' ? 'denied' : 'unavailable';
    return { mode: 'manual-north-up', headingDeg: 0, reason };
  }
  const heading = ((input.headingDeg % 360) + 360) % 360;
  return { mode: 'sensor', headingDeg: heading };
}
