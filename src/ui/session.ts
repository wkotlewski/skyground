import type { GradeBand, Interest, Observer } from '../contracts';
import { cities, cityObserver, type CityId } from '../content/cities';
import { places, type CuratedPlace } from '../content/places';
import { planetFact, planetFactTimestamps } from '../content/planet-facts';
import { providerEnabled, providers } from '../content/providers';
import { earthRegionById, earthRegions, inEarthRegion, inSkyRegion, skyRegionById, skyRegions } from '../content/regions';
import { distanceKm } from '../geo';
import { buildModel, type ConnectionMode, type InterestFilter, type PlaceRow, type SkyRow } from './model';
import { toDatetimeLocalValue } from '../sky/time';

export const SCREEN_IDS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12', 'S13', 'S14', 'S15', 'S16'] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

export type SkyKind = 'satellite' | 'planet' | 'moon' | 'sun';
export type ConnectionOrigin = 'satellite' | 'planet' | 'sky-area';
export type RecoveryId = 'empty' | 'stale' | 'webgl' | 'location' | 'offline' | 'below';
export type ContentTab = 'media' | 'history' | 'news';
export type SkyFilter = 'all' | 'satellites' | 'sky-bodies';

export interface NamedObserver extends Observer {
  name: string;
  placeId?: string;
}

export interface ExploreState {
  screen: ScreenId;
  history: ScreenId[];
  grade: GradeBand;
  cityId: CityId;
  observer: NamedObserver;
  selectedTime: Date;
  skyQuery: string;
  groundQuery: string;
  placeQuery: string;
  skyFilter: SkyFilter;
  interest: InterestFilter;
  radiusKm: number;
  relation: ConnectionMode;
  connectionOrigin: ConnectionOrigin;
  selectedSkyId: string;
  selectedPlaceId: string;
  skyRegionId: string;
  earthRegionId: string;
  placeScope: 'connection' | 'earth-region';
  contentTab: ContentTab;
  sourceReturn: ScreenId;
  recoveryId: RecoveryId;
  activityReady: boolean;
  sceneUnavailable: boolean;
}

export type Action =
  | { type: 'go'; screen: ScreenId }
  | { type: 'browse-interest'; interest: InterestFilter; screen: ScreenId }
  | { type: 'back' }
  | { type: 'grade'; grade: GradeBand }
  | { type: 'ground-query'; query: string }
  | { type: 'sky-query'; query: string }
  | { type: 'place-query'; query: string }
  | { type: 'choose-city'; id: CityId }
  | { type: 'choose-place'; id: string }
  | { type: 'select-sky'; id: string; kind: SkyKind }
  | { type: 'sky-filter'; filter: SkyFilter }
  | { type: 'interest'; interest: InterestFilter }
  | { type: 'relation'; relation: ConnectionMode }
  | { type: 'radius'; km: number }
  | { type: 'time'; value: string }
  | { type: 'device-clock'; now: Date }
  | { type: 'sky-region'; id: string }
  | { type: 'earth-region'; id: string }
  | { type: 'use-region-observer' }
  | { type: 'browse-region' }
  | { type: 'open-connection'; origin: ConnectionOrigin }
  | { type: 'apply-connection' }
  | { type: 'use-place-observer' }
  | { type: 'content-tab'; tab: ContentTab }
  | { type: 'recovery'; id: RecoveryId }
  | { type: 'complete-activity' }
  | { type: 'new-exploration' }
  | { type: 'scene-unavailable' }
  | { type: 'clear-sky-region' };

const GRADES: GradeBand[] = ['K-2', '3-5', '6-8', '9-12'];
const INTERESTS: InterestFilter[] = ['all', 'museums', 'colleges', 'history', 'space'];

export function initialState(selectedTime: Date): ExploreState {
  const city = cities.la;
  return {
    screen: 'S01',
    history: [],
    grade: '3-5',
    cityId: 'la',
    observer: { ...cityObserver(city), name: city.name },
    selectedTime,
    skyQuery: '',
    groundQuery: '',
    placeQuery: '',
    skyFilter: 'all',
    interest: 'all',
    radiusKm: 100,
    relation: 'near-me',
    connectionOrigin: 'satellite',
    selectedSkyId: '',
    selectedPlaceId: '',
    skyRegionId: '',
    earthRegionId: 'los-angeles',
    placeScope: 'connection',
    contentTab: 'media',
    sourceReturn: 'S01',
    recoveryId: 'empty',
    activityReady: false,
    sceneUnavailable: false,
  };
}

