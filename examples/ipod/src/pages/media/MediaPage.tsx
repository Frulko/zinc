// The tracks of one kind (songs, podcasts, audiobooks, videos), searchable by title, artist and album, sorted by a click on a
// column's header. Download copies the selected tracks to the computer, or all of them (the shown ones, after a search) when none is
// selected; Delete removes the selected ones from the iPod (Allow changes, a question).
import { Show } from 'zinc:ui/solid';
import * as ipod from 'zinc:ipod';
import { songs, search, setSearch, page, countOf, selected, allowChanges, scrollKey } from '../../state';
import { download, deleteTracks, notice } from '../../actions';
import { busy } from '../../services/transfers';
import { Button } from '../../components/Button';
import { TrackTable } from '../../components/TrackTable';
import { SearchField } from '../../components/SearchField';
import { count } from '../../format';
import { fg, TEXT, MUTED, ERROR } from '../../constants';

export function MediaPage(props: { title: string; one: string; many: string }): i32 {
  const total = (): i32 => countOf(page());
  return <View className="grow flex-col min-h-0">
    <View className="flex-row items-center gap-4 px-10 pt-8 pb-4">
      <View className="grow flex-col">
        <Text className={`text-[26px] font-bold ${fg(TEXT)}`}>{props.title}</Text>
        <Text className={`text-[13px] ${fg(MUTED)}`}>{search().trim() === '' ? count(total(), props.one, props.many) : `${songs().length} of ${count(total(), props.one, props.many)}`}</Text>
      </View>
      {total() > 0 ? <Button icon="download" label={selected().length > 0 ? `Download ${selected().length} selected` : `Download all`}
        busy={busy(selected().length > 0 ? `Download ${count(selected().length, props.one, props.many)}` : `Download all ${props.many}`)}
        onPress={() => {
          const pick: ipod.Track[] = [];
          for (const t of songs()) if (selected().length === 0 || selected().indexOf(t.id) >= 0) pick.push(t);
          download(selected().length > 0 ? `${count(pick.length, props.one, props.many)}` : `all ${props.many}`, pick);
        }} /> : <View />}
      <Show when={selected().length > 0}><Button icon="trash" label={`Delete ${selected().length}`} danger={true} disabled={!allowChanges()} busy={busy('delete')}
        onPress={() => {
          const pick: ipod.Track[] = [];
          for (const t of songs()) if (selected().indexOf(t.id) >= 0) pick.push(t);
          deleteTracks(count(pick.length, props.one, props.many), pick);
        }} /></Show>
      <SearchField value={search()} onInput={(v: string) => setSearch(v)} placeholder="Search title, artist, album" width={260} />
    </View>
    <Show when={notice() !== ''}><Text className={`text-[12px] px-10 pb-2 ${fg(ERROR)}`}>{notice()}</Text></Show>
    {total() === 0
      ? <Text className={`text-[13px] px-10 ${fg(MUTED)}`}>{`No ${props.many} on this iPod`}</Text>
      : <TrackTable tracks={songs} numbered={false} sortable={true} showAlbum={true} from={props.title} scrollKey={scrollKey(page())} />}
  </View>;
}
