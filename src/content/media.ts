import pack from '../../data/media/images.json';

/** Freely licensed pictures (public domain or CC BY / CC BY-SA), resized and served from this site. */
export interface ObjectImage {
  src: string;
  width: number;
  height: number;
  alt: string;
  artist: string;
  credit: string;
  license: string;
  licenseUrl: string | null;
  filePage: string;
  article: string | null;
}

const images = (pack as { images: Record<string, ObjectImage> }).images;

export function imageFor(id: string): ObjectImage | null {
  return images[id] ?? null;
}