function go(state: ExploreState, screen: ScreenId): ExploreState {
  if (screen === state.screen) return state;
  return {
    ...state,
    screen,
    history: [...state.history, state.screen].slice(-40),
    sourceReturn: screen === 'S15' ? state.screen : state.sourceReturn,
    activityReady: screen === 'S14' ? false : state.activityReady,
  };
}

function cityObserverNamed(id: CityId): NamedObserver {
  const city = cities[id];
  return { ...cityObserver(city), name: city.name };
}

export function reduce(state: ExploreState, action: Action): ExploreState {
  switch (action.type) {
    case 'go': {
      const next = go(state, action.screen);
      if (action.screen === 'S07' && !state.skyRegionId) return { ...next, skyRegionId: 'above-horizon' };
      return next;
    }
    case 'browse-interest':
      return INTERESTS.includes(action.interest)
        ? go({ ...state, interest: action.interest, relation: 'near-me', placeScope: 'connection' }, action.screen)
        : state;
    case 'back': {
      const screen = state.history.at(-1) ?? 'S01';
      return { ...state, screen, history: state.history.slice(0, -1) };
    }
    case 'grade':
      return GRADES.includes(action.grade) ? { ...state, grade: action.grade } : state;
    case 'ground-query':
      return { ...state, groundQuery: action.query };
    case 'sky-query':
      return { ...state, skyQuery: action.query };
    case 'place-query':
      return { ...state, placeQuery: action.query };
    case 'choose-city':
      return go({
        ...state,
        cityId: action.id,
        observer: cityObserverNamed(action.id),
        relation: 'near-me',
        placeScope: 'connection',
        connectionOrigin: 'satellite',
      }, 'S09');
    case 'choose-place':
      return go({ ...state, selectedPlaceId: action.id }, 'S12');
    case 'select-sky':
      return go({ ...state, selectedSkyId: action.id }, action.kind === 'satellite' ? 'S05' : 'S06');
    case 'sky-filter':
      return { ...state, skyFilter: action.filter };
    case 'interest':
      return INTERESTS.includes(action.interest) ? { ...state, interest: action.interest } : state;
    case 'relation':
      return { ...state, relation: action.relation };
    case 'radius':
      return Number.isFinite(action.km) && action.km > 0 ? { ...state, radiusKm: action.km } : state;
    case 'time': {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(action.value)) return state;
      const selectedTime = new Date(action.value);
      return Number.isNaN(selectedTime.getTime()) ? state : { ...state, selectedTime };
    }
    case 'device-clock':
      return { ...state, selectedTime: action.now };
    case 'sky-region':
      return skyRegionById(action.id) ? { ...state, skyRegionId: action.id } : state;
    case 'earth-region':
      return earthRegionById(action.id) ? { ...state, earthRegionId: action.id } : state;
    case 'use-region-observer': {
      const region = earthRegionById(state.earthRegionId) ?? earthRegions[0];
      return go({
        ...state,
        cityId: region.cityId,
        observer: cityObserverNamed(region.cityId),
        relation: 'near-me',
      }, 'S03');
    }
    case 'browse-region':
      return go({ ...state, placeScope: 'earth-region' }, 'S10');
    case 'open-connection': {
      const relation: ConnectionMode = action.origin === 'planet' ? 'related-interest' : state.relation === 'under-satellite' && action.origin !== 'satellite' ? 'near-me' : state.relation;
      return go({ ...state, connectionOrigin: action.origin, relation }, 'S08');
    }
    case 'apply-connection':
      return go({ ...state, placeScope: 'connection' }, 'S09');
    case 'use-place-observer': {
      const place = places.find((item) => item.id === state.selectedPlaceId);
      if (!place) return state;
      return go({
        ...state,
        observer: {
          name: place.name,
          lat: place.lat,
          lon: place.lon,
          heightMeters: 0,
          locationMode: 'place',
          placeId: place.id,
        },
      }, 'S03');
    }
    case 'content-tab':
      return { ...state, contentTab: action.tab };
    case 'recovery':
      return { ...state, recoveryId: action.id };
    case 'complete-activity':
      return { ...state, activityReady: true };
    case 'new-exploration':
      return {
        ...initialState(state.selectedTime),
        grade: state.grade,
        cityId: state.cityId,
        observer: cityObserverNamed(state.cityId),
      };
    case 'scene-unavailable':
      return { ...state, sceneUnavailable: true };
    case 'clear-sky-region':
      return go({ ...state, skyRegionId: '' }, 'S03');
    default:
      return state;
  }
}

