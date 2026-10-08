// Navigation and data of zinc:ui/nuxt (ZN-357.04): Tabs, Accordion, Breadcrumb, Pagination, NavigationMenu, Table and a Dashboard layout preview.
import { createSignal } from 'zinc:ui/solid';
import { theme, hex, Card, Tabs, Accordion, Table, Pagination, Breadcrumb, NavigationMenu, DashboardGroup, DashboardSidebar, DashboardPanel, DashboardNavbar,
  DashboardToolbar, Button, Badge, Avatar } from 'zinc:ui/nuxt';

export const [tab, setTab] = createSignal<i32>(0);
export const [linkTab, setLinkTab] = createSignal<i32>(1);
export const [open, setOpen] = createSignal<i32[]>([0]);
export const [page, setPage] = createSignal<i32>(3);
export const [sort, setSort] = createSignal<i32>(-1);
export const [desc, setDesc] = createSignal<boolean>(false);
export const [selected, setSelected] = createSignal<i32[]>([]);
export const [section, setSection] = createSignal<string>('Inbox');
export const [narrow, setNarrow] = createSignal<boolean>(false);
export const PEOPLE: string[][] = [
  ['Ada Lovelace', 'ada@example.com', 'Admin', '42'], ['Grace Hopper', 'grace@example.com', 'Member', '17'], ['Alan Turing', 'alan@example.com', 'Member', '8'],
  ['Katherine Johnson', 'kj@example.com', 'Owner', '120'], ['Radia Perlman', 'radia@example.com', 'Member', '33'],
];
export function sortBy(col: i32): void { if (sort() === col) setDesc(!desc()); else { setSort(col); setDesc(false); } }
function Nav(p: { collapsed: boolean }): i32 {
  return <NavigationMenu orientation="vertical" collapsed={p.collapsed} items={[
    { label: 'Home', icon: 'house', active: section() === 'Home', onSelect: () => setSection('Home') },
    { label: 'Inbox', icon: 'inbox', badge: '4', active: section() === 'Inbox', onSelect: () => setSection('Inbox') },
    { label: 'Customers', icon: 'users', active: section() === 'Customers', onSelect: () => setSection('Customers') },
    { label: 'Settings', icon: 'settings', active: section() === 'Settings', onSelect: () => setSection('Settings') }]} />;
}

export function Navigation(): i32 {
  return <View class="flex-row gap-6 p-6 items-start">
    <View class="flex-col gap-6 w-[480px]">
      <Card title="Tabs">
        <Tabs items={[{ label: 'Account', icon: 'user' }, { label: 'Password' }, { label: 'Billing', badge: '2' }]} modelValue={tab} onUpdate={setTab}
          content={(i: i32) => <Text class={`text-sm text-${hex(theme().textMuted)}`}>{`The ${['account', 'password', 'billing'][i]} panel.`}</Text>} />
        <Tabs items={[{ label: 'Overview' }, { label: 'Activity' }, { label: 'Members' }]} modelValue={linkTab} onUpdate={setLinkTab} variant="link" color="neutral" />
      </Card>
      <Card title="Accordion">
        <Accordion open={open} onUpdate={setOpen} items={[
          { label: 'What is Zinc?', icon: 'circle-question-mark', content: 'An engine that runs TypeScript apps natively, from desktops to microcontrollers.' },
          { label: 'Is it fast?', icon: 'zap', content: 'Ahead-of-time compiled, with an interpreter for development.' },
          { label: 'Which components?', icon: 'package', content: 'zinc:ui, its kits, React Native and Nuxt UI looks.' }]} />
      </Card>
      <Card title="Breadcrumb · Pagination">
        <Breadcrumb items={[{ label: 'Home', icon: 'house' }, { label: 'Docs', icon: 'book-open' }, { label: 'Components' }]} />
        <Pagination page={page} onUpdate={setPage} total={120} />
      </Card>
    </View>
    <View class="flex-col gap-6 w-[540px]">
      <Card title="Table" description="Sort by name or count; select rows.">
        <Table columns={[{ key: 'name', label: 'Name', sortable: true, width: 170 }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role', width: 90 }, { key: 'count', label: 'Count', sortable: true, width: 90 }]}
          rows={PEOPLE} sort={sort} descending={desc} onSort={sortBy} selected={selected} onSelect={setSelected} />
        <Text class={`text-sm text-${hex(theme().textMuted)}`}>{`${selected().length} of ${PEOPLE.length} selected`}</Text>
      </Card>
      <Card title="Dashboard layout">
        <View class={`h-[260px] border border-${hex(theme().border)} rounded-[8px] overflow-hidden`}>
          <DashboardGroup>
            <DashboardSidebar collapsed={narrow} width={180} header={() => <Avatar alt="Zinc Labs" size="sm" />}
              footer={() => <Button icon={narrow() ? 'chevron-right' : 'chevron-left'} color="neutral" variant="ghost" onClick={() => setNarrow(!narrow())} />}>
              <Nav collapsed={narrow()} />
            </DashboardSidebar>
            <DashboardPanel header={() => <View class="flex-col">
              <DashboardNavbar title={section()} right={() => <Badge label="4 new" variant="subtle" />} />
              <DashboardToolbar><Text class={`text-sm text-${hex(theme().textMuted)}`}>Toolbar</Text></DashboardToolbar>
            </View>}>
              <Text class={`text-sm text-${hex(theme().text)}`}>{`${section()} content.`}</Text>
            </DashboardPanel>
          </DashboardGroup>
        </View>
      </Card>
    </View>
  </View>;
}
