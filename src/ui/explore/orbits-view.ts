import land from '../../../data/world/ne-110m-land.json';
import { EARTH_RADIUS_KM, GEO_ALTITUDE_KM, ORBIT_LABELS, formatDuration, roundTripLightMs, type OrbitClass } from '../../sky/orbits';
import { FAMILY_LABELS } from '../../content/satellite-guide';
import { button, fmt, h } from './dom';
import { ORBIT_COLORS, THEME } from './palette';
import type { SkySnapshot, SkyThing } from './sky-model';

interface Hooks {
  onSelect: (id: string) => void;
}

const STORIES: Array<{ cls: OrbitClass; why: string; life: string; extra?: string }> = [
  {
    cls: 'LEO',
    why: 'Close to Earth, so cameras see fine detail, radio signals are quick, and rockets can reach it more easily. Satellites here race around Earth in about an hour and a half.',
    life: 'Space stations, Hubble, and most Earth-photographing and weather-measuring satellites live here.',
    extra: 'Sun-synchronous orbits are low orbits tilted slightly backwards over the poles. They cross each place at about the same local time every day, which makes before-and-after pictures easy to compare.',
  },
  {
    cls: 'MEO',
    why: 'Higher up, each satellite sees a much bigger piece of Earth, so a few dozen can cover the whole planet. A lap takes about 12 to 14 hours.',
    life: 'GPS, Galileo, and other navigation satellites. Your phone needs to hear at least four at once to find where you are.',
  },
  {
    cls: 'GEO',
    why: 'At about 35,786 km above the equator, one lap takes exactly as long as Earth takes to spin once. The satellite keeps pace with the ground below, so it looks parked in one spot in the sky.',
    life: 'Weather satellites that film the same half of Earth all day, and TV and communications satellites that dishes point at without moving.',
    extra: 'A geosynchronous orbit that is tilted (GSO) also takes one day per lap but wanders in a figure-eight above one longitude.',
  },
  {
    cls: 'HEO',
    why: 'A stretched-out ellipse: the satellite swoops close to Earth, then flies far out and moves slowly at the far end, where it spends most of its time.',
    life: 'Space telescopes like Chandra that want long, quiet views, and missions studying Earth’s magnetic bubble.',
  },
];

export class OrbitsView {
  readonly element: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private hooks: Hooks;
  private sky: SkySnapshot | null = null;
  private selected = '';
  private trueScale = false;
  private hits: Array<{ id: string; x: number; y: number }> = [];
  private cards: HTMLElement;
  private scaleButton: HTMLButtonElement;
  private frame = 0;
  private cardsKey = '';

