// The actions the mapper remembers, latest first: a click goes back to one, or forward again until something new is done.
import { Button } from 'zinc:ui/kit';
import { onCleanup, onMount } from 'zinc:ui/solid';
import { loadHistory, stepHistory, store } from '../state';
import { Heading } from './Field';
import { Rebuilt } from './Rebuilt';
import { tr } from '../i18n';

const REFRESH_MS = 1000;

function Entries(): i32 {
  const rows: i32[] = [];
  for (let i: i32 = store.history.entries.length - 1; i >= 0; i--) rows.push(i);
  return <View className="gap-1 items-start">
    {rows.map((i: i32) => <Button size="sm" variant={i === store.history.at ? 'default' : 'ghost'} className={i > store.history.at ? 'opacity-50' : ''}
      label={store.history.entries[i]} onClick={() => { stepHistory(`${i}`); }} />)}
  </View>;
}

export function HistoryPanel(): i32 {
  let timer: i32 = -1;
  onMount(() => {
    loadHistory();
    timer = setInterval(() => { loadHistory(); }, REFRESH_MS);
  });
  onCleanup(() => { clearInterval(timer); });
  return <View className="p-3 gap-2">
    <Heading text={tr('mapper.history.heading')} />
    <Text className="text-xs text-zinc-400">{tr('mapper.history.hint')}</Text>
    <Rebuilt make={Entries} />
  </View>;
}
