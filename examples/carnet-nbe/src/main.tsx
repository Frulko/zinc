// Carnet on Zinc, on Carnet's own code: the documents, the commands, the Markdown and the collaboration are the packages of
// github.com/Frulko/carnet (@nbe/core, @nbe/markdown, @nbe/collab, the labels of @nbe/dom), linked unchanged by ./link.sh; this
// app is the view, in zinc:ui, in place of @nbe/dom's, and an Obsidian-like vault of Markdown files. This file mounts it, wires
// the vault, the index and the rooms, and runs the frame loop.
//
//   ./link.sh && zinc run .                       the first window serves, the next ones join it
//   CARNET_NAME=Ada zinc run .                     your name on the others' screens
import { render, createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { LoroBlockStore, connect, createPresence, Message } from '@nbe/collab';
import { me, Page, Peer, pages, setCurrentPage, currentPage, focusedBlock, pageWithId, pageAt, createPage, addRemotePage, deletePage,
  setPagePath, addFolder, removeFolder, setPeerList, onPageOpened, onPageMoved, onPageRemoved, onFolderAdded, onFolderRemoved, vaultName,
  setVaultName } from './state';
import { useVault, startVault, stepVault } from './services/vault';
import { startSync, joinRoom, Transport, LINK_JOINED } from './services/sync';
import { PEER_COLORS, PEER_NAMES, COLOR_PAGE, PRESENCE_REFRESH_S } from './constants';
import { Sidebar, showSearch, stepSidebar } from './components/Sidebar';
import { Prompt, openSwitcher, stepPrompt } from './components/Prompt';
import { stepLinks } from './components/Block';
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
    <Prompt />
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

// ---- the vault's notes and folders, shared: a Loro map in a room of its own ('n:' + note id -> its path, '' once deleted;
// 'd:' + folder -> 1, 0 once gone; 'name' -> the vault's name). Every window keeps its notes in step with it; the one that serves
// moves the files to match.
const workspace = new LoroBlockStore();
const index = workspace.doc.getMap('vault');
function put(key: string, value: string | number): void { if (index.get(key) !== value) { index.set(key, value); workspace.doc.commit(); } }
function readIndex(): void {
  for (const key of index.keys()) {
    const v = index.get(key);
    if (key === 'name') { setVaultName(String(v)); continue; }
    if (key.startsWith('d:')) { if (v === 1) addFolder(key.slice(2)); else removeFolder(key.slice(2)); continue; }
    const path = String(v), p = pageWithId(key.slice(2));
    if (path !== '' && p === null) addRemotePage(key.slice(2), path);
    else if (path === '' && p !== null) deletePage(p as Page);
    else if (p !== null) setPagePath(p as Page, path);
  }
  if (currentPage() === null && pages().length > 0) setCurrentPage(pages()[0]);
}
workspace.doc.subscribe((e: any) => { if (e.by !== 'local') readIndex(); });
onPageOpened((p: Page) => {
  put(`n:${p.id}`, p.path());
  joinRoom(`page:${p.id}`, (t: Transport) => connect(p.store, t));   // every note is a room: @nbe/collab's sync on its Loro document
});
onPageMoved((p: Page, from: string) => put(`n:${p.id}`, p.path()));
onPageRemoved((p: Page) => put(`n:${p.id}`, ''));
onFolderAdded((path: string) => put(`d:${path}`, 1));
onFolderRemoved((path: string) => put(`d:${path}`, 0));
createEffect(() => { if (vaultName() !== '') put('name', vaultName()); });
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

// Obsidian's keys: Cmd+N a new note, Cmd+O the quick switcher, Cmd+Shift+F the search
ui.onKey((e: ui.KeyEvent) => {
  if (!e.primary) return;
  if (e.key === 'n' && !e.shift) { const p = createPage(''); setCurrentPage(p); focusTitle(p); }
  else if (e.key === 'o' && !e.shift) openSwitcher();
  else if ((e.key === 'f' || e.key === 'F') && e.shift) showSearch();
  else return;
  e.preventDefault();
});

function tick(dt: number): void {
  applyFocus();
  stepMenu(appRoot.node);
  stepPrompt();
  stepSidebar();
  stepLinks();
  stepPresence(dt);
  stepVault(dt);
}

// The window that serves (or works alone) reads the vault; one that joins gets the notes from it.
startSync((mode: number) => {
  if (mode === LINK_JOINED) return;
  useVault(startVault(), false);
});
watchFocus();
watchDrags();
render(App, COLOR_PAGE, tick);
