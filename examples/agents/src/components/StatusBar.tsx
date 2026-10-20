// The bottom bar: what the next turn runs with (agent, model, effort, mode), how many turns run, and what the app
// holds in memory (its resident size, as the system counts it, and the items of the conversation shown).
import { Icon } from 'zinc:icons';
import { MODE_LABELS, MODE_FULL } from '../services/agents';
import { Chat } from '../services/chat';
import { agent, current, runningCount, rss } from '../state';
import { Spinner } from './motion';
import { BAR, BORDER, TEXT, MUTED, FAINT, ERROR, ACCENT, bg, fg, bd, color, sizeLabel } from '../theme';

function Part(props: { text: string; tone: i32 }): i32 {
  return <Text className={`text-[11px] ${fg(props.tone)}`}>{props.text}</Text>;
}

export function StatusBar(): i32 {
  const a = (): string => agent().agent.name;
  const model = (): string => agent().model().label + (agent().effort() !== '' ? ` · ${agent().effort()}` : '');
  const held = (): string => {
    const c = current();
    if (c === null) return '';
    const h = (c as Chat).held();
    return `${h[0]} items in view`;
  };
  const running = (): boolean => runningCount() > 0;
  return <View className={`flex-row items-center gap-3 h-[24] px-3 shrink-0 border-t ${bg(BAR)} ${bd(BORDER)}`}>
    <View className="w-[7] h-[7] rounded-full" style={{ backgroundColor: agent().agent.color }} />
    <Part text={a()} tone={TEXT} />
    <Part text={model()} tone={MUTED} />
    <Part text={MODE_LABELS[agent().mode()]} tone={agent().mode() === MODE_FULL ? ERROR : MUTED} />
    <View className="grow" />
    {running() && <Spinner size={12} color={() => color(ACCENT)} active={running} />}
    {running() && <Part text={`${runningCount()} running · Esc stops`} tone={TEXT} />}
    <Part text={held()} tone={FAINT} />
    <Icon name="memory-stick" size={12} color={() => color(FAINT)} />
    <Part text={rss() > 0 ? sizeLabel(rss(), false) : '…'} tone={MUTED} />
  </View>;
}
