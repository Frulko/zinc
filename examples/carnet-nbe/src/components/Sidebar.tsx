// The left pane, as Obsidian's: two tabs. Files: the vault's folders and notes (folders first, a click on a folder folds it, a
// click on a note opens it, the bin on hover moves it to the trash, a note dragged onto a folder moves there), new note and new
// folder. Search (Cmd+Shift+F): the notes with the words typed (services/search.ts) and the words around them. At the bottom,
// the vault's name and the collaboration.
import { createSignal, createMemo, createNodeRef, onCleanup } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as dnd from 'zinc:ui/dnd';
import { Icon } from 'zinc:icons';
import { Page, pages, folders, collapsed, setCollapsed, currentPage, setCurrentPage, createPage, deletePage, movePage, freePath,
  pageWithId, titleOf, stemOf, folderOf, peers, me, vaultName } from '../state';
import { search, Hit } from '../services/search';
import { linkMode, linkAddress, LINK_HOST, LINK_JOINED } from '../services/sync';
import { SIDEBAR_WIDTH, COLOR_TEXT_SECONDARY, COLOR_LIVE, COLOR_OFFLINE } from '../constants';
import { focusTitle } from './focus';
import { PageIcon } from './PageIcon';
import { openNewFolder } from './Prompt';

export function Avatar(props: { name: string; color: i32; size: i32 }): i32 {
  return <View className={`w-[${props.size}] h-[${props.size}] rounded-full items-center justify-center`} bg={props.color}>
    <Text className={`text-[${Math.floor(props.size * 0.5)}px] font-semibold text-[#ffffff]`}>{props.name.charAt(0)}</Text>
  </View>;
}

const [tab, setTab] = createSignal<number>(0);   // 0 files, 1 search
const [query, setQuery] = createSignal<string>('');
const [dropOn, setDropOn] = createSignal<string>('-');   // the folder a dragged note is over ('' the vault's root)
const searchField = createNodeRef();
let wantSearch = false;
/** Cmd+Shift+F. */
export function showSearch(): void { setTab(1); wantSearch = true; }
/** Called once per frame: the search field takes the caret once shown. */
export function stepSidebar(): void { if (wantSearch && searchField.node >= 0) { wantSearch = false; ui.focusNode(searchField.node); } }

function newNote(folder: string): void { const p = createPage(folder); setCurrentPage(p); focusTitle(p); }
function fold(path: string): void {
  setCollapsed(collapsed().includes(path) ? collapsed().filter((f: string) => f !== path) : [...collapsed(), path]);
}
/** A note dragged onto a folder (or the root) moves there, its name kept (or made free). */
function dropNote(d: dnd.DragInfo, folder: string): void {
  setDropOn('-');
  const p = pageWithId(d.data.slice(5));
  if (p !== null && folderOf(p.path()) !== folder) movePage(p, freePath(folder, stemOf(p.path()), p));
}
function droppable(node: i32, folder: string): () => void {
  return dnd.dropTarget(node, { data: `folder:${folder}`, canDrop: (d: dnd.DragInfo) => d.data.startsWith('note:'),
    onDragEnter: (d: dnd.DragInfo) => setDropOn(folder), onDragLeave: (d: dnd.DragInfo) => { if (dropOn() === folder) setDropOn('-'); },
    onDrop: (d: dnd.DragInfo) => dropNote(d, folder) });
}

/** One line of the tree: a folder (path, no note) or a note, at its depth. */
class Entry {
  path: string; p: Page | null; depth: i32;
  constructor(path: string, p: Page | null, depth: i32) { this.path = path; this.p = p; this.depth = depth; }
}
const tree = createMemo<Entry[]>(() => {
  const out: Entry[] = [], shut = collapsed(), all = folders(), notes = pages();
  const walk = (folder: string, depth: i32): void => {
    for (const f of all) if (folderOf(f) === folder) { out.push(new Entry(f, null, depth)); if (!shut.includes(f)) walk(f, depth + 1); }
    for (const p of notes) if (folderOf(p.path()) === folder) out.push(new Entry(p.path(), p, depth));
  };
  walk('', 0);
  return out;
}, []);

const rowClass = 'flex-row items-center h-[28] pr-1 mx-1.5 gap-1.5 rounded-md group cursor-pointer';
function FolderRow(props: { e: Entry }): i32 {
  const e = props.e, row = createNodeRef();
  const node = <View ref={row} className={`${rowClass} ${dropOn() === e.path ? 'bg-[#d3e5f7]' : 'hover:bg-[#efefed]'}`} style={{ paddingLeft: 8 + e.depth * 16 }}
    onPointerDown={(x: ui.PointerEvent) => fold(e.path)}>
    <Icon name={collapsed().includes(e.path) ? 'chevron-right' : 'chevron-down'} size={14} color={() => COLOR_TEXT_SECONDARY} strokeWidth={2} />
    <Text className="grow text-[14px] text-[#5f5e5b]" numberOfLines={1}>{stemOf(e.path)}</Text>
    <View className="w-[22] h-[22] rounded-[4] items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#e3e3e1]"
      onPointerDown={(x: ui.PointerEvent) => newNote(e.path)}>
      <Icon name="plus" size={14} color={() => COLOR_TEXT_SECONDARY} strokeWidth={2} />
    </View>
  </View>;
  onCleanup(droppable(row.node, e.path));
  return node;
}
function NoteRow(props: { e: Entry }): i32 {
  const e = props.e, p = e.p as Page, row = createNodeRef();
  const on = (): boolean => currentPage() === p;
  const node = <View ref={row} className={`${rowClass} ${on() ? 'bg-[#ebebea]' : 'hover:bg-[#efefed]'}`} style={{ paddingLeft: 8 + e.depth * 16 }}
    onPointerDown={(x: ui.PointerEvent) => setCurrentPage(p)}>
    <PageIcon p={p} size={15} color={0x91918e} />
    <Text className={`grow text-[14px] ${on() ? 'font-medium text-[#37352f]' : 'text-[#5f5e5b]'}`} numberOfLines={1}>{titleOf(p)}</Text>
    <View className="w-[22] h-[22] rounded-[4] items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#e3e3e1]"
      onPointerDown={(x: ui.PointerEvent) => deletePage(p)}>
      <Icon name="trash-2" size={13} color={() => COLOR_TEXT_SECONDARY} strokeWidth={2} />
    </View>
  </View>;
  onCleanup(dnd.draggable(row.node, { data: `note:${p.id}` }));
  return node;
}

