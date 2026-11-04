// The editor: the library on the left, the views in the middle, the settings of the clip and its layer on the right, the grid of clips below.
import * as ui from 'zinc:ui';
import { Button, Switch } from 'zinc:ui/kit';
import { For, createSignal } from 'zinc:ui/solid';
import { language, tr } from '../i18n';
import { send } from '../services/link';
import { MASK_SLOTS, currentLayer, loadState, maskValues, pointRevision, revision, setLayer, removeChosenClip, status, stepHistory, store, touch } from '../state';
import { CalibrationPanel } from './CalibrationPanel';
import { DragGhost, Dashboard } from './Dashboard';
import { HistoryPanel } from './HistoryPanel';
import { Heading, IconButton, IconTabs, Row, ValueSlider } from './Field';
import { Library } from './Library';
import { EdgeControls } from './EdgeControls';
import { MODE_CORNERS, MODE_EDGES, MODE_MESH, OutputCanvas, isLinking, outputMode, selectedCornerIsLinked, selectedPointText, setOutputMode, startLinking, unlinkSelectedCorner } from './OutputCanvas';
import { PropsPanel } from './PropsPanel';
import { OptionsPanel } from './OptionsPanel';
import { RoomPanel } from './RoomPanel';
import { ScenePanel } from './ScenePanel';
import { SoundPanel } from './SoundPanel';
import { StatusBar } from './StatusBar';
import { TransferDialog } from './TransferDialog';
import { SurfaceCanvas, curveChosenPoints, currentMask, selectMask } from './SurfaceCanvas';
import { Rebuilt } from './Rebuilt';

const VIEW_KEYS: string[] = ['output', 'masks', 'calibration', 'room', 'sound', 'scenes', 'history', 'options'];
const VIEW_ICONS: string[] = ['monitor', 'square-dashed', 'ruler', 'box', 'volume-2', 'clapperboard', 'clock', 'settings'];
const MESH_PRESETS: i32[] = [3, 4, 6, 9];
const NEW_MASK: number[] = [0, 0, 0.3, 0.3, 0.7, 0.3, 0.7, 0.7, 0.3, 0.7];
const MAX_FEATHER = 0.3;

function views(): string[] { return VIEW_KEYS.map((key: string): string => tr(`mapper.view.${key}`)); }

function resizeGrid(size: i32): void {
  if (currentLayer() === null) return;
  send(`/layer/${store.selected}/mesh`, [size, size]);
  setOutputMode(MODE_MESH);
  loadState();
}

function ModeTabs(): i32 {
  return <IconTabs items={[tr('mapper.mode.cornerPin'), tr('mapper.mode.grid'), tr('mapper.mode.edges')]} icons={['move', 'grid-3x3', 'blend']} selected={outputMode} onSelect={setOutputMode} />;
}

function LinkTools(): i32 {
  if (outputMode() !== MODE_CORNERS) return <View />;
  return <View className="flex-row gap-1 items-center">
    <IconButton icon="link" variant={isLinking() ? 'default' : 'secondary'} label={tr('mapper.output.linkPoint')} onClick={startLinking} />
    {selectedCornerIsLinked() && <IconButton icon="unlink" label={tr('mapper.output.unlink')} onClick={unlinkSelectedCorner} />}
  </View>;
}

function pointText(version: i32): string { return selectedPointText(); }

