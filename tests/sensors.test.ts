import { describe, expect, test } from 'vitest';
import {
  angleBetweenDeg,
  azAltFromVector,
  basisFromLook,
  basisFromOrientation,
  directionVector,
  directionWords,
  projectToScreen,
  unprojectFromScreen,
} from '../src/sensors/orientation';
import { distanceFromEarth, overheadPoint } from '../src/sky/overhead';

describe('phone pointing', () => {
  test('a phone held upright facing north looks at the northern horizon', () => {
    const view = azAltFromVector(basisFromOrientation(0, 90, 0).forward);
    expect(view.altitudeDeg).toBeCloseTo(0, 5);
    expect(view.azimuthDeg).toBeCloseTo(0, 5);
  });

  test('a phone lying flat with the screen up looks at the ground', () => {
    expect(azAltFromVector(basisFromOrientation(0, 0, 0).forward).altitudeDeg).toBeCloseTo(-90, 5);
  });

  test('tilting the top back raises the view and alpha turns it west', () => {
    expect(azAltFromVector(basisFromOrientation(0, 135, 0).forward).altitudeDeg).toBeCloseTo(45, 5);
    const west = azAltFromVector(basisFromOrientation(90, 90, 0).forward);
    expect(west.azimuthDeg).toBeCloseTo(270, 5);
  });

  test('landscape keeps screen-up pointing at the sky', () => {
    // Top of the phone turned to the left, held upright facing east.
    const basis = basisFromOrientation(0, 0, -90, 90);
    expect(azAltFromVector(basis.forward).azimuthDeg).toBeCloseTo(90, 3);
    expect(basis.up[2]).toBeGreaterThan(0.99);
  });

  test('projection puts the view centre in the middle and round-trips', () => {
    const basis = basisFromLook(120, 30);
    const centre = projectToScreen(directionVector(120, 30), basis, 500, 400, 800);
    expect(centre?.x).toBeCloseTo(200, 6);
    expect(centre?.y).toBeCloseTo(400, 6);
    const higher = projectToScreen(directionVector(120, 40), basis, 500, 400, 800);
    expect(higher!.y).toBeLessThan(400);
    const eastward = projectToScreen(directionVector(130, 30), basis, 500, 400, 800);
    expect(eastward!.x).toBeGreaterThan(200);
    expect(projectToScreen(directionVector(300, -30), basis, 500, 400, 800)).toBeNull();
    const back = unprojectFromScreen(eastward!.x, eastward!.y, basis, 500, 400, 800);
    expect(angleBetweenDeg(back, directionVector(130, 30))).toBeLessThan(1e-6);
  });

  test('describes directions in plain words', () => {
    expect(directionWords(135, 50)).toBe('high in the southeast');
    expect(directionWords(0, 80)).toBe('almost straight overhead');
    expect(directionWords(270, -20)).toBe('below the horizon, toward the west');
  });
});

describe('overhead points', () => {
  test('the Sun is overhead near the Tropic of Cancer at the June solstice', () => {
    const point = overheadPoint('sun', new Date('2026-06-21T12:00:00Z'));
    expect(point!.lat).toBeCloseTo(23.44, 1);
    expect(Math.abs(point!.lon)).toBeLessThan(3);
  });

  test('the Sun is overhead at the equator near the March equinox and moves west with time', () => {
    const noon = overheadPoint('sun', new Date('2026-03-20T12:00:00Z'))!;
    expect(Math.abs(noon.lat)).toBeLessThan(0.5);
    const later = overheadPoint('sun', new Date('2026-03-20T18:00:00Z'))!;
    expect(later.lon).toBeCloseTo(noon.lon - 90, 0);
  });

  test('distances are realistic', () => {
    const moon = distanceFromEarth('moon', new Date('2026-10-30T12:00:00Z'))!;
    expect(moon.km).toBeGreaterThan(356_000);
    expect(moon.km).toBeLessThan(407_000);
    const sun = distanceFromEarth('sun', new Date('2026-10-30T12:00:00Z'))!;
    expect(sun.lightMinutes).toBeCloseTo(8.2, 0);
    expect(overheadPoint('pluto', new Date())).toBeNull();
  });
});

describe('bright stars', async () => {
  const { starPositions, starOverhead, lightLeftYear, STARS } = await import('../src/sky/stars');
  test('Polaris sits at about the observer latitude above due north', () => {
    const polaris = starPositions({ lat: 34.05, lon: -118.24, heightMeters: 0, locationMode: 'city' }, new Date('2026-10-30T12:00:00Z'))
      .find((item) => item.star.id === 'polaris')!;
    expect(polaris.altitudeDeg).toBeCloseTo(34.05, 0);
    expect(Math.min(polaris.azimuthDeg, 360 - polaris.azimuthDeg)).toBeLessThan(2);
    expect(starOverhead(polaris.star, new Date()).lat).toBeGreaterThan(89);
  });
  test('light-travel years only for well-measured nearby stars', () => {
    const vega = STARS.find((star) => star.id === 'vega')!;
    expect(lightLeftYear(vega, new Date('2026-10-30T00:00:00Z'))).toBe(2001);
    expect(lightLeftYear(STARS.find((star) => star.id === 'betelgeuse')!, new Date())).toBeNull();
  });
});
