import { TEXT_SMALL, palette } from '../theme';

export function GlassButton(props: { label: string; onPress: () => void }): i32 {
  return <View role="button" focusable aria-label={props.label} className={`cursor-pointer items-center px-3 py-[3px] rounded-[6px] ${palette().button}`} onPress={props.onPress}>
    <Text className={`${TEXT_SMALL} font-medium ${palette().label}`}>{props.label}</Text>
  </View>;
}
