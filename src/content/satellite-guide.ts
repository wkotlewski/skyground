/**
 * Plain-language notes for the reviewed satellite allowlist.
 * Orbit numbers are never written here; they are calculated from the bundled elements.
 * "groundLink" explains how the satellite's work reaches people on the ground.
 * It describes the mission's purpose, not what the satellite is doing over any one place.
 */

export type SatelliteFamily = 'station' | 'crew' | 'telescope' | 'earth' | 'weather' | 'navigation' | 'sun' | 'space-physics';

export interface SatelliteGuide {
  displayName: string;
  family: SatelliteFamily;
  operator: string;
  launched: string;
  purpose: string;
  groundLink: string;
  whyThisOrbit: string;
}

export const FAMILY_LABELS: Record<SatelliteFamily, string> = {
  station: 'Space station',
  crew: 'Crew spacecraft',
  telescope: 'Space telescope',
  earth: 'Earth watcher',
  weather: 'Weather satellite',
  navigation: 'Navigation satellite',
  sun: 'Sun watcher',
  'space-physics': 'Space physics',
};

const sunSync = 'A sun-synchronous orbit passes over each place at about the same local time every day, so photos taken weeks apart have similar lighting and are easy to compare.';
const gps = {
  family: 'navigation' as const,
  operator: 'U.S. Space Force',
  purpose: 'Broadcasts precise time signals. A receiver that hears at least four GPS satellites can work out where it is.',
  groundLink: 'Phones, cars, farm tractors, airplanes, and bank networks all use these signals for location and timing.',
  whyThisOrbit: 'Medium Earth orbit is high enough that each satellite covers a big part of the planet, so about 30 of them keep several in view from almost anywhere.',
};
const galileo = {
  family: 'navigation' as const,
  operator: 'European Union',
  purpose: 'Europe’s satellite navigation system. Like GPS, it sends timing signals that let receivers find their position.',
  groundLink: 'Most new phones listen to Galileo and GPS together, which makes locations faster and more accurate.',
  whyThisOrbit: 'A medium Earth orbit a little higher than GPS lets a few dozen satellites cover the whole world.',
};
const geoWeather = {
  family: 'weather' as const,
  whyThisOrbit: 'In geostationary orbit a satellite circles once per day, exactly as fast as Earth turns, so it seems to hang still and can film the same half of Earth nonstop.',
};

