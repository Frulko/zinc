// Every line of ipod.specs(), grouped as the plugin groups them (iPod, Storage, Library, Artwork, SysInfoExtended), one table
// per group.
import * as ipod from 'zinc:ipod';
import { PodLibrary } from '../../services/ipod';
import { bg, bd, fg, CARD, BORDER, TEXT, MUTED } from '../../constants';

class Group { name: string; items: ipod.SpecItem[] = []; constructor(name: string) { this.name = name; } }

function groupsOf(specs: ipod.SpecItem[]): Group[] {
  const out: Group[] = [];
  for (const it of specs) {
    if (out.length === 0 || out[out.length - 1].name !== it.group) out.push(new Group(it.group));
    out[out.length - 1].items.push(it);
  }
  return out;
}

function GroupTable(props: { g: Group }): i32 {
  const g = props.g;
  return <View className="flex-col gap-2">
    <Text className={`text-[15px] font-semibold px-1 ${fg(TEXT)}`}>{g.name}</Text>
    <View className={`flex-col rounded-[10] border overflow-hidden ${bg(CARD)} ${bd(BORDER)}`}>
      {g.items.map((it: ipod.SpecItem, i: i32) => <View className={`flex-row items-start gap-4 px-4 py-2 ${i > 0 ? `border-t ${bd(BORDER)}` : ''}`}>
        <Text className={`w-[220] text-[13px] ${fg(MUTED)}`}>{it.name}</Text>
        <Text className={`grow basis-0 text-[13px] ${fg(TEXT)}`}>{it.value}</Text>
      </View>)}
    </View>
  </View>;
}

export function SpecsPage(props: { lib: PodLibrary }): i32 {
  return <ScrollView className="grow">
    <View className="flex-col gap-6 px-10 py-8">
      <View className="flex-col">
        <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>Specs</Text>
        <Text className={`text-[13px] ${fg(MUTED)}`}>Everything the iPod and its database say about it</Text>
      </View>
      {groupsOf(props.lib.specs).map((g: Group) => <GroupTable g={g} />)}
    </View>
  </ScrollView>;
}
