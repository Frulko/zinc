// Scenes: the layers and the columns under a name, on the mapper. The scene on now saves itself as it changes; a saved scene is one to come back to.
import { Button } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
import { pickScene } from '../services/files';
import { exportScene, importScene, loadSceneNamed, loadScenes, removeScene, saveSceneAs, setStatus, startNewScene, store } from '../state';
import { Heading } from './Field';
import { Rebuilt } from './Rebuilt';
import { tr } from '../i18n';

const [typedName, setTypedName] = createSignal('');

function cleanName(text: string): string { return text.trim().replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 48); }

function saveTyped(): void {
  const name = cleanName(typedName() === '' ? store.sceneName : typedName());
  if (name === '') {
    setStatus(tr('mapper.scenes.giveName'));
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
    <Text className="text-xs text-zinc-100 w-[200]">{name === 'previous' ? tr('mapper.scenes.previous') : name}</Text>
    <Button size="sm" variant="secondary" label={tr('mapper.scenes.load')} onClick={() => { loadSceneNamed(name); }} />
    <Button size="sm" variant="ghost" label={tr('mapper.scenes.export')} onClick={() => { exportScene(name); }} />
    <Button size="sm" variant="ghost" label={tr('mapper.scenes.delete')} onClick={() => { removeScene(name); }} />
  </View>;
}

function SceneList(): i32 {
  if (store.scenes.length === 0) return <Text className="text-xs text-zinc-500">{tr('mapper.scenes.none')}</Text>;
  return <View className="gap-1">{store.scenes.map((name: string) => <SceneRow name={name} />)}</View>;
}

function NowOn(): i32 {
  return <Text className="text-xs text-zinc-400 mb-2">{store.sceneName === '' ? tr('mapper.scenes.nowUnnamed') : tr('mapper.scenes.now', ['name', store.sceneName])}</Text>;
}

export function ScenePanel(): i32 {
  loadScenes();
  return <View className="p-3 gap-1">
    <Heading text={tr('mapper.scenes.thisScene')} />
    <Rebuilt make={NowOn} />
    <View className="flex-row flex-wrap items-center gap-1">
      <Input className="w-[200] h-[28] px-2 rounded bg-zinc-800 text-zinc-100 text-xs" aria-label={tr('mapper.scenes.nameLabel')} placeholder={tr('mapper.scenes.namePlaceholder')} onChange={setTypedName} />
      <Button size="sm" label={tr('mapper.scenes.save')} onClick={saveTyped} />
      <Button size="sm" variant="secondary" label={tr('mapper.scenes.new')} onClick={() => { startNewScene(); }} />
      <Button size="sm" variant="secondary" label={tr('mapper.scenes.import')} onClick={() => { importPicked(); }} />
    </View>
    <Heading text={tr('mapper.scenes.saved')} />
    <Rebuilt make={SceneList} />
    <Text className="text-[11px] text-zinc-500 mt-2">{tr('mapper.scenes.hint')}</Text>
  </View>;
}
