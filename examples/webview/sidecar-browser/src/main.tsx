// sidecar-browser: a web view streamed to a tablet. The window is a small browser; "Stream to ..." starts this program again with its
// screen on the tablet (display-sidecar: an Android over adb, an iPad over USB, the Sidecar app open on it), and the window becomes the
// tablet's remote: what is typed in its address bar opens on the tablet.
//   zinc run examples/webview/sidecar-browser
// SIDECAR_BROWSER_DEMO=<host> scripts a run: stream to that screen, then type an address on the Mac and open it on the tablet,
// and quit 12 s after the tablet is ready (ZINC_HEADLESS=1 ZINC_FRAMES=1000000000 ZINC_SHOT=mac.png: the window's last frame).
import { render } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import { quit } from 'zinc:gfx';
import { ROLE_ENV, ROLE_SCREEN } from './constants';
import { runScreen } from './screen';
import { Console } from './console';
import { startStream, whenReady, setTyped, go } from './state';

if (sys.env(ROLE_ENV) === ROLE_SCREEN) runScreen();
else {
  render(Console, 0x020617, null);
  const host = sys.env('SIDECAR_BROWSER_DEMO');
  if (host !== '') {
    whenReady(() => { setTimeout(() => { setTyped('openstreetmap.org'); go(); console.log('sidecar-browser: typed openstreetmap.org'); }, 4000);
      setTimeout(() => { quit(); }, 12000); });
    startStream(host);
  }
}
