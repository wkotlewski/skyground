// Builds the compact star map used for the midnight sky.
// Input: d3-celestial data files (BSD-3-Clause, Olaf Frohn; star data from the HYG database, CC BY-SA).
// Usage from app/: node scripts/build-starmap.mjs <stars.6.json> <constellations.lines.json> <constellations.json>
import { readFile, writeFile } from 'node:fs/promises';

const [starsPath, linesPath, namesPath] = process.argv.slice(2);
const MAX_MAG = 5.2;
const ra = (lon) => Math.round((lon < 0 ? lon + 360 : lon) * 100) / 100;
const dec = (lat) => Math.round(lat * 100) / 100;

const stars = JSON.parse(await readFile(starsPath, 'utf8')).features
  .filter((feature) => feature.properties.mag <= MAX_MAG)
  .sort((a, b) => a.properties.mag - b.properties.mag);
const flat = [];
for (const star of stars) {
  const [lon, lat] = star.geometry.coordinates;
  flat.push(ra(lon), dec(lat), Math.round(star.properties.mag * 10) / 10, Math.round(Number(star.properties.bv || 0.6) * 10) / 10);
}
const names = new Map(JSON.parse(await readFile(namesPath, 'utf8')).features.map((f) => [f.id, { name: f.properties.name, at: f.geometry.coordinates, rank: Number(f.properties.rank) }]));
const constellations = JSON.parse(await readFile(linesPath, 'utf8')).features.map((feature) => {
  const info = names.get(feature.id);
  return {
    id: feature.id,
    name: info?.name ?? feature.id,
    rank: info?.rank ?? 3,
    label: info ? [ra(info.at[0]), dec(info.at[1])] : null,
    lines: feature.geometry.coordinates.map((line) => line.map(([lon, lat]) => [ra(lon), dec(lat)])),
  };
});
const out = {
  source: 'd3-celestial (BSD-3-Clause, Olaf Frohn). Star positions and magnitudes from the HYG database (CC BY-SA). J2000 coordinates.',
  sourceUrl: 'https://github.com/ofrohn/d3-celestial',
  stride: 4,
  fields: ['raDeg', 'decDeg', 'magnitude', 'colorIndexBV'],
  stars: flat,
  constellations,
};
await writeFile('data/sky/starmap.json', JSON.stringify(out));
console.log(`${stars.length} stars to magnitude ${MAX_MAG}, ${constellations.length} constellations.`);
