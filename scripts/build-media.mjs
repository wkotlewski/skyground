// Builds the picture pack: each sky object's Wikipedia lead image, kept only when its licence allows reuse
// (public domain, CC0, CC BY, CC BY-SA). Images are resized to 480 px WebP and served from this site,
// so opening a card never contacts Wikimedia. Credits and licences are stored beside them.
// Usage from app/: node scripts/build-media.mjs   (needs the sharp package available to Node)
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); } catch { sharp = require(`${process.env.SHARP_PATH ?? 'sharp'}`); }

const UA = { 'user-agent': 'SkyGround education snapshot (https://wkotlewski.github.io/skyground/)' };
const ARTICLES = {
  'norad-25544': 'International Space Station', 'norad-48274': 'Tiangong space station', 'norad-69180': 'Shenzhou (spacecraft)',
  'norad-100057': 'Soyuz MS', 'norad-100882': 'SpaceX Dragon 2', 'norad-20580': 'Hubble Space Telescope',
  'norad-28485': 'Neil Gehrels Swift Observatory', 'norad-33053': 'Fermi Gamma-ray Space Telescope', 'norad-25994': 'Terra (satellite)',
  'norad-27424': 'Aqua (satellite)', 'norad-39084': 'Landsat 8', 'norad-49260': 'Landsat 9', 'norad-43013': 'NOAA-20',
  'norad-39634': 'Sentinel-1', 'norad-39574': 'Global Precipitation Measurement', 'norad-43873': 'GPS Block III', 'norad-68791': 'GPS Block III',
  'norad-41328': 'GPS Block IIF', 'norad-67160': 'Galileo (satellite navigation)', 'norad-49809': 'Galileo (satellite navigation)',
  'norad-60133': 'GOES-19', 'norad-51850': 'GOES-18', 'norad-41836': 'Himawari 9', 'norad-36395': 'Solar Dynamics Observatory',
  'norad-25867': 'Chandra X-ray Observatory', 'norad-40482': 'Magnetospheric Multiscale Mission',
  sun: 'Sun', moon: 'Moon', mercury: 'Mercury (planet)', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn',
  uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto', 'ast-ceres': 'Ceres (dwarf planet)', 'ast-vesta': '4 Vesta', 'ast-pallas': '2 Pallas',
  'ast-juno': '3 Juno', 'ast-hygiea': '10 Hygiea', 'ast-psyche': '16 Psyche', 'ast-eros': '433 Eros', 'ast-bennu': '101955 Bennu',
  'ast-apophis': '99942 Apophis', 'deep-m31': 'Andromeda Galaxy', 'deep-m33': 'Triangulum Galaxy', 'deep-m42': 'Orion Nebula',
  'deep-m45': 'Pleiades', 'deep-m1': 'Crab Nebula', 'deep-m13': 'Messier 13', 'deep-m57': 'Ring Nebula', 'deep-sgr-a': 'Sagittarius A*',
  'deep-lmc': 'Large Magellanic Cloud', 'deep-smc': 'Small Magellanic Cloud',
};
const FREE = /^(public domain|pd|cc0|cc by(-sa)? [\d.]+|cc by(-sa)?$|cc-by(-sa)?-[\d.]+)/i;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const strip = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** File name from a Wikimedia image URL: .../commons/[thumb/]a/ab/Name.jpg[/480px-Name.jpg] */
function fileName(url) {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  const repo = parts.findIndex((part) => part === 'commons' || part === 'en');
  if (repo < 0) return '';
  const offset = parts[repo + 1] === 'thumb' ? repo + 4 : repo + 3;
  return decodeURIComponent(parts[offset] ?? '');
}

async function json(url) {
  try {
    const response = await fetch(url, { headers: UA });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

let previous = {};
try { previous = JSON.parse(await readFile('data/media/images.json', 'utf8')).images ?? {}; } catch { previous = {}; }
await mkdir('public/media', { recursive: true });
await mkdir('data/media', { recursive: true });
const byTitle = new Map();
const images = {};
const skipped = [];
for (const [id, title] of Object.entries(ARTICLES)) {
  if (previous[id]) { images[id] = previous[id]; continue; }
  if (byTitle.has(title)) { const done = byTitle.get(title); if (done) images[id] = done; continue; }
  const summary = await json(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`);
  await pause(2500);
  const source = summary?.originalimage?.source ?? summary?.thumbnail?.source;
  const file = source ? fileName(source) : '';
  if (!file) { skipped.push(`${id}: no lead image`); byTitle.set(title, null); continue; }
  const info = await json(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url&iiurlwidth=480&titles=${encodeURIComponent(`File:${file}`)}`);
  await pause(2500);
  const page = info && Object.values(info.query?.pages ?? {})[0];
  const ii = page?.imageinfo?.[0];
  const meta = ii?.extmetadata ?? {};
  const license = strip(meta.LicenseShortName?.value);
  if (!ii || !FREE.test(license) || /nc|nd/i.test(license.replace(/^cc by(-sa)?/i, ''))) {
    skipped.push(`${id}: licence "${license || 'unknown'}"`);
    byTitle.set(title, null);
    continue;
  }
  const download = await fetch(ii.thumburl, { headers: UA });
  await pause(800);
  if (!download.ok) { skipped.push(`${id}: download ${download.status}`); byTitle.set(title, null); continue; }
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const buffer = Buffer.from(await download.arrayBuffer());
  const output = await sharp(buffer).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer({ resolveWithObject: true });
  await writeFile(`public/media/${slug}.webp`, output.data);
  const entry = {
    src: `media/${slug}.webp`,
    width: output.info.width,
    height: output.info.height,
    alt: strip(meta.ImageDescription?.value).slice(0, 180) || `${title}`,
    artist: strip(meta.Artist?.value).slice(0, 120) || 'Unknown',
    credit: strip(meta.Credit?.value).slice(0, 160),
    license,
    licenseUrl: meta.LicenseUrl?.value ?? null,
    filePage: ii.descriptionurl,
    article: summary.content_urls?.desktop?.page ?? null,
  };
  images[id] = entry;
  byTitle.set(title, entry);
}
await writeFile('data/media/images.json', `${JSON.stringify({
  source: 'Wikipedia lead images from Wikimedia Commons, kept only with a free licence. Resized copies served from this site.',
  retrievedAtUtc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  images,
}, null, 1)}\n`);
console.log(`${Object.keys(images).length} images. Skipped: ${skipped.join('; ') || 'none'}`);
