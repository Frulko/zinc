// The editor: layers and media on the left, the views in the middle, the layer's settings on the right.
import { Button, Switch, Tabs } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
import { send } from '../services/link';
import { MASK_SLOTS, currentLayer, loadState, maskValues, pointRevision, revision, setLayer, status, store, touch } from '../state';
import { CalibrationPanel } from './CalibrationPanel';
import { ColumnGrid } from './ColumnGrid';
import { Heading } from './Field';
import { LayerList } from './LayerList';
import { MediaBin } from './MediaBin';
import { OutputCanvas, inMeshMode, selectedPointText, setMeshMode } from './OutputCanvas';
import { PropsPanel } from './PropsPanel';
import { OptionsPanel } from './OptionsPanel';
import { RoomPanel } from './RoomPanel';
import { ScenePanel } from './ScenePanel';
import { SoundPanel } from './SoundPanel';
import { SurfaceCanvas, currentMask, selectMask } from './SurfaceCanvas';
import { Rebuilt } from './Rebuilt';

const VIEWS: string[] = ['Output', 'Masks', 'Columns', 'Calibration', 'Room', 'Sound', 'Scenes', 'Options'];
const MESH_PRESETS: i32[] = [3, 4, 6, 9];
const NEW_MASK: number[] = [0.05, 0, 0.3, 0.3, 0.7, 0.3, 0.7, 0.7, 0.3, 0.7];

function resizeGrid(size: i32): void {
  if (currentLayer() === null) return;
  send(`/layer/${store.selected}/mesh`, [size, size]);
  setMeshMode(true);
  loadState();
}

function ModeTabs(): i32 {
  return <Tabs items={['Corner pin', 'Deformation grid']} selected={() => (inMeshMode() ? 1 : 0) as i32} onSelect={(i: i32) => { setMeshMode(i === 1); touch(); }} />;
}

function pointText(version: i32): string { return selectedPointText(); }

function OutputView(): i32 {
  return <View className="p-3 gap-2">
    <View className="flex-row flex-wrap gap-1 items-center">
      <Rebuilt make={ModeTabs} />
      {MESH_PRESETS.map((size: i32) => <Button size="sm" variant="secondary" label={`${size} x ${size}`} onClick={() => resizeGrid(size)} />)}
      <Button size="sm" variant="ghost" label="Reset grid" onClick={() => {
        send(`/layer/${store.selected}/meshreset`, []);
        loadState();
      }} />
      <Button size="sm" variant="ghost" label="Reset corners" onClick={() => { setLayer('corners', [0, 0, 1, 0, 1, 1, 0, 1]); touch(); }} />
    </View>
    <OutputCanvas />
    <Text className="text-xs text-zinc-400">{pointText(pointRevision() + revision())}</Text>
  </View>;
}

function addMask(): void {
  const layer = currentLayer();
  if (layer === null) return;
  for (const slot of MASK_SLOTS) {
    if (maskValues(layer, slot).length >= 8) continue;
    selectMask(slot);
    setLayer(`mask/${slot}`, NEW_MASK.slice());
    touch();
    return;
  }
}

function MaskTools(): i32 {
  const layer = currentLayer();
  if (layer === null) return <View />;
  const mask = maskValues(layer, currentMask());
  const existing = MASK_SLOTS.filter((slot: i32) => maskValues(layer, slot).length >= 8);
  return <View className="flex-row flex-wrap gap-2 items-center">
    <Button size="sm" variant="secondary" label="Add mask" onClick={addMask} />
    {existing.map((slot: i32) => <Button size="sm" variant={slot === currentMask() ? 'default' : 'ghost'} label={`mask ${slot}`} onClick={() => { selectMask(slot); touch(); }} />)}
    {mask.length >= 8 && <Switch label="hide inside" checked={() => mask[1] > 0} onChange={(on: boolean) => {
      mask[1] = on ? 1 : 0;
      setLayer(`mask/${currentMask()}`, mask);
      touch();
    }} />}
    {mask.length >= 8 && <Button size="sm" variant="ghost" label="Delete" onClick={() => {
      layer[`mask/${currentMask()}`] = [];
      send(`/layer/${store.selected}/mask/${currentMask()}`, []);
      touch();
    }} />}
  </View>;
}

function MasksView(): i32 {
  return <View className="p-3 gap-2">
    <Heading text="Masks, crop, edge blend" />
    <Rebuilt make={MaskTools} />
    <Text className="text-xs text-zinc-400">Click empty space to add a point to the mask, shift-click a point to take it out. The two crop corners are points too.</Text>
    <SurfaceCanvas />
  </View>;
}

export function EditorScreen(): i32 {
  const [view, setView] = createSignal(0 as i32);
  return <View className="grow bg-zinc-950">
    <View className="flex-row items-center gap-3 h-[44] px-3 bg-zinc-900">
      <Text className="text-sm text-zinc-100">Mapper</Text>
      <Tabs items={VIEWS} selected={view} onSelect={setView} />
      <View className="grow" />
      <Text className="text-xs text-zinc-400">{status()}</Text>
    </View>
    <View className="flex-row grow">
      <ScrollView className="w-[260] p-3 bg-zinc-900 gap-3">
        <LayerList />
        <MediaBin />
      </ScrollView>
      <ScrollView className="w-0 grow">
        {view() === 0 && <OutputView />}
        {view() === 1 && <MasksView />}
        {view() === 2 && <ColumnGrid />}
        {view() === 3 && <CalibrationPanel />}
        {view() === 4 && <RoomPanel />}
        {view() === 5 && <SoundPanel />}
        {view() === 6 && <ScenePanel />}
        {view() === 7 && <OptionsPanel />}
      </ScrollView>
      <PropsPanel />
    </View>
  </View>;
}
