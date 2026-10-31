import { describe, expect, test } from 'vitest';
import { checkStarName } from '../src/content/name-filter';

describe('star name filter', () => {
  test('accepts friendly names, including ones that contain blocked words by accident', () => {
    for (const name of ['Twinkle Mila', 'Twinkle Twinkle', 'Bob', 'Star X', 'Basement Star', 'Nigeria Light', 'Sparkle', 'Grandma Rose', 'Mila’s Star', 'Estrella Luz', 'Class of 2026', 'Scunthorpe', 'Cassandra', 'Glasses', 'Sussex Shine', 'Star-Lord!', '星の光']) {
      expect(checkStarName(name), name).toEqual({ ok: true, name });
    }
  });

  test('blocks rude words, including spaced, repeated, and number-swapped spellings', () => {
    const rot = (s: string) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
    for (const name of [rot('shpx'), rot('fuvg fgne'), rot('fuuuuuvg'), rot('o1gpu'), 'You are ugly', 'kys', 'Stupid Sam']) {
      expect(checkStarName(name).ok, name).toBe(false);
    }
  });

  test('blocks links, handles, and personal information', () => {
    for (const name of ['sam@gmail', 'www.star', 'my insta sam', 'call me 5551234', 'I live on Elm', '12 Oak Street', 'tiktok star']) {
      expect(checkStarName(name).ok, name).toBe(false);
    }
  });

  test('enforces length and characters', () => {
    expect(checkStarName('a').ok).toBe(false);
    expect(checkStarName('x'.repeat(30)).ok).toBe(false);
    expect(checkStarName('<script>').ok).toBe(false);
    expect(checkStarName('  Nova   Bright ')).toEqual({ ok: true, name: 'Nova Bright' });
  });
});
