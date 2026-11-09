import { createSignal } from 'zinc:ui/solid';
import { ColorPicker, EmojiPicker, heading, theme } from 'zinc:ui/kit';
const [color, setColor] = createSignal('#2563ebff');
const [emoji, setEmoji] = createSignal('👍');
const [recent, setRecent] = createSignal<string[]>(['👍', '🎨']);
const [tone, setTone] = createSignal(0);
export function PickerColors(): i32 {
  return <View className="flex-col gap-6">
    <Text className={heading(3)}>Color and emoji</Text>
    <View className="flex-row flex-wrap gap-8 items-start">
      <ColorPicker label="Project color" value={color} onChange={setColor} alpha={true} />
      <EmojiPicker label="Project emoji" value={emoji} onChange={setEmoji} recent={recent} onRecentChange={setRecent} tone={tone} onToneChange={setTone} height={190} />
      <View className={`flex-col gap-3 p-4 border border-${theme().border} rounded-[18px] w-[200px]`}>
        <Text className={`text-[13px] text-${theme().mutedForeground}`}>Selected for the project</Text>
        <View className={`w-12 h-12 rounded-[10px] bg-[${color().slice(0, 7)}]`} />
        <Text className={`text-[13px] tabular-nums text-${theme().foreground}`}>{color()}</Text>
        <Text className="text-[32px]">{emoji()}</Text>
      </View>
    </View>
  </View>;
}
