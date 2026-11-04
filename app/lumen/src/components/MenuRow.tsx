// A row of the panel, as in the menus of the menu bar: an icon in a disc, a label, what is set now, and a chevron that opens its content under it.
import * as ui from 'zinc:ui';
import { createEffect, createNodeRef, createSignal } from 'zinc:ui/solid';
import { Symbol } from './Symbol';
import { TEXT_ROW, TEXT_SMALL, palette } from '../theme';
import { openRow, setOpenRow } from '../state';

const DISC = 22;
const UNFOLD_MS = 200;
const CHEVRON_OPEN_DEG = 90;
const AUTO = -1;   // a height of zinc:ui's style table that follows the content

export function RowIcon(props: { name: string }): i32 {
  return <View className={`w-[${DISC}px] h-[${DISC}px] rounded-full items-center justify-center ${palette().disc}`}>
    <Symbol name={props.name} side={16} pointSize={11} />
  </View>;
}

export function PlainRow(props: { label: string; icon: string; onPress: () => void }): i32 {
  return <View role="button" focusable aria-label={props.label} className={`cursor-pointer flex-row items-center gap-2 h-[28px] px-1 rounded-[7px] ${palette().rowHover}`} onPress={props.onPress}>
    <RowIcon name={props.icon} />
    <Text className={`${TEXT_ROW} ${palette().label}`}>{props.label}</Text>
  </View>;
}

/** The section unfolds under its row: its clip goes from no height to the height of its content while the content fades in, and back. The clip's height is
 *  auto once open, so a section that grows (the banner of a mode change) keeps growing. */
export function MenuRow(props: { label: string; icon: string; value?: () => string; children?: () => i32 }): i32 {
  const isOpen = (): boolean => openRow() === props.label;
  const currentValue = (): string => { const read = props.value; return read !== undefined ? read() : ''; };
  const [mounted, setMounted] = createSignal<boolean>(isOpen());
  const clip = createNodeRef();
  const content = createNodeRef();
  const chevron = createNodeRef();
  async function unfold(): Promise<void> {
    setMounted(true);
    const from = ui.getNumber(clip.node, 'height');
    ui.setNumber(clip.node, 'height', AUTO);   // measured unclipped: a ScrollView inside fits the height it is given
    ui.layout();
    const measured = ui.inspectNode(clip.node);
    ui.setNumber(clip.node, 'height', from);
    ui.animate(content.node, 'opacity', 1, UNFOLD_MS, 'out', 0);
    await ui.animate(clip.node, 'height', measured !== null ? measured.lh : 0, UNFOLD_MS, 'out', 0);
    if (isOpen()) ui.setNumber(clip.node, 'height', AUTO);
  }
  async function fold(): Promise<void> {
    ui.animate(content.node, 'opacity', 0, UNFOLD_MS, 'out', 0);
    await ui.animate(clip.node, 'height', 0, UNFOLD_MS, 'out', 0);
    if (!isOpen()) setMounted(false);
  }
  const row = <View>
    <View role="button" focusable aria-label={props.label} className={`cursor-pointer flex-row items-center gap-2 h-[28px] px-1 rounded-[7px] ${palette().rowHover} ${isOpen() ? palette().rowOn : ''}`}
      onPress={() => setOpenRow(isOpen() ? '' : props.label)}>
      <RowIcon name={props.icon} />
      <Text className={`grow shrink ${TEXT_ROW} truncate ${palette().label}`}>{props.label}</Text>
      <Text className={`${TEXT_SMALL} ${palette().secondary}`}>{currentValue()}</Text>
      <View ref={chevron}><Symbol name="chevron.right" side={14} pointSize={9} weight={0.3} /></View>
    </View>
    <View ref={clip} className="overflow-hidden">
      <View ref={content} className="py-[2px]">
        <Show when={mounted()}>
          <View className={`p-2 rounded-[8px] gap-2 ${palette().well}`}>{props.children !== undefined ? props.children() : null}</View>
        </Show>
      </View>
    </View>
  </View>;
  let wasOpen = isOpen();
  ui.setNumber(clip.node, 'height', wasOpen ? AUTO : 0);
  ui.setNumber(content.node, 'opacity', wasOpen ? 1 : 0);
  ui.setNumber(chevron.node, 'rotate', wasOpen ? CHEVRON_OPEN_DEG : 0);
  createEffect(() => {
    const open = isOpen();
    if (open === wasOpen) return;
    wasOpen = open;
    ui.animate(chevron.node, 'rotate', open ? CHEVRON_OPEN_DEG : 0, UNFOLD_MS, 'out', 0);
    if (open) unfold(); else fold();
  });
  return row;
}
