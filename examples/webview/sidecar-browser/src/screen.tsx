// The tablet's side: the same program started again by the Mac's window with ZINC_DISPLAY=sidecar. It shows one web view over the whole
// screen; touches on the tablet go to the page (a pinch zooms it). Its orders come on stdin, one a line ("go <url>", "back", "forward",
// "reload", "zoom <factor>", "key <code>\t<mods>\t<text>": the Mac's keyboard), and it tells what the page does on stdout ("load <url>").
import { render } from 'zinc:ui/solid';
import { NativeView } from 'zinc:ui';
import * as sys from 'zinc:sys';
import * as webview from 'zinc:webview';
import { START_URL } from './constants';

function say(line: string): void { sys.write(line + '\n'); }

function obey(web: webview.WebView, line: string): void {
  if (line.startsWith('go ')) web.navigate(line.substring(3));
  else if (line === 'back') web.eval('history.back()');
  else if (line === 'forward') web.eval('history.forward()');
  else if (line === 'reload') web.eval('location.reload()');
  else if (line.startsWith('zoom ')) web.setZoom(parseFloat(line.substring(5)));
  else if (line.startsWith('key ')) {
    const f = line.substring(4).split('\t');
    if (f.length === 3) web.key(f[0], f[2], parseInt(f[1]));
  }
}

export function runScreen(): void {
  const web = webview.create({ url: START_URL, html: '', x: 0, y: 0, w: 1, h: 1 });
  web.onLoad((url: string) => { say('load ' + url); });
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
