import type { GradeBand, Interest, Observer } from '../contracts';
import type { City } from '../content/cities';
import { cityObserver } from '../content/cities';
import type { CuratedPlace } from '../content/places';
import { findPlaces, groundAnchor } from '../geo';
import { calculateCelestialBodies } from '../sky/astronomy';
import { NEAR_OVERHEAD_ELEVATION_DEG } from '../sky/horizon';
import { calculateSatellites, elementAgeMs, reviewedSnapshot, type SatelliteOutcome } from '../sky/satellites';
import { formatSelectedTime } from '../sky/time';

export type ConnectionMode = 'near-me' | 'under-satellite' | 'related-interest';
export type InterestFilter = Interest | 'all';

export interface SkyRow {
  id: string;
  name: string;
  kind: 'satellite' | 'planet' | 'moon' | 'sun';
  azimuthDeg: number | null;
  elevationDeg: number | null;
  aboveHorizon: boolean | null;
  nearOverhead: boolean;
  horizonLabel: string;
  status: 'available' | 'unavailable';
  freshness?: 'fresh' | 'stale';
  detail: string[];
  unavailableReason?: string;
}

export interface PlaceRow {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  categories: string;
  prompt: string;
  url: string;
  locationNote: string;
}

export interface AppModel {
  timeHeading: 'Selected time';
  timeUtc: string;
  timeLocal: string;
  effectiveMode: ConnectionMode;
  satelliteAnchorAllowed: boolean;
  connection: string;
  anchorLabel: string;
  warnings: string[];
  skyRows: SkyRow[];
  places: PlaceRow[];
  selectedId: string;
  selectedName: string;
  selectedDetail: string[];
  interest: InterestFilter;
  radiusKm: number;
  observer: { lat: number; lon: number };
  anchor: { lat: number; lon: number };
  anchorKind: 'city' | 'place' | 'subpoint';
  mission: string;
  snapshotFetchedAtUtc: string;
  coverageNote: string;
}

const MISSIONS: Record<GradeBand, string> = {
  'K-2': 'Find a place on Earth and a direction in the sky. Tell someone what you notice.',
  '3-5': 'Compare two places. What is near your city, and what is only a topic you chose to explore?',
  '6-8': 'Explain the difference between a satellite above your horizon and the ground point beneath that satellite.',
  '9-12': 'Design an investigation: what evidence would show a real scientific connection between a spacecraft and a place?',
};

export interface ModelInput {
  city: City;
  atUtc: Date;
  mode: ConnectionMode;
  radiusKm: number;
  interest: InterestFilter;
  grade: GradeBand;
  search: string;
  placeQuery?: string;
  observer?: Observer;
  observerName?: string;
  minElevationDeg: number;
  selectedId: string;
  places: CuratedPlace[];
}

function horizonLabel(elevation: number): string {
  if (elevation > 0) return 'Above the horizon';
  if (elevation === 0) return 'On the horizon';
  return 'Below the horizon';
}

