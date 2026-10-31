import type { Coordinates } from '../../contracts';
import { FAMILY_LABELS } from '../../content/satellite-guide';
import { shortExcerpt, type BelowAnswer, type BelowLookup } from '../../content/below';
import { distanceKm } from '../../geo';
import { ORBIT_LABELS, formatDuration } from '../../sky/orbits';
import { lightLeftYear } from '../../sky/stars';
import { currentSnapshot } from '../../sky/satellites';
import { directionWords } from '../../sensors/orientation';
import { imageFor } from '../../content/media';
import { VIDEOS, isVideoId } from '../../content/videos';
import { button, fmt, h, latLonText, safeHttps } from './dom';
import { drawnVisual, orbitDiagram } from './visuals';
import { starColour } from '../../sky/catalog';
import { NAME_MAX, checkStarName } from '../../content/name-filter';
import type { StarNames } from '../../content/star-names';
import { ORBIT_COLORS } from './palette';
import { MOON_SITES, SPACE_HISTORY, eventsRelatedTo, type SpaceHistoryEvent } from '../../content/space-history';
import { groundPointOf, upcomingPath, type SkySnapshot, type SkyThing } from './sky-model';

export interface DetailContext {
  sky: SkySnapshot;
  cityName: string;
  below: BelowLookup | null;
  onShowMap: (thing: SkyThing) => void;
  onShowOrbits: () => void;
  onTurnTo: (thing: SkyThing) => void;
  onClose: () => void;
  onShowPlace: (point: Coordinates) => void;
  sensorOn: boolean;
  starNames: StarNames | null;
}

const KIND_EYEBROW: Record<string, string> = { planet: 'Planet', sun: 'Our star', moon: 'Earth’s moon', star: 'Star', asteroid: 'Asteroid', 'dwarf-planet': 'Dwarf planet', 'deep-sky': 'Deep sky' };

export function renderDetail(thing: SkyThing, ctx: DetailContext): HTMLElement {
  const sat = thing.satellite;
  const eyebrow = sat ? (sat.guide ? FAMILY_LABELS[sat.guide.family] : 'Satellite') : KIND_EYEBROW[thing.kind] ?? 'Sky object';
  const head = h('header', { class: 'detail-head' },
    h('div', {},
      h('p', { class: 'eyebrow' }, eyebrow),
      h('h2', { id: 'detail-title', tabindex: '-1' }, thing.name),
    ),
    button('Close', { class: 'icon-button', 'aria-label': 'Close details' }, ctx.onClose),
  );
  const tags = h('div', { class: 'tags' });
  if (sat) {
    const cls = sat.orbit.orbitClass;
    tags.append(h('span', { class: 'orbit-tag', style: `--orbit:${ORBIT_COLORS[cls]}` }, `${cls} · ${ORBIT_LABELS[cls].name}`));
    if (sat.orbit.sunSynchronous) tags.append(h('span', { class: 'tag' }, 'Sun-synchronous'));
    if (sat.freshness === 'stale') tags.append(h('span', { class: 'tag warn' }, 'Older orbit data'));
  }
  tags.append(h('span', { class: thing.altitudeDeg > 0 ? 'tag up' : 'tag' }, thing.altitudeDeg > 0 ? 'Above your horizon' : 'Below your horizon'));

  const root = h('div', { class: 'detail-body' }, head, tags, mediaBlock(thing), skySection(thing, ctx));
  if (sat) root.append(satelliteSections(thing, ctx));
  else if (thing.star) {
    root.append(starSection(thing, ctx));
    if (thing.star.catalogKey) root.append(namesSection(thing, ctx));
  }
  else if (thing.small) root.append(smallSection(thing));
  else if (thing.deep) root.append(deepSection(thing, ctx));
  else root.append(bodySection(thing, ctx));
  const history = historySection(thing, ctx);
  root.append(belowSection(thing, ctx));
  if (history) root.append(history);
  root.append(notes(thing, ctx));
  return root;
}

