// Small pieces the screens share: a section card, a pill button, a two-way choice.
import { Icon } from 'zinc:icons';
import { THEME } from 'zinc:trieur';

export function Section(p: { title: () => string; icon: string; children?: any }): any {
  return <View className="rounded-[18] p-5 gap-3" style={{ backgroundColor: THEME.card, borderWidth: 1, borderColor: THEME.cardLine }}>
    <View className="flex-row items-center gap-2">
      <Icon name={p.icon} size={17} color={() => THEME.accent} />
      <Text className="text-[15px] font-semibold" style={{ color: THEME.ink }}>{p.title()}</Text>
    </View>
    {p.children}
  </View>;
}

export function Pill(p: { label: () => string; icon: string; onClick: () => void; primary?: boolean; danger?: boolean; disabled?: () => boolean }): any {
  const bg = () => (p.disabled && p.disabled() ? THEME.chip : p.danger ? 0xef4444 : p.primary ? THEME.accent : THEME.chip);
  const fg = () => (p.disabled && p.disabled() ? THEME.dim : p.danger || p.primary ? 0xffffff : THEME.ink);
  return <Button onClick={() => { if (!(p.disabled && p.disabled())) p.onClick(); }} className="h-[38] px-4 rounded-[11] flex-row items-center gap-2"
    style={{ backgroundColor: bg(), borderWidth: p.primary || p.danger ? 0 : 1, borderColor: THEME.cardLine }}>
    <Icon name={p.icon} size={16} color={fg} />
    <Text className="text-[13px] font-semibold" style={{ color: fg() }}>{p.label()}</Text>
  </Button>;
}

export function Choice<V extends string>(p: { value: () => V; options: Array<{ v: V; label: () => string; icon: string }>; onPick: (v: V) => void }): any {
  return <View className="flex-row gap-1 p-1 rounded-[12] self-start" style={{ backgroundColor: THEME.chip, borderWidth: 1, borderColor: THEME.cardLine }}>
    {p.options.map((o) => <Button onClick={() => p.onPick(o.v)} className="h-[34] px-3 rounded-[9] flex-row items-center gap-2"
      style={{ backgroundColor: p.value() === o.v ? THEME.accent : THEME.chip }}>
      <Icon name={o.icon} size={15} color={() => (p.value() === o.v ? 0xffffff : THEME.dim)} />
      <Text className="text-[13px] font-medium" style={{ color: p.value() === o.v ? 0xffffff : THEME.ink }}>{o.label()}</Text>
    </Button>)}
  </View>;
}