export const satelliteGuide: Record<number, SatelliteGuide> = {
  25544: {
    displayName: 'International Space Station',
    family: 'station',
    operator: 'NASA, Roscosmos, ESA, JAXA, and CSA',
    launched: '1998 (first module)',
    purpose: 'A science lab where astronauts have lived continuously since November 2000.',
    groundLink: 'Experiments on board study health, plants, fire, and materials in near-weightlessness. It is often bright enough to see without a telescope.',
    whyThisOrbit: 'A low orbit is easier for rockets carrying crew and supplies to reach. Its tilted path lets it pass over most places where people live.',
  },
  48274: {
    displayName: 'Tiangong space station (Tianhe core)',
    family: 'station',
    operator: 'China Manned Space Agency',
    launched: '2021',
    purpose: 'Tianhe is the core module of China’s Tiangong space station, where crews live and run experiments.',
    groundLink: 'Crews carry out science and technology experiments and share classes and talks with students on the ground.',
    whyThisOrbit: 'A low orbit keeps trips for crew and cargo short.',
  },
  69180: {
    displayName: 'Shenzhou-23',
    family: 'crew',
    operator: 'China Manned Space Agency',
    launched: '2026',
    purpose: 'A crew spacecraft that carries astronauts to and from the Tiangong space station.',
    groundLink: 'It is docked to Tiangong, so it moves along with the station.',
    whyThisOrbit: 'It shares Tiangong’s orbit because it is attached to the station.',
  },
  100057: {
    displayName: 'Soyuz MS-29',
    family: 'crew',
    operator: 'Roscosmos',
    launched: '2026',
    purpose: 'A Russian crew spacecraft that carries astronauts to and from the International Space Station.',
    groundLink: 'It stays docked to the ISS so the crew always has a ride home.',
    whyThisOrbit: 'It shares the ISS orbit because it is attached to the station.',
  },
  100882: {
    displayName: 'Crew Dragon 13',
    family: 'crew',
    operator: 'SpaceX for NASA',
    launched: '2026',
    purpose: 'A SpaceX capsule that carries astronauts to and from the International Space Station.',
    groundLink: 'It stays docked to the ISS and splashes down in the ocean at the end of a mission.',
    whyThisOrbit: 'It shares the ISS orbit because it is attached to the station.',
  },
  20580: {
    displayName: 'Hubble Space Telescope',
    family: 'telescope',
    operator: 'NASA and ESA',
    launched: '1990',
    purpose: 'A telescope above the blur of the atmosphere that takes sharp pictures of planets, galaxies, and nebulae.',
    groundLink: 'Astronomers on Earth control it and download its images; its pictures appear in classrooms and textbooks worldwide.',
    whyThisOrbit: 'A low orbit let Space Shuttle astronauts visit five times to repair and upgrade it.',
  },
  28485: {
    displayName: 'Swift Observatory',
    family: 'telescope',
    operator: 'NASA',
    launched: '2004',
    purpose: 'Watches for gamma-ray bursts, the most powerful explosions in the universe, and turns quickly to study them.',
    groundLink: 'It sends alerts within seconds so telescopes on the ground can look at the same spot.',
    whyThisOrbit: 'A low orbit close to the equator keeps it out of the worst radiation zones and close to its ground station.',
  },
  33053: {
    displayName: 'Fermi Gamma-ray Space Telescope',
    family: 'telescope',
    operator: 'NASA',
    launched: '2008',
    purpose: 'Maps the whole sky in gamma rays to study black holes, pulsars, and other extreme objects.',
    groundLink: 'Gamma rays are blocked by our atmosphere, so this kind of astronomy has to happen in space.',
    whyThisOrbit: 'A low orbit lets it scan the entire sky every few hours.',
  },
  25994: {
    displayName: 'Terra',
    family: 'earth',
    operator: 'NASA',
    launched: '1999',
    purpose: 'Measures land, clouds, oceans, and air pollution across the whole planet.',
    groundLink: 'Its pictures are used to track wildfires, smoke, snow, and changes in forests over decades.',
    whyThisOrbit: sunSync,
  },
  27424: {
    displayName: 'Aqua',
    family: 'earth',
    operator: 'NASA',
    launched: '2002',
    purpose: 'Studies Earth’s water: rain, clouds, sea ice, snow, and water vapor.',
    groundLink: 'Its measurements help scientists and forecasters understand storms and drought.',
    whyThisOrbit: sunSync,
  },
  39084: {
    displayName: 'Landsat 8',
    family: 'earth',
    operator: 'NASA and USGS',
    launched: '2013',
    purpose: 'Photographs Earth’s land in detail. Landsat satellites have been doing this since 1972.',
    groundLink: 'Over 50 years of Landsat pictures show how cities grew, glaciers shrank, and forests changed. The images are free for anyone.',
    whyThisOrbit: sunSync,
  },
  49260: {
    displayName: 'Landsat 9',
    family: 'earth',
    operator: 'NASA and USGS',
    launched: '2021',
    purpose: 'Continues the Landsat record of Earth’s land, working as a team with Landsat 8.',
    groundLink: 'Together with Landsat 8 it revisits each place about every 8 days, which helps farmers, foresters, and city planners.',
    whyThisOrbit: sunSync,
  },
  43013: {
    displayName: 'NOAA-20',
    family: 'weather',
    operator: 'NOAA and NASA',
    launched: '2017',
    purpose: 'A polar weather satellite that measures temperature and moisture through the whole atmosphere.',
    groundLink: 'Its data feeds the computer models behind the weather forecasts on TV and phone apps.',
    whyThisOrbit: sunSync,
  },
  39634: {
    displayName: 'Sentinel-1A',
    family: 'earth',
    operator: 'European Space Agency (Copernicus)',
    launched: '2014',
    purpose: 'Uses radar to image Earth, so it can see through clouds and at night.',
    groundLink: 'Radar images help map floods, sea ice, earthquakes, and ground that is slowly sinking.',
    whyThisOrbit: sunSync,
  },
  39574: {
    displayName: 'GPM Core Observatory',
    family: 'weather',
    operator: 'NASA and JAXA',
    launched: '2014',
    purpose: 'Measures rain and snow from space, including inside storms.',
    groundLink: 'It helps scientists measure rainfall in places that have few rain gauges, such as oceans and remote land.',
    whyThisOrbit: 'Its low, tilted orbit passes over the tropics and middle latitudes at different times of day, so it sees storms as they grow and fade.',
  },
  43873: { displayName: 'GPS III satellite 1', launched: '2018', ...gps },
  41328: { displayName: 'GPS IIF satellite 12', launched: '2016', ...gps },
  68791: { displayName: 'GPS III satellite 10', launched: '2026', ...gps },
  67160: { displayName: 'Galileo satellite 33', launched: '2025', ...galileo },
  49809: { displayName: 'Galileo satellite 27', launched: '2021', ...galileo },
  60133: {
    displayName: 'GOES-19 (GOES East)',
    operator: 'NOAA and NASA',
    launched: '2024',
    purpose: 'Watches weather over the Americas and the Atlantic Ocean, taking new pictures every few minutes.',
    groundLink: 'The cloud animations in many U.S. weather reports come from GOES satellites. It also watches for lightning and wildfire heat.',
    ...geoWeather,
  },
  51850: {
    displayName: 'GOES-18 (GOES West)',
    operator: 'NOAA and NASA',
    launched: '2022',
    purpose: 'Watches weather over the western United States, Alaska, Hawaii, and the Pacific Ocean.',
    groundLink: 'Forecasters use it to follow Pacific storms, fog, and wildfire smoke.',
    ...geoWeather,
  },
  41836: {
    displayName: 'Himawari-9',
    operator: 'Japan Meteorological Agency',
    launched: '2016',
    purpose: 'Watches weather over East Asia, Australia, and the western Pacific.',
    groundLink: 'Forecasters across Asia and the Pacific use it to track typhoons.',
    ...geoWeather,
  },
  36395: {
    displayName: 'Solar Dynamics Observatory',
    family: 'sun',
    operator: 'NASA',
    launched: '2010',
    purpose: 'Films the Sun in many colors of light to study sunspots and solar flares.',
    groundLink: 'Solar storms can disturb radio, GPS, and power grids on Earth, so watching the Sun helps people prepare.',
    whyThisOrbit: 'A geosynchronous orbit that is tilted traces a figure-eight in the sky over one spot, so it can send huge amounts of data to a single ground station all day.',
  },
  25867: {
    displayName: 'Chandra X-ray Observatory',
    family: 'telescope',
    operator: 'NASA',
    launched: '1999',
    purpose: 'Takes X-ray pictures of very hot places such as exploded stars and gas around black holes.',
    groundLink: 'X-rays do not reach the ground, so Chandra shows things telescopes on Earth cannot.',
    whyThisOrbit: 'Its stretched orbit carries it far from Earth for most of each trip, so it spends long stretches outside the radiation belts and can stare at targets for hours without Earth getting in the way.',
  },
  40482: {
    displayName: 'MMS 1 (Magnetospheric Multiscale)',
    family: 'space-physics',
    operator: 'NASA',
    launched: '2015',
    purpose: 'One of four spacecraft flying in close formation to study how Earth’s magnetic field connects with the Sun’s.',
    groundLink: 'That magnetic connection helps power the northern and southern lights and space weather.',
    whyThisOrbit: 'Its very stretched orbit reaches the edge of Earth’s magnetic bubble, where the magnetic events it studies happen.',
  },
};