/** Picture with its credit, then a video that loads only after a tap. */
function mediaBlock(thing: SkyThing): HTMLElement | null {
  const image = imageFor(thing.id);
  const video = VIDEOS[thing.id];
  const drawn = image ? null : drawnVisual(thing);
  if (!image && !video && !drawn) return null;
  const wrap = h('div', { class: 'media' });
  if (drawn) wrap.append(drawn);
  if (image) {
    const license = image.licenseUrl ? safeHttps(image.licenseUrl) : null;
    const file = safeHttps(image.filePage);
    wrap.append(h('figure', { class: 'media-figure' },
      h('img', { src: image.src, alt: image.alt || thing.name, width: String(image.width), height: String(image.height), loading: 'lazy', decoding: 'async' }),
      h('figcaption', {},
        `${image.artist} · `,
        license ? h('a', { href: license, rel: 'noreferrer', target: '_blank' }, image.license) : image.license,
        file ? ' · ' : '',
        file ? h('a', { href: file, rel: 'noreferrer', target: '_blank' }, 'Source') : '',
      ),
    ));
  }
  if (video && isVideoId(video.id)) {
    const watch = `https://www.youtube.com/watch?v=${video.id}`;
    const slot = h('div', { class: 'video-slot' });
    const play = button('', { class: 'video-play', 'aria-label': `Play video: ${video.title}` }, () => {
      const frame = h('iframe', {
        src: `https://www.youtube-nocookie.com/embed/${video.id}?rel=0&autoplay=1`,
        title: video.title,
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
        allowfullscreen: true,
        referrerpolicy: 'strict-origin-when-cross-origin',
        loading: 'lazy',
      });
      slot.replaceChildren(frame);
    });
    play.append(h('span', { class: 'play-icon', 'aria-hidden': 'true' }), h('span', { class: 'video-text' }, h('strong', {}, video.title), h('small', {}, `${video.channel} · YouTube · plays here when tapped`)));
    slot.append(play);
    wrap.append(slot, h('a', { class: 'video-link', href: watch, rel: 'noreferrer', target: '_blank' }, 'Watch on YouTube instead'));
  }
  return wrap;
}

function skySection(thing: SkyThing, ctx: DetailContext): HTMLElement {
  const where = directionWords(thing.azimuthDeg, thing.altitudeDeg);
  const above = thing.altitudeDeg > 0;
  const lines: Array<Node | string> = [
    h('p', { class: 'lead', 'data-live': 'where' }, `From ${ctx.cityName}, look ${where}.`),
    h('p', { class: 'hint', 'data-live': 'angles' }, angleText(thing)),
  ];
  if (!above) {
    lines.push(h('p', { class: 'hint' }, 'It is on the other side of Earth from you right now, so the planet itself blocks the view.'));
  } else if (thing.kind === 'satellite') {
    lines.push(h('p', { class: 'hint' }, 'Above the horizon does not mean you can see it: most satellites are only visible near dawn or dusk, when they are sunlit and your sky is dark.'));
  } else if (thing.kind === 'sun') {
    lines.push(h('p', { class: 'hint warn-text' }, 'Never look straight at the Sun, with or without a phone, telescope, or binoculars.'));
  }
  const turn = button(ctx.sensorOn ? 'Follow the arrow on screen' : 'Turn the view to it', { class: 'secondary' }, () => ctx.onTurnTo(thing));
  if (ctx.sensorOn) turn.disabled = true;
  return h('section', { class: 'detail-section' }, h('h3', {}, 'In your sky'), ...lines, turn);
}

function angleText(thing: SkyThing): string {
  return `${fmt(Math.abs(thing.altitudeDeg), 1)}° ${thing.altitudeDeg >= 0 ? 'above' : 'below'} the horizon · ${fmt(thing.azimuthDeg, 0)}° from north`;
}

