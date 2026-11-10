import { SegmentedControl, Select, Switch, Separator, theme } from 'zinc:ui/kit';
import { Settings } from '../state';
export function Appearance(p: { model: Settings }): i32 {
  const m = p.model;
  return <View className="flex-col gap-6">
    <View className="flex-col gap-3">
      <Text className={`text-[15px] font-medium text-${theme().foreground}`}>Theme</Text>
      <Text className={`text-[12px] text-${theme().mutedForeground}`}>Preview immediately. Discard restores your saved appearance.</Text>
      <SegmentedControl label="Color theme" items={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} value={() => m.draft().scheme} onChange={(scheme: string) => m.edit({ ...m.draft(), scheme })} />
    </View>
    <Separator />
    <Select label="Accent color" value={() => m.draft().accent} onChange={(accent: string) => m.edit({ ...m.draft(), accent })} items={[{ value: 'neutral', label: 'Neutral' }, { value: 'blue', label: 'Blue' }, { value: 'green', label: 'Green' }, { value: 'orange', label: 'Orange' }]} />
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>One accent for selection, actions and keyboard focus.</Text>
    <Separator />
    <Switch label="Reduce motion" checked={() => m.draft().reducedMotion} onChange={(reducedMotion: boolean) => m.edit({ ...m.draft(), reducedMotion })} />
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>Keep state changes and focus feedback; remove travel and bounce. Starts with your system preference.</Text>
  </View>;
}
