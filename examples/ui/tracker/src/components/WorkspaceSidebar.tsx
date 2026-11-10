import { Sidebar, Progress, theme } from 'zinc:ui/kit';
import { Tracker } from '../state';
import { Issue, Status } from '../data';
export function WorkspaceSidebar(p: { model: Tracker; onNavigate: () => void }): i32 {
  return <View className="flex-col grow gap-6 min-h-0">
    <View className="px-3 pt-2 flex-col gap-1">
      <Text className={`text-[17px] font-medium text-${theme().foreground}`}>Fieldwork</Text>
      <Text className={`text-[12px] text-${theme().mutedForeground}`}>A workspace for better site visits</Text>
    </View>
    <Sidebar label="Workspace" groups={[
      { id: 'personal', label: 'Workspace', items: [ { id: 'all', label: 'All issues', icon: 'layers', badge: String(p.model.issues().length) }, { id: 'mine', label: 'My issues', icon: 'user' } ] },
      { id: 'teams', label: 'Teams', items: [ { id: 'Product', label: 'Product', icon: 'box' }, { id: 'Design', label: 'Design', icon: 'pen-tool' }, { id: 'Platform', label: 'Platform', icon: 'server' } ] },
    ]} selected={p.model.navigation} onSelect={(id: string) => { p.model.navigate(id); p.onNavigate(); }} className="w-full" />
    <View className="grow" />
    <View className={`flex-col p-3 gap-3 border-t border-${theme().border}`}>
      <Text className={`text-[13px] text-${theme().foreground}`}>Survey launch</Text>
      <Progress value={() => p.model.issues().filter((issue: Issue) => issue.status === Status.Done).length * 100 / p.model.issues().length} />
      <Text className={`text-[12px] text-${theme().mutedForeground}`}>{String(p.model.issues().filter((issue: Issue) => issue.status === Status.Done).length) + ' of ' + String(p.model.issues().length) + ' issues complete'}</Text>
      <Text className={`text-[11px] text-${theme().mutedForeground}`}>Fictional team · local demo data</Text>
    </View>
  </View>;
}
