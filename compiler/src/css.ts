// CSS support (UI-07): `import './app.css'` compiles each `.class { ... }` rule at build time into the same
// style tokens as the Tailwind-like classes, registered with zinc:ui's defineClass. `:focus` / `:active` rules
// become state variants. Unknown properties are build errors, like unknown classes.
const NAMED: Record<string, string> = { white: 'ffffff', black: '000000', red: 'ff0000', green: '008000', blue: '0000ff', gray: '808080', grey: '808080', orange: 'ffa500', yellow: 'ffff00', transparent: '' };

export class CssError extends Error {}

function color(v: string): string {
  v = v.trim().toLowerCase();
  if (v.startsWith('#')) { let h = v.slice(1); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return `[#${h.slice(0, 6)}]`; }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (m) return `[#${[m[1], m[2], m[3]].map(x => Number(x).toString(16).padStart(2, '0')).join('')}]`;
  if (v in NAMED) return NAMED[v] ? `[#${NAMED[v]}]` : 'transparent';
  throw new CssError(`unsupported color '${v}'`);
}
function px(v: string, basis = 16): number {
  v = v.trim();
  if (v.endsWith('px')) return parseFloat(v);
  if (v.endsWith('rem') || v.endsWith('em')) return parseFloat(v) * basis;
  if (v === '0') return 0;
  const n = parseFloat(v);
  if (Number.isNaN(n)) throw new CssError(`unsupported length '${v}'`);
  return n;
}
function box(prefix: string, v: string): string[] {
  const p = v.trim().split(/\s+/).map(x => Math.round(px(x)));
  const [t, r, b, l] = p.length === 1 ? [p[0], p[0], p[0], p[0]] : p.length === 2 ? [p[0], p[1], p[0], p[1]] : p.length === 3 ? [p[0], p[1], p[2], p[1]] : p;
  return [`${prefix}t-[${t}]`, `${prefix}r-[${r}]`, `${prefix}b-[${b}]`, `${prefix}l-[${l}]`];
}
const MAP_JUSTIFY: Record<string, string> = { 'flex-start': 'start', start: 'start', center: 'center', 'flex-end': 'end', end: 'end', 'space-between': 'between', 'space-around': 'around', 'space-evenly': 'evenly' };
const MAP_ALIGN: Record<string, string> = { 'flex-start': 'start', start: 'start', center: 'center', 'flex-end': 'end', end: 'end', stretch: 'stretch' };

function declToTokens(prop: string, value: string): string[] {
  const v = value.trim();
  switch (prop) {
    case 'display': return v === 'none' ? ['hidden'] : ['flex'];
    case 'flex-direction': return [v.startsWith('row') ? 'flex-row' : 'flex-col'];
    case 'flex-wrap': return v === 'wrap' ? ['flex-wrap'] : [];
    case 'flex': case 'flex-grow': return parseFloat(v) > 0 ? ['grow'] : ['grow-0'];
    case 'justify-content': return [`justify-${MAP_JUSTIFY[v] ?? 'start'}`];
    case 'align-items': return [`items-${MAP_ALIGN[v] ?? 'stretch'}`];
    case 'gap': return [`gap-[${Math.round(px(v))}]`];
    case 'padding': return box('p', v);
    case 'margin': return box('m', v);
    case 'padding-top': case 'padding-right': case 'padding-bottom': case 'padding-left':
      return [`p${prop[8]}-[${Math.round(px(v))}]`];
    case 'margin-top': case 'margin-right': case 'margin-bottom': case 'margin-left':
      return [`m${prop[7]}-[${Math.round(px(v))}]`];
    case 'width': case 'height': {
      const k = prop[0];
      if (v === '100%') return [`${k}-full`];
      if (v.endsWith('%')) return [`${k}-${parseFloat(v)}/100`];
      return [`${k}-[${Math.round(px(v))}]`];
    }
    case 'background': case 'background-color': {
      const g = /linear-gradient\(\s*to\s+(top|bottom|left|right)\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/.exec(v);
      if (g) return [`bg-gradient-to-${g[1][0]}`, `from-${color(g[2])}`, `to-${color(g[3])}`];
      return [`bg-${color(v)}`];
    }
    case 'color': return [`text-${color(v)}`];
    case 'font-size': return [`text-[${Math.round(px(v))}px]`];
    case 'font-family': { const f = v.split(',')[0].trim().replace(/^["']|["']$/g, ''); return [/mono/i.test(f) ? 'font-mono' : /^(sans-serif|system-ui|inter)$/i.test(f) ? 'font-sans' : `font-[${f}]`]; }
    case 'font-weight': return [v === 'bold' || parseInt(v) >= 600 ? 'font-bold' : 'font-normal'];
    case 'letter-spacing': { const em = v.endsWith('em') ? parseFloat(v) : px(v) / 16; return [em < 0 ? 'tracking-tight' : em >= 0.1 ? 'tracking-widest' : em >= 0.05 ? 'tracking-wider' : em > 0 ? 'tracking-wide' : 'font-normal']; }
    case 'text-align': return [`text-${v === 'center' ? 'center' : v === 'right' || v === 'end' ? 'right' : 'left'}`];
    case 'line-height': return [`leading-[${Math.round(px(v))}]`];
    case 'border-radius': return [v === '50%' || v === '9999px' ? 'rounded-full' : `rounded-[${Math.round(px(v))}]`];
    case 'border': {
      const parts = v.split(/\s+/);
      const out: string[] = [];
      for (const p of parts) { if (/^[\d.]+(px)?$/.test(p)) out.push(`border-[${Math.round(px(p))}]`); else if (p !== 'solid') out.push(`border-${color(p)}`); }
      return out;
    }
    case 'border-color': return [`border-${color(v)}`];
    case 'border-width': return [`border-[${Math.round(px(v))}]`];
    case 'box-shadow': return [v === 'none' ? 'shadow-none' : 'shadow-md'];
    case 'opacity': return [`opacity-${Math.round(parseFloat(v) * 100)}`];
    case 'position': return v === 'absolute' ? ['absolute'] : [];
    case 'top': case 'left': case 'right': case 'bottom': return [`${prop}-[${Math.round(px(v))}]`];
    case 'overflow': return v === 'hidden' ? ['overflow-hidden'] : [];
    case 'transition': { const ms = /(\d+)ms/.exec(v) ?? /([\d.]+)s/.exec(v); return ['transition-colors', ...(ms ? [`duration-${Math.round(parseFloat(ms[1]) * (ms[0].endsWith('ms') ? 1 : 1000))}`] : [])]; }
  }
  throw new CssError(`unsupported CSS property '${prop}'`);
}

/** Parses a stylesheet into class name -> token list. */
export function compileCss(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const body = text.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = m[2].split(';').map(d => d.trim()).filter(Boolean);
    for (const sel of m[1].split(',').map(x => x.trim())) {
      const s = /^\.([A-Za-z_][\w-]*)(?::(focus|active|hover))?$/.exec(sel);
      if (!s) throw new CssError(`unsupported selector '${sel}' (use .class or .class:focus / :active)`);
      const list = out.get(s[1]) ?? [];
      for (const d of decls) {
        const i = d.indexOf(':');
        for (const t of declToTokens(d.slice(0, i).trim().toLowerCase(), d.slice(i + 1))) list.push(s[2] ? `${s[2]}:${t}` : t);
      }
      out.set(s[1], list);
    }
  }
  return out;
}
