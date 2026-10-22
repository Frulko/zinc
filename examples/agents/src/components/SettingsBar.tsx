// The settings of the next turn, above the message field, as the CLIs show them: mode, model, effort and fast.
// Each is the selected agent's own; a pill opens a menu of what that agent and model accept, the model's one with a search.
import { createSignal, createNodeRef, onMount } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Icon } from 'zinc:icons';
import { ModelChoice, MODE_LABELS, MODE_FULL } from '../services/agents';
import { Pickable, Row, filter, rows, step } from '../services/pick';
import { AgentInfo } from '../state';
import { enter, enterOpacity, enterY } from './motion';
import { SURFACE, SURFACE_HOVER, SELECTED, BORDER, TEXT, MUTED, FAINT, ERROR, WARN, bg, fg, bd, color } from '../theme';

const MENU_NONE = '';
const [openMenu, setOpenMenu] = createSignal<string>(MENU_NONE);
export function menuOpen(): boolean { return openMenu() !== MENU_NONE; }
export function closeMenu(): void { setOpenMenu(MENU_NONE); }
function toggleMenu(name: string): void { setOpenMenu(openMenu() === name ? MENU_NONE : name); }

const ROW_H = 28;
const MENU_MAX_H = 320;

/** A list of choices above its pill; a long one (the models) scrolls. */
function Menu(props: { items: string[]; selected: i32; onPick: (i: i32) => void }): i32 {
  const ref = createNodeRef();
  enter(ref, 6);
  // a scroll view has no height of its own: the menu takes its rows' height, up to a ceiling
  const height = Math.min(props.items.length * ROW_H + 10, MENU_MAX_H);
  return <View ref={ref} className={`absolute bottom-[34] left-0 w-[280] flex-col rounded-lg border p-1 ${bg(SURFACE)} ${bd(BORDER)}`}
    style={{ height: height, opacity: enterOpacity(), translateY: enterY(6) }}>
    <ScrollView className="grow flex-col">
      {props.items.map((label: string, i: i32) => <View
        className={`flex-row items-center gap-2 h-[28] shrink-0 px-2 rounded cursor-pointer transition-colors duration-100 ${i === props.selected ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
        onPress={() => { props.onPick(i); closeMenu(); }}>
        <Text className={`grow shrink min-w-0 truncate text-[12px] ${fg(i === props.selected ? TEXT : MUTED)}`}>{label}</Text>
        {i === props.selected && <Icon name="check" size={13} color={() => color(TEXT)} />}
      </View>)}
    </ScrollView>
  </View>;
}

const HEAD_H = 22;
const FIELD_H = 36;

/** The model picker: a field that filters the CLI's models as you type, the kept ones below it grouped by provider.
 *  ↑/↓ move, Enter or Tab picks, Esc closes, a click picks too. */
function ModelPicker(props: { models: ModelChoice[]; selected: ModelChoice; onPick: (m: ModelChoice) => void }): i32 {
  const ref = createNodeRef(), field = createNodeRef(), list = createNodeRef();
  enter(ref, 6);
  // the CLI's list may still be loading when the picker opens
  const items = (): Pickable[] => props.models.map((m: ModelChoice) => new Pickable(m.id, m.label, m.group));
  const [query, setQuery] = createSignal<string>('');
  const shown = (): Row[] => rows(items(), filter(items(), query()));
  const first = (): i32 => { const l = shown(), k = l.findIndex((r: Row) => r.index >= 0 && props.models[r.index] === props.selected); return k >= 0 ? k : step(l, -1, 1); };
  const [at, setAt] = createSignal<i32>(first());
  onMount(() => { ui.focusNode(field.node); reveal(); });
  const top = (k: i32): number => { let y = 0; const l = shown(); for (let i = 0; i < k; i++) y += l[i].index < 0 ? HEAD_H : ROW_H; return y; };
  const height = (): number => Math.min(Math.max(top(shown().length), ROW_H) + 8, MENU_MAX_H - FIELD_H);
  // the highlighted row stays in view as the keys move it
  function reveal(): void {
    if (at() < 0) return;
    const y = top(at()), sy = ui.scrollTop(list.node), h = height() - 8;
    if (y < sy) ui.scrollTo(list.node, 0, y);
    else if (y + ROW_H > sy + h) ui.scrollTo(list.node, 0, y + ROW_H - h);
  }
  const pick = (k: i32): void => { props.onPick(props.models[shown()[k].index]); closeMenu(); };
  const keys = (e: ui.KeyEvent): void => {
    const l = shown();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { setAt(step(l, at(), e.key === 'ArrowDown' ? 1 : -1)); reveal(); e.preventDefault(); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && at() >= 0) { pick(at()); e.preventDefault(); }
    else if (e.key === 'Escape') { closeMenu(); e.preventDefault(); }   // this handler hides the root's from the field
  };
  return <View ref={ref} className={`absolute bottom-[34] left-0 w-[460] flex-col rounded-lg border ${bg(SURFACE)} ${bd(BORDER)}`}
    style={{ opacity: enterOpacity(), translateY: enterY(6) }}>
    <View className={`flex-row items-center gap-2 h-[${FIELD_H}] px-2 border-b ${bd(BORDER)}`}>
      <Icon name="search" size={13} color={() => color(FAINT)} />
      <Input ref={field} className={`border-slate-600 rounded-md py-1.5 grow h-[26] text-[12px] bg-transparent border-0 px-1 ${fg(TEXT)}`} value={query()}
        onInput={(v: string) => { setQuery(v); setAt(step(shown(), -1, 1)); ui.scrollTo(list.node, 0, 0); }} onKeyDown={keys}
        placeholder="Search models" aria-label="Search models" />
    </View>
    <ScrollView ref={list} className="flex-col p-1" style={{ height: height() }}>
      {shown().map((r: Row, k: i32) => <PickRow row={r} model={r.index < 0 ? null : props.models[r.index]} on={k === at()}
        selected={r.index >= 0 && props.models[r.index] === props.selected} onPress={() => pick(k)} />)}
      {shown().length === 0 && <Text className={`h-[28] px-2 pt-[7] text-[12px] ${fg(FAINT)}`}>{query() === '' ? 'Loading the models…' : `No model holds “${query()}”`}</Text>}
    </ScrollView>
  </View>;
}

/** A provider's heading, or a model: its name, its id when it differs, the window and price hint, a check when chosen. */
function PickRow(props: { row: Row; model: ModelChoice | null; on: boolean; selected: boolean; onPress: () => void }): i32 {
  if (props.model === null) return <Text className={`h-[22] shrink-0 px-2 pt-[6] text-[10px] font-semibold ${fg(FAINT)}`}>{props.row.heading}</Text>;
  const m = props.model as ModelChoice;
  return <View className={`flex-row items-center gap-2 h-[28] shrink-0 px-2 rounded cursor-pointer transition-colors duration-100 ${props.on ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
    onPress={props.onPress}>
    <Text className={`shrink-0 max-w-[200] truncate text-[12px] ${fg(props.on ? TEXT : MUTED)}`}>{m.label}</Text>
    {m.id !== '' && m.id !== m.label && <Text className={`shrink min-w-0 truncate text-[11px] ${fg(FAINT)}`}>{m.id}</Text>}
    <View className="grow" />
    {m.hint !== '' && <Text className={`shrink-0 text-[10px] ${fg(FAINT)}`}>{m.hint}</Text>}
    {props.selected && <Icon name="check" size={13} color={() => color(TEXT)} />}
  </View>;
}

/** `Model  Opus ▾`: opens its menu. */
function Pill(props: { name: string; label: string; value: string; warn: boolean }): i32 {
  const open = (): boolean => openMenu() === props.name;
  return <View className={`flex-row items-center gap-1 h-[26] px-2 rounded-md border cursor-pointer transition-colors duration-150 ${bd(props.warn ? ERROR : BORDER)} ${open() ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
    onPress={() => toggleMenu(props.name)}>
    <Text className={`text-[11px] ${fg(FAINT)}`}>{props.label}</Text>
    <Text className={`text-[12px] ${fg(props.warn ? ERROR : TEXT)}`}>{props.value}</Text>
    <Icon name="chevron-down" size={12} color={() => color(FAINT)} />
  </View>;
}

function FastToggle(props: { info: AgentInfo }): i32 {
  const a = props.info;
  return <View className={`flex-row items-center gap-1 h-[26] px-2 rounded-md border cursor-pointer transition-colors duration-150 ${bd(BORDER)} ${a.fast() ? bg(SELECTED) : ''} hover:${bg(SURFACE_HOVER)}`}
    onPress={() => a.setFast(!a.fast())}>
    <Icon name="zap" size={12} color={() => color(a.fast() ? WARN : FAINT)} />
    <Text className={`text-[12px] ${fg(a.fast() ? TEXT : MUTED)}`}>Fast</Text>
  </View>;
}

export function SettingsBar(props: { info: AgentInfo }): i32 {
  const a = props.info;
  const efforts = (): string[] => ['default', ...a.model().efforts];
  return <View className="flex-row flex-wrap items-center gap-2 px-3 pt-3">
    <View>
      <Pill name="mode" label="Mode" value={MODE_LABELS[a.mode()]} warn={a.mode() === MODE_FULL} />
      {openMenu() === 'mode' && <Menu items={MODE_LABELS} selected={a.mode()} onPick={(i: i32) => a.setMode(i)} />}
    </View>
    <View>
      <Pill name="model" label="Model" value={a.model().label} warn={false} />
      {openMenu() === 'model' && <ModelPicker models={a.models()} selected={a.model()} onPick={(m: ModelChoice) => a.setModel(m)} />}
    </View>
    {a.model().efforts.length > 0 && <View>
      <Pill name="effort" label="Effort" value={a.effort() === '' ? 'default' : a.effort()} warn={false} />
      {openMenu() === 'effort' && <Menu items={efforts()} selected={a.effort() === '' ? 0 : efforts().indexOf(a.effort())}
        onPick={(i: i32) => a.setEffort(i === 0 ? '' : efforts()[i])} />}
    </View>}
    {a.model().fast && <FastToggle info={a} />}
  </View>;
}