function skyMatches(row: SkyRow, search: string, minElevationDeg: number): boolean {
  if (search && !row.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
  if (row.elevationDeg == null) return minElevationDeg <= -90;
  return row.elevationDeg >= minElevationDeg;
}

function satelliteDetail(outcome: Extract<SatelliteOutcome, { status: 'available' }>, atUtc: Date): string[] {
  const { satellite } = outcome;
  const epochDelta = atUtc.getTime() - Date.parse(satellite.epochUtc);
  const hours = Math.abs(epochDelta) / 3_600_000;
  const relation = epochDelta >= 0 ? 'before the selected time' : 'after the selected time';
  const lines = [
    `NORAD catalog ${satellite.noradId}`,
    `International designator ${outcome.internationalDesignator}`,
    `Element epoch ${satellite.epochUtc} (${hours.toFixed(1)} hours ${relation})`,
    `Snapshot fetched ${satellite.snapshotFetchedAtUtc}`,
    `Calculated at ${satellite.look.calculatedAtUtc}`,
    `Altitude ${satellite.altitudeKm.toFixed(1)} km`,
    `Azimuth ${satellite.look.azimuthDeg.toFixed(1)}° from north toward east`,
    `Elevation ${satellite.look.elevationDeg.toFixed(1)}°`,
    horizonLabel(satellite.look.elevationDeg),
    satellite.freshness === 'stale' ? 'Orbital elements are stale (24 to 72 hours from the selected time).' : 'Orbital elements are inside the 24-hour fresh window.',
    `Ground point ${satellite.subpoint.lat.toFixed(2)}°, ${satellite.subpoint.lon.toFixed(2)}°. This is the point beneath the satellite, not a camera footprint.`,
    'Whether you can see it was not assessed. Daylight, weather, and buildings matter.',
  ];
  if (outcome.sharesElementsWith.length) {
    lines.push(`This snapshot uses the same elements as ${outcome.sharesElementsWith.join(', ')}. Markers can overlap. That is the provider record, often used for a vehicle docked with a station.`);
  }
  return lines;
}

function bodyDetail(name: string, kind: string, azimuth: number, elevation: number, calculatedAtUtc: string): string[] {
  return [
    kind === 'planet' || kind === 'moon' ? 'Planets and the Moon do not use an artificial-satellite ground point.' : 'The Sun is calculated as a sky direction, not an orbiting satellite.',
    `Azimuth ${azimuth.toFixed(1)}° from north toward east`,
    `Elevation ${elevation.toFixed(1)}°`,
    horizonLabel(elevation),
    elevation >= NEAR_OVERHEAD_ELEVATION_DEG ? 'Near overhead (elevation at least 80°).' : 'Not near overhead. Near overhead means elevation of at least 80°.',
    `Calculated at ${calculatedAtUtc}`,
    `Local calculation with Astronomy Engine. Nothing was downloaded for this direction.`,
    'Physical facts such as size and distance are not in this card.',
    'Whether you can see it was not assessed.',
  ];
}

export function buildModel(input: ModelInput): AppModel {
  const time = formatSelectedTime(input.atUtc);
  const observer = input.observer ?? cityObserver(input.city);
  const observerName = input.observerName ?? input.city.name;
  const bodies = calculateCelestialBodies(observer, input.atUtc);
  const satellites = calculateSatellites(observer, input.atUtc);
  const warnings: string[] = [];
  const rows: SkyRow[] = [
    ...bodies.map((body) => ({
      id: body.id,
      name: body.name,
      kind: body.kind,
      azimuthDeg: body.look.azimuthDeg,
      elevationDeg: body.look.elevationDeg,
      aboveHorizon: body.look.aboveHorizon,
      nearOverhead: body.look.elevationDeg >= NEAR_OVERHEAD_ELEVATION_DEG,
      horizonLabel: horizonLabel(body.look.elevationDeg),
      status: 'available' as const,
      detail: bodyDetail(body.name, body.kind, body.look.azimuthDeg, body.look.elevationDeg, body.look.calculatedAtUtc),
    })),
    ...satellites.map((outcome): SkyRow => {
      if (outcome.status === 'unavailable') {
        return {
          id: outcome.id,
          name: outcome.name,
          kind: 'satellite',
          azimuthDeg: null,
          elevationDeg: null,
          aboveHorizon: null,
          nearOverhead: false,
          horizonLabel: 'Position not shown',
          status: 'unavailable',
          unavailableReason: outcome.reason,
          detail: [outcome.reason, outcome.epochUtc ? `Element epoch ${outcome.epochUtc}` : 'Element epoch unavailable', `Snapshot fetched ${outcome.snapshotFetchedAtUtc}`],
        };
      }
      const { satellite } = outcome;
      return {
        id: satellite.id,
        name: satellite.name,
        kind: 'satellite',
        azimuthDeg: satellite.look.azimuthDeg,
        elevationDeg: satellite.look.elevationDeg,
        aboveHorizon: satellite.look.aboveHorizon,
        nearOverhead: satellite.look.elevationDeg >= NEAR_OVERHEAD_ELEVATION_DEG,
        horizonLabel: horizonLabel(satellite.look.elevationDeg),
        status: 'available',
        freshness: satellite.freshness,
        detail: satelliteDetail(outcome, input.atUtc),
      };
    }),
  ];
  const skyRows = rows.filter((row) => skyMatches(row, input.search, input.minElevationDeg));
  const selected = rows.find((row) => row.id === input.selectedId) ?? rows[0];
  const selectedOutcome = satellites.find((outcome) => outcome.status === 'available' && outcome.satellite.id === selected?.id);
  const selectedSatellite = selectedOutcome && selectedOutcome.status === 'available' ? selectedOutcome.satellite : null;
  const anchorAllowed = selected?.kind === 'satellite' && selected.status === 'available' && selectedSatellite != null;
  let effectiveMode = input.mode;
  if (input.mode === 'under-satellite' && !anchorAllowed) {
    effectiveMode = 'near-me';
    warnings.push(selected?.kind === 'satellite'
      ? 'That satellite has no position for the selected time, so places stay near the city.'
      : 'Planets, the Sun, and the Moon do not have an artificial-satellite ground point. Places stay near the city.');
  }
  let anchor: { lat: number; lon: number } = observer;
  try {
    anchor = groundAnchor(effectiveMode, observer, selectedSatellite);
  } catch {
    effectiveMode = 'near-me';
    anchor = observer;
    warnings.push('The ground point could not be used. Places stay near the city.');
  }
  let placeRows: PlaceRow[] = [];
  try {
    const placeRadius = effectiveMode === 'related-interest' ? 20_000 : input.radiusKm;
    const placeQuery = (input.placeQuery ?? '').trim().toLowerCase();
    placeRows = findPlaces(input.places, anchor, input.interest, placeRadius)
      .filter((place) => !placeQuery || place.name.toLowerCase().includes(placeQuery))
      .map((place) => ({
        id: place.id,
        name: place.name,
        lat: place.lat,
        lon: place.lon,
        distanceKm: place.distanceKm,
        categories: place.categories.join(' / '),
        prompt: place.prompt,
        url: place.url,
        locationNote: place.locationNote,
      }));
  } catch {
    warnings.push('The search radius is not valid.');
  }
  const stale = satellites.some((outcome) => outcome.status === 'available' && outcome.satellite.freshness === 'stale');
  if (stale) warnings.push('Some orbital elements are stale. Ages are shown on each satellite.');
  const connection = effectiveMode === 'under-satellite'
    ? 'These curated places are near the satellite’s ground point. That does not mean the satellite is imaging them or that it is above the horizon.'
    : effectiveMode === 'related-interest'
      ? 'These curated places share the interest you chose. A shared topic is not a geographic link, and it is not evidence the sky object observed or affected the place.'
      : 'These curated places are near the chosen observer. No reviewed scientific link to the selected sky object is included.';
  const anchorLabel = effectiveMode === 'under-satellite' ? 'Search center: satellite ground point' : `Search center: ${observerName}`;
  if (!skyRows.length) {
    warnings.push(input.search.trim() ? 'No sky objects match that search.' : 'No sky objects are inside this sky area.');
  }
  if (!placeRows.length) warnings.push('No curated places match. Try a wider radius, another interest, the other city, or a different ground point.');
  return {
    timeHeading: time.heading,
    timeUtc: time.utc,
    timeLocal: time.local,
    effectiveMode,
    satelliteAnchorAllowed: anchorAllowed,
    connection,
    anchorLabel,
    warnings,
    skyRows,
    places: placeRows,
    selectedId: selected?.id ?? '',
    selectedName: selected?.name ?? 'Nothing selected',
    selectedDetail: selected?.detail ?? ['Choose an object from the list.'],
    interest: input.interest,
    radiusKm: input.radiusKm,
    observer: { lat: observer.lat, lon: observer.lon },
    anchor: { lat: anchor.lat, lon: anchor.lon },
    anchorKind: effectiveMode === 'under-satellite' ? 'subpoint' : observer.locationMode === 'place' ? 'place' : 'city',
    mission: MISSIONS[input.grade],
    snapshotFetchedAtUtc: reviewedSnapshot.fetchedAtUtc,
    coverageNote: 'Places are a small curated set for the Los Angeles area and Washington, DC. Other regions are not in this pack.',
  };
}

export function describeEpochAge(epochUtc: string, atUtc: Date): string {
  const age = elementAgeMs(epochUtc, atUtc);
  return `${(age / 3_600_000).toFixed(1)} hours from the element epoch`;
}
