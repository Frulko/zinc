// Carnet on Zinc: a Notion-style block editor whose pages are Markdown files in a folder, edited live by everyone who opens
// it (each window is another person). This file mounts the app, wires the vault and the collaboration to the state, and runs
// the frame loop; what the app does is in state.ts, the components and the services.
//
//   zinc run examples/carnet                      the first window serves, the next ones join it
//   CARNET_NAME=Ada zinc run examples/carnet       your name on the others' screens
//   CARNET_JOIN=ws://192.168.1.20:7311 zinc run examples/carnet   join another machine (it runs with CARNET_LISTEN=0.0.0.0)
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { me, Peer, setOutputs, snapshot, presenceWire, applyRecord, applyPresence, dropPeers, knownPeers, pages, setCurrentPage,
  currentPage, focusedBlock, pageWithId, createPage } from './state';
import { Wire, W_HELLO, W_BYE, W_BLOCK, W_PAGE, encode, decode } from './wire';
import { openVault, pageChanged, stepVault } from './services/vault';
import { startSync, broadcast, SyncHooks, UPSTREAM } from './services/sync';
import { PEER_COLORS, PEER_NAMES, COLOR_PAGE } from './constants';
import { Sidebar } from './components/Sidebar';
import { SlashMenu, stepMenu } from './components/SlashMenu';
import { applyFocus, watchFocus, focusTitle } from './components/focus';
import { appRoot } from './components/root';
import { PageView, DropLine, watchDrags } from './pages/editor/PageView';

function App(): i32 {
  return <View ref={appRoot} className="flex-row h-full bg-[#ffffff]">
    <Sidebar />
    <PageView />
    <DropLine />
    <SlashMenu />
  </View>;
}

// ---- who I am: a random id, a name (CARNET_NAME, else picked at random) and the name's colour
const id = sys.randomBytes(4);
const HEX = '0123456789abcdef';
me.id = '';
for (const byte of id) me.id += HEX.charAt(byte >> 4) + HEX.charAt(byte & 15);
const pick = (id[0] + id[1]) % PEER_NAMES.length;
me.name = sys.env('CARNET_NAME') !== '' ? sys.env('CARNET_NAME') : PEER_NAMES[pick];
let tint: i32 = 0;
for (let i = 0; i < me.name.length; i++) tint = (tint * 31 + me.name.charCodeAt(i)) % 9973;
me.color = PEER_COLORS[tint % PEER_COLORS.length];   // from the name: a person keeps their colour
const mine = new Peer(me.id, me.name, me.color);

// ---- the collaboration: every change goes out, every message comes in
setOutputs((w: Wire) => broadcast(encode(w)), pageChanged);
const hooks = new SyncHooks();
hooks.receive = (text: string, link: i32) => {
  const w = decode(text);
  if (w === null) return;
  const m = w as Wire;
  if (m.k === W_BLOCK || m.k === W_PAGE) applyRecord(m);
  else if (m.k === W_HELLO) applyPresence(m, link);
  else if (m.k === W_BYE) dropPeers((p: Peer) => p.id === m.id);
};
hooks.opened = (link: i32) => {
  const out: string[] = [];
  for (const w of snapshot()) out.push(encode(w));
  out.push(encode(presenceWire(mine)));
  if (link !== UPSTREAM) for (const p of knownPeers()) out.push(encode(presenceWire(p)));   // the host introduces the others
  return out;
};
hooks.closed = (link: i32) => {
  const gone = dropPeers((p: Peer) => link === UPSTREAM || p.link === link);
  if (link === UPSTREAM) return;
  for (const g of gone) { const w = new Wire(); w.k = W_BYE; w.id = g; broadcast(encode(w)); }
};

// ---- my presence: where my caret is, sent when it moves
function stepPresence(): void {
  const p = currentPage(), b = focusedBlock();
  const h = b === null ? -1 : b.ref.node;
  const page = p === null ? '' : p.id, block = b === null ? '' : b.id;
  const caret = h >= 0 ? ui.caretOf(h) : -1, anchor = h >= 0 ? ui.anchorOf(h) : -1;
  if (page === mine.page && block === mine.block && caret === mine.caret && anchor === mine.anchor) return;
  mine.page = page; mine.block = block; mine.caret = caret; mine.anchor = anchor;
  broadcast(encode(presenceWire(mine)));
}

ui.onKey((e: ui.KeyEvent) => {
  if (e.primary && e.key === 'n') { const p = createPage(); setCurrentPage(p); focusTitle(p); e.preventDefault(); }
});

function tick(dt: number): void {
  applyFocus();
  stepMenu(appRoot.node);
  stepPresence();
  stepVault(dt, pageWithId, false);
}

openVault();
if (pages().length === 0) createPage();
setCurrentPage(pages()[0]);
watchFocus();
watchDrags();
startSync(hooks);
render(App, COLOR_PAGE, tick);
