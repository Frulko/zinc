/** @jsxHelpers zinc:ui/kit/host */
import { env } from 'zinc:sys';
import { heading } from 'zinc:ui/kit';
import { ResearchExample } from '../ai/ResearchExample';
import { ComposerExample } from '../ai/ComposerExample';
import { MessagesExample } from '../ai/MessagesExample';
export function AiSection(): i32 {
  return <View className="flex-col gap-6 min-w-0">
    <Text className={heading(2)}>AI interfaces</Text>
    <Show when={env('GALLERY_AI') === '' || env('GALLERY_AI') === 'research'}><ResearchExample /></Show>
    <Show when={env('GALLERY_AI') === '' || env('GALLERY_AI') === 'composer'}><ComposerExample /></Show>
    <Show when={env('GALLERY_AI') === '' || env('GALLERY_AI') === 'messages'}><MessagesExample /></Show>
  </View>;
}
