// The console card. At rest it is one line: what happened last (ready, building, running, exited with its code), the
// diagnostic under the caret, the caret's place. When the program prints or something fails it opens under that line:
// the steps of the build in a quiet tone, the program's output, and errors as cards that open the file at their line.
// The same line asks for the one text Atelier ever needs (a file name).
import { createNodeRef, createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from '../app/theme';
import { active, Buffer, notice, focusLater } from '../app/workspace';
import { lines, Line, K_OUT, K_ERR, jump, consoleH, consoleOpen, showConsole, takeFollow, status, statusKind, phase, IDLE, BUILDING } from '../app/tools';
import { promptLabel, promptValue, setPromptValue, answer } from '../app/commands';
import { jumpTo } from '../app/cursors';
import { caretInfo } from './Editor';
import { Glyph, IconButton, Kbd } from './Controls';
import { I_ERROR, I_DOWN, I_UP, I_DOT } from './icons';

const logRef = createNodeRef(), promptRef = createNodeRef();

function ErrorCard(props: { l: Line }): i32 {
  const l = props.l;
  return <View class={`flex-row items-start my-1 px-3 py-2 gap-2.5 rounded-[10] cursor-pointer ${bg(theme().errorSoft)} hover:opacity-80`}
    onPointerDown={(e: ui.PointerEvent) => jump(l)}>
    <View class="pt-[2]"><Glyph kind={I_ERROR} size={14} color={() => theme().error} back={() => theme().errorSoft} /></View>
    <View class="flex-col grow shrink gap-0.5">
      <Text class={`text-[13px] ${fg(theme().text)}`}>{l.message}</Text>
      <Text class={`text-[11px] font-mono ${fg(theme().muted)}`}>{`${l.file}:${l.line}:${l.col}${l.code !== '' ? '  ·  ' + l.code : ''}`}</Text>
    </View>
  </View>;
}
function Row(props: { l: Line }): i32 {
  const l = props.l;
  if (l.code !== '') return <ErrorCard l={l} />;
  const color = (): i32 => l.kind === K_ERR ? theme().error : l.kind === K_OUT ? theme().text : theme().faint;
  return <View class={`flex-row h-[19] ${l.line > 0 ? 'cursor-pointer' : ''}`} onPointerDown={(e: ui.PointerEvent) => jump(l)}>
    <Text class={`font-mono text-[12px] ${l.line > 0 ? 'underline' : ''} ${fg(color())}`}>{l.text === '' ? ' ' : l.text}</Text>
  </View>;
}

/** Keeps the end of the output in view while it grows (called by the frame loop). */
export function stepConsole(): void { if (takeFollow() && logRef.node >= 0) ui.scrollTo(logRef.node, 0, 1000000); }

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

createEffect(() => { if (promptLabel() !== '') { ui.setValue(promptRef.node, promptValue()); ui.select(promptRef.node, 0, promptValue().length); focusLater(promptRef.node); } });
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
    {active() !== null && <Text class={`text-[12px] ${fg(theme().faint)}`}>{place()}</Text>}
    {consoleOpen() ? <IconButton kind={I_DOWN} size={14} onPress={() => showConsole(false)} /> : <IconButton kind={I_UP} size={14} onPress={() => showConsole(true)} />}
  </View>;
}

export function ConsoleCard(): i32 {
  return <View class={`flex-col overflow-hidden rounded-[14] border ${bg(theme().bg)} ${bd(theme().borderSoft)}`}>
    <StatusLine />
    <View class={`overflow-hidden border-t ${bd(theme().borderSoft)}`} style={{ height: consoleH.get(), hidden: consoleH.get() < 1 ? 1 : 0 }}>
      <ScrollView ref={logRef} class="grow flex-col px-3.5 py-2.5">
        {lines().length === 0 && <Text class={`text-[12px] ${fg(theme().faint)}`}>Nothing yet. Run the sketch: its build and what it prints arrive here.</Text>}
        {lines().map((l: Line) => <Row l={l} />)}
      </ScrollView>
    </View>
  </View>;
}
