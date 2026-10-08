// The shell: a sidebar with the pages, a navbar with the app menu, the current page.
import { render, Show } from 'zinc:ui/solid';
import { theme, hex, DashboardGroup, DashboardSidebar, DashboardPanel, DashboardNavbar, NavigationMenu, NavigationItem, Button, DropdownMenu, Avatar, addToast } from 'zinc:ui/nuxt';
import { PAGES, ICONS } from './router';
import { page, go, back, collapsed, setCollapsed, dark, setDark, addNote } from './state';
import { Home } from './pages/home';
import { Notes } from './pages/notes';
import { Settings } from './pages/settings';
import { installMenus } from './desktop';

const APP_NAME = '{{name}}';

function renderNav(): i32 {
  return <NavigationMenu orientation="vertical" collapsed={collapsed()} items={PAGES.map((p: string, i: i32): NavigationItem => {
    return { label: p, icon: ICONS[i], active: page() === p, onSelect: () => go(p) };
  })} />;
}

function App(): i32 {
  return <View class={`w-full h-full bg-${hex(theme().bg)}`}><DashboardGroup>
    <DashboardSidebar collapsed={collapsed}
      header={() => <View class="flex-row items-center gap-2"><Avatar text={APP_NAME.slice(0, 1).toUpperCase()} size="sm" color="primary" />
        <Show when={!collapsed()}><Text class={`font-semibold text-${hex(theme().textHighlighted)}`}>{APP_NAME}</Text></Show></View>}
      footer={() => <View class={`flex-row items-center gap-1 ${collapsed() ? 'flex-col' : ''}`}>
        <Button icon={dark() ? 'sun' : 'moon'} color="neutral" variant="ghost" onClick={() => setDark(!dark())} />
        <Button icon={collapsed() ? 'chevron-right' : 'chevron-left'} color="neutral" variant="ghost" onClick={() => setCollapsed(!collapsed())} />
      </View>}>
      {renderNav()}
    </DashboardSidebar>
    <DashboardPanel header={() => <DashboardNavbar title={page()} icon={ICONS[PAGES.indexOf(page())]} right={() => <View class="flex-row items-center gap-1.5">
      <Button icon="chevron-left" color="neutral" variant="ghost" onClick={() => back()} />
      <DropdownMenu label="File" icon="menu" color="neutral" variant="outline" placement="bottom-end" items={[
        [{ label: 'New note', icon: 'plus', onSelect: () => { addNote(`Note ${new Date().toLocaleTimeString()}`); go('Notes'); } }],
        [{ label: dark() ? 'Light mode' : 'Dark mode', icon: dark() ? 'sun' : 'moon', onSelect: () => setDark(!dark()) },
         { label: 'About', icon: 'info', onSelect: () => addToast({ title: APP_NAME, description: 'Made with Zinc' }) }]]} />
    </View>} />}>
      <Show when={page() === 'Home'}><Home /></Show>
      <Show when={page() === 'Notes'}><Notes /></Show>
      <Show when={page() === 'Settings'}><Settings /></Show>
    </DashboardPanel>
  </DashboardGroup></View>;
}

installMenus(APP_NAME);
render(App, 0xffffff, (dt: number) => {});
