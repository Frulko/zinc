// The tablet's side: the same program started again by the Mac's window with ZINC_DISPLAY=sidecar. It shows one web view over the whole
// screen; touches on the tablet go to the page (a pinch zooms it). Its orders come on stdin, one a line ("go <url>", "back", "forward",
// "reload", "zoom <factor>", "key <code>\t<mods>\t<text>": the Mac's keyboard, "ptr <kind> <x> <y> <dx> <dy>": the Mac's mouse, x and y from 0
// to 1 over the screen), and it tells what the page does on stdout ("load <url>").
import { render } from 'zinc:ui/solid';
import { NativeView } from 'zinc:ui';
import * as sys from 'zinc:sys';
import * as webview from 'zinc:webview';
import { width, height } from 'zinc:gfx';
import { START_URL } from './constants';

// In each page: the shape its CSS asks for at a place (x and y from 0 to 1 of its viewport), told when it changes. Asked by place: WebKit gives a window
// that is not active no hover (no mousemove, no :hover), and an off-screen window must stay inactive not to take the focus.
const CURSOR_WATCH = `window.__zincCursorAt = (function () {
  var last = -1;
  return function (x, y) {
    var e = document.elementFromPoint(x * innerWidth, y * innerHeight);
    if (!e) return;
    var c = getComputedStyle(e).cursor;
    var s = c === 'pointer' ? 2 : c === 'text' || (c === 'auto' && (e.isContentEditable || e.matches('input, textarea'))) ? 1 : 0;
    if (s !== last) { last = s; window.zinc.postMessage('cursor ' + s); }
  };
})();`;
const SHAPE_EVERY_MS = 66;   // how often a moving pointer asks the page for its shape
let shapeAskedAt = 0;

function say(line: string): void { sys.write(line + '\n'); }

function obey(web: webview.WebView, line: string): void {
  if (line.startsWith('go ')) web.navigate(line.substring(3));
  else if (line === 'back') web.eval('history.back()');
  else if (line === 'forward') web.eval('history.forward()');
  else if (line === 'reload') web.eval('location.reload()');
  else if (line.startsWith('zoom ')) web.setZoom(parseFloat(line.substring(5)));
  else if (line.startsWith('ptr ')) {
    const f = line.substring(4).split(' ');
    if (f.length !== 5) return;
    web.pointer(parseFloat(f[1]) * width(), parseFloat(f[2]) * height(), parseInt(f[0]), parseFloat(f[3]), parseFloat(f[4]));
    const now = Date.now();
    if (now - shapeAskedAt >= SHAPE_EVERY_MS) {
      shapeAskedAt = now;
      web.eval(`if (window.__zincCursorAt) __zincCursorAt(${f[1]}, ${f[2]})`);
    }
  }
  else if (line.startsWith('key ')) {
    const f = line.substring(4).split('\t');
    if (f.length === 3) web.key(f[0], f[2], parseInt(f[1]));
  }
}

export function runScreen(): void {
  const web = webview.create({ url: START_URL, html: '', x: 0, y: 0, w: 1, h: 1 });
  web.onLoad((url: string) => { web.eval(CURSOR_WATCH); say('load ' + url); });
  web.onMessage((m: string) => { if (m.startsWith('cursor ')) web.cursor(parseInt(m.substring(7))); });
  let pending = '';
  sys.onStdin((chunk: string) => {
    if (chunk === '') sys.exit(0);   // the Mac's window closed the link: the stream ends with it
    pending += chunk;
    let nl = pending.indexOf('\n');
    while (nl >= 0) {
      obey(web, pending.substring(0, nl));
      pending = pending.substring(nl + 1);
      nl = pending.indexOf('\n');
    }
  });
  render(() => <View className="flex-col h-full bg-black"><NativeView className="grow" view={web} /></View>, 0x000000, null);
  say('ready');
}
