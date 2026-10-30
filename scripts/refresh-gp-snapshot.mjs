// Shared ingestion for the reviewed satellite catalog. Runs on a schedule in CI, never in a student's browser.
// Requests a few CelesTrak groups plus single catalog numbers, one request at a time, with a pause between.
// Any non-200 response, invalid payload, missing satellite, or failed check exits without replacing the file.
// There is no retry loop: the next scheduled run tries again.

import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const BASE = 'https://celestrak.org/NORAD/elements/gp.php';
const GROUPS = ['stations', 'science', 'gps-ops', 'galileo', 'resource'];
const PAUSE_MS = 3000;
const snapshotPath = resolve('data/snapshots/gp-catalog.json');
const required = ['OBJECT_NAME', 'OBJECT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'NORAD_CAT_ID', 'ELEMENT_SET_NO', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT'];

function stop(message) {
  console.error(`${message} The snapshot was left unchanged. No retry.`);
  process.exit(1);
}

async function request(query) {
  const response = await fetch(`${BASE}?${query}&FORMAT=json`, { headers: { 'user-agent': 'SkyGround shared snapshot (GitHub Actions)' } });
  if (!response.ok) stop(`CelesTrak returned HTTP ${response.status} for ${query}.`);
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    if (!Array.isArray(payload)) stop(`CelesTrak payload for ${query} was not a list.`);
    return payload;
  } catch {
    stop(`CelesTrak did not return JSON for ${query}.`);
  }
}

const pause = () => new Promise((done) => setTimeout(done, PAUSE_MS));

const current = JSON.parse(await readFile(snapshotPath, 'utf8'));
const allow = current.records.map((record) => record.NORAD_CAT_ID);
const previous = new Map(current.records.map((record) => [record.NORAD_CAT_ID, record]));
const found = new Map();

for (const group of GROUPS) {
  for (const record of await request(`GROUP=${group}`)) {
    if (record && allow.includes(record.NORAD_CAT_ID)) found.set(record.NORAD_CAT_ID, record);
  }
  await pause();
}
for (const id of allow.filter((value) => !found.has(value))) {
  const [record] = await request(`CATNR=${id}`);
  if (record && record.NORAD_CAT_ID === id) found.set(id, record);
  await pause();
}

if (found.size !== allow.length) {
  stop(`Missing satellites: ${allow.filter((id) => !found.has(id)).join(', ')}.`);
}
for (const record of found.values()) {
  if (!required.every((key) => record[key] != null && record[key] !== '')) stop(`Record ${record.NORAD_CAT_ID} failed field checks.`);
  const before = previous.get(record.NORAD_CAT_ID);
  // A large jump in orbital period usually means a catalog mix-up, not a real change.
  const change = Math.abs(record.MEAN_MOTION - before.MEAN_MOTION) / before.MEAN_MOTION;
  if (change > 0.05) stop(`Record ${record.NORAD_CAT_ID} changed its orbit period by more than 5%. Review it by hand.`);
}

const next = {
  ...current,
  fetchedAtUtc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  records: allow.map((id) => found.get(id)),
};
const temporary = `${snapshotPath}.tmp`;
await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
await rename(temporary, snapshotPath);
console.log(`Updated ${found.size} records. The reviewed allowlist was not changed.`);