function satelliteSections(thing: SkyThing, ctx: DetailContext): DocumentFragment {
  const sat = thing.satellite!;
  const guide = sat.guide;
  const fragment = document.createDocumentFragment();
  if (guide) {
    fragment.append(h('section', { class: 'detail-section' },
      h('h3', {}, 'What it does'),
      h('p', {}, guide.purpose),
      h('h4', {}, 'How it connects to the ground'),
      h('p', {}, guide.groundLink),
      h('p', { class: 'hint' }, `${guide.operator} · launched ${guide.launched}`),
    ));
  }
  const o = sat.orbit;
  const tilt = o.inclinationDeg <= 90 ? o.inclinationDeg : 180 - o.inclinationDeg;
  const reach = tilt < 1
    ? 'It stays over the equator.'
    : `Its path is tilted ${fmt(o.inclinationDeg, 1)}° from the equator, so it passes over places between about ${fmt(tilt, 0)}°N and ${fmt(tilt, 0)}°S.`;
  fragment.append(h('section', { class: 'detail-section' },
    h('h3', {}, 'Its orbit'),
    h('dl', { class: 'stats' },
      h('div', {}, h('dt', {}, 'Height now'), h('dd', { 'data-live': 'height' }, `${fmt(sat.altitudeKm)} km`)),
      h('div', {}, h('dt', {}, 'Speed now'), h('dd', { 'data-live': 'speed' }, `${fmt(sat.speedKmS, 2)} km/s`)),
      h('div', {}, h('dt', {}, 'One lap'), h('dd', {}, formatDuration(o.periodMin))),
      h('div', {}, h('dt', {}, 'Laps per day'), h('dd', {}, fmt(o.lapsPerDay, o.lapsPerDay < 3 ? 2 : 1))),
    ),
    h('p', { class: 'hint', 'data-live': 'speed-words' }, speedWords(sat.speedKmS)),
    imageFor(thing.id) ? orbitDiagram(thing) : null,
    o.orbitClass === 'HEO' ? h('p', {}, `Its distance swings from ${fmt(o.perigeeKm)} km to ${fmt(o.apogeeKm)} km above Earth on every lap.`) : null,
    h('p', {}, reach),
    guide ? h('p', {}, guide.whyThisOrbit) : null,
    button('Compare all orbits', { class: 'secondary' }, ctx.onShowOrbits),
  ));
  return fragment;
}

function speedWords(kmS: number): string {
  const kmh = kmS * 3600;
  const coast = 4500;
  const minutes = (coast / kmh) * 60;
  return `That is about ${fmt(kmh, 0)} km/h — fast enough to cross the United States (${fmt(coast)} km) in ${minutes < 60 ? `${fmt(minutes, 0)} minutes` : `${fmt(minutes / 60, 1)} hours`}.`;
}

function bodySection(thing: SkyThing, _ctx: DetailContext): HTMLElement {
  const body = thing.body!;
  const items: Array<Node | null> = [];
  if (body.distanceKm != null && body.lightMinutes != null) {
    const light = body.lightMinutes < 1 ? `${fmt(body.lightMinutes * 60, 1)} seconds` : body.lightMinutes < 120 ? `${fmt(body.lightMinutes, 1)} minutes` : `${fmt(body.lightMinutes / 60, 1)} hours`;
    items.push(h('dl', { class: 'stats' },
      h('div', {}, h('dt', {}, 'Distance from Earth'), h('dd', {}, `${fmt(body.distanceKm)} km`)),
      h('div', {}, h('dt', {}, 'Light takes'), h('dd', {}, light)),
      body.radiusKm ? h('div', {}, h('dt', {}, 'Radius'), h('dd', {}, `${fmt(body.radiusKm)} km`)) : null,
    ));
    items.push(h('p', {}, `The ${thing.kind === 'moon' ? 'moonlight' : thing.kind === 'sun' ? 'sunlight' : 'light'} reaching you now left ${thing.kind === 'sun' ? 'the Sun' : thing.name} ${light} ago.`));
  }
  if (thing.kind === 'moon') items.push(h('p', {}, 'The Moon is Earth’s only natural satellite. It is about ten times farther away than the geostationary weather satellites.'));
  if (thing.kind === 'planet') items.push(h('p', {}, `${thing.name} orbits the Sun, not Earth, so it has no ground point and no orbit around us. It still has a spot on Earth where it is straight overhead.`));
  return h('section', { class: 'detail-section' }, h('h3', {}, 'Facts'), ...items.filter(Boolean) as Node[]);
}

