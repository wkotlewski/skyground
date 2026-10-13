/** Horizon chart: north is up, east is right, center is overhead, rim is the horizon. */
export function horizonChartPosition(
  azimuthDeg: number,
  elevationDeg: number,
  center = 200,
  radius = 155,
): { x: number; y: number } | null {
  if (!Number.isFinite(azimuthDeg) || !Number.isFinite(elevationDeg) || elevationDeg < 0 || elevationDeg > 90) return null;
  const radial = (radius * (90 - elevationDeg)) / 90;
  const azimuth = (azimuthDeg * Math.PI) / 180;
  return {
    x: center + radial * Math.sin(azimuth),
    y: center - radial * Math.cos(azimuth),
  };
}

export const NEAR_OVERHEAD_ELEVATION_DEG = 80;
