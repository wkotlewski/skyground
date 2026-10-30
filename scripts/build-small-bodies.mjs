// Builds the asteroid and dwarf-planet pack from NASA JPL's Small-Body Database (public domain, U.S. Government).
// One request per body, a pause between, and no retry: a failed body stops the build without writing.
// Usage from app/: node scripts/build-small-bodies.mjs
import { writeFile } from 'node:fs/promises';

const BODIES = [
  { sstr: '1', id: 'ceres', note: 'The largest object in the asteroid belt, and a dwarf planet. NASA’s Dawn spacecraft orbited it from 2015 to 2018 and found bright salt deposits.' },
  { sstr: '4', id: 'vesta', note: 'The brightest asteroid and the only one sometimes visible without a telescope. Dawn orbited it in 2011 and 2012. Some meteorites found on Earth came from Vesta.' },
  { sstr: '2', id: 'pallas', note: 'The third-largest object in the asteroid belt, on a steeply tilted orbit.' },
  { sstr: '3', id: 'juno', note: 'One of the first four asteroids ever discovered, found in 1804.' },
  { sstr: '10', id: 'hygiea', note: 'The fourth-largest asteroid, almost round enough to count as a dwarf planet.' },
  { sstr: '16', id: 'psyche', note: 'A metal-rich asteroid. NASA’s Psyche spacecraft launched in 2023 and is on its way there.' },
  { sstr: '433', id: 'eros', note: 'A near-Earth asteroid. NEAR Shoemaker landed on it in 2001, the first landing on an asteroid.' },
  { sstr: '101955', id: 'bennu', note: 'A near-Earth asteroid. NASA’s OSIRIS-REx collected a sample from it and returned it to Earth in 2023.' },
  { sstr: '99942', id: 'apophis', note: 'A near-Earth asteroid that will pass closer than geostationary satellites on April 13, 2029. It will not hit Earth then.' },
];

const pause = () => new Promise((done) => setTimeout(done, 1200));
const out = [];
for (const body of BODIES) {
  const response = await fetch(`https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${body.sstr}&phys-par=1&full-prec=1`);
  if (!response.ok) {
    console.error(`JPL returned HTTP ${response.status} for ${body.sstr}. Nothing was written. No retry.`);
    process.exit(1);
  }
  const data = await response.json();
  const el = Object.fromEntries(data.orbit.elements.map((item) => [item.name, Number(item.value)]));
  const diameter = data.phys_par?.find((item) => item.name === 'diameter');
  const extent = data.phys_par?.find((item) => item.name === 'extent');
  out.push({
    id: body.id,
    name: data.object.shortname.replace(/^\d+\s+/, ''),
    designation: data.object.fullname.trim(),
    kind: data.object.kind,
    neo: Boolean(data.object.neo),
    pha: Boolean(data.object.pha),
    epochJd: Number(data.orbit.epoch),
    a: el.a,
    e: el.e,
    i: el.i,
    om: el.om,
    w: el.w,
    ma: el.ma,
    n: el.n,
    diameterKm: diameter ? Number(diameter.value) : null,
    extentKm: extent ? extent.value : null,
    note: body.note,
    sourceUrl: `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${body.sstr}`,
  });
  await pause();
}
const pack = {
  source: 'NASA JPL Small-Body Database. Osculating heliocentric elements, ecliptic J2000. U.S. Government work, public domain.',
  sourceUrl: 'https://ssd-api.jpl.nasa.gov/doc/sbdb.html',
  fetchedAtUtc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  bodies: out,
};
await writeFile('data/sky/small-bodies.json', `${JSON.stringify(pack, null, 1)}\n`);
console.log(`${out.length} small bodies written.`);
