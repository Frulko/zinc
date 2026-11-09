import { createSignal } from 'zinc:ui/solid';
import { Tree, TreeTable, TreeItem, heading, theme } from 'zinc:ui/kit';
const items: TreeItem[] = [{ id: 'audio', label: 'Audio', cells: ['Folder', '18 files'], children: [{ id: 'forest', label: 'Forest at dawn.wav', cells: ['Audio', '48 MB'] }, { id: 'rain', label: 'Rain on the roof.wav', cells: ['Audio', '32 MB'] }] }, { id: 'notes', label: 'Notes', cells: ['Folder', '2 files'], children: [{ id: 'journal', label: 'Field journal.md', cells: ['Markdown', '12 KB'] }] }, { id: 'locked', label: 'Archive', cells: ['Unavailable', ''], disabled: true }];
const [expanded, setExpanded] = createSignal<string[]>(['audio']), [selected, setSelected] = createSignal<string[]>(['forest']);
export function TreeExample(): i32 {
  return <View className="flex-col gap-3">
    <Text className={heading(3)}>Project folders</Text>
    <View className="flex-row flex-wrap gap-4 items-start">
      <Tree label="Project tree" items={() => items} expanded={expanded} onExpandedChange={setExpanded} selected={selected} onSelect={setSelected} height={220} className="w-[330px] max-w-full" />
      <TreeTable label="Project files" items={() => items} expanded={expanded} onExpandedChange={setExpanded} selected={selected} onSelect={setSelected} height={220} className="w-[520px] max-w-full min-w-0" columns={[{ id: 'name', label: 'Name', width: 280 }, { id: 'kind', label: 'Kind', width: 140 }, { id: 'size', label: 'Size', width: 100, align: 'right' }]} />
    </View>
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>The tree and table share selection. Right opens; Left closes or moves to the parent.</Text>
  </View>;
}
