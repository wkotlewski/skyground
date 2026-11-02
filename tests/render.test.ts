// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mountExplore } from '../src/ui/explore/app';
import { BelowLookup, findRegion, insideRings, shortExcerpt, type BelowRegion } from '../src/content/below';
import { computeSky, groundPointOf } from '../src/ui/explore/sky-model';
import { observerFor, cityById } from '../src/content/world-cities';
import { canUseSubpoint } from '../src/ui/present/domain';
import { skyCatalog, observerForCity } from '../src/ui/present/catalog';
import { reviewedSnapshot } from '../src/sky/satellites';

// A time inside the bundled snapshot's freshness window.
const at = new Date(Date.parse(`${reviewedSnapshot.records[0].EPOCH}Z`) + 2 * 60 * 60 * 1000);
let app: ReturnType<typeof mountExplore> | null = null;

function click(label: string, scope: ParentNode = document) {
  const node = [...scope.querySelectorAll('button')].find((item) => item.textContent?.trim().startsWith(label) && !(item as HTMLButtonElement).disabled && !item.closest('[hidden]'));
  if (!(node instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  node.click();
}

function mount(tab?: 'sky' | 'orbits' | 'earth' | 'list') {
  document.body.innerHTML = '<div id="app"></div>';
  app = mountExplore(document.getElementById('app')!, { at, cityId: 'la', tab });
  return app;
}

beforeEach(() => {
  // The page checks its own site for newer satellite data; there is no site in tests.
  vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  app?.destroy();
  app = null;
});

describe('explore app', () => {
  test('opens on the sky with a pointing invitation and asks for nothing until a tap', () => {
    mount();
    const text = document.body.textContent ?? '';
    expect(text).toContain('What’s up there, and what’s below it?');
    expect(text).toContain('Point my phone');
    expect(text).toMatch(/stay on your phone and are never saved or shared/);
    expect(document.getElementById('sky-canvas')).toBeTruthy();
    expect(document.getElementById('city-button')?.textContent).toBe('Los Angeles');
    expect(document.querySelector('[data-tab="sky"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  test('the list shows satellites, planets, and stars with directions and opens a detail card', () => {
    mount('list');
    const list = document.getElementById('list-body')!;
    expect(list.textContent).toContain('International Space Station');
    expect(list.textContent).toContain('GOES-18 (GOES West)');
    expect(list.textContent).toContain('Jupiter');
    expect(list.textContent).toContain('Sirius');
    expect(list.textContent).toMatch(/Up in your sky/);
    click('International Space Station', list);
    const sheet = document.getElementById('sheet')!;
    expect(sheet.hidden).toBe(false);
    expect(sheet.textContent).toContain('LEO · Low Earth orbit');
    expect(sheet.textContent).toContain('What it does');
    expect(sheet.textContent).toContain('How it connects to the ground');
    expect(sheet.textContent).toContain('What’s below it right now');
    expect(sheet.textContent).toMatch(/does not mean the satellite is looking at or photographing/);
    expect(sheet.textContent).toMatch(/Speed now/);
  });

  test('planets get an overhead point, never a satellite ground point', () => {
    mount('list');
    click('Sun, Moon & planets');
    click('Jupiter', document.getElementById('list-body')!);
    const sheet = document.getElementById('sheet')!;
    expect(sheet.textContent).toContain('Where it’s straight overhead');
    expect(sheet.textContent).toMatch(/orbits the Sun, not Earth/);
    expect(sheet.textContent).not.toContain('What’s below it right now');
  });

  test('orbit cards compare LEO, MEO, GEO, and HEO with live numbers', () => {
    mount('orbits');
    const text = document.getElementById('view-orbits')!.textContent ?? '';
    for (const name of ['Low Earth orbit', 'Medium Earth orbit', 'Geostationary orbit', 'Highly elliptical orbit']) expect(text).toContain(name);
    expect(text).toContain('GPS III satellite 1');
    expect(text).toContain('Chandra X-ray Observatory');
    expect(text).toMatch(/Radio round trip/);
    click('Show true scale');
    expect(document.querySelector('.orbit-controls button')?.getAttribute('aria-pressed')).toBe('true');
  });

  test('settings change the city and time without storing anything', () => {
    mount();
    click('Los Angeles');
    const dialog = document.getElementById('settings')!;
    expect(dialog.hidden).toBe(false);
    const select = document.getElementById('city-select') as HTMLSelectElement;
    select.value = 'tokyo';
    select.dispatchEvent(new Event('change'));
    click('Done');
    expect(document.getElementById('city-button')?.textContent).toBe('Tokyo');
    expect(app!.state.city.lat).toBeCloseTo(35.68);
  });

  test('pointing needs a tap and falls back to dragging', async () => {
    mount();
    expect(app!.state.motion).toBe('off');
    click('Drag to explore');
    expect(document.getElementById('intro')?.hidden).toBe(true);
    expect(document.getElementById('motion-status')?.textContent).toMatch(/Drag to look around/);
  });
});

describe('space first', () => {
  test('a satellite card shows its picture, a tap-to-play video, and history beneath it', async () => {
    mount('list');
    click('International Space Station', document.getElementById('list-body')!);
    const sheet = document.getElementById('sheet')!;
    expect(sheet.querySelector('.media-figure img')?.getAttribute('src')).toMatch(/^media\/.+\.webp$/);
    expect(sheet.querySelector('.media-figure figcaption')?.textContent).toMatch(/Public domain|CC BY/);
    expect(sheet.querySelector('iframe')).toBeNull();
    click('', sheet.querySelector('.video-slot')!);
    expect(sheet.querySelector('iframe')?.getAttribute('src')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/D9gUhAOQ0O4/);
    expect(sheet.textContent).toContain('History beneath it');
    expect(sheet.textContent).toContain('Yuri Gagarin, first person in space');
    expect(sheet.textContent).toMatch(/does not mean an object had anything to do/);
  });

  test('the Moon lists history on the Moon itself, and asteroids list impacts on Earth', () => {
    mount('list');
    click('Sun, Moon & planets');
    click('Moon', document.getElementById('list-body')!);
    expect(document.getElementById('sheet')!.textContent).toContain('Apollo 11 lands at Tranquility Base');
    click('Close');
    click('Asteroids & galaxies');
    const list = document.getElementById('list-body')!;
    for (const name of ['Ceres', 'Vesta', 'Bennu', 'Pluto', 'Andromeda Galaxy', 'Crab Nebula']) expect(list.textContent).toContain(name);
    click('Apophis', list);
    const sheet = document.getElementById('sheet')!;
    expect(sheet.textContent).toContain('When space rocks reached the ground');
    expect(sheet.textContent).toContain('The impact that ended the dinosaurs');
  });
});


describe('places beneath', () => {
  test('tapping a country under a satellite opens its profile, the sky from there, and a timeline', async () => {
    mount('list');
    click('International Space Station', document.getElementById('list-body')!);
    const sheet = document.getElementById('sheet')!;
    for (let tries = 0; tries < 50 && !sheet.querySelector('.path-chips .chip.land'); tries += 1) await new Promise((done) => setTimeout(done, 50));
    const chip = sheet.querySelector<HTMLButtonElement>('.path-chips .chip.land');
    expect(chip).toBeTruthy();
    chip!.click();
    const text = sheet.textContent ?? '';
    expect(text).toContain('Back to International Space Station');
    expect(text).toContain('Looking up from here right now');
    expect(text).toContain('Timeline');
    expect(text).toMatch(/where sky and ground (also )?met/);
    if (sheet.querySelector('.profile')) expect(sheet.textContent).toMatch(/Life expectancy|People/);
    click('← Back to International Space Station', sheet);
    expect(sheet.textContent).toContain('What it does');
  });

  test('the bundled place pack has World Bank figures and Wikidata timelines for most countries', () => {
    const pack = JSON.parse(readFileSync('data/places/places.json', 'utf8'));
    const records = Object.values(pack.places) as Array<{ profile: Record<string, { value: number; year: number }> | null; timeline: unknown[] }>;
    expect(records.filter((item) => item.profile?.lifeExpectancy).length).toBeGreaterThan(150);
    expect(records.filter((item) => item.timeline.length).length).toBeGreaterThan(120);
    expect(pack.places['c-PER'].profile.population.value).toBeGreaterThan(30_000_000);
  });
});

describe('space history data', () => {
  test('every event has a real place, a dated label, an https source, and links to something that exists', async () => {
    const { SPACE_HISTORY } = await import('../src/content/space-history');
    const sky = computeSky(observerFor(cityById('la')), at);
    const ids = new Set(sky.things.map((thing) => thing.id));
    const kinds = new Set(sky.things.map((thing) => thing.kind as string));
    for (const event of SPACE_HISTORY) {
      expect(Math.abs(event.location.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(event.location.lon)).toBeLessThanOrEqual(180);
      expect(event.source).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
      expect(event.related.length).toBeGreaterThan(0);
      for (const target of event.related) expect(ids.has(target) || kinds.has(target), `${event.id} → ${target}`).toBe(true);
    }
  });
});

describe('sky model', () => {
  test('computes every bundled satellite plus the Sun, Moon, planets, and bright stars', () => {
    const sky = computeSky(observerFor(cityById('la')), at);
    expect(sky.hidden).toEqual([]);
    expect(sky.things.filter((thing) => thing.kind === 'satellite')).toHaveLength(reviewedSnapshot.records.length);
    expect(sky.things.filter((thing) => thing.kind === 'planet')).toHaveLength(7);
    expect(sky.things.some((thing) => thing.kind === 'star')).toBe(true);
    const iss = sky.things.find((thing) => thing.id === 'norad-25544')!;
    expect(groundPointOf(iss)?.label).toBe('Ground point');
    const jupiter = sky.things.find((thing) => thing.id === 'jupiter')!;
    expect(groundPointOf(jupiter)?.label).toBe('Overhead point');
    expect(jupiter.satellite).toBeUndefined();
  });

  test('legacy catalog still keeps planets off a satellite ground point', () => {
    const sky = skyCatalog(observerForCity('la'), at);
    expect(canUseSubpoint(sky.find((entity) => entity.id === 'jupiter')!)).toBe(false);
    expect(canUseSubpoint(sky.find((entity) => entity.id === 'norad-25544')!)).toBe(true);
  });
});

describe('what is below', () => {
  const square: BelowRegion = { id: 'c-SQ', kind: 'country', name: 'Squareland', wikidata: 'Q1', bbox: [0, 0, 10, 10], rings: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
  const sea: BelowRegion = { id: 'm-0', kind: 'sea', name: 'Test Sea', wikidata: null, bbox: [-20, -20, 20, 20], rings: [[[-20, -20], [20, -20], [20, 20], [-20, 20], [-20, -20]]] };

  test('point-in-polygon respects holes and tests countries before water', () => {
    expect(insideRings({ lat: 2, lon: 2 }, square.rings)).toBe(true);
    expect(insideRings({ lat: 5, lon: 5 }, square.rings)).toBe(false);
    expect(findRegion({ lat: 2, lon: 2 }, [square, sea])?.name).toBe('Squareland');
    expect(findRegion({ lat: 5, lon: 5 }, [square, sea])?.name).toBe('Test Sea');
    expect(findRegion({ lat: 50, lon: 50 }, [square, sea])).toBeNull();
  });

  test('answers open ocean honestly and attaches excerpts with their licence', () => {
    const lookup = new BelowLookup([square], {
      retrievedAtUtc: '2026-10-30T00:00:00Z',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      articles: { Q1: { intro: { title: 'Squareland', extract: 'Squareland is a test.', url: 'https://en.wikipedia.org/wiki/Squareland' }, history: null } },
    });
    expect(lookup.at({ lat: 2, lon: 2 }).intro?.extract).toBe('Squareland is a test.');
    expect(lookup.at({ lat: -40, lon: 100 }).kind).toBe('open-ocean');
    expect(shortExcerpt('One. Two. Three. Four.', 10)).toBe('One. Two.');
  });

  test('the bundled pack finds real places', () => {
    const regions = JSON.parse(readFileSync('data/below/regions.json', 'utf8')).regions as BelowRegion[];
    expect(findRegion({ lat: 34.05, lon: -118.24 }, regions)?.name).toMatch(/United States/);
    expect(findRegion({ lat: -12.05, lon: -77.04 }, regions)?.name).toBe('Peru');
    expect(findRegion({ lat: 0, lon: -150 }, regions)?.kind).toBe('ocean');
    expect(findRegion({ lat: 43, lon: 35 }, regions)?.name).toBe('Black Sea');
  });
});

describe('phone layout', () => {
  test('uses a full-height app with a bottom tab bar, touch-size controls, and a side panel on wide screens', () => {
    const css = readFileSync('styles.css', 'utf8');
    expect(css).toMatch(/\.app\s*\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/\.tabbar\s*\{/);
    expect(css).toMatch(/min-height:\s*var\(--sg-touch\)/);
    expect(css).toMatch(/--sg-touch:\s*44px/);
    expect(css).toMatch(/@media \(min-width: 960px\)/);
    expect(css).toMatch(/safe-area-inset-bottom/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});

describe('finding your way in the sky', () => {
  test('says which way you are facing in words', async () => {
    const { describeView } = await import('../src/ui/explore/app');
    expect(describeView(225, 35)).toBe('Facing southwest · 35° above the horizon');
    expect(describeView(0, 1)).toBe('Facing north · along the horizon');
    expect(describeView(90, -20)).toBe('Facing east · 20° below the horizon');
    expect(describeView(10, 88)).toBe('Looking straight up');
  });

  test('the planet edge touches the true horizon in front of you', async () => {
    const { horizonTangent } = await import('../src/ui/explore/sky-view');
    const { basisFromLook } = await import('../src/sensors/orientation');
    for (const [az, alt] of [[0, 30], [120, 5], [250, -20], [300, 60]]) {
      const { forward, right, up } = basisFromLook(az, alt);
      const f = 300;
      const t = horizonTangent(forward, right, up, f, 400, 800)!;
      const z = forward[2] + ((t.x - 200) / f) * right[2] + ((400 - t.y) / f) * up[2];
      expect(Math.abs(z)).toBeLessThan(1e-9);
    }
    const { forward, right, up } = basisFromLook(0, 90);
    expect(horizonTangent(forward, right, up, 300, 400, 800)).toBeNull();
  });

  test('Jump to flies to a planet or constellation and lists what is nearby', async () => {
    mount('sky');
    click('Jump to');
    const dialog = document.getElementById('jump')!;
    expect(dialog.hidden).toBe(false);
    expect(dialog.textContent).toContain('Mars');
    const search = document.getElementById('jump-search') as HTMLInputElement;
    search.value = 'orion';
    search.dispatchEvent(new Event('input'));
    click('Orion', dialog);
    expect(dialog.hidden).toBe(true);
    const nearby = document.getElementById('nearby')!;
    // The view flies there first; the nearby strip appears on landing.
    for (let tries = 0; tries < 150 && nearby.hidden; tries += 1) await new Promise((done) => setTimeout(done, 25));
    expect(nearby.hidden).toBe(false);
    expect(nearby.textContent).toContain('Near Orion');
    search.value = 'zzzz';
    click('Jump to');
    search.value = 'zzzz';
    search.dispatchEvent(new Event('input'));
    expect(document.getElementById('jump-results')!.textContent).toContain('Nothing by that name');
  });
});

describe('orbit levels in the sky view', () => {
  test('each layer holds the right kinds of objects', async () => {
    const { inLevel } = await import('../src/ui/explore/levels');
    const sky = computeSky(observerFor(cityById('la')), at, true);
    const sats = sky.things.filter((thing) => thing.satellite);
    for (const thing of sats) {
      const cls = thing.satellite!.orbit.orbitClass;
      expect(inLevel(thing, 'leo')).toBe(cls === 'LEO');
      expect(inLevel(thing, 'meo')).toBe(cls === 'MEO');
      expect(inLevel(thing, 'geo')).toBe(cls === 'GEO' || cls === 'GSO' || cls === 'HEO');
      expect(inLevel(thing, 'planets') || inLevel(thing, 'stars')).toBe(false);
      expect(inLevel(thing, 'orbits')).toBe(true);
    }
    const mars = sky.things.find((thing) => thing.name === 'Mars')!;
    expect(inLevel(mars, 'planets')).toBe(true);
    expect(inLevel(mars, 'leo')).toBe(false);
    expect(inLevel(mars, 'orbits')).toBe(false);
    expect(sky.things.every((thing) => inLevel(thing, 'all'))).toBe(true);
  });

  test('the orbit chip says which layer you are in and opens to switch', () => {
    mount('sky');
    const toggle = document.getElementById('level-toggle')!;
    const menu = document.getElementById('level-menu')!;
    expect(toggle.textContent).toBe('All');
    expect(menu.hidden).toBe(true);
    toggle.click();
    expect(menu.hidden).toBe(false);
    expect(menu.textContent).toContain('160–2,000 km up');
    (menu.querySelector('[data-level="leo"]') as HTMLButtonElement).click();
    expect(menu.hidden).toBe(true);
    expect(toggle.textContent).toBe('LEO');
    expect(menu.querySelector('[data-level="leo"]')!.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    (menu.querySelector('[data-level="all"]') as HTMLButtonElement).click();
    expect(toggle.textContent).toBe('All');
  });
});
