import { env } from 'zinc:sys';
import { heading } from 'zinc:ui/kit';
import { DataOverview } from '../data/DataOverview';
import { GridExample } from '../data/GridExample';
import { TreeExample } from '../data/TreeExample';
import { FileExample } from '../data/FileExample';

export function DataSection(): i32 {
  return <View className="flex-col gap-6 min-w-0">
    <Text className={heading(2)}>Data</Text>
    <Show when={env('GALLERY_DATA') === '' || env('GALLERY_DATA') === 'overview'}><DataOverview /></Show>
    <Show when={env('GALLERY_DATA') === '' || env('GALLERY_DATA') === 'grid'}><GridExample /></Show>
    <Show when={env('GALLERY_DATA') === '' || env('GALLERY_DATA') === 'tree'}><TreeExample /></Show>
    <Show when={env('GALLERY_DATA') === '' || env('GALLERY_DATA') === 'files'}><FileExample /></Show>
  </View>;
}
