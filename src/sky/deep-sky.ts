/**
 * A few famous galaxies, nebulae, and star clusters. J2000 positions (SIMBAD / NASA/IPAC NED).
 * Distances are rounded published values.
 */
export interface DeepSkyObject {
  id: string;
  name: string;
  catalog: string;
  type: string;
  raDeg: number;
  decDeg: number;
  lightYears: number;
  about: string;
  history?: string;
}

export const DEEP_SKY: DeepSkyObject[] = [
  { id: 'm31', name: 'Andromeda Galaxy', catalog: 'M31', type: 'Spiral galaxy', raDeg: 10.6847, decDeg: 41.2687, lightYears: 2_500_000, about: 'The nearest big galaxy to ours, with about a trillion stars. On a dark night it looks like a faint smudge without a telescope.', history: 'Persian astronomer al-Sufi described it as a "little cloud" in his Book of Fixed Stars around 964 CE. In 1923 Edwin Hubble showed it is a separate galaxy far outside the Milky Way.' },
  { id: 'm33', name: 'Triangulum Galaxy', catalog: 'M33', type: 'Spiral galaxy', raDeg: 23.4621, decDeg: 30.66, lightYears: 2_700_000, about: 'A smaller spiral galaxy and one of the most distant things some people can see without a telescope.' },
  { id: 'm42', name: 'Orion Nebula', catalog: 'M42', type: 'Star-forming cloud', raDeg: 83.8221, decDeg: -5.3911, lightYears: 1_344, about: 'A glowing cloud of gas where new stars are being born, visible as the fuzzy middle "star" in Orion’s sword.' },
  { id: 'm45', name: 'Pleiades', catalog: 'M45', type: 'Star cluster', raDeg: 56.75, decDeg: 24.1167, lightYears: 444, about: 'A cluster of young blue stars, also called the Seven Sisters. Most people can see six or seven of them.', history: 'Many cultures named and told stories about the Pleiades, from Greek myth to Japanese (Subaru) and Māori (Matariki) traditions. Matariki is a public holiday in New Zealand.' },
  { id: 'm1', name: 'Crab Nebula', catalog: 'M1', type: 'Supernova remnant', raDeg: 83.6331, decDeg: 22.0145, lightYears: 6_500, about: 'The leftovers of an exploded star, with a fast-spinning neutron star at its centre.', history: 'Chinese astronomers recorded the explosion as a "guest star" in 1054 CE. It was bright enough to see in daylight for weeks.' },
  { id: 'm13', name: 'Hercules Cluster', catalog: 'M13', type: 'Globular cluster', raDeg: 250.4235, decDeg: 36.4613, lightYears: 22_200, about: 'A ball of several hundred thousand old stars.', history: 'In 1974 the Arecibo radio telescope in Puerto Rico beamed a message toward it, one of the first deliberate messages to other civilizations.' },
  { id: 'm57', name: 'Ring Nebula', catalog: 'M57', type: 'Planetary nebula', raDeg: 283.396, decDeg: 33.029, lightYears: 2_300, about: 'A shell of gas thrown off by a dying Sun-like star. Our Sun may make something like it in about 5 billion years.' },
  { id: 'sgr-a', name: 'Centre of the Milky Way', catalog: 'Sagittarius A*', type: 'Supermassive black hole', raDeg: 266.4168, decDeg: -29.0078, lightYears: 26_000, about: 'The heart of our galaxy, hidden behind dust, holds a black hole about 4 million times the mass of the Sun.', history: 'The Event Horizon Telescope, a network of radio dishes across the world, released the first image of this black hole in 2022.' },
  { id: 'lmc', name: 'Large Magellanic Cloud', catalog: 'LMC', type: 'Dwarf galaxy', raDeg: 80.894, decDeg: -69.756, lightYears: 160_000, about: 'A small galaxy orbiting the Milky Way, easy to see from the Southern Hemisphere.', history: 'In 1987 a supernova (SN 1987A) appeared in it, the closest seen since telescopes were invented. Detectors in Japan and the United States caught neutrinos from it hours before the light arrived.' },
  { id: 'smc', name: 'Small Magellanic Cloud', catalog: 'SMC', type: 'Dwarf galaxy', raDeg: 13.1867, decDeg: -72.8286, lightYears: 200_000, about: 'A smaller companion galaxy of the Milky Way, visible from the Southern Hemisphere.' },
];

export function raDecVector(raDeg: number, decDeg: number): [number, number, number] {
  const r = Math.PI / 180;
  return [Math.cos(decDeg * r) * Math.cos(raDeg * r), Math.cos(decDeg * r) * Math.sin(raDeg * r), Math.sin(decDeg * r)];
}

/** Galactic plane (latitude 0) as J2000 equatorial unit vectors, with brightness peaking toward the centre. */
export function galacticPlane(step = 4): Array<{ vector: [number, number, number]; glow: number }> {
  // Transpose of the IAU J2000-to-galactic rotation matrix.
  const m = [
    [-0.0548755604, 0.4941094279, -0.8676661490],
    [-0.8734370902, -0.4448296300, -0.1980763734],
    [-0.4838350155, 0.7469822445, 0.4559837762],
  ];
  const points: Array<{ vector: [number, number, number]; glow: number }> = [];
  for (let l = 0; l <= 360; l += step) {
    const g = [Math.cos((l * Math.PI) / 180), Math.sin((l * Math.PI) / 180), 0];
    // m is the transpose of the J2000-to-galactic matrix, so equatorial = m · galactic.
    const v: [number, number, number] = [
      m[0][0] * g[0] + m[0][1] * g[1] + m[0][2] * g[2],
      m[1][0] * g[0] + m[1][1] * g[1] + m[1][2] * g[2],
      m[2][0] * g[0] + m[2][1] * g[1] + m[2][2] * g[2],
    ];
    const toCentre = Math.cos((l * Math.PI) / 180);
    points.push({ vector: v, glow: 0.45 + 0.55 * Math.max(0, toCentre) ** 2 });
  }
  return points;
}