function lightText(minutes: number): string {
  if (minutes < 1) return `${fmt(minutes * 60, 1)} seconds`;
  if (minutes < 120) return `${fmt(minutes, 1)} minutes`;
  return `${fmt(minutes / 60, 1)} hours`;
}

function smallSection(thing: SkyThing): HTMLElement {
  const small = thing.small!;
  const body = small.body;
  const items: Array<Node | null> = [
    h('dl', { class: 'stats' },
      h('div', {}, h('dt', {}, 'Distance from Earth'), h('dd', {}, `${fmt(small.distanceKm / 1e6, small.distanceKm < 1e9 ? 1 : 0)} million km`)),
      h('div', {}, h('dt', {}, 'Light takes'), h('dd', {}, lightText(small.lightMinutes))),
      body?.diameterKm ? h('div', {}, h('dt', {}, 'Size'), h('dd', {}, body.diameterKm < 5 ? `${fmt(body.diameterKm * 1000)} m across` : `${fmt(body.diameterKm)} km across`)) : null,
      body ? h('div', {}, h('dt', {}, 'One lap of the Sun'), h('dd', {}, `${fmt(360 / body.n / 365.25, 1)} years`)) : h('div', {}, h('dt', {}, 'One lap of the Sun'), h('dd', {}, '248 years')),
    ),
  ];
  if (body) {
    items.push(h('p', {}, body.note));
    if (body.neo) items.push(h('p', { class: 'hint' }, 'Near-Earth asteroids have orbits that come within about 45 million km of Earth’s orbit. Astronomers track them so any risk is known decades ahead.'));
    if (body.pha) items.push(h('p', { class: 'hint' }, 'It is listed as "potentially hazardous", which means it is big and its orbit comes close to Earth’s. It does not mean an impact is expected.'));
    items.push(h('p', { class: 'hint' }, 'Too faint to see without a telescope (Vesta is the only exception, on very dark nights).'));
  } else {
    items.push(h('p', {}, 'Pluto was called the ninth planet from its discovery in 1930 until 2006, when astronomers made it the first "dwarf planet". NASA\u2019s New Horizons flew past it in 2015 and found mountains of water ice and a heart-shaped plain.'));
  }
  return h('section', { class: 'detail-section' }, h('h3', {}, 'Facts'), ...(items.filter(Boolean) as Node[]));
}

function deepSection(thing: SkyThing, ctx: DetailContext): HTMLElement {
  const deep = thing.deep!;
  const ly = deep.lightYears;
  const left = ly < 10_000 ? `about ${fmt(ly)} years ago, around ${fmt(ctx.sky.at.getUTCFullYear() - ly)} ${ctx.sky.at.getUTCFullYear() - ly < 0 ? 'BCE' : 'CE'}`.replace(/-(\d)/, '$1') : ly < 1e6 ? `about ${fmt(ly)} years ago` : `about ${fmt(ly / 1e6, 1)} million years ago, before there were any humans`;
  return h('section', { class: 'detail-section' },
    h('h3', {}, 'Facts'),
    h('p', {}, `${deep.type} · ${deep.catalog}`),
    h('p', {}, deep.about),
    h('p', {}, `It is about ${ly < 1e6 ? `${fmt(ly)} light-years` : `${fmt(ly / 1e6, 1)} million light-years`} away. The light reaching you left it ${left}.`),
    deep.history ? h('h4', {}, 'History') : null,
    deep.history ? h('p', {}, deep.history) : null,
  );
}