export interface Choice {
  id: string;
  label: string;
  detail: string;
  pressed: boolean;
  disabled: boolean;
  reason: string;
}

export interface GroundHit {
  id: string;
  name: string;
  detail: string;
  action: 'choose-city' | 'choose-place';
  cityId?: CityId;
}

export interface ExploreView {
  screen: ScreenId;
  eyebrow: string;
  title: string;
  lede: string;
  canBack: boolean;
  observerName: string;
  observerNote: string;
  timeHeading: 'Selected time';
  timeUtc: string;
  timeLocal: string;
  timeValue: string;
  grade: GradeBand;
  skyRows: SkyRow[];
  places: PlaceRow[];
  placeReasons: Record<string, string>;
  selectedSky: SkyRow | null;
  selectedPlace: CuratedPlace | null;
  connection: string;
  coverageNote: string;
  warnings: string[];
  choices: Choice[];
  radiusHidden: boolean;
  radiusKm: number;
  interest: InterestFilter;
  skyFilter: SkyFilter;
  skyQuery: string;
  groundQuery: string;
  placeQuery: string;
  skyRegionId: string;
  earthRegionId: string;
  regionObserverName: string;
  groundHits: GroundHit[];
  contentTab: ContentTab;
  activityReady: boolean;
  activitySteps: string[];
  sceneUnavailable: boolean;
  sourceLines: string[];
  returnLabel: string;
  sourceReturn: ScreenId;
  recoveryId: RecoveryId;
  factLines: string[];
  landEnabled: boolean;
  plannedProviders: string[];
  anchor: { lat: number; lon: number };
  anchorKind: 'city' | 'place' | 'subpoint';
  statusLabel: 'Calculated' | 'Stale' | 'Unavailable';
}

function skyVisible(row: SkyRow, filter: SkyFilter, regionId: string): boolean {
  if (filter === 'satellites' && row.kind !== 'satellite') return false;
  if (filter === 'sky-bodies' && row.kind === 'satellite') return false;
  if (!regionId || row.azimuthDeg == null || row.elevationDeg == null) return regionId === '' || row.azimuthDeg == null;
  const region = skyRegionById(regionId);
  if (!region) return true;
  return inSkyRegion(row.azimuthDeg, row.elevationDeg, region);
}

function placeReason(state: ExploreState, place: PlaceRow, anchorLabel: string): string {
  if (state.placeScope === 'earth-region') {
    const region = earthRegionById(state.earthRegionId);
    return `Inside ${region?.label ?? 'the selected area'}. A region is a geographic box, not a sky direction.`;
  }
  if (state.relation === 'related-interest') {
    return 'Matches the interest you chose. A shared topic is not a geographic or scientific link.';
  }
  if (state.relation === 'under-satellite') {
    return `${place.distanceKm.toFixed(0)} km from the satellite ground point. ${anchorLabel} That point is not a camera footprint.`;
  }
  return `${place.distanceKm.toFixed(0)} km from ${state.observer.name}. No reviewed scientific link is included.`;
}

const RECOVERY_COPY: Record<RecoveryId, { title: string; lede: string }> = {
  empty: {
    title: 'No matches in this area',
    lede: 'Try another interest, a wider radius, or a different region. Nothing here is filled in with a made-up place.',
  },
  stale: {
    title: 'Orbital elements are old',
    lede: 'From 24 to 72 hours away from the selected time, the position is still calculated and the age is shown. After 72 hours the position is hidden.',
  },
  webgl: {
    title: '3D view is unavailable',
    lede: 'The space list has the same calculated objects and the same selection.',
  },
  location: {
    title: 'Use a chosen city',
    lede: 'This page does not request phone location. Pick a city reference point instead.',
  },
  offline: {
    title: 'A provider is not connected',
    lede: 'Reviewed snapshots stay available. A missing feed is labeled unavailable. It is not replaced with a sample position.',
  },
  below: {
    title: 'Nothing above the horizon',
    lede: 'Below-horizon objects stay in the whole-sky list. You can also change the selected time.',
  },
};

