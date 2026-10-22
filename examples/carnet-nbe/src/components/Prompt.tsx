// A prompt over the app, as Obsidian's: a field and the choices it filters (↑↓ choose, Enter picks, Escape or a click outside
// closes). The quick switcher (Cmd+O) is one: the notes whose name has the letters typed, in order, and Enter on a name no note
// has makes that note. The vault switcher is another (Obsidian's "Open another vault"): the folders opened before and "Open folder
// as vault...", the system's folder picker. The name of a new folder is asked with one too.
import { createSignal, createMemo, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as fs from 'zinc:fs';
import { Icon } from 'zinc:icons';
import * as dialog from 'zinc:system/dialog';
import { slugify } from '@nbe/markdown';
import { useVault, recentVaults, vaultDir } from '../services/vault';
import { linkMode, linkAddress, LINK_JOINED } from '../services/sync';
import { Page, pages, titleOf, folderOf, stemOf, setCurrentPage, openLink, addFolder } from '../state';
import { COLOR_TEXT_SECONDARY } from '../constants';

class Choice {
  label: string; detail: string; icon: string; run: () => void;
  constructor(label: string, detail: string, icon: string, run: () => void) { this.label = label; this.detail = detail; this.icon = icon; this.run = run; }
}
const ROW_HEIGHT: i32 = 40, MAX_ROWS: i32 = 10;
let choicesFor: (q: string) => Choice[] = () => [];
const [shown, setShown] = createSignal<boolean>(false);
const [query, setQuery] = createSignal<string>('');
const [cursor, setCursor] = createSignal<i32>(0);
const [hint, setHint] = createSignal<string>('');
const choices = createMemo<Choice[]>(() => shown() ? choicesFor(query()) : [], []);
const field = createNodeRef(), card = createNodeRef();
let wantFocus = false;

function openPrompt(placeholder: string, f: (q: string) => Choice[]): void {
  choicesFor = f; setHint(placeholder); setQuery(''); setCursor(0); setShown(true);
  if (field.node >= 0) ui.setValue(field.node, '');
  wantFocus = true;
}
function close(): void { setShown(false); }
/** Called once per frame: the field takes the caret once it is shown. */
export function stepPrompt(): void { if (wantFocus && field.node >= 0) { wantFocus = false; ui.focusNode(field.node); } }

/** Where the letters of `q` are found in order in `name` (-1: not all): a name holding `q` whole comes first. */
function score(name: string, q: string): number {
  const whole = name.indexOf(q);
  if (whole >= 0) return whole;
  let at = 0;
  for (let i = 0; i < q.length; i++) { at = name.indexOf(q.charAt(i), at); if (at < 0) return -1; at++; }
  return 1000 + at;
}
/** Cmd+O: open a note by its name, or make it. */
export function openSwitcher(): void {
  openPrompt('Find or create a note...', (q: string): Choice[] => {
    const t = q.trim().toLowerCase(), found: Array<[number, Page]> = [];
    for (const p of pages()) {
      const byTitle = score(titleOf(p).toLowerCase(), t), byPath = score(p.path().toLowerCase(), t);
      if (byTitle >= 0) found.push([byTitle, p]); else if (byPath >= 0) found.push([byPath + 2000, p]);
    }
    found.sort((a: [number, Page], b: [number, Page]) => a[0] - b[0]);
    const out = found.slice(0, 12).map((x: [number, Page]) => new Choice(titleOf(x[1]), folderOf(x[1].path()), 'file-text', () => setCurrentPage(x[1])));
    if (t !== '' && !pages().some((p: Page) => titleOf(p).toLowerCase() === t)) out.push(new Choice(q.trim(), 'Enter to create', 'plus', () => openLink(q.trim(), null)));
    return out;
  });
}
async function pickVault(): Promise<void> {
  const o = new dialog.OpenOptions();
  o.title = 'Open folder as vault'; o.directory = true;
  const picked = await dialog.open(o);
  if (picked !== null && picked.length > 0) useVault(picked[0], true);
}
/** The vault switcher: the folders opened before, another folder. A window that joined has the vault of the one it joined. */
export function openVaultSwitcher(): void {
  openPrompt('Open a vault...', (q: string): Choice[] => {
    if (linkMode() === LINK_JOINED) return [new Choice(`The vault served by ${linkAddress()}`, 'the window that serves chooses it', 'folder', () => {})];
    const t = q.trim().toLowerCase(), here = vaultDir() !== '' ? fs.realpath(vaultDir()) : '';
    const out = recentVaults().filter((v: string) => score(v.toLowerCase(), t) >= 0)
      .map((v: string) => new Choice(stemOf(v), v === here ? 'open' : v, 'folder', () => { if (v !== here) useVault(v, true); }));
    out.push(new Choice('Open folder as vault...', 'a folder of Markdown files, or an empty one', 'folder-open', () => { pickVault(); }));
    return out;
  });
}
/** The name of a new folder ("Projects/2026" makes both). */
export function openNewFolder(): void {
  openPrompt('Name of the new folder', (q: string): Choice[] => {
    const path = q.split('/').map((s: string) => s.trim()).filter((s: string) => s !== '').map((s: string) => slugify(s)).join('/');
    return path === '' ? [] : [new Choice(path, 'Enter to create the folder', 'folder', () => addFolder(path))];
  });
}

function key(e: ui.KeyEvent): void {
  const n = choices().length;
  if (e.key === 'ArrowDown' && n > 0) setCursor((cursor() + 1) % n);
  else if (e.key === 'ArrowUp' && n > 0) setCursor((cursor() + n - 1) % n);
  else if (e.key === 'Enter') { const c = n > 0 ? choices()[Math.min(cursor(), n - 1)] : null; close(); if (c !== null) c.run(); }
  else if (e.key === 'Escape') close();
  else return;
  e.preventDefault();
}

function Row(props: { c: Choice }): i32 {
  const c = props.c;
  const on = (): boolean => choices().indexOf(c) === cursor();
  return <View className={`flex-row items-center h-[${ROW_HEIGHT}] px-3 gap-2.5 rounded-md cursor-pointer ${on() ? 'bg-[#ebebea]' : ''}`}
    onPointerEnter={(e: ui.PointerEvent) => setCursor(choices().indexOf(c))} onPointerDown={(e: ui.PointerEvent) => { close(); c.run(); }}>
    <Icon name={c.icon} size={16} color={() => COLOR_TEXT_SECONDARY} strokeWidth={2} />
    <Text className="text-[14px] text-[#37352f]" numberOfLines={1}>{c.label}</Text>
    <Text className="grow text-[12px] text-[#a4a29c] text-right" numberOfLines={1}>{c.detail}</Text>
  </View>;
}

export function Prompt(): i32 {
  return <View className="absolute left-0 top-0 w-full h-full items-center bg-[#00000033]" style={{ hidden: shown() ? 0 : 1 }}
    onPointerDown={(e: ui.PointerEvent) => { const b = ui.screenBox(card.node); if (e.gx < b[0] || e.gy < b[1] || e.gx > b[0] + b[2] || e.gy > b[1] + b[3]) close(); }}>
    <View ref={card} keepFocus className="flex-col w-[560] mt-[90] rounded-xl border border-[#e9e9e7] bg-[#ffffff] shadow-xl p-1.5">
      <TextArea ref={field} rows={0} className="border-slate-600 border-0 rounded-none bg-transparent px-3 py-2.5 text-[16px] text-[#37352f] focus:border-[#ffffff]"
        placeholder={hint()} onInput={(v: string) => { setQuery(v.replaceAll('\n', '')); setCursor(0); }} onKeyDown={key} />
      <View className="h-[1] bg-[#e9e9e7] mb-1" style={{ hidden: choices().length === 0 ? 1 : 0 }} />
      <ScrollView className="flex-col" style={{ height: Math.min(MAX_ROWS, choices().length) * ROW_HEIGHT }}>
        {choices().map((c: Choice) => <Row c={c} />)}
      </ScrollView>
    </View>
  </View>;
}
