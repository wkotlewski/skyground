// Shared ingestion for open data snapshots.
// One request per source. A failed source is recorded and not retried.
// This does not call CelesTrak. Do not run it from a student's browser.

import { spawnSync } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fetchedAtUtc = new Date().toISOString();
const outDir = resolve('data/snapshots');
mkdirSync(outDir, { recursive: true });

const status = [];

function curl(args, { binary = false } = {}) {
  const result = spawnSync('curl', ['-sS', '-A', 'SkyGround educational snapshot/0.1', '--retry', '0', '--max-time', '70', '-w', '\n%{http_code}', ...args], {
    encoding: binary ? 'buffer' : 'utf8',
    maxBuffer: 30_000_000,
  });
  const output = binary ? result.stdout : Buffer.from(result.stdout ?? '');
  const text = output.toString('utf8');
  const breakAt = text.lastIndexOf('\n');
  const code = text.slice(breakAt + 1).trim();
  const body = binary ? output.subarray(0, breakAt) : text.slice(0, breakAt);
  if (result.status !== 0 || code !== '200') {
    const error = (result.stderr || '').toString().trim();
    return { ok: false, error: error || `HTTP ${code || 'none'}. No retry.` };
  }
  return { ok: true, body };
}

function writeJson(name, value) {
  const path = resolve(outDir, name);
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

function record(id, result, extra = {}) {
  status.push({ id, result, ...extra });
  console.log(`${id}: ${result}${extra.detail ? ` (${extra.detail})` : ''}`);
}

const sparql = `
SELECT ?item ?itemLabel ?class ?norad ?operatorLabel ?coord ?kind WHERE {
  {
    VALUES ?norad { "25544" "48274" "69180" "100057" "100882" }
    ?item wdt:P377 ?norad .
    BIND("satellite" AS ?class)
    OPTIONAL { ?item wdt:P137 ?operator }
  }
  UNION
  {
    SERVICE wikibase:around {
      ?item wdt:P625 ?coord .
      bd:serviceParam wikibase:center "Point(-118.2437 34.0522)"^^geo:wktLiteral .
      bd:serviceParam wikibase:radius "22" .
    }
    VALUES ?kind { wd:Q33506 wd:Q3918 wd:Q62832 wd:Q5003624 }
    ?item wdt:P31 ?kind .
    BIND("place" AS ?class)
  }
  UNION
  {
    SERVICE wikibase:around {
      ?item wdt:P625 ?coord .
      bd:serviceParam wikibase:center "Point(-77.0369 38.9072)"^^geo:wktLiteral .
      bd:serviceParam wikibase:radius "22" .
    }
    VALUES ?kind { wd:Q33506 wd:Q3918 wd:Q62832 wd:Q5003624 }
    ?item wdt:P31 ?kind .
    BIND("place" AS ?class)
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 160
`;

const wikidata = curl([
  '-H', 'Accept: application/sparql-results+json',
  '-G', 'https://query.wikidata.org/sparql',
  '--data-urlencode', `query=${sparql}`,
]);
let entities = null;
if (!wikidata.ok) record('entity-facts', 'failed', { detail: wikidata.error });
else {
  try {
    entities = JSON.parse(wikidata.body);
    if (!entities.results?.bindings?.length) throw new Error('Wikidata returned no rows.');
  } catch (error) {
    entities = null;
    record('entity-facts', 'failed', { detail: error.message });
  }
}

const categories = {
  Q33506: 'museums',
  Q3918: 'colleges',
  Q62832: 'space',
  Q5003624: 'history',
};
const la = { lat: 34.0522, lon: -118.2437 };
const dc = { lat: 38.9072, lon: -77.0369 };

function qid(uri = '') {
  const id = uri.split('/').pop() ?? '';
  return /^Q\d+$/.test(id) ? id : '';
}

function point(value = '') {
  const match = /^Point\(([-\d.]+) ([-\d.]+)\)$/.exec(value);
  if (!match) return null;
  const lon = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function closerRegion(coord) {
  const distance = (city) => (coord.lat - city.lat) ** 2 + (coord.lon - city.lon) ** 2;
  return distance(la) <= distance(dc) ? 'los-angeles' : 'washington-dc';
}

let satelliteRecords = [];
let placeRecords = [];
if (entities) {
  const satellites = new Map();
  const places = new Map();
  for (const row of entities.results.bindings) {
    const id = qid(row.item?.value);
    const label = row.itemLabel?.value ?? '';
    if (!id || !label || label === id) continue;
    if (row.class?.value === 'satellite' && row.norad?.value) {
      const current = satellites.get(row.norad.value) ?? [];
      let item = current.find((entry) => entry.wikidataId === id);
      if (!item) {
        item = { wikidataId: id, label, operators: [], launch: '' };
        current.push(item);
      }
      const operator = row.operatorLabel?.value ?? '';
      if (operator && !operator.startsWith('Q') && !item.operators.includes(operator)) item.operators.push(operator);
      const launch = row.launch?.value ?? '';
      if (launch && !item.launch) item.launch = launch.slice(0, 10);
      satellites.set(row.norad.value, current);
    }
    if (row.class?.value === 'place') {
      const coord = point(row.coord?.value);
      if (!coord) continue;
      const current = places.get(id) ?? {
        wikidataId: id,
        name: label,
        lat: coord.lat,
        lon: coord.lon,
        categories: [],
        region: closerRegion(coord),
      };
      const category = categories[qid(row.kind?.value)];
      if (category && !current.categories.includes(category)) current.categories.push(category);
      places.set(id, current);
    }
  }
  satelliteRecords = [...satellites.entries()].map(([noradId, items]) => ({ noradId, items }));
  const caps = { museums: 6, colleges: 6, space: 6, history: 6 };
  const counts = { 'los-angeles': { ...caps, museums: 0, colleges: 0, space: 0, history: 0 }, 'washington-dc': { museums: 0, colleges: 0, space: 0, history: 0 } };
  const named = new Set(['griffith observatory', 'california institute of technology', 'jet propulsion laboratory', 'national air and space museum', 'howard university', 'lincoln memorial']);
  placeRecords = [...places.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((place) => {
      if (!place.categories.length) place.categories.push('museums');
      if (named.has(place.name.toLowerCase())) return true;
      const category = place.categories[0];
      const bucket = counts[place.region];
      if (!bucket || bucket[category] >= caps[category]) return false;
      bucket[category] += 1;
      return true;
    });
  if (!satelliteRecords.some((record) => record.noradId === '25544')) {
    record('entity-facts', 'failed', { detail: 'Wikidata did not return SCN 25544.' });
    satelliteRecords = [];
    placeRecords = [];
  } else {
    writeJson('wikidata-entities.json', {
      schemaVersion: 1,
      provider: 'Wikidata',
      license: 'CC0',
      sourceUrl: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
      queryUrl: 'https://query.wikidata.org/',
      propertyNotes: 'P377 is the satellite catalog number. Place coordinates are P625. Values are not converted.',
      fetchedAtUtc,
      reviewedAtUtc: fetchedAtUtc,
      reviewNote: 'Checked that identifiers and coordinates parsed. This is not a grade review.',
      satellites: satelliteRecords,
      places: placeRecords,
    });
    record('entity-facts', 'written', { detail: `${satelliteRecords.length} catalog numbers, ${placeRecords.length} places` });
  }
}

const articles = placeRecords.slice(0, 12);
if (!articles.length) record('place-context', 'skipped', { detail: 'No Wikidata places were available for Wikipedia context.' });
else {
  const titles = articles.map((place) => place.name).join('|');
  const wiki = curl([
    '-G', 'https://en.wikipedia.org/w/api.php',
    '--data-urlencode', 'action=query',
    '--data-urlencode', 'format=json',
    '--data-urlencode', 'prop=extracts',
    '--data-urlencode', 'exintro=1',
    '--data-urlencode', 'explaintext=1',
    '--data-urlencode', 'redirects=1',
    '--data-urlencode', `titles=${titles}`,
  ]);
  if (!wiki.ok) record('place-context', 'failed', { detail: wiki.error });
  else {
    try {
      const payload = JSON.parse(wiki.body);
      const pages = Object.values(payload.query?.pages ?? {});
      const records = pages
        .filter((page) => page.extract && page.title && !page.missing)
        .map((page) => {
          const text = page.extract.replace(/\s+/g, ' ').trim().slice(0, 320);
          const article = placeRecords.find((place) => place.name.toLowerCase() === page.title.toLowerCase());
          return {
            title: page.title,
            wikidataId: article?.wikidataId ?? '',
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title).replace(/%20/g, '_')}`,
            extract: text,
          };
        })
        .filter((page) => page.wikidataId);
      if (!records.length) throw new Error('Wikipedia returned no matching extracts.');
      writeJson('wikipedia-context.json', {
        schemaVersion: 1,
        provider: 'MediaWiki',
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        sourceUrl: 'https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content',
        fetchedAtUtc,
        reviewedAtUtc: fetchedAtUtc,
        reviewNote: 'Short introductions with attribution. Not historic-event records and not a grade review.',
        records,
      });
      record('place-context', 'written', { detail: `${records.length} extracts` });
    } catch (error) {
      record('place-context', 'failed', { detail: error.message });
    }
  }
}

const gibsPath = resolve(outDir, 'gibs-blue-marble.jpg');
const gibsTemporary = `${gibsPath}.tmp`;
const gibsUrl = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_NextGeneration&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=640&HEIGHT=320&TIME=2004-08-01';
const gibsDownload = spawnSync('curl', ['-sS', '-A', 'SkyGround educational snapshot/0.1', '--retry', '0', '--max-time', '70', '-o', gibsTemporary, '-w', '%{http_code}', gibsUrl], { encoding: 'utf8' });
const gibsCode = (gibsDownload.stdout ?? '').trim();
if (gibsDownload.status !== 0 || gibsCode !== '200') {
  record('earth-imagery', 'failed', { detail: `HTTP ${gibsCode || 'none'}. No retry.` });
} else {
  renameSync(gibsTemporary, gibsPath);
  writeJson('gibs-imagery.json', {
    schemaVersion: 1,
    provider: 'NASA GIBS',
    layer: 'BlueMarble_NextGeneration',
    time: '2004-08-01',
    projection: 'EPSG:4326',
    license: 'layer-specific',
    sourceUrl: 'https://nasa-gibs.github.io/gibs-api-docs/',
    attribution: 'NASA GIBS Blue Marble Next Generation, 2004-08-01',
    note: 'A dated global image bundled with this page. Not a live view and not a view from a selected spacecraft.',
    image: 'gibs-blue-marble.jpg',
    fetchedAtUtc,
    reviewedAtUtc: fetchedAtUtc,
  });
  record('earth-imagery', 'written', { detail: 'Blue Marble 2004-08-01' });
}

const nasa = curl(['https://images-api.nasa.gov/search?q=Jupiter&media_type=image&page_size=5']);
if (!nasa.ok) record('space-media', 'failed', { detail: nasa.error });
else {
  try {
    const payload = JSON.parse(nasa.body);
    const records = (payload.collection?.items ?? []).map((item) => {
      const data = item.data?.[0] ?? {};
      if (!data.nasa_id || !data.title) return null;
      return {
        nasaId: data.nasa_id,
        title: data.title,
        dateCreated: data.date_created ?? '',
        url: `https://images.nasa.gov/details/${encodeURIComponent(data.nasa_id)}`,
        studentVisible: false,
        gradeReview: 'not-reviewed',
      };
    }).filter(Boolean);
    if (!records.length) throw new Error('NASA Images returned no records.');
    writeJson('nasa-images.json', {
      schemaVersion: 1,
      provider: 'NASA Images',
      license: 'asset-specific',
      sourceUrl: 'https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf',
      fetchedAtUtc,
      reviewedAtUtc: fetchedAtUtc,
      reviewNote: 'Catalog pointers only. The image file is not bundled and is not shown. Rights are asset-specific.',
      records,
    });
    record('space-media', 'stored-hidden', { detail: `${records.length} pointers, not shown` });
  } catch (error) {
    record('space-media', 'failed', { detail: error.message });
  }
}

const news = curl(['https://www.nasa.gov/feed/']);
if (!news.ok) record('news', 'failed', { detail: news.error });
else if (!news.body.includes('<item>') && !news.body.includes('<entry>')) record('news', 'failed', { detail: 'The feed had no items. No retry.' });
else {
  const items = [...news.body.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5).map((match) => {
    const block = match[1];
    const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() ?? '';
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? '';
    const date = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    if (!title || !link.startsWith('https://')) return null;
    return { title, url: link, published: date, studentVisible: false, gradeReview: 'not-reviewed' };
  }).filter(Boolean);
  if (!items.length) record('news', 'failed', { detail: 'No HTTPS titles parsed. No retry.' });
  else {
    writeJson('nasa-news.json', {
      schemaVersion: 1,
      provider: 'NASA News',
      license: 'publisher-page',
      sourceUrl: 'https://www.nasa.gov/news/',
      fetchedAtUtc,
      reviewNote: 'Titles and links only. Hidden until a grade review. Full articles are not stored.',
      records: items,
    });
    record('news', 'stored-hidden', { detail: `${items.length} titles, not shown` });
  }
}

if (!process.argv.includes('--include-overpass')) {
  record('places', 'failed', { detail: 'The OpenStreetMap request on 2026-10-13 returned a non-JSON error page. It was not retried. Pass --include-overpass to make one new manual request.' });
} else {
const overpass = curl([
  '-X', 'POST', 'https://overpass-api.de/api/interpreter',
  '--data-urlencode', 'data=[out:json][timeout:25];(nwr(around:15000,34.0522,-118.2437)[tourism=museum][name];nwr(around:15000,38.9072,-77.0369)[tourism=museum][name];);out center tags 20;',
]);
if (!overpass.ok) record('places', 'failed', { detail: `${overpass.error} No retry. OpenStreetMap snapshot was not written.` });
else {
  try {
    const payload = JSON.parse(overpass.body);
    const records = (payload.elements ?? []).map((element) => {
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      const name = element.tags?.name;
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        id: `osm-${element.type}-${element.id}`,
        name,
        lat,
        lon,
        categories: ['museums'],
        locationNote: 'OpenStreetMap node or center. Not a survey mark.',
      };
    }).filter(Boolean);
    if (!records.length) throw new Error('Overpass returned no named museums.');
    writeJson('osm-places.json', {
      schemaVersion: 1,
      provider: 'OpenStreetMap',
      license: 'ODbL-1.0',
      sourceUrl: 'https://www.openstreetmap.org/copyright',
      attribution: '© OpenStreetMap contributors',
      fetchedAtUtc,
      reviewedAtUtc: fetchedAtUtc,
      records,
    });
    record('places', 'written', { detail: `${records.length} museums` });
  } catch (error) {
    record('places', 'failed', { detail: `${error.message} No retry.` });
  }
}
}

writeJson('open-source-status.json', {
  schemaVersion: 1,
  fetchedAtUtc,
  note: 'One request per source. Failures were not retried. CelesTrak, Natural Earth, and the planet-size snapshot are refreshed by their own reviewed files.',
  sources: status,
});

if (status.some((item) => item.result === 'failed')) process.exitCode = 1;
