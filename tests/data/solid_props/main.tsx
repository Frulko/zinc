// Props that read signals (`title={page()}`, a NavigationMenu built by `{renderNav()}`) follow the signal under Solid, as in the
// desktop-app template: a click on "Notes" (ZINC_INPUT) moves the active item and the navbar title, not only the <Show> content.
import { render, createSignal, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { DashboardGroup, DashboardSidebar, DashboardPanel, DashboardNavbar, NavigationMenu, NavigationItem } from 'zinc:ui/nuxt';

const PAGES: string[] = ['Home', 'Notes', 'Settings'];
const [page, setPage] = createSignal<string>('Home');

function renderNav(): i32 {
  return <NavigationMenu orientation="vertical" items={PAGES.map((p: string): NavigationItem => {
    return { label: p, active: page() === p, onSelect: () => setPage(p) };
  })} />;
}
function App(): i32 {
  return <View className="w-full h-full"><DashboardGroup>
    <DashboardSidebar>{renderNav()}</DashboardSidebar>
    <DashboardPanel header={() => <DashboardNavbar title={page()} />}>
      <Show when={page() === 'Notes'}><Text>Notes page</Text></Show>
    </DashboardPanel>
  </DashboardGroup></View>;
}

// The texts on screen in tree order (the sidebar's labels, the navbar title, the page) with their colours.
function texts(h: i32, out: string[], fg: i32[]): void {
  const l = ui.textLines(h);
  if (l.length > 0) { out.push(l.join(' ')); fg.push(ui.textFg(h)); }
  for (let i = 0; i < ui.childCount(h); i++) texts(ui.childAt(h, i), out, fg);
}
function report(when: string): void {
  const out: string[] = [], fg: i32[] = [];
  texts(ui.rootNode(), out, fg);
  let active = '';   // the label drawn in another colour than the other two
  for (let i = 0; i < 3; i++) if (fg[i] !== fg[(i + 1) % 3] && fg[i] !== fg[(i + 2) % 3]) active = out[i];
  console.log(`${when}: active=${active} title=${out[3]} page=${out.length > 4 ? out[4] : '-'}`);
}
let frame = 0;
render(App, 0xffffff, (dt: number) => {
  frame++;
  if (frame === 2) report('before');
  if (frame === 20) report('after');
});
