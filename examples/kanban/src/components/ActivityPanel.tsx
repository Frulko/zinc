import { Dialog } from 'zinc:ui/kit';
import { activity, activityOpen, setActivityOpen } from '../state';

export function ActivityPanel(): i32 {
  return <Dialog open={activityOpen} onOpenChange={setActivityOpen} title="Activité du backlog" className="w-[700] max-w-full">
    <View className="flex-col gap-4">
      <Text className="text-[13px] leading-[20] text-[#6a755e]">Les derniers changements observés depuis l’ouverture, heure UTC. Une assignation indique qui a pris ou réservé la tâche ; elle ne prouve pas que son processus tourne encore.</Text>
      <ScrollView className="h-[300] flex-col gap-2">
        {activity().length === 0 && <Text className="text-[14px] text-[#939a88]">En attente d’un changement de statut ou d’assignation…</Text>}
        {activity().map((line: string) => <View className="p-3 rounded-lg bg-[#f2f3ec]"><Text className="text-[13px] leading-[20] text-[#526348]">{line}</Text></View>)}
      </ScrollView>
      <Button onClick={() => setActivityOpen(false)} className="h-[40] px-4 rounded-lg bg-[#384d3e]"><Text className="text-[13px] text-[#ffffff]">Fermer</Text></Button>
    </View>
  </Dialog>;
}
