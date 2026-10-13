import type { GradeBand, Source } from '../contracts';

const reviewed: Pick<Source, 'fetchedAtUtc' | 'reviewedAtUtc' | 'rightsStatus'> = {
  fetchedAtUtc: '2026-10-12T00:00:00.000Z',
  reviewedAtUtc: '2026-10-12T00:00:00.000Z',
  rightsStatus: 'approved',
};

const allGrades: GradeBand[] = ['K-2', '3-5', '6-8', '9-12'];

export interface CuratedPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  categories: Array<'museums' | 'colleges' | 'history' | 'space'>;
  url: string;
  prompt: string;
  locationNote: string;
  approvedGrades: GradeBand[];
  source: Source;
}

function place(input: Omit<CuratedPlace, 'approvedGrades' | 'locationNote' | 'source'> & { organization: string }): CuratedPlace {
  return {
    ...input,
    locationNote: 'Approximate curated coordinate for this example, not a survey mark.',
    approvedGrades: allGrades,
    source: {
      organization: input.organization,
      url: input.url,
      ...reviewed,
    },
  };
}

/** Pilot-region examples. Not a global catalog, and not discovered from a live place API. */
export const places: CuratedPlace[] = [
  place({
    id: 'griffith',
    name: 'Griffith Observatory',
    lat: 34.1184,
    lon: -118.3004,
    categories: ['museums', 'space'],
    url: 'https://griffithobservatory.lacity.gov/',
    organization: 'Griffith Observatory',
    prompt: 'How could an observatory help you compare the sky at different times?',
  }),
  place({
    id: 'caltech',
    name: 'Caltech',
    lat: 34.1377,
    lon: -118.1253,
    categories: ['colleges'],
    url: 'https://www.caltech.edu/',
    organization: 'California Institute of Technology',
    prompt: 'Which subjects would you study to design a spacecraft?',
  }),
  place({
    id: 'jpl',
    name: 'Jet Propulsion Laboratory',
    lat: 34.2015,
    lon: -118.171,
    categories: ['space'],
    url: 'https://www.jpl.nasa.gov/',
    organization: 'NASA Jet Propulsion Laboratory',
    prompt: 'How could a robot help us explore somewhere humans cannot easily go?',
  }),
  place({
    id: 'airspace',
    name: 'National Air and Space Museum',
    lat: 38.8882,
    lon: -77.0199,
    categories: ['museums', 'space'],
    url: 'https://airandspace.si.edu/',
    organization: 'Smithsonian National Air and Space Museum',
    prompt: 'What can an object in a museum tell us about exploration?',
  }),
  place({
    id: 'howard',
    name: 'Howard University',
    lat: 38.9227,
    lon: -77.0194,
    categories: ['colleges'],
    url: 'https://howard.edu/',
    organization: 'Howard University',
    prompt: 'What could a university team investigate about its own community?',
  }),
  place({
    id: 'lincoln',
    name: 'Lincoln Memorial',
    lat: 38.8893,
    lon: -77.0502,
    categories: ['history'],
    url: 'https://www.nps.gov/linc/index.htm',
    organization: 'National Park Service',
    prompt: 'How can a place connect us to events from different times?',
  }),
];
