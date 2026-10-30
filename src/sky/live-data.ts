import { adoptSnapshot, currentSnapshot } from './satellites';

/**
 * Keeps an open page current. Every 30 minutes it asks this same website (never CelesTrak) for the
 * satellite snapshot that the scheduled refresh publishes, and swaps it in if it is newer and passes checks.
 * Nothing about the viewer is sent; it is a plain request for a public file on the same site.
 */
const PATH = './data/gp-catalog.json';
const EVERY_MS = 30 * 60 * 1000;

export async function checkForNewerSatellites(): Promise<boolean> {
  if (typeof fetch !== 'function') return false;
  try {
    const response = await fetch(PATH, { cache: 'no-cache', credentials: 'omit' });
    if (!response.ok) return false;
    return adoptSnapshot(await response.json());
  } catch {
    return false;
  }
}

export function keepSatellitesFresh(onUpdate: () => void): () => void {
  let stopped = false;
  const run = async () => {
    if (stopped || (typeof document !== 'undefined' && document.hidden)) return;
    if (await checkForNewerSatellites()) onUpdate();
  };
  const timer = setInterval(run, EVERY_MS);
  const onVisible = () => { if (!document.hidden) void run(); };
  document.addEventListener('visibilitychange', onVisible);
  void run();
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Hours since the satellite data in use was fetched from CelesTrak. */
export function satelliteDataAgeHours(at: Date = new Date()): number {
  return Math.max(0, (at.getTime() - Date.parse(currentSnapshot().fetchedAtUtc)) / 3_600_000);
}
