// Bottom panel: the output of `zinc run` for the project, with its ANSI colours. ⌘J toggles it (animated height),
// ⌘R runs the project.
import { createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd, mix } from '../app/theme';
import { terminalH, showTerminal } from '../app/settings';
import { termLines, TermLine, Span, running, runProject, stopProject, clearTerminal, takeFollow } from '../app/tools';
import { IconButton, Glyph } from './Controls';
import { I_PLAY, I_STOP, I_CLOSE, I_TERMINAL } from './icons';

const logRef = createNodeRef();

function spanColor(s: Span): i32 {
  const t = theme();
  if (s.color < 0) return t.text;
  const base = t.ansi[s.color % 8];
  return s.color >= 8 ? mix(base, t.dark ? 0xffffff : 0x000000, 0.25) : base;
}

function Line(props: { l: TermLine }): i32 {
  return <View class="flex-row h-[18]">
    {props.l.spans.map((s: Span) => <Text class={`font-mono text-[12px] ${s.bold ? 'font-bold' : ''} ${fg(spanColor(s))}`}>{s.text}</Text>)}
  </View>;
}

/** Keeps the end of the output in view while it grows (called by the frame loop). */
export function stepTerminal(): void { if (takeFollow() && logRef.node >= 0) ui.scrollTo(logRef.node, 0, 1000000); }

export function TerminalPanel(): i32 {
  return <View class={`flex-col overflow-hidden border-t ${bg(theme().bg)} ${bd(theme().borderSoft)}`}
    style={{ height: terminalH.get(), hidden: terminalH.get() < 1 ? 1 : 0 }}>
    <View class={`flex-row items-center h-[32] pl-3 pr-2 gap-2 ${bg(theme().surface)}`}>
      <Glyph kind={I_TERMINAL} size={14} color={() => theme().muted} />
      <Text class={`text-[12px] font-semibold ${fg(theme().text)}`}>zinc run</Text>
      <Text class={`text-[12px] ${fg(theme().faint)}`}>{running() ? 'running…' : '--target sim'}</Text>
      <View class="grow" />
      {running() ? <IconButton kind={I_STOP} size={14} onPress={stopProject} /> : <IconButton kind={I_PLAY} size={14} onPress={runProject} />}
      <View class={`h-[22] px-2 rounded items-center justify-center cursor-pointer hover:${bg(theme().hover)}`} onPointerDown={() => clearTerminal()}>
        <Text class={`text-[12px] ${fg(theme().muted)}`}>Clear</Text>
      </View>
      <IconButton kind={I_CLOSE} size={14} onPress={() => showTerminal(false)} />
    </View>
    <ScrollView ref={logRef} class="grow flex-col px-3 py-2">
      {termLines().map((l: TermLine) => <Line l={l} />)}
    </ScrollView>
  </View>;
}
