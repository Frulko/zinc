// The app frame: sidebar navigation with a sliding highlight, a top bar, and the stage where screens transition.
import { createEffect, createNodeRef, createSignal } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, Kbd, Switch } from 'zinc:ui/kit';
import { tailwindColor } from 'zinc:ui';
import { TABS, TabInfo, tab, go, slide, screenHidden, screenX, screenOpacity } from '../app/router';
import { Spring } from '../app/motion';
import { fps } from '../app/clock';
import { name, dark, setDark } from '../app/prefs';
import { openPalette, toast } from '../app/overlays';
import { Icon } from './Icon';
import { SEARCH_ICON, BELL_ICON } from './icons';

const ROW: i32 = 40;          // nav row height (h-10)
const ROW_GAP: i32 = 4;       // gap-1

/** Theme colour as an RGB value for canvas drawing. */
export function rgb(token: string): u32 { const c = tailwindColor(token); return c < 0 ? 0x71717a : c; }

// the highlight behind the current nav row follows the tab on a bouncy spring
const indicator = new Spring(0, 300, 24);
createEffect(() => indicator.to(tab() * (ROW + ROW_GAP)));

function NavItem(props: { index: i32 }): i32 {
  const i = props.index;
  const current = (): boolean => tab() === i;
  return <View class={`flex-row items-center gap-3 h-10 px-3 rounded-lg cursor-pointer ${current() ? `text-${theme().foreground}` : `text-${theme().mutedForeground} hover:text-${theme().foreground}`}`}
    onClick={() => go(i)}>
    <Icon kind={i} color={() => rgb(current() ? theme().accent : theme().mutedForeground)} />
    <Text class="text-sm font-semibold grow">{TABS[i].label}</Text>
    <Kbd label={TABS[i].key} />
  </View>;
}

/** Initials of the profile name ("Ada Lovelace" → "AL"). */
function initialsOf(s: string): string {
  const words = s.trim().split(' ').filter((w: string) => w.length > 0);
  if (words.length === 0) return '?';
  return (words[0].slice(0, 1) + (words.length > 1 ? words[1].slice(0, 1) : '')).toUpperCase();
}

function Sidebar(): i32 {
  return <View class={`flex-col w-[232] p-4 gap-6 border-r bg-${theme().card} border-${theme().border}`}>
    <View class="flex-row items-center gap-3 px-2 pt-1">
      <View class="w-8 h-8 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 items-center justify-center">
        <Text class="text-sm font-bold text-white">Z</Text>
      </View>
      <View class="flex-col">
        <Text class={`text-sm font-bold text-${theme().foreground}`}>Zinc Hero</Text>
        <Text class={`text-xs text-${theme().mutedForeground}`}>native UI showcase</Text>
      </View>
    </View>
    <View class="flex-col gap-1">
      <Text class={`text-xs font-semibold px-3 pb-1 text-${theme().mutedForeground}`}>NAVIGATION</Text>
      <View class="flex-col gap-1">
        <View class={`absolute left-0 right-0 top-0 h-10 rounded-lg bg-${theme().accentSoft}`} style={{ translateY: indicator.get() }} />
        {TABS.map((t: TabInfo, i: i32) => <NavItem index={i} />)}
      </View>
    </View>
    <View class="grow" />
    <View class={`flex-col gap-3 p-3 rounded-xl border border-${theme().border}`}>
      <View class="flex-row items-center gap-3">
        <View class={`w-9 h-9 rounded-full items-center justify-center bg-${theme().accent}`}>
          <Text class="text-xs font-bold text-white">{initialsOf(name())}</Text>
        </View>
        <View class="flex-col grow">
          <Text class={`text-sm font-semibold text-${theme().foreground}`}>{name()}</Text>
          <Text class={`text-xs text-${theme().mutedForeground}`}>Pro plan</Text>
        </View>
      </View>
      <Switch checked={dark} onChange={(on: boolean) => setDark(on)} label="Dark mode" />
    </View>
  </View>;
}

let unread: i32 = 0;
function TopBar(): i32 {
  return <View class={`flex-row items-center h-16 px-6 gap-4 border-b border-${theme().border} bg-${theme().card}`}>
    <View class="flex-col grow" style={{ opacity: 0.35 + 0.65 * slide.get() }}>
      <Text class={`text-lg font-bold text-${theme().foreground}`}>{TABS[tab()].label}</Text>
      <Text class={`text-xs text-${theme().mutedForeground}`}>{TABS[tab()].hint}</Text>
    </View>
    <View class={`flex-row items-center gap-2 w-[260] h-9 px-3 rounded-lg border cursor-pointer border-${theme().border} bg-${theme().background} hover:border-${theme().mutedForeground}`}
      onClick={() => openPalette()}>
      <Icon kind={SEARCH_ICON} size={16} color={() => rgb(theme().mutedForeground)} />
      <Text class={`text-sm grow text-${theme().mutedForeground}`}>Search or jump to…</Text>
      <Kbd label="⌘K" />
    </View>
    <View class={`px-2 h-7 rounded-md items-center justify-center bg-${theme().muted}`}>
      <Text class={`text-xs font-semibold text-${theme().mutedForeground}`}>{`${fps()} fps`}</Text>
    </View>
    <View class={`w-9 h-9 rounded-lg items-center justify-center cursor-pointer hover:bg-${theme().muted}`}
      onClick={() => { unread++; toast('You are all caught up', `Checked ${unread} time${unread > 1 ? 's' : ''} this session.`, 'success'); }}>
      <Icon kind={BELL_ICON} color={() => rgb(theme().foreground)} />
      <View class="absolute right-[7] top-[7] w-2 h-2 rounded-full bg-rose-500" />
    </View>
  </View>;
}

/** One screen on the stage: stacked, and moved / faded by the tab transition. */
export function Screen(props: { index: i32; children: () => i32 }): i32 {
  const i = props.index;
  return <View class="absolute inset-0 flex-col"
    style={{ hidden: screenHidden(i), translateX: screenX(i), opacity: screenOpacity(i) }}>
    {props.children()}
  </View>;
}

/** The stage (the area under the top bar): screens measure themselves against it. */
export const stageRef = createNodeRef();
/** Stage size in px (signals: layouts that depend on it follow window resizes). */
export const [stageW, setStageW] = createSignal<number>(0);
export const [stageH, setStageH] = createSignal<number>(0);
/** Called every frame: publishes the stage size when it changes. */
export function syncStage(): void {
  const b = ui.screenBox(stageRef.node);
  setStageW(b[2]); setStageH(b[3]);
}

/** Sidebar + top bar + stage; `stage` holds the screens (and the detail layer). */
export function Shell(props: { children: () => i32 }): i32 {
  return <View class={`flex-row h-full bg-${theme().background}`}>
    <Sidebar />
    <View class="flex-col grow">
      <TopBar />
      <View ref={stageRef} class="grow overflow-hidden">
        {props.children()}
      </View>
    </View>
  </View>;
}
