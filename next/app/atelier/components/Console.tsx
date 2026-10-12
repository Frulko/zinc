// The console card. At rest it is one line: what happened last (ready, building, running, exited with its code), the
// diagnostic under the caret, the caret's place. When the program prints or something fails it opens under that line:
// the steps of the build in a quiet tone, the program's output, errors in red; a place a line names (`main.ts:12:5`) opens the file
// there. The lines are one text: they can be selected and copied (⌘C, ⌘A, the Copy control). The same line asks for the one text
// Atelier ever needs (a file name).
import { createNodeRef, createEffect, untrack } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from '../app/theme';
import { active, Buffer, notice, focusLater } from '../app/workspace';
import { lines, Line, K_OUT, K_ERR, jump, consoleH, consoleOpen, showConsole, takeFollow, copyConsole, status, statusKind, phase, IDLE, BUILDING, inspectorPort, openInspector } from '../app/tools';
import { promptLabel, promptValue, setPromptValue, answer } from '../app/commands';
import { jumpTo } from '../app/cursors';
import { caretInfo } from './Editor';
import { Glyph, IconButton, Kbd } from './Controls';
import { I_DOWN, I_UP, I_DOT } from './icons';

const logRef = createNodeRef(), promptRef = createNodeRef();

/** The line of the console a position of its text falls in: [its index, where it starts]; [-1, 0] past the end. */
function lineAt(off: i32): i32[] {
  const all = lines();
  let at = 0;
  for (let i = 0; i < all.length; i++) {
    const n = all[i].text.length + 1;
    if (off < at + n) return [i, at];
    at += n;
  }
  return [-1, 0];
}
/** The colours of one displayed row (a long line wraps into several): the colour of its line's kind, and the place a line names
 *  (`main.ts:12:5`) as a link. Runs of [length, colour]. */
function rowColors(row: string, start: i32): i32[] {
  const at = lineAt(start), t = theme();
  if (at[0] < 0) return [];
  const l = lines()[at[0]];
  const c: i32 = l.kind === K_ERR ? t.error : l.kind === K_OUT ? t.text : t.faint;
  const a = Math.max(0, l.p0 - (start - at[1])), b = Math.min(row.length, l.p1 - (start - at[1]));
  return l.line > 0 && b > a ? [a, c, b - a, t.accent, row.length - b, c] : [row.length, c];
}
/** A click on the place a line names opens the file there; a press that selected something is a selection. */
function linkClick(): void {
  const h = logRef.node;
  if (h < 0 || ui.selectedText(h) !== '') return;
  const off = ui.caretOf(h), at = lineAt(off);
  if (at[0] < 0) return;
  const l = lines()[at[0]];
  if (l.line > 0 && off - at[1] >= l.p0 && off - at[1] < l.p1) jump(l);
}
/** The lines of the console as one read-only text field, so that they can be taken elsewhere: the pointer selects (drag, double click
 *  a word, triple click a line, Shift+click), ⌘C copies, ⌘A selects it all once it has the focus. A line longer than the card wraps
 *  onto as many rows as it needs. */
function Log(): i32 {
  const node = <TextArea ref={logRef} readOnly
    class={`absolute inset-0 font-mono text-[12px] leading-[19] rounded-none border-0 px-3.5 py-2.5 ${bg(theme().bg)} ${fg(theme().text)} focus:${bd(theme().bg)}`}
    placeholder="Nothing yet. Run the sketch: its build and what it prints arrive here."
    value={lines().map((l: Line) => l.text).join('\n')} onPointerUp={(e: ui.PointerEvent) => linkClick()} />;
  ui.setHighlightAt(node, (row: string, start: i32) => rowColors(row, start));
  createEffect(() => { const t = theme(); ui.setEditColors(node, [-1, -1, -2, t.selection, t.caret, -1]); });
  return node;
}

/** Keeps the end of the output in view while it grows, and while the card opens (called by the frame loop); a selection stays where it is. */
export function stepConsole(): void {
  const h = logRef.node, opening = Math.abs(consoleH.x - consoleH.target) > 0.5;
  if ((!takeFollow() && !opening) || h < 0 || ui.selectedText(h) !== '') return;
  const n = ui.getValue(h).length;
  ui.select(h, n, n);
}

