import { tasks, sourceTasks, scope, setScope, live, milestone, setMilestone, milestones, activity, openTask } from '../state';
import { Task, assignment } from '../models';

function Nav(props: { id: string, label: string, count: () => number }): i32 {
  return <Button onClick={() => setScope(props.id)} className={`flex-row items-center h-[36] px-3 rounded-[5] gap-2 ${scope() === props.id ? 'bg-[#dfe7f0]' : 'bg-transparent hover:bg-[#e7ebf1]'}`}>
    <Text className={`text-[12px] grow ${scope() === props.id ? 'text-[#355b83]' : 'text-[#758293]'}`}>{props.label}</Text>
    <Text className="text-[11px] font-mono text-[#8793a2]">{props.count()}</Text>
  </Button>;
}
export function Sidebar(): i32 {
  return <View className="w-[168] shrink-0 bg-[#f0f2f5] border-r border-[#dfe3e8] flex-col px-2 pt-2 pb-3 gap-2">
    <View className="flex-row items-center gap-3 px-2 pb-2">
      <View className="w-[24] h-[24] rounded-[5] bg-[#d9e2ec] items-center justify-center"><Text className="text-[14px] font-bold text-[#26352d]">z</Text></View>
      <View className="flex-col gap-0.5"><Text className="text-[14px] font-bold text-[#394553]">zinc</Text><Text className="text-[10px] text-[#9aa4af]">PROJET</Text></View>
    </View>
    <Text className="text-[10px] font-semibold text-[#939eab] px-3">NAVIGATION</Text>
    <View className="flex-col gap-1">
      <Nav id="all" label="Le tableau" count={() => tasks().length} />
      <Nav id="open" label="À terminer" count={() => tasks().filter((t: Task) => t.status !== 'Done').length} />
      <Nav id="active" label="En cours" count={() => tasks().filter((t: Task) => t.status === 'In Progress').length} />
      <Nav id="assigned" label="Assignations" count={() => tasks().filter((t: Task) => t.assignees.length > 0).length} />
    </View>
    <Text className="text-[10px] font-semibold text-[#939eab] px-3 pt-2">JALONS</Text>
    <ScrollView className="h-[220] shrink-0 flex-col">
      <Button onClick={() => setMilestone('')} className={`h-[40] px-3 rounded-[5] ${milestone() === '' ? 'bg-[#dfe7f0]' : 'bg-transparent hover:bg-[#e7ebf1]'}`}><Text className="text-[12px] text-[#546579]">Tous les jalons</Text></Button>
      {milestones().map((m: string) => <Button onClick={() => setMilestone(m)} className={`h-[40] px-3 rounded-[5] ${milestone() === m ? 'bg-[#dfe7f0]' : 'bg-transparent hover:bg-[#e7ebf1]'}`}><Text className="text-[12px] text-[#758293]" numberOfLines={1}>{m}</Text></Button>)}
    </ScrollView>
    <Text className="text-[10px] font-semibold text-[#939eab] px-3 pt-2">PRISES EN CHARGE</Text>
    <ScrollView className="h-[136] shrink-0 flex-col gap-1">
      {sourceTasks().filter((t: Task) => t.status === 'In Progress').map((t: Task) => <Button onClick={() => openTask(t.id)} className="flex-col items-start px-3 py-2 rounded-[5] bg-transparent hover:bg-[#e7ebf1] gap-1">
        <Text className="text-[11px] text-[#65809e]">{t.id}</Text><Text className="text-[11px] text-[#758293]" numberOfLines={1}>{assignment(t)}</Text>
      </Button>)}
    </ScrollView>
    <View className="grow" />
    <View className="flex-col gap-2 px-2 pt-2 border-t border-[#dfe3e8]">
      <Text className={`text-[12px] ${live() ? 'text-[#658675]' : 'text-[#bd8059]'}`}>{live() ? '●  Source connectée' : '○  Source déconnectée'}</Text>
      <Text className="text-[10px] leading-[15] text-[#909ca9]">Assignations déclarées. Présence des agents non vérifiée.</Text>
      <Text className="text-[10px] text-[#909ca9]">{activity().length + ' changements observés'}</Text>
    </View>
  </View>;
}
