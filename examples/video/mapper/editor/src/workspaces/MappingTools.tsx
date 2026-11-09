import { Button } from 'zinc:ui/kit';
import { currentLayer, loadState, setLayer, store, touch } from '../state';
import { send } from '../services/link';
import { tr } from '../i18n';
import { IconButton } from '../components/Field';
import { MODE_CORNERS, MODE_EDGES, MODE_MESH, isLinking, outputMode, selectedCornerIsLinked, setOutputMode, startLinking, unlinkSelectedCorner } from '../components/OutputCanvas';

const MESH_PRESETS: i32[] = [3, 4, 6, 9];
export function MappingTools(): i32 {
  if (currentLayer() === null) return <Text className="text-xs text-zinc-400">{tr('mapper.workspace.addZoneHint')}</Text>;
  const mode = outputMode();
  return <View className="flex-row flex-wrap gap-1 items-center">
    {[MODE_CORNERS, MODE_MESH, MODE_EDGES].map((value: i32) => <Button size="sm" variant={mode === value ? 'default' : 'ghost'} label={tr(['mapper.mode.cornerPin', 'mapper.mode.grid', 'mapper.mode.edges'][value])} onClick={() => setOutputMode(value)} />)}
    <View className="grow" />
    {mode === MODE_MESH && <View className="flex-row gap-1">{MESH_PRESETS.map((size: i32) => <Button size="sm" variant="secondary" label={`${size} × ${size}`} onClick={() => {
      if (currentLayer() === null) return;
      send(`/layer/${store.selected}/mesh`, [size, size]);
      loadState();
    }} />)}</View>}
    {mode === MODE_MESH && <IconButton icon="rotate-ccw" label={tr('mapper.output.resetGrid')} onClick={() => { send(`/layer/${store.selected}/meshreset`, []); loadState(); }} />}
    {mode === MODE_CORNERS && <IconButton icon="link" variant={isLinking() ? 'default' : 'secondary'} label={tr('mapper.output.linkPoint')} onClick={startLinking} />}
    {mode === MODE_CORNERS && selectedCornerIsLinked() && <IconButton icon="unlink" label={tr('mapper.output.unlink')} onClick={unlinkSelectedCorner} />}
    {mode === MODE_CORNERS && <IconButton icon="rotate-ccw" label={tr('mapper.output.resetCorners')} onClick={() => { setLayer('corners', [0, 0, 1, 0, 1, 1, 0, 1]); touch(); }} />}
  </View>;
}
