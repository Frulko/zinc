// DISCORD_DEMO=viewer (tests/t1/discord_viewer.sh): the pictures of #general against the fake Discord, one of them sent from here (the upload
// path), then the viewer: it opens from the picture's rectangle, zooms with the wheel and pans, goes to the next picture and back, and closes
// with Escape, back into the picture. DISCORD_SHOTS=dir saves the frames of each step to look at.
import { quit, capture, width, height } from 'zinc:gfx';
import * as ui from 'zinc:ui';
import { env } from 'zinc:sys';
import { imageViewerOpen, imageViewerState } from 'zinc:ui/kit';
import { store, Message } from './state';
import { thumbs } from './components/Viewer';
import { picturesLoading, attachmentFailed } from './services/cdn';
import { CDN_BASE } from './constants';

const wait = (ms: number): Promise<void> => new Promise<void>((done: () => void) => { setTimeout(done, ms); });
function until(cond: () => boolean): Promise<void> {
  return new Promise<void>((done: () => void) => { const t = setInterval(() => { if (cond()) { clearInterval(t); done(); } }, 10); });
}
const shot = (name: string): void => { if (env('DISCORD_SHOTS') !== '') capture(`${env('DISCORD_SHOTS')}/${name}.png`); };
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;

export async function viewerSession(): Promise<void> {
  await until(() => store.stage === 'ready');
  store.selectGuild('200');
  store.selectChannel('302');
  await until(() => store.messages.get('302') !== undefined);
  store.typed('Here is the photo');
  await store.sendFiles([env('DISCORD_UPLOAD_FILE')]);
  const list = store.messages.get('302') as Message[];
  const sent = (): Message | null => { for (let i = list.length - 1; i >= 0; i--) if (list[i].content === 'Here is the photo') return list[i]; return null; };
  await until(() => { const m = sent(); return m !== null && !m.pending && m.attachments.length === 1 && m.attachments[0].url !== ''; });
  await wait(300);
  await until(() => picturesLoading() === 0);
  await wait(200);
  // a picture the CDN refuses (HTTP 404): the grey box turns into the error state, at the same size
  const gone = `${CDN_BASE}/removed/803/gone.png`;
  store.dispatch('MESSAGE_CREATE', { id: '990', channel_id: '302', author: { id: '101', username: 'grace', global_name: 'Grace', avatar: 'av101' },
    content: 'A picture that is gone', timestamp: '2026-10-30T09:50:00.000000+00:00', mentions: [],
    attachments: [{ id: '803', filename: 'gone.png', size: 5000, width: 160, height: 120, content_type: 'image/png', url: gone, proxy_url: '' }] });
  await wait(300);
  await until(() => picturesLoading() === 0 && attachmentFailed(gone));
  await wait(200);
  console.log(`refused picture: error state ${attachmentFailed(gone)}`);
  shot('error');
  shot('list');
  const mine = sent() as Message;
  const key = `${mine.id}/${mine.attachments[0].id}`;
  const t = thumbs.get(key);
  console.log(`thumbnail drawn ${t !== undefined && t.picture >= 0}, in the list ${t !== undefined && t.ref.current >= 0}`);
  if (t === undefined) { quit(); return; }
  const box = ui.screenBox(t.ref.current);
  ui.click(t.ref.current);
  console.log(`viewer open ${imageViewerOpen()}, picture ${imageViewerState()[0]}`);
  await wait(1); shot('grow');
  await wait(500); shot('open');
  const W = width(), H = height();
  ui.wheelAt(W / 2, H / 2, 5);
  await wait(100);
  console.log(`zoomed ${imageViewerState()[1] > 1.5}`);
  shot('zoom');
  ui.wheelAt(W / 2, H / 2, -20);
  console.log(`zoomed out ${near(imageViewerState()[1], 1)}`);
  ui.sendKey('ArrowLeft');
  await wait(600);
  console.log(`previous picture ${imageViewerState()[0]}`);
  shot('previous');
  ui.sendKey('ArrowRight');
  await wait(600);
  console.log(`next picture ${imageViewerState()[0]}`);
  ui.sendKey('Escape');
  await wait(1); shot('shrink');
  await wait(500);
  console.log(`closed ${!imageViewerOpen()}, thumbnail ${box[2]}x${box[3]}`);
  shot('closed');
  quit();
}
