// Visual regression for layers: a dropdown menu declared inside a small clipping card opens above the page and
// outside the clip, with a tooltip and its shortcut hint (frame 12); then a modal dialog over a dimmed page (frame 24).
// zinc-test: frames 12,24
import { createSignal, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Button, Tooltip, DropdownMenu, Dialog } from 'zinc:ui/kit';

const [open, setOpen] = createSignal<boolean>(false);
ui.bindKeys('mod-s', 'save');
ui.bindKeys('mod-d', 'duplicate');

function App(): i32 {
  return <View class="flex-col p-3 gap-2">
    <View class="flex-row gap-2 p-2 h-[52px] overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <Tooltip label="Save" action="save" delay={0} placement="bottom"><Button label="Save" size="sm" /></Tooltip>
      <DropdownMenu label="Edit" class="w-40" items={[{ label: 'Save', action: 'save' }, { label: 'Duplicate', action: 'duplicate' }, { label: 'Delete', onSelect: () => setOpen(true) }]} />
    </View>
    <Dialog open={open} onOpenChange={setOpen} title="Delete?" description="It cannot be undone." class="w-[260px]"
      footer={() => <Button label="Cancel" variant="outline" size="sm" onClick={() => setOpen(false)} />} />
  </View>;
}

function center(label: string): number[] { const b = ui.screenBox(ui.find(label)); return [b[0] + b[2] / 2, b[1] + b[3] / 2]; }
let frame = 0;
render(App, 0xf4f4f5, (dt: number) => {
  frame++;
  if (frame === 4) { const e = center('Edit'); ui.pointerAt(e[0], e[1], true); ui.pointerAt(e[0], e[1], false); }
  if (frame === 5) { const s = center('Save'); ui.pointerAt(s[0], s[1], false); }   // hover: the tooltip
  if (frame === 16) { ui.pointerAt(1, 1, false); setOpen(true); }
});
