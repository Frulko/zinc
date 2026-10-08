// zinc:ui/nuxt tokens (ZN-357.01): every semantic token in light and dark against the values of docs/reports/nuxt-ui-research.md §2.3 (nuxt/ui 4.11.3,
// src/runtime/index.css), the alias shades (500 light, 400 dark), a changed palette, the radius scale (§2.4) and the class helpers.
import { makeTheme, NuxtColors, NuxtTheme, hex, radius, rounded, theme, setColorMode, colorMode } from 'zinc:ui/nuxt';

let bad = 0;
function eq(what: string, got: string, want: string): void { if (got !== want) { bad++; console.log(`${what}: ${got}, want ${want}`); } }
function check(t: NuxtTheme, w: string[]): void {
  const got = [t.primary, t.textDimmed, t.textMuted, t.textToned, t.text, t.textHighlighted, t.textInverted, t.bg, t.bgMuted, t.bgElevated, t.bgAccented,
    t.bgInverted, t.border, t.borderMuted, t.borderAccented, t.borderInverted];
  const names = ['primary', 'text-dimmed', 'text-muted', 'text-toned', 'text', 'text-highlighted', 'text-inverted', 'bg', 'bg-muted', 'bg-elevated', 'bg-accented',
    'bg-inverted', 'border', 'border-muted', 'border-accented', 'border-inverted'];
  for (let i = 0; i < names.length; i++) eq(t.mode + ' ' + names[i], got[i], w[i]);
}
// the report's table, column by column (light hex, dark hex)
check(makeTheme('light', new NuxtColors()), ['#00c950', '#90a1b9', '#62748e', '#45556c', '#314158', '#0f172b', '#ffffff', '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0',
  '#0f172b', '#e2e8f0', '#e2e8f0', '#cad5e2', '#0f172b']);
check(makeTheme('dark', new NuxtColors()), ['#05df72', '#62748e', '#90a1b9', '#cad5e2', '#e2e8f0', '#ffffff', '#0f172b', '#0f172b', '#1d293d', '#1d293d', '#314158',
  '#ffffff', '#1d293d', '#314158', '#314158', '#ffffff']);
const light = makeTheme('light', new NuxtColors()), dark = makeTheme('dark', new NuxtColors());
eq('light error', light.error, '#fb2c36'); eq('dark warning', dark.warning, '#fdc700'); eq('light info', light.info, '#2b7fff'); eq('dark secondary', dark.secondary, '#51a2ff');
const c = new NuxtColors(); c.primary = 'blue';
eq('primary blue', makeTheme('light', c).primary, '#2b7fff');
eq('scale', light.scale('primary', 50), '#f0fdf4'); eq('neutral scale', dark.scale('neutral', 950), '#020618');
eq('radius', `${radius('xs')} ${radius('sm')} ${radius('md')} ${radius('lg')} ${radius('xl')} ${radius('2xl')} ${radius('3xl')}`, '2 4 6 8 12 16 24');
eq('rounded', rounded('md'), 'rounded-[6px]'); eq('hex', `bg-${hex(light.primary, 10)}`, 'bg-[#00c950]/10');
eq('signal light', theme().bg, '#ffffff'); setColorMode('dark'); eq('signal dark', theme().bg + ' ' + colorMode(), '#0f172b dark');
console.log(bad === 0 ? 'nuxt theme: ok' : `nuxt theme: ${bad} wrong`);
