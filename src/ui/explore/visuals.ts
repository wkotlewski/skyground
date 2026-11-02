import starmap from '../../../data/sky/starmap.json';
import { EARTH_RADIUS_KM } from '../../sky/orbits';
import { h } from './dom';
import { ORBIT_COLORS, THEME } from './palette';
import type { SkyThing } from './sky-model';

/**
 * Drawn pictures for cards without a photo. Both are real geometry:
 * the finder chart is the actual star field around an object, and the orbit diagram is to scale.
 */

const RAD = Math.PI / 180;
const STARS = (starmap as { stars: number[] }).stars;
const LINES = (starmap as unknown as { constellations: Array<{ name: string; rank: number; label: [number, number] | null; lines: Array<Array<[number, number]>> }> }).constellations;

function canvas(width: number, height: number): { el: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null; ratio: number } {
  const el = h('canvas', { class: 'card-visual', width: String(width * 2), height: String(height * 2) });
  const ctx = el.getContext('2d');
  ctx?.setTransform(2, 0, 0, 2, 0, 0);
  return { el, ctx, ratio: 2 };
}

/** Gnomonic chart of the stars within about 20° of a J2000 position. */
export function finderChart(raDeg: number, decDeg: number, label: string): HTMLElement {
  const W = 480, H = 280, fov = 44;
  const { el, ctx } = canvas(W, H);
  const caption = h('figcaption', {}, `Where to find ${label} among the stars, ${fov}° across. Drawn from the HYG star catalogue.`);
  const figure = h('figure', { class: 'media-figure visual' }, el, caption);
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `Star chart around ${label}`);
  if (!ctx) return figure;
  const a0 = raDeg * RAD, d0 = decDeg * RAD;
  const f = (W / 2) / Math.tan((fov / 2) * RAD);
  const project = (ra: number, dec: number) => {
    const a = ra * RAD, d = dec * RAD;
    const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
    if (cosc <= 0.2) return null;
    // East is to the left on a sky chart, as when looking up.
    const x = (Math.cos(d) * Math.sin(a - a0)) / cosc;
    const y = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc;
    return { x: W / 2 - f * x, y: H / 2 - f * y };
  };
  const sky = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.7);
  sky.addColorStop(0, '#0b0e1c');
  sky.addColorStop(1, THEME.skyTop);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(200,210,235,0.3)';
  ctx.lineWidth = 1;
  for (const constellation of LINES) {
    for (const line of constellation.lines) {
      ctx.beginPath();
      let on = false;
      for (const [ra, dec] of line) {
        const p = project(ra, dec);
        if (!p) { on = false; continue; }
        if (on) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
        on = true;
      }
      ctx.stroke();
    }
  }
  for (let index = 0; index < STARS.length; index += 4) {
    const p = project(STARS[index], STARS[index + 1]);
    if (!p || p.x < 0 || p.y < 0 || p.x > W || p.y > H) continue;
    const mag = STARS[index + 2];
    const r = Math.max(0.6, 2.8 - mag * 0.45);
    ctx.fillStyle = `rgba(245,242,255,${Math.max(0.35, 1.1 - mag * 0.15)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = '600 11px Orbitron, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(169,194,255,0.7)';
  for (const constellation of LINES) {
    if (!constellation.label) continue;
    const p = project(constellation.label[0], constellation.label[1]);
    if (p && p.x > 30 && p.x < W - 30 && p.y > 14 && p.y < H - 8) ctx.fillText(constellation.name.toUpperCase(), p.x, p.y);
  }
  ctx.strokeStyle = THEME.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 14, 0, Math.PI * 2);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(W / 2 + dx * 18, H / 2 + dy * 18);
    ctx.lineTo(W / 2 + dx * 28, H / 2 + dy * 28);
  }
  ctx.stroke();
  ctx.fillStyle = THEME.white;
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, W / 2 + 32, H / 2 + 4);
  return figure;
}

/** Earth and the satellite's orbit drawn to the same scale, with the satellite where it is now. */
export function orbitDiagram(thing: SkyThing): HTMLElement {
  const sat = thing.satellite!;
  const W = 480, H = 280;
  const { el, ctx } = canvas(W, H);
  const o = sat.orbit;
  const a = o.semiMajorAxisKm, e = o.eccentricity;
  const apo = a * (1 + e), peri = a * (1 - e);
  const scale = Math.min((W - 40) / (apo + peri), (H - 40) / (2 * a * Math.sqrt(1 - e * e)), (H - 40) / (2 * EARTH_RADIUS_KM * 1.15));
  // Earth sits at one focus; centre the whole ellipse in the frame.
  const cx = W / 2 + ((apo - peri) / 2) * scale;
  const cy = H / 2;
  const caption = h('figcaption', {}, `${thing.name}’s orbit drawn to scale with Earth. ${o.orbitClass === 'LEO' ? 'Low orbits hug the planet.' : o.orbitClass === 'HEO' ? 'Its orbit is a long, stretched loop.' : 'Notice how far out it is compared with Earth’s size.'}`);
  const figure = h('figure', { class: 'media-figure visual' }, el, caption);
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `Orbit diagram for ${thing.name}`);
  if (!ctx) return figure;
  ctx.fillStyle = THEME.skyTop;
  ctx.fillRect(0, 0, W, H);
  const earth = ctx.createRadialGradient(cx - 8, cy - 8, 2, cx, cy, EARTH_RADIUS_KM * scale);
  earth.addColorStop(0, '#5b8fd8');
  earth.addColorStop(1, '#173a6b');
  ctx.fillStyle = earth;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, EARTH_RADIUS_KM * scale), 0, Math.PI * 2);
  ctx.fill();
  const color = ORBIT_COLORS[o.orbitClass];
  ctx.strokeStyle = color;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx - a * e * scale, cy, a * scale, a * Math.sqrt(1 - e * e) * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // Place the satellite at its current distance from Earth's centre.
  const r = EARTH_RADIUS_KM + sat.altitudeKm;
  const cosV = e > 1e-4 ? Math.max(-1, Math.min(1, ((a * (1 - e * e)) / r - 1) / e)) : 1;
  const v = Math.acos(cosV);
  const sx = cx - r * Math.cos(v) * scale;
  const sy = cy - r * Math.sin(v) * scale;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sx, sy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = THEME.white;
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = sx > W / 2 ? 'right' : 'left';
  ctx.fillText(`${thing.name} · ${Math.round(sat.altitudeKm).toLocaleString('en-US')} km up`, sx + (sx > W / 2 ? -10 : 10), sy - 10);
  ctx.textAlign = 'center';
  ctx.fillStyle = THEME.muted;
  ctx.fillText('Earth', cx, cy + EARTH_RADIUS_KM * scale + 16);
  return figure;
}

/** Pick the drawn visual that fits an object, or null when it has none. */
export function drawnVisual(thing: SkyThing): HTMLElement | null {
  if (thing.satellite) return orbitDiagram(thing);
  if (thing.star) return finderChart(thing.star.raHours * 15, thing.star.decDeg, thing.name);
  if (thing.deep) return finderChart(thing.deep.raDeg, thing.deep.decDeg, thing.name);
  if (thing.small) return finderChart(thing.small.raDeg, thing.small.decDeg, thing.name);
  return null;
}
