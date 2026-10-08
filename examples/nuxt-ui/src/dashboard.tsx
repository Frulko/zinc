// The dashboard app of examples/nuxt-ui (ZN-357.05), after Nuxt UI's dashboard template: a collapsible sidebar (team, navigation, the scheme switch), and
// Home (stats, a bar chart, recent orders), Inbox, Customers (search, a table, a "New customer" modal with a form), Settings (profile and notification forms),
// and the gallery and the navigation pages of every component. NUXT_SECTION=<section> opens one.
import { createSignal, Show } from 'zinc:ui/solid';
import { theme, hex, colorMode, setColorMode, DashboardGroup, DashboardSidebar, DashboardPanel, DashboardNavbar, DashboardToolbar, NavigationMenu, Button, Badge,
  NavigationItem, Avatar, Card, Input, Textarea, Select, Checkbox, Switch, Tabs, Table, Modal, DropdownMenu, addToast } from 'zinc:ui/nuxt';
import { Gallery } from './gallery';
import { Navigation } from './navigation';

export const [section, setSection] = createSignal<string>('Home');
export const [collapsed, setCollapsed] = createSignal<boolean>(false);
export const [range, setRange] = createSignal<i32>(1);
export const [query, setQuery] = createSignal<string>('');
export const [creating, setCreating] = createSignal<boolean>(false);
export const [newName, setNewName] = createSignal<string>('');
export const [newEmail, setNewEmail] = createSignal<string>('');
export const [customers, setCustomers] = createSignal<string[][]>([
  ['Alex Smith', 'alex.smith@example.com', 'New York, USA', 'subscribed'], ['Jordan Brown', 'jordan.brown@example.com', 'London, UK', 'unsubscribed'],
  ['Taylor Green', 'taylor.green@example.com', 'Paris, France', 'bounced'], ['Morgan White', 'morgan.white@example.com', 'Berlin, Germany', 'subscribed'],
  ['Casey Gray', 'casey.gray@example.com', 'Tokyo, Japan', 'subscribed'], ['Jamie Johnson', 'jamie.johnson@example.com', 'Sydney, Australia', 'unsubscribed'],
]);
export const [selectedCustomers, setSelectedCustomers] = createSignal<i32[]>([]);
export const [name, setName] = createSignal<string>('Benjamin Canac');
export const [bio, setBio] = createSignal<string>('Building a UI library.');
export const [weekly, setWeekly] = createSignal<boolean>(true);
export const [product, setProduct] = createSignal<boolean>(false);
export const [plan, setPlan] = createSignal<string>('Pro');
export const [planOpen, setPlanOpen] = createSignal<boolean>(false);
const SECTIONS: string[] = ['Home', 'Inbox', 'Customers', 'Settings', 'Components', 'Navigation'];
const ICONS: string[] = ['house', 'inbox', 'users', 'settings', 'package', 'book-open'];

function renderMuted(s: string, size: string = 'text-sm'): i32 { return <Text class={`${size} text-${hex(theme().textMuted)}`}>{s}</Text>; }

// ---------------------------------------------------------------- Home
const STATS: string[][] = [['Customers', '1,284', '+12%', 'users'], ['Conversions', '8.6%', '+3%', 'zap'], ['Revenue', '$48,930', '-4%', 'chart-column'], ['Orders', '2,341', '+21%', 'package']];
const BARS: number[] = [32, 48, 41, 65, 52, 78, 70, 58, 84, 76, 92, 88];
const MONTHS: string[] = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const ORDERS: string[][] = [['#4600', 'Mar 11, 15:30', 'paid', 'james.anderson@example.com', '$594'], ['#4599', 'Mar 11, 10:10', 'failed', 'mia.white@example.com', '$276'],
  ['#4598', 'Mar 11, 08:50', 'refunded', 'william.brown@example.com', '$315'], ['#4597', 'Mar 10, 19:45', 'paid', 'emma.davis@example.com', '$529']];
