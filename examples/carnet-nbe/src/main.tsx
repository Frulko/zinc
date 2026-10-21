// Carnet on Zinc, on Carnet's own code: the documents, the commands, the Markdown and the collaboration are the packages of
// github.com/Frulko/carnet (@nbe/core, @nbe/markdown, @nbe/collab, the labels of @nbe/dom), linked unchanged by ./link.sh; this
// app is the view, in zinc:ui, in place of @nbe/dom's. This file mounts it, wires the vault and the rooms, and runs the frame loop.
//
//   ./link.sh && zinc run .                       the first window serves, the next ones join it
//   CARNET_NAME=Ada zinc run .                     your name on the others' screens
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { LoroBlockStore, connect, createPresence, Message } from '@nbe/collab';
import { me, Page, Peer, pages, setOutputs, setCurrentPage, currentPage, focusedBlock, pageWithId, allPages, createPage,
  addRemotePage, deletePage, setPeerList } from './state';
import { openVault, pageChanged, stepVault } from './services/vault';
import { startSync, joinRoom, Transport, LINK_JOINED } from './services/sync';
import { PEER_COLORS, PEER_NAMES, COLOR_PAGE, PRESENCE_REFRESH_S } from './constants';
import { Sidebar } from './components/Sidebar';
import { SlashMenu, stepMenu } from './components/SlashMenu';
import { applyFocus, watchFocus, focusTitle } from './components/focus';
import { appRoot } from './components/root';
import { PageView, DropLine, watchDrags } from './pages/editor/PageView';

function App(): number {
  return <View ref={appRoot} className="flex-row h-full bg-[#ffffff]">
    <Sidebar />
    <PageView />
    <DropLine />
    <SlashMenu />
  </View>;
}

// ---- who I am: a random id, a name (CARNET_NAME, else picked at random) and the name's colour
const HEX = '0123456789abcdef';
const id = sys.randomBytes(4);
me.id = '';
for (const byte of id) me.id += HEX.charAt(byte >> 4) + HEX.charAt(byte & 15);
me.name = sys.env('CARNET_NAME') !== '' ? sys.env('CARNET_NAME') : PEER_NAMES[(id[0] + id[1]) % PEER_NAMES.length];
let tint = 0;
for (let i = 0; i < me.name.length; i++) tint = (tint * 31 + me.name.charCodeAt(i)) % 9973;
me.color = PEER_COLORS[tint % PEER_COLORS.length];
const css = (c: number): string => '#' + c.toString(16).padStart(6, '0');

// ---- the list of pages, shared: a Loro map (page id -> 1, or 0 once deleted) in a room of its own
const workspace = new LoroBlockStore();
const index = workspace.doc.getMap('pages');
function listPage(p: Page, live: boolean): void { if (index.get(p.id) !== (live ? 1 : 0)) { index.set(p.id, live ? 1 : 0); workspace.doc.commit(); } }
function readIndex(): void {
  for (const key of index.keys()) {
    const live = index.get(key) === 1, p = pageWithId(key);
    if (live && p === null) addRemotePage(key);
    else if (!live && p !== null) deletePage(p as Page);
  }
  if (currentPage() === null && pages().length > 0) setCurrentPage(pages()[0]);
}
workspace.doc.subscribe((e: any) => { if (e.by !== 'local') readIndex(); });

// ---- every page is a room: @nbe/collab's sync on its Loro document
setOutputs(pageChanged, (p: Page) => {
  listPage(p, true);
  joinRoom(`page:${p.id}`, (t: Transport) => connect(p.store, t));
}, (p: Page) => listPage(p, false));
joinRoom('workspace', (t: Transport) => connect(workspace, t));

// ---- presence: @nbe/collab's, in its own room; where my caret is goes out when it moves
let presence: any = null;
joinRoom('presence', (t: Transport) => {
  presence = createPresence(t, { id: me.id });
  const stop = presence.onChange((all: Record<string, any>) => {
    const list: Peer[] = [];
    for (const key of Object.keys(all)) {
      const s = all[key], p = new Peer(key, String(s.name ?? '?'), parseInt(String(s.color ?? '#999999').slice(1), 16));
      p.page = String(s.page ?? ''); p.block = String(s.block ?? ''); p.caret = Number(s.caret ?? -1); p.anchor = Number(s.anchor ?? -1);
      list.push(p);
    }
    setPeerList(list);
  });
  const joined = t.onMessage((m: Uint8Array) => { if (m[0] === Message.Signal) sent = ''; });   // someone came: they hear where I am
  sent = '';
  return () => { joined(); stop(); presence.leave(); presence = null; };
});
let sent = '', age = 0;
function stepPresence(dt: number): void {
  if (presence === null) return;
  age += dt;
  if (age >= PRESENCE_REFRESH_S) { age = 0; sent = ''; }   // a state not heard again expires (@nbe/collab: 30 s)
  const p = currentPage(), b = focusedBlock();
  const h = b === null ? -1 : b.ref.node;
  const state = { name: me.name, color: css(me.color), page: p === null ? '' : p.id, block: b === null ? '' : b.id,
    caret: h >= 0 ? ui.caretOf(h) : -1, anchor: h >= 0 ? ui.anchorOf(h) : -1 };
  const key = JSON.stringify(state);
  if (key === sent) return;
  sent = key;
  presence.set(state);
}

ui.onKey((e: ui.KeyEvent) => { if (e.primary && e.key === 'n') { const p = createPage(); setCurrentPage(p); focusTitle(p); e.preventDefault(); } });

function tick(dt: number): void {
  applyFocus();
  stepMenu(appRoot.node);
  stepPresence(dt);
  stepVault(dt, pageWithId, false);
}

// The window that serves (or works alone) reads the vault; one that joins gets the pages from it.
startSync((mode: number) => {
  if (mode === LINK_JOINED) return;
  openVault();
  if (allPages().length === 0) createPage();
  setCurrentPage(allPages()[0]);
});
watchFocus();
watchDrags();
render(App, COLOR_PAGE, tick);
