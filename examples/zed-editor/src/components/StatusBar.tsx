// Status bar: panel toggles and diagnostics on the left; caret position, language, encoding, line endings, font
// size and soft wrap on the right; short notices ('Saved stats.ts') in between.
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from '../app/theme';
import { active, Buffer, notice } from '../app/workspace';
import { panelOpen, togglePanel, terminalOpen, toggleTerminal, fontSize, softWrap, setSoftWrap, fontIndex, DEFAULT_FONT, setFontIndex } from '../app/settings';
import { langLabel } from '../app/syntax';
import { openPalette, PAL_COMMANDS } from '../app/commands';
import { caretInfo } from './Editor';
import { IconButton, Glyph } from './Controls';
import { I_SIDEBAR, I_TERMINAL, I_ERROR, I_WARNING } from './icons';

function count(severity: i32): i32 {
  const b = active();
  if (b === null) return 0;
  let n: i32 = 0;
  for (const d of (b as Buffer).diagnostics()) if (d.severity === severity) n++;
  return n;
}
/** Message of the first diagnostic on the caret's line. */
function lineMessage(): string {
  const b = active();
  if (b === null) return '';
  const line = caretInfo()[0] - 1;
  for (const d of (b as Buffer).diagnostics()) if (d.line === line) return d.message;
  return '';
}

function Item(props: { label: () => string; onPress: () => void }): i32 {
  return <View class={`h-[22] px-2 rounded items-center justify-center cursor-pointer hover:${bg(theme().hover)}`}
    onPointerDown={(e: ui.PointerEvent) => props.onPress()}>
    <Text class={`text-[12px] ${fg(theme().muted)}`}>{props.label()}</Text>
  </View>;
}

export function StatusBar(): i32 {
  const b = (): Buffer | null => active();
  return <View class={`flex-row items-center h-[28] px-1.5 gap-0.5 border-t ${bg(theme().surface)} ${bd(theme().borderSoft)}`}>
    <IconButton kind={I_SIDEBAR} size={14} on={panelOpen} onPress={togglePanel} />
    <IconButton kind={I_TERMINAL} size={14} on={terminalOpen} onPress={toggleTerminal} />
    <View class={`flex-row items-center h-[22] px-2 gap-1 rounded cursor-pointer hover:${bg(theme().hover)}`}
      onPointerDown={(e: ui.PointerEvent) => openPalette(PAL_COMMANDS)}>
      <Glyph kind={I_ERROR} size={13} color={() => count(1) > 0 ? theme().error : theme().faint} />
      <Text class={`text-[12px] pr-1 ${fg(theme().muted)}`}>{`${count(1)}`}</Text>
      <Glyph kind={I_WARNING} size={13} color={() => count(2) > 0 ? theme().warning : theme().faint} />
      <Text class={`text-[12px] ${fg(theme().muted)}`}>{`${count(2)}`}</Text>
    </View>
    <Text class={`text-[12px] pl-2 ${fg(lineMessage() !== '' ? theme().error : theme().faint)}`}>{lineMessage() !== '' ? lineMessage() : notice()}</Text>
    <View class="grow" />
    {b() !== null && <View class="flex-row items-center gap-0.5">
      <Item label={() => { const c = caretInfo(); return c[2] > 0 ? `${c[0]}:${c[1]} (${c[2]} selected)` : `${c[0]}:${c[1]}`; }} onPress={() => {}} />
      <Item label={() => fontIndex() === DEFAULT_FONT ? `${fontSize()} px` : `${fontSize()} px (⌘0)`} onPress={() => setFontIndex(DEFAULT_FONT)} />
      <Item label={() => softWrap() ? 'Wrap' : 'No wrap'} onPress={() => setSoftWrap(!softWrap())} />
      <Item label={() => langLabel(b() !== null ? (b() as Buffer).path : '')} onPress={() => {}} />
      <Item label={() => 'UTF-8'} onPress={() => {}} />
      <Item label={() => b() !== null && (b() as Buffer).crlf ? 'CRLF' : 'LF'} onPress={() => {}} />
    </View>}
  </View>;
}
