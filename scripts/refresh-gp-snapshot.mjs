// Manual shared ingestion for the reviewed stations snapshot.
// One request. A non-200 response or invalid payload exits without replacing the file.
// Do not run this from a student's browser, and do not add a retry loop.

import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const SOURCE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json';
const snapshotPath = resolve('data/snapshots/gp-stations.json');
const required = ['OBJECT_NAME', 'OBJECT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'NORAD_CAT_ID', 'ELEMENT_SET_NO', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT'];

const current = JSON.parse(await readFile(snapshotPath, 'utf8'));
const allow = new Set(current.records.map((record) => record.NORAD_CAT_ID));
const response = await fetch(SOURCE_URL);
if (!response.ok) {
  console.error(`CelesTrak returned HTTP ${response.status}. The snapshot was left unchanged. No retry.`);
  process.exit(1);
}
let payload;
try {
  payload = await response.json();
} catch {
  console.error('CelesTrak did not return JSON. The snapshot was left unchanged. No retry.');
  process.exit(1);
}
if (!Array.isArray(payload)) {
  console.error('CelesTrak payload was not a list. The snapshot was left unchanged. No retry.');
  process.exit(1);
}
const byId = new Map(payload.filter((record) => record && allow.has(record.NORAD_CAT_ID)).map((record) => [record.NORAD_CAT_ID, record]));
if (byId.size !== allow.size) {
  console.error('An allowlisted satellite was missing. The snapshot was left unchanged. No retry.');
  process.exit(1);
}
for (const record of byId.values()) {
  if (!required.every((key) => record[key] != null && record[key] !== '')) {
    console.error('A record failed field checks. The snapshot was left unchanged. No retry.');
    process.exit(1);
  }
}
const next = {
  ...current,
  fetchedAtUtc: new Date().toISOString(),
  records: [...allow].map((id) => byId.get(id)),
};
const temporary = `${snapshotPath}.tmp`;
await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
await rename(temporary, snapshotPath);
console.log(`Updated ${byId.size} records. Review the diff before publishing. reviewedAtUtc was not changed.`);
