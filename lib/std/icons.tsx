// zinc:icons (ZN-374): the Lucide icon set (third_party/lucide, ISC). `<Icon name="heart" size={24} color={() => 0xff5a36} strokeWidth={2} />` draws an icon
// with zinc:svg; only the icons the project names are compiled in (zinc:icons/lucide is generated from `<Icon name="...">`, `icon('...')` and zinc.json
// "icons": ["a", "b"] or ["*"]). A name decided at run time must be listed in zinc.json.
import { Svg } from 'zinc:svg';
import { lucide, NAMES } from 'zinc:icons/lucide';

const cache = new Map<string, Svg>();

/** The parsed icon for this colour and stroke width (cached); null when the name was not compiled in. */
export function icon(name: string, color: i32 = 0x000000, strokeWidth: number = 2): Svg | null {
  const key = name + '/' + color + '/' + strokeWidth;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let text = lucide(name);
  if (text === '') return null;
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

export function Icon(p: { name: string; size?: number; color?: () => i32; strokeWidth?: number }): i32 {
  const size = p.size ?? 24;
  return <canvas style={{ width: size, height: size }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    const s = icon(p.name, p.color !== undefined ? (p.color as () => i32)() : 0x000000, p.strokeWidth ?? 2);
    if (s !== null) (s as Svg).draw(x, y, w, h, 255);
  }} />;
}
