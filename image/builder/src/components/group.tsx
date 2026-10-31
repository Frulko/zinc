import { Show } from 'zinc:ui/solid';
// The inset lists of macOS System Settings: a small caption, a white rounded group of rows split by hairlines, a footnote.
function renderContent(children: (() => i32) | undefined): i32 { return children !== undefined ? children() : <View />; }

export function Group(p: { title?: string; footer?: string; children?: () => i32 }): i32 {
  return <View className="flex-col gap-1.5">
    <Show when={p.title !== undefined}><Text className="text-[13px] font-semibold text-[#6e6e73] px-1">{p.title ?? ''}</Text></Show>
    <View className="flex-col rounded-[8px] bg-white border border-[#e3e3e8]">{renderContent(p.children)}</View>
    <Show when={p.footer !== undefined}><Text className="text-xs leading-[16px] text-[#8e8e93] px-1">{p.footer ?? ''}</Text></Show>
  </View>;
}

/** One row: the label and its one-line explanation on the left, the control on the right; labels stack above the control in narrow windows. */
export function Row(p: { label: string; hint?: string; first?: boolean; children?: () => i32 }): i32 {
  return <View className={`flex-row max-[1000px]:flex-col items-center max-[1000px]:items-stretch gap-3 px-4 py-2.5 min-h-[48px] ${p.first === true ? '' : 'border-t border-[#ececf0]'}`}>
    <View className="flex-col grow basis-0 min-w-0 gap-0.5">
      <Text className="text-[14px] text-[#1d1d1f]">{p.label}</Text>
      <Show when={p.hint !== undefined}><Text className="text-xs leading-[16px] text-[#8e8e93]">{p.hint ?? ''}</Text></Show>
    </View>
    <View className="flex-col w-[280px] max-[1000px]:w-full shrink-0 gap-2">{renderContent(p.children)}</View>
  </View>;
}

import { Checkbox } from 'zinc:ui/nuxt';

/** A macOS-style preference: a checkbox with its title and a one-line explanation under it. */
export function Toggle(p: { label: string; hint: string; value: () => boolean; onChange: (on: boolean) => void; first?: boolean }): i32 {
  return <View className={`flex-col gap-1 px-4 py-3 ${p.first === true ? '' : 'border-t border-[#ececf0]'}`}>
    <Checkbox modelValue={p.value} onUpdate={p.onChange} label={p.label} />
    <Show when={p.hint !== ''}><Text className="text-xs leading-[16px] text-[#8e8e93] pl-[26px]">{p.hint}</Text></Show>
  </View>;
}
