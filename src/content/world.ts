import land from '../../data/world/ne-110m-land.json';

export const WORLD_SOURCE = {
  name: land.name,
  license: land.license,
  sourceUrl: land.sourceUrl,
  fetchedAtUtc: land.fetchedAtUtc,
  reviewedAtUtc: land.reviewedAtUtc,
  note: land.note,
};

/** Equirectangular projection of the bundled Natural Earth land rings. */
export function projectLonLat(lon: number, lat: number): { x: number; y: number } {
  return { x: lon + 180, y: 90 - lat };
}

export function landPath(): string {
  return land.rings.map((ring) => {
    const commands = ring.map(([lon, lat], index) => {
      const point = projectLonLat(lon, lat);
      return `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    });
    return `${commands.join('')}Z`;
  }).join('');
}