function OutputView(): i32 {
  return <View className="h-0 grow p-3 gap-2">
    <View className="flex-row flex-wrap gap-1 items-center">
      <Rebuilt make={ModeTabs} />
      {MESH_PRESETS.map((size: i32) => <Button size="sm" variant="secondary" label={`${size} x ${size}`} onClick={() => resizeGrid(size)} />)}
      <IconButton icon="rotate-ccw" label={tr('mapper.output.resetGrid')} onClick={() => {
        send(`/layer/${store.selected}/meshreset`, []);
        loadState();
      }} />
      <IconButton icon="rotate-ccw" label={tr('mapper.output.resetCorners')} onClick={() => { setLayer('corners', [0, 0, 1, 0, 1, 1, 0, 1]); touch(); }} />
    </View>
    <Rebuilt make={LinkTools} />
    <View className="h-0 grow"><OutputCanvas /></View>
    <Rebuilt make={EdgeControls} />
    <View className="h-[34] overflow-hidden"><Text className="text-xs text-zinc-400">{pointText(pointRevision() + revision())}</Text></View>
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
    <Button size="sm" variant="secondary" label={tr('mapper.mask.add')} onClick={addMask} />
    {existing.map((slot: i32) => <Button size="sm" variant={slot === currentMask() ? 'default' : 'ghost'} label={tr('mapper.mask.name', ['slot', `${slot}`])} onClick={() => { selectMask(slot); touch(); }} />)}
    {mask.length >= 8 && <Switch label={tr('mapper.mask.hideInside')} checked={() => mask[1] > 0} onChange={(on: boolean) => {
      mask[1] = on ? 1 : 0;
      setLayer(`mask/${currentMask()}`, mask);
      touch();
    }} />}
    {mask.length >= 8 && <IconButton icon="spline" variant="secondary" label={tr('mapper.mask.curve')} onClick={() => { curveChosenPoints(true); touch(); }} />}
    {mask.length >= 8 && <IconButton icon="square" variant="secondary" label={tr('mapper.mask.corner')} onClick={() => { curveChosenPoints(false); touch(); }} />}
    {mask.length >= 8 && <IconButton icon="trash" label={tr('mapper.mask.delete')} onClick={() => {
      layer[`mask/${currentMask()}`] = [];
      layer[`maskcurve/${currentMask()}`] = [];
      send(`/layer/${store.selected}/mask/${currentMask()}`, []);
      touch();
    }} />}
    {mask.length >= 8 && <View className="w-[260]"><Row label={tr('mapper.mask.feather')}><ValueSlider min={0} max={MAX_FEATHER} read={() => mask[0]} write={(v: number) => {
      mask[0] = v;
      setLayer(`mask/${currentMask()}`, mask);
    }} /></Row></View>}
  </View>;
}

function MasksView(): i32 {
  return <View className="p-3 gap-2">
    <Heading text={tr('mapper.mask.heading')} />
    <Rebuilt make={MaskTools} />
    <Text className="text-xs text-zinc-400">{tr('mapper.mask.hint')}</Text>
    <SurfaceCanvas />
  </View>;
}

export function EditorScreen(): i32 {
  ui.bindKeys('mod-z', 'undo');
  ui.bindKeys('mod-shift-z', 'redo');
  ui.bindKeys('mod-y', 'redo');
  ui.bindKeys('delete', 'remove clip');
  ui.bindKeys('backspace', 'remove clip');
  ui.onAction(-1, 'remove clip', removeChosenClip);
  ui.onAction(-1, 'undo', () => { stepHistory('undo'); });
  ui.onAction(-1, 'redo', () => { stepHistory('redo'); });
  const [view, setView] = createSignal(0 as i32);
  return <View className="grow"><For each={[language()]}>{(lang: string) => <Screen view={view} setView={setView} />}</For></View>;
}

/** Built again when the language changes; the view stays. */
function Screen(props: { view: () => i32; setView: (index: i32) => void }): i32 {
  const view = props.view, setView = props.setView;
  return <View className="grow bg-zinc-950">
    <View className="flex-row items-center gap-3 h-[44] px-3 bg-zinc-900">
      <Text className="text-sm text-zinc-100">{tr('mapper.app.title')}</Text>
      <IconTabs items={views()} icons={VIEW_ICONS} selected={view} onSelect={setView} />
      <IconButton icon="undo-2" label={tr('mapper.app.undo')} onClick={() => { stepHistory('undo'); }} />
      <IconButton icon="redo-2" label={tr('mapper.app.redo')} onClick={() => { stepHistory('redo'); }} />
      <View className="grow" />
      <Text className="text-xs text-zinc-400">{status()}</Text>
    </View>
    <View className="flex-row h-0 grow">
      <Library />
      <View className="w-0 grow">
        {view() === 0 && <OutputView />}
        {view() !== 0 && <ScrollView className="h-0 grow">
          {view() === 1 && <MasksView />}
          {view() === 2 && <CalibrationPanel />}
          {view() === 3 && <RoomPanel />}
          {view() === 4 && <SoundPanel />}
          {view() === 5 && <ScenePanel />}
          {view() === 6 && <HistoryPanel />}
          {view() === 7 && <OptionsPanel />}
        </ScrollView>}
      </View>
      <PropsPanel />
    </View>
    <Dashboard />
    <StatusBar />
    <TransferDialog />
    <DragGhost />
  </View>;
}
