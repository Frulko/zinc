// The controls of the settings: a titled line, a segmented choice, a switch and a button.
import { accentFill, palette } from '../theme';

export function SettingRow(props: { label: string; children: () => i32 }): i32 {
  return <View className="flex-row items-center justify-between min-h-[34px] gap-3">
    <Text className={`text-[13px] shrink ${palette().label}`}>{props.label}</Text>
    {props.children()}
  </View>;
}

export interface Choice { value: string; label: string }
export function Segmented(props: { choices: Choice[]; value: () => string; onChange: (value: string) => void }): i32 {
  return <View className={`flex-row rounded-[8px] p-[2px] ${palette().segment}`}>
    <For each={props.choices}>{(choice: Choice) =>
      <View role="button" focusable aria-label={choice.label} onPress={() => props.onChange(choice.value)}
        className={`cursor-pointer px-3 h-[24px] rounded-[6px] justify-center ${props.value() === choice.value ? palette().controlOn : ''}`}>
        <Text className={`text-[12px] ${palette().label}`}>{choice.label}</Text>
      </View>}
    </For>
  </View>;
}

const SWITCH_WIDTH = 34, SWITCH_HEIGHT = 20, KNOB = 16, INSET = 2;
export function Toggle(props: { label: string; value: () => boolean; onChange: (on: boolean) => void }): i32 {
  return <View role="switch" focusable aria-label={props.label} onPress={() => props.onChange(!props.value())}
    className={`cursor-pointer relative w-[${SWITCH_WIDTH}px] h-[${SWITCH_HEIGHT}px] rounded-full transition-colors duration-150 ${props.value() ? accentFill() : palette().track}`}>
    <View className={`absolute top-[${INSET}px] left-[${INSET}px] w-[${KNOB}px] h-[${KNOB}px] rounded-full bg-white shadow-sm transition-transform duration-150 ${props.value() ? `translate-x-[${SWITCH_WIDTH - KNOB - 2 * INSET}px]` : 'translate-x-0'}`} />
  </View>;
}

export function Button(props: { label: string; onPress: () => void }): i32 {
  return <View role="button" focusable aria-label={props.label} onPress={props.onPress} className={`cursor-pointer px-3 h-[26px] rounded-[7px] justify-center ${palette().control}`}>
    <Text className={`text-[12px] ${palette().label}`}>{props.label}</Text>
  </View>;
}
