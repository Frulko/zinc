// The editor pane: tabs, breadcrumbs, the find bar, one code editor (zinc:editor's CodeEditor: several cursors, undo,
// highlighting) per open buffer (only the active one is shown: each keeps its caret, scroll and undo history) and the
// minimap. `stepEditor` runs every frame: the decorations of the active editor (current line, the other selections,
// matching brackets, search matches, diagnostics), rebuilt by zinc:editor when one of them changed.
import { createNodeRef, For } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd, CodeEditor, Minimap, drawCursors, stepEditor as decorate } from 'zinc:editor';
import { active, buffers, Buffer, cycle } from '../app/workspace';
import { root, reveal } from '../app/project';
import { fontIndex, FONT_CLASSES, fontSize, softWrap, setSoftWrap, minimapOn } from '../app/settings';
import { findOpen, findT, query, setQuery, matches, current, next, closeFind, findFromCaret } from '../app/search';
import { Tabs, revealActiveTab } from './Tabs';
import { Glyph, Kbd } from './Controls';
import { drawFileIcon, I_SEARCH, I_CLOSE } from './icons';

// ---- one editor per buffer
/** Keys the text field would take for itself: ⌃Tab switches tabs, ⌥Z toggles soft wrap (it would type 'Ω'). */
function paneKey(e: ui.KeyEvent): boolean {
  if (e.key === 'Tab' && e.ctrl) { cycle(e.shift ? -1 : 1); return true; }
  if (e.key === 'z' && e.alt && !e.primary) { setSoftWrap(!softWrap()); return true; }
  return false;
}
function BufferEditor(props: { b: Buffer }): i32 {
  const b = props.b;
  return <CodeEditor state={b} visible={() => active() === b} wrap={() => softWrap()} onKey={paneKey} onEscape={() => closeFind()}
    className={() => `text-[14px] ${FONT_CLASSES[fontIndex()]} pl-[16] pr-[8] pt-[6] pb-0`} padLeft={16} padTop={6} fontPx={() => fontSize()} />;
}

let lastActive: Buffer | null = null;
const NONE: i32[] = [];
/** Once per frame: decorations of the active editor, and the active tab kept in view. */
export function stepEditor(): void {
  const b = active();
  if (b !== lastActive) { lastActive = b; revealActiveTab(); if (b !== null) reveal((b as Buffer).path); }
  const on = findOpen() && query().length > 0;
  decorate(b, on ? matches() : NONE, on ? query().length : 0, current());
}

// ---- breadcrumbs: the active file's path under the tabs
function Breadcrumbs(): i32 {
  const parts = (): string[] => {
    const b = active();
    if (b === null) return [];
    const p = (b as Buffer).path;
    return (p.startsWith(root.path + '/') ? p.slice(root.path.length + 1) : p).split('/');
  };
  return <View className={`flex-row items-center h-[28] px-4 gap-1.5 border-b ${bg(theme().bg)} ${bd(theme().borderSoft)}`}>
    <Canvas style={{ width: 14, height: 14, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const b = active();
      if (b !== null) drawFileIcon((b as Buffer).name, false, false, x, y, w, theme());
    }} />
    <Text className={`text-[12px] ${fg(theme().muted)}`}>{parts().join('  ›  ')}</Text>
  </View>;
}

// ---- find bar
export const findRef = createNodeRef();
function findKey(e: ui.KeyEvent): void {
  if (e.key === 'Enter') { next(e.shift ? -1 : 1); e.preventDefault(); }
  else if (e.key === 'Escape') { closeFind(); e.preventDefault(); }
}
function FindBar(): i32 {
  const count = (): string => {
    const n = matches().length;
    return query() === '' ? '' : n === 0 ? 'No results' : `${current() + 1} of ${n}`;
  };
  return <View className={`flex-row items-center overflow-hidden px-3 gap-2 border-b ${bg(theme().surface)} ${bd(theme().borderSoft)}`}
    style={{ height: findT.get() * 38, hidden: findOpen() ? 0 : 1 }}>
    <View className={`flex-row items-center h-[26] w-[320] pl-2 pr-1 gap-1.5 rounded-md border ${bg(theme().bg)} ${bd(theme().border)}`}>
      <Glyph kind={I_SEARCH} size={14} color={() => theme().faint} />
      <Input ref={findRef} className={`border-slate-600 grow h-[24] text-[13px] p-0 pl-1 rounded-none border-0 bg-transparent ${fg(theme().text)} focus:${bd(theme().bg)}`}
        placeholder="Search…" value={query()} onInput={(v: string) => { setQuery(v); findFromCaret(); }} onKeyDown={findKey} />
    </View>
    <Text className={`text-[12px] w-[80] ${fg(matches().length === 0 && query() !== '' ? theme().error : theme().muted)}`}>{count()}</Text>
    <View className={`h-[24] px-2 rounded-md items-center justify-center cursor-pointer hover:${bg(theme().hover)}`} onPointerDown={() => next(-1)}>
      <Text className={`text-[13px] ${fg(theme().muted)}`}>↑</Text>
    </View>
    <View className={`h-[24] px-2 rounded-md items-center justify-center cursor-pointer hover:${bg(theme().hover)}`} onPointerDown={() => next(1)}>
      <Text className={`text-[13px] ${fg(theme().muted)}`}>↓</Text>
    </View>
    <View className="grow" />
    <View className={`w-[24] h-[24] rounded-md items-center justify-center cursor-pointer hover:${bg(theme().hover)}`} onPointerDown={() => closeFind()}>
      <Glyph kind={I_CLOSE} size={14} color={() => theme().muted} />
    </View>
  </View>;
}

// ---- empty pane
function Hint(props: { label: string; keys: string }): i32 {
  return <View className="flex-row items-center justify-between w-[260] h-[28]">
    <Text className={`text-[13px] ${fg(theme().muted)}`}>{props.label}</Text>
    <Kbd keys={props.keys} />
  </View>;
}
function EmptyPane(): i32 {
  return <View className={`absolute inset-0 items-center justify-center ${bg(theme().bg)}`} style={{ hidden: buffers().length === 0 ? 0 : 1 }}>
    <View className="flex-col items-center gap-1">
      <Text className={`text-[15px] font-semibold pb-3 ${fg(theme().faint)}`}>No file open</Text>
      <Hint label="Go to file" keys="⌘P" />
      <Hint label="Command palette" keys="⌘⇧P" />
      <Hint label="Toggle project panel" keys="⌘B" />
      <Hint label="Toggle terminal" keys="⌘J" />
    </View>
  </View>;
}

export function EditorPane(): i32 {
  return <View className={`grow flex-col ${bg(theme().bg)}`}>
    <Tabs />
    <Breadcrumbs />
    <FindBar />
    <View className="grow flex-row">
      <View className="grow">
        <For each={buffers()}>{(b: Buffer, i: i32) => <BufferEditor b={b} />}</For>
        <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawCursors(active(), x, y, w, h)} />
        <EmptyPane />
      </View>
      <Minimap editor={() => active()} visible={() => minimapOn()} />
    </View>
  </View>;
}
