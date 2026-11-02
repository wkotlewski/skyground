import land from '../../../data/world/ne-110m-land.json';
import marbleUrl from '../../../data/snapshots/gibs-blue-marble.jpg';
import type { Coordinates } from '../../contracts';
import { splitTrackAtAntimeridian } from '../../geo';
import { ORBIT_COLORS, THEME } from './palette';
import type { SkySnapshot, SkyThing } from './sky-model';
import { groundPointOf } from './sky-model';
import { SPACE_HISTORY } from '../../content/space-history';

interface Hooks {
  onSelect: (id: string) => void;
  onPoint: (point: Coordinates) => void;
}

let marble: HTMLImageElement | null = null;

/** Equirectangular world map: real ground points, a ground track, and the day/night line. */
export class EarthView {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private hooks: Hooks;
  private sky: SkySnapshot | null = null;
  private selected = '';
  private track: Coordinates[] = [];
  private picked: Coordinates | null = null;
  private zoom = 1;
  private centre: Coordinates = { lat: 0, lon: 0 };
  private width = 0;
  private height = 0;
  private hits: Array<{ id: string; x: number; y: number }> = [];
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private frame = 0;

  constructor(canvas: HTMLCanvasElement, hooks: Hooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.ctx = canvas.getContext('2d');
    if (!marble && typeof Image === 'function') {
      marble = new Image();
      marble.onload = () => this.requestDraw();
      marble.src = marbleUrl;
    }
    try {
      new ResizeObserver(() => this.requestDraw()).observe(canvas);
    } catch {
      /* The text below the map still answers the question. */
    }
    canvas.addEventListener('pointerdown', (event) => this.down(event));
    canvas.addEventListener('pointermove', (event) => this.move(event));
    canvas.addEventListener('pointerup', (event) => this.up(event));
    canvas.addEventListener('pointercancel', (event) => {
      this.pointers.delete(event.pointerId);
      this.pinch = null;
      this.drag = null;
    });
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const p = this.point(event as unknown as PointerEvent);
      this.zoomAt(event.deltaY > 0 ? 0.85 : 1.18, p.x, p.y);
    }, { passive: false });
    canvas.addEventListener('keydown', (event) => {
      const step = 20 / this.zoom;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (moves[event.key]) {
        event.preventDefault();
        this.centre = { lon: wrapLon(this.centre.lon + moves[event.key][0]), lat: this.centre.lat + moves[event.key][1] };
        this.clamp();
        this.requestDraw();
      } else if (event.key === '+' || event.key === '=') this.zoomBy(1.4);
      else if (event.key === '-') this.zoomBy(1 / 1.4);
    });
  }

  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { distance: number; zoom: number; mid: { x: number; y: number } } | null = null;
  private lastTap = { time: 0, x: 0, y: 0 };

  private down(event: PointerEvent) {
    this.pointers.set(event.pointerId, this.point(event));
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    if (this.pointers.size === 1) this.drag = { ...this.point(event), moved: false };
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
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
        const target = (this.pinch.zoom * distance) / this.pinch.distance;
        this.zoomAt(target / this.zoom, this.pinch.mid.x, this.pinch.mid.y);
      }
      return;
    }
    if (!this.drag) return;
    const p = this.point(event);
    const dx = p.x - this.drag.x;
    const dy = p.y - this.drag.y;
    if (!this.drag.moved && Math.hypot(dx, dy) < 6) return;
    this.drag = { ...p, moved: true };
    const scale = this.scale();
    this.centre = { lon: wrapLon(this.centre.lon - dx / scale), lat: this.centre.lat + dy / scale };
    this.clamp();
    this.requestDraw();
  }

  private up(event: PointerEvent) {
    const drag = this.drag;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) this.drag = null;
    if (!drag || drag.moved || this.pointers.size) return;
    const p = this.point(event);
    const now = Date.now();
    if (now - this.lastTap.time < 320 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 30) {
      this.lastTap.time = 0;
      this.zoomAt(2, p.x, p.y);
      return;
    }
    this.lastTap = { time: now, x: p.x, y: p.y };
    // Nearest marker within a finger's width wins; otherwise the tapped place.
    let best: { id: string; d: number } | null = null;
    for (const hit of this.hits) {
      const d = Math.hypot(hit.x - p.x, hit.y - p.y);
      if (d < 24 && (!best || d < best.d)) best = { id: hit.id, d };
    }
    if (best) {
      this.hooks.onSelect(best.id);
      return;
    }
    const point = this.unproject(p.x, p.y);
    if (point) {
      this.picked = point;
      this.hooks.onPoint(point);
      this.requestDraw();
    }
  }

  /** Zoom while keeping the place under (x, y) fixed on screen. */
  zoomAt(factor: number, x: number, y: number) {
    const before = this.unproject(x, y, true);
    this.zoom = Math.max(1, Math.min(12, this.zoom * factor));
    this.clamp();
    if (before) {
      const s = this.scale();
      this.centre = { lon: wrapLon(before.lon - (x - this.width / 2) / s), lat: before.lat - (this.height / 2 - y) / s };
    }
    this.clamp();
    this.requestDraw();
  }

  /** Keep the map filling the frame top to bottom. */
  private clamp() {
    if (!this.width || !this.height) return;
    // On a tall phone frame, zoom in just enough that the map fills it top to bottom.
    const minZoom = this.width ? Math.max(1, (this.height * 2) / this.width) : 1;
    if (this.zoom < minZoom) this.zoom = minZoom;
    const half = this.height / 2 / this.scale();
    const limit = Math.max(0, 90 - half);
    this.centre.lat = Math.max(-limit, Math.min(limit, this.centre.lat));
  }

  private observerKey = '';

  update(sky: SkySnapshot, selected: string, track: Coordinates[]) {
    const changed = selected !== this.selected;
    // Start centred on the chosen city, and recentre when the city changes.
    const key = `${sky.observer.lat},${sky.observer.lon}`;
    if (key !== this.observerKey) {
      this.observerKey = key;
      this.centre = { lat: sky.observer.lat, lon: sky.observer.lon };
      this.clamp();
    }
    this.sky = sky;
    this.selected = selected;
    this.track = track;
    if (changed) {
      this.picked = null;
      const thing = sky.things.find((item) => item.id === selected);
      const ground = thing ? groundPointOf(thing) : null;
      if (ground && this.zoom > 1) {
        this.centre = { lat: ground.point.lat, lon: ground.point.lon };
        this.clamp();
      }
    }
    this.requestDraw();
  }

  setPicked(point: Coordinates | null) {
    this.picked = point;
    this.requestDraw();
  }

  zoomBy(factor: number) {
    this.zoomAt(factor, this.width / 2, this.height / 2);
  }

  centreOn(point: Coordinates) {
    if (this.zoom < 2.5) this.zoom = 2.5;
    this.centre = { lat: point.lat, lon: point.lon };
    this.clamp();
    this.requestDraw();
  }

  requestDraw() {
    if (typeof requestAnimationFrame !== 'function') return this.draw();
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private scale() {
    return (this.width / 360) * this.zoom;
  }

  private project(lat: number, lon: number): { x: number; y: number } {
    const s = this.scale();
    const dLon = ((lon - this.centre.lon + 540) % 360) - 180;
    return { x: this.width / 2 + dLon * s, y: this.height / 2 - (lat - this.centre.lat) * s };
  }

  private unproject(x: number, y: number, allowOutside = false): Coordinates | null {
    const s = this.scale();
    const lon = (x - this.width / 2) / s + this.centre.lon;
    const lat = (this.height / 2 - y) / s + this.centre.lat;
    if (!allowOutside && (lat < -90 || lat > 90)) return null;
    return { lat: Math.max(-90, Math.min(90, lat)), lon: wrapLon(lon) };
  }

  /** Screen x for a longitude on one particular copy of the world. */
  private xOn(lon: number, shift: number): number {
    return this.width / 2 + (lon + shift - this.centre.lon) * this.scale();
  }

  private point(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private draw() {
    try {
      this.paint();
    } catch (error) {
      // The text below the map still answers the question; log so problems are visible in development.
      console.error('Map drawing failed', error);
    }
  }

  private paint() {
    const context = this.ctx;
    if (!context || !this.sky) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    if (!this.width || !this.height) return;
    this.clamp();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.width * ratio);
    this.canvas.height = Math.floor(this.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = THEME.skyTop;
    context.fillRect(0, 0, this.width, this.height);
    this.paintBase(context);
    this.paintNight(context);
    this.paintTrack(context);
    this.paintMarkers(context);
  }

  /** Draw the world once per copy needed so a zoomed view can wrap across the date line. */
  private copies(): number[] {
    return [-360, 0, 360];
  }

  private paintBase(context: CanvasRenderingContext2D) {
    for (const shift of this.copies()) {
      const a = this.project(90, 0);
      const b = this.project(-90, 0);
      const left = this.xOn(-180, shift);
      const right = left + 360 * this.scale();
      if (right < 0 || left > this.width) continue;
      if (marble?.complete && marble.naturalWidth) {
        context.drawImage(marble, left, a.y, right - left, b.y - a.y);
        context.fillStyle = 'rgba(5,5,8,0.15)';
        context.fillRect(left, a.y, right - left, b.y - a.y);
      }
      context.strokeStyle = 'rgba(250,250,250,0.45)';
      context.lineWidth = 0.6;
      for (const ring of (land as unknown as { rings: Array<Array<[number, number]>> }).rings) {
        context.beginPath();
        ring.forEach(([lon, lat], index) => {
          const x = left + (lon + 180) * this.scale();
          const y = this.project(lat, 0).y;
          if (index) context.lineTo(x, y);
          else context.moveTo(x, y);
        });
        context.closePath();
        context.stroke();
      }
    }
  }

  private paintNight(context: CanvasRenderingContext2D) {
    const sun = this.sky?.things.find((thing) => thing.kind === 'sun')?.body?.overhead;
    if (!sun) return;
    const dec = (sun.lat * Math.PI) / 180;
    const safeTan = Math.abs(Math.tan(dec)) < 1e-4 ? 1e-4 * Math.sign(dec || 1) : Math.tan(dec);
    context.fillStyle = 'rgba(0,0,12,0.55)';
    for (const shift of this.copies()) {
      context.beginPath();
      for (let lon = -180; lon <= 180; lon += 2) {
        const h = ((lon - sun.lon) * Math.PI) / 180;
        const lat = (Math.atan(-Math.cos(h) / safeTan) * 180) / Math.PI;
        const x = this.xOn(lon, shift);
        const y = this.project(lat, 0).y;
        if (lon === -180) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      const edgeLat = dec > 0 ? -90 : 90;
      const rightX = this.xOn(180, shift);
      const leftX = this.xOn(-180, shift);
      context.lineTo(rightX, this.project(edgeLat, 0).y);
      context.lineTo(leftX, this.project(edgeLat, 0).y);
      context.closePath();
      context.fill();
    }
  }

  private paintTrack(context: CanvasRenderingContext2D) {
    if (this.track.length < 2) return;
    const thing = this.sky?.things.find((item) => item.id === this.selected);
    const color = thing?.satellite ? ORBIT_COLORS[thing.satellite.orbit.orbitClass] : THEME.accent;
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.setLineDash([5, 4]);
    for (const segment of splitTrackAtAntimeridian(this.track)) {
      context.beginPath();
      let last: { x: number; y: number } | null = null;
      for (const point of segment) {
        const p = this.project(point.lat, point.lon);
        // A zoomed view wraps at its own edge, so break the line instead of drawing across the map.
        if (last && Math.abs(p.x - last.x) < this.width / 2) context.lineTo(p.x, p.y);
        else context.moveTo(p.x, p.y);
        last = p;
      }
      context.stroke();
    }
    context.setLineDash([]);
  }

  private paintMarkers(context: CanvasRenderingContext2D) {
    this.hits = [];
    const sky = this.sky!;
    // Every satellite ground point, small.
    for (const thing of sky.things) {
      if (!thing.satellite || thing.id === this.selected) continue;
      const p = this.project(thing.satellite.subpoint.lat, thing.satellite.subpoint.lon);
      context.fillStyle = ORBIT_COLORS[thing.satellite.orbit.orbitClass];
      context.globalAlpha = 0.8;
      context.beginPath();
      context.arc(p.x, p.y, 3, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      this.hits.push({ id: thing.id, x: p.x, y: p.y });
    }
    // Dated space-history places: small blue diamonds.
    for (const event of SPACE_HISTORY) {
      const p = this.project(event.location.lat, event.location.lon);
      if (p.x < -10 || p.y < -10 || p.x > this.width + 10 || p.y > this.height + 10) continue;
      context.fillStyle = 'rgba(8,8,12,0.85)';
      context.strokeStyle = THEME.accent;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(p.x, p.y - 6);
      context.lineTo(p.x + 5, p.y);
      context.lineTo(p.x, p.y + 6);
      context.lineTo(p.x - 5, p.y);
      context.closePath();
      context.fill();
      context.stroke();
      if (this.zoom >= 3) this.text(context, event.title.length > 26 ? `${event.title.slice(0, 25)}…` : event.title, p.x, p.y + 8, THEME.muted);
      this.hits.push({ id: `event:${event.id}`, x: p.x, y: p.y });
    }
    // Sun and Moon overhead points.
    for (const id of ['sun', 'moon']) {
      const thing = sky.things.find((item) => item.id === id);
      const point = thing?.body?.overhead;
      if (!thing || !point || thing.id === this.selected) continue;
      const p = this.project(point.lat, point.lon);
      context.fillStyle = id === 'sun' ? '#ffe7b3' : '#d8d4ca';
      context.beginPath();
      context.arc(p.x, p.y, 6, 0, Math.PI * 2);
      context.fill();
      this.text(context, id === 'sun' ? 'Sun overhead' : 'Moon overhead', p.x, p.y + 10, '#fafafa');
      this.hits.push({ id: thing.id, x: p.x, y: p.y });
    }
    // You.
    const you = this.project(sky.observer.lat, sky.observer.lon);
    context.fillStyle = THEME.skyTop;
    context.strokeStyle = THEME.accent;
    context.lineWidth = 2;
    context.beginPath();
    context.rect(you.x - 5, you.y - 5, 10, 10);
    context.fill();
    context.stroke();
    this.text(context, 'You', you.x, you.y + 9, THEME.accent);
    // Selected ground point.
    const selected = sky.things.find((item) => item.id === this.selected);
    const ground = selected ? groundPointOf(selected) : null;
    if (selected && ground) {
      const p = this.project(ground.point.lat, ground.point.lon);
      context.strokeStyle = '#fafafa';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(p.x - 9, p.y);
      context.lineTo(p.x + 9, p.y);
      context.moveTo(p.x, p.y - 9);
      context.lineTo(p.x, p.y + 9);
      context.stroke();
      context.beginPath();
      context.arc(p.x, p.y, 13, 0, Math.PI * 2);
      context.stroke();
      this.text(context, `${shortName(selected)} · ${ground.label.toLowerCase()}`, p.x, p.y + 16, '#fafafa');
    }
    if (this.picked) {
      const p = this.project(this.picked.lat, this.picked.lon);
      context.fillStyle = THEME.accent;
      context.beginPath();
      context.moveTo(p.x, p.y);
      context.arc(p.x, p.y - 12, 6, Math.PI * 0.8, Math.PI * 2.2);
      context.closePath();
      context.fill();
    }
  }

  private text(context: CanvasRenderingContext2D, label: string, x: number, y: number, color: string) {
    context.font = '600 11px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    const width = context.measureText(label).width + 8;
    const cx = Math.max(width / 2 + 2, Math.min(this.width - width / 2 - 2, x));
    const cy = Math.min(this.height - 17, y);
    context.fillStyle = 'rgba(8,8,12,0.78)';
    context.fillRect(cx - width / 2, cy, width, 15);
    context.fillStyle = color;
    context.fillText(label, cx, cy + 2);
  }
}

function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function shortName(thing: SkyThing): string {
  return thing.name.length > 22 ? `${thing.name.slice(0, 21)}…` : thing.name;
}
