// Target contracts for the real implementation. Concept demo uses smaller JS records.
export type GradeBand = 'K-2' | '3-5' | '6-8' | '9-12';
export type Interest = 'museums' | 'colleges' | 'history' | 'space' | 'nature';
export type Coordinates = { lat: number; lon: number }; // WGS84 degrees
export type Source = { organization: string; url: string; fetchedAtUtc: string; reviewedAtUtc?: string; rightsStatus: 'approved' | 'pending' | 'restricted'; license?: string; licenseUrl?: string };
export type Observer = Coordinates & { heightMeters: number; locationMode: 'city' | 'device' | 'classroom' };
export type LookAngles = { azimuthDeg: number; elevationDeg: number; calculatedAtUtc: string; aboveHorizon: boolean; visibility: 'not-assessed' | 'potentially-visible' };
export type EarthSatellite = { kind: 'satellite'; id: string; noradId: number; name: string; epochUtc: string; snapshotFetchedAtUtc: string; subpoint: Coordinates; altitudeKm: number; look: LookAngles; freshness: 'fresh' | 'stale'; source: Source };
export type CelestialBody = { kind: 'planet' | 'moon' | 'sun'; id: string; name: string; look: LookAngles; source: Source }; // no satellite subpoint
export type SkyObject = EarthSatellite | CelestialBody;
export type Place = Coordinates & { id: string; name: string; interests: Interest[]; source: Source; locationUncertaintyMeters?: number; officialUrl?: string; approvedGrades: GradeBand[] };
export type HistoricalEvent = { id: string; title: string; eventStart: string; eventEnd?: string; datePrecision: 'day' | 'year' | 'range'; placeId?: string; location?: Coordinates; locationBasis: 'documented' | 'approximate' | 'commemorative' | 'disputed'; evidence: Source[]; approvedGrades: GradeBand[] };
export type Connection = { id: string; fromSkyId: string; toPlaceId: string; relation: 'near-observer' | 'near-subpoint' | 'curated-topic'; explanation: string; distanceKm?: number; evidence: Source[]; approvedGrades: GradeBand[] };
export type Media = { id: string; placeId?: string; skyId?: string; kind: 'image' | 'video-link'; assetUrl: string; originalPageUrl: string; creator: string; creditLine: string; licenseUrl?: string; source: Source; approvedGrades: GradeBand[] };
export type News = { id: string; title: string; url: string; publisher: string; publishedAtUtc: string; reviewedAtUtc: string; placeIds: string[]; skyIds: string[]; approvedGrades: GradeBand[]; source: Source };
export interface AstronomyProvider { calculate(observer: Observer, atUtc: Date): Promise<CelestialBody[]>; }
export interface SatelliteProvider { calculate(observer: Observer, atUtc: Date): Promise<EarthSatellite[]>; }
export interface PlaceProvider { search(anchor: Coordinates, radiusKm: number, interest: Interest, grade: GradeBand): Promise<Place[]>; }
// Runtime schema validation must be added. TypeScript alone does not validate incoming JSON.
