export interface SkyRegion {
  id: string;
  label: string;
  minEl: number;
  maxEl: number;
  minAz: number;
  maxAz: number;
  wraps: boolean;
  /** When true, elevation must be greater than minEl. The horizon itself stays out of "above the horizon". */
  aboveMin: boolean;
}

export interface EarthRegion {
  id: string;
  label: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  cityId: 'la' | 'dc';
}

export const skyRegions: SkyRegion[] = [
  { id: 'above-horizon', label: 'Above the horizon', minEl: 0, maxEl: 90, minAz: 0, maxAz: 360, wraps: false, aboveMin: true },
  { id: 'near-overhead', label: 'Near overhead', minEl: 80, maxEl: 90, minAz: 0, maxAz: 360, wraps: false, aboveMin: false },
  { id: 'north', label: 'Northern sky', minEl: 0, maxEl: 90, minAz: 315, maxAz: 45, wraps: true, aboveMin: true },
  { id: 'east', label: 'Eastern sky', minEl: 0, maxEl: 90, minAz: 45, maxAz: 135, wraps: false, aboveMin: true },
  { id: 'south', label: 'Southern sky', minEl: 0, maxEl: 90, minAz: 135, maxAz: 225, wraps: false, aboveMin: true },
  { id: 'west', label: 'Western sky', minEl: 0, maxEl: 90, minAz: 225, maxAz: 315, wraps: false, aboveMin: true },
  { id: 'whole-sky', label: 'Whole sky, including below the horizon', minEl: -90, maxEl: 90, minAz: 0, maxAz: 360, wraps: false, aboveMin: false },
];

export const earthRegions: EarthRegion[] = [
  { id: 'los-angeles', label: 'Los Angeles area', minLat: 33.7, maxLat: 34.4, minLon: -118.7, maxLon: -117.9, cityId: 'la' },
  { id: 'washington', label: 'Washington, DC area', minLat: 38.8, maxLat: 39, minLon: -77.2, maxLon: -76.9, cityId: 'dc' },
];

export function skyRegionById(id: string): SkyRegion | undefined {
  return skyRegions.find((region) => region.id === id);
}

export function earthRegionById(id: string): EarthRegion | undefined {
  return earthRegions.find((region) => region.id === id);
}

export function inSkyRegion(azimuthDeg: number, elevationDeg: number, region: SkyRegion): boolean {
  const elevationOk = region.aboveMin
    ? elevationDeg > region.minEl && elevationDeg <= region.maxEl
    : elevationDeg >= region.minEl && elevationDeg <= region.maxEl;
  if (!elevationOk) return false;
  if (region.maxAz - region.minAz >= 360) return true;
  const azimuth = ((azimuthDeg % 360) + 360) % 360;
  if (region.wraps) return azimuth >= region.minAz || azimuth <= region.maxAz;
  return azimuth >= region.minAz && azimuth <= region.maxAz;
}

export function inEarthRegion(lat: number, lon: number, region: EarthRegion): boolean {
  return lat >= region.minLat && lat <= region.maxLat && lon >= region.minLon && lon <= region.maxLon;
}
