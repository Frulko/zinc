// The settings of the next turn, above the message field, as the CLIs show them: mode, model, effort and fast.
// Each is the selected agent's own; a pill opens a menu of what that agent and model accept.
import { createSignal, createNodeRef } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { ModelChoice, MODE_LABELS, MODE_FULL } from '../services/agents';
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
  return <View className="flex-row items-center gap-2 px-3 pt-3">
    <View>
      <Pill name="mode" label="Mode" value={MODE_LABELS[a.mode()]} warn={a.mode() === MODE_FULL} />
      {openMenu() === 'mode' && <Menu items={MODE_LABELS} selected={a.mode()} onPick={(i: i32) => a.setMode(i)} />}
    </View>
    <View>
      <Pill name="model" label="Model" value={a.model().label} warn={false} />
      {openMenu() === 'model' && <Menu items={a.models().map((m: ModelChoice) => m.label)} selected={a.models().indexOf(a.model())}
        onPick={(i: i32) => a.setModel(a.models()[i])} />}
    </View>
    {a.model().efforts.length > 0 && <View>
      <Pill name="effort" label="Effort" value={a.effort() === '' ? 'default' : a.effort()} warn={false} />
      {openMenu() === 'effort' && <Menu items={efforts()} selected={a.effort() === '' ? 0 : efforts().indexOf(a.effort())}
        onPick={(i: i32) => a.setEffort(i === 0 ? '' : efforts()[i])} />}
    </View>}
    {a.model().fast && <FastToggle info={a} />}
  </View>;
}
