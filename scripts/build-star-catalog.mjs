// Builds the naked-eye star catalogue from the HYG database v4.1 (CC BY-SA 4.0, David Nash / astronexus).
// Usage from app/: node scripts/build-star-catalog.mjs <hygdata_v41.csv> <constellations.json from d3-celestial>
import { readFile, writeFile } from 'node:fs/promises';

const [csvPath, namesPath] = process.argv.slice(2);
const MAX_MAG = 6.5;

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const [header, ...rows] = parseCsv(await readFile(csvPath, 'utf8'));
const col = Object.fromEntries(header.map((name, index) => [name, index]));
const conNames = Object.fromEntries(JSON.parse(await readFile(namesPath, 'utf8')).features.map((f) => [f.id, f.properties.name]));
const GREEK = { Alp: 'Alpha', Bet: 'Beta', Gam: 'Gamma', Del: 'Delta', Eps: 'Epsilon', Zet: 'Zeta', Eta: 'Eta', The: 'Theta', Iot: 'Iota', Kap: 'Kappa', Lam: 'Lambda', Mu: 'Mu', Nu: 'Nu', Xi: 'Xi', Omi: 'Omicron', Pi: 'Pi', Rho: 'Rho', Sig: 'Sigma', Tau: 'Tau', Ups: 'Upsilon', Phi: 'Phi', Chi: 'Chi', Psi: 'Psi', Ome: 'Omega' };

const stars = rows
  .filter((r) => r.length > 20 && r[col.id] !== '0' && Number(r[col.mag]) <= MAX_MAG)
  .map((r) => {
    const bayer = r[col.bayer];
    const greek = bayer ? `${GREEK[bayer.replace(/-\d+$/, '')] ?? bayer}${/-\d+$/.test(bayer) ? ` ${bayer.split('-')[1]}` : ''}` : '';
    const con = r[col.con];
    const designation = greek && con ? `${greek} ${con}` : r[col.flam] && con ? `${r[col.flam]} ${con}` : '';
    const distPc = Number(r[col.dist]);
    return {
      key: r[col.hip] ? `hip-${r[col.hip]}` : `hyg-${r[col.id]}`,
      ra: Math.round(Number(r[col.ra]) * 15 * 100) / 100,
      dec: Math.round(Number(r[col.dec]) * 100) / 100,
      mag: Math.round(Number(r[col.mag]) * 100) / 100,
      ci: r[col.ci] === '' ? 0.6 : Math.round(Number(r[col.ci]) * 100) / 100,
      ly: distPc > 0 && distPc < 100000 ? Math.round(distPc * 3.26156) : 0,
      proper: r[col.proper] || '',
      designation,
      hip: r[col.hip] || '',
      hd: r[col.hd] || '',
      con,
      spect: r[col.spect] || '',
    };
  })
  .sort((a, b) => a.mag - b.mag);

const cons = [...new Set(stars.map((s) => s.con).filter(Boolean))].sort();
const out = {
  source: 'HYG database v4.1 (CC BY-SA 4.0), https://github.com/astronexus/HYG-Database. J2000 positions. Stars to magnitude 6.5, about every star visible without a telescope on a dark night.',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  count: stars.length,
  constellations: Object.fromEntries(cons.map((c) => [c, conNames[c] ?? c])),
  // Parallel columns keep the file small.
  keys: stars.map((s) => s.key),
  numbers: stars.flatMap((s) => [s.ra, s.dec, s.mag, s.ci, s.ly]),
  proper: stars.map((s) => s.proper),
  designation: stars.map((s) => s.designation),

  con: stars.map((s) => s.con),
  spect: stars.map((s) => s.spect),
};
await writeFile('data/sky/catalog.json', JSON.stringify(out));
console.log(`${stars.length} stars written.`);
