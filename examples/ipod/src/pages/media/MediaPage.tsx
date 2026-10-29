// The tracks of one kind (songs, podcasts, audiobooks, videos), searchable by title, artist and album, sorted by a click on a
// column's header. Download copies the selected tracks to the computer, or all of them (the shown ones, after a search) when none is
// selected.
import { Icon } from 'zinc:icons';
import * as ipod from 'zinc:ipod';
import { songs, search, setSearch, page, countOf, selected } from '../../state';
import { download } from '../../actions';
import { Button } from '../../components/Button';
import { TrackTable } from '../../components/TrackTable';
import { count } from '../../format';
import { bg, bd, fg, color, CARD, BORDER, TEXT, MUTED } from '../../constants';

export function MediaPage(props: { title: string; one: string; many: string }): i32 {
  const total = (): i32 => countOf(page());
  return <View className="grow flex-col min-h-0">
    <View className="flex-row items-center gap-4 px-10 pt-8 pb-4">
      <View className="grow flex-col">
        <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>{props.title}</Text>
        <Text className={`text-[13px] ${fg(MUTED)}`}>{search().trim() === '' ? count(total(), props.one, props.many) : `${songs().length} of ${count(total(), props.one, props.many)}`}</Text>
      </View>
      {total() > 0 ? <Button icon="download" label={selected().length > 0 ? `Download ${selected().length} selected` : `Download all`}
        onPress={() => {
          const pick: ipod.Track[] = [];
          for (const t of songs()) if (selected().length === 0 || selected().indexOf(t.id) >= 0) pick.push(t);
          download(selected().length > 0 ? `${count(pick.length, props.one, props.many)}` : `all ${props.many}`, pick);
        }} /> : <View />}
      <View className={`flex-row items-center gap-2 w-[260] h-[32] px-3 rounded-[8] border ${bg(CARD)} ${bd(BORDER)}`}>
        <Icon name="search" size={14} color={() => color(MUTED)} strokeWidth={2} />
        <Input className={`grow text-[13px] ${fg(TEXT)}`} value={search()} onInput={(v: string) => setSearch(v)} placeholder="Search title, artist, album" />
      </View>
    </View>
    {total() === 0
      ? <Text className={`text-[13px] px-10 ${fg(MUTED)}`}>{`No ${props.many} on this iPod`}</Text>
      : <TrackTable tracks={songs} numbered={false} sortable={true} showAlbum={true} />}
  </View>;
}
