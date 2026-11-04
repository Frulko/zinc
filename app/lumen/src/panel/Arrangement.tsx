// The displays as tiles to drag. On release a tile snaps to the nearest edge of another one, since macOS needs displays to touch.
import * as ui from 'zinc:ui';
import * as gfx from 'zinc:gfx';
import * as M from 'zinc:monitors';
import { createSignal } from 'zinc:ui/solid';
import { TEXT_SMALL, palette } from '../theme';
import { displays, makeMain, moveDisplay } from '../state';

const CANVAS_HEIGHT = 150, CANVAS_PADDING = 12;
const PANEL_CHROME_WIDTH = 36;   // the panel's margins and those of its row

interface Fit { scale: number; left: number; top: number }

function fit(list: M.Display[], canvasWidth: number): Fit {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const d of list) {
    minX = Math.min(minX, d.x); minY = Math.min(minY, d.y);
    maxX = Math.max(maxX, d.x + d.width); maxY = Math.max(maxY, d.y + d.height);
  }
  const scale = Math.min((canvasWidth - 2 * CANVAS_PADDING) / Math.max(1, maxX - minX), (CANVAS_HEIGHT - 2 * CANVAS_PADDING) / Math.max(1, maxY - minY));
  return { scale: scale, left: CANVAS_PADDING - minX * scale, top: CANVAS_PADDING - minY * scale };
}

/** Where (x, y) lands once it touches `others`: the closest of the four sides of each other display. */
export function snapToNeighbours(d: M.Display, x: number, y: number, others: M.Display[]): number[] {
  let bestX = x, bestY = y, bestDistance = 1e18;
  for (const o of others) {
    const clampedY = Math.max(o.y - d.height, Math.min(o.y + o.height, y));
    const clampedX = Math.max(o.x - d.width, Math.min(o.x + o.width, x));
    const candidates = [[o.x - d.width, clampedY], [o.x + o.width, clampedY], [clampedX, o.y - d.height], [clampedX, o.y + o.height]];
    for (const c of candidates) {
      const distance = (c[0] - x) * (c[0] - x) + (c[1] - y) * (c[1] - y);
      if (distance < bestDistance) { bestDistance = distance; bestX = c[0]; bestY = c[1]; }
    }
  }
  return [bestX, bestY];
}

function Tile(props: { display: M.Display; view: () => Fit }): i32 {
  const d = props.display;
  const [dragX, setDragX] = createSignal<number>(0);
  const [dragY, setDragY] = createSignal<number>(0);
  let startX = 0, startY = 0, held = false;
  const release = (): void => {
    if (!held) return;
    held = false;
    const scale = props.view().scale;
    const others = displays().filter((o: M.Display) => o.id !== d.id && o.connected && o.mirrorOf === 0);
    if ((dragX() !== 0 || dragY() !== 0) && others.length > 0) {
      const target = snapToNeighbours(d, d.x + dragX() / scale, d.y + dragY() / scale, others);
      moveDisplay(d.id, target[0], target[1]);
    }
    setDragX(0);
    setDragY(0);
  };
  return <View style={{ left: d.x * props.view().scale + props.view().left + dragX(), top: d.y * props.view().scale + props.view().top + dragY(), width: d.width * props.view().scale, height: d.height * props.view().scale }}
    className={`absolute rounded-[4px] items-center justify-center cursor-pointer ${d.main ? palette().tileMain : palette().tile}`}
    onPointerDown={(e: ui.PointerEvent) => { held = true; startX = e.gx; startY = e.gy; }}
    onPointerMove={(e: ui.PointerEvent) => { if (held) { setDragX(e.gx - startX); setDragY(e.gy - startY); } }}
    onPointerUp={(e: ui.PointerEvent) => release()}
    onPointerCancel={(e: ui.PointerEvent) => { held = false; setDragX(0); setDragY(0); }}
    onDoubleClick={(e: ui.PointerEvent) => makeMain(d.id)}>
    <Text className={`${TEXT_SMALL} font-medium px-1 truncate ${palette().label}`}>{d.name}</Text>
  </View>;
}

export function Arrangement(): i32 {
  const shown = (): M.Display[] => displays().filter((d: M.Display) => d.connected && d.mirrorOf === 0);
  const view = (): Fit => fit(shown(), gfx.width() - PANEL_CHROME_WIDTH);
  return <View className="gap-2">
    <View className={`relative h-[${CANVAS_HEIGHT}px] overflow-hidden`}>
      <For each={shown()}>{(d: M.Display) => <Tile display={d} view={view} />}</For>
    </View>
    <Text className={`${TEXT_SMALL} ${palette().secondary}`}>Drag to move. Double-click for the main display.</Text>
  </View>;
}
