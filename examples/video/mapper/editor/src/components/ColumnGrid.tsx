// Columns of media, as in Resolume: a row per layer, a column per moment of the show. A column's title plays it; a click on a cell places the armed media.
import { Button } from 'zinc:ui/kit';
import { Cell, Column, fireColumn, revision, saveShow, store, touch, word } from '../state';
import { Heading } from './Field';

function cellOf(column: Column, layer: i32): Cell {
  while (column.cells.length <= layer) column.cells.push({ media: '', fit: 'cover', volume: 1 });
  return column.cells[layer];
}

function CellBox(props: { column: Column; layer: i32 }): i32 {
  const cell = cellOf(props.column, props.layer);
  return <Text className="w-[140] h-[28] px-2 py-1 rounded bg-zinc-800 text-xs text-zinc-200 cursor-pointer" onPress={() => {
    cell.media = store.armedMedia;
    saveShow();
    touch();
  }}>{cell.media === '' ? '-' : cell.media}</Text>;
}

function addColumn(): void {
  store.columns.push({ name: `Column ${store.columns.length + 1}`, cells: [] });
  saveShow();
  touch();
}

function removeLastColumn(): void {
  store.columns.pop();
  if (store.activeColumn >= store.columns.length) store.activeColumn = -1;
  saveShow();
  touch();
}

function Grid(): i32 {
  const rows: i32[] = [];
  for (let layer: i32 = store.layers.length - 1; layer >= 0; layer--) rows.push(layer);
  return <ScrollView className="gap-1">
    <View className="flex-row gap-1 items-center">
      <View className="w-[120]" />
      {store.columns.map((column: Column, index: i32) => <View className="w-[140]">
        <Button size="sm" variant={store.activeColumn === index ? 'default' : 'secondary'} label={column.name} onClick={() => fireColumn(index)} />
      </View>)}
    </View>
    {rows.map((layer: i32) => <View className="flex-row gap-1 items-center mt-1">
      <Text className="w-[120] text-xs text-zinc-400">{word(store.layers[layer], 'name')}</Text>
      {store.columns.map((column: Column) => <CellBox column={column} layer={layer} />)}
    </View>)}
  </ScrollView>;
}

export function ColumnGrid(): i32 {
  return <View className="p-3">
    <Heading text="Columns" />
    {revision() >= 0 && <Grid />}
    <View className="flex-row gap-1 mt-2 items-center">
      <Button size="sm" variant="secondary" label="Add column" onClick={addColumn} />
      <Button size="sm" variant="secondary" label="Remove last" onClick={removeLastColumn} />
      <Text className="text-[11px] text-zinc-500">On the mapper's remote, the left and right arrows change column. A click on a cell with no media armed empties it.</Text>
    </View>
  </View>;
}