/** Names people have given this star, a form to add one, and a way to report one. */
function namesSection(thing: SkyThing, ctx: DetailContext): HTMLElement {
  const key = thing.star!.catalogKey!;
  const catalogueName = key.startsWith('hip-') ? `HIP ${key.slice(4)}` : `HYG ${key.slice(4)}`;
  const section = h('section', { class: 'detail-section names', id: 'star-names' }, h('h3', {}, 'Names people gave this star'));
  const service = ctx.starNames;
  if (!service?.enabled) {
    section.append(h('p', {}, 'Soon you will be able to give this star a name that everyone using SkyGround can see.'), h('p', { class: 'hint' }, `Astronomers know it as ${thing.name === catalogueName ? catalogueName : `${thing.name} (${catalogueName})`}.`));
    return section;
  }
  const list = h('ul', { class: 'name-list' });
  const renderList = () => {
    const names = service.names(key);
    list.replaceChildren(...(names.length ? names.map((item) => {
      const report = button('Report', { class: 'chip small', 'aria-label': `Report the name ${item.name}` }, async () => {
        report.disabled = true;
        report.textContent = (await service.report(item.id)) ? 'Reported' : 'Try again';
        if (report.textContent === 'Try again') report.disabled = false;
      });
      return h('li', {}, h('span', {}, h('strong', {}, item.name), h('small', {}, `named ${new Date(item.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`)), report);
    }) : [h('li', { class: 'empty' }, 'No one has named this star yet. Be the first!')]));
  };
  renderList();
  const input = h('input', { id: 'star-name-input', type: 'text', maxlength: String(NAME_MAX), autocomplete: 'off', placeholder: 'A name for this star', 'aria-describedby': 'star-name-help' });
  const message = h('p', { class: 'hint', id: 'star-name-message', role: 'status' });
  const submit = button('Name this star', { class: 'primary', type: 'submit' });
  const form = h('form', { class: 'name-form' }, h('label', { class: 'field-label', for: 'star-name-input' }, 'Give it a name'), h('div', { class: 'name-row' }, input, submit), message);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const checked = checkStarName(input.value);
    if (!checked.ok) {
      message.textContent = checked.reason;
      return;
    }
    submit.disabled = true;
    message.textContent = 'Adding your name…';
    const result = await service.addName(key, checked.name);
    submit.disabled = false;
    if (result.ok) {
      input.value = '';
      message.textContent = `“${result.name.name}” is now on the star map for everyone to see.`;
      renderList();
    } else {
      message.textContent = result.reason;
    }
  });
  section.append(
    list,
    form,
    h('p', { class: 'hint', id: 'star-name-help' }, 'Everyone using SkyGround will see the names you give. Don\u2019t use your full name or anyone\u2019s personal information. Rude names are blocked, and names reported by several people are hidden.'),
    h('p', { class: 'hint' }, `These are friendly names, just for fun. Astronomers know this star as ${catalogueName}, and only the International Astronomical Union gives official star names.`),
  );
  return section;
}

function starSection(thing: SkyThing, ctx: DetailContext): HTMLElement {
  const star = thing.star!;
  const year = lightLeftYear(star, ctx.sky.at);
  return h('section', { class: 'detail-section' },
    h('h3', {}, 'Facts'),
    h('p', {}, `A bright star in ${star.constellation}.`),
    star.lightYears != null
      ? h('p', {}, `It is about ${fmt(star.lightYears, star.lightYears < 20 ? 1 : 0)} light-years away.${year ? ` The light you see tonight left it around ${year}.` : ''}`)
      : h('p', {}, 'Its distance is hundreds of light-years, and estimates differ. The light you see left it centuries ago.'),
    star.colorIndex != null ? h('p', {}, `It shines ${starColour(star.colorIndex).words}, with a surface around ${fmt(starColour(star.colorIndex).kelvin - 273, 0)} °C${star.spect ? ` (spectral type ${star.spect})` : ''}. The Sun is about 5,500 °C.`) : null,
    h('p', { class: 'hint' }, `Brightness ${fmt(star.magnitude, 1)} on the magnitude scale, where smaller numbers are brighter. ${star.magnitude <= 2 ? 'Easy to see even from a city.' : star.magnitude <= 4 ? 'Visible from suburbs on a clear night.' : 'Needs a dark sky away from city lights.'}`),
    h('p', { class: 'hint' }, 'Stars are so far away that they barely move against each other in a lifetime. Their daily motion across your sky is Earth turning.'),
  );
}

