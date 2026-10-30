// The parts of the pages of the sidebar (Settings, Devices, Share), after macOS's System Settings: a title, then groups of rows
// on a white card with hairlines between them, the label on the left and its control on the right.
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from '../app/theme';

/** A page over the content area, shown while `shown` says so: a title, a line under it, and its groups in one centred column. */
export function Page(props: { shown: () => boolean; title: () => string; subtitle?: () => string; children: () => i32 }): i32 {
  return <View className={`absolute inset-0 ${bg(theme().dark ? theme().bg : theme().sidebar)}`} style={{ hidden: props.shown() ? 0 : 1 }}>
    <ScrollView className="grow flex-col items-center px-8 pt-7 pb-10">
      <View className="flex-col w-full max-w-[640] gap-1">
        <Text className={`text-[22px] font-bold ${fg(theme().text)}`}>{props.title()}</Text>
        {props.subtitle !== undefined && <Text className={`text-[13px] pb-1 ${fg(theme().muted)}`}>{(props.subtitle as () => string)()}</Text>}
        {props.children()}
      </View>
    </ScrollView>
  </View>;
}

/** Rows on one card, a caption above it and a note under it. */
export function Group(props: { title?: string; note?: () => string; children: () => i32 }): i32 {
  return <View className="flex-col pt-5">
    {props.title !== undefined && <Text className={`px-1 pb-1.5 text-[12px] font-semibold ${fg(theme().muted)}`}>{props.title as string}</Text>}
    <View className={`flex-col gap-px overflow-hidden rounded-[10] border ${bg(theme().borderSoft)} ${bd(theme().borderSoft)}`}>
      {props.children()}
    </View>
    {props.note !== undefined && <Text className={`px-1 pt-1.5 text-[11px] leading-[16] ${fg(theme().muted)}`}>{(props.note as () => string)()}</Text>}
  </View>;
}

/** One row of a group: its label (and a line under it) on the left, the control on the right. */
export function Row(props: { label: () => string; hint?: () => string; children?: () => i32 }): i32 {
  return <View className={`flex-row items-center min-h-[44] px-3.5 py-2 gap-3 ${bg(theme().elevated)}`}>
    <View className="flex-col grow shrink gap-0.5">
      <Text className={`text-[13px] ${fg(theme().text)}`}>{props.label()}</Text>
      {props.hint !== undefined && <Text className={`text-[11px] leading-[15] ${fg(theme().muted)}`}>{(props.hint as () => string)()}</Text>}
    </View>
    {props.children !== undefined ? props.children() : <View />}
  </View>;
}

/** A field that commits when it is left or Enter is pressed (an edit that changes nothing commits nothing). */
export function Field(props: { value: () => string; width: string; hint?: string; mono?: boolean; secret?: boolean; commit: (v: string) => void }): i32 {
  const node = <Input className={`h-[26] text-[13px] px-2 rounded-[6] border ${props.mono === true ? 'font-mono' : ''} ${props.width} ${bg(theme().bg)} ${bd(theme().border)} ${fg(theme().text)} focus:${bd(theme().accent)}`}
    placeholder={props.hint ?? ''} value={props.value()} type={props.secret === true ? 'password' : 'text'} />;
  ui.onText(node, true, (v: string) => { if (v !== props.value()) props.commit(v); });
  return node;
}

/** A push button: the accent one for the main action of a group, else a bordered one. */
export function Button(props: { label: () => string; primary?: boolean; onPress: () => void }): i32 {
  const primary = props.primary === true;
  return <View className={`flex-row items-center h-[26] px-3 rounded-[6] cursor-pointer active:opacity-80 ${primary ? bg(theme().accent) : `border ${bg(theme().bg)} ${bd(theme().border)} hover:${bg(theme().hover)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) props.onPress(); }}>
    <Text className={`text-[12px] ${primary ? 'font-semibold' : ''} ${fg(primary ? theme().onAccent : theme().text)}`}>{props.label()}</Text>
  </View>;
}

/** A segmented control: one choice of a few, the chosen one raised. */
export function Segmented(props: { items: () => string[]; selected: () => i32; onSelect: (i: i32) => void }): i32 {
  return <View className={`flex-row p-[2] gap-[2] rounded-[7] ${bg(theme().surface)}`}>
    {props.items().map((label: string, i: i32) => <View className={`flex-row items-center h-[22] px-3 rounded-[5] cursor-pointer ${props.selected() === i ? `shadow-sm ${bg(theme().dark ? theme().active : theme().bg)}` : `hover:${bg(theme().hover)}`}`}
      onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) props.onSelect(i); }}>
      <Text className={`text-[12px] ${fg(props.selected() === i ? theme().text : theme().muted)}`}>{label}</Text>
    </View>)}
  </View>;
}

/** A switch, the macOS way: the accent when on. */
export function Toggle(props: { on: () => boolean; onChange: (on: boolean) => void }): i32 {
  return <View className={`w-[34] h-[20] rounded-full p-[2] cursor-pointer ${props.on() ? `items-end ${bg(theme().accent)}` : `items-start ${bg(theme().active)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) props.onChange(!props.on()); }}>
    <View className="w-[16] h-[16] rounded-full bg-white shadow-sm" />
  </View>;
}
