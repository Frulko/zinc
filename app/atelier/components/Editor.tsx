// The editor card: the find bar and one code editor (zinc:editor's CodeEditor) per open buffer (only the active one is
// shown: each keeps its caret and scroll). `stepEditor` runs every frame: the decorations of the active editor
// (zinc:editor), the language server's cards placed over it (zinc:editor-lsp), the active tab kept in view. The cursors
// beside the field's own caret are drawn on a canvas over it.
import { createNodeRef, For } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd, CodeEditor, drawCursors, stepEditor as decorate, noteKey } from 'zinc:editor';
import { Popup, Signature, Hover, stepAssist } from 'zinc:editor-lsp';
import { active, buffers, Buffer, cycle } from '../app/workspace';
import { findOpen, findT, findRef, query, setQuery, matches, current, next, closeFind, findFromCaret } from '../app/search';
import { revealActiveTab } from './Header';
import { Glyph, Kbd } from './Controls';
import { t as tr } from '../app/text';
import { I_SEARCH, I_CLOSE } from './icons';

// ---- one editor per buffer: Ctrl+Tab switches tabs, Escape closes the find bar
function BufferEditor(props: { b: Buffer }): i32 {
  const b = props.b;
  return <CodeEditor state={b} visible={() => active() === b} onEscape={() => closeFind()}
    onKey={(e: ui.KeyEvent): boolean => { if (e.key === 'Tab' && e.ctrl) { cycle(e.shift ? -1 : 1); return true; } return false; }} />;
}

let lastActive: Buffer | null = null;
const NONE: i32[] = [];
/** Once per frame: decorations of the active editor, the language server's cards, and the active tab kept in view. */
export function stepEditor(): void {
  const b = active();
  if (b !== lastActive) { lastActive = b; revealActiveTab(); }
  if (b === null || (b as Buffer).node() < 0) return;
  stepAssist(b as Buffer);
  const on = findOpen() && query().length > 0;
  decorate(b as Buffer, on ? matches() : NONE, on ? query().length : 0, current());
}

// ---- find bar
function findKey(e: ui.KeyEvent): void {
  noteKey(e);
  if (e.key === 'Enter') { next(e.shift ? -1 : 1); e.preventDefault(); }
  else if (e.key === 'Escape') { closeFind(); e.preventDefault(); }
}
function Step(p: { label: string; by: i32 }): i32 {
  return <View className={`w-[26] h-[26] rounded-full items-center justify-center cursor-pointer hover:${bg(theme().hover)}`} onPointerDown={() => next(p.by)}>
    <Text className={`text-[13px] ${fg(theme().muted)}`}>{p.label}</Text>
  </View>;
}
function FindBar(): i32 {
  const count = (): string => {
    const n = matches().length;
    return query() === '' ? '' : n === 0 ? tr('atelier.find.none') : tr('atelier.find.count', ['index', `${current() + 1}`, 'count', `${n}`]);
  };
  return <View className={`flex-row items-center overflow-hidden px-3 gap-2 border-b ${bd(theme().borderSoft)}`}
    style={{ height: findT.get() * 46, hidden: findOpen() ? 0 : 1 }}>
    <View className={`flex-row items-center h-[30] w-[320] pl-2.5 pr-1 gap-1.5 rounded-full ${bg(theme().chrome)}`}>
      <Glyph kind={I_SEARCH} size={14} color={() => theme().faint} />
      <Input ref={findRef} className={`border-slate-600 grow h-[26] text-[13px] p-0 pl-1 rounded-none border-0 bg-transparent ${fg(theme().text)} focus:${bd(theme().chrome)}`}
        placeholder={tr('atelier.find.placeholder')} value={query()} onInput={(v: string) => { setQuery(v); findFromCaret(); }} onKeyDown={findKey} />
    </View>
    <Text className={`text-[12px] w-[80] ${fg(matches().length === 0 && query() !== '' ? theme().error : theme().muted)}`}>{count()}</Text>
    <Step label="↑" by={-1} />
    <Step label="↓" by={1} />
    <View className="grow" />
    <View className={`w-[26] h-[26] rounded-full items-center justify-center cursor-pointer hover:${bg(theme().hover)}`} onPointerDown={() => closeFind()}>
      <Glyph kind={I_CLOSE} size={13} color={() => theme().muted} back={() => theme().bg} />
    </View>
  </View>;
}

// ---- empty pane
function Hint(props: { label: string; keys: string }): i32 {
  return <View className="flex-row items-center justify-between w-[240] h-[30]">
    <Text className={`text-[13px] ${fg(theme().muted)}`}>{props.label}</Text>
    <Kbd keys={props.keys} />
  </View>;
}
function EmptyPane(): i32 {
  return <View className={`absolute inset-0 items-center justify-center ${bg(theme().bg)}`} style={{ hidden: buffers().length === 0 ? 0 : 1 }}>
    <View className="flex-col items-center gap-0.5">
      <Text className={`text-[15px] font-semibold pb-3 ${fg(theme().text)}`}>{tr('atelier.editor.no_file')}</Text>
      <Hint label={tr('atelier.editor.add_file')} keys="⌘T" />
      <Hint label={tr('atelier.editor.examples')} keys="⌘⇧O" />
      <Hint label={tr('atelier.editor.everything')} keys="⌘⇧P" />
    </View>
  </View>;
}

/** The editor card (the tour points at it). */
export const editorRef = createNodeRef();
export function EditorCard(): i32 {
  return <View ref={editorRef} className={`grow flex-col overflow-hidden ${bg(theme().bg)}`}>
    <FindBar />
    <View className="grow my-[6]">
      <For each={buffers()}>{(b: Buffer, i: i32) => <BufferEditor b={b} />}</For>
      <Canvas className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawCursors(active(), x, y, w, h)} />
      <Signature />
      <Hover />
      <Popup />
      <EmptyPane />
    </View>
  </View>;
}
