// Small shared controls: a drawn glyph, a ghost icon button (Zed's toolbar style) and a key hint.
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from '../app/theme';
import { drawIcon } from './icons';

/** One of icons.ts's glyphs on a lazy canvas (redrawn with the rest of the window, not every frame). */
export function Glyph(props: { kind: i32; color: () => i32; size?: i32 }): i32 {
  const s = props.size ?? 16;
  return <Canvas style={{ width: s, height: s, lazy: 1 }}
    onDraw={(x: i32, y: i32, w: i32, h: i32) => drawIcon(props.kind, x, y, w, props.color(), theme().surface)} />;
}

/** Ghost icon button: transparent until hovered, tinted while `on`. Acts on press, like Zed's toolbar. */
export function IconButton(props: { kind: i32; onPress: () => void; on?: () => boolean; size?: i32 }): i32 {
  const on = (): boolean => props.on !== undefined ? (props.on as () => boolean)() : false;
  return <View class={`w-[26] h-[26] rounded-md items-center justify-center cursor-pointer ${on() ? bg(theme().active) : ''} hover:${bg(theme().hover)}`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) props.onPress(); }}>
    <Glyph kind={props.kind} size={props.size ?? 16} color={() => on() ? theme().text : theme().muted} />
  </View>;
}

/** Key hint ('⌘P') in a list row or a tooltip. */
export function Kbd(props: { keys: string }): i32 {
  return <View class={`px-1.5 h-[18] rounded items-center justify-center border ${bd(theme().borderSoft)} ${bg(theme().bg)}`}>
    <Text class={`text-[11px] ${fg(theme().muted)}`}>{props.keys}</Text>
  </View>;
}