function belowSection(thing: SkyThing, ctx: DetailContext): HTMLElement {
  const ground = groundPointOf(thing);
  const section = h('section', { class: 'detail-section below', 'data-region': '' });
  if (!ground) return section;
  const isSatellite = Boolean(thing.satellite);
  const title = isSatellite ? 'What’s below it right now' : 'Where it’s straight overhead';
  const from = ctx.sky.observer;
  const away = distanceKm({ lat: from.lat, lon: from.lon }, ground.point);
  section.append(
    h('h3', {}, title),
    h('p', { class: 'hint', 'data-live': 'ground' }, `${ground.label}: ${latLonText(ground.point)} · ${fmt(away)} km from ${ctx.cityName}`),
    h('p', { class: 'hint' }, isSatellite
      ? 'The ground point is the spot directly beneath the satellite. It does not mean the satellite is looking at or photographing that place.'
      : 'Nothing is orbiting above this spot. It is just where someone would have to stand to see it straight above their head.'),
    h('div', { class: 'region', 'aria-live': 'polite' }, ctx.below ? regionCard(ctx.below.at(ground.point)) : h('p', { class: 'hint' }, 'Loading what is below…')),
    button('Show on the map', { class: 'secondary' }, () => ctx.onShowMap(thing)),
  );
  section.dataset.region = ctx.below ? ctx.below.at(ground.point).name : '';
  return section;
}

/** From the object down to the ground: the places its path crosses next, and dated events tied to it or beneath that path. */
function historySection(thing: SkyThing, ctx: DetailContext): HTMLElement | null {
  const ground = groundPointOf(thing);
  const section = h('section', { class: 'detail-section history' }, h('h3', {}, 'History beneath it'));
  let filled = false;

  if (ground) {
    const path = upcomingPath(thing, ctx.sky.at);
    const satellite = Boolean(thing.satellite);
    if (ctx.below && path.length) {
      const stops: Array<{ name: string; kind: string; point: Coordinates }> = [];
      for (const point of path) {
        const answer = ctx.below.at(point);
        if (stops[stops.length - 1]?.name !== answer.name) stops.push({ name: answer.name, kind: answer.kind, point });
      }
      const lead = satellite
        ? `Over its next ${thing.satellite!.orbit.periodMin < 1440 ? 'lap' : 'day'}, it passes over:`
        : 'Over the next 24 hours, it is straight overhead somewhere along this line:';
      section.append(h('p', {}, lead), h('div', { class: 'path-chips' }, ...stops.slice(0, 18).map((stop) => {
        const chip = button(stop.name, { class: stop.kind === 'country' ? 'chip path land' : 'chip path water' }, () => ctx.onShowPlace(stop.point));
        return chip;
      })));
      if (stops.length > 18) section.append(h('p', { class: 'hint' }, `…and ${stops.length - 18} more. Tap a place to read its history.`));
      else section.append(h('p', { class: 'hint' }, 'Tap a place to read its history.'));
      filled = true;
    }
    // Dated events near that path (within about 400 km for satellites, 250 km of the overhead line otherwise).
    const radius = satellite ? 400 : 250;
    const near = SPACE_HISTORY.filter((event) => path.some((point) => distanceKm(point, event.location) <= radius));
    if (near.length) {
      section.append(h('h4', {}, satellite ? 'It passes near where these happened' : 'It passes overhead near where these happened'));
      section.append(...near.slice(0, 4).map((event) => eventCard(event, ctx)));
      filled = true;
    }
  }

  const related = eventsRelatedTo(thing.id, thing.kind);
  if (related.length) {
    section.append(h('h4', {}, thing.kind === 'asteroid' ? 'When space rocks reached the ground' : 'Moments on Earth connected to it'));
    section.append(...related.map((event) => eventCard(event, ctx)));
    filled = true;
  }
  if (thing.kind === 'moon') {
    section.append(h('h4', {}, 'History on the Moon itself'), ...MOON_SITES.map((site) => h('div', { class: 'event' },
      h('p', { class: 'eyebrow' }, `${site.dateLabel} · ${site.where}`),
      h('strong', {}, site.title),
      h('p', {}, site.summary),
      safeHttps(site.source) ? h('a', { href: safeHttps(site.source)!, rel: 'noreferrer', target: '_blank' }, 'Read more on Wikipedia') : '',
    )));
    filled = true;
  }
  if (!filled) return null;
  section.append(h('p', { class: 'hint' }, 'Passing over a place does not mean an object had anything to do with what happened there. Each event above lists how it is connected.'));
  return section;
}

