// zinc:ui/history: a page and a filter as the view state. Cmd+[ and Cmd+] move back and forward, the mouse's side buttons too; leaving an
// entry captures the filter typed since; the list of an entry comes back at its offset (scrollKey from the history), a new entry starts at
// the top; a push after back drops the entries ahead.
import * as ui from 'zinc:ui';
import { render, createSignal, createNodeRef } from 'zinc:ui/solid';
import { createHistory } from 'zinc:ui/history';
import { quit } from 'zinc:gfx';

class Shown { page: string; filter: string; constructor(page: string, filter: string) { this.page = page; this.filter = filter; } }
const [page, setPage] = createSignal<string>('a');
const [filter, setFilter] = createSignal<string>('');
const history = createHistory<Shown>(new Shown('a', ''), () => new Shown(page(), filter()), (v: Shown) => { setPage(v.page); setFilter(v.filter); });
const list = createNodeRef();

function App(): i32 {
  return <View className="w-full h-full flex-col">
    {page() === 'a'
      ? <VirtualList ref={list} scrollKey={history.scrollKey('a')} count={500} itemHeight={20} className="h-[100px]">
          {(i: i32) => <View className="h-[20px]"><Text>{`row ${i}`}</Text></View>}
        </VirtualList>
      : <Text>{`page ${page()}`}</Text>}
  </View>;
}

function show(tag: string): void {
  const l = page() === 'a' ? ui.inspectNode(list.node) : null;
  console.log(tag, 'page', page(), 'filter', `'${filter()}'`, 'key', history.key(), 'sy', l === null ? -1 : Math.round(l.sy), 'back', history.canBack(), 'forward', history.canForward());
}

let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 3) { ui.scrollTo(list.node, 0, 1200); setFilter('ab'); show('start'); history.push(new Shown('b', '')); }
  if (f === 5) { show('pushed b'); setFilter('x'); ui.keyDown(-1, '[', ui.META); }
  if (f === 7) { show('cmd+['); ui.keyDown(-1, ']', ui.META); }
  if (f === 9) { show('cmd+]'); ui.pointerAt(10, 200, true, 3); ui.pointerAt(10, 200, false, 3); }
  if (f === 11) { show('back button'); history.push(new Shown('a', '')); }
  if (f === 13) { show('new a'); ui.pointerAt(10, 200, true, 3); ui.pointerAt(10, 200, false, 3); }
  if (f === 15) { show('back again'); ui.pointerAt(10, 200, true, 4); ui.pointerAt(10, 200, false, 4); }
  if (f === 17) { show('forward button'); ui.keyDown(-1, ']', ui.META); }
  if (f === 19) { show('nothing ahead'); quit(); }
});
