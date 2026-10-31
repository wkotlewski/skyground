import { describe, expect, test } from 'vitest';
import { handle, type Deps } from '../../worker/src/handler';
import { MemoryStore } from '../../worker/src/store';

const ORIGIN = 'https://wkotlewski.github.io';

function setup(now = new Date('2026-10-30T20:00:00Z')) {
  const store = new MemoryStore();
  const deps: Deps = { store, adminToken: 'a'.repeat(40), salt: 'pepper', allowedOrigins: [ORIGIN], now: () => now };
  const call = (path: string, init: RequestInit & { ip?: string; origin?: string | null } = {}) => {
    const headers = new Headers(init.headers);
    if (init.origin !== null) headers.set('origin', init.origin ?? ORIGIN);
    headers.set('cf-connecting-ip', init.ip ?? '203.0.113.7');
    if (init.body) headers.set('content-type', 'application/json');
    return handle(new Request(`https://names.example${path}`, { ...init, headers }), deps);
  };
  return { store, deps, call };
}

describe('star names API', () => {
  test('anyone can add a name and everyone can read it, with many names per star', async () => {
    const { call } = setup();
    const first = await call('/v1/names', { method: 'POST', body: JSON.stringify({ star: 'hip-91262', name: 'Sparkle' }) });
    expect(first.status).toBe(201);
    expect(first.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    await call('/v1/names', { method: 'POST', body: JSON.stringify({ star: 'hip-91262', name: 'Grandma Rose' }), ip: '198.51.100.2' });
    const all = await (await call('/v1/names', { origin: null })).json() as { names: Array<{ name: string; star: string }> };
    expect(all.names.map((n) => n.name)).toEqual(['Sparkle', 'Grandma Rose']);
    const one = await (await call('/v1/names?star=hip-91262')).json() as { names: unknown[] };
    expect(one.names).toHaveLength(2);
  });

  test('rejects rude names, duplicates, unknown stars, and posts from other websites', async () => {
    const { call } = setup();
    expect((await call('/v1/names', { method: 'POST', body: JSON.stringify({ star: 'hip-1', name: 'You are ugly' }) })).status).toBe(400);
    expect((await call('/v1/names', { method: 'POST', body: JSON.stringify({ star: 'mars', name: 'Nova' }) })).status).toBe(400);
    await call('/v1/names', { method: 'POST', body: JSON.stringify({ star: 'hip-1', name: 'Nova' }) });
    expect((await call('/v1/names', { method: 'POST', body: JSON.stringify({ star: 'hip-1', name: 'nova' }) })).status).toBe(409);
    expect((await call('/v1/names', { method: 'POST', body: JSON.stringify({ star: 'hip-1', name: 'Luna' }), origin: 'https://evil.example' })).status).toBe(403);
  });

  test('limits how many names one visitor can add in an hour', async () => {
    const { call } = setup();
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) statuses.push((await call('/v1/names', { method: 'POST', body: JSON.stringify({ star: `hip-${i + 10}`, name: `Star number ${i}` }) })).status);
    expect(statuses.slice(0, 6).every((s) => s === 201)).toBe(true);
    expect(statuses[6]).toBe(429);
    // Someone else is not affected.
    expect((await call('/v1/names', { method: 'POST', body: JSON.stringify({ star: 'hip-99', name: 'Other kid' }), ip: '192.0.2.44' })).status).toBe(201);
  });

  test('three different reports hide a name; the admin can restore or hide it', async () => {
    const { call, store, deps } = setup();
    const created = await (await call('/v1/names', { method: 'POST', body: JSON.stringify({ star: 'hip-5', name: 'Comet Pal' }) })).json() as { name: { id: number } };
    const id = created.name.id;
    await call('/v1/reports', { method: 'POST', body: JSON.stringify({ id }), ip: '1.1.1.1' });
    await call('/v1/reports', { method: 'POST', body: JSON.stringify({ id }), ip: '1.1.1.1' });
    await call('/v1/reports', { method: 'POST', body: JSON.stringify({ id }), ip: '2.2.2.2' });
    expect((await store.get(id))!.hidden).toBe(0);
    await call('/v1/reports', { method: 'POST', body: JSON.stringify({ id }), ip: '3.3.3.3' });
    expect((await store.get(id))!.hidden).toBe(1);
    const visible = await (await call('/v1/names')).json() as { names: unknown[] };
    expect(visible.names).toHaveLength(0);
    expect((await call('/v1/admin/names?view=reported', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
    const admin = { authorization: `Bearer ${deps.adminToken}` };
    const reported = await (await call('/v1/admin/names?view=reported', { headers: admin })).json() as { names: Array<{ id: number }> };
    expect(reported.names[0].id).toBe(id);
    await call(`/v1/admin/names/${id}`, { method: 'POST', body: JSON.stringify({ hidden: false }), headers: admin });
    expect((await store.get(id))!.hidden).toBe(0);
  });

  test('stores no IP addresses', async () => {
    const { call, store } = setup();
    await call('/v1/names', { method: 'POST', body: JSON.stringify({ star: 'hip-7', name: 'Twinkle' }), ip: '203.0.113.99' });
    const everything = JSON.stringify([store.rows, [...store.limits.keys()], [...store.reports]]);
    expect(everything).not.toContain('203.0.113.99');
  });
});
