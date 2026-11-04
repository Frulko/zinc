// The layers: select, show or hide, reorder, add, delete. Later layers draw on top.
import { Button, Switch } from 'zinc:ui/kit';
import { send } from '../services/link';
import { loadState, numbers, selectLayer, store, touch, word } from '../state';
import { Heading } from './Field';
import { Rebuilt } from './Rebuilt';

function moveSelected(delta: i32): void {
  const to: i32 = store.selected + delta;
  if (to < 0 || to >= store.layers.length) return;
  send('/move', [store.selected, to]);
  store.selected = to;
  loadState();
}

function addLayer(source: string): void {
  send('/add', [], [source, `${source} ${store.layers.length}`]);
  store.selected = store.layers.length as i32;
  loadState();
}

function removeSelected(): void {
  if (store.selected < 0) return;
  send('/remove', [store.selected]);
  store.selected--;
  loadState();
}

function LayerRow(props: { index: i32 }): i32 {
  const layer = store.layers[props.index];
  const selected = props.index === store.selected;
  return <View className={`flex-row items-center gap-2 px-2 h-[30] rounded cursor-pointer ${selected ? 'bg-zinc-700' : ''}`} onPress={() => selectLayer(props.index)}>
    <Switch checked={() => numbers(layer, 'visible')[0] > 0} accessibilityLabel="visible" onChange={(on: boolean) => {
      layer.visible = [on ? 1 : 0];
      send(`/layer/${props.index}/visible`, [on ? 1 : 0]);
      touch();
    }} />
    <Text className="text-xs text-zinc-100 grow">{`${props.index}. ${word(layer, 'name')}`}</Text>
  </View>;
}

function Rows(): i32 {
  return <View className="gap-1">{store.layers.map((layer: any, index: i32) => <LayerRow index={index} />)}</View>;
}

export function LayerList(): i32 {
  return <View>
    <Heading text="Layers" />
    <Rebuilt make={Rows} />
    <View className="flex-row flex-wrap gap-1 mt-2">
      <Button size="sm" variant="secondary" label="Add" onClick={() => addLayer('pattern')} />
      <Button size="sm" variant="secondary" label="Up" onClick={() => moveSelected(1)} />
      <Button size="sm" variant="secondary" label="Down" onClick={() => moveSelected(-1)} />
      <Button size="sm" variant="secondary" label="Delete" onClick={removeSelected} />
    </View>
  </View>;
}
