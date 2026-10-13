import { describe, expect, test } from 'vitest';
import { distanceKm, findPlaces, groundAnchor, normalizeLongitude, safeLink, splitTrackAtAntimeridian } from '../src/geo';

const zero = { lat: 0, lon: 0 };

describe('distance and places', () => {
  test('same point, equator arc, antimeridian, and poles', () => {
    expect(distanceKm(zero, zero)).toBe(0);
    expect(Math.abs(distanceKm(zero, { lat: 0, lon: 1 }) - 111.195)).toBeLessThan(0.01);
    expect(distanceKm({ lat: 0, lon: 179 }, { lat: 0, lon: -179 })).toBeLessThan(223);
    expect(distanceKm({ lat: 90, lon: 0 }, { lat: 90, lon: 180 })).toBeLessThan(0.001);
  });

  test('rejects invalid coordinates and radius', () => {
    expect(() => distanceKm(zero, { lat: 91, lon: 0 })).toThrow(RangeError);
    expect(() => distanceKm(zero, { lat: Number.NaN, lon: 0 })).toThrow(RangeError);
    expect(() => findPlaces([], zero, 'all', -1)).toThrow(RangeError);
  });

  test('interest and radius combine and results stay ordered', () => {
    const points = [
      { id: 'far', lat: 0, lon: 2, categories: ['museums'] },
      { id: 'near', lat: 0, lon: 0.1, categories: ['museums'] },
      { id: 'college', lat: 0, lon: 0.01, categories: ['colleges'] },
    ];
    expect(findPlaces(points, zero, 'museums', 200).map((place) => place.id)).toEqual(['near']);
    expect(findPlaces(points, zero, 'all', 300).map((place) => place.id)).toEqual(['college', 'near', 'far']);
  });
});

describe('anchors and links', () => {
  test('a planet cannot become an Earth-satellite ground anchor', () => {
    expect(() => groundAnchor('under-satellite', zero, { kind: 'planet' })).toThrow(RangeError);
    expect(groundAnchor('near-me', zero, { kind: 'planet' })).toBe(zero);
    const subpoint = { lat: 3, lon: 4 };
    expect(groundAnchor('under-satellite', zero, { kind: 'satellite', subpoint })).toBe(subpoint);
  });

  test('external links allow HTTPS and block other schemes and credentials', () => {
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('http://example.org')).toBeNull();
    expect(safeLink('https://user:pass@example.org')).toBeNull();
    expect(safeLink('https://www.nasa.gov/')).toBe('https://www.nasa.gov/');
  });
});

describe('antimeridian tracks', () => {
  test('wraps longitude and splits a date-line jump', () => {
    expect(normalizeLongitude(13.5)).toBeCloseTo(13.5);
    expect(normalizeLongitude(190)).toBeCloseTo(-170);
    expect(normalizeLongitude(-190)).toBeCloseTo(170);
    const segments = splitTrackAtAntimeridian([
      { lat: 0, lon: 170 },
      { lat: 1, lon: 179 },
      { lat: 1, lon: -179 },
      { lat: 2, lon: -170 },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0].map((point) => point.lon)).toEqual([170, 179]);
    expect(segments[1].map((point) => point.lon)).toEqual([-179, -170]);
  });
});
