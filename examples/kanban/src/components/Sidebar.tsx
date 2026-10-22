import { tasks, sourceTasks, scope, setScope, live, milestone, setMilestone, milestones, activity, openTask } from '../state';
import { Task, assignment } from '../models';

function Nav(props: { id: string, label: string, count: () => number }): i32 {
  return <Button onClick={() => setScope(props.id)} className={`flex-row items-center h-[42] px-3 rounded-lg gap-2 ${scope() === props.id ? 'bg-[#38463e]' : 'bg-transparent hover:bg-[#2d3932]'}`}>
    <Text className={`text-[13px] grow ${scope() === props.id ? 'text-[#fff6e8]' : 'text-[#a9b6ab]'}`}>{props.label}</Text>
    <Text className="text-[11px] font-mono text-[#9bab9c]">{props.count()}</Text>
  </Button>;
}
export function Sidebar(): i32 {
  return <View className="w-[196] shrink-0 bg-[#26352d] flex-col px-4 pt-7 pb-4 gap-3">
    <View className="flex-row items-center gap-3 px-2 pb-5">
      <View className="w-[34] h-[34] rounded-[10] bg-[#da9168] items-center justify-center"><Text className="text-[23px] font-bold text-[#26352d]">z</Text></View>
      <View className="flex-col gap-0.5"><Text className="text-[18px] font-bold text-[#f8f6ed]">zinc</Text><Text className="text-[10px] text-[#a4b4a4]">PROJECT ROOM</Text></View>
    </View>
    <Text className="text-[10px] font-semibold text-[#8fa38f] px-3">ESPACE DE TRAVAIL</Text>
    <View className="flex-col gap-1">
      <Nav id="all" label="Le tableau" count={() => tasks().length} />
      <Nav id="open" label="À terminer" count={() => tasks().filter((t: Task) => t.status !== 'Done').length} />
      <Nav id="active" label="En cours" count={() => tasks().filter((t: Task) => t.status === 'In Progress').length} />
      <Nav id="assigned" label="Assignations" count={() => tasks().filter((t: Task) => t.assignees.length > 0).length} />
    </View>
    <Text className="text-[10px] font-semibold text-[#8fa38f] px-3 pt-4">JALONS</Text>
    <ScrollView className="h-[180] shrink-0 flex-col">
      <Button onClick={() => setMilestone('')} className={`h-[40] px-3 rounded-lg ${milestone() === '' ? 'bg-[#38463e]' : 'bg-transparent hover:bg-[#2d3932]'}`}><Text className="text-[12px] text-[#cad3c6]">Tous les jalons</Text></Button>
      {milestones().map((m: string) => <Button onClick={() => setMilestone(m)} className={`h-[40] px-3 rounded-lg ${milestone() === m ? 'bg-[#38463e]' : 'bg-transparent hover:bg-[#2d3932]'}`}><Text className="text-[12px] text-[#a9b6ab]" numberOfLines={1}>{m}</Text></Button>)}
    </ScrollView>
    <Text className="text-[10px] font-semibold text-[#8fa38f] px-3 pt-3">PRISES EN CHARGE</Text>
    <ScrollView className="h-[136] shrink-0 flex-col gap-1">
      {sourceTasks().filter((t: Task) => t.status === 'In Progress').map((t: Task) => <Button onClick={() => openTask(t.id)} className="flex-col items-start px-3 py-2 rounded-lg bg-transparent hover:bg-[#38463e] gap-1">
        <Text className="text-[11px] text-[#e2c9a6]">{t.id}</Text><Text className="text-[11px] text-[#a9b6ab]" numberOfLines={1}>{assignment(t)}</Text>
      </Button>)}
    </ScrollView>
    <View className="grow" />
    <View className="flex-col gap-2 px-2 pt-3 border-t border-[#435044]">
      <Text className={`text-[12px] ${live() ? 'text-[#b6d2ae]' : 'text-[#dfad80]'}`}>{live() ? '●  Source connectée' : '○  Source déconnectée'}</Text>
      <Text className="text-[10px] leading-[15] text-[#93a592]">Assignations déclarées. Présence des agents non vérifiée.</Text>
      <Text className="text-[10px] text-[#93a592]">{activity().length + ' changements observés'}</Text>
    </View>
  </View>;
}
