import type { Observer } from '../contracts';

/**
 * Asks the browser for the phone's position, only when the person taps a button.
 * The result is rounded to about 100 metres, kept in memory for sky calculations,
 * and never stored, logged, sent anywhere, or put in a link.
 */
export type LocationResult =
  | { status: 'ok'; observer: Observer }
  | { status: 'denied' | 'unavailable' | 'timeout' };

export function locationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/** Must be called from a tap or click. */
export function requestLocation(): Promise<LocationResult> {
  if (!locationSupported()) return Promise.resolve({ status: 'unavailable' });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, altitude } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          resolve({ status: 'unavailable' });
          return;
        }
        resolve({
          status: 'ok',
          observer: {
            lat: Math.round(latitude * 1000) / 1000,
            lon: Math.round(longitude * 1000) / 1000,
            heightMeters: altitude != null && Number.isFinite(altitude) ? Math.round(altitude) : 0,
            locationMode: 'device',
          },
        });
      },
      (error) => resolve({ status: error.code === error.PERMISSION_DENIED ? 'denied' : error.code === error.TIMEOUT ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60_000 },
    );
  });
}
