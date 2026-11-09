import { env } from 'zinc:sys';
import { heading } from 'zinc:ui/kit';
import { PickerDates } from './pickers/Dates';
import { PickerColors } from './pickers/Colors';
import { PickerValues } from './pickers/Values';
export function PickersSection(): i32 {
  return <View className="flex-col gap-8">
    <Text className={heading(2)}>Pickers</Text>
    <Show when={env('GALLERY') !== 'pickers-colors' && env('GALLERY') !== 'pickers-values'}><PickerDates /></Show>
    <Show when={env('GALLERY') !== 'pickers-dates' && env('GALLERY') !== 'pickers-values'}><PickerColors /></Show>
    <Show when={env('GALLERY') !== 'pickers-dates' && env('GALLERY') !== 'pickers-colors'}><PickerValues /></Show>
  </View>;
}
