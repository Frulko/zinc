// Shaped text through zinc:ui Text (ZN-224): the same scripts, laid out and wrapped by the UI.
import { render } from 'zinc:ui/react';
import { heading, mutedText } from 'zinc:ui/kit';

function Screen(): i32 {
  return <View class="flex flex-col gap-2 p-4 bg-white">
    <Text class={heading(3)}>AVATAR Wave</Text>
    <Text class="text-lg text-blue-700">שלום עולם</Text>
    <Text class="text-lg text-red-700">مرحبا بالعالم</Text>
    <Text class="text-lg text-green-700">क्षत्रिय हिन्दी</Text>
    <Text class={mutedText()}>👨‍👩‍👧 e{'́'}</Text>
  </View>;
}
render(Screen, 0xffffff, null);