const SCREEN_COPY: Record<ScreenId, { eyebrow: string; title: string; lede: string }> = {
  S01: { eyebrow: 'Choose your starting point', title: 'Every place. A new possibility.', lede: 'Start with a place on Earth, an object in space, or an area you choose.' },
  S02: { eyebrow: 'Ground starting point', title: 'Where do you want to begin?', lede: 'Search covers two city reference points and six curated places. It is not a global gazetteer.' },
  S03: { eyebrow: 'Space scene', title: 'Your window into space.', lede: 'Directions come from the selected observer and time. Marker size is not distance or brightness.' },
  S04: { eyebrow: 'Space objects', title: 'The same sky. A clearer list.', lede: 'The scene and this list use the same calculated objects, filters, and selection.' },
  S05: { eyebrow: 'Satellite', title: 'Satellite', lede: 'A ground point is the place beneath the satellite. It does not show where an instrument is looking.' },
  S06: { eyebrow: 'Sun, Moon, or planet', title: 'Sky object', lede: 'Planets, the Sun, and the Moon connect through a learning topic. They have no satellite ground point.' },
  S07: { eyebrow: 'Sky region', title: 'Choose an area. Discover together.', lede: 'A sky area is an azimuth and elevation range. It is not a box on the world map.' },
  S08: { eyebrow: 'Build the connection', title: 'How should these connect?', lede: 'Proximity is a geographic relationship. It does not prove imaging or a research relationship.' },
  S09: { eyebrow: 'Earth connections', title: 'Your world. More to discover.', lede: 'Land outlines are Natural Earth public-domain geometry. This is not a street map.' },
  S10: { eyebrow: 'Connected places', title: 'Places to follow your curiosity.', lede: 'The map and this list use the same places.' },
  S11: { eyebrow: 'Earth region', title: 'A whole area. A new perspective.', lede: 'Choose a representative city before any sky calculation. One city does not stand for the whole region by itself.' },
  S12: { eyebrow: 'Your Earth connection', title: 'Place', lede: 'Coordinates are approximate curated examples.' },
  S13: { eyebrow: 'Stories', title: 'Discover the story behind the place.', lede: 'Media, history, and news appear only after provenance, rights, and grade review.' },
  S14: { eyebrow: 'Guided learning', title: 'Notice. Compare. Explain.', lede: 'Discuss this in person. No answer is uploaded or saved.' },
  S15: { eyebrow: 'Evidence and data', title: 'Know where it comes from.', lede: 'Geometry and facts stay separate. Each line names its source.' },
  S16: { eyebrow: 'Recovery', title: 'Keep curiosity moving.', lede: 'A fallback never substitutes a fictional value for missing data.' },
};

