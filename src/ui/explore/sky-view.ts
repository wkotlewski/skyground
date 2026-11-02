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
import land from '../../../data/world/ne-110m-land.json';
import type { Backdrop, SkySnapshot, SkyThing } from './sky-model';
import { ORBIT_COLORS, THEME, auroraGradient } from './palette';

interface Hooks {
  onSelect: (id: string) => void;
  onAim: (thing: SkyThing | null) => void;
  onManualLook: () => void;
  onLookBelow: (below: boolean) => void;
  onSelectStar: (catalogIndex: number) => void;
  /** Where the view is pointing, so the page can say it in words. */
  onView?: (view: { azimuthDeg: number; altitudeDeg: number }) => void;
}

const CARDINALS: Array<[number, string]> = [[0, 'North'], [45, 'NE'], [90, 'East'], [135, 'SE'], [180, 'South'], [225, 'SW'], [270, 'West'], [315, 'NW']];
/** Land outlines as unit vectors on the globe, built once (Natural Earth 1:110m, public domain). */
const LAND_RINGS: Float32Array[] = (land as unknown as { rings: Array<Array<[number, number]>> }).rings.map((ring) => {
  const out = new Float32Array(ring.length * 3);
  ring.forEach(([lon, lat], i) => {
    const a = (lat * Math.PI) / 180;
    const b = (lon * Math.PI) / 180;
    out[i * 3] = Math.cos(a) * Math.cos(b);
    out[i * 3 + 1] = Math.cos(a) * Math.sin(b);
    out[i * 3 + 2] = Math.sin(a);
  });
  return out;
});

/**
 * Where the true horizon touches the screen closest to the centre, and which way is "down to the ground".
 * Returns null when looking straight up or down (the horizon has no direction on screen).
 */
export function horizonTangent(forward: Vec3, right: Vec3, up: Vec3, focal: number, width: number, height: number) {
  const gx0 = -right[2];
  const gy0 = up[2];
  const len = Math.hypot(gx0, gy0);
  if (len < 1e-4) return null;
  const gx = gx0 / len;
  const gy = gy0 / len;
  const d = (forward[2] * focal) / len;
  return { x: width / 2 + gx * d, y: height / 2 + gy * d, gx, gy };
}

const AIM_DEG = 7;
const PLANET_DEEP = '#0a111b';
const PLANET_LAND = '#33485a';

/** Fixed pseudo-random rays for the jump streaks: angle, start radius (0–1), colour. */
const WARP_RAYS: Array<[number, number, string]> = Array.from({ length: 160 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12543.123;
  const tints = ['245,246,248', '245,246,248', '169,194,255', '154,124,255', '91,157,255', '63,220,170'];
  return [(a - Math.floor(a)) * Math.PI * 2, 0.08 + (b - Math.floor(b)) * 0.92, tints[i % tints.length]];
});

