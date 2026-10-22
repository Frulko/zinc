import { Dialog } from 'zinc:ui/kit';
import { Icon } from 'zinc:icons';
import { selected, selectedId, detail, detailError, closeTask, moveTask, declaredState } from '../state';
import { assignment, Criterion } from '../models';
import { STATUSES, COLUMN_NAMES } from '../constants';

export function TaskModal(): i32 {
  return <Dialog open={() => selectedId() !== ''} onOpenChange={(open: boolean) => { if (!open) closeTask(); }} className="w-[760] max-w-full" title="Détail de la tâche">
    <View className="flex-col gap-4">
      <View className="flex-row items-center gap-3">
        <Text className="font-mono text-[12px] text-[#9c754b] grow">{selectedId() + '  /  ' + (selected()?.milestone ?? 'Zinc Next')}</Text>
        <Button onClick={closeTask} aria-label="Fermer le détail" className="h-[40] w-[40] items-center justify-center rounded-lg bg-[#f1f1eb]"><Text className="text-[18px] text-[#576150]">×</Text></Button>
      </View>
      <Text className="text-[24px] font-bold text-[#344236] leading-[30]" numberOfLines={3}>{selected()?.title ?? ''}</Text>
      <View className="flex-row gap-3 items-center">
        <Text className="text-[12px] text-[#6b805f]">{selected() !== null ? assignment(selected()!) : ''}</Text>
        <Text className="text-[11px] text-[#969a90]">{declaredState(selectedId())}</Text>
      </View>
      <View className="flex-row gap-1">
        {STATUSES.map((status: string, i: i32) => <Button onClick={() => { if (selected()?.status !== status) moveTask(selectedId(), status); }} className={`h-[40] px-3 rounded-lg ${selected()?.status === status ? 'bg-[#384d3e]' : 'bg-[#efefe9] hover:bg-[#e4e7dc]'}`}>
          <Text className={`text-[12px] ${selected()?.status === status ? 'text-[#ffffff]' : 'text-[#697362]'}`}>{COLUMN_NAMES[i]}</Text>
        </Button>)}
      </View>
      <Text className="text-[11px] text-[#9b805e]">Déplacements locaux · le fichier de tâche reste intact · Échap pour fermer</Text>
      <ScrollView className="h-[370] flex-col gap-4 pr-2">
        {detail() === null && <Text className="text-[13px] text-[#8c917e]">{detailError() !== '' ? detailError() : 'Chargement du détail…'}</Text>}
        {detail() !== null && <View className="flex-col gap-4">
          <Text className="text-[11px] font-semibold text-[#9c754b]">DESCRIPTION</Text>
          <Text className="text-[14px] leading-[21] text-[#515b4c]">{detail()!.description !== '' ? detail()!.description : 'Aucune description.'}</Text>
          <Text className="text-[11px] font-semibold text-[#9c754b]">CRITÈRES D’ACCEPTATION</Text>
          {detail()!.criteria.map((c: Criterion) => <View className="flex-row items-start gap-2">
            <Icon name={c.checked ? 'square-check' : 'square'} size={16} color={() => c.checked ? 0x658c68 : 0xb7b9ae} />
            <Text className="grow text-[13px] leading-[20] text-[#515b4c]">{c.text}</Text>
          </View>)}
          <Text className="text-[12px] text-[#8c917e]">{'Dépendances : ' + (detail()!.dependencies.join(', ') || 'aucune') + (selected() !== null && selected()!.parent !== '' ? '  ·  Parent : ' + selected()!.parent : '')}</Text>
          {detail()!.plan !== '' && <View className="flex-col gap-2"><Text className="text-[11px] font-semibold text-[#9c754b]">PLAN</Text><Text className="text-[13px] leading-[20] text-[#515b4c]">{detail()!.plan}</Text></View>}
          {detail()!.notes !== '' && <View className="flex-col gap-2"><Text className="text-[11px] font-semibold text-[#9c754b]">NOTES D’IMPLÉMENTATION</Text><Text className="text-[13px] leading-[20] text-[#515b4c]">{detail()!.notes}</Text></View>}
          {detail()!.summary !== '' && <View className="flex-col gap-2"><Text className="text-[11px] font-semibold text-[#9c754b]">RÉSULTAT</Text><Text className="text-[13px] leading-[20] text-[#515b4c]">{detail()!.summary}</Text></View>}
          <Text className="font-mono text-[10px] text-[#969a90]">{detail()!.path}</Text>
        </View>}
      </ScrollView>
    </View>
  </Dialog>;
}
