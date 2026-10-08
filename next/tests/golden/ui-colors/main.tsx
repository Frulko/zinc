// Colour tokens (ZN-259): 32 strings, accepted or refused, with the colour and alpha they set. Hex digits only: the printed values are integers, so f32 and fixed-point profiles must agree.
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
const toks = [
  'bg-white', 'bg-black', 'bg-transparent', 'bg-slate-500', 'bg-indigo-600', 'bg-white/50', 'bg-black/25', 'bg-[#ff8800]', 'bg-[#f80]', 'bg-[#ff880080]', 'bg-[rgb(255,136,0)]',
  'bg-[rgba(255,136,0,0.5)]', 'bg-[rgb(10,20,30)]', 'bg-[hsl(0,100%,50%)]', 'bg-[hsl(120,100%,25%)]', 'bg-[hsl(240,50%,50%)]', 'bg-[hsla(30,100%,50%,0.25)]', 'bg-[hsl(360,0%,100%)]',
  'text-white', 'text-white/60', 'text-slate-900/80', 'text-[#336699]', 'text-[rgb(1,2,3)]', 'text-[hsl(200,60%,40%)]', 'text-current',
  'border-red-500', 'border-white/20', 'border-[rgba(0,0,0,0.5)]', 'border-current',
  'bg-[rgb(1,2)]', 'bg-[hsl(1)]', 'bg-[#12]', 'bg-[xyz(1,2,3)]', 'text-nocolor-500', 'bg-red-5000',
];
const h = ui.createNode(ui.VIEW);
const DIGITS = '0123456789abcdef';
function byte(v: i32): string { return DIGITS.charAt((v >> 4) & 15) + DIGITS.charAt(v & 15); }
function hex(v: i32): string { return v < 0 ? String(v) : byte(v >> 16 & 255) + byte(v >> 8 & 255) + byte(v & 255); }
for (const t of toks) {
  ui.setClass(h, '');
  const ok = ui.isKnownClass(t);
  ui.setClass(h, ok ? t : '');
  const n = ui.inspectNode(h);
  if (n === null) continue;
  console.log(t, ok, 'bg', hex(n.bg), n.bgAlpha, 'fg', hex(n.fg), n.fgAlpha, 'border', hex(n.borderColor), n.borderAlpha);
}
quit();
