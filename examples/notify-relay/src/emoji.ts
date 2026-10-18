// Turns the emoji sequences of a string into PNGs (Apple Color Emoji, rendered locally on the Mac) so the tablet does not need
// a colour-emoji font. Returns { text, images } where `text` has each emoji replaced by a placeholder '\uFFFC' (object
// replacement character) and `images` holds the PNG for each placeholder in order.
import * as mac from 'zinc:notifymac';
import { base64Encode } from 'zinc:web';

// a flag (two regional indicators), a keycap, or a pictograph with its skin tone, variation selectors and ZWJ parts (families, professions)
const EMOJI_RE = /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\uFE0E)*(?:\u200D\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\uFE0E)*)*)/gu;

export function extract(s: string): { text: string; images: string[] } {
  const images: string[] = [];
  const text = s.replace(EMOJI_RE, (m: string) => {
    const png = mac.emojiPng(m, 64);
    if (png.length === 0) return m;   // could not render: keep the character
    images.push(base64Encode(png));
    return '\uFFFC';
  });
  return { text, images };
}
