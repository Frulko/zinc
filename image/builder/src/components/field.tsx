// A labelled row of the settings: the label and its hint on the left, the control on the right.
import { theme, hex } from 'zinc:ui/nuxt';

export type FieldProps = { label: string; hint?: string; children?: () => i32 };

function renderControl(control: (() => i32) | undefined): i32 { return control !== undefined ? control() : <View />; }

export function Field(p: FieldProps): i32 {
  return <View className={`flex-row gap-4 py-2.5 border-b border-${hex(theme().border)}`}>
    <View className="flex-col w-[180px] gap-0.5">
      <Text className={`text-sm font-medium text-${hex(theme().textHighlighted)}`}>{p.label}</Text>
      <Text className={`text-xs text-${hex(theme().textMuted)}`}>{p.hint ?? ''}</Text>
    </View>
    <View className="flex-col grow gap-2">{renderControl(p.children)}</View>
  </View>;
}
