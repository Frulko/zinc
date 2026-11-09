import { Button, theme } from 'zinc:ui/kit';
import { store, selectLayer, word } from '../state';
import { tr } from '../i18n';
export function ZoneSelector(): i32 {
  return <View className={`flex-row flex-wrap gap-1 px-3 py-1 items-center border-b border-${theme().border}`}>
    <Text className={`text-xs text-${theme().mutedForeground}`}>{tr('mapper.focus.zone')}</Text>
    {store.layers.map((layer: any, index: i32) => <Button size="sm" variant={store.selected === index ? 'default' : 'ghost'} label={word(layer, 'name')} onClick={() => selectLayer(index)} />)}
    {store.layers.length === 0 && <Text className={`text-xs text-${theme().mutedForeground}`}>{tr('mapper.workspace.addZoneHint')}</Text>}
  </View>;
}
