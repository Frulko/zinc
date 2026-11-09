import { createNodeRef, createSignal } from 'zinc:ui/solid';
import { NavigationTabs, Sidebar, Breadcrumb, Pagination, Stepper, TableOfContents, Dock, TabBar, Button, heading, theme } from 'zinc:ui/kit';
const [tab, setTab] = createSignal<i32>(0);
const [page, setPage] = createSignal<i32>(6);
const [step, setStep] = createSignal<i32>(1);
const [section, setSection] = createSignal('projects');
const [mobile, setMobile] = createSignal('library');
const [closed, setClosed] = createSignal<string[]>([]);
const [collapsed, setCollapsed] = createSignal(false);
const [action, setAction] = createSignal('Files');
const [location, setLocation] = createSignal('Field recordings');
const scroll = createNodeRef(), install = createNodeRef(), record = createNodeRef(), share = createNodeRef();
export function NavigationSection(): i32 {
  return <View className="flex-col gap-6">
    <View className="flex-row justify-between items-center"><Text className={heading(2)}>Navigation</Text><Button size="sm" variant="outline" label={collapsed() ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed())} /></View>
    <View className="flex-row gap-8 items-start">
      <Sidebar label="Workspace" collapsed={collapsed} groups={[{ id: 'workspace', label: 'Workspace', items: [{ id: 'inbox', label: 'Inbox', icon: 'mail', badge: '12' }, { id: 'projects', label: 'Projects', icon: 'folder' }, { id: 'archive', label: 'Archive', icon: 'archive' }] }, { id: 'team', label: 'Studio', items: [{ id: 'members', label: 'Members', icon: 'users' }, { id: 'settings', label: 'Settings', icon: 'settings', disabled: true }] }]} selected={section} onSelect={setSection} closedGroups={closed} onGroupToggle={(id: string) => setClosed(closed().indexOf(id) >= 0 ? closed().filter((value: string) => value !== id) : closed().concat([id]))} />
      <View className="flex-col grow min-w-0 gap-5">
        <Breadcrumb maxItems={3} items={[{ label: 'Home', onSelect: () => setLocation('Home') }, { label: 'Studio', onSelect: () => setLocation('Studio') }, { label: 'Projects', onSelect: () => setLocation('Projects') }, { label: 'Field recordings' }]} />
        <NavigationTabs label="Project views" items={[{ id: '0', label: 'Overview' }, { id: '1', label: 'Activity' }, { id: '2', label: 'Files' }, { id: '3', label: 'Unavailable', disabled: true }]} selected={() => String(tab())} onSelect={(id: string) => setTab(parseInt(id) as i32)} variant="underline" />
        <Text role="status" className={`text-[13px] text-${theme().mutedForeground}`}>{location() + ' · ' + section() + ' · ' + ['Overview', 'Activity', 'Files', 'Unavailable'][tab()]}</Text>
        <View className="flex-col gap-3"><Text className={heading(4)}>Release a collection</Text><Stepper label="Publication" items={[{ label: 'Prepare', description: '6 recordings' }, { label: 'Review', description: 'Check the details' }, { label: 'Publish', description: 'Share a public link' }]} current={step} onSelect={setStep} /></View>
        <View className="flex-row gap-6">
          <ScrollView ref={scroll} className={`h-[210px] grow basis-0 border border-${theme().border} rounded-[18px]`}>
            <View className="flex-col gap-6 p-4">
              <View ref={install} className="flex-col gap-2"><Text className={heading(4)}>Start a collection</Text><Text className={`text-[13px] text-${theme().mutedForeground}`}>Gather the sounds from your field recorder. Keep the original files in your project folder.</Text><View className="h-12" /></View>
              <View ref={record} className="flex-col gap-2"><Text className={heading(4)}>Add recordings</Text><Text className={`text-[13px] text-${theme().mutedForeground}`}>Name each recording and note where it was made. Add a date and a short description.</Text><View className="h-12" /></View>
              <View ref={share} className="flex-col gap-2"><Text className={heading(4)}>Share your work</Text><Text className={`text-[13px] text-${theme().mutedForeground}`}>Review the collection before publishing. Your original files remain private.</Text><View className="h-40" /></View>
            </View>
          </ScrollView>
          <TableOfContents scroll={() => scroll.node} items={[{ label: 'Start a collection', anchor: () => install.node }, { label: 'Add recordings', anchor: () => record.node, level: 1 }, { label: 'Share your work', anchor: () => share.node }]} className="w-[180px]" />
        </View>
        <Pagination pages={20} page={page} onChange={setPage} />
        <View className="flex-row items-center gap-4"><Dock items={[{ id: 'Files', label: 'Files', icon: 'folder', running: true }, { id: 'Mail', label: 'Mail', icon: 'mail', badge: 3 }, { id: 'separator', label: '', separator: true }, { id: 'Archive', label: 'Archive', icon: 'archive' }]} onSelect={setAction} /><Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{action() + ' opened · page ' + (page() + 1)}</Text></View>
        <TabBar label="Library navigation" items={[{ id: 'library', label: 'Library', icon: 'folder' }, { id: 'search', label: 'Search', icon: 'search' }, { id: 'account', label: 'Account', icon: 'user', badge: '2' }]} selected={mobile} onSelect={setMobile} />
      </View>
    </View>
  </View>;
}
