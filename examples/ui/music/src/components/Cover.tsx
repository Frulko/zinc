import { theme } from 'zinc:ui/kit';
export function Cover(p: { art: i32; size?: number }): i32 {
  const size = p.size ?? 112;
  return <View aria-hidden="true" className={`relative overflow-hidden shrink-0 rounded-[10px] bg-${theme().muted} border border-${theme().border}`} style={{ width: size, height: size }}>
    <View className={`absolute rounded-full border-[${Math.max(3, size / 16)}px] border-${theme().mutedForeground}`} style={{ width: size * .65, height: size * .65, left: size * (.08 + p.art % 3 * .12), top: size * (.1 + p.art % 2 * .18) }} />
    <View className={`absolute bg-${theme().card}`} style={{ width: size * .72, height: size * .12, left: size * .14, top: size * (.36 + p.art % 3 * .13), rotate: p.art % 2 === 0 ? -20 : 20 }} />
  </View>;
}