export function project(state: ExploreState): ExploreView {
  const model = buildModel({
    city: cities[state.cityId],
    observer: state.observer,
    observerName: state.observer.name,
    atUtc: state.selectedTime,
    mode: state.relation,
    radiusKm: state.radiusKm,
    interest: state.interest,
    grade: state.grade,
    search: '',
    minElevationDeg: -90,
    selectedId: state.selectedSkyId || 'sun',
    places,
  });
  const query = state.skyQuery.trim().toLowerCase();
  const queried = model.skyRows.filter((row) => !query || row.name.toLowerCase().includes(query));
  const regionOn = state.screen === 'S03' || state.screen === 'S04' || state.screen === 'S07';
  const regionFiltered = queried.filter((row) => skyVisible(row, state.skyFilter, regionOn ? state.skyRegionId : ''));
  const detailRow = state.selectedSkyId
    ? model.skyRows.find((row) => row.id === state.selectedSkyId) ?? null
    : null;

  let placeRows = model.places;
  if (state.placeScope === 'earth-region') {
    const region = earthRegionById(state.earthRegionId) ?? earthRegions[0];
    placeRows = places
      .filter((place) => inEarthRegion(place.lat, place.lon, region))
      .filter((place) => state.interest === 'all' || (place.categories as readonly string[]).includes(state.interest))
      .filter((place) => !state.placeQuery.trim() || place.name.toLowerCase().includes(state.placeQuery.trim().toLowerCase()))
      .map((place) => ({
        id: place.id,
        name: place.name,
        lat: place.lat,
        lon: place.lon,
        distanceKm: distanceKm(state.observer, place),
        categories: place.categories.join(' / '),
        prompt: place.prompt,
        url: place.url,
        locationNote: place.locationNote,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
  } else if (state.placeQuery.trim()) {
    const query = state.placeQuery.trim().toLowerCase();
    placeRows = placeRows.filter((place) => place.name.toLowerCase().includes(query));
  }

  const satelliteReady = detailRow?.kind === 'satellite' && detailRow.status === 'available';
  const planetOrigin = state.connectionOrigin === 'planet';
  const areaOrigin = state.connectionOrigin === 'sky-area';
  const choices: Choice[] = [
    {
      id: 'near-me',
      label: 'Near my location',
      detail: 'Find places near the chosen observer.',
      pressed: state.relation === 'near-me',
      disabled: planetOrigin,
      reason: planetOrigin ? 'A planet uses a learning topic, not a search around the observer.' : '',
    },
    {
      id: 'under-satellite',
      label: 'Beneath this satellite',
      detail: 'Search near its calculated ground point.',
      pressed: state.relation === 'under-satellite',
      disabled: planetOrigin || areaOrigin || !satelliteReady,
      reason: planetOrigin
        ? 'Planets, the Sun, and the Moon do not have an artificial-satellite ground point.'
        : areaOrigin
          ? 'Choose one satellite with a calculated position before using its ground point.'
          : !satelliteReady
            ? 'That satellite has no position for the selected time.'
            : '',
    },
    {
      id: 'related-interest',
      label: 'Related learning topic',
      detail: 'Use the interest you choose. This is not a geographic link.',
      pressed: state.relation === 'related-interest',
      disabled: false,
      reason: '',
    },
  ];

  const groundQuery = state.groundQuery.trim().toLowerCase();
  const groundHits: GroundHit[] = [
    ...Object.values(cities).filter((city) => !groundQuery || city.name.toLowerCase().includes(groundQuery)).map((city) => ({
      id: city.id,
      name: city.name,
      detail: 'City reference point for sky calculations. Not a device location.',
      action: 'choose-city' as const,
      cityId: city.id,
    })),
    ...places.filter((place) => {
      const haystack = `${place.name} ${place.categories.join(' ')}`.toLowerCase();
      return !groundQuery || haystack.includes(groundQuery);
    }).map((place) => ({
      id: place.id,
      name: place.name,
      detail: place.categories.join(' / '),
      action: 'choose-place' as const,
    })),
  ];

  const selectedPlace = places.find((place) => place.id === state.selectedPlaceId) ?? null;
  const fact = detailRow ? planetFact(detailRow.id) : undefined;
  const factLines = fact
    ? fact.measurements.map((measurement) => `${measurement.label}: ${measurement.value} ${measurement.unit} (Wikidata ${measurement.property})`)
    : detailRow && detailRow.kind !== 'satellite'
      ? ['No reviewed size is in the Wikidata snapshot for this object.']
      : [];
  if (fact && fact.measurements.filter((measurement) => measurement.label === 'mean radius' && measurement.unit === 'kilometre').length > 1) {
    factLines.push('Wikidata lists more than one mean radius. All of them are shown.');
  }

  const copy = { ...SCREEN_COPY[state.screen] };
  if (state.screen === 'S05' && detailRow) copy.title = detailRow.name;
  if (state.screen === 'S06' && detailRow) copy.title = detailRow.name;
  if (state.screen === 'S12' && selectedPlace) copy.title = selectedPlace.name;
  if (state.screen === 'S16') {
    copy.title = RECOVERY_COPY[state.recoveryId].title;
    copy.lede = RECOVERY_COPY[state.recoveryId].lede;
  }

  const skyName = detailRow?.name ?? 'an object in space';
  const placeName = selectedPlace?.name ?? 'a place on Earth';
  const activitySteps = state.grade === 'K-2'
    ? [`Point to ${skyName} and ${placeName}.`, 'Describe one thing you notice about each.', 'Tell a grown-up what you want to learn.']
    : state.grade === '6-8'
      ? ['Compare the observer with a satellite ground point when the object is a satellite.', 'Explain why a satellite can be in the sky above a different place on Earth.', 'Use a source to separate a learning connection from an imaging claim.']
      : state.grade === '9-12'
        ? ['Inspect the pair and the calculation timestamps.', 'Decide what the numbers do and do not show.', 'Separate a geometric relationship from a claim that has evidence.']
        : [`Choose ${skyName} and ${placeName}.`, 'What can each help you learn?', 'Tell someone how they connect, and name the source you used.'];

  const region = earthRegionById(state.earthRegionId) ?? earthRegions[0];
  const sourceLines = [
    `Observer: ${state.observer.name} (${state.observer.lat.toFixed(4)}°, ${state.observer.lon.toFixed(4)}°, ${state.observer.heightMeters} m, ${state.observer.locationMode}).`,
    state.observer.locationMode === 'place' ? 'This place height was not surveyed. The calculation uses 0 m.' : 'City heights are reference values for the calculation, not a student location.',
    `Selected time ${model.timeUtc}.`,
    providerEnabled('planet-calculation') ? 'Sun, Moon, and planet directions: Astronomy Engine, local calculation.' : 'Planet calculation is not connected.',
    providerEnabled('satellite-calculation') && providerEnabled('orbital-elements')
      ? `Satellite positions: satellite.js using the reviewed CelesTrak snapshot fetched ${model.snapshotFetchedAtUtc}. The page does not request CelesTrak.`
      : 'Satellite positions are not connected.',
    fact ? `Size facts: Wikidata ${fact.wikidataId}, fetched ${planetFactTimestamps.fetchedAtUtc}, ${planetFactTimestamps.license}. ${fact.sourceUrl}` : 'No Wikidata size is attached to the current object.',
    providerEnabled('world-basemap') ? 'World land: Natural Earth 1:110m, public domain, bundled with this page.' : 'World basemap is not connected.',
    providerEnabled('earth-renderer') ? 'Earth globe: CesiumJS.' : 'CesiumJS is not enabled. There is no configured imagery layer.',
    providerEnabled('places') ? 'Places: OpenStreetMap.' : 'OpenStreetMap is not connected. Places are a curated pack with official HTTPS links.',
    providerEnabled('media') ? 'Media is connected.' : 'Media, history, and news are not connected. Unreviewed stories stay hidden.',
    ...providers.filter((provider) => !provider.enabled).map((provider) => `Planned, not connected: ${provider.name}.`),
  ];

  const placeReasons: Record<string, string> = {};
  for (const place of placeRows) placeReasons[place.id] = placeReason(state, place, model.anchorLabel);
  if (selectedPlace && !placeReasons[selectedPlace.id]) {
    placeReasons[selectedPlace.id] = 'Chosen from search. It may be outside the current radius or interest.';
  }

  const warnings = [...model.warnings];
  if ((state.screen === 'S03' || state.screen === 'S04' || state.screen === 'S07') && regionFiltered.length === 0) {
    warnings.push(state.skyQuery.trim() ? 'No sky objects match that search.' : 'No calculated objects are inside this sky area.');
  }

  return {
    screen: state.screen,
    eyebrow: copy.eyebrow,
    title: copy.title,
    lede: copy.lede,
    canBack: state.history.length > 0,
    observerName: state.observer.name,
    observerNote: state.observer.locationMode === 'place' ? 'Approximate place coordinate. Height uses 0 m.' : 'City reference point. Phone location is not used.',
    timeHeading: 'Selected time',
    timeUtc: model.timeUtc,
    timeLocal: model.timeLocal,
    timeValue: toDatetimeLocalValue(state.selectedTime),
    grade: state.grade,
    skyRows: state.screen === 'S07' ? model.skyRows.filter((row) => skyVisible(row, 'all', state.skyRegionId)) : regionFiltered,
    places: placeRows,
    placeReasons,
    selectedSky: detailRow,
    selectedPlace,
    connection: model.connection,
    coverageNote: model.coverageNote,
    warnings,
    choices,
    radiusHidden: state.relation === 'related-interest' || planetOrigin,
    radiusKm: state.radiusKm,
    interest: state.interest,
    skyFilter: state.skyFilter,
    skyQuery: state.skyQuery,
    groundQuery: state.groundQuery,
    placeQuery: state.placeQuery,
    skyRegionId: state.skyRegionId,
    earthRegionId: state.earthRegionId,
    regionObserverName: cities[region.cityId].name,
    groundHits,
    contentTab: state.contentTab,
    activityReady: state.activityReady,
    activitySteps,
    sceneUnavailable: state.sceneUnavailable,
    sourceLines: detailRow ? [...detailRow.detail, ...sourceLines] : sourceLines,
    returnLabel: `Return to ${SCREEN_COPY[state.sourceReturn].title}`,
    sourceReturn: state.sourceReturn,
    recoveryId: state.recoveryId,
    factLines,
    landEnabled: providerEnabled('world-basemap'),
    plannedProviders: providers.filter((provider) => !provider.enabled).map((provider) => provider.name),
    anchor: model.anchor,
    anchorKind: model.anchorKind,
    statusLabel: detailRow?.status === 'unavailable' ? 'Unavailable' : detailRow?.freshness === 'stale' ? 'Stale' : 'Calculated',
  };
}

export function screenFromHash(hash: string): ScreenId | null {
  const id = hash.replace('#', '');
  return SCREEN_IDS.includes(id as ScreenId) ? id as ScreenId : null;
}