function normalize3(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** Move along the great circle from a to b; t from 0 to 1. */
function slerp3(a: Vec3, b: Vec3, angleDeg: number, t: number): Vec3 {
  const omega = (angleDeg * Math.PI) / 180;
  if (omega < 1e-4) return b;
  if (Math.PI - omega < 1e-3) {
    // Opposite directions: go up and over through the zenith side.
    const mid: Vec3 = normalize3([0, 0, 1]);
    return t < 0.5 ? slerp3(a, mid, 90, t * 2) : slerp3(mid, b, 90, (t - 0.5) * 2);
  }
  const sa = Math.sin((1 - t) * omega) / Math.sin(omega);
  const sb = Math.sin(t * omega) / Math.sin(omega);
  return normalize3([a[0] * sa + b[0] * sb, a[1] * sa + b[1] * sb, a[2] * sa + b[2] * sb]);
}

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
  private flight: { from: Vec3; to: Vec3; angle: number; fov0: number; peak: number; fov1: number; start: number; ms: number; onLand?: () => void } | null = null;
  private warp = 0;
  private placeName = '';
  private flightFrame = 0;
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

  /** The place name shown next to the You dot on the planet. */
  setPlaceName(name: string) {
    if (name === this.placeName) return;
    this.placeName = name;
    this.requestDraw();
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
    if (this.flight) this.cancelFlight();
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

  /** Swing the view to a direction, leaving phone-pointing mode. Used by Jump to. */
  lookToward(direction: Vec3, fovDeg?: number) {
    const view = azAltFromVector(direction);
    this.sensorDriven = false;
    this.look = { az: view.azimuthDeg, alt: Math.max(-80, Math.min(85, view.altitudeDeg)) };
    if (fovDeg) this.fovDeg = fovDeg;
    this.basis = basisFromLook(this.look.az, this.look.alt);
    this.requestDraw();
  }

  /**
   * Fly to a direction: pull back, swing across the sky with star streaks, then zoom in.
   * Respects reduced-motion settings by jumping straight there.
   */
  flyTo(direction: Vec3, fovEnd: number, onLand?: () => void) {
    const to = normalize3(direction);
    const from = this.basis.forward;
    const angle = (Math.acos(Math.max(-1, Math.min(1, dot(from, to)))) * 180) / Math.PI;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof requestAnimationFrame !== 'function' || angle < 0.5) {
      this.lookToward(to, fovEnd);
      onLand?.();
      return;
    }
    this.cancelFlight();
    this.sensorDriven = false;
    const peak = Math.min(115, Math.max(this.fovDeg, fovEnd) + 20 + angle * 0.2);
    this.flight = { from, to, angle, fov0: this.fovDeg, peak, fov1: fovEnd, start: performance.now(), ms: 1000 + Math.min(1, angle / 150) * 900, onLand };
    const step = () => {
      const flight = this.flight;
      if (!flight) return;
      const t = Math.min(1, (performance.now() - flight.start) / flight.ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const dir = slerp3(flight.from, flight.to, flight.angle, e);
      const view = azAltFromVector(dir);
      this.look = { az: view.azimuthDeg, alt: Math.max(-80, Math.min(85, view.altitudeDeg)) };
      this.basis = basisFromLook(this.look.az, this.look.alt);
      const half = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
      this.fovDeg = t < 0.5 ? flight.fov0 + (flight.peak - flight.fov0) * half(t * 2) : flight.peak + (flight.fov1 - flight.peak) * half((t - 0.5) * 2);
      this.warp = Math.pow(Math.sin(Math.PI * t), 1.4) * Math.min(1, 0.35 + flight.angle / 90);
      this.draw();
      if (t < 1) {
        this.flightFrame = requestAnimationFrame(step);
      } else {
        this.flight = null;
        this.warp = 0;
        this.flightFrame = 0;
        this.draw();
        flight.onLand?.();
      }
    };
    this.flightFrame = requestAnimationFrame(step);
  }

  private cancelFlight() {
    if (this.flightFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.flightFrame);
    const landed = this.flight?.onLand;
    this.flight = null;
    this.flightFrame = 0;
    this.warp = 0;
    landed?.();
  }

  /** Light-speed streaks radiating from the centre while flying. */
  private paintWarp(context: CanvasRenderingContext2D) {
    if (this.warp <= 0.01) return;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const reach = Math.hypot(cx, cy);
    context.save();
    context.lineCap = 'round';
    for (let i = 0; i < WARP_RAYS.length; i += 1) {
      const [angle, r, tint] = WARP_RAYS[i];
      const r0 = r * reach;
      const r1 = r0 + (18 + r * 160) * this.warp;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      context.strokeStyle = `rgba(${tint},${0.75 * this.warp})`;
      context.lineWidth = 0.6 + r * 1.6;
      context.beginPath();
      context.moveTo(cx + dx * r0, cy + dy * r0);
      context.lineTo(cx + dx * r1, cy + dy * r1);
      context.stroke();
    }
    const glow = context.createRadialGradient(cx, cy, 0, cx, cy, reach * 0.6);
    glow.addColorStop(0, `rgba(169,194,255,${0.12 * this.warp})`);
    glow.addColorStop(1, 'rgba(169,194,255,0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, this.width, this.height);
    context.restore();
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
    if (this.flight) this.cancelFlight();
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
    this.paintSky(context);
    this.paintBackdrop(context);
    this.paintGround(context);
    this.reportView();
    this.paintNamed(context);
    this.paintGrid(context);
    this.paintPath(context);
    this.paintThings(context);
    this.paintReticle(context);
    this.paintOffscreenArrow(context);
    this.paintWarp(context);
  }

  private lastView = '';

  private reportView() {
    const [x, y, z] = this.basis.forward;
    const azimuthDeg = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
    const altitudeDeg = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI;
    const key = `${Math.round(azimuthDeg / 5)}|${Math.round(altitudeDeg / 5)}`;
    if (key === this.lastView) return;
    this.lastView = key;
    this.hooks.onView?.({ azimuthDeg, altitudeDeg });
  }

  private paintSky(context: CanvasRenderingContext2D) {
    const lookingDown = this.basis.forward[2] < -0.05;
    if (lookingDown !== this.lookingDown) {
      this.lookingDown = lookingDown;
      this.hooks.onLookBelow(lookingDown);
    }
    const sky = context.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, THEME.skyTop);
    sky.addColorStop(1, THEME.skyHorizon);
    context.fillStyle = sky;
    context.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Earth as a planet: a big globe whose top edge touches your true horizon right in front of you, with an
   * atmosphere glow, the real continents (the side of Earth you would see looking ahead and down), and
   * compass directions along the edge. Stars below the horizon still show faintly through it.
   */
  private paintGround(context: CanvasRenderingContext2D) {
    const f = this.focal();
    const { forward, right, up } = this.basis;
    const tangent = horizonTangent(forward, right, up, f, this.width, this.height);
    const reach = Math.max(this.width, this.height);
    const seeThrough = forward[2] < -0.15;
    context.save();
    if (!tangent) {
      if (forward[2] < 0) {
        context.globalAlpha = 0.7;
        context.fillStyle = PLANET_DEEP;
        context.fillRect(0, 0, this.width, this.height);
      }
      context.restore();
      return;
    }
    const { gx, gy } = tangent;
    const radius = reach * 1.7;
    const cx = tangent.x + gx * radius;
    const cy = tangent.y + gy * radius;
    // Skip when the whole planet is below the screen.
    const nearest = Math.hypot(Math.max(0, Math.abs(cx - this.width / 2) - this.width / 2), Math.max(0, Math.abs(cy - this.height / 2) - this.height / 2));
    const visible = nearest < radius;
    if (visible) {
      // Atmosphere: a soft glow just outside the edge.
      const air = context.createRadialGradient(cx, cy, radius, cx, cy, radius + 46);
      air.addColorStop(0, 'rgba(91,157,255,0.32)');
      air.addColorStop(0.35, 'rgba(91,157,255,0.10)');
      air.addColorStop(1, 'rgba(91,157,255,0)');
      context.fillStyle = air;
      context.beginPath();
      context.arc(cx, cy, radius + 46, 0, Math.PI * 2);
      context.fill();
      // The planet body: lighter near the edge, deep toward the middle.
      const body = context.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius);
      body.addColorStop(0, PLANET_DEEP);
      body.addColorStop(0.9, '#0e1a2a');
      body.addColorStop(1, '#16304d');
      context.globalAlpha = seeThrough ? 0.62 : 0.96;
      context.fillStyle = body;
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fill();
      // Continents: an orthographic view of Earth with you standing on the top edge, facing into the screen.
      const obs = this.sky?.observer;
      if (obs) {
        const la = (obs.lat * Math.PI) / 180;
        const lo = (obs.lon * Math.PI) / 180;
        const view = azAltFromVector(forward);
        const az = (view.azimuthDeg * Math.PI) / 180;
        const O: Vec3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
        const E: Vec3 = [-Math.sin(lo), Math.cos(lo), 0];
        const N: Vec3 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
        // F: the way you face along the ground. R: your right. The camera floats behind you, so your
        // own region sits just under the planet's top edge and the far side curves away below.
        const F: Vec3 = [N[0] * Math.cos(az) + E[0] * Math.sin(az), N[1] * Math.cos(az) + E[1] * Math.sin(az), N[2] * Math.cos(az) + E[2] * Math.sin(az)];
        const R: Vec3 = [-N[0] * Math.sin(az) + E[0] * Math.cos(az), -N[1] * Math.sin(az) + E[1] * Math.cos(az), -N[2] * Math.sin(az) + E[2] * Math.cos(az)];
        const tilt = (72 * Math.PI) / 180;
        const P: Vec3 = [O[0] * Math.cos(tilt) - F[0] * Math.sin(tilt), O[1] * Math.cos(tilt) - F[1] * Math.sin(tilt), O[2] * Math.cos(tilt) - F[2] * Math.sin(tilt)];
        const U: Vec3 = [O[0] * Math.sin(tilt) + F[0] * Math.cos(tilt), O[1] * Math.sin(tilt) + F[1] * Math.cos(tilt), O[2] * Math.sin(tilt) + F[2] * Math.cos(tilt)];
        const ux = -gx;
        const uy = -gy;
        const rx = -uy;
        const ry = ux;
        context.save();
        context.beginPath();
        context.arc(cx, cy, radius, 0, Math.PI * 2);
        context.clip();
        context.globalAlpha = seeThrough ? 0.5 : 0.9;
        context.fillStyle = PLANET_LAND;
        context.strokeStyle = 'rgba(169,194,255,0.55)';
        context.lineWidth = 1;
        for (const ring of LAND_RINGS) {
          context.beginPath();
          let pen = false;
          let any = false;
          for (let i = 0; i < ring.length; i += 3) {
            const px = ring[i];
            const py = ring[i + 1];
            const pz = ring[i + 2];
            const depth = px * P[0] + py * P[1] + pz * P[2];
            const x = px * R[0] + py * R[1] + pz * R[2];
            const y = px * U[0] + py * U[1] + pz * U[2];
            // Points on the far side are pressed onto the edge so shapes close cleanly.
            const k = depth < 0 ? 1 / Math.max(1e-6, Math.hypot(x, y)) : 1;
            const sx = cx + radius * k * (x * rx + y * ux);
            const sy = cy + radius * k * (x * ry + y * uy);
            if (depth > 0) any = true;
            if (pen) context.lineTo(sx, sy);
            else { context.moveTo(sx, sy); pen = true; }
          }
          if (!any) continue;
          context.closePath();
          context.fill();
          context.stroke();
        }
        context.restore();
        // You are here.
        context.globalAlpha = 1;
        const youX = cx + radius * Math.sin(tilt) * ux;
        const youY = cy + radius * Math.sin(tilt) * uy;
        if (youX > -20 && youX < this.width + 20 && youY > -20 && youY < this.height + 20) {
          context.fillStyle = 'rgba(245,246,248,0.25)';
          context.beginPath();
          context.arc(youX, youY, 10, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = THEME.white;
          context.beginPath();
          context.arc(youX, youY, 4, 0, Math.PI * 2);
          context.fill();
          context.font = '700 12px system-ui, sans-serif';
          context.textAlign = 'left';
          context.textBaseline = 'middle';
          context.fillText(obs.locationMode === 'device' ? 'You' : `You · ${this.placeName || 'here'}`, youX + 14, youY);
        }
      }
      context.globalAlpha = 1;
      // The edge of the planet carries the aurora gradient.
      for (const [width, alpha] of [[8, 0.18], [1.6, 0.95]] as const) {
        context.strokeStyle = auroraGradient(context, 0, 0, this.width, 0, alpha);
        context.lineWidth = width;
        context.beginPath();
        context.arc(cx, cy, radius, 0, Math.PI * 2);
        context.stroke();
      }
      // Compass directions sit just inside the edge.
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      for (const [az, label] of CARDINALS) {
        const p = this.project(directionVector(az, 0));
        if (!p || p.x < -60 || p.x > this.width + 60 || p.y < -60 || p.y > this.height + 60) continue;
        // Slide the label from the straight horizon down onto the curved edge.
        const dx = p.x - cx;
        const dy = p.y - cy;
        const b = dx * gx + dy * gy;
        const c = dx * dx + dy * dy - radius * radius;
        const disc = b * b - c;
        if (disc < 0) continue;
        const t = -b + Math.sqrt(disc);
        const qx = p.x + gx * (t + 18);
        const qy = p.y + gy * (t + 18);
        const main = label.length > 2;
        context.font = `700 ${main ? 15 : 12}px Orbitron, system-ui, sans-serif`;
        context.fillStyle = main ? THEME.white : THEME.muted;
        context.fillText(label.toUpperCase(), qx, qy);
      }
    }
    context.restore();
    // When the planet is off-screen, point to it.
    if (!visible && forward[2] > 0) {
      const margin = 40;
      const mx = this.width / 2;
      const my = this.height / 2;
      const scale = Math.min((mx - margin) / Math.abs(gx || 1e-6), (my - margin) / Math.abs(gy || 1e-6));
      const x = mx + gx * scale;
      const y = my + gy * scale;
      const band = context.createLinearGradient(mx + gx * (scale - 90), my + gy * (scale - 90), mx + gx * (scale + margin), my + gy * (scale + margin));
      band.addColorStop(0, 'rgba(91,157,255,0)');
      band.addColorStop(1, 'rgba(91,157,255,0.28)');
      context.fillStyle = band;
      context.fillRect(0, 0, this.width, this.height);
      context.save();
      context.translate(x, y);
      context.rotate(Math.atan2(gy, gx));
      context.fillStyle = THEME.white;
      context.beginPath();
      context.moveTo(12, 0);
      context.lineTo(-6, -9);
      context.lineTo(-6, 9);
      context.closePath();
      context.fill();
      context.restore();
      context.font = '700 12px system-ui, sans-serif';
      context.fillStyle = THEME.white;
      context.textAlign = 'center';
      context.textBaseline = gy > 0.5 ? 'bottom' : 'top';
      context.fillText('Earth this way', Math.min(this.width - 60, Math.max(60, x - gx * 14)), y - gy * 16 + (gy > 0.5 ? 0 : 6));
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
      for (const [width, color, alpha] of [[0.42, '120,130,200', 0.08], [0.16, '225,230,245', 0.07]] as const) {
        context.strokeStyle = `rgba(${color},${alpha * glow * below})`;
        context.lineWidth = this.focal() * width;
        this.polyline(context, piece.map((item) => item.dir));
      }
    }
    context.restore();
    // Constellation lines and names.
    if (this.showStars) {
      context.strokeStyle = 'rgba(200,210,235,0.22)';
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
        context.fillStyle = constellation.label[2] < 0 ? 'rgba(200,210,235,0.22)' : 'rgba(220,226,240,0.5)';
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

  /** A soft blue ring and the given name around stars that people have named. */
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
        context.fillStyle = 'rgba(169,194,255,0.95)';
        context.fillText(label, p.x + 10, p.y);
        labels += 1;
      }
    }
    context.restore();
  }

  private paintGrid(context: CanvasRenderingContext2D) {
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(200,210,235,0.08)';
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
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
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
      glow.addColorStop(0, 'rgba(235,240,255,0.95)');
      glow.addColorStop(0.6, 'rgba(91,157,255,0.25)');
      glow.addColorStop(1, 'rgba(63,220,170,0)');
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
    context.fillStyle = selected ? 'rgba(36,38,48,0.95)' : 'rgba(28,29,34,0.85)';
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
