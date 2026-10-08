// zinc:ui/nuxt's demo (ZN-357): the dashboard app (NUXT_SECTION=Home|Inbox|Customers|Settings|Components|Navigation), or one gallery alone with
// NUXT_PAGE=gallery | navigation. NUXT_SCHEME=dark starts dark; NUXT_OPEN=modal|slideover|menu|tooltip|toast opens an overlay of the gallery.
import { render } from 'zinc:ui/solid';
import { env } from 'zinc:sys';
import { theme, setColorMode, hex } from 'zinc:ui/nuxt';
import { Gallery } from './gallery';
import { openAtStart } from './overlays';
import { Navigation } from './navigation';
import { Dashboard, setSection } from './dashboard';

if (env('NUXT_SCHEME') === 'dark') setColorMode('dark');
if (env('NUXT_SECTION') !== '') setSection(env('NUXT_SECTION'));
const page = env('NUXT_PAGE');
function App(): i32 {
  if (page === 'gallery') return <View class={`w-full h-full overflow-auto bg-${hex(theme().bg)}`}><Gallery /></View>;
  if (page === 'navigation') return <View class={`w-full h-full overflow-auto bg-${hex(theme().bg)}`}><Navigation /></View>;
  return <View class={`w-full h-full bg-${hex(theme().bg)}`}><Dashboard /></View>;
}
let frames = 0;
render(App, 0xffffff, (dt: number) => { if (++frames === 2) openAtStart(env('NUXT_OPEN')); });
