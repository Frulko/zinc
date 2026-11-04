// Scenes: the layers and the columns under a name, on the mapper. The scene on now saves itself as it changes; a saved scene is one to come back to.
import { Button } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
import { pickScene } from '../services/files';
import { exportScene, importScene, loadSceneNamed, loadScenes, removeScene, saveSceneAs, setStatus, startNewScene, store } from '../state';
import { Heading } from './Field';
import { Rebuilt } from './Rebuilt';

const [typedName, setTypedName] = createSignal('');

function cleanName(text: string): string { return text.trim().replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 48); }

function saveTyped(): void {
  const name = cleanName(typedName() === '' ? store.sceneName : typedName());
  if (name === '') {
    setStatus('give the scene a name');
    return;
  }
  saveSceneAs(name);
}

async function importPicked(): Promise<void> {
  const path = await pickScene();
  if (path !== null) await importScene(path as string);
}

function SceneRow(props: { name: string }): i32 {
  const name = props.name;
  return <View className={`flex-row items-center gap-1 h-[32] px-2 rounded ${name === store.sceneName ? 'bg-zinc-800' : ''}`}>
    <Text className="text-xs text-zinc-100 w-[200]">{name === 'previous' ? 'previous (before the last load or new)' : name}</Text>
    <Button size="sm" variant="secondary" label="Load" onClick={() => { loadSceneNamed(name); }} />
    <Button size="sm" variant="ghost" label="Export" onClick={() => { exportScene(name); }} />
    <Button size="sm" variant="ghost" label="Delete" onClick={() => { removeScene(name); }} />
  </View>;
}

function SceneList(): i32 {
  if (store.scenes.length === 0) return <Text className="text-xs text-zinc-500">No saved scene yet.</Text>;
  return <View className="gap-1">{store.scenes.map((name: string) => <SceneRow name={name} />)}</View>;
}

function NowOn(): i32 {
  return <Text className="text-xs text-zinc-400 mb-2">{store.sceneName === '' ? 'On now: a scene with no name. It keeps itself across restarts.' : `On now: ${store.sceneName}. Save writes your changes to it; they are also kept across restarts.`}</Text>;
}

export function ScenePanel(): i32 {
  loadScenes();
  return <View className="p-3 gap-1">
    <Heading text="This scene" />
    <Rebuilt make={NowOn} />
    <View className="flex-row flex-wrap items-center gap-1">
      <Input className="w-[200] h-[28] px-2 rounded bg-zinc-800 text-zinc-100 text-xs" aria-label="scene name" placeholder="name to save under" onChange={setTypedName} />
      <Button size="sm" label="Save" onClick={saveTyped} />
      <Button size="sm" variant="secondary" label="New empty scene" onClick={() => { startNewScene(); }} />
      <Button size="sm" variant="secondary" label="Import a file" onClick={() => { importPicked(); }} />
    </View>
    <Heading text="Saved on the mapper" />
    <Rebuilt make={SceneList} />
    <Text className="text-[11px] text-zinc-500 mt-2">The media stay on the mapper: a scene file names them, so another mapper needs the same files. Loading or starting new first keeps what was on as "previous".</Text>
  </View>;
}
