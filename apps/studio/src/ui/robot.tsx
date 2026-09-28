// Robot view (right column, top): the live screen of the running app through zinc:remote, with input forwarding
// while the pointer is over it, play / stop and the link statistics.
import { Show } from 'zinc:ui/solid';
import { drawText, font, textWidth, rrect, border } from 'zinc:gfx';
import * as devices from '../devices';
import * as runner from '../runner';
import * as model from '../model';
import { IconButton, PanelHeader, HSep, C_GREEN, C_RED } from './kit';
import { openDialog } from './state';

let hintFont = -1;
function drawScreen(x: i32, y: i32, w: i32, h: i32): void {
  if (devices.drawPreview(x, y, w, h)) return;
  // placeholder: the target screen outline at the project's aspect ratio
  const s = model.screenSize(), k = Math.min((w - 32) / s[0], (h - 40) / s[1]);
  const sw = s[0] * k, sh = s[1] * k, sx = x + (w - sw) / 2, sy = y + (h - sh) / 2 - 6;
  rrect(sx, sy, sw, sh, 6, 0x27272a, 255);
  border(sx, sy, sw, sh, 6, 1, 0x3f3f46, 255);
  if (hintFont < 0) hintFont = font('sans', 12);
  const msg = runner.phase() === 'building' ? 'Building...' : `${s[0]} x ${s[1]}`;
  drawText(hintFont, sx + (sw - textWidth(hintFont, msg, 0)) / 2, sy + sh / 2 - 6, msg, 0xa1a1aa, 255, 0);
}
export function RobotView(): i32 {
  return <view class="flex-col h-[330] bg-white">
    <PanelHeader title="Robot view" icon="monitor">
      <view class="flex-row items-center gap-1">
        <Show when={devices.previewConnected()}>
          <view class="w-[8] h-[8] rounded-full bg-emerald-500 mr-1" />
        </Show>
        <IconButton icon="play" color={C_GREEN} onClick={() => { model.setTarget('preview'); runPreview(); }} disabled={() => runner.busy()} />
        <IconButton icon="stop" color={C_RED} onClick={() => { runner.stop(); devices.disconnectPreview(); }} disabled={() => !runner.busy() && !devices.previewConnected()} />
        <IconButton icon="plug" onClick={() => openDialog('devices')} />
      </view>
    </PanelHeader>
    <view class="grow m-2 rounded-lg bg-zinc-900 overflow-hidden">
      <canvas class="grow" onDraw={drawScreen} />
    </view>
    <view class="flex-row items-center gap-2 h-[26] px-3">
      <text class="text-[11] text-zinc-500">{devices.previewStatus()}</text>
      <view class="grow" />
      <text class="text-[11] font-mono text-emerald-600">{devices.previewStats()}</text>
    </view>
    <HSep />
  </view>;
}

let runHook: (() => void) | null = null;
/** app.tsx provides the run action (save, generate, build, run). */
export function setRunHook(f: () => void): void { runHook = f; }
function runPreview(): void { const f = runHook; if (f !== null) f(); }
