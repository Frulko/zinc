// One line of the inspector's form: a right-aligned label and its control, as AppKit's form layout (NSGridView) lines them up.
export interface FormRowProps { label: string; children?: () => i32 }

export function FormRow(props: FormRowProps): i32 {
  return <View className="flex-row items-center gap-2 h-[24px]">
    <View className="w-[64px] items-end">
      <Text className="text-[13px]">{props.label}</Text>
    </View>
    {props.children !== undefined ? props.children() : null}
  </View>;
}
