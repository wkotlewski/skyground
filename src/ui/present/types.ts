export type World = 'sky' | 'earth';
export type Kind = 'satellite' | 'planet' | 'sun' | 'moon' | 'location' | 'museum' | 'college' | 'historic' | 'space';
export type Relation = 'nearby' | 'subpoint' | 'topic';
export type ContentTab = 'media' | 'history' | 'news' | 'activity';
export type StartMode = 'search' | 'browse' | 'area';

export interface Point {
  lat: number;
  lon: number;
}

export interface Area {
  west: number;
  east: number;
  south: number;
  north: number;
}

export interface EntitySource {
  name: string;
  url: string;
  license: string;
  retrievedAt: string;
}

export interface Entity {
  id: string;
  world: World;
  kind: Kind;
  name: string;
  subtitle: string;
  description: string;
  source: EntitySource;
  location?: Point;
  sky?: { azimuthDeg: number; altitudeDeg: number };
  groundPoint?: Point;
  facts: string[];
}

export interface Match {
  entity: Entity;
  explanation: string;
  relation: Relation;
}
