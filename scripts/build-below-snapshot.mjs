// Builds the "What's below" pack: country and ocean outlines plus short Wikipedia excerpts.
// Run by hand from app/: node scripts/build-below-snapshot.mjs <countries.geojson> <marine.geojson>
// Inputs are Natural Earth 1:110m admin-0 countries and marine polygons (public domain).
// Each region's Wikipedia article must carry the Wikidata ID that Natural Earth lists for it.
// The history excerpt is the "History of ..." overview article when one exists.
// Wikipedia summaries are CC BY-SA 4.0 excerpts.
// One request per item, a short pause between, and no retry: a failed item is recorded as missing.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [countriesPath, marinePath] = process.argv.slice(2);
if (!countriesPath || !marinePath) {
  console.error('Usage: node scripts/build-below-snapshot.mjs <countries.geojson> <marine.geojson>');
  process.exit(1);
}
const UA = { 'user-agent': 'SkyGround education snapshot (https://wkotlewski.github.io/skyground/)' };
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const round = (value) => Math.round(value * 100) / 100;

function rings(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  // Keep outer rings and holes; the point-in-polygon test uses even-odd across all rings of a region.
  return polygons.flat().map((ring) => ring.map(([lon, lat]) => [round(lon), round(lat)]));
}

function bbox(allRings) {
  let west = 180, east = -180, south = 90, north = -90;
  for (const ring of allRings) for (const [lon, lat] of ring) {
    west = Math.min(west, lon); east = Math.max(east, lon); south = Math.min(south, lat); north = Math.max(north, lat);
  }
  return [west, south, east, north];
}

function titleCase(name) {
  return name === name.toUpperCase() ? name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : name;
}

const countries = JSON.parse(await readFile(countriesPath, 'utf8')).features.map((feature) => {
  const r = rings(feature.geometry);
  return { id: `c-${feature.properties.ADM0_A3}`, kind: 'country', name: feature.properties.NAME_EN || feature.properties.NAME, wikidata: feature.properties.WIKIDATAID, bbox: bbox(r), rings: r };
});
const marine = JSON.parse(await readFile(marinePath, 'utf8')).features.map((feature, index) => {
  const r = rings(feature.geometry);
  return { id: `m-${index}`, kind: feature.properties.featurecla, name: titleCase(feature.properties.name_en || feature.properties.name), wikidata: feature.properties.wikidataid, bbox: bbox(r), rings: r };
});
// Seas, gulfs, and bays sit inside oceans, so they are tested first.
marine.sort((a, b) => (a.kind === 'ocean') - (b.kind === 'ocean'));
const regions = [...countries, ...marine];

async function getJson(url) {
  try {
    const response = await fetch(url, { headers: UA });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function summary(title, expectItem) {
  if (!title) return null;
  const data = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`);
  await pause(1100);
  if (!data?.extract || data.type === 'disambiguation') return null;
  // The article must be the same Wikidata item Natural Earth names, so a look-alike title is never used.
  if (expectItem && data.wikibase_item !== expectItem) return null;
  return { title: data.title, extract: data.extract, url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`, wikidata: data.wikibase_item ?? null };
}

async function historyFor(title) {
  for (const candidate of [`History of ${title}`, `History of the ${title}`]) {
    const found = await summary(candidate, null);
    if (found && /^History of/i.test(found.title)) return found;
  }
  return null;
}

const retrievedAtUtc = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
// Reuse excerpts from the previous build, so a rerun only asks for what is still missing.
let previous = {};
try {
  previous = JSON.parse(await readFile(resolve('data/below/articles.json'), 'utf8')).articles ?? {};
} catch {
  previous = {};
}
const articles = {};
let missing = 0;
for (const region of regions) {
  if (!region.wikidata || articles[region.wikidata]) continue;
  const before = previous[region.wikidata] ?? {};
  let intro = before.intro ?? null;
  // Try the plain name first, then common article titles for countries whose name is shared with something else.
  for (const title of [region.name, `${region.name} (country)`, `Republic of ${region.name}`]) {
    if (intro) break;
    intro = await summary(title, region.wikidata);
  }
  const history = before.history ?? (intro && region.kind === 'country' ? await historyFor(intro.title) : null);
  if (!intro) missing += 1;
  articles[region.wikidata] = { intro, history };
}

const regionsOut = {
  schemaVersion: 1,
  source: 'Natural Earth 1:110m admin-0 countries and marine polygons',
  sourceUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
  license: 'Public domain',
  note: 'Generalized outlines for naming the region below a point. Borders are approximate and are not a statement on disputed territory.',
  regions: regions.map(({ id, kind, name, wikidata, bbox: box, rings: r }) => ({ id, kind, name, wikidata, bbox: box, rings: r })),
};
const articlesOut = {
  schemaVersion: 1,
  provider: 'Wikipedia page summaries, matched to Natural Earth Wikidata IDs',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  retrievedAtUtc,
  note: 'Article summaries as published by Wikipedia. Each excerpt links to its article. History excerpts are overviews of a region, not events linked to any satellite.',
  articles,
};
await writeFile(resolve('data/below/regions.json'), `${JSON.stringify(regionsOut)}\n`);
await writeFile(resolve('data/below/articles.json'), `${JSON.stringify(articlesOut, null, 1)}\n`);
console.log(`${regions.length} regions, ${Object.keys(articles).length} linked articles, ${missing} without an introduction.`);