  constructor(hooks: Hooks) {
    this.hooks = hooks;
    this.canvas = h('canvas', { class: 'orbit-canvas', tabindex: '0', 'aria-label': 'Top-down diagram of satellite orbits around Earth, seen from above the North Pole. The orbit cards below describe the same satellites.' });
    this.ctx = this.canvas.getContext('2d');
    this.scaleButton = button('Show true scale', { class: 'chip', 'aria-pressed': 'false' }, () => {
      this.trueScale = !this.trueScale;
      this.scaleButton.setAttribute('aria-pressed', String(this.trueScale));
      this.scaleButton.textContent = this.trueScale ? 'Show stretched scale' : 'Show true scale';
      this.requestDraw();
    });
    this.cards = h('div', { class: 'orbit-cards' });
    this.element = h('section', { class: 'view orbits-view', 'aria-label': 'Orbits' },
      h('div', { class: 'view-intro' },
        h('h1', {}, 'How high, how fast?'),
        h('p', {}, 'Every satellite is falling around Earth. The higher it is, the slower it moves and the longer one lap takes. Looking down on the North Pole, with Earth held still:'),
      ),
      h('div', { class: 'orbit-stage' }, this.canvas, h('div', { class: 'orbit-controls' }, this.scaleButton)),
      h('p', { class: 'caption', id: 'orbit-caption' }, ''),
      this.cards,
    );
    this.canvas.addEventListener('click', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = this.hits.find((item) => Math.hypot(item.x - x, item.y - y) < 18);
      if (hit) this.hooks.onSelect(hit.id);
    });
    try {
      new ResizeObserver(() => this.requestDraw()).observe(this.canvas);
    } catch {
      /* Cards remain readable without the diagram. */
    }
  }

  update(sky: SkySnapshot, selected: string) {
    this.sky = sky;
    this.selected = selected;
    const key = `${selected}|${sky.things.filter((t) => t.satellite).length}`;
    if (key !== this.cardsKey || !this.cards.childElementCount) {
      this.cardsKey = key;
      this.renderCards();
    } else {
      this.refreshNumbers();
    }
    this.requestDraw();
  }

  private satellites(): SkyThing[] {
    return this.sky?.things.filter((thing) => thing.satellite) ?? [];
  }

  private renderCards() {
    const sats = this.satellites();
    const cards = STORIES.map((story) => {
      const members = sats.filter((thing) => {
        const cls = thing.satellite!.orbit.orbitClass;
        return story.cls === 'GEO' ? cls === 'GEO' || cls === 'GSO' : cls === story.cls;
      });
      const label = ORBIT_LABELS[story.cls];
      const sample = members[0]?.satellite;
      const stats = sample
        ? h('dl', { class: 'stats' },
          h('div', {}, h('dt', {}, 'Height'), h('dd', { 'data-live': `height-${story.cls}` }, heightRange(members))),
          h('div', {}, h('dt', {}, 'One lap'), h('dd', {}, lapRange(members))),
          h('div', {}, h('dt', {}, 'Speed'), h('dd', { 'data-live': `speed-${story.cls}` }, speedRange(members))),
          h('div', {}, h('dt', {}, 'Radio round trip'), h('dd', {}, `${fmt(roundTripLightMs(sample.altitudeKm))} ms`)),
        )
        : null;
      const list = h('ul', { class: 'orbit-members' }, ...members.map((thing) => {
        const item = button(thing.name, { class: thing.id === this.selected ? 'member selected' : 'member' }, () => this.hooks.onSelect(thing.id));
        item.append(h('small', {}, thing.satellite!.guide ? FAMILY_LABELS[thing.satellite!.guide.family] : 'Satellite'));
        return h('li', {}, item);
      }));
      return h('article', { class: 'orbit-card', style: `--orbit:${ORBIT_COLORS[story.cls]}` },
        h('header', {}, h('span', { class: 'orbit-tag' }, label.short), h('h2', {}, label.name)),
        h('p', { class: 'band' }, label.band),
        stats,
        h('p', {}, story.why),
        h('p', {}, h('strong', {}, 'In your life: '), story.life),
        story.extra ? h('p', { class: 'hint' }, story.extra) : null,
        members.length ? h('p', { class: 'eyebrow' }, `In SkyGround (${members.length})`) : null,
        members.length ? list : h('p', { class: 'hint' }, 'None of the bundled satellites have a calculated position right now.'),
      );
    });
    this.cards.replaceChildren(
      ...cards,
      h('article', { class: 'orbit-card plain' },
        h('h2', {}, 'Why don’t they fall down?'),
        h('p', {}, 'They are falling! A satellite moves sideways so fast that, as it falls, Earth’s surface curves away beneath it just as quickly. It keeps falling around Earth instead of into it. Higher up, gravity is weaker, so a slower speed is enough.'),
      ),
    );
  }

  private refreshNumbers() {
    const sats = this.satellites();
    for (const story of STORIES) {
      const members = sats.filter((thing) => (story.cls === 'GEO' ? ['GEO', 'GSO'].includes(thing.satellite!.orbit.orbitClass) : thing.satellite!.orbit.orbitClass === story.cls));
      const height = this.cards.querySelector(`[data-live="height-${story.cls}"]`);
      if (height && members.length) height.textContent = heightRange(members);
      const speed = this.cards.querySelector(`[data-live="speed-${story.cls}"]`);
      if (speed && members.length) speed.textContent = speedRange(members);
    }
  }

  requestDraw() {
    if (typeof requestAnimationFrame !== 'function') return this.draw();
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw() {
    try {
      this.paint();
    } catch {
      /* Cards remain readable without the diagram. */
    }
  }

  private paint() {
    const context = this.ctx;
    if (!context || !this.sky) return;
    const rect = this.canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    if (!size) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(rect.width * ratio);
    this.canvas.height = Math.floor(rect.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const outer = size / 2 - 18;
    const maxRadiusKm = this.trueScale ? EARTH_RADIUS_KM + GEO_ALTITUDE_KM * 1.12 : 150_000;
    const earthPx = this.trueScale ? (outer * EARTH_RADIUS_KM) / maxRadiusKm : outer * 0.2;
    const toPx = (radiusKm: number) => {
      if (this.trueScale) return (outer * radiusKm) / maxRadiusKm;
      const t = Math.log(radiusKm / EARTH_RADIUS_KM) / Math.log(maxRadiusKm / EARTH_RADIUS_KM);
      return earthPx + (outer - earthPx) * Math.max(0, t);
    };
    // Reference rings.
    const rings: Array<[number, string, string]> = [
      [EARTH_RADIUS_KM + 2000, 'LEO edge 2,000 km', ORBIT_COLORS.LEO],
      [EARTH_RADIUS_KM + 20_200, 'GPS 20,200 km', ORBIT_COLORS.MEO],
      [EARTH_RADIUS_KM + GEO_ALTITUDE_KM, 'GEO 35,786 km', ORBIT_COLORS.GEO],
    ];
    context.lineWidth = 1;
    context.font = '11px system-ui, sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    for (const [radiusKm, label, color] of rings) {
      const r = toPx(radiusKm);
      context.strokeStyle = `${color}66`;
      context.setLineDash([3, 5]);
      context.beginPath();
      context.arc(cx, cy, r, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = color;
      context.fillText(label, cx + r * 0.7071 + 4, cy - r * 0.7071 - 6);
    }
    this.paintEarth(context, cx, cy, earthPx);
    // Observer longitude.
    const you = this.sky.observer;
    const youAngle = (you.lon * Math.PI) / 180;
    const youR = earthPx * Math.cos((you.lat * Math.PI) / 180);
    context.fillStyle = THEME.accent;
    context.beginPath();
    context.arc(cx + youR * Math.cos(youAngle), cy - youR * Math.sin(youAngle), 3.5, 0, Math.PI * 2);
    context.fill();
    // Satellites at their real distance from Earth's centre, at the longitude they are above.
    this.hits = [];
    let offChart = 0;
    for (const thing of this.satellites()) {
      const info = thing.satellite!;
      const radiusKm = EARTH_RADIUS_KM + info.altitudeKm;
      const angle = (info.subpoint.lon * Math.PI) / 180;
      let r = toPx(radiusKm);
      if (r > outer) {
        offChart += 1;
        r = outer;
      }
      const x = cx + r * Math.cos(angle);
      const y = cy - r * Math.sin(angle);
      const selected = thing.id === this.selected;
      context.fillStyle = ORBIT_COLORS[info.orbit.orbitClass];
      context.beginPath();
      context.arc(x, y, selected ? 6 : 4, 0, Math.PI * 2);
      context.fill();
      if (selected) {
        context.strokeStyle = '#fafafa';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(x, y, 11, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = '#fafafa';
        context.font = '700 12px system-ui, sans-serif';
        context.textAlign = x > cx ? 'right' : 'left';
        context.fillText(thing.name, x + (x > cx ? -14 : 14), y);
      }
      this.hits.push({ id: thing.id, x, y });
    }
    const caption = this.element.querySelector('#orbit-caption');
    if (caption) {
      caption.textContent = this.trueScale
        ? `True scale out to geostationary height. Low orbits hug Earth so closely they nearly touch it.${offChart ? ` ${offChart} satellite${offChart > 1 ? 's are' : ' is'} farther out and pinned to the edge.` : ''} Yellow dot: your city.`
        : 'Distances are stretched so low orbits are visible; the rings show real heights. Satellites sit above the longitude they are over right now. Yellow dot: your city.';
    }
  }

  private paintEarth(context: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    context.fillStyle = '#0c2340';
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2f4a34';
    for (const ring of (land as unknown as { rings: Array<Array<[number, number]>> }).rings) {
      if (!ring.some(([, lat]) => lat > 0)) continue;
      context.beginPath();
      ring.forEach(([lon, lat], index) => {
        const clamped = Math.max(0, lat);
        const radius = r * Math.cos((clamped * Math.PI) / 180);
        const a = (lon * Math.PI) / 180;
        const x = cx + radius * Math.cos(a);
        const y = cy - radius * Math.sin(a);
        if (index) context.lineTo(x, y);
        else context.moveTo(x, y);
      });
      context.closePath();
      context.fill();
    }
    context.strokeStyle = '#7fd8ff55';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.stroke();
  }
}

function range(values: number[], format: (value: number) => string): string {
  if (!values.length) return '—';
  const low = Math.min(...values);
  const high = Math.max(...values);
  return Math.abs(high - low) / Math.max(1, high) < 0.03 ? `about ${format(low)}` : `${format(low)} to ${format(high)}`;
}

function heightRange(members: SkyThing[]): string {
  return range(members.map((thing) => thing.satellite!.altitudeKm), (value) => `${fmt(Math.round(value / (value > 10_000 ? 100 : 10)) * (value > 10_000 ? 100 : 10))} km`);
}

function lapRange(members: SkyThing[]): string {
  return range(members.map((thing) => thing.satellite!.orbit.periodMin), formatDuration);
}

function speedRange(members: SkyThing[]): string {
  return range(members.map((thing) => thing.satellite!.speedKmS), (value) => `${fmt(value, 1)} km/s`);
}
