// The app frame: a slim title bar (page title, uptime, fps), the stage where pages slide, and a bottom navigation
// bar whose indicator glides to the selected page.
import { width } from 'zinc:gfx';
import { tk } from './ui';
import { PAGES, PageInfo, page, go, mounted, pageX, pageOpacity, navPos, fps, uptime, clockText } from '../app/state';

function TitleBar(): i32 {
  return <View class={`flex-row items-center h-8 px-3 gap-2 border-b border-${tk().border} bg-${tk().card}`}>
    <Text class={`grow text-sm font-bold text-${tk().foreground}`}>{PAGES[page()].title}</Text>
    <Text class={`text-[10px] text-${tk().mutedForeground}`}>{clockText(uptime())}</Text>
    <View class={`flex-row items-center px-1.5 h-5 rounded-md bg-${tk().muted}`}>
      <Text class={`text-[10px] font-semibold text-${tk().foreground}`}>{`${fps()} fps`}</Text>
    </View>
  </View>;
}

const NAV_ITEM: number = 48;   // 240 px / 5 pages

/** Indicator position: glides from the previous page to the selected one. */
function indicatorX(): number { return Math.round(navPos() * NAV_ITEM + (NAV_ITEM - 24) / 2); }

function NavItem(props: { index: i32 }): i32 {
  const i = props.index;
  const on = (): boolean => page() === i;
  return <View class={`flex-col items-center justify-center gap-0.5 w-[48] h-full focus:bg-${tk().card}`} onClick={() => go(i)}>
    <Image src={`${PAGES[i].icon}${on() ? '-on' : ''}.svg`} class="w-5 h-5" />
    <Text class={`text-[10px] ${on() ? `font-semibold text-${tk().accent}` : `text-${tk().mutedForeground}`}`}>{PAGES[i].label}</Text>
  </View>;
}

function NavBar(): i32 {
  return <View class={`flex-row h-12 border-t border-${tk().border} bg-${tk().card}`}>
    <View class={`absolute top-0 left-0 w-6 h-0.5 rounded-full bg-${tk().accent}`} style={{ translateX: indicatorX() }} />
    {PAGES.map((p: PageInfo, i: i32) => <NavItem index={i} />)}
  </View>;
}

/** One page on the stage: mounted only while shown, moved and faded by the transition. */
export function Page(props: { index: i32; children: () => i32 }): i32 {
  const i = props.index;
  return <Show when={mounted(i)}>
    <View class="absolute inset-0 flex-col" style={{ translateX: pageX(width()), opacity: pageOpacity() }}>
      {props.children()}
    </View>
  </Show>;
}

export function Shell(props: { children: () => i32 }): i32 {
  return <View class={`flex-col h-full bg-${tk().background}`}>
    <TitleBar />
    <View class="grow overflow-hidden">{props.children()}</View>
    <NavBar />
  </View>;
}
