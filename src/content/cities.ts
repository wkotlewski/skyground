import type { Observer } from '../contracts';

/** City reference points for calculations. These are not a student's device location. */
export const cities = {
  la: {
    id: 'la',
    name: 'Los Angeles area',
    lat: 34.0522,
    lon: -118.2437,
    heightMeters: 89,
  },
  dc: {
    id: 'dc',
    name: 'Washington, DC',
    lat: 38.9072,
    lon: -77.0369,
    heightMeters: 22,
  },
} as const;

export type CityId = keyof typeof cities;
export type City = (typeof cities)[CityId];

export function cityObserver(city: City): Observer {
  return {
    lat: city.lat,
    lon: city.lon,
    heightMeters: city.heightMeters,
    locationMode: 'city',
  };
}
