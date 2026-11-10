import { render } from 'zinc:ui/solid';
import { useQuietTheme, setTheme, DARK } from 'zinc:ui/kit';
import { env } from 'zinc:sys';
import { App } from './App';
useQuietTheme('blue');
if (env('DASHBOARD_DARK') === '1') setTheme(DARK);
render(App, env('DASHBOARD_DARK') === '1' ? 0x121212 : 0xf2f2f2, null);
