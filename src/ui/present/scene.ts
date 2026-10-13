import land from '../../../data/world/ne-110m-land.json';
import type { Area, Entity, World } from './types';

interface SceneHooks {
  onSelect: (id: string) => void;
  onArea: (area: Area) => void;
}

/** Horizon chart and Natural Earth overview. Marker size is not distance or brightness. */
export class Scene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private hooks: SceneHooks;
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private items: Entity[] = [];
  private world: World = 'sky';
  private mode = 'search';
  private selected = '';
  private area: Area | null = null;
  private hits: Array<{ id: string; x: number; y: number; r: number }> = [];
  private start: { x: number; y: number } | null = null;
  private current: { x: number; y: number } | null = null;
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement, hooks: SceneHooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.ctx = canvas.getContext('2d');
    try {
      const observer = new ResizeObserver(() => this.draw());
      observer.observe(canvas);
    } catch {
      /* The list stays usable when resize observation is missing. */
    }
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.start = this.point(event);
      this.current = this.start;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.start) return;
      const next = this.point(event);
      if (this.mode !== 'area') {
        this.pan.x += next.x - this.current!.x;
        this.pan.y += next.y - this.current!.y;
      }
      this.current = next;
      this.draw();
    });
    canvas.addEventListener('pointerup', (event) => {
      if (!this.start) return;
      const end = this.point(event);
      const start = this.start;
      this.start = null;
      this.current = null;
      if (this.mode === 'area' && Math.hypot(end.x - start.x, end.y - start.y) > 8) {
        const a = this.unproject(start);
        const b = this.unproject(end);
        this.hooks.onArea({
          west: Math.min(a.x, b.x),
          east: Math.max(a.x, b.x),
          south: Math.min(a.y, b.y),
          north: Math.max(a.y, b.y),
        });
      } else if (Math.hypot(end.x - start.x, end.y - start.y) < 8) {
        const hit = [...this.hits].reverse().find((item) => Math.hypot(end.x - item.x, end.y - item.y) < item.r);
        if (hit) this.hooks.onSelect(hit.id);
      }
      this.draw();
    });
    canvas.addEventListener('pointercancel', () => {
      this.start = null;
      this.current = null;
      this.draw();
    });
  }

  update(input: { world: World; items: Entity[]; selected: string; mode: string; area: Area | null }) {
    if (this.world !== input.world) this.reset();
    this.world = input.world;
    this.items = input.items;
    this.selected = input.selected;
    this.mode = input.mode;
    this.area = input.area;
    this.canvas.style.touchAction = input.mode === 'area' ? 'none' : 'pan-y';
    this.draw();
  }

  reset() {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.draw();
  }

  setZoom(factor: number) {
    this.zoom = Math.max(1, Math.min(8, this.zoom * factor));
    this.draw();
  }

  private point(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private project(x: number, y: number) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const px = this.world === 'earth' ? ((x + 180) / 360) * this.width : (x / 360) * this.width;
    const py = this.world === 'earth' ? ((90 - y) / 180) * this.height : ((90 - y) / 90) * this.height;
    return { x: cx + (px - cx) * this.zoom + this.pan.x, y: cy + (py - cy) * this.zoom + this.pan.y };
  }

  private unproject(point: { x: number; y: number }) {
    const px = (point.x - this.width / 2 - this.pan.x) / this.zoom + this.width / 2;
    const py = (point.y - this.height / 2 - this.pan.y) / this.zoom + this.height / 2;
    if (this.world === 'earth') {
      return {
        x: Math.max(-180, Math.min(180, (px / this.width) * 360 - 180)),
        y: Math.max(-90, Math.min(90, 90 - (py / this.height) * 180)),
      };
    }
    return {
      x: Math.max(0, Math.min(360, (px / this.width) * 360)),
      y: Math.max(0, Math.min(90, 90 - (py / this.height) * 90)),
    };
  }

  private draw() {
    try {
      this.paint();
    } catch {
      /* A missing canvas still leaves the list usable. */
    }
  }

  private paint() {
    const context = this.ctx;
    if (!context) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    if (!this.width || !this.height) return;
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(this.width * ratio);
    this.canvas.height = Math.floor(this.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    this.hits = [];
    if (this.world === 'sky') this.drawSky(context);
    else this.drawEarth(context);
    this.drawMarkers(context);
    if (this.area) {
      const a = this.project(this.area.west, this.area.north);
      const b = this.project(this.area.east, this.area.south);
      this.box(context, a, b);
    }
    if (this.mode === 'area' && this.start && this.current) this.box(context, this.start, this.current);
  }

  private drawSky(context: CanvasRenderingContext2D) {
    const glow = context.createRadialGradient(this.width * 0.55, this.height * 0.42, 20, this.width * 0.5, this.height * 0.45, this.width * 0.7);
    glow.addColorStop(0, '#1b1b28');
    glow.addColorStop(1, '#050508');
    context.fillStyle = glow;
    context.fillRect(0, 0, this.width, this.height);
    for (let index = 0; index < 80; index += 1) {
      context.fillStyle = `rgba(250,250,250,${0.25 + (index % 4) * 0.12})`;
      context.fillRect((index * 73.1) % this.width, (index * index * 19.4) % this.height, index % 5 === 0 ? 2 : 1, 1);
    }
    context.strokeStyle = '#ffe81f55';
    context.lineWidth = 1.5;
    context.beginPath();
    context.ellipse(this.width / 2, this.height * 1.05, this.width * 0.72, this.height * 0.42, 0, Math.PI, 0);
    context.stroke();
  }

  private drawEarth(context: CanvasRenderingContext2D) {
    context.fillStyle = '#101014';
    context.fillRect(0, 0, this.width, this.height);
    context.fillStyle = '#2a2a30';
    context.strokeStyle = '#8d8d96';
    context.lineWidth = 0.6;
    for (const ring of land.rings) {
      context.beginPath();
      ring.forEach(([lon, lat], index) => {
        const point = this.project(lon, lat);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.closePath();
      context.fill();
      context.stroke();
    }
  }

  private drawMarkers(context: CanvasRenderingContext2D) {
    const drawable = [...this.items].sort((a, b) => (a.id === this.selected ? 1 : 0) - (b.id === this.selected ? 1 : 0));
    for (const entity of drawable) {
      const geo = this.world === 'earth' ? entity.location : entity.sky;
      if (!geo) continue;
      const altitude = 'altitudeDeg' in geo ? geo.altitudeDeg : 0;
      if (this.world === 'sky' && altitude < 0) continue;
      const point = this.project(
        this.world === 'earth' ? (geo as { lon: number }).lon : (geo as { azimuthDeg: number }).azimuthDeg,
        this.world === 'earth' ? (geo as { lat: number }).lat : altitude,
      );
      if (point.x < -40 || point.y < -40 || point.x > this.width + 40 || point.y > this.height + 40) continue;
      const selected = entity.id === this.selected;
      this.sprite(context, entity, point.x, point.y, selected);
      this.label(context, entity.name, entity.subtitle, point.x, point.y + 28, selected);
      this.hits.push({ id: entity.id, x: point.x, y: point.y, r: 28 });
    }
  }

  private sprite(context: CanvasRenderingContext2D, entity: Entity, x: number, y: number, selected: boolean) {
    context.save();
    context.translate(x, y);
    if (entity.kind === 'satellite') {
      context.strokeStyle = selected ? '#ffe81f' : '#d7d7de';
      context.fillStyle = '#1c1c22';
      context.lineWidth = 1.5;
      context.strokeRect(-22, -6, 16, 12);
      context.strokeRect(6, -6, 16, 12);
      context.fillStyle = '#f4f1e8';
      context.fillRect(-6, -6, 12, 12);
    } else if (entity.kind === 'planet' || entity.kind === 'moon' || entity.kind === 'sun') {
      const gradient = context.createRadialGradient(-4, -4, 2, 0, 0, 14);
      gradient.addColorStop(0, entity.kind === 'sun' ? '#fff4a8' : '#f3efe4');
      gradient.addColorStop(1, entity.kind === 'sun' ? '#ffe81f' : '#8d8478');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(0, 0, 12, 0, Math.PI * 2);
      context.fill();
      if (entity.id === 'saturn') {
        context.strokeStyle = '#d9c7a2';
        context.lineWidth = 2;
        context.beginPath();
        context.ellipse(0, 0, 20, 6, -0.4, 0, Math.PI * 2);
        context.stroke();
      }
    } else {
      context.fillStyle = '#ffe81f';
      context.beginPath();
      context.arc(0, 0, 7, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#080808';
      context.font = '700 10px system-ui';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('•', 0, 1);
    }
    if (selected) {
      context.strokeStyle = '#ffe81f';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, 24, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  private label(context: CanvasRenderingContext2D, name: string, subtitle: string, x: number, y: number, selected: boolean) {
    context.font = '600 12px system-ui';
    const width = Math.max(context.measureText(name).width, context.measureText(subtitle).width) + 16;
    const left = x - width / 2;
    context.fillStyle = selected ? '#17140a' : '#111113ee';
    context.strokeStyle = selected ? '#ffe81f' : '#38383d';
    context.lineWidth = 1;
    context.beginPath();
    if (typeof context.roundRect === 'function') context.roundRect(left, y, width, 36, 8);
    else context.rect(left, y, width, 36);
    context.fill();
    context.stroke();
    context.fillStyle = '#fafafa';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.fillText(name, x, y + 4);
    context.fillStyle = '#bcbcc5';
    context.font = '11px system-ui';
    context.fillText(subtitle, x, y + 20);
  }

  private box(context: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }) {
    context.strokeStyle = '#ffe81f';
    context.fillStyle = '#ffe81f22';
    context.lineWidth = 2;
    context.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    context.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
}
