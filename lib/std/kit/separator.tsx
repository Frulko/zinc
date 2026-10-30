/** @jsxHelpers ./host */
// zinc:ui/kit — Separator: a one-pixel hairline, horizontal (full width) or vertical (full height of its row).
//
//   <Separator />   <Separator vertical />
import * as ui from 'zinc:ui';
import { theme } from './theme';

export interface SeparatorProps {
  vertical?: boolean;
  className?: string;
}

export function Separator(props?: SeparatorProps): i32 {
  const shape = (props?.vertical ?? false) ? 'w-px h-full' : 'h-px w-full';
  return <View className={`${shape} bg-${theme().border} ${props?.className ?? ''}`} role="separator" aria-orientation={(props?.vertical ?? false) ? 'vertical' : 'horizontal'} />;
}

// ResizeHandle: shadcn's ResizableHandle, a bar between two panes that resizes one of them when dragged. `vertical`: a bar between columns
// (dragged sideways), else between rows (dragged up and down). The pane's size is the caller's (a signal): `size` reads it at the press,
// `onResize` gets the new one, kept within [min, max]; `after` when the pane is after the bar (dragging toward it shrinks it).
//
//   <ResizeHandle vertical size={sideW} onResize={setSideW} min={160} max={480} />
export interface ResizeHandleProps {
  size: () => number;
  onResize: (px: number) => void;
  vertical?: boolean;
  after?: boolean;
  min?: number;
  max?: number;
  className?: string;
}

export function ResizeHandle(props: ResizeHandleProps): i32 {
  const lo = props.min ?? 0, hi = props.max ?? 100000, sign = (props.after ?? false) ? -1 : 1;
  let start: number = 0;
  const drag = (e: ui.PointerEvent, d: number): void => {
    if (e.phase === 0) start = props.size();
    props.onResize(Math.max(lo, Math.min(hi, Math.round(start + sign * d))));
  };
  const look = `shrink-0 bg-${theme().border} hover:bg-${theme().accent} ${props.className ?? ''}`;
  if (props.vertical ?? false)
    return <View className={`w-1 self-stretch cursor-col-resize ${look}`} role="separator" aria-orientation="vertical" dragAxis="x" dragThreshold={1}
      onDrag={(e: ui.PointerEvent) => { drag(e, e.dx); }} />;
  return <View className={`h-1 self-stretch cursor-row-resize ${look}`} role="separator" aria-orientation="horizontal" dragAxis="y" dragThreshold={1}
    onDrag={(e: ui.PointerEvent) => { drag(e, e.dy); }} />;
}
