// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { mountPresentation } from '../src/ui/present/shell';
import { canUseSubpoint, inArea } from '../src/ui/present/domain';
import { connectPlaces, contentFor, observerForCity, skyCatalog } from '../src/ui/present/catalog';

const at = new Date('2026-10-12T03:30:00.000Z');

function click(label: string) {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.includes(label) && !(node as HTMLButtonElement).disabled);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  button.click();
}

describe('presentation shell', () => {
  test('uses the explore layout and calculated records', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app');
    if (!root) throw new Error('missing app');
    mountPresentation(root, { at, cityId: 'la' });
    const text = document.body.textContent ?? '';
    expect(text).toContain('Where will your curiosity take you?');
    expect(text).toContain('Your window into space');
    expect(text).toContain('ISS (ZARYA)');
    expect(text).toContain('NORAD 25544');
    expect(text).toContain('Selected time');
    expect(text.toLowerCase()).not.toContain('demo-iss');
    expect(text.toLowerCase()).not.toContain('illustrative position');
    expect(text.toLowerCase()).not.toContain('live satellite');
    expect(document.getElementById('results')?.querySelectorAll('button').length).toBeGreaterThan(3);

    click('Planets');
    expect(document.getElementById('results')?.textContent).toContain('Jupiter');
    expect(document.getElementById('results')?.textContent).not.toContain('ISS (ZARYA)');
    click('Jupiter');
    expect(document.getElementById('detail')?.textContent).toContain('142984');
    const subpoint = document.querySelector<HTMLOptionElement>('#relation option[value="subpoint"]');
    expect(subpoint?.disabled).toBe(true);
    expect(document.getElementById('connection-rule')?.textContent).toMatch(/no satellite ground point/i);
    click('Connect to Earth');
    expect(document.getElementById('title')?.textContent).toContain('Your world of connections');
    expect(document.body.textContent).toContain('Griffith Observatory');

    click('Earth');
    expect(document.getElementById('scene')).toBeTruthy();
    click('Select area');
    expect(document.getElementById('area-preset')).toBeTruthy();
    click('Museums');
    click('Griffith Observatory');
    click('Connect to space');
    expect(document.getElementById('title')?.textContent).toContain('Your window into space');
    expect(document.getElementById('ground-name')?.textContent).toContain('Griffith Observatory');
    click('Media & stories');
    expect(document.getElementById('content')?.textContent).toMatch(/No reviewed photo/);
  });
});

describe('presentation data rules', () => {
  test('keeps planets off a satellite ground point and filters sky areas', () => {
    const sky = skyCatalog(observerForCity('la'), at);
    const iss = sky.find((entity) => entity.id === 'norad-25544');
    const jupiter = sky.find((entity) => entity.id === 'jupiter');
    if (!iss || !jupiter) throw new Error('missing sky records');
    expect(canUseSubpoint(iss)).toBe(true);
    expect(canUseSubpoint(jupiter)).toBe(false);
    expect(jupiter.groundPoint).toBeUndefined();
    const nearby = connectPlaces({
      entity: iss,
      relation: 'subpoint',
      interest: 'museums',
      radiusKm: 100,
      observer: { lat: 34.05, lon: -118.25 },
    });
    expect(nearby).toHaveLength(0);
    expect(inArea(jupiter, { west: 0, east: 360, south: 0, north: 90 }, 'sky')).toBe(jupiter.sky!.altitudeDeg >= 0);
    expect(contentFor(jupiter, 'history', '3-5')[0]?.text).toMatch(/not inferred/);
  });
});

describe('mobile layout', () => {
  test('stacks the starting list above the scene', () => {
    const css = readFileSync('styles.css', 'utf8');
    expect(css).toMatch(/max-width:\s*800px/);
    expect(css).toMatch(/\.shell\s*\{\s*display:\s*block/);
    expect(css).toMatch(/min-height:\s*var\(--sg-touch\)/);
  });
});
