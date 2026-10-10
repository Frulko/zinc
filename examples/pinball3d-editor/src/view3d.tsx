// The table in 3D beside the top view, and the game played in it. The picture is the game's own scene (play.ts builds it from the
// document), seen as the table's landscape layout looks at it; it follows every edit. A ball is dropped on the top view (the drop
// tool), or a game is started as a player starts one; the game then runs here with the table's physics, rules and sounds, and can be
// paused and stepped a frame at a time. The same game can be shown in a window of its own, drawn there as the game itself draws
// it: the table and its score panel.
import { createEffect, For, Show, renderWindow } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { rect, closeWindow, windowOpen } from 'zinc:gfx';
import { Camera } from 'zinc:3d';
import { Phase } from '../../pinball3d/src/game';
import { View } from '../../pinball3d/src/view';
import { drawPanel, grouped } from '../../pinball3d/src/panel';
import { rgb } from './shapes';
import { doc, table, advanced } from './state';
import { view3d, setView3d, playing, paused, dropping, setDropping, moved, sceneNow, gameNow, gameIfAny, aim, play, pause, stop, stepFrame, events, setWindowControls } from './play';
import { Tool, Segmented } from './widgets';
import * as L from './strings';
import { t, f } from './strings';

/** The box of the 3D view in the window, as it was last drawn: where a touch plays the game, as on the game's own view. */
export let boxX: number = 0, boxY: number = 0, boxW: number = 0, boxH: number = 0;
/** Why the table cannot be shown in 3D ('' when it can): a model file that is not in its folder, for one. */
function problem(): string { doc(); try { sceneNow(); return ''; } catch (e) { return `${(e as Error).message}`; } }

function draw(x: i32, y: i32, w: i32, h: i32): void {
  boxX = x; boxY = y; boxW = w; boxH = h;
  try {
    // a box taller than wide is looked at as the table's portrait layout looks at the table
    const s = sceneNow(), layouts = table().layouts;
    aim(s.camera, h > w ? layouts.portrait : layouts.landscape, w, h);
    s.render(x, y, w, h);
  } catch (e) { rect(x, y, w, h, 0x09090b); }
}
/** The score of the game being played and what it asks for next, in a line. */
function score(): string {
  moved();
  const g = gameIfAny();
  if (g === null || g.phase !== Phase.Play) return '';
  const step = g.rules.currentStep();
  return `${grouped(g.rules.score)}   ·   ${f(L.BALL_N, `${g.rules.ball}`)}${step === null ? '' : `   ·   ${step.text}`}`;
}
/** The last lines of the game's log. */
function lastEvents(): string[] { moved(); return events.slice(Math.max(0, events.length - 7)); }
/** The switch between the two things the pane beside the top view can show. */
export function PaneSwitch(): i32 {
  return <view class="w-[112]"><Segmented options={['heights', '3d']} labels={[t(L.PROFILE), '3D']} value={() => view3d() ? '3d' : 'heights'} onPick={(v: string) => setView3d(v === '3d')} /></view>;
}
const never = (): boolean => false;
function key(k: string): () => string { return (): string => advanced() ? k : ''; }

export function Pane3D(): i32 {
  // the picture is drawn by hand: ask for it again when the table or the game moved
  createEffect(() => { doc(); moved(); playing(); paused(); ui.repaint(); });
  return <view class="grow basis-0 min-w-0 flex-col bg-zinc-950 border-l border-zinc-800">
    <view class="flex-row items-center gap-1 h-9 px-2 shrink-0 bg-zinc-900 border-b border-zinc-800">
      <PaneSwitch />
      <view class="grow" />
      <Show when={!playing() || paused()}><Tool icon="play" label="" look="primary" keys={key('P')} off={never} onClick={play} /></Show>
      <Show when={playing() && !paused()}><Tool icon="pause" label="" look="plain" keys={key('P')} off={never} onClick={pause} /></Show>
      <Tool icon="step-forward" label="" look="quiet" keys={key('O')} off={() => !playing() || !paused()} onClick={stepFrame} />
      <Tool icon="square" label="" look="quiet" keys={key('Esc')} off={() => !playing()} onClick={stop} />
      <Show when={!dropping()}><Tool icon="circle-arrow-down" label="" look="quiet" keys={key('B')} off={never} onClick={() => setDropping(true)} /></Show>
      <Show when={dropping()}><Tool icon="circle-arrow-down" label="" look="primary" keys={key('B')} off={never} onClick={() => setDropping(false)} /></Show>
      <Tool icon="app-window" label="" look="quiet" keys={key('W')} off={never} onClick={toggleWindow} />
    </view>
    <view class="grow basis-0 min-h-0 relative overflow-hidden">
      <canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={draw} />
      <Show when={score() !== ''}>
        <view class="absolute left-[10] top-[10] right-[10] flex-row px-2 py-1 rounded bg-zinc-900 border border-zinc-700"><text class="grow basis-0 text-xs font-bold text-amber-300">{score()}</text></view>
      </Show>
      <Show when={problem() !== ''}>
        <view class="absolute left-[10] right-[10] top-[10] flex-row px-3 py-2 rounded-md bg-zinc-900 border border-red-900"><text class="grow basis-0 text-xs text-red-300">{f(L.NO_3D, problem())}</text></view>
      </Show>
      <Show when={!playing()}>
        <view class="absolute left-[10] right-[10] bottom-[10] flex-row px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700">
          <text class="grow basis-0 text-[11px] text-zinc-400">{dropping() ? t(L.DROP_HOW) : t(L.PLAY_HOW)}</text>
        </view>
      </Show>
      <Show when={playing() && lastEvents().length > 0}>
        <view class="absolute left-[10] right-[10] bottom-[10] flex-col px-2 py-1 rounded bg-zinc-900 border border-zinc-700">
          <For each={lastEvents()}>{(line: string, i: i32) => <text class="truncate font-mono text-[10px] text-zinc-300" style={{ maxWidth: 320 }}>{line}</text>}</For>
        </view>
      </Show>
    </view>
  </view>;
}

// ---------------------------------------------------------------- the game in a window of its own

let win: i32 = -1;
const eye = new Camera();
/** The window as the game itself draws one: the layout that fits its shape, the table and the score panel. */
function PlayWindow(): i32 {
  return <view class="relative w-full h-full">
    <canvas class="absolute inset-0" onDraw={(x: i32, y: i32, w: i32, h: i32) => {
      const tb = table();
      rect(x, y, w, h, rgb(tb.lighting.background));
      try {
        const g = gameNow(), s = sceneNow(), v = new View(tb, w, h, ''), l = v.layout;
        aim(eye, l, v.w(l.view), v.h(l.view));
        eye.render(s.scene, x + v.x(l.view), y + v.y(l.view), v.w(l.view), v.h(l.view));
        drawPanel(v, g, t(L.KEYS_OF_GAME));
        // the keys pressed in this window play the game too
        setWindowControls(x + v.x(l.view), y + v.y(l.view), v.w(l.view), v.h(l.view));
      } catch (e) { }   // the pane beside the top view says why
    }} />
  </view>;
}
/** Opens the window of the game, or closes it. */
export function toggleWindow(): void {
  if (win >= 0 && windowOpen(win)) { closeWindow(win); win = -1; eye.dispose(); return; }
  const size = table().layouts.landscape.window;
  win = renderWindow(`${doc().get('name')}`, Math.round(size[0] / 2), Math.round(size[1] / 2), PlayWindow, 0x000000);
}
