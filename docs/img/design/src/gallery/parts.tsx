// Text and small pieces the gallery's cards share, in the Quiet theme's roles. The pieces drawn here by hand (a field with a prefix, a chip, a
// sparkline, a calendar, a bar chart) are the kit components of ZN-1078.06 to .15; they move into the kit with those tasks.
import { theme, themeColor } from 'zinc:ui/kit';
import { Icon } from 'zinc:icons';

/** A field's label, a card's quiet title: 13 px medium. */
export function Label(props: { text: string; className?: string }): i32 {
  return <Text className={`text-[13px] font-medium text-${theme().foreground} ${props.className ?? ''}`}>{props.text}</Text>;
}

/** Body text: 13 px regular. */
export function Body(props: { text: string; className?: string }): i32 {
  return <Text className={`text-[13px] text-${theme().foreground} ${props.className ?? ''}`}>{props.text}</Text>;
}

/** Secondary text: 12 or 13 px in the muted foreground. */
export function Muted(props: { text: string; small?: boolean; className?: string }): i32 {
  return <Text className={`${(props.small ?? false) ? 'text-[12px]' : 'text-[13px]'} text-${theme().mutedForeground} ${props.className ?? ''}`}>{props.text}</Text>;
}

/** A Lucide icon in a theme role's colour (it follows the scheme and the accent). */
export function RoleIcon(props: { name: string; size?: number; role?: string }): i32 {
  return <Icon name={props.name} size={props.size ?? 16} strokeWidth={1.75} color={() => themeColor(props.role ?? 'foreground')} />;
}

/** A card surface with the Quiet padding (24) for content that is not header / content / footer sections. */
export function Surface(props: { className?: string; children: () => i32 }): i32 {
  const t = theme();
  return <View className={`flex-col p-6 rounded-[18px] border border-${t.border} bg-${t.card} ${props.className ?? ''}`}>{props.children()}</View>;
}

/** A text field with a quiet prefix and suffix inside its 3:1 edge (ZN-1078.06 Inputs: affixes). */
export function AffixField(props: { prefix: string; value: string; suffix: string }): i32 {
  const t = theme();
  return <View className={`flex-row items-center gap-1 h-[36px] px-3 rounded-[10px] border border-${t.input}`}>
    <Muted text={props.prefix} />
    <Body text={props.value} className="grow" />
    <Muted text={props.suffix} />
  </View>;
}

/** A selectable chip: a pill with a hairline, a check and a quiet fill when on (ZN-1078.08 Selection). */
export function Chip(props: { label: string; on: () => boolean; onToggle: () => void }): i32 {
  const t = theme();
  return <View role="checkbox" aria-checked={String(props.on())} focusable onClick={props.onToggle}
    className={`flex-row items-center gap-1.5 h-[30px] px-3 rounded-full border transition-colors cursor-pointer ${props.on() ? `border-${t.input} bg-${t.muted}` : `border-${t.border}`}`}>
    <Show when={props.on()}><RoleIcon name="check" size={14} /></Show>
    <Text className={`text-[13px] text-${t.foreground}`}>{props.label}</Text>
  </View>;
}
