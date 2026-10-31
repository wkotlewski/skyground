import blocked from '../../data/moderation/blocked-words.json';

/**
 * Checks a star name before it is saved and shown to everyone. The same rules run in the app
 * (for quick feedback) and on the server (where they are enforced).
 * It blocks rude or unkind words, links and social handles, and things that look like personal information.
 * No filter is perfect, so names can also be reported and hidden by the admin.
 */
export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

export const NAME_MIN = 2;
export const NAME_MAX = 24;

const rot13 = (text: string) => text.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't' };

function squash(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0134578@$!|+]/g, (c) => LEET[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(.)\1+/g, '$1');
}

const TERMS = (blocked as { rot13: string[] }).rot13.map((word) => squash(rot13(word)).replace(/[^a-z ]/g, ''));
/** Short list entries that are also ordinary words or names (Bob, as, but, x), so they are not blocked on their own. */
const SHORT_EXCEPTIONS = new Set(['as', 'but', 'bob', 'bw', 'sm', 'x', 'con', 'cons', 'wop', 'jap']);
/**
 * Everyday words that contain a listed term by accident. They are removed before matching.
 * Found by checking the 10,000 most common English words and common star words against the list.
 */
const ALLOWED_WORDS = new Set([
  'twinkle', 'twinkles', 'twinkling', 'twinkly', 'advertisement', 'advertisements', 'basement', 'endorsement', 'closer',
  'domestic', 'entities', 'quantities', 'specialist', 'specialists', 'therapist', 'therapists', 'wrapping', 'nigeria',
  'scunthorpe', 'cassandra', 'glasses', 'sussex', 'assassin', 'classic', 'grape', 'grapes', 'drape', 'escape', 'landscape',
].map(squash));
const LONG = TERMS.filter((term) => term.replace(/ /g, '').length >= 5).map((term) => term.replace(/ /g, ''));
const SHORT = new Set(TERMS.filter((term) => term.replace(/ /g, '').length < 5 && !term.includes(' ') && !SHORT_EXCEPTIONS.has(term)));

const LINKS = /@|https?|www\.|\.(com|net|org|io|co|gg|me|tv|app|xyz|ly)\b|discord|snapchat|\bsnap\b|insta(gram)?|tiktok|whats ?app|telegram|youtube|twitch|roblox|\bdm\b/i;
const PERSONAL = /\b(my (name|address|number|phone|school|house)|i live|lives at|call me|text me|message me|street|road|avenue|\bave\b|lane|apt|apartment|zip ?code|postcode|phone|password)\b/i;

export function checkStarName(raw: string): NameCheck {
  const name = String(raw ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (name.length < NAME_MIN) return { ok: false, reason: `Use at least ${NAME_MIN} letters.` };
  if (name.length > NAME_MAX) return { ok: false, reason: `Keep it to ${NAME_MAX} characters or fewer.` };
  if (!/^[\p{L}\p{M}0-9 '\u2019\-.!&]+$/u.test(name)) return { ok: false, reason: 'Use letters, numbers, spaces, and simple punctuation only.' };
  if (!/\p{L}/u.test(name)) return { ok: false, reason: 'Include at least one letter.' };
  if ((name.match(/\d/g) ?? []).length > 4) return { ok: false, reason: 'Too many numbers. Phone numbers and addresses can’t be star names.' };
  if (LINKS.test(name)) return { ok: false, reason: 'Links, emails, and social media names can’t be star names.' };
  if (PERSONAL.test(name)) return { ok: false, reason: 'Please leave out personal information like where you live or how to contact you.' };
  const tokens = squash(name).split(/[^a-z]+/).filter((token) => token && !ALLOWED_WORDS.has(token));
  const compact = tokens.join('');
  const rude = LONG.some((term) => compact.includes(term)) || tokens.some((token) => SHORT.has(token));
  if (rude) return { ok: false, reason: 'That name isn’t allowed. Try something kind.' };
  return { ok: true, name };
}
