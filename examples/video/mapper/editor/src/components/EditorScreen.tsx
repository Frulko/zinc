// Workspaces share one show; changing workspace never starts or stops playback.
import * as ui from 'zinc:ui';
import { Button, theme } from 'zinc:ui/kit';
import { For, createSignal } from 'zinc:ui/solid';
import { language, tr } from '../i18n';
import { removeChosenClip, revision, showCalibrationCard, status, stepHistory, store } from '../state';
import { AuthoringExports } from './AuthoringExports';
import { CalibrationPanel } from './CalibrationPanel';
import { DragGhost, Dashboard } from './Dashboard';
import { DevicesPanel } from './DevicesPanel';
import { HistoryPanel } from './HistoryPanel';
import { IconButton } from './Field';
import { Library } from './Library';
import { PropsPanel } from './PropsPanel';
import { OptionsPanel } from './OptionsPanel';
import { RoomPanel } from './RoomPanel';
import { ScenePanel } from './ScenePanel';
import { SoundPanel } from './SoundPanel';
import { StatusBar } from './StatusBar';
import { TransferDialog } from './TransferDialog';
import { Rebuilt } from './Rebuilt';
import { RemoteAccess } from './RemoteAccess';
import { DeliveryPanel } from '../delivery/DeliveryPanel';
import { CompositionWorkspace } from '../workspaces/CompositionWorkspace';
import { MappingWorkspace } from '../workspaces/MappingWorkspace';
import { ZonesWorkspace } from '../workspaces/ZonesWorkspace';
import { ZoneSelector } from '../workspaces/ZoneSelector';
import { Workspace, WorkspaceNavigation } from '../workspaces/WorkspaceNavigation';

const TOOL_KEYS: string[] = ['options', 'calibration', 'room', 'sound', 'scenes', 'history'];
export function EditorScreen(): i32 {
  const [workspace, setWorkspace] = createSignal(Workspace.Composition);
  const [inspector, setInspector] = createSignal(false);
  const [tool, setTool] = createSignal(0 as i32);
  const [remote, setRemote] = createSignal(false);
  const [maximized, setMaximized] = createSignal(false);
  const restore = (): boolean => { const was = maximized(); setMaximized(false); return was; };
  const maximize = (): void => setMaximized(true);
  ui.bindKeys('mod-z', 'undo');
  ui.bindKeys('mod-shift-z', 'redo');
  ui.bindKeys('mod-y', 'redo');
  ui.bindKeys('delete', 'remove clip');
  ui.bindKeys('backspace', 'remove clip');
  ui.onAction(-1, 'remove clip', () => { if (workspace() === Workspace.Composition) removeChosenClip(); });
  ui.onAction(-1, 'undo', () => { stepHistory('undo'); });
  ui.onAction(-1, 'redo', () => { stepHistory('redo'); });
  const editing = (): boolean => workspace() === Workspace.Mapping || workspace() === Workspace.Zones;
  const openTool = (index: i32): void => { setTool(index); setWorkspace(Workspace.Settings); };
  const cardLabel = (version: i32): string => tr(store.card === 'off' ? 'mapper.workspace.testPattern' : 'mapper.workspace.hidePattern');
  return <View className="grow"><For each={[language()]}>{(lang: string) => <View className={`grow bg-${theme().background}`} onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Escape' && maximized()) { restore(); e.preventDefault(); } }}>
    {!maximized() && <WorkspaceNavigation selected={workspace} onSelect={setWorkspace} />}
    {!maximized() && <View className={`flex-row flex-wrap items-center gap-2 px-3 py-1 border-b border-${theme().border}`}>
      <IconButton icon="undo-2" label={tr('mapper.app.undo')} onClick={() => { stepHistory('undo'); }} />
      <IconButton icon="redo-2" label={tr('mapper.app.redo')} onClick={() => { stepHistory('redo'); }} />
      {workspace() === Workspace.Composition && <Button size="sm" variant="ghost" label={tr('mapper.view.scenes')} onClick={() => openTool(4)} />}
      {editing() && <Button size="sm" variant="secondary" label={cardLabel(revision())} onClick={() => showCalibrationCard(store.card === 'off' ? 'grid' : 'off', -1)} />}
      {editing() && <Button size="sm" variant="ghost" label={tr('mapper.view.calibration')} onClick={() => openTool(1)} />}
      {editing() && <Button size="sm" variant="ghost" label={tr('mapper.workspace.phone')} onClick={() => setRemote(!remote())} />}
      {editing() && <Button size="sm" variant="ghost" label={tr(inspector() ? 'mapper.workspace.hideInspector' : 'mapper.workspace.showInspector')} onClick={() => setInspector(!inspector())} />}
      {editing() && <Button size="sm" variant="secondary" label={tr('mapper.canvas.maximize')} onClick={maximize} />}
      <View className="grow" />
      <Text className={`text-xs text-${theme().mutedForeground}`} numberOfLines={1}>{status()}</Text>
    </View>}
    {maximized() && <View className="flex-row px-3 py-1"><Button size="sm" variant="secondary" label={tr('mapper.canvas.restore')} onClick={() => { restore(); }} /><Text className={`text-xs text-${theme().mutedForeground} p-2`}>{tr('mapper.canvas.navigationHint')}</Text></View>}
    {!maximized() && editing() && <Rebuilt make={ZoneSelector} />}
    {!maximized() && editing() && remote() && <RemoteAccess />}
    <View className="flex-row h-0 grow">
      {workspace() === Workspace.Composition && <Library />}
      <View className="w-0 grow">
        {workspace() === Workspace.Composition && <CompositionWorkspace onMapping={() => setWorkspace(Workspace.Mapping)} />}
        {workspace() === Workspace.Mapping && <MappingWorkspace maximized={maximized} onMaximize={maximize} onRestore={restore} />}
        {workspace() === Workspace.Zones && <ZonesWorkspace maximized={maximized} onMaximize={maximize} onRestore={restore} />}
        {workspace() === Workspace.Players && <ScrollView className="h-0 grow"><DevicesPanel /></ScrollView>}
        {workspace() === Workspace.Project && <ScrollView className="h-0 grow"><DeliveryPanel /><AuthoringExports /></ScrollView>}
        {workspace() === Workspace.Settings && <View className="h-0 grow">
          <View className="flex-row flex-wrap gap-1 p-2">
            {TOOL_KEYS.map((key: string, index: i32) => <Button size="sm" variant={tool() === index ? 'default' : 'ghost'} label={tr(`mapper.view.${key}`)} onClick={() => setTool(index)} />)}
          </View>
          <ScrollView className="h-0 grow">
            {tool() === 0 && <OptionsPanel />}
            {tool() === 1 && <CalibrationPanel />}
            {tool() === 2 && <RoomPanel />}
            {tool() === 3 && <SoundPanel />}
            {tool() === 4 && <ScenePanel />}
            {tool() === 5 && <HistoryPanel />}
          </ScrollView>
        </View>}
      </View>
      {(workspace() === Workspace.Composition || (editing() && inspector() && !maximized())) && <PropsPanel layerOnly={editing()} />}
    </View>
    {workspace() === Workspace.Composition && <Dashboard />}
    {!maximized() && <StatusBar />}
    <TransferDialog />
    <DragGhost />
  </View>}</For></View>;
}
