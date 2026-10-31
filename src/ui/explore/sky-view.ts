import {
  angleBetweenDeg,
  basisFromLook,
  directionVector,
  dot,
  projectToScreen,
  unprojectFromScreen,
  azAltFromVector,
  type Vec3,
  type ViewBasis,
} from '../../sensors/orientation';
import type { Backdrop, SkySnapshot, SkyThing } from './sky-model';
import { ORBIT_COLORS, THEME } from './palette';

interface Hooks {
  onSelect: (id: string) => void;
  onAim: (thing: SkyThing | null) => void;
  onManualLook: () => void;
  onLookBelow: (below: boolean) => void;
  onSelectStar: (catalogIndex: number) => void;
}

const CARDINALS: Array<[number, string]> = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
const AIM_DEG = 7;

/**
 * Sky view. Real calculated directions drawn with a gnomonic (pinhole camera) projection, so the
 * horizon is a straight line and objects sit where they really are relative to the viewing direction.
 * Marker size is a symbol, not apparent size or brightness.
 */
export class SkyView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private hooks: Hooks;
  private sky: SkySnapshot | null = null;
  private selected = '';
  private path: Vec3[] = [];
  private basis: ViewBasis;
  private look = { az: 180, alt: 35 };
  private fovDeg = 75;
  private sensorDriven = false;
  private width = 0;
  private height = 0;
  private hits: Array<{ id: string; x: number; y: number; r: number }> = [];
  private aimedId = '';
  private frame = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private pinch: { distance: number; fov: number } | null = null;
  private showStars = true;
  private backdrop: Backdrop | null = null;
  private named = new Map<number, string>();
  private lookingDown = false;

  constructor(canvas: HTMLCanvasElement, hooks: Hooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.ctx = canvas.getContext('2d');
    this.basis = basisFromLook(this.look.az, this.look.alt);
    try {
      new ResizeObserver(() => this.requestDraw()).observe(canvas);
    } catch {
      /* The list view stays usable without resize observation. */
    }
    canvas.addEventListener('pointerdown', (event) => this.down(event));
    canvas.addEventListener('pointermove', (event) => this.move(event));
    canvas.addEventListener('pointerup', (event) => this.up(event));
    canvas.addEventListener('pointercancel', (event) => this.cancel(event));
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.zoomBy(event.deltaY > 0 ? 1.1 : 0.9);
    }, { passive: false });
    canvas.addEventListener('keydown', (event) => this.key(event));
  }

  setSky(sky: SkySnapshot) {
    this.sky = sky;
    this.requestDraw();
  }

  setSelected(id: string, path: Vec3[]) {
    this.selected = id;
    this.path = path;
    this.requestDraw();
  }

  setBackdrop(backdrop: Backdrop) {
    this.backdrop = backdrop;
    this.requestDraw();
  }

  /** Stars people have named: catalogue index → label to show. */
  setNamedStars(named: Map<number, string>) {
    this.named = named;
    this.requestDraw();
  }

  setStars(show: boolean) {
    this.showStars = show;
    this.requestDraw();
  }

  /** Called by the motion sensor. */
  setSensorBasis(basis: ViewBasis) {
    this.sensorDriven = true;
    this.basis = basis;
    this.requestDraw();
  }

  useManual() {
    if (this.sensorDriven) {
      const view = azAltFromVector(this.basis.forward);
      this.look = { az: view.azimuthDeg, alt: Math.max(-89, Math.min(89, view.altitudeDeg)) };
    }
    this.sensorDriven = false;
    this.basis = basisFromLook(this.look.az, this.look.alt);
    this.requestDraw();
  }

  /** Turn to face a thing (manual mode only). */
  lookAt(thing: SkyThing) {
    if (this.sensorDriven) return;
    this.look = { az: thing.azimuthDeg, alt: Math.max(-80, Math.min(85, thing.altitudeDeg)) };
    this.basis = basisFromLook(this.look.az, this.look.alt);
    this.requestDraw();
  }

  zoomBy(factor: number) {
    this.fovDeg = Math.max(20, Math.min(120, this.fovDeg * factor));
    this.requestDraw();
  }

  viewDirection() {
    return azAltFromVector(this.basis.forward);
  }

  requestDraw() {
    if (this.frame || typeof requestAnimationFrame !== 'function') {
      if (typeof requestAnimationFrame !== 'function') this.draw();
      return;
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private focal(): number {
    return (this.height / 2) / Math.tan((this.fovDeg * Math.PI) / 360);
  }

  private project(direction: Vec3) {
    return projectToScreen(direction, this.basis, this.focal(), this.width, this.height);
  }

  private down(event: PointerEvent) {
    this.pointers.set(event.pointerId, this.point(event));
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    if (this.pointers.size === 1) this.drag = { ...this.point(event), moved: false };
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), fov: this.fovDeg };
      this.drag = null;
    }
  }

  private move(event: PointerEvent) {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, this.point(event));
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 10) {
        this.fovDeg = Math.max(20, Math.min(120, (this.pinch.fov * this.pinch.distance) / distance));
        this.requestDraw();
      }
      return;
    }
    if (!this.drag) return;
    const now = this.point(event);
    const dx = now.x - this.drag.x;
    const dy = now.y - this.drag.y;
    if (!this.drag.moved && Math.hypot(dx, dy) < 6) return;
    this.drag.moved = true;
    this.drag.x = now.x;
    this.drag.y = now.y;
    if (this.sensorDriven) {
      this.hooks.onManualLook();
      this.useManual();
    }
    const degPerPx = this.fovDeg / this.height;
    this.look.az = (((this.look.az - dx * degPerPx) % 360) + 360) % 360;
    this.look.alt = Math.max(-89, Math.min(89, this.look.alt + dy * degPerPx));
    this.basis = basisFromLook(this.look.az, this.look.alt);
    this.requestDraw();
  }

  private up(event: PointerEvent) {
    const drag = this.drag;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (drag && !drag.moved && this.pointers.size === 0) this.tap(this.point(event));
    if (this.pointers.size === 0) this.drag = null;
  }

  private cancel(event: PointerEvent) {
    this.pointers.delete(event.pointerId);
    this.pinch = null;
    this.drag = null;
  }

  private tap(point: { x: number; y: number }) {
    const hit = [...this.hits].reverse().find((item) => Math.hypot(point.x - item.x, point.y - item.y) <= item.r);
    if (hit) {
      this.hooks.onSelect(hit.id);
      return;
    }
    // Otherwise pick the closest object to the tapped direction, if it is near.
    if (!this.sky) return;
    const direction = unprojectFromScreen(point.x, point.y, this.basis, this.focal(), this.width, this.height);
    const nearest = this.nearest(direction, 4);
    if (nearest) {
      this.hooks.onSelect(nearest.id);
      return;
    }
    // Any star in the catalogue: the closest dot within a finger's width, favouring brighter stars.
    const stars = this.backdrop?.stars;
    if (!stars) return;
    const f = this.focal();
    let best = -1;
    let bestScore = 26;
    for (let index = 0; index < stars.length; index += 6) {
      if (stars[index + 5] < 0) continue;
      const p = projectToScreen([stars[index], stars[index + 1], stars[index + 2]], this.basis, f, this.width, this.height);
      if (!p) continue;
      const score = Math.hypot(p.x - point.x, p.y - point.y) + stars[index + 3] * 2;
      if (score < bestScore) {
        bestScore = score;
        best = stars[index + 5];
      }
    }
    if (best >= 0) this.hooks.onSelectStar(best);
  }

  private key(event: KeyboardEvent) {
    const step = event.shiftKey ? 15 : 5;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) {
      event.preventDefault();
      if (this.sensorDriven) {
        this.hooks.onManualLook();
        this.useManual();
      }
      this.look.az = (((this.look.az + moves[event.key][0]) % 360) + 360) % 360;
      this.look.alt = Math.max(-89, Math.min(89, this.look.alt + moves[event.key][1]));
      this.basis = basisFromLook(this.look.az, this.look.alt);
      this.requestDraw();
    } else if (event.key === '+' || event.key === '=') this.zoomBy(0.85);
    else if (event.key === '-') this.zoomBy(1.18);
    else if (event.key === 'Enter' && this.aimedId) this.hooks.onSelect(this.aimedId);
  }

  private point(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private nearest(direction: Vec3, maxDeg: number): SkyThing | null {
    let best: SkyThing | null = null;
    let bestAngle = maxDeg;
    for (const thing of this.drawable()) {
      const angle = angleBetweenDeg(direction, thing.dir);
      // Prefer satellites and planets over stars at the same spot.
      const adjusted = thing.kind === 'star' ? angle + 1 : angle;
      if (adjusted < bestAngle) {
        best = thing;
        bestAngle = adjusted;
      }
    }
    return best;
  }

  private drawable(): SkyThing[] {
    if (!this.sky) return [];
    return this.sky.things.filter((thing) => this.showStars || thing.kind !== 'star' || thing.id === this.selected);
  }

  private draw() {
    try {
      this.paint();
    } catch {
      /* The list view stays usable if drawing fails. */
    }
  }

  private paint() {
    const context = this.ctx;
    if (!context) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    if (!this.width || !this.height) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(this.width * ratio);
    const hgt = Math.floor(this.height * ratio);
    if (this.canvas.width !== w || this.canvas.height !== hgt) {
      this.canvas.width = w;
      this.canvas.height = hgt;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.hits = [];
    this.paintSkyAndGround(context);
    this.paintBackdrop(context);
    this.paintNamed(context);
    this.paintGrid(context);
    this.paintPath(context);
    this.paintThings(context);
    this.paintReticle(context);
    this.paintOffscreenArrow(context);
  }

  /** The horizon is a great circle, so on a pinhole projection it is a straight line; ground is one side of it. */
  private paintSkyAndGround(context: CanvasRenderingContext2D) {
    const lookingDown = this.basis.forward[2] < -0.05;
    if (lookingDown !== this.lookingDown) {
      this.lookingDown = lookingDown;
      this.hooks.onLookBelow(lookingDown);
    }
    const f = this.focal();
    const { forward, right, up } = this.basis;
    const zAt = (x: number, y: number) => forward[2] + ((x - this.width / 2) / f) * right[2] + ((this.height / 2 - y) / f) * up[2];
    const sky = context.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, THEME.skyTop);
    sky.addColorStop(1, THEME.skyHorizon);
    context.fillStyle = sky;
    context.fillRect(0, 0, this.width, this.height);
    const corners: Array<[number, number]> = [[0, 0], [this.width, 0], [this.width, this.height], [0, this.height]];
    const ground: Array<[number, number]> = [];
    for (let index = 0; index < corners.length; index += 1) {
      const a = corners[index];
      const b = corners[(index + 1) % corners.length];
      const za = zAt(a[0], a[1]);
      const zb = zAt(b[0], b[1]);
      if (za < 0) ground.push(a);
      if ((za < 0) !== (zb < 0)) {
        const t = za / (za - zb);
        ground.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    if (ground.length >= 3) {
      context.fillStyle = THEME.ground;
      context.beginPath();
      ground.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
      context.closePath();
      context.fill();
      const edge = ground.filter(([x, y]) => Math.abs(zAt(x, y)) < 1e-6);
      if (edge.length === 2) {
        context.strokeStyle = THEME.accent;
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(edge[0][0], edge[0][1]);
        context.lineTo(edge[1][0], edge[1][1]);
        context.stroke();
      }
    }
  }

  private polyline(context: CanvasRenderingContext2D, points: Vec3[]) {
    let drawing = false;
    context.beginPath();
    for (const direction of points) {
      const p = this.project(direction);
      if (!p || Math.abs(p.x) > 5 * this.width || Math.abs(p.y) > 5 * this.height) {
        drawing = false;
        continue;
      }
      if (drawing) context.lineTo(p.x, p.y);
      else context.moveTo(p.x, p.y);
      drawing = true;
    }
    context.stroke();
  }

  /** Real star field (to magnitude 5.2), constellation lines, and the Milky Way band. */
  private paintBackdrop(context: CanvasRenderingContext2D) {
    const backdrop = this.backdrop;
    if (!backdrop) return;
    // Milky Way: a soft wide band along the galactic plane, drawn as continuous strokes so it has no seams.
    context.save();
    context.lineCap = 'butt';
    context.lineJoin = 'round';
    const band = backdrop.milkyWay;
    const chunk = 5;
    for (let start = 0; start < band.length - 1; start += chunk) {
      const piece = band.slice(start, Math.min(band.length, start + chunk + 1));
      const glow = piece.reduce((sum, item) => sum + item.glow, 0) / piece.length;
      const below = piece[Math.floor(piece.length / 2)].dir[2] < 0 ? 0.35 : 1;
      for (const [width, color, alpha] of [[0.42, '140,100,225', 0.09], [0.16, '215,200,255', 0.07]] as const) {
        context.strokeStyle = `rgba(${color},${alpha * glow * below})`;
        context.lineWidth = this.focal() * width;
        this.polyline(context, piece.map((item) => item.dir));
      }
    }
    context.restore();
    // Constellation lines and names.
    if (this.showStars) {
      context.strokeStyle = 'rgba(180,140,255,0.28)';
      context.lineWidth = 1;
      for (const constellation of backdrop.constellations) {
        for (const line of constellation.lines) this.polyline(context, line);
      }
      context.font = '600 11px Orbitron, system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      for (const constellation of backdrop.constellations) {
        if (!constellation.label || (constellation.rank > 1 && this.fovDeg > 60)) continue;
        const p = this.project(constellation.label);
        if (!p || p.x < 0 || p.y < 0 || p.x > this.width || p.y > this.height) continue;
        context.fillStyle = constellation.label[2] < 0 ? 'rgba(180,140,255,0.25)' : 'rgba(200,175,255,0.55)';
        context.fillText(constellation.name.toUpperCase(), p.x, p.y);
      }
    }
    // Stars: size from brightness, a hint of colour from the colour index.
    const f = this.focal();
    const { forward, right, up } = this.basis;
    const zoomBoost = Math.max(0.8, Math.min(1.6, 75 / this.fovDeg));
    const stars = backdrop.stars;
    for (let index = 0; index < stars.length; index += 6) {
      const x = stars[index], y = stars[index + 1], z = stars[index + 2];
      const depth = x * forward[0] + y * forward[1] + z * forward[2];
      if (depth <= 0.05) continue;
      const sx = this.width / 2 + (f * (x * right[0] + y * right[1] + z * right[2])) / depth;
      const sy = this.height / 2 - (f * (x * up[0] + y * up[1] + z * up[2])) / depth;
      if (sx < -2 || sy < -2 || sx > this.width + 2 || sy > this.height + 2) continue;
      const mag = stars[index + 3];
      const bv = stars[index + 4];
      const size = Math.max(0.6, (2.6 - mag * 0.4) * zoomBoost);
      const alpha = Math.max(0.25, Math.min(1, 1.15 - mag * 0.16)) * (z < 0 ? 0.3 : 1);
      const color = bv < 0 ? '200,215,255' : bv < 0.6 ? '245,242,255' : bv < 1.2 ? '255,240,225' : '255,215,190';
      context.fillStyle = `rgba(${color},${alpha})`;
      if (size < 1.4) context.fillRect(sx - size / 2, sy - size / 2, size, size);
      else {
        context.beginPath();
        context.arc(sx, sy, size / 2, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  /** A purple ring and the given name around stars that people have named. */
  private paintNamed(context: CanvasRenderingContext2D) {
    const stars = this.backdrop?.stars;
    if (!stars || !this.named.size) return;
    const f = this.focal();
    context.save();
    context.font = '600 11px system-ui, sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    let labels = 0;
    for (let index = 0; index < stars.length; index += 6) {
      const label = this.named.get(stars[index + 5]);
      if (label === undefined) continue;
      const p = projectToScreen([stars[index], stars[index + 1], stars[index + 2]], this.basis, f, this.width, this.height);
      if (!p || p.x < 0 || p.y < 0 || p.x > this.width || p.y > this.height) continue;
      context.strokeStyle = THEME.accent;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(p.x, p.y, 7, 0, Math.PI * 2);
      context.stroke();
      if (labels < 40 && (this.fovDeg < 70 || labels < 12)) {
        context.fillStyle = 'rgba(200,175,255,0.95)';
        context.fillText(label, p.x + 10, p.y);
        labels += 1;
      }
    }
    context.restore();
  }

  private paintGrid(context: CanvasRenderingContext2D) {
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(180,140,255,0.10)';
    for (const alt of [30, 60]) {
      const ring: Vec3[] = [];
      for (let az = 0; az <= 360; az += 3) ring.push(directionVector(az, alt));
      this.polyline(context, ring);
    }
    for (let az = 0; az < 360; az += 45) {
      const line: Vec3[] = [];
      for (let alt = 0; alt <= 90; alt += 3) line.push(directionVector(az, alt));
      this.polyline(context, line);
    }
    context.font = '700 13px Orbitron, system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    for (const [az, label] of CARDINALS) {
      const p = this.project(directionVector(az, 0));
      if (!p || p.x < -20 || p.x > this.width + 20 || p.y < -20 || p.y > this.height + 20) continue;
      context.fillStyle = label === 'N' ? THEME.accent : THEME.muted;
      context.fillText(label, p.x, p.y - 6);
    }
    const zenith = this.project([0, 0, 1]);
    if (zenith && zenith.x > 0 && zenith.x < this.width && zenith.y > 0 && zenith.y < this.height) {
      context.fillStyle = THEME.muted;
      context.font = '11px system-ui, sans-serif';
      context.fillText('Straight up', zenith.x, zenith.y - 4);
    }
  }

  private paintPath(context: CanvasRenderingContext2D) {
    if (this.path.length < 2) return;
    context.save();
    context.setLineDash([4, 6]);
    context.strokeStyle = THEME.accentSoft;
    context.lineWidth = 2;
    this.polyline(context, this.path);
    context.restore();
  }

  private paintThings(context: CanvasRenderingContext2D) {
    const things = this.drawable();
    const order: Record<string, number> = { 'deep-sky': 0, star: 0, asteroid: 1, 'dwarf-planet': 1, planet: 1, moon: 2, sun: 2, satellite: 3 };
    const sorted = [...things].sort((a, b) => order[a.kind] - order[b.kind] + (a.id === this.selected ? 10 : 0) - (b.id === this.selected ? 10 : 0));
    const centre: Vec3 = this.basis.forward;
    const aimed = this.nearest(centre, AIM_DEG);
    if ((aimed?.id ?? '') !== this.aimedId) {
      this.aimedId = aimed?.id ?? '';
      this.hooks.onAim(aimed);
    }
    const taken: Array<[number, number, number, number]> = [];
    const selectedThing = sorted.find((thing) => thing.id === this.selected);
    const selectedPoint = selectedThing ? this.project(selectedThing.dir) : null;
    if (selectedPoint) taken.push([selectedPoint.x - 90, selectedPoint.y + 14, 180, 24]);
    for (const thing of sorted) {
      const p = this.project(thing.dir);
      if (!p || p.x < -60 || p.y < -60 || p.x > this.width + 60 || p.y > this.height + 60) continue;
      const below = thing.altitudeDeg < 0;
      const selected = thing.id === this.selected;
      context.save();
      context.globalAlpha = below ? 0.45 : 1;
      context.translate(p.x, p.y);
      this.glyph(context, thing);
      if (selected || thing.id === this.aimedId) {
        context.globalAlpha = 1;
        context.strokeStyle = THEME.accent;
        context.lineWidth = selected ? 2.5 : 1.5;
        context.setLineDash(selected ? [] : [3, 3]);
        context.beginPath();
        context.arc(0, 0, 20, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
      const minor = thing.kind === 'star' || thing.kind === 'asteroid' || thing.kind === 'deep-sky';
      const wanted = !minor || selected || (thing.star?.magnitude ?? 9) < 0.6 || this.fovDeg < 60 || (thing.kind === 'deep-sky' && this.fovDeg < 80);
      // Skip a label that would cover another (docked spacecraft share one spot); tapping still works.
      const box: [number, number, number, number] = [p.x - 70, p.y + 14, 140, 24];
      const clash = !selected && taken.some((other) => box[0] < other[0] + other[2] && box[0] + box[2] > other[0] && box[1] < other[1] + other[3] && box[1] + box[3] > other[1]);
      if (wanted && !clash) {
        this.label(context, thing, p.x, p.y, selected, below);
        if (!selected) taken.push(box);
      }
      this.hits.push({ id: thing.id, x: p.x, y: p.y, r: thing.kind === 'star' ? 16 : 24 });
    }
  }

  private glyph(context: CanvasRenderingContext2D, thing: SkyThing) {
    if (thing.kind === 'deep-sky') {
      const glow = context.createRadialGradient(0, 0, 1, 0, 0, 12);
      glow.addColorStop(0, 'rgba(230,215,255,0.95)');
      glow.addColorStop(1, 'rgba(155,92,255,0)');
      context.fillStyle = glow;
      context.beginPath();
      context.ellipse(0, 0, 13, 8, -0.5, 0, Math.PI * 2);
      context.fill();
      return;
    }
    if (thing.kind === 'asteroid' || thing.kind === 'dwarf-planet') {
      context.fillStyle = '#a8a1b8';
      context.strokeStyle = THEME.white;
      context.lineWidth = 1;
      context.beginPath();
      const r = thing.kind === 'dwarf-planet' ? 6 : 4.5;
      const bumps = [1, 0.75, 0.95, 0.7, 1, 0.85, 0.8];
      bumps.forEach((k, index) => {
        const a = (index / bumps.length) * Math.PI * 2;
        if (index) context.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
        else context.moveTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
      });
      context.closePath();
      context.fill();
      context.stroke();
      return;
    }
    if (thing.kind === 'star') {
      const radius = Math.max(1.4, 3.6 - (thing.star?.magnitude ?? 1));
      context.fillStyle = '#f4f1e8';
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fill();
      return;
    }
    if (thing.kind === 'satellite') {
      const color = ORBIT_COLORS[thing.satellite?.orbit.orbitClass ?? 'LEO'];
      context.fillStyle = color;
      context.strokeStyle = '#05050a';
      context.lineWidth = 1.5;
      context.fillRect(-11, -3.5, 7, 7);
      context.fillRect(4, -3.5, 7, 7);
      context.beginPath();
      context.moveTo(0, -6);
      context.lineTo(5, 0);
      context.lineTo(0, 6);
      context.lineTo(-5, 0);
      context.closePath();
      context.fill();
      context.stroke();
      return;
    }
    const sun = thing.kind === 'sun';
    const moon = thing.kind === 'moon';
    const radius = sun || moon ? 11 : 7;
    const gradient = context.createRadialGradient(-radius / 3, -radius / 3, 1, 0, 0, radius);
    gradient.addColorStop(0, sun ? '#fffaf0' : '#ffffff');
    gradient.addColorStop(1, sun ? '#ffe7b3' : moon ? '#a9a59c' : '#c9b48a');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    if (thing.id === 'saturn') {
      context.strokeStyle = '#d9c7a2';
      context.lineWidth = 1.5;
      context.beginPath();
      context.ellipse(0, 0, 13, 4, -0.4, 0, Math.PI * 2);
      context.stroke();
    }
  }

  private label(context: CanvasRenderingContext2D, thing: SkyThing, x: number, y: number, selected: boolean, below: boolean) {
    const name = thing.name;
    const sub = thing.kind === 'satellite' ? thing.satellite!.orbit.orbitClass : thing.kind === 'asteroid' ? 'asteroid' : thing.kind === 'dwarf-planet' ? 'dwarf planet' : thing.kind === 'deep-sky' ? thing.deep!.catalog : '';
    const nameFont = `${selected ? 700 : 600} 12px system-ui, sans-serif`;
    const subFont = '700 10px system-ui, sans-serif';
    context.font = nameFont;
    const nameWidth = context.measureText(name).width;
    context.font = subFont;
    const subWidth = sub ? context.measureText(sub).width + 8 : 0;
    const width = nameWidth + subWidth + 14;
    const left = Math.max(4, Math.min(this.width - width - 4, x - width / 2));
    const top = y + 16;
    context.globalAlpha = below ? 0.6 : 1;
    context.fillStyle = selected ? 'rgba(24,12,44,0.94)' : 'rgba(10,10,14,0.72)';
    context.strokeStyle = selected ? THEME.accent : 'rgba(250,250,250,0.18)';
    context.lineWidth = 1;
    context.beginPath();
    if (typeof context.roundRect === 'function') context.roundRect(left, top, width, 20, 6);
    else context.rect(left, top, width, 20);
    context.fill();
    context.stroke();
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.font = nameFont;
    context.fillStyle = '#fafafa';
    context.fillText(name, left + 7, top + 10.5);
    if (sub) {
      context.font = subFont;
      context.fillStyle = thing.satellite ? ORBIT_COLORS[thing.satellite.orbit.orbitClass] : THEME.accent;
      context.fillText(sub, left + 7 + nameWidth + 8, top + 10.5);
    }
    context.globalAlpha = 1;
  }

  private paintReticle(context: CanvasRenderingContext2D) {
    const x = this.width / 2;
    const y = this.height / 2;
    context.strokeStyle = THEME.accentSoft;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, 28, 0, Math.PI * 2);
    context.moveTo(x - 40, y);
    context.lineTo(x - 32, y);
    context.moveTo(x + 32, y);
    context.lineTo(x + 40, y);
    context.moveTo(x, y - 40);
    context.lineTo(x, y - 32);
    context.moveTo(x, y + 32);
    context.lineTo(x, y + 40);
    context.stroke();
  }

  private paintOffscreenArrow(context: CanvasRenderingContext2D) {
    const thing = this.sky?.things.find((item) => item.id === this.selected);
    if (!thing) return;
    const p = this.project(thing.dir);
    if (p && p.x > 0 && p.x < this.width && p.y > 0 && p.y < this.height) return;
    const dx = dot(thing.dir, this.basis.right);
    const dy = dot(thing.dir, this.basis.up);
    const angle = Math.atan2(-dy, dx);
    const margin = 34;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const scale = Math.min((cx - margin) / Math.abs(Math.cos(angle) || 1e-6), (cy - margin) / Math.abs(Math.sin(angle) || 1e-6));
    const x = cx + Math.cos(angle) * scale;
    const y = cy + Math.sin(angle) * scale;
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = THEME.accent;
    context.beginPath();
    context.moveTo(14, 0);
    context.lineTo(-8, -10);
    context.lineTo(-8, 10);
    context.closePath();
    context.fill();
    context.restore();
    context.fillStyle = THEME.accent;
    context.font = '700 11px system-ui, sans-serif';
    context.textAlign = x < cx ? 'left' : 'right';
    context.textBaseline = y < cy ? 'top' : 'bottom';
    context.fillText(`Turn to ${thing.name}`, x + (x < cx ? 18 : -18), y + (y < cy ? 12 : -12));
  }
}
