import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { on } from 'zinc:system';
import { RescuePanel } from './pages/RescuePanel';
import { BACKGROUND } from './constants';
import { initialize, shutdown, makePlan, rehearse, scan } from './state';

ui.setScheme('light');
on('quit', (args: string[]) => shutdown());
sys.onSignal('SIGTERM', () => { shutdown(); sys.exit(0); });
sys.onSignal('SIGINT', () => { shutdown(); sys.exit(0); });
ui.onKey((e: ui.KeyEvent) => {
  if (e.primary && e.key === 'r') { scan(); e.handled = true; }
  if (e.primary && e.key === 'p') { makePlan(); e.handled = true; }
  if (e.primary && e.key === 'Enter') { rehearse(); e.handled = true; }
});
initialize();
render(RescuePanel, BACKGROUND, null);
