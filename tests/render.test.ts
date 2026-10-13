// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { inEarthRegion, inSkyRegion, earthRegionById, skyRegionById } from '../src/content/regions';
import { planetFact } from '../src/content/planet-facts';
import { providerEnabled } from '../src/content/providers';
import { projectLonLat, landPath } from '../src/content/world';
import { initialState, project, reduce } from '../src/ui/session';
import { mountApp } from '../src/ui/render';

const at = new Date('2026-10-12T03:30:00.000Z');

function click(label: string) {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes(label));
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  button.click();
}

describe('screen actions', () => {
  test('uses calculated sky, places, and Natural Earth for the main journeys', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app');
    if (!root) throw new Error('missing app');
    let state = initialState(at);
    const view = mountApp(root, at, (action) => {
      state = reduce(state, action);
      view.update(state);
    });
    view.update(state);

    expect(document.body.textContent).toContain('Selected time');
    expect(document.body.textContent).not.toContain('demo-iss');
    expect(document.body.textContent?.toLowerCase()).not.toContain('live satellite');

    click('Start in space');
    expect(document.body.textContent).toContain('ISS (ZARYA)');
    expect(document.body.textContent).toContain('Jupiter');
    click('ISS (ZARYA)');
    expect(document.querySelector('h1')?.textContent).toContain('ISS (ZARYA)');
    expect(document.body.textContent).toContain('NORAD catalog 25544');
    click('Connect to Earth');
    const beneath = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('Beneath this satellite'));
    expect(beneath).toBeTruthy();
    expect((beneath as HTMLButtonElement).disabled).toBe(false);
    click('Explore connected places');
    expect(document.querySelector('h1')?.textContent).toContain('Your world');
    expect(document.querySelector('#earth-map path[data-kind="land"]')?.getAttribute('d')).toContain('M');
    click('Back');
    click('Back');
    click('Back');
    click('Jupiter');
    expect(document.body.textContent).toContain('142984 kilometre');
    click('Find related places');
    const blocked = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes('Beneath this satellite')) as HTMLButtonElement;
    expect(blocked.disabled).toBe(true);
    expect(document.body.textContent).toContain('do not have an artificial-satellite ground point');
    click('Back');
    click('Back');
    click('Back');

    click('Start on Earth');
    click('Los Angeles area');
    expect(document.body.textContent).toContain('Griffith Observatory');
    click('Griffith Observatory');
    click('See the sky here');
    expect(document.body.textContent).toContain('Griffith Observatory');
    expect(document.body.textContent).toContain('ISS (ZARYA)');
    click('Back');
    click('Back');
    click('Back');
    click('Back');

    click('Start with an area');
    expect(document.body.textContent).toContain('Above the horizon');
    click('Earth area');
    click('Use Los Angeles area as the sky observer');
    expect(document.querySelector('h1')?.textContent).toContain('Your window into space');

    click('Select a sky region');
    const select = document.getElementById('sky-region');
    if (!(select instanceof HTMLSelectElement)) throw new Error('missing sky region');
    select.value = 'whole-sky';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    click('Clear area');
    expect(document.querySelector('h1')?.textContent).toContain('Your window into space');
  });

  test('keeps media, learning, and recovery on reviewed or explicit empty states', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app');
    if (!root) throw new Error('missing app');
    let state = initialState(at);
    const view = mountApp(root, at, (action) => {
      state = reduce(state, action);
      view.update(state);
    });
    view.update(state);
    click('Start on Earth');
    click('Griffith Observatory');
    click('Open media and stories');
    click('History');
    expect(document.getElementById('content-panel')?.textContent).toMatch(/No reviewed event/);
    click('News');
    expect(document.getElementById('content-panel')?.textContent).toMatch(/No reviewed news/);
    click('Media');
    expect(document.getElementById('content-panel')?.textContent).toMatch(/No reviewed photo/);
    click('Make your own connection');
    click('Ready to share my idea');
    expect(document.getElementById('activity-feedback')?.textContent).toMatch(/Nothing is uploaded/);
    click('Start a new exploration');
    expect(document.querySelector('h1')?.textContent).toContain('Every place');
    click('Start in space');
    click('List');
    const search = document.getElementById('sky-search');
    if (!(search instanceof HTMLInputElement)) throw new Error('missing sky search');
    search.value = 'zzzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.body.textContent).toContain('No sky objects match');
    click('Open recovery');
    for (const label of ['Change criteria', 'Use the space list', 'Choose a city', 'Change the selected time']) {
      expect([...document.querySelectorAll('button')].some((node) => node.textContent?.includes(label))).toBe(true);
    }
    const recovery = document.getElementById('recovery');
    if (!(recovery instanceof HTMLSelectElement)) throw new Error('missing recovery');
    recovery.value = 'webgl';
    recovery.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelector('h1')?.textContent).toContain('3D view is unavailable');
  });
});

