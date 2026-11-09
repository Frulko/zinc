import { pointRevision, revision } from '../state';
import { EdgeControls } from '../components/EdgeControls';
import { OutputCanvas, selectedPointText } from '../components/OutputCanvas';
import { Rebuilt } from '../components/Rebuilt';
import { MappingTools } from './MappingTools';
function pointText(version: i32): string { return selectedPointText(); }
export function MappingWorkspace(props: { maximized: () => boolean; onMaximize: () => void; onRestore: () => boolean }): i32 {
  return <View className="h-0 grow p-3 gap-2">
    {!props.maximized() && <Rebuilt make={MappingTools} />}
    <View className="h-0 grow"><OutputCanvas onMaximize={props.onMaximize} onRestore={props.onRestore} /></View>
    {!props.maximized() && <Rebuilt make={EdgeControls} />}
    <Text className="text-xs text-zinc-400" numberOfLines={1}>{pointText(pointRevision() + revision())}</Text>
  </View>;
}
