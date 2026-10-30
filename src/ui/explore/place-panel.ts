import type { Coordinates } from '../../contracts';
import type { BelowAnswer, BelowLookup } from '../../content/below';
import { yearLabel, type PlacePack, type PlaceProfile } from '../../content/place-profiles';
import { SPACE_HISTORY, type SpaceHistoryEvent } from '../../content/space-history';
import { distanceKm } from '../../geo';
import { directionWords } from '../../sensors/orientation';
import { regionCard } from './detail';
import { button, fmt, h, latLonText, safeHttps } from './dom';
import { ORBIT_COLORS } from './palette';
import type { SkySnapshot } from './sky-model';

export interface PlaceContext {
  below: BelowLookup | null;
  places: PlacePack | null;
  skyFrom: (point: Coordinates) => SkySnapshot;
  onSelect: (id: string) => void;
  onShowOnMap: (point: Coordinates) => void;
  onClose: () => void;
  back?: { label: string; go: () => void };
}

/** Everything about one spot on Earth: what it is, who lives there, what is overhead now, and its timeline. */
export function placePanel(point: Coordinates, ctx: PlaceContext): HTMLElement {
  const answer = ctx.below?.at(point) ?? null;
  const root = h('div', { class: 'detail-body place' });
  root.append(h('header', { class: 'detail-head' },
    h('div', {},
      h('p', { class: 'eyebrow' }, answer ? answer.kindLabel : 'A place on Earth'),
      h('h2', { id: 'detail-title', tabindex: '-1' }, answer?.name ?? latLonText(point)),
      h('p', { class: 'hint' }, latLonText(point)),
    ),
    button('Close', { class: 'icon-button', 'aria-label': 'Close details' }, ctx.onClose),
  ));
  if (ctx.back) root.append(button(`← Back to ${ctx.back.label}`, { class: 'chip small back' }, ctx.back.go));
  if (!answer) {
    root.append(h('p', { class: 'hint' }, 'Loading what is here…'));
    return root;
  }
  root.append(regionCard(answer, 'About this place'));
  const record = answer.regionId ? ctx.places?.places[answer.regionId] : undefined;
  if (record?.profile && ctx.places) root.append(profileSection(record.profile, ctx.places));
  root.append(overheadSection(point, ctx));
  root.append(timelineSection(point, answer, ctx));
  root.append(button('Show on the map', { class: 'secondary' }, () => ctx.onShowOnMap(point)));
  return root;
}

function stat(label: string, value: string, year: number, hint?: string): HTMLElement {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value), h('small', {}, hint ? `${hint} · ${year}` : String(year)));
}

function profileSection(p: PlaceProfile, pack: PlacePack): HTMLElement {
  const groups: Array<[string, HTMLElement[]]> = [];
  const people: HTMLElement[] = [];
  if (p.population) people.push(stat('People', p.population.value >= 1e6 ? `${fmt(p.population.value / 1e6, 1)} million` : fmt(p.population.value), p.population.year));
  if (p.under15) people.push(stat('Children under 15', `${fmt(p.under15.value, 0)}%`, p.under15.year));
  if (p.urban) people.push(stat('Live in cities', `${fmt(p.urban.value, 0)}%`, p.urban.year));
  if (people.length) groups.push(['People', people]);
  const work: HTMLElement[] = [];
  if (p.gdpPerPerson) work.push(stat('Income per person', `$${fmt(p.gdpPerPerson.value, 0)}`, p.gdpPerPerson.year, 'GDP per person, US$'));
  if (p.unemployment) work.push(stat('Looking for work', `${fmt(p.unemployment.value, 1)}%`, p.unemployment.year, 'unemployment'));
  if (p.poverty) work.push(stat('Live on under $2.15 a day', `${fmt(p.poverty.value, 1)}%`, p.poverty.year));
  if (p.electricity) work.push(stat('Have electricity', `${fmt(p.electricity.value, 0)}%`, p.electricity.year));
  if (p.internet) work.push(stat('Use the internet', `${fmt(p.internet.value, 0)}%`, p.internet.year));
  if (work.length) groups.push(['Work and money', work]);
  const school: HTMLElement[] = [];
  if (p.primaryCompletion) school.push(stat('Finish primary school', `${fmt(Math.min(100, p.primaryCompletion.value), 0)}%`, p.primaryCompletion.year));
  if (p.literacy) school.push(stat('Adults who can read', `${fmt(p.literacy.value, 0)}%`, p.literacy.year));
  if (p.tertiary) school.push(stat('Go on to college', `${fmt(p.tertiary.value, 0)}%`, p.tertiary.year, 'enrolment rate'));
  if (school.length) groups.push(['Education', school]);
  const health: HTMLElement[] = [];
  if (p.lifeExpectancy) health.push(stat('Life expectancy', `${fmt(p.lifeExpectancy.value, 1)} years`, p.lifeExpectancy.year));
  if (p.childMortality) health.push(stat('Children who die before 5', `${fmt(p.childMortality.value / 10, 1)}%`, p.childMortality.year));
  if (health.length) groups.push(['Health', health]);
  const source = pack.sources.profile;
  return h('section', { class: 'detail-section profile' },
    h('h3', {}, 'People and life here'),
    ...groups.flatMap(([title, items]) => [h('h4', {}, title), h('dl', { class: 'stats' }, ...items)]),
    h('p', { class: 'credit' }, 'Country-wide figures from the ', safeHttps(source.url) ? h('a', { href: source.url, rel: 'noreferrer', target: '_blank' }, source.name) : source.name, ` (${source.license}). Each shows the latest year reported. Averages hide big differences between places and people.`),
  );
}

