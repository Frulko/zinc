import { Button, theme } from 'zinc:ui/kit';
import { tr } from '../i18n';
import { store } from '../state';
import { OutputCanvas } from '../components/OutputCanvas';
export function CompositionWorkspace(props: { onMapping: () => void }): i32 {
  return <View className="h-0 grow p-3 gap-2">
    <View className="flex-row gap-2 items-center">
      <Text className={`text-sm text-${theme().foreground}`}>{tr('mapper.workspace.outputPlan')}</Text>
      <Text className={`text-xs text-${theme().mutedForeground}`}>{`${store.pixels[0]} × ${store.pixels[1]}`}</Text>
      <View className="grow" />
      <Button size="sm" variant="secondary" label={tr('mapper.workspace.align')} onClick={props.onMapping} />
    </View>
    <View className="h-0 grow"><OutputCanvas readOnly /></View>
    <Text className={`text-xs text-${theme().mutedForeground}`}>{tr('mapper.workspace.compositionHint')}</Text>
  </View>;
}
