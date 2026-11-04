// Two ways to choose one of a few things, as macOS does: a segmented control for short labels, a list with a check mark for the rest.
import { Symbol } from './Symbol';
import { TEXT_ROW, TEXT_SMALL, palette } from '../theme';

export interface Choice { value: number; label: string }

export function Segmented(props: { choices: () => Choice[]; value: () => number; onChange: (value: number) => void }): i32 {
  return <View className={`flex-row rounded-[7px] p-[2px] ${palette().well}`}>
    <For each={props.choices()}>{(choice: Choice) =>
      <View role="button" focusable aria-label={choice.label} className={`cursor-pointer grow basis-0 items-center py-[3px] rounded-[5px] ${props.value() === choice.value ? palette().segmentOn : ''}`} onPress={() => props.onChange(choice.value)}>
        <Text className={`${TEXT_SMALL} font-medium ${palette().label}`}>{choice.label}</Text>
      </View>}
    </For>
  </View>;
}

export function CheckRow(props: { label: string; detail?: string; on: () => boolean; onPress: () => void }): i32 {
  return <View role="button" focusable aria-label={props.label} className={`cursor-pointer flex-row items-center gap-1 h-[24px] pr-2 pl-1 rounded-[5px] ${palette().rowHover}`} onPress={props.onPress}>
    <View className="w-[14px]"><Show when={props.on()}><Symbol name="checkmark" side={14} pointSize={10} weight={0.3} /></Show></View>
    <Text className={`grow shrink ${TEXT_ROW} truncate ${palette().label}`}>{props.label}</Text>
    {props.detail !== undefined ? <Text className={`${TEXT_SMALL} ${palette().secondary}`}>{props.detail}</Text> : null}
  </View>;
}

export function CheckList(props: { choices: () => Choice[]; value: () => number; onChange: (value: number) => void }): i32 {
  return <View>
    <For each={props.choices()}>{(choice: Choice) =>
      <CheckRow label={choice.label} on={() => props.value() === choice.value} onPress={() => props.onChange(choice.value)} />}
    </For>
  </View>;
}
