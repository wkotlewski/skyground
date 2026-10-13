// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { cities } from '../src/content/cities';
import { places } from '../src/content/places';
import { buildModel } from '../src/ui/model';
import { mountApp } from '../src/ui/render';

describe('page shell', () => {
  test('renders calculated sky text and the accessible lists', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app');
    if (!root) throw new Error('missing app');
    const model = buildModel({
      city: cities.la,
      atUtc: new Date('2026-10-12T03:30:00.000Z'),
      mode: 'near-me',
      radiusKm: 100,
      interest: 'all',
      grade: '3-5',
      search: '',
      minElevationDeg: -90,
      selectedId: 'sun',
      places,
    });
    const view = mountApp(root, {
      cityId: 'la',
      grade: '3-5',
      mode: 'near-me',
      radiusKm: 100,
      interest: 'all',
      minElevationDeg: -90,
      selectedTime: new Date('2026-10-12T03:30:00.000Z'),
      pane: 'sky',
      onCity: () => undefined,
      onGrade: () => undefined,
      onMode: () => undefined,
      onRadius: () => undefined,
      onTime: () => undefined,
      onUseDeviceClock: () => undefined,
      onSearch: () => undefined,
      onInterest: () => undefined,
      onSkyArea: () => undefined,
      onSelect: () => undefined,
      onPane: () => undefined,
      onToggleSpace: () => undefined,
    });
    view.update(model);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Selected time');
    expect(text).toContain('ISS (ZARYA)');
    expect(text).toContain('Griffith Observatory');
    expect(text).not.toContain('demo-iss');
    expect(text.toLowerCase()).not.toContain('live satellite');
    expect(document.getElementById('sky-list')?.querySelectorAll('button').length).toBeGreaterThan(3);
    expect(document.getElementById('place-list')?.textContent).toContain('Griffith Observatory');
    expect(document.querySelectorAll('#earth-chart [data-kind="place"]').length).toBe(3);
    expect(document.querySelectorAll('#sky-chart [data-kind="body"], #sky-chart [data-kind="sat"]').length).toBeGreaterThan(0);
  });
});
