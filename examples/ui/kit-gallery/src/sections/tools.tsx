/** @jsxHelpers zinc:ui/kit/host */
import { env } from 'zinc:sys';
import { heading } from 'zinc:ui/kit';
import { InspectorExample } from '../tools/InspectorExample';
import { StreamsExample } from '../tools/StreamsExample';
import { GraphExample } from '../tools/GraphExample';
import { AnimationExample } from '../tools/AnimationExample';
import { BinaryExample } from '../tools/BinaryExample';
export function ToolsSection(): i32 {
  return (
    <View className="flex-col gap-8 min-w-0">
      <Text className={heading(2)}>Tool panels</Text>
      <Show when={env('GALLERY_TOOLS') === '' || env('GALLERY_TOOLS') === 'inspector'}>
        <InspectorExample />
      </Show>
      <Show when={env('GALLERY_TOOLS') === '' || env('GALLERY_TOOLS') === 'streams'}>
        <StreamsExample />
      </Show>
      <Show when={env('GALLERY_TOOLS') === '' || env('GALLERY_TOOLS') === 'graph'}>
        <GraphExample />
      </Show>
      <Show when={env('GALLERY_TOOLS') === '' || env('GALLERY_TOOLS') === 'animation'}>
        <AnimationExample />
      </Show>
      <Show when={env('GALLERY_TOOLS') === '' || env('GALLERY_TOOLS') === 'binary'}>
        <BinaryExample />
      </Show>
    </View>
  );
}
