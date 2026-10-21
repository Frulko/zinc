// A page's icon: a Lucide icon chosen at run time (it can change while shown, by me or by someone else).
import { createEffect } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { icon } from 'zinc:icons';
import { Svg } from 'zinc:svg';
import { Page } from '../state';

export function PageIcon(props: { p: Page; size: i32; color: i32 }): i32 {
  const p = props.p, color = props.color;
  createEffect(() => { p.icon(); ui.repaint(); });   // a lazy canvas draws again only with a frame
  return <Canvas style={{ width: props.size, height: props.size, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => {
    const s = icon(p.icon(), color, 1.75);
    if (s !== null) (s as Svg).draw(x, y, w, h, 255);
  }} />;
}