function Home(): i32 {
  return <View class="flex-col gap-6">
    <View class="flex-row gap-4">
      <For each={STATS}>{(s: string[], i: i32) => <Card class="grow basis-0">
        <View class="flex-row items-center gap-3">
          <View class={`p-2 rounded-full bg-${hex(theme().primary, 10)}`}><Badge icon={s[3]} variant="soft" size="lg" /></View>
          <View class="flex-col">
            {renderMuted(s[0], 'text-xs')}
            <View class="flex-row items-center gap-2">
              <Text class={`text-2xl font-semibold text-${hex(theme().textHighlighted)}`}>{s[1]}</Text>
              <Badge label={s[2]} color={s[2].startsWith('-') ? 'error' : 'success'} variant="subtle" size="sm" />
            </View>
          </View>
        </View>
      </Card>}</For>
    </View>
    <Card title="Revenue" description="The last 12 months.">
      <View class="flex-row items-end gap-3 h-[180px]">
        <For each={BARS}>{(v: number, i: i32) => <View class="flex-col items-center gap-1 grow">
          <View class={`w-full h-[${Math.round(v * 1.6)}px] rounded-[4px] bg-${hex(theme().primary)}`} />
          {renderMuted(MONTHS[i], 'text-xs')}
        </View>}</For>
      </View>
    </Card>
    <Card title="Recent orders">
      <Table columns={[{ key: 'id', label: 'ID', width: 90 }, { key: 'date', label: 'Date', width: 140 }, { key: 'status', label: 'Status', width: 110 }, { key: 'email', label: 'Email' },
        { key: 'amount', label: 'Amount', width: 100 }]} rows={ORDERS} />
    </Card>
  </View>;
}

// ---------------------------------------------------------------- Inbox
const MAILS: string[][] = [['Alex Smith', 'Meeting tomorrow', 'Can we move the review to 10am?', '10:42'], ['Jordan Brown', 'Invoice #4512', 'Your invoice is attached.', '09:15'],
  ['Taylor Green', 'Design review', 'The new dashboard looks great, a few notes inside.', 'Yesterday'], ['Morgan White', 'Welcome!', 'Thanks for joining the team.', 'Mon']];
function Inbox(): i32 {
  return <Card>
    <For each={MAILS}>{(m: string[], i: i32) => <View class={`flex-row items-start gap-3 py-3 ${i < MAILS.length - 1 ? 'border-b border-' + hex(theme().border) : ''}`}>
      <Avatar alt={m[0]} size="md" />
      <View class="flex-col grow">
        <View class="flex-row items-center justify-between">
          <Text class={`text-sm font-semibold text-${hex(theme().textHighlighted)}`}>{m[0]}</Text>
          {renderMuted(m[3], 'text-xs')}
        </View>
        <Text class={`text-sm text-${hex(theme().text)}`}>{m[1]}</Text>
        {renderMuted(m[2])}
      </View>
    </View>}</For>
  </Card>;
}

// ---------------------------------------------------------------- Customers
export function shownCustomers(): string[][] { const q = query().toLowerCase(); return customers().filter((c: string[]) => q === '' || c[0].toLowerCase().includes(q) || c[1].toLowerCase().includes(q)); }
export function addCustomer(): void {
  if (newName() === '') return;
  setCustomers(customers().concat([[newName(), newEmail(), '-', 'subscribed']]));
  addToast({ title: 'Customer added', description: newName(), icon: 'circle-check', color: 'success' });
  setNewName(''); setNewEmail(''); setCreating(false);
}
function Customers(): i32 {
  return <View class="flex-col gap-4">
    <View class="flex-row items-center gap-2">
      <Input modelValue={query} onUpdate={setQuery} placeholder="Filter emails..." icon="search" class="w-[280px]" />
      <View class="grow" />
      <Show when={selectedCustomers().length > 0}><Button label={`Delete (${selectedCustomers().length})`} color="error" variant="subtle" icon="trash-2" onClick={() => setSelectedCustomers([])} /></Show>
      <Button label="New customer" icon="plus" onClick={() => setCreating(true)} />
    </View>
    <Card>
      <Table columns={[{ key: 'name', label: 'Name', width: 170, sortable: true }, { key: 'email', label: 'Email' }, { key: 'location', label: 'Location', width: 160 }, { key: 'status', label: 'Status', width: 140 }]}
        rows={shownCustomers()} selected={selectedCustomers} onSelect={setSelectedCustomers} />
    </Card>
    <Modal open={creating} onUpdate={setCreating} title="New customer" description="Add a customer to the database." footer={() => <View class="flex-row gap-1.5">
      <Button label="Cancel" color="neutral" variant="subtle" onClick={() => setCreating(false)} /><Button label="Create" onClick={addCustomer} />
    </View>}>
      <Text class={`text-sm font-medium text-${hex(theme().text)}`}>Name</Text>
      <Input modelValue={newName} onUpdate={setNewName} placeholder="John Doe" />
      <Text class={`text-sm font-medium text-${hex(theme().text)}`}>Email</Text>
      <Input modelValue={newEmail} onUpdate={setNewEmail} placeholder="john.doe@example.com" icon="mail" />
    </Modal>
  </View>;
}