describe('open data in the session', () => {
  test('keeps a planet off the satellite ground point and returns to the source screen', () => {
    let state = reduce(initialState(at), { type: 'select-sky', id: 'jupiter', kind: 'planet' });
    state = reduce(state, { type: 'open-connection', origin: 'planet' });
    const view = project(state);
    expect(view.screen).toBe('S08');
    expect(view.choices.find((choice) => choice.id === 'under-satellite')?.disabled).toBe(true);
    expect(view.factLines.join(' ')).toContain('142984');
    state = reduce(state, { type: 'go', screen: 'S15' });
    expect(project(state).sourceReturn).toBe('S08');
  });

  test('finds Los Angeles places from the city and keeps the satellite ground point', () => {
    const state = reduce(initialState(at), { type: 'choose-city', id: 'la' });
    const view = project(state);
    expect(view.places.map((place) => place.id)).toEqual(['griffith', 'caltech', 'jpl']);
    const satellite = reduce(initialState(at), { type: 'select-sky', id: 'norad-25544', kind: 'satellite' });
    const connected = project(reduce(satellite, { type: 'relation', relation: 'under-satellite' }));
    expect(connected.anchorKind).toBe('subpoint');
    expect(connected.anchor.lat).toBeCloseTo(7.08, 1);
  });
});

describe('regions and reviewed facts', () => {
  test('splits sky angles from earth boxes and keeps the Wikidata snapshot', () => {
    const north = skyRegionById('north');
    const south = skyRegionById('south');
    if (!north || !south) throw new Error('missing region');
    expect(inSkyRegion(0, 10, north)).toBe(true);
    expect(inSkyRegion(0, 10, south)).toBe(false);
    expect(inSkyRegion(10, 0, skyRegionById('above-horizon')!)).toBe(false);
    const losAngeles = earthRegionById('los-angeles');
    const washington = earthRegionById('washington');
    if (!losAngeles || !washington) throw new Error('missing earth region');
    expect(inEarthRegion(34.1184, -118.3004, losAngeles)).toBe(true);
    expect(inEarthRegion(38.8882, -77.0199, losAngeles)).toBe(false);
    expect(inEarthRegion(38.8882, -77.0199, washington)).toBe(true);
    expect(planetFact('jupiter')?.measurements[0]?.value).toBe(142984);
    expect(planetFact('mars')?.measurements.length).toBe(3);
    const point = projectLonLat(-118.3, 34.1);
    expect(point.x).toBeGreaterThan(0);
    expect(point.x).toBeLessThan(360);
    expect(point.y).toBeGreaterThan(0);
    expect(point.y).toBeLessThan(180);
    expect(landPath()).toContain('M');
    expect(providerEnabled('planet-calculation')).toBe(true);
    expect(providerEnabled('orbital-elements')).toBe(true);
    expect(providerEnabled('world-basemap')).toBe(true);
    expect(providerEnabled('media')).toBe(false);
    expect(providerEnabled('earth-renderer')).toBe(false);
  });
});
