import { Icon } from 'zinc:icons';
import { SettingsPage } from './settings';
import { BuildPage } from './build';

export function Workspace(): i32 {
  return <View className="w-full h-full flex-col bg-[#f5f6f0]">
    <View className="h-[76px] shrink-0 px-7 flex-row items-center gap-3 bg-[#fcfdf9] border-b border-[#dde3d8]">
      <View className="w-10 h-10 bg-[#264b37] rounded-[8px] items-center justify-center"><Icon name="layers" size={22} color={() => 0xe6f0d9} /></View>
      <View className="gap-0.5"><Text className="text-[19px] font-semibold text-[#263b2d]">Zinc Pi Image</Text><Text className="font-mono text-[10px] text-[#7a8771]">A LITTLE COMPUTER. YOUR OWN WORLD.</Text></View>
      <View className="grow" />
      <View className="flex-row items-center gap-2"><Icon name="hard-drive" size={15} color={() => 0x6a7c5e} /><Text className="text-xs text-[#6a7c5e]">Raspberry Pi OS Lite · 64-bit</Text></View>
    </View>
    <View className="flex-row grow min-h-0"><SettingsPage /><BuildPage /></View>
  </View>;
}