// ---------------------------------------------------------------- Settings
function renderField(c: (() => i32) | undefined): i32 { return c !== undefined ? c() : <View />; }
function Field(p: { label: string; hint: string; children?: () => i32 }): i32 {
  return <View class={`flex-row gap-6 py-4 border-b border-${hex(theme().border)}`}>
    <View class="flex-col w-[220px]"><Text class={`text-sm font-medium text-${hex(theme().textHighlighted)}`}>{p.label}</Text>{renderMuted(p.hint)}</View>
    <View class="flex-col grow gap-2">{renderField(p.children)}</View>
  </View>;
}
function Settings(): i32 {
  return <View class="flex-col gap-6">
    <Card title="Profile" description="These informations will be displayed publicly." footer={() => <Button label="Save changes" onClick={() => addToast({ title: 'Settings saved', icon: 'circle-check', color: 'success' })} />}>
      <Field label="Name" hint="Will appear on receipts."><Input modelValue={name} onUpdate={setName} /></Field>
      <Field label="Avatar" hint="JPG, GIF or PNG."><View class="flex-row items-center gap-3"><Avatar alt={name()} size="lg" /><Button label="Choose" color="neutral" variant="outline" /></View></Field>
      <Field label="Bio" hint="Brief description for your profile."><Textarea modelValue={bio} onUpdate={setBio} rows={3} /></Field>
      <Field label="Plan" hint="Change it any time."><Select items={['Free', 'Pro', 'Enterprise']} modelValue={plan} onUpdate={setPlan} open={planOpen} onOpen={setPlanOpen} /></Field>
    </Card>
    <Card title="Notifications" variant="subtle">
      <Switch label="Weekly digest" description="A summary of the week." modelValue={weekly} onUpdate={setWeekly} />
      <Switch label="Product updates" description="New features and improvements." modelValue={product} onUpdate={setProduct} />
      <Checkbox label="Email me when someone mentions me" modelValue={weekly} onUpdate={setWeekly} />
    </Card>
  </View>;
}

// ---------------------------------------------------------------- the frame
function renderNav(): i32 {
  return <NavigationMenu orientation="vertical" collapsed={collapsed()} items={SECTIONS.map((s: string, i: i32): NavigationItem => {
    return { label: s, icon: ICONS[i], badge: s === 'Inbox' ? '4' : undefined, active: section() === s, onSelect: () => setSection(s) };
  })} />;
}
export function Dashboard(): i32 {
  return <DashboardGroup>
    <DashboardSidebar collapsed={collapsed}
      header={() => <View class="flex-row items-center gap-2"><Avatar text="N" size="sm" color="primary" /><Show when={!collapsed()}><Text class={`font-semibold text-${hex(theme().textHighlighted)}`}>Nuxt</Text></Show></View>}
      footer={() => <View class={`flex-row items-center gap-1 ${collapsed() ? 'flex-col' : ''}`}>
        <Button icon={colorMode() === 'dark' ? 'sun' : 'moon'} color="neutral" variant="ghost" onClick={() => setColorMode(colorMode() === 'dark' ? 'light' : 'dark')} />
        <Button icon={collapsed() ? 'chevron-right' : 'chevron-left'} color="neutral" variant="ghost" onClick={() => setCollapsed(!collapsed())} />
      </View>}>
      {renderNav()}
    </DashboardSidebar>
    <DashboardPanel header={() => <View class="flex-col">
      <DashboardNavbar title={section()} icon={ICONS[SECTIONS.indexOf(section())]} right={() => <View class="flex-row items-center gap-1.5">
        <Button icon="bell" color="neutral" variant="ghost" />
        <DropdownMenu label="New" icon="plus" color="primary" variant="solid" items={[[{ label: 'New customer', icon: 'users', onSelect: () => { setSection('Customers'); setCreating(true); } },
          { label: 'New order', icon: 'package' }]]} placement="bottom-end" />
      </View>} />
      <Show when={section() === 'Home'}><DashboardToolbar>
        <Tabs items={[{ label: 'Daily' }, { label: 'Weekly' }, { label: 'Monthly' }]} modelValue={range} onUpdate={setRange} variant="link" color="neutral" size="sm" />
      </DashboardToolbar></Show>
    </View>}>
      <Show when={section() === 'Home'}><Home /></Show>
      <Show when={section() === 'Inbox'}><Inbox /></Show>
      <Show when={section() === 'Customers'}><Customers /></Show>
      <Show when={section() === 'Settings'}><Settings /></Show>
      <Show when={section() === 'Components'}><Gallery /></Show>
      <Show when={section() === 'Navigation'}><Navigation /></Show>
    </DashboardPanel>
  </DashboardGroup>;
}