function eventCard(event: SpaceHistoryEvent, ctx: DetailContext): HTMLElement {
  const source = safeHttps(event.source);
  return h('div', { class: 'event' },
    h('p', { class: 'eyebrow' }, `${event.dateLabel} · ${event.place}`),
    h('strong', {}, event.title),
    h('p', {}, event.summary),
    h('div', { class: 'event-actions' },
      button('Show on map', { class: 'chip small' }, () => ctx.onShowPlace(event.location)),
      source ? h('a', { href: source, rel: 'noreferrer', target: '_blank' }, 'Source') : '',
      event.locationBasis === 'approximate' ? h('span', { class: 'hint' }, 'Place is approximate') : '',
    ),
  );
}

export function eventPanel(event: SpaceHistoryEvent, close: () => void): HTMLElement {
  return h('div', { class: 'detail-body' },
    h('header', { class: 'detail-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Space history'), h('h2', { id: 'detail-title', tabindex: '-1' }, event.title)),
      button('Close', { class: 'icon-button', 'aria-label': 'Close details' }, close),
    ),
    h('p', { class: 'lead' }, `${event.dateLabel} · ${event.place}`),
    h('p', {}, event.summary),
    safeHttps(event.source) ? h('a', { href: safeHttps(event.source)!, rel: 'noreferrer', target: '_blank' }, 'Read more on Wikipedia') : '',
    event.locationBasis === 'approximate' ? h('p', { class: 'hint' }, 'The map marker shows the general area.') : '',
  );
}

export function regionCard(answer: BelowAnswer, heading?: string): HTMLElement {
  const card = h('div', { class: 'region-card' },
    h('p', { class: 'eyebrow' }, heading ?? answer.kindLabel),
    h('h4', {}, answer.name),
  );
  if (answer.kind === 'open-ocean') {
    card.append(h('p', {}, 'Open ocean — no country is below this point. About 71% of Earth’s surface is ocean, so ground points spend most of their time over water.'));
    return card;
  }
  if (answer.intro) {
    card.append(h('p', {}, shortExcerpt(answer.intro.extract)));
    const link = safeHttps(answer.intro.url);
    if (link) card.append(h('a', { href: link, rel: 'noreferrer', target: '_blank' }, `Read about ${answer.intro.title} on Wikipedia`));
  }
  if (answer.history) {
    card.append(h('h5', {}, 'A little history'), h('p', {}, shortExcerpt(answer.history.extract, 420)));
    const link = safeHttps(answer.history.url);
    if (link) card.append(h('a', { href: link, rel: 'noreferrer', target: '_blank' }, `Read “${answer.history.title}”`));
  }
  if (!answer.intro && !answer.history) card.append(h('p', { class: 'hint' }, 'No reviewed introduction is bundled for this region yet.'));
  if (answer.intro || answer.history) {
    const license = safeHttps(answer.licenseUrl);
    card.append(h('p', { class: 'credit' }, 'Excerpts from Wikipedia, ', license ? h('a', { href: license, rel: 'noreferrer', target: '_blank' }, answer.license) : answer.license, `, retrieved ${answer.retrievedAtUtc.slice(0, 10)}. Borders are generalized and are not a statement on disputed territory.`));
  }
  return card;
}

