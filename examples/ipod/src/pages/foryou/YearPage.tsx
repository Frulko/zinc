// Your year, as Spotify's Wrapped: the listens and minutes of the year so far, its top artists, songs and genres, and a chart of the
// listens per month (services/forYou.ts yearReview, worked out with the For you page's shelves). Reached from the For you page.
import * as ui from 'zinc:ui';
import { createEffect } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { goBack, scrollKey } from '../../state';
import { Named, YearReview, MONTHS } from '../../services/forYou';
import { ForYouData, forYou, refreshForYou } from '../../forYou';
import { bg, bd, fg, color, CARD, BORDER, TEXT, MUTED, ACCENT, TRACK, YEAR_CHART_HEIGHT } from '../../constants';

function Big(props: { value: string; label: string }): i32 {
  return <View className={`flex-col gap-1 px-6 py-5 rounded-[12] border grow basis-0 ${bg(CARD)} ${bd(BORDER)}`}>
    <Text className={`text-[30px] font-bold ${fg(ACCENT)}`}>{props.value}</Text>
    <Text className={`text-[13px] ${fg(MUTED)}`}>{props.label}</Text>
  </View>;
}

function Top(props: { title: string; list: Named[]; unit: string }): i32 {
  return <View className={`flex-col gap-2 px-6 py-5 rounded-[12] border grow basis-0 min-w-0 ${bg(CARD)} ${bd(BORDER)}`}>
    <Text className={`text-[15px] font-bold pb-1 ${fg(TEXT)}`}>{props.title}</Text>
    {props.list.length === 0 ? <Text className={`text-[13px] ${fg(MUTED)}`}>Nothing yet</Text> : <View />}
    {props.list.map((n: Named, i: i32) => <View className="flex-row items-center gap-3 min-w-0">
      <Text className={`w-[18] text-[15px] font-bold ${fg(ACCENT)}`}>{`${i + 1}`}</Text>
      <View className="grow flex-col min-w-0">
        <Text className={`text-[13px] font-semibold ${fg(TEXT)}`} numberOfLines={1}>{n.name}</Text>
        {n.detail !== '' ? <Text className={`text-[12px] ${fg(MUTED)}`} numberOfLines={1}>{n.detail}</Text> : <View />}
      </View>
      <Text className={`text-[12px] ${fg(MUTED)}`}>{`${n.count} ${props.unit}`}</Text>
    </View>)}
  </View>;
}

function Months(props: { y: YearReview }): i32 {
  let most = 1;
  for (const n of props.y.months) if (n > most) most = n;
  return <View className={`flex-col gap-3 px-6 py-5 rounded-[12] border ${bg(CARD)} ${bd(BORDER)}`}>
    <Text className={`text-[15px] font-bold ${fg(TEXT)}`}>Listens per month</Text>
    <View className="flex-row items-end gap-2" style={{ height: YEAR_CHART_HEIGHT + 20 }}>
      {props.y.months.map((n: i32, i: i32) => <View className="grow basis-0 flex-col items-center gap-1">
        <Text className={`text-[10px] ${fg(MUTED)}`}>{n > 0 ? `${n}` : ''}</Text>
        <View className={`w-full rounded-[3] ${bg(n > 0 ? ACCENT : TRACK)}`} style={{ height: Math.max(2, Math.round(YEAR_CHART_HEIGHT * n / most)) }} />
      </View>)}
    </View>
    <View className="flex-row gap-2">
      {MONTHS.map((m: string) => <Text className={`grow basis-0 text-center text-[11px] ${fg(MUTED)}`}>{m.slice(0, 3)}</Text>)}
    </View>
  </View>;
}

function Body(props: { y: YearReview }): i32 {
  const y = props.y;
  return <View className="flex-col gap-5 px-10 pt-4 pb-10">
    <Text className={`text-[30px] font-bold ${fg(TEXT)}`}>{`Your ${y.year}`}</Text>
    <View className="flex-row gap-5">
      <Big value={`${y.listens}`} label="listens" />
      <Big value={`${y.minutes}`} label="minutes listened (about)" />
      <Big value={y.artists.length > 0 ? y.artists[0].name : '–'} label="your top artist" />
    </View>
    <View className="flex-row gap-5">
      <Top title="Top artists" list={y.artists} unit="plays" />
      <Top title="Top songs" list={y.songs} unit="plays" />
      <Top title="Top genres" list={y.genres} unit="plays" />
    </View>
    <Months y={y} />
  </View>;
}

export function YearPage(): i32 {
  createEffect(() => { if (forYou() === null) setTimeout(() => { refreshForYou(); }, 0); });
  return <ScrollView className="grow" scrollKey={scrollKey('year')}>
    <View className="flex-row items-center gap-1 px-8 pt-5 cursor-pointer" onPointerDown={(e: ui.PointerEvent) => goBack()}>
      <Icon name="chevron-left" size={18} color={() => color(ACCENT)} strokeWidth={2.5} />
      <Text className={`text-[13px] ${fg(ACCENT)}`}>For you</Text>
    </View>
    {forYou() !== null ? <Body y={(forYou() as ForYouData).year} /> : <Text className={`text-[13px] px-10 pt-6 ${fg(MUTED)}`}>Working out your year…</Text>}
  </ScrollView>;
}
