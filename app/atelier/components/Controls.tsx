// Small shared controls: a drawn glyph, a round ghost button and a key hint.
import { createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from '../app/theme';
import { drawIcon } from './icons';

/** One of icons.ts's glyphs on a lazy canvas (redrawn with the rest of the window, not every frame). */
export function Glyph(props: { kind: i32; color: () => i32; size?: i32; back?: () => i32 }): i32 {
  const s = props.size ?? 16;
  return <Canvas style={{ width: s, height: s, lazy: 1 }}
    onDraw={(x: i32, y: i32, w: i32, h: i32) => drawIcon(props.kind, x, y, w, props.color(), props.back !== undefined ? (props.back as () => i32)() : theme().chrome)} />;
}

/** A hint under its children while the pointer rests on them (the pattern of the kit's Tooltip: a layer anchored to them, so it
 *  is drawn above everything and moves to the side that has room). `label` is read when it shows: it follows the language. */
export function Tip(props: { label: () => string; children: () => i32 }): i32 {
  const wrap = createNodeRef(), tip = createNodeRef();
  let timer: i32 = -1;
  const show = (on: boolean): void => { if (tip.node >= 0) ui.setNumber(tip.node, 'hidden', on ? 0 : 1); };
  const node = <View ref={wrap} className="flex-col"
    onPointerEnter={(e: ui.PointerEvent) => { if (timer >= 0) clearTimeout(timer); timer = setTimeout(() => { timer = -1; show(true); }, 400); }}
    onPointerLeave={(e: ui.PointerEvent) => { if (timer >= 0) clearTimeout(timer); timer = -1; show(false); }}
    onPointerDown={(e: ui.PointerEvent) => { if (timer >= 0) clearTimeout(timer); timer = -1; show(false); }}>
    {props.children()}
    <View ref={tip} className={`max-w-[280] px-2.5 py-1.5 rounded-lg shadow-md ${bg(theme().text)}`} hidden={1}>
      <Text className={`text-[12px] ${fg(theme().bg)}`}>{props.label()}</Text>
    </View>
  </View>;
  ui.openLayer(tip.node, { priority: 300 });
  ui.anchor(tip.node, wrap.node, 'bottom', 6);
  return node;
}

/** Round ghost button: transparent until hovered, tinted while `on`. Acts on press; `tip` says what it does. */
export function IconButton(props: { kind: i32; onPress: () => void; on?: () => boolean; size?: i32; tip?: () => string }): i32 {
  const on = (): boolean => props.on !== undefined ? (props.on as () => boolean)() : false;
  const button = (): i32 => <View className={`w-[30] h-[30] rounded-full items-center justify-center cursor-pointer ${on() ? bg(theme().active) : ''} hover:${bg(theme().hover)}`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) props.onPress(); }}>
    <Glyph kind={props.kind} size={props.size ?? 16} color={() => on() ? theme().text : theme().muted} />
  </View>;
  return props.tip !== undefined ? <Tip label={props.tip as () => string}>{button()}</Tip> : button();
}

/** Key hint ('⌘R') in a list row. */
export function Kbd(props: { keys: string }): i32 {
  return <View className={`px-1.5 h-[20] rounded-md items-center justify-center border ${bd(theme().borderSoft)} ${bg(theme().chrome)}`}>
    <Text className={`text-[11px] ${fg(theme().muted)}`}>{props.keys}</Text>
  </View>;
}
