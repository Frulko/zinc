import { Heading } from '../components/Field';
import { Rebuilt } from '../components/Rebuilt';
import { SurfaceCanvas } from '../components/SurfaceCanvas';
import { tr } from '../i18n';
import { ZoneTools } from './ZoneTools';
export function ZonesWorkspace(props: { maximized: () => boolean; onMaximize: () => void; onRestore: () => boolean }): i32 {
  return <View className="h-0 grow p-3 gap-2">
    {!props.maximized() && <Heading text={tr('mapper.mask.heading')} />}
    {!props.maximized() && <Rebuilt make={ZoneTools} />}
    {!props.maximized() && <Text className="text-xs text-zinc-400">{tr('mapper.mask.hint')}</Text>}
    <View className="h-0 grow"><SurfaceCanvas onMaximize={props.onMaximize} onRestore={props.onRestore} /></View>
  </View>;
}
