// <Icon kind color size>: one of the stroke icons of icons.ts on a small canvas node.
import { drawIcon } from './icons';

export function Icon(props: { kind: i32; color: () => u32; size?: i32 }): i32 {
  const s = props.size ?? 18;
  return <Canvas style={{ width: s, height: s }}
    onDraw={(x: i32, y: i32, w: i32, h: i32) => drawIcon(props.kind, x, y, w, h, props.color())} />;
}
