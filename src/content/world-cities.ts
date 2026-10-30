import type { Observer } from '../contracts';

/**
 * City reference points for sky calculations. Choosing a city never reads the phone's location.
 * Coordinates are city centres rounded to 0.01°; heights are approximate city elevations.
 * Pointing the phone works best when the chosen city is the one you are standing in.
 */
export interface ReferenceCity {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  heightMeters: number;
}

export const WORLD_CITIES: ReferenceCity[] = [
  { id: 'la', name: 'Los Angeles', country: 'United States', lat: 34.0522, lon: -118.2437, heightMeters: 89 },
  { id: 'dc', name: 'Washington, DC', country: 'United States', lat: 38.9072, lon: -77.0369, heightMeters: 22 },
  { id: 'new-york', name: 'New York', country: 'United States', lat: 40.71, lon: -74.01, heightMeters: 10 },
  { id: 'chicago', name: 'Chicago', country: 'United States', lat: 41.88, lon: -87.63, heightMeters: 181 },
  { id: 'houston', name: 'Houston', country: 'United States', lat: 29.76, lon: -95.37, heightMeters: 15 },
  { id: 'denver', name: 'Denver', country: 'United States', lat: 39.74, lon: -104.99, heightMeters: 1609 },
  { id: 'seattle', name: 'Seattle', country: 'United States', lat: 47.61, lon: -122.33, heightMeters: 50 },
  { id: 'san-francisco', name: 'San Francisco', country: 'United States', lat: 37.77, lon: -122.42, heightMeters: 16 },
  { id: 'san-diego', name: 'San Diego', country: 'United States', lat: 32.72, lon: -117.16, heightMeters: 19 },
  { id: 'phoenix', name: 'Phoenix', country: 'United States', lat: 33.45, lon: -112.07, heightMeters: 331 },
  { id: 'atlanta', name: 'Atlanta', country: 'United States', lat: 33.75, lon: -84.39, heightMeters: 320 },
  { id: 'miami', name: 'Miami', country: 'United States', lat: 25.76, lon: -80.19, heightMeters: 2 },
  { id: 'boston', name: 'Boston', country: 'United States', lat: 42.36, lon: -71.06, heightMeters: 43 },
  { id: 'anchorage', name: 'Anchorage', country: 'United States', lat: 61.22, lon: -149.9, heightMeters: 31 },
  { id: 'honolulu', name: 'Honolulu', country: 'United States', lat: 21.31, lon: -157.86, heightMeters: 6 },
  { id: 'toronto', name: 'Toronto', country: 'Canada', lat: 43.65, lon: -79.38, heightMeters: 76 },
  { id: 'vancouver', name: 'Vancouver', country: 'Canada', lat: 49.28, lon: -123.12, heightMeters: 70 },
  { id: 'mexico-city', name: 'Mexico City', country: 'Mexico', lat: 19.43, lon: -99.13, heightMeters: 2240 },
  { id: 'bogota', name: 'Bogotá', country: 'Colombia', lat: 4.71, lon: -74.07, heightMeters: 2640 },
  { id: 'lima', name: 'Lima', country: 'Peru', lat: -12.05, lon: -77.04, heightMeters: 154 },
  { id: 'sao-paulo', name: 'São Paulo', country: 'Brazil', lat: -23.55, lon: -46.63, heightMeters: 760 },
  { id: 'buenos-aires', name: 'Buenos Aires', country: 'Argentina', lat: -34.6, lon: -58.38, heightMeters: 25 },
  { id: 'london', name: 'London', country: 'United Kingdom', lat: 51.51, lon: -0.13, heightMeters: 11 },
  { id: 'paris', name: 'Paris', country: 'France', lat: 48.86, lon: 2.35, heightMeters: 35 },
  { id: 'madrid', name: 'Madrid', country: 'Spain', lat: 40.42, lon: -3.7, heightMeters: 657 },
  { id: 'berlin', name: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.4, heightMeters: 34 },
  { id: 'warsaw', name: 'Warsaw', country: 'Poland', lat: 52.23, lon: 21.01, heightMeters: 100 },
  { id: 'rome', name: 'Rome', country: 'Italy', lat: 41.9, lon: 12.5, heightMeters: 21 },
  { id: 'stockholm', name: 'Stockholm', country: 'Sweden', lat: 59.33, lon: 18.07, heightMeters: 28 },
  { id: 'istanbul', name: 'Istanbul', country: 'Türkiye', lat: 41.01, lon: 28.98, heightMeters: 39 },
  { id: 'cairo', name: 'Cairo', country: 'Egypt', lat: 30.04, lon: 31.24, heightMeters: 23 },
  { id: 'lagos', name: 'Lagos', country: 'Nigeria', lat: 6.52, lon: 3.38, heightMeters: 41 },
  { id: 'nairobi', name: 'Nairobi', country: 'Kenya', lat: -1.29, lon: 36.82, heightMeters: 1795 },
  { id: 'johannesburg', name: 'Johannesburg', country: 'South Africa', lat: -26.2, lon: 28.05, heightMeters: 1753 },
  { id: 'dubai', name: 'Dubai', country: 'United Arab Emirates', lat: 25.2, lon: 55.27, heightMeters: 5 },
  { id: 'mumbai', name: 'Mumbai', country: 'India', lat: 19.08, lon: 72.88, heightMeters: 14 },
  { id: 'delhi', name: 'Delhi', country: 'India', lat: 28.61, lon: 77.21, heightMeters: 216 },
  { id: 'singapore', name: 'Singapore', country: 'Singapore', lat: 1.35, lon: 103.82, heightMeters: 15 },
  { id: 'manila', name: 'Manila', country: 'Philippines', lat: 14.6, lon: 120.98, heightMeters: 7 },
  { id: 'beijing', name: 'Beijing', country: 'China', lat: 39.9, lon: 116.41, heightMeters: 44 },
  { id: 'seoul', name: 'Seoul', country: 'South Korea', lat: 37.57, lon: 126.98, heightMeters: 38 },
  { id: 'tokyo', name: 'Tokyo', country: 'Japan', lat: 35.68, lon: 139.69, heightMeters: 40 },
  { id: 'sydney', name: 'Sydney', country: 'Australia', lat: -33.87, lon: 151.21, heightMeters: 58 },
  { id: 'auckland', name: 'Auckland', country: 'New Zealand', lat: -36.85, lon: 174.76, heightMeters: 196 },
];

export function cityById(id: string): ReferenceCity {
  return WORLD_CITIES.find((city) => city.id === id) ?? WORLD_CITIES[0];
}

export function observerFor(city: ReferenceCity): Observer {
  return { lat: city.lat, lon: city.lon, heightMeters: city.heightMeters, locationMode: 'city' };
}
