// The bottom bar: what the next turn runs with (agent, model, effort, mode), how many turns run, the conversation's tokens,
// context and cost (by model on hover), the agent's plan limits (each window on hover, a click checks them again), and what
// the app holds in memory (its resident size, as the system counts it, and the items of the conversation shown).
import { createSignal, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { MODE_LABELS, MODE_FULL } from '../services/agents';
import { Chat } from '../services/chat';
import { Usage, Limit, usageLabel, tokens, money, resetsIn } from '../services/usage';
import { agent, current, runningCount, rss, now, AgentInfo } from '../state';
import { Spinner } from './motion';
import { BAR, BORDER, TEXT, MUTED, FAINT, ERROR, WARN, ACCENT, SURFACE_HOVER, bg, fg, bd, color, sizeLabel } from '../theme';

function Part(props: { text: string; tone: i32 }): i32 {
  return <Text className={`text-[11px] ${fg(props.tone)}`}>{props.text}</Text>;
}

/** A status bar item with a panel above it while the pointer is on it. */
/** `panel`: P_USAGE or P_LIMITS. */
function Hover(props: { children: () => i32; panel: i32; onPress?: () => void }): i32 {
  const [on, setOn] = createSignal(false);
  const at = createNodeRef();
  return <View ref={at} className={`flex-row items-center gap-1 h-[20] px-1 rounded cursor-pointer hover:${bg(SURFACE_HOVER)}`}
    onPress={() => { if (props.onPress !== undefined) (props.onPress as () => void)(); }}
    onPointerEnter={(e: ui.PointerEvent) => setOn(true)} onPointerLeave={(e: ui.PointerEvent) => setOn(false)}>
    {props.children()}
    {on() && <Layer anchor={at.node} panel={props.panel} />}
  </View>;
}

const P_USAGE = 0, P_LIMITS = 1;

function Layer(props: { anchor: i32; panel: i32 }): i32 {
  const ref = createNodeRef();
  setTimeout(() => { if (ref.node >= 0) { ui.openLayer(ref.node, { priority: 300 }); ui.anchor(ref.node, props.anchor, 'top', 4); } }, 0);
  return <View ref={ref} className={`flex-col gap-1 px-3 py-2 rounded-md border ${bg(BAR)} ${bd(BORDER)}`}>
    {props.panel === P_USAGE ? <UsagePanel chat={current() as Chat} /> : <LimitsPanel info={agent()} />}
  </View>;
}

function Row(props: { name: string; value: string; tone?: i32 }): i32 {
  return <View className="flex-row gap-3">
    <Text className={`w-[150] truncate text-[11px] ${fg(MUTED)}`}>{props.name}</Text>
    <Text className={`text-[11px] ${fg(props.tone ?? TEXT)}`}>{props.value}</Text>
  </View>;
}

function detail(u: Usage): string {
  const parts = [`in ${tokens(u.input)}`, `out ${tokens(u.output)}`];
  if (u.cacheRead > 0) parts.push(`cache read ${tokens(u.cacheRead)}`);
  if (u.cacheWrite > 0) parts.push(`cache write ${tokens(u.cacheWrite)}`);
  const m = money(u);
  if (m !== '') parts.push(m);
  return parts.join(' · ');
}

/** The conversation's usage, and its split by model, as the hover shows it. */
function UsagePanel(props: { chat: Chat }): i32 {
  const c = props.chat;
  const t = (): Usage => c.liveTotal();
  const names: string[] = [];
  c.byModel().forEach((u: Usage, name: string) => names.push(name));
  return <View className="flex-col gap-1">
    <Text className={`text-[11px] font-semibold ${fg(TEXT)}`}>This conversation</Text>
    <Row name="Tokens" value={detail(t())} />
    <Row name="Context" value={t().contextPercent() >= 0 ? `${tokens(t().context)} of ${tokens(t().window)} (${Math.round(t().contextPercent())}%)` : t().context > 0 ? `${tokens(t().context)} (window unknown)` : 'unknown'} />
    {names.length > 0 && <Text className={`text-[11px] font-semibold mt-1 ${fg(TEXT)}`}>By model</Text>}
    {names.map((n: string) => <Row name={n} value={detail(c.byModel().get(n) as Usage)} />)}
    <Text className={`text-[10px] mt-1 ${fg(FAINT)}`}>{money(t()).startsWith('≈') ? '≈: estimated from list prices; the CLI reports no cost' : 'Cost as the CLI reports it'}</Text>
  </View>;
}

/** `5h 8% · wk 22%`: the agent's windows, `limits ?` when the CLI does not tell them. */
function limitsShort(a: AgentInfo): string {
  const l = a.limits();
  if (l === null) return a.limitsAt() === 0 ? 'limits …' : 'limits ?';
  // the session and the week; other windows (a model's own week, Codex's other spans) are in the hover
  const main = (l as Limit[]).filter((x: Limit) => x.name === '5-hour session' || x.name === 'Week');
  return (main.length > 0 ? main : (l as Limit[]).slice(0, 1))
    .map((x: Limit) => `${x.name === '5-hour session' ? '5h' : x.name === 'Week' ? 'wk' : x.name} ${Math.round(x.used)}%`).join(' · ');
}
function worst(a: AgentInfo): number {
  const l = a.limits();
  let w = 0;
  if (l !== null) for (const x of l as Limit[]) if (x.used > w) w = x.used;
  return w;
}

export function LimitsPanel(props: { info: AgentInfo }): i32 {
  const a = props.info;
  const l = (): Limit[] | null => a.limits();
  return <View className="flex-col gap-1">
    <Text className={`text-[11px] font-semibold ${fg(TEXT)}`}>{`${a.agent.name} plan limits`}</Text>
    {l() === null && <Text className={`text-[11px] ${fg(MUTED)}`}>{a.limitsAt() === 0 ? 'Checking…' : 'Unknown: the CLI does not expose them'}</Text>}
    {l() === null && a.agent.limitsUrl() !== '' && <Text className={`text-[11px] ${fg(MUTED)}`}>{`They show on ${a.agent.limitsUrl().replace('https://', '')} (the Agents panel opens it)`}</Text>}
    {(l() === null ? [] : l() as Limit[]).map((x: Limit) => <Row name={x.name} value={`${Math.round(x.used)}% used · ${resetsIn(x.resets, now())}`} tone={x.used >= 90 ? ERROR : x.used >= 70 ? WARN : TEXT} />)}
    <Text className={`text-[10px] mt-1 ${fg(FAINT)}`}>Click to check again (no model call)</Text>
  </View>;
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
  const usage = (): string => {
    const c = current();
    if (c === null) return '';
    const t = (c as Chat).liveTotal();
    return t.empty() ? '' : usageLabel(t);
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
    {usage() !== '' && <Hover panel={P_USAGE}><Part text={usage()} tone={MUTED} /></Hover>}
    {agent().binary !== '' && <Hover panel={P_LIMITS} onPress={() => agent().refreshLimits()}>
      <Icon name="gauge" size={12} color={() => color(worst(agent()) >= 90 ? ERROR : worst(agent()) >= 70 ? WARN : FAINT)} />
      <Part text={limitsShort(agent())} tone={MUTED} />
    </Hover>}
    <Part text={held()} tone={FAINT} />
    <Icon name="memory-stick" size={12} color={() => color(FAINT)} />
    <Part text={rss() > 0 ? sizeLabel(rss(), false) : '…'} tone={MUTED} />
  </View>;
}
