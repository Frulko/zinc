// The shell: a sidebar with the pages, a navbar with the app menu, the current page. The look is the kit's Quiet theme (docs/design.md):
// neutral surfaces, one accent, hairline borders; useQuietTheme('blue') picks another accent.
import { render, Show } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { Button, Tooltip, DropdownMenu, Avatar, theme, themeColor, useQuietTheme, toast } from 'zinc:ui/kit';
import { PAGES, ICONS } from './router';
import { page, go, back, collapsed, setCollapsed, dark, setDark, addNote } from './state';
import { Home } from './pages/home';
import { Notes } from './pages/notes';
import { Settings } from './pages/settings';
import { installMenus } from './desktop';

const APP_NAME = '{{name}}';

/** A page in the sidebar: its icon and name, the current one on the accent's quiet tint. */
function NavItem(props: { name: string; icon: string }): i32 {
  const t = theme(), on = (): boolean => page() === props.name;
  return <View role="button" focusable aria-label={props.name} onClick={() => go(props.name)}
    className={`flex-row items-center gap-2 h-[32px] px-2 rounded-[8px] cursor-pointer transition-colors ${on() ? 'bg-' + t.accentSoft : `focus:bg-${t.subtle}`}`}>
    <Icon name={props.icon} size={16} strokeWidth={1.75} color={() => themeColor(on() ? 'accentSoftForeground' : 'mutedForeground')} />
    <Show when={!collapsed()}><Text className={`text-[13px] text-${on() ? t.accentSoftForeground : t.foreground}`}>{props.name}</Text></Show>
  </View>;
}

/** An icon-only button: the icon in the text colour, its name in a tooltip (docs/design.md). */
function IconButton(props: { icon: string; name: string; onClick: () => void }): i32 {
  return <Tooltip label={props.name}><Button variant="ghost" size="icon" onClick={props.onClick}><Icon name={props.icon} size={16} strokeWidth={1.75} color={() => themeColor('foreground')} /></Button></Tooltip>;
}

function Sidebar(): i32 {
  const t = theme();
  return <View className={`flex-col gap-4 p-3 ${collapsed() ? 'w-[60px]' : 'w-[220px]'} border-r border-${t.border} bg-${t.card}`}>
    <View className="flex-row items-center gap-2 px-1 h-[36px]">
      <Avatar name={APP_NAME} size="sm" />
      <Show when={!collapsed()}><Text className={`text-[13px] font-medium text-${t.foreground}`}>{APP_NAME}</Text></Show>
    </View>
    <View className="flex-col gap-0.5 grow">{PAGES.map((p: string, i: i32) => <NavItem name={p} icon={ICONS[i]} />)}</View>
    <View className={`flex-row items-center gap-1 ${collapsed() ? 'flex-col' : ''}`}>
      <IconButton icon={dark() ? 'sun' : 'moon'} name="Toggle dark mode" onClick={() => setDark(!dark())} />
      <IconButton icon={collapsed() ? 'chevron-right' : 'chevron-left'} name="Collapse the sidebar" onClick={() => setCollapsed(!collapsed())} />
    </View>
  </View>;
}

function Navbar(): i32 {
  const t = theme();
  return <View className={`flex-row items-center gap-2 h-[52px] px-4 border-b border-${t.border}`}>
    <Icon name={ICONS[PAGES.indexOf(page())]} size={16} strokeWidth={1.75} color={() => themeColor('mutedForeground')} />
    <Text className={`grow text-[15px] font-medium text-${t.foreground}`}>{page()}</Text>
    <IconButton icon="chevron-left" name="Back" onClick={() => back()} />
    <DropdownMenu label="File" variant="outline" placement="bottom-end" items={[
      { label: 'New note', onSelect: () => { addNote(`Note ${new Date().toLocaleTimeString()}`); go('Notes'); } },
      { label: dark() ? 'Light mode' : 'Dark mode', onSelect: () => setDark(!dark()) },
      { label: 'About', onSelect: () => toast(APP_NAME, 'Made with Zinc') }]} />
  </View>;
}

function App(): i32 {
  return <View className={`flex-row w-full h-full bg-${theme().background}`}>
    <Sidebar />
    <View className="flex-col grow">
      <Navbar />
      <View className="flex-col grow p-6">
        <Show when={page() === 'Home'}><Home /></Show>
        <Show when={page() === 'Notes'}><Notes /></Show>
        <Show when={page() === 'Settings'}><Settings /></Show>
      </View>
    </View>
  </View>;
}

useQuietTheme();
installMenus(APP_NAME);
render(App, 0xf2f2f2, (dt: number) => {});
