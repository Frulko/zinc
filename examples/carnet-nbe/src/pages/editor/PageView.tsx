// The open page: breadcrumb and the people here, then the icon, the title and the blocks in a centred column; a click below
// the last block writes there. Dragging a block by its grip shows a line where it lands (zinc:ui/dnd's monitor) and moves it.
import { createMemo, createNodeRef, createSignal, onCleanup } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as dnd from 'zinc:ui/dnd';
import { Page, Block, Peer, currentPage, peers, renamePage, cyclePageIcon, blockOf, moveNear, insertBlockAfter } from '../../state';
import { labels } from '../../labels';
import { PAGE_MAX_WIDTH, HANDLE_WIDTH, T_TEXT } from '../../constants';
import { BlockRow, rowOf } from '../../components/Block';
import { Avatar } from '../../components/Sidebar';
import { focusBlock, focusTitle } from '../../components/focus';
import { onTitleKey } from '../../components/block-keys';
import { appRoot } from '../../components/root';
import { PageIcon } from '../../components/PageIcon';

const [dropLine, setDropLine] = createSignal<number[]>([]);   // [x, y, width] in the root, empty: none

/** Where the dragged block would land: the edge of the row under the pointer. */
function showDrop(d: dnd.DragInfo): void {
  if (d.targets.length === 0 || d.targets[0].data === d.data) { setDropLine([]); return; }
  const t = d.targets[0], h = rowOf(t.data);
  if (h < 0) return;
  const box = ui.screenBox(h), at = ui.toLocal(appRoot.node, box[0], t.edge === dnd.EDGE_TOP ? box[1] : box[1] + box[3]);
  const right = ui.toLocal(appRoot.node, box[0] + box[2], box[1]);
  setDropLine([at[0] + HANDLE_WIDTH, at[1] - 1.5, right[0] - at[0] - HANDLE_WIDTH - 72]);
}
function drop(d: dnd.DragInfo): void {
  setDropLine([]);
  if (d.targets.length === 0) return;
  const t = d.targets[0], moved = blockOf(d.data), onto = blockOf(t.data);
  if (moved === null || onto === null || moved === onto) return;
  moveNear(moved as Block, onto as Block, t.edge === dnd.EDGE_BOTTOM);
}
/** Once, at start: the drag monitor. */
export function watchDrags(): void { dnd.monitor({ onDrag: showDrop, onDrop: drop }); }

export function DropLine(): i32 {
  return <View className="absolute h-[3] rounded-full bg-[#2383e2] opacity-60 pointer-events-none"
    style={{ hidden: dropLine().length === 0 ? 1 : 0, left: dropLine().length > 0 ? dropLine()[0] : 0, top: dropLine().length > 0 ? dropLine()[1] : 0, width: dropLine().length > 0 ? dropLine()[2] : 0 }} />;
}

/** A click under the last block: the caret goes to the last block when it is an empty paragraph, else to a new one. */
function writeBelow(p: Page): void {
  const last = p.items.length > 0 ? p.items[p.items.length - 1] : null;
  if (last !== null && (last as Block).type() === T_TEXT && (last as Block).text() === '') focusBlock(last as Block, 0);
  else focusBlock(insertBlockAfter(p, last, T_TEXT, ''), 0);
}

function TopBar(props: { p: Page }): i32 {
  const p = props.p;
  return <View className="flex-row items-center h-[46] px-4 gap-2">
    <PageIcon p={p} size={17} color={0x91918e} />
    <Text className="text-[14px] text-[#37352f] grow" numberOfLines={1}>{p.title() === '' ? labels.untitled : p.title()}</Text>
    {peers().map((x: Peer) => <View className={x.page === p.id ? 'opacity-100' : 'opacity-40'}><Avatar name={x.name} color={x.color} size={24} /></View>)}
  </View>;
}

function PageBody(props: { p: Page }): i32 {
  const p = props.p, scroller = createNodeRef();
  const node = <View className="grow flex-col">
    <TopBar p={p} />
    <ScrollView ref={scroller} className="grow flex-col">
      <View className={`flex-col w-full max-w-[${PAGE_MAX_WIDTH + HANDLE_WIDTH + 72}] mx-auto pt-[72] pb-[24]`}>
        <View className="flex-row pl-[52]">
          <View className="rounded-md hover:bg-[#efefed] px-1 cursor-pointer" onPointerDown={(e: ui.PointerEvent) => cyclePageIcon(p)}>
            <PageIcon p={p} size={64} color={0x37352f} />
          </View>
        </View>
        <View className="flex-row pl-[52] pr-[72] pt-3 pb-2">
          <TextArea ref={p.titleRef} rows={0} className="grow border-0 p-0 rounded-none bg-transparent focus:border-[#ffffff] text-[40px] font-bold leading-[48] text-[#37352f]"
            placeholder={labels.untitled} value={p.title()} onInput={(v: string) => renamePage(p, v.replaceAll('\n', ' '))} onKeyDown={(e: ui.KeyEvent) => onTitleKey(p, e)} />
        </View>
        {p.blocks().map((b: Block) => <BlockRow b={b} />)}
      </View>
      <View className="w-full h-[240] cursor-text" onPointerDown={(e: ui.PointerEvent) => writeBelow(p)} />
    </ScrollView>
  </View>;
  const title = p.titleRef.node;
  onCleanup(dnd.autoScroll(scroller.node));
  onCleanup(() => { if (p.titleRef.node === title) p.titleRef.node = -1; });   // its node is freed: no caret to ask it for
  return node;
}

/** The page shown, rebuilt when another page opens. */
export function PageView(): i32 {
  const shown = createMemo<Page[]>(() => { const p = currentPage(); return p === null || !(p as Page).ready() ? [] : [p as Page]; }, []);
  return <View className="grow flex-col">
    {shown().map((p: Page) => <PageBody p={p} />)}
    {shown().length === 0 && currentPage() === null && <View className="grow items-center justify-center"><Text className="text-[15px] text-[#91918e]">No page. Make one in the sidebar.</Text></View>}
  </View>;
}
