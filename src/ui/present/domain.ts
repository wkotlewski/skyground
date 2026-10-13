import type { Area, Entity, World } from './types';

export function canUseSubpoint(entity: Entity | null): boolean {
  return entity?.kind === 'satellite' && entity.groundPoint != null;
}

export function inArea(entity: Entity, area: Area | null, world: World): boolean {
  if (!area) return true;
  const x = world === 'earth' ? entity.location?.lon : entity.sky?.azimuthDeg;
  const y = world === 'earth' ? entity.location?.lat : entity.sky?.altitudeDeg;
  if (x == null || y == null) return false;
  const insideX = area.west <= area.east ? x >= area.west && x <= area.east : x >= area.west || x <= area.east;
  return insideX && y >= area.south && y <= area.north;
}

export function visibleItems(items: Entity[], filter: string, area: Area | null, world: World, query: string): Entity[] {
  const needle = query.trim().toLowerCase();
  return items.filter((entity) => {
    if (filter !== 'all' && entity.kind !== filter) return false;
    if (needle && !`${entity.name} ${entity.kind} ${entity.subtitle} ${entity.description}`.toLowerCase().includes(needle)) return false;
    return inArea(entity, area, world);
  });
}

export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
