// zinc:ui/nuxt's demo (ZN-357): the gallery of every component now; the dashboard app lands with ZN-357.05. NUXT_SCHEME=dark starts dark.
import { render } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
import { theme, setColorMode, hex } from 'zinc:ui/nuxt';
import { Gallery } from './gallery';
import { openAtStart } from './overlays';

if (env('NUXT_SCHEME') === 'dark') setColorMode('dark');
function App(): i32 {
  return <View class={`w-full h-full overflow-auto bg-${hex(theme().bg)}`}><Gallery /></View>;
}
let frames = 0;
render(App, 0xffffff, (dt: number) => { if (++frames === 2) openAtStart(env('NUXT_OPEN')); });
