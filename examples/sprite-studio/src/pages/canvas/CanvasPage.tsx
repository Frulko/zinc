// The canvas window: the zoomed sprite with its grid and onion skin, the frame bar, the file and window buttons.
import * as ui from 'zinc:ui';
import { rect } from 'zinc:gfx';
import { Chip } from '../../components/Chip';
import { drawChecker, drawPixels } from '../../components/pixels';
import { currentSprite, currentFrame, selectedColor, frameIndex, frameCount, onion, tool, notice, pressPixel, dragPixel, releasePixel,
  selectFrame, addFrame, duplicateFrame, deleteFrame, toggleOnion, undo, redo, canUndo, canRedo } from '../../state';
import { SPRITE_SIZE, ZOOM, COLOR_GRID, COLOR_ONION } from '../../constants';

export interface CanvasActions { save: () => void; load: () => void; showTools: () => void; showPreview: () => void }

const SIDE: i32 = SPRITE_SIZE * ZOOM;

function drawGrid(x: i32, y: i32): void {   // a lazy canvas: main.tsx repaints it after each change
  const s = currentSprite(), f = frameIndex();
  drawChecker(x, y, SIDE, ZOOM * 2);
  if (onion() && f > 0) drawPixels(s, s.frames[f - 1], x, y, ZOOM, 90, COLOR_ONION);
  drawPixels(s, currentFrame(), x, y, ZOOM, 255, 0);
  for (let i: i32 = 0; i <= SPRITE_SIZE; i++) {
    const c = i % 8 === 0 ? 0x4a5060 : COLOR_GRID;
    rect(x + i * ZOOM, y, 1, SIDE, c);
    rect(x, y + i * ZOOM, SIDE, 1, c);
  }
}

function cell(v: number): i32 { return Math.floor(v / ZOOM) as i32; }

export function CanvasPage(p: CanvasActions): i32 {
  let down = false;
  return <View className="flex-col w-full h-full items-center">
    <View className="flex-row w-full h-[44] shrink-0 items-center px-3 gap-2 bg-[#262a33]">
      <Text className="text-[15px] font-semibold text-white grow">Sprite Studio</Text>
      <Chip label="Undo" active={() => false} onPress={undo} />
      <Chip label="Redo" active={() => false} onPress={redo} />
      <Chip label="Save" active={() => false} onPress={p.save} />
      <Chip label="Load" active={() => false} onPress={p.load} />
      <Chip label="Tools" active={() => false} onPress={p.showTools} />
      <Chip label="Preview" active={() => false} onPress={p.showPreview} />
    </View>
    <View className="h-[14] shrink-0" />
    <Canvas className={`w-[${SIDE}] h-[${SIDE}] shrink-0`} style={{ lazy: 1 }} aria-label="Sprite canvas"
      onDraw={(x: i32, y: i32, w: i32, h: i32) => drawGrid(x, y)}
      onPointerDown={(e: ui.PointerEvent) => { down = true; pressPixel(cell(e.x), cell(e.y)); }}
      onPointerMove={(e: ui.PointerEvent) => { if (down) dragPixel(cell(e.x), cell(e.y)); }}
      onPointerUp={(e: ui.PointerEvent) => { down = false; releasePixel(); }} />
    <View className="flex-row w-[448] h-[32] mt-3 shrink-0 items-center gap-2">
      <Chip label="<" active={() => false} onPress={() => selectFrame(frameIndex() - 1)} />
      <Text className="text-[13px] text-[#c9d1dc] w-[96] text-center">{`Frame ${frameIndex() + 1}/${frameCount()}`}</Text>
      <Chip label=">" active={() => false} onPress={() => selectFrame(frameIndex() + 1)} />
      <Chip label="Add" active={() => false} onPress={addFrame} />
      <Chip label="Copy" active={() => false} onPress={duplicateFrame} />
      <Chip label="Delete" active={() => false} onPress={deleteFrame} />
      <Chip label="Onion" active={() => onion()} onPress={toggleOnion} />
    </View>
    <View className="flex-row w-[448] h-[24] mt-2 shrink-0 items-center gap-2">
      <View className="w-[14] h-[14] rounded-[3] border border-[#5a6070]" style={{ backgroundColor: selectedColor() }} />
      <Text className="text-[12px] text-[#8b93a3] grow" numberOfLines={1}>
        {`${tool()} · ${canUndo() ? 'undo ready' : 'nothing to undo'}${canRedo() ? ' · redo ready' : ''}${notice() !== '' ? ' · ' + notice() : ''}`}
      </Text>
    </View>
  </View>;
}
