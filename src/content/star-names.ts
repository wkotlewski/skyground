import { STAR_NAMES_API } from '../config';
import { checkStarName } from './name-filter';

/**
 * Talks to the SkyGround star names service. Names are public and shared by everyone.
 * Only the star and the name are sent; nothing about the visitor is stored on this device.
 */
export interface SharedName {
  id: number;
  star: string;
  name: string;
  at: string;
}

export type AddResult = { ok: true; name: SharedName } | { ok: false; reason: string };

export class StarNames {
  private byStar = new Map<string, SharedName[]>();
  private lastId = 0;
  private listeners = new Set<() => void>();
  readonly enabled: boolean;

  private base: string;

  constructor(base?: string) {
    this.base = (base ?? STAR_NAMES_API).replace(/\/$/, '');
    this.enabled = /^https:\/\//.test(this.base) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(this.base);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  names(star: string): SharedName[] {
    return this.byStar.get(star) ?? [];
  }

  all(): Map<string, SharedName[]> {
    return this.byStar;
  }

  /** Fetch names added since the last check. */
  async refresh(): Promise<void> {
    if (!this.enabled) return;
    try {
      const response = await fetch(`${this.base}/v1/names?since=${this.lastId}`, { credentials: 'omit' });
      if (!response.ok) return;
      const body = (await response.json()) as { names: SharedName[] };
      for (const name of body.names) this.add(name);
      if (body.names.length) this.emit();
    } catch {
      /* Offline: names already loaded stay visible. */
    }
  }

  async addName(star: string, raw: string): Promise<AddResult> {
    const checked = checkStarName(raw);
    if (!checked.ok) return checked;
    if (!this.enabled) return { ok: false, reason: 'Star naming is not switched on yet.' };
    try {
      const response = await fetch(`${this.base}/v1/names`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ star, name: checked.name }),
      });
      const body = (await response.json().catch(() => ({}))) as { name?: SharedName; error?: string };
      if (!response.ok || !body.name) return { ok: false, reason: body.error ?? 'Something went wrong. Try again in a moment.' };
      this.add(body.name);
      this.emit();
      return { ok: true, name: body.name };
    } catch {
      return { ok: false, reason: 'Could not reach the star names service. Check your connection and try again.' };
    }
  }

  async report(id: number): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const response = await fetch(`${this.base}/v1/reports`, { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Every name containing the search text, newest first. */
  search(text: string, limit = 30): SharedName[] {
    const needle = text.trim().toLowerCase();
    if (needle.length < 2) return [];
    const found: SharedName[] = [];
    for (const list of this.byStar.values()) for (const name of list) if (name.name.toLowerCase().includes(needle)) found.push(name);
    return found.sort((a, b) => b.id - a.id).slice(0, limit);
  }

  private add(name: SharedName) {
    const list = this.byStar.get(name.star) ?? [];
    if (!list.some((item) => item.id === name.id)) list.push(name);
    this.byStar.set(name.star, list);
    this.lastId = Math.max(this.lastId, name.id);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
