// The small macOS switch, with its label on the left. Its knob slides.
import { TEXT_ROW, accent, palette } from '../theme';

const WIDTH = 30, HEIGHT = 18, KNOB = 14, INSET = 2;

export function SwitchControl(props: { value: () => boolean }): i32 {
  return <View className={`relative w-[${WIDTH}px] h-[${HEIGHT}px] rounded-full transition-colors duration-150 ${props.value() ? accent() : palette().track}`}>
    <View className={`absolute top-[${INSET}px] left-[${INSET}px] w-[${KNOB}px] h-[${KNOB}px] rounded-full bg-white shadow-sm transition-transform duration-150 ${props.value() ? `translate-x-[${WIDTH - KNOB - 2 * INSET}px]` : 'translate-x-0'}`} />
  </View>;
}

export function GlassSwitch(props: { label: string; value: () => boolean; onChange: (on: boolean) => void }): i32 {
  return <View className="flex-row justify-between items-center h-[26px] cursor-pointer" role="switch" focusable aria-label={props.label} onPress={() => props.onChange(!props.value())}>
    <Text className={`${TEXT_ROW} ${palette().label}`}>{props.label}</Text>
    <SwitchControl value={props.value} />
  </View>;
}
