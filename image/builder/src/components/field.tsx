// A labelled row of the settings: the label and its hint on the left, the control on the right.
import { theme, hex } from 'zinc:ui/nuxt';

export type FieldProps = { label: string; hint?: string; children?: () => i32 };

function renderControl(control: (() => i32) | undefined): i32 { return control !== undefined ? control() : <View />; }

export function Field(p: FieldProps): i32 {
  return <View className="flex-row max-[1000px]:flex-col gap-3 py-2">
    <View className="flex-col w-[154px] max-[1000px]:w-full shrink-0 gap-1">
      <Text className={`text-sm font-medium text-${hex(theme().textHighlighted)}`}>{p.label}</Text>
      <Text className={`text-xs text-${hex(theme().textMuted)}`}>{p.hint ?? ''}</Text>
    </View>
    <View className="flex-col grow min-w-0 gap-2">{renderControl(p.children)}</View>
  </View>;
}
