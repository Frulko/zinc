// The XY pad (a Canvas drawn with zinc:gfx, dragged with pointer events) and the colour swatches.
// The pad sends /zinc/xy x y (0..1, y up) while dragging; Chataigne can move the puck back the same way.
import { rect, rrect, border } from 'zinc:gfx';
import * as ui from 'zinc:ui';
import { Card, CardHeader, CardContent, smallText, captionText, theme } from 'zinc:ui/kit';
import { padX, padY, color, hex } from '../state';
import { sendXY, sendColor } from '../link';

let padW: number = 1, padH: number = 1;   // last drawn size, to turn pointer positions into 0..1
let dragging = false;

function drawPad(x: i32, y: i32, w: i32, h: i32): void {
  padW = w; padH = h;
  rrect(x, y, w, h, 8, 0xfafafa, 255);
  for (let i = 1; i < 4; i++) {
    rect(x + Math.round(w * i / 4), y, 1, h, 0xe4e4e7);
    rect(x, y + Math.round(h * i / 4), w, 1, 0xe4e4e7);
  }
  const px = x + padX() * w, py = y + (1 - padY()) * h;
  rect(px, y, 1, h, 0xa5b4fc);
  rect(x, py, w, 1, 0xa5b4fc);
  rrect(px - 14, py - 14, 28, 28, 14, color(), 60);    // halo
  rrect(px - 9, py - 9, 18, 18, 9, color(), 255);
  border(px - 9, py - 9, 18, 18, 9, 2, 0xffffff, 255);
  border(x, y, w, h, 8, 1, 0xe4e4e7, 255);
}

function moveTo(e: ui.PointerEvent): void {
  sendXY(Math.max(0, Math.min(1, e.x / padW)), Math.max(0, Math.min(1, 1 - e.y / padH)));
}

export function PadCard(): i32 {
  return <Card class="grow">
    <CardHeader title="XY pad" description="Drag to send /zinc/xy x y." />
    <CardContent class="grow">
      <Canvas class="w-full h-[190px] cursor-crosshair" onDraw={drawPad}
        onPointerDown={(e: ui.PointerEvent) => { dragging = true; moveTo(e); }}
        onPointerMove={(e: ui.PointerEvent) => { if (dragging) moveTo(e); }}
        onPointerUp={(e: ui.PointerEvent) => { dragging = false; }} />
      <Text class={captionText()}>{`x ${padX().toFixed(2)} · y ${padY().toFixed(2)}`}</Text>
    </CardContent>
  </Card>;
}

const SWATCHES: u32[] = [0xef4444, 0xf97316, 0xfacc15, 0x22c55e, 0x06b6d4, 0x6366f1, 0xd946ef, 0xffffff];

export function ColorCard(): i32 {
  return <Card class="w-[240px]">
    <CardHeader title="Colour" description="/zinc/color r g b, 0..1 each." />
    <CardContent>
      <View class="flex-row flex-wrap gap-2">
        {SWATCHES.map((c: u32) =>
          <View class={`w-8 h-8 rounded-md border-2 ${color() === c ? `border-${theme().foreground}` : `border-${theme().border}`}`}
            bg={c} onClick={() => sendColor(c)} />)}
      </View>
      <View class="flex-row items-center gap-3">
        <View class={`w-12 h-12 rounded-lg border border-${theme().border}`} bg={color()} />
        <View class="flex-col gap-0.5">
          <Text class={smallText()}>{hex(color())}</Text>
          <Text class={captionText()}>{`r ${(color() >> 16) & 255} g ${(color() >> 8) & 255} b ${color() & 255}`}</Text>
        </View>
      </View>
    </CardContent>
  </Card>;
}
