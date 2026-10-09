// The two toolbars. E-ink friendly: flat black and white, thick outlines, big touch targets, no transitions or
// shadows (they ghost on e-paper); the active tool is inverted.
import {
  ink, COLORS, COLOR_NAMES, WIDTHS, WIDTH_NAMES, tool, color, penWidth, page, pageCount, status,
  pickTool, pickColor, pickWidth, goToPage, savePage,
  fastDrawing, displayBusy, pickDisplay, onTablet,
} from '../notebook';

const OUTLINED = 'px-6 py-4 rounded-lg border-2 border-black bg-white focus:bg-white';
const INVERTED = 'px-6 py-4 rounded-lg bg-black focus:bg-black';

interface ToolButtonProps {
  label: string;
  active: () => boolean;
  onPress: () => void;
}

function ToolButton(props: ToolButtonProps): i32 {
  return <Button class={props.active() ? INVERTED : OUTLINED} onClick={props.onPress}>
    <Text class={props.active() ? 'text-[34px] text-white' : 'text-[34px] text-black'}>{props.label}</Text>
  </Button>;
}

/** A round colour swatch; the selected one gets a thick black ring. */
function Swatch(props: { color: i32; label: string }): i32 {
  return <View class="flex-col items-center gap-1"><Button
    class={color() === props.color ? 'w-[72px] h-[72px] rounded-full border-8 border-black' : 'w-[72px] h-[72px] rounded-full border-2 border-gray-300'}
    style={{ backgroundColor: props.color }}
    onClick={() => pickColor(props.color)} />
    <Text class="text-[20px] text-black">{props.label}</Text>
  </View>;
}

const never = (): boolean => false;

/** Pen / eraser, colours, stroke widths. */
export function DrawingBar(): i32 {
  return <View class="flex-row items-center gap-4 px-6 py-4">
    <ToolButton label="Pen" active={() => tool() === 'pen'} onPress={() => pickTool('pen')} />
    <ToolButton label="Eraser" active={() => tool() === 'eraser'} onPress={() => pickTool('eraser')} />
    {COLORS.map((c: i32, i: i32) => <Swatch color={c} label={COLOR_NAMES[i]} />)}
    {WIDTHS.map((w: number, i: i32) =>
      <ToolButton label={WIDTH_NAMES[i]} active={() => penWidth() === w} onPress={() => pickWidth(w)} />)}
  </View>;
}

/** Undo / clear, page navigation, save and the last status message. */
export function PageBar(): i32 {
  return <View class="flex-row flex-wrap items-center gap-4 px-6 py-3">
    <ToolButton label="Undo" active={never} onPress={() => ink.undo()} />
    <ToolButton label="Clear" active={never} onPress={() => ink.clear()} />
    <ToolButton label="<" active={never} onPress={() => goToPage(page() - 1)} />
    <Text class="text-[34px] text-black">page {page() + 1} / {pageCount()}</Text>
    <ToolButton label=">" active={never} onPress={() => goToPage(page() + 1)} />
    <ToolButton label="Save" active={never} onPress={() => { savePage(); }} />
    <Text class="text-[26px] text-gray-700">{status()}</Text>
  </View>;
}

/** Fast ink and colour preview are distinct user-selected modes; original stroke colours are always saved. */
export function DisplayBar(): i32 {
  return <View class="flex-row flex-wrap items-center gap-4 px-6 py-3">
    <ToolButton label="Fast drawing" active={fastDrawing} onPress={() => pickDisplay(true)} />
    <ToolButton label="Colour preview" active={() => !fastDrawing()} onPress={() => pickDisplay(false)} />
    <Text class="text-[26px] text-black">{!onTablet ? 'Desktop preview' : displayBusy() ? 'Switching display…' : fastDrawing() ? 'B&W screen · saved in colour' : 'Colour screen · slower drawing'}</Text>
  </View>;
}
