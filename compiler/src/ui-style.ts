// Shared by the JSX compiler and UI document validator. No browser/Node dependencies.
export type StyleValue = string | number;
export type StyleObject = Record<string, StyleValue>;
export interface StyleOp { key: string; value: number }

const aliases: Record<string, string[]> = {
  padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
  paddingHorizontal: ['paddingLeft', 'paddingRight'], paddingVertical: ['paddingTop', 'paddingBottom'],
  margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
  marginHorizontal: ['marginLeft', 'marginRight'], marginVertical: ['marginTop', 'marginBottom'],
  bg: ['backgroundColor'], radius: ['borderRadius'], x: ['translateX'], y: ['translateY'], flex: ['grow'], flexGrow: ['grow'],
};
const numeric = new Set(('width height gap paddingTop paddingRight paddingBottom paddingLeft marginTop marginRight marginBottom marginLeft ' +
  'top right bottom left opacity translateX translateY scale backgroundColor color borderColor borderWidth borderRadius ' +
  'borderTopWidth borderRightWidth borderBottomWidth borderLeftWidth fontSize lineHeight letterSpacing grow hidden lazy').split(' '));
const enums: Record<string, Record<string, number>> = {
  flexDirection: { column: 0, row: 1 }, flexWrap: { nowrap: 0, wrap: 1 },
  justifyContent: { 'flex-start': 0, start: 0, center: 1, 'flex-end': 2, end: 2, 'space-between': 3, 'space-around': 4, 'space-evenly': 5 },
  alignItems: { 'flex-start': 0, start: 0, center: 1, 'flex-end': 2, end: 2, stretch: 3 },
  position: { relative: 0, static: 0, absolute: 1 }, display: { flex: 0, none: 1 },
  overflow: { visible: 0, hidden: 1, auto: 2, scroll: 2 },
  fontWeight: { normal: 0, '400': 0, '500': 0, bold: 1, '600': 1, '700': 1, '800': 1, '900': 1 },
  textAlign: { left: 0, start: 0, center: 1, right: 2, end: 2 },
};
export function styleName(name: string): string { return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()); }
export function numericStyleKeys(name: string): string[] {
  name = styleName(name);
  if (Object.hasOwn(aliases, name)) return aliases[name];
  if (numeric.has(name)) return [name];
  throw new Error(`style '${name}' needs a supported literal value (or is unsupported)`);
}
const colors: Record<string, string> = { black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', gray: '808080', grey: '808080', orange: 'ffa500', yellow: 'ffff00' };
export function styleEntry(name: string, value: StyleValue): StyleOp[] {
  name = styleName(name);
  const op = (key: string, value: number): StyleOp => ({ key, value });
  if (name === 'border') {
    if (value === 'none') return [op('borderWidth', 0)];
    const parts = String(value).match(/^(\S+)\s+solid\s+(.+)$/);
    if (!parts) throw new Error('border expects <width> solid <color>');
    return [...styleEntry('borderWidth', parts[1]), ...styleEntry('borderColor', parts[2])];
  }
  if (name === 'background') name = 'backgroundColor';
  if (Object.hasOwn(enums, name)) {
    const v = enums[name][String(value)];
    if (!Object.hasOwn(enums[name], String(value))) throw new Error(`unsupported ${name}: ${value}`);
    return [op(name === 'display' ? 'hidden' : name, v)];
  }
  if (name === 'fontFamily') {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(value)) throw new Error('fontFamily needs a font asset name');
    const family = /^(sans-serif|system-ui|Inter)$/i.test(value) ? 'sans' : /^(monospace)$/i.test(value) ? 'mono' : value;
    return [op('@font-' + (['sans', 'mono'].includes(family) ? family : `[${family}]`), 0)];
  }
  const keys = numericStyleKeys(name);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > (keys[0].endsWith('Color') || keys[0] === 'color' ? 0xffffff : 1000000)) throw new Error(`${name} is out of range`);
    if ((keys[0].endsWith('Color') || keys[0] === 'color') && (!Number.isInteger(value) || value < -1)) throw new Error(`${name} needs an integer RGB color`);
    if (name === 'fontSize' && (value < 1 || value > 256)) throw new Error('fontSize must be 1..256');
    if (name === 'opacity' && (value < 0 || value > 1)) throw new Error('opacity must be 0..1');
    return [...keys.map(k => op(k, value as number)), ...(keys[0] === 'backgroundColor' ? [op('backgroundAlpha', 255)] : [])];
  }
  if (keys[0].endsWith('Color') || keys[0] === 'color') {
    if (value === 'transparent') {
      if (keys[0] !== 'backgroundColor') throw new Error(`transparent ${name} is unsupported`);
      return [op('backgroundColor', -1), op('backgroundAlpha', 0)];
    }
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(value);
    if (rgb) {
      const channels = rgb.slice(1, 4).map(Number), alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
      if (channels.some(v => v > 255) || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new Error('invalid rgb/rgba color');
      value = '#' + channels.map(v => v.toString(16).padStart(2, '0')).join('') + (alpha === 1 ? '' : Math.round(alpha * 255).toString(16).padStart(2, '0'));
    }
    let hex = Object.hasOwn(colors, value.toLowerCase()) ? colors[value.toLowerCase()] : value.replace(/^#/, '');
    if (/^[\da-f]{3,4}$/i.test(hex)) hex = [...hex].map(c => c + c).join('');
    if (!/^[\da-f]{6}([\da-f]{2})?$/i.test(hex)) throw new Error(`unsupported color '${value}' (use a name or #RGB/#RRGGBB/#RRGGBBAA)`);
    if (hex.length === 8 && keys[0] !== 'backgroundColor') throw new Error(`alpha is only supported on backgroundColor`);
    return [op(keys[0], parseInt(hex.slice(0, 6), 16)), ...(keys[0] === 'backgroundColor' ? [op('backgroundAlpha', hex.length === 8 ? parseInt(hex.slice(6), 16) : 255)] : [])];
  }
  if ((name === 'width' || name === 'height') && value === 'auto') return [op(name, -1)];
  if ((name === 'width' || name === 'height') && /^\d+(\.\d+)?%$/.test(value)) {
    const percent = parseFloat(value); if (!Number.isFinite(percent) || percent > 1000000) throw new Error('percentage out of range');
    return percent === 0 ? [op(name, 0)] : [op(name + 'Percent', percent / 100)];
  }
  if (/^-?(?:\d+\.?\d*|\.\d+)(px|rem|em)?$/.test(value)) {
    const n = parseFloat(value) * (/r?em$/.test(value) ? 16 : 1);
    return styleEntry(name, n);
  }
  if ((name === 'padding' || name === 'margin') && value.trim().split(/\s+/).length <= 4) {
    const parts = value.trim().split(/\s+/);
    if (parts.length > 1) {
      const [t, r = t, b = t, l = r] = parts;
      return keys.flatMap((k, i) => styleEntry(k, [t, r, b, l][i]));
    }
  }
  throw new Error(`unsupported ${name}: '${value}'`);
}
