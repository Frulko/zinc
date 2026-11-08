// zinc:icons (ZN-374): the Lucide icon set (third_party/lucide, ISC). `<Icon name="heart" size={24} color={() => 0xff5a36} strokeWidth={2} />` draws an icon
// with zinc:svg; only the icons the project names are compiled in (zinc:icons/lucide is generated from `<Icon name="...">`, `icon('...')` and zinc.json
// "icons": ["a", "b"] or ["*"]). A name decided at run time must be listed in zinc.json.
import { Svg } from 'zinc:svg';
import { EINK, einkSnap } from 'zinc:ui';
import { lucide, NAMES, UNKNOWN } from 'zinc:icons/lucide';

const cache = new Map<string, Svg>();
const missing = new Set<string>();   // the names already warned about (the compiler warned about UNKNOWN): once each, not once a frame
for (const n of UNKNOWN) missing.add(n);

/** The parsed icon for this colour and stroke width (cached); null when the name was not compiled in. */
export function icon(name: string, color: i32 = 0x000000, strokeWidth: number = 2): Svg | null {
  const key = name + '/' + color + '/' + strokeWidth;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let text = lucide(name);
  if (text === '') {
    if (!missing.has(name)) { missing.add(name); console.error(`zinc: warning U0001: icon '${name}' is not in this program: list it in zinc.json "icons", or check its Lucide name (zinc explain U0001)`); }
    return null;
  }
  const digits = '0123456789abcdef';
  let hex = '';
  for (let k = 20; k >= 0; k -= 4) hex += digits.charAt((color >> k) & 15);
  text = text.replace('stroke="currentColor"', 'stroke="#' + hex + '"').replace('stroke-width="2"', 'stroke-width="' + strokeWidth + '"');
  const s = new Svg(text);
  cache.set(key, s);
  return s;
}

/** The names compiled into this program. */
export function iconNames(): string[] { return NAMES; }

/** A lazy canvas: an icon is drawn when the frame is painted for another reason, so a screen of icons stays idle (no repaint every frame); the
 *  parsed icon of the last colour is kept, so a repaint allocates nothing. */
export function Icon(p: { name: string; size?: number; color?: () => i32; strokeWidth?: number }): i32 {
  const size = p.size ?? 24;
  let lastColor: i32 = -1, last: Svg | null = null;
  return <Canvas style={{ width: size, height: size, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    let c = p.color !== undefined ? (p.color as () => i32)() : 0x000000;
    if (EINK) c = einkSnap(c as u32) as i32;   // the panel's palette, as every other command of zinc:ui (ZN-929)
    if (c !== lastColor || last === null) { last = icon(p.name, c, p.strokeWidth ?? 2); lastColor = c; }
    const s = last;
    if (s !== null) (s as Svg).draw(x, y, w, h, 255);
  }} />;
}
