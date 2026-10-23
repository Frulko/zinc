import { Icon } from 'zinc:icons';

function renderContent(children: (() => i32) | undefined): i32 { return children !== undefined ? children() : <View />; }

export function Section(p: { title: string; icon: string; number: string; hint: string; children?: () => i32 }): i32 {
  return <View className="flex-col rounded-[10px] border border-[#e1e5dd] bg-white p-5 gap-3">
    <View className="flex-row items-center gap-3 pb-2">
      <View className="w-9 h-9 rounded-[6px] bg-[#edf3e9] items-center justify-center"><Icon name={p.icon} size={18} color={() => 0x40634b} /></View>
      <View className="grow gap-0.5">
        <Text className="text-[16px] font-semibold text-[#243c31]">{p.title}</Text>
        <Text className="text-xs text-[#738071]">{p.hint}</Text>
      </View>
      <Text className="font-mono text-xs text-[#929d8b]">{p.number}</Text>
    </View>
    {renderContent(p.children)}
  </View>;
}