function notes(thing: SkyThing, ctx: DetailContext): HTMLElement {
  const items: string[] = [];
  if (thing.satellite) {
    const s = thing.satellite;
    const ageHours = Math.abs(ctx.sky.at.getTime() - Date.parse(s.epochUtc)) / 3_600_000;
    items.push(`NORAD catalog number ${s.noradId}, international designator ${String(s.record.OBJECT_ID)}.`);
    items.push(`Orbit elements from CelesTrak are ${ageHours < 48 ? `${fmt(ageHours, 0)} hours` : `${fmt(ageHours / 24, 1)} days`} old (epoch ${s.epochUtc}). Snapshot fetched ${currentSnapshot().fetchedAtUtc}.`);
    items.push('Positions are calculated on this device with satellite.js (SGP4). Low orbits drift a little each day, so a position can be off by a few kilometres.');
  } else if (thing.star) {
    items.push('Star position from catalog coordinates, adjusted to the selected date. Directions are calculated with Astronomy Engine.');
  } else if (thing.small?.body) {
    const age = thing.small.elementAgeDays ?? 0;
    items.push(`Orbit from the NASA JPL Small-Body Database, moved forward with simple Kepler motion. The elements are ${fmt(age, 0)} days from the selected time${age > 1000 ? ', so the position is only approximate' : ''}.`);
  } else if (thing.small) {
    items.push('Pluto\u2019s position is calculated with Astronomy Engine.');
  } else if (thing.deep) {
    items.push('Position from J2000 catalog coordinates (SIMBAD). Distances are rounded published values.');
  } else {
    items.push('Calculated on this device with Astronomy Engine. Facts about size come from Wikidata.');
  }
  items.push(`Calculated for ${ctx.cityName} at ${ctx.sky.at.toISOString().replace('.000Z', 'Z')} (UTC).`);
  return h('details', { class: 'notes' }, h('summary', {}, 'Data and sources'), ...items.map((text) => h('p', {}, text)));
}

/** Refresh the numbers that change every second without rebuilding the card. */
export function refreshDetail(root: HTMLElement, thing: SkyThing, ctx: DetailContext) {
  const set = (key: string, text: string) => {
    const node = root.querySelector(`[data-live="${key}"]`);
    if (node && node.textContent !== text) node.textContent = text;
  };
  set('where', `From ${ctx.cityName}, look ${directionWords(thing.azimuthDeg, thing.altitudeDeg)}.`);
  set('angles', angleText(thing));
  if (thing.satellite) {
    set('height', `${fmt(thing.satellite.altitudeKm)} km`);
    set('speed', `${fmt(thing.satellite.speedKmS, 2)} km/s`);
    set('speed-words', speedWords(thing.satellite.speedKmS));
  }
  const ground = groundPointOf(thing);
  if (ground) {
    const away = distanceKm({ lat: ctx.sky.observer.lat, lon: ctx.sky.observer.lon }, ground.point);
    set('ground', `${ground.label}: ${latLonText(ground.point)} · ${fmt(away)} km from ${ctx.cityName}`);
    const section = root.querySelector<HTMLElement>('.detail-section.below');
    if (section && ctx.below) {
      const answer = ctx.below.at(ground.point);
      if (section.dataset.region !== answer.name) {
        section.dataset.region = answer.name;
        section.querySelector('.region')?.replaceChildren(regionCard(answer));
      }
    }
  }
}

export function pointCard(point: Coordinates, below: BelowLookup | null, close: () => void): HTMLElement {
  return h('div', { class: 'detail-body' },
    h('header', { class: 'detail-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'A place you tapped'), h('h2', { id: 'detail-title', tabindex: '-1' }, latLonText(point))),
      button('Close', { class: 'icon-button', 'aria-label': 'Close details' }, close),
    ),
    h('div', { class: 'region', 'aria-live': 'polite' }, below ? regionCard(below.at(point)) : h('p', { class: 'hint' }, 'Loading what is here…')),
  );
}