/** The diagnostics of the active file: [count, line of the first (1-based), its column]. */
function problems(): i32[] {
  const b = active();
  if (b === null) return [0, 0, 0];
  const d = (b as Buffer).diagnostics();
  return d.length === 0 ? [0, 0, 0] : [d.length, d[0].line + 1, d[0].col + 1];
}
/** Message of the first diagnostic on the caret's line. */
function lineMessage(): string {
  const b = active();
  if (b === null) return '';
  const line = caretInfo()[0] - 1;
  for (const d of (b as Buffer).diagnostics()) if (d.line === line) return d.message;
  return '';
}
function dotColor(): i32 {
  const t = theme();
  if (phase() === BUILDING) return t.accent;
  if (phase() !== IDLE) return t.success;
  return statusKind() === 2 ? t.error : statusKind() === 1 ? t.success : t.faint;
}

// the prompt opens with its starting text selected; the text is read untracked, or each typed character would be selected and replaced by the next
createEffect(() => { if (promptLabel() !== '') { const v = untrack(() => promptValue()); ui.setValue(promptRef.node, v); ui.select(promptRef.node, 0, v.length); focusLater(promptRef.node); } });
function promptKey(e: ui.KeyEvent): void {
  if (e.key === 'Enter') { answer(true); e.preventDefault(); }
  else if (e.key === 'Escape') { answer(false); e.preventDefault(); }
}

function StatusLine(): i32 {
  const asking = (): boolean => promptLabel() !== '';
  const text = (): string => lineMessage() !== '' ? lineMessage() : notice() !== '' ? notice() : status();
  const place = (): string => { const c = caretInfo(); return c[3] > 1 ? `${c[3]} cursors` : c[2] > 0 ? `${c[2]} selected` : `Ln ${c[0]}, Col ${c[1]}`; };
  return <View class="flex-row items-center h-[38] pl-3.5 pr-1.5 gap-2.5">
    <View class="flex-row items-center grow shrink gap-2.5" style={{ hidden: asking() ? 1 : 0 }}>
      <Glyph kind={I_DOT} size={14} color={dotColor} back={() => theme().bg} />
      <Text class={`shrink text-[13px] ${fg(lineMessage() !== '' || (notice() === '' && statusKind() === 2) ? theme().error : theme().text)}`}>{text()}</Text>
    </View>
    <View class="flex-row items-center grow shrink gap-2.5" style={{ hidden: asking() ? 0 : 1 }}>
      <Text class={`text-[13px] font-medium ${fg(theme().text)}`}>{promptLabel()}</Text>
      <Input ref={promptRef} class={`w-[300] h-[28] text-[13px] px-3 rounded-full border-0 ${bg(theme().chrome)} ${fg(theme().text)} focus:${bd(theme().chrome)}`}
        value={promptValue()} onInput={(v: string) => setPromptValue(v)} onKeyDown={promptKey} />
      <Kbd keys="↵" /><Kbd keys="esc" />
    </View>
    {problems()[0] > 0 && !asking() && <View class={`flex-row items-center h-[24] px-2.5 gap-1.5 rounded-full cursor-pointer ${bg(theme().errorSoft)}`}
      onPointerDown={(e: ui.PointerEvent) => { const p = problems(), b = active(); if (b !== null) jumpTo(b as Buffer, p[1], p[2]); }}>
      <Text class={`text-[12px] font-medium ${fg(theme().error)}`}>{`${problems()[0]} problem${problems()[0] > 1 ? 's' : ''}`}</Text>
    </View>}
    {inspectorPort() > 0 && !asking() && <View class={`flex-row items-center h-[24] px-2.5 rounded-full cursor-pointer ${bg(theme().accentSoft)}`}
      onPointerDown={(e: ui.PointerEvent) => openInspector()}>
      <Text class={`text-[12px] font-medium ${fg(theme().accent)}`}>{`Inspector · port ${inspectorPort()}`}</Text>
    </View>}
    {consoleOpen() && lines().length > 0 && !asking() && <View class={`flex-row items-center h-[24] px-2.5 rounded-full cursor-pointer hover:${bg(theme().hover)}`}
      onPointerDown={(e: ui.PointerEvent) => copyConsole()}>
      <Text class={`text-[12px] font-medium ${fg(theme().muted)}`}>Copy</Text>
    </View>}
    {active() !== null && <Text class={`text-[12px] ${fg(theme().faint)}`}>{place()}</Text>}
    {consoleOpen() ? <IconButton kind={I_DOWN} size={14} onPress={() => showConsole(false)} /> : <IconButton kind={I_UP} size={14} onPress={() => showConsole(true)} />}
  </View>;
}

export function ConsoleCard(): i32 {
  return <View class={`flex-col overflow-hidden rounded-[14] border ${bg(theme().bg)} ${bd(theme().borderSoft)}`}>
    <StatusLine />
    <View class={`overflow-hidden border-t ${bd(theme().borderSoft)}`} style={{ height: consoleH.get(), hidden: consoleH.get() < 1 ? 1 : 0 }}>
      <Log />
    </View>
  </View>;
}
