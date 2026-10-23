// The last lines a build printed, in a monospace scroll view; the lines for apps ("::step"...) stand out.
import { For, Show } from 'zinc:ui/solid';
import { theme, hex } from 'zinc:ui/nuxt';
import { PROTOCOL_STEP, PROTOCOL_ERROR } from '../constants';

export type LogViewProps = { lines: () => string[] };

function colorOf(line: string): string {
  if (line.startsWith(PROTOCOL_ERROR)) return theme().color('error');
  if (line.startsWith(PROTOCOL_STEP)) return theme().textHighlighted;
  return theme().textMuted;
}

export function LogView(p: LogViewProps): i32 {
  return <ScrollView className={`grow p-2 rounded-md bg-${hex(theme().bgMuted)}`}>
    <Show when={p.lines().length === 0}><Text className={`text-xs text-${hex(theme().textDimmed)}`}>The build's output shows here.</Text></Show>
    <For each={p.lines()}>{(line: string, i: i32) => <Text className={`font-mono text-xs text-${hex(colorOf(line))}`}>{line}</Text>}</For>
  </ScrollView>;
}