function TreeRow(props: { e: Entry }): i32 { return props.e.p === null ? <FolderRow e={props.e} /> : <NoteRow e={props.e} />; }

function Tool(props: { icon: string; on: boolean; run: () => void }): i32 {
  return <View className={`w-[28] h-[28] rounded-md items-center justify-center cursor-pointer ${props.on ? 'bg-[#e3e3e1]' : 'hover:bg-[#ebebea]'}`}
    onPointerDown={(e: ui.PointerEvent) => props.run()}>
    <Icon name={props.icon} size={16} color={() => COLOR_TEXT_SECONDARY} strokeWidth={2} />
  </View>;
}

function Files(): i32 {
  const empty = createNodeRef();
  const node = <ScrollView className="grow flex-col">
    {tree().map((e: Entry) => <TreeRow e={e} />)}
    <View ref={empty} className={`h-[80] mx-1.5 rounded-md ${dropOn() === '' ? 'bg-[#d3e5f7]' : ''}`} />
  </ScrollView>;
  onCleanup(droppable(empty.node, ''));
  return node;
}

const hits = createMemo<Hit[]>(() => tab() === 1 ? search(query()) : [], []);
function Search(): i32 {
  return <View className="grow flex-col">
    <View className="mx-3 mb-2 rounded-md border border-[#e3e3e1] bg-[#ffffff] px-2 py-1.5">
      <TextArea ref={searchField} rows={0} className="border-0 p-0 rounded-none bg-transparent text-[14px] text-[#37352f] focus:border-[#ffffff]"
        placeholder="Search the vault..." value={query()} onInput={(v: string) => setQuery(v.replaceAll('\n', ' '))} />
    </View>
    <ScrollView className="grow flex-col">
      {hits().map((h: Hit) => <View className={`flex-col mx-1.5 px-2.5 py-1.5 rounded-md cursor-pointer ${currentPage() === h.p ? 'bg-[#ebebea]' : 'hover:bg-[#efefed]'}`}
        onPointerDown={(e: ui.PointerEvent) => setCurrentPage(h.p)}>
        <Text className="text-[14px] font-medium text-[#37352f]" numberOfLines={1}>{titleOf(h.p)}</Text>
        <Text className="text-[12px] leading-[17] text-[#787774]" numberOfLines={3}>{h.snippet}</Text>
      </View>)}
      {query().trim() !== '' && hits().length === 0 && <Text className="text-[13px] text-[#a4a29c] px-4 py-2">No note matches.</Text>}
    </ScrollView>
  </View>;
}

function linkText(): string {
  const n = peers().length + 1, people = n === 1 ? 'only you' : `${n} people`;
  if (linkMode() === LINK_HOST) return `Live · ${people} · serving ${linkAddress()}`;
  if (linkMode() === LINK_JOINED) return `Live · ${people} · joined ${linkAddress()}`;
  return 'Offline';
}

export function Sidebar(): i32 {
  return <View className={`flex-col w-[${SIDEBAR_WIDTH}] h-full bg-[#f7f7f5] border-r border-[#ededeb]`}>
    <View className="flex-row items-center h-[46] px-2.5 gap-1">
      <Tool icon="folder" on={tab() === 0} run={() => setTab(0)} />
      <Tool icon="search" on={tab() === 1} run={showSearch} />
      <View className="grow" />
      {tab() === 0 && <Tool icon="file-plus" on={false} run={() => newNote('')} />}
      {tab() === 0 && <Tool icon="folder-plus" on={false} run={openNewFolder} />}
    </View>
    {tab() === 0 && <Files />}
    {tab() === 1 && <Search />}
    <View className="flex-col gap-1.5 px-3.5 py-3 border-t border-[#ededeb]">
      <View className="flex-row items-center gap-2">
        <Avatar name={me.name} color={me.color} size={20} />
        <Text className="text-[13px] font-semibold text-[#37352f] grow" numberOfLines={1}>{vaultName() !== '' ? vaultName() : `${me.name}'s Carnet`}</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <View className="w-[8] h-[8] rounded-full" bg={linkMode() === 0 ? COLOR_OFFLINE : COLOR_LIVE} />
        <Text className="text-[12px] text-[#787774] grow" numberOfLines={2}>{linkText()}</Text>
      </View>
    </View>
  </View>;
}