function overheadSection(point: Coordinates, ctx: PlaceContext): HTMLElement {
  const sky = ctx.skyFrom(point);
  const sun = sky.things.find((thing) => thing.kind === 'sun');
  const moon = sky.things.find((thing) => thing.kind === 'moon');
  const up = sky.things.filter((thing) => thing.satellite && thing.altitudeDeg > 10).sort((a, b) => b.altitudeDeg - a.altitudeDeg);
  const planets = sky.things.filter((thing) => thing.kind === 'planet' && thing.altitudeDeg > 0);
  const local = sky.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const lines: Node[] = [];
  if (sun) lines.push(h('p', { class: 'lead' }, sun.altitudeDeg > 0 ? `It is daytime here. The Sun is ${directionWords(sun.azimuthDeg, sun.altitudeDeg)}.` : sun.altitudeDeg > -12 ? 'It is twilight here.' : 'It is night here.'));
  if (moon) lines.push(h('p', {}, moon.altitudeDeg > 0 ? `The Moon is ${directionWords(moon.azimuthDeg, moon.altitudeDeg)}.` : 'The Moon is below the horizon.'));
  if (planets.length) lines.push(h('p', {}, `Planets above the horizon: ${planets.map((thing) => thing.name).join(', ')}.`));
  lines.push(h('p', {}, up.length ? `${up.length} of SkyGround’s satellites are in the sky here, including:` : 'None of SkyGround’s satellites are well above the horizon here right now.'));
  if (up.length) {
    lines.push(h('div', { class: 'path-chips' }, ...up.slice(0, 6).map((thing) => {
      const chip = button(thing.name, { class: 'chip path land' }, () => ctx.onSelect(thing.id));
      chip.prepend(h('span', { class: 'aim-dot', style: `background:${ORBIT_COLORS[thing.satellite!.orbit.orbitClass]}` }));
      return chip;
    })));
  }
  lines.push(h('p', { class: 'hint' }, `Calculated for this spot at ${local} UTC.`));
  return h('section', { class: 'detail-section' }, h('h3', {}, 'Looking up from here right now'), ...lines);
}

interface Row { year: number; title: string; kind: string; link: string | null; sky?: SpaceHistoryEvent; note?: string }

function timelineSection(point: Coordinates, answer: BelowAnswer, ctx: PlaceContext): HTMLElement {
  const rows: Row[] = [];
  const record = answer.regionId ? ctx.places?.places[answer.regionId] : undefined;
  if (record?.founded != null) rows.push({ year: record.founded, title: `${answer.name} established as a modern state`, kind: 'Founding', link: null });
  for (const entry of record?.timeline ?? []) rows.push({ year: entry.year, title: entry.title, kind: entry.kind, link: entry.article });
  // Sky-and-ground moments inside this country or sea.
  const inside = SPACE_HISTORY.filter((event) => ctx.below && answer.regionId && ctx.below.at(event.location).regionId === answer.regionId);
  for (const event of inside) rows.push({ year: Number.parseInt(event.date, 10), title: event.title, kind: 'Sky + ground', link: event.source, sky: event });
  rows.sort((a, b) => a.year - b.year);

  const section = h('section', { class: 'detail-section timeline-section' }, h('h3', {}, 'Timeline'));
  if (rows.length) {
    section.append(h('ol', { class: 'timeline' }, ...rows.map((row) => {
      const link = row.link ? safeHttps(row.link) : null;
      return h('li', { class: row.sky ? 'sky' : '' },
        h('span', { class: 'when' }, yearLabel(row.year)),
        h('div', { class: 'what' },
          h('span', { class: 'kind' }, row.kind),
          link ? h('a', { href: link, rel: 'noreferrer', target: '_blank' }, row.title) : h('strong', {}, row.title),
          row.sky ? h('p', {}, row.sky.summary) : null,
        ),
      );
    })));
  } else {
    section.append(h('p', { class: 'hint' }, answer.kind === 'country' ? 'No widely documented dated events are bundled for this place yet.' : 'Open water has no country timeline.'));
  }
  // Always tie the place to the nearest moment where the sky and the ground met.
  const nearest = SPACE_HISTORY
    .filter((event) => !inside.includes(event))
    .map((event) => ({ event, km: distanceKm(point, event.location) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, inside.length ? 1 : 2);
  if (nearest.length) {
    section.append(h('h4', {}, inside.length ? 'Nearby, where sky and ground also met' : 'Nearest places where sky and ground met'));
    for (const { event, km } of nearest) {
      section.append(h('div', { class: 'event' },
        h('p', { class: 'eyebrow' }, `${event.dateLabel} · ${event.place} · ${fmt(km)} km away`),
        h('strong', {}, event.title),
        h('p', {}, event.summary),
        h('div', { class: 'event-actions' },
          button('Go there', { class: 'chip small' }, () => ctx.onShowOnMap(event.location)),
          safeHttps(event.source) ? h('a', { href: event.source, rel: 'noreferrer', target: '_blank' }, 'Source') : '',
        ),
      ));
    }
  }
  const source = ctx.places?.sources.timeline;
  section.append(h('p', { class: 'credit' }, `Events from ${source?.name ?? 'Wikidata'} (${source?.license ?? 'CC0'}) and SkyGround’s sourced sky-and-ground list. A timeline shows widely documented moments, not a complete history.`));
  return section;
}
