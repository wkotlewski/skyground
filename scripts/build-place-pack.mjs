// Builds the place profiles (World Bank indicators, CC BY 4.0) and country timelines (Wikidata, CC0)
// for the country cards. One request per indicator and one per Wikidata query, no retries.
// Usage from app/: node scripts/build-place-pack.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const UA = { 'user-agent': 'SkyGround education snapshot (https://wkotlewski.github.io/skyground/)' };
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

const INDICATORS = {
  population: 'SP.POP.TOTL',
  under15: 'SP.POP.0014.TO.ZS',
  urban: 'SP.URB.TOTL.IN.ZS',
  gdpPerPerson: 'NY.GDP.PCAP.CD',
  unemployment: 'SL.UEM.TOTL.ZS',
  poverty: 'SI.POV.DDAY',
  primaryCompletion: 'SE.PRM.CMPT.ZS',
  literacy: 'SE.ADT.LITR.ZS',
  tertiary: 'SE.TER.ENRR',
  lifeExpectancy: 'SP.DYN.LE00.IN',
  childMortality: 'SH.DYN.MORT',
  electricity: 'EG.ELC.ACCS.ZS',
  internet: 'IT.NET.USER.ZS',
};

// Natural Earth codes that differ from World Bank codes.
const NE_TO_WB = { KOS: 'XKX', SDS: 'SSD', PSX: 'PSE', SAH: 'ESH', CYN: null, SOL: null };

const EVENT_TYPES = {
  Q198: 'War', Q178561: 'Battle', Q10931: 'Revolution', Q7944: 'Earthquake', Q131569: 'Treaty', Q3839081: 'Disaster',
  Q8065: 'Natural disaster', Q124734: 'Uprising', Q1261499: 'Naval battle', Q2223653: 'Terrorist attack', Q1006311: 'War of independence',
  Q12184: 'Pandemic', Q45382: 'Coup', Q8463: 'Civil war', Q625298: 'Independence', Q159821: 'Olympic Games', Q82414: 'Winter Olympics',
  Q1460420: 'Exhibition', Q93288: 'Contract', Q190928: 'Shipwreck', Q168983: 'Conflagration', Q1190554: 'Event', Q2380335: 'Tropical cyclone', Q47231: 'Flood',
};

async function sparql(query) {
  const response = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, { headers: { ...UA, accept: 'application/sparql-results+json' } });
  if (!response.ok) throw new Error(`Wikidata returned HTTP ${response.status}. Nothing was written. No retry.`);
  return (await response.json()).results.bindings;
}

const qid = (uri) => uri.split('/').pop();
const year = (iso) => {
  const match = /^(-?)0*(\d+)-/.exec(iso);
  return match ? Number(`${match[1]}${match[2]}`) : null;
};

// World Bank: most recent non-empty value per country.
const profiles = {};
for (const [key, code] of Object.entries(INDICATORS)) {
  const response = await fetch(`https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&mrnev=1&per_page=500`, { headers: UA });
  if (!response.ok) {
    console.error(`World Bank returned HTTP ${response.status} for ${code}. Nothing was written. No retry.`);
    process.exit(1);
  }
  const [, rows] = await response.json();
  for (const row of rows ?? []) {
    if (row.value == null || !/^[A-Z]{3}$/.test(row.countryiso3code ?? '')) continue;
    profiles[row.countryiso3code] ??= {};
    profiles[row.countryiso3code][key] = { value: row.value, year: Number(row.date) };
  }
  await pause(800);
}

// Wikidata: notable dated events per country, and when each country was founded.
const types = Object.keys(EVENT_TYPES).map((id) => `wd:${id}`).join(' ');
const events = await sparql(`SELECT ?country ?event ?eventLabel ?type ?date ?links ?article WHERE {
  VALUES ?type { ${types} }
  ?event wdt:P31 ?type ; wdt:P17 ?country ; wikibase:sitelinks ?links .
  FILTER(?links >= 28)
  OPTIONAL { ?event wdt:P585 ?d1 } OPTIONAL { ?event wdt:P580 ?d2 }
  BIND(COALESCE(?d1, ?d2) AS ?date)
  FILTER(BOUND(?date) && ?date < NOW())
  ?article schema:about ?event ; schema:isPartOf <https://en.wikipedia.org/> .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`);
await pause(3000);
const founded = await sparql(`SELECT ?country ?inception WHERE { VALUES ?class { wd:Q6256 wd:Q3624078 } ?country wdt:P31 ?class ; wdt:P571 ?inception . }`);

const timelines = {};
const seen = new Set();
for (const row of events) {
  const country = qid(row.country.value);
  const id = qid(row.event.value);
  const when = year(row.date.value);
  if (when == null || seen.has(`${country}:${id}`) || /^Q\d+$/.test(row.eventLabel.value)) continue;
  seen.add(`${country}:${id}`);
  (timelines[country] ??= []).push({ year: when, title: row.eventLabel.value, kind: EVENT_TYPES[qid(row.type.value)] ?? 'Event', article: row.article.value, weight: Number(row.links.value) });
}
for (const [country, list] of Object.entries(timelines)) {
  // Keep the most widely documented events, then order them in time.
  timelines[country] = list.sort((a, b) => b.weight - a.weight).slice(0, 14).sort((a, b) => a.year - b.year).map(({ weight, ...rest }) => rest);
}
const foundedYears = {};
for (const row of founded) {
  const when = year(row.inception.value);
  const country = qid(row.country.value);
  if (when != null && (foundedYears[country] == null || when < foundedYears[country])) foundedYears[country] = when;
}

const regions = JSON.parse(await readFile('data/below/regions.json', 'utf8')).regions;
const out = {};
for (const region of regions.filter((item) => item.kind === 'country')) {
  const ne = region.id.replace(/^c-/, '');
  const wb = Object.prototype.hasOwnProperty.call(NE_TO_WB, ne) ? NE_TO_WB[ne] : ne;
  out[region.id] = {
    profile: wb ? profiles[wb] ?? null : null,
    timeline: region.wikidata ? timelines[region.wikidata] ?? [] : [],
    founded: region.wikidata ? foundedYears[region.wikidata] ?? null : null,
  };
}
await mkdir('data/places', { recursive: true });
await writeFile('data/places/places.json', `${JSON.stringify({
  sources: {
    profile: { name: 'World Bank World Development Indicators', url: 'https://data.worldbank.org/', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' },
    timeline: { name: 'Wikidata', url: 'https://www.wikidata.org/', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  },
  retrievedAtUtc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  note: 'Each figure is the most recent year the World Bank reports for that country. Timelines list widely documented events from Wikidata, not a complete history.',
  places: out,
})}\n`);
const withProfile = Object.values(out).filter((item) => item.profile).length;
const withTimeline = Object.values(out).filter((item) => item.timeline.length).length;
console.log(`${Object.keys(out).length} countries, ${withProfile} with indicators, ${withTimeline} with timelines.`);
