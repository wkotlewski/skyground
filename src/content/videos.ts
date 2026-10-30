/**
 * Videos from official agency channels. Each ID was checked with YouTube's oEmbed endpoint on 2026-10-30,
 * and the channel name below is the one YouTube reported. Nothing loads from YouTube until someone taps Play.
 */
export interface Video {
  id: string;
  title: string;
  channel: string;
}

const iss: Video = { id: 'D9gUhAOQ0O4', title: 'Tour the International Space Station: 25 Years of Humans in Space', channel: 'NASA Johnson' };
const goes: Video = { id: '3AMME8pVpgg', title: 'NOAA Celebrates 50 Years of GOES Satellites', channel: 'NOAASatellites' };
const gps: Video = { id: 'RSA3feQ9gKk', title: 'How does GPS work?', channel: 'NASA Space Place' };

export const VIDEOS: Record<string, Video> = {
  'norad-25544': iss,
  'norad-100057': iss,
  'norad-100882': iss,
  'norad-20580': { id: '9VhWnJC9nkk', title: 'Hubble’s Highlights from its 35th Year in Orbit', channel: 'NASA Goddard' },
  'norad-39084': { id: '-OaHZV5qcq8', title: 'Landsat Celebrates 45 Years of Earth Observations', channel: 'NASA Goddard' },
  'norad-49260': { id: 'DGE-N8_LQBo', title: '9 Things About Landsat 9', channel: 'NASA Goddard' },
  'norad-60133': goes,
  'norad-51850': goes,
  'norad-43873': gps,
  'norad-41328': gps,
  'norad-68791': gps,
  'norad-36395': { id: 'l3QQQu7QLoM', title: 'A Decade of Sun', channel: 'NASA Goddard' },
  sun: { id: 'l3QQQu7QLoM', title: 'A Decade of Sun', channel: 'NASA Goddard' },
  moon: { id: 'FlpstXNjImY', title: 'Historic Apollo 11 Moon Landing Footage', channel: 'NASA' },
  mars: { id: '4czjS9h4Fpg', title: 'Perseverance Rover’s Descent and Touchdown on Mars (Official NASA Video)', channel: 'NASA' },
  jupiter: { id: 'uj3Lq7Gu94Y', title: 'Fly into the Great Red Spot of Jupiter with NASA’s Juno Mission', channel: 'NASA' },
  saturn: { id: 'o73TwIUKpPY', title: 'NASA’s Cassini Spacecraft Makes Grand Finale Plunge', channel: 'NASA’s Kennedy Space Center' },
  pluto: { id: 'g1fPhhTT2Oo', title: 'New Horizons Flyover of Pluto', channel: 'NASA Video' },
  'ast-bennu': { id: '8KAisC5Q7IU', title: 'OSIRIS-REx Delivers Asteroid Bennu Samples to Earth', channel: 'NASA Video' },
};

export function isVideoId(id: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}
