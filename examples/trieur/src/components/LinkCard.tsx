import { THEME } from 'zinc:trieur';
import type { Link } from '@trieur/data/links';

export function LinkCard(p: { link: Link }): any {
  const l = p.link;
  return <View className="grow p-5 gap-2">
    <Text className="text-[12px] font-mono" style={{ color: THEME.dim }}>{l.host + ' ↗'}</Text>
    <Text className="text-[19px] font-semibold leading-[24px]" style={{ color: THEME.ink }} numberOfLines={2}>{l.title}</Text>
    <Text className="text-[13px] leading-[18px]" style={{ color: THEME.body }} numberOfLines={3}>{l.excerpt}</Text>
    <View className="grow" />
    <View className="flex-row gap-1.5 flex-wrap">
      {l.tags.map((t: string) => <View className="px-2 h-[22] rounded-full items-center justify-center" style={{ backgroundColor: THEME.tag }}><Text className="text-[11px]" style={{ color: THEME.tagInk }}>{t}</Text></View>)}
    </View>
  </View>;
}
