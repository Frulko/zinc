// zinc:ui/kit overlays in the Solid model (kit_overlays_react.tsx builds the same screen with hooks; the outputs must
// be identical): a tooltip with a shortcut hint, a dropdown menu driven by the keyboard (autofocus, arrows, Enter,
// Escape, focus restored), a press outside a popover, a dialog with its focus trap, a toast that goes away.
import { createSignal, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
import { Button, Tooltip, DropdownMenu, Popover, Dialog, toast } from 'zinc:ui/kit';

const [confirming, setConfirming] = createSignal<boolean>(false);
const log = (s: string): void => { console.log(s); };

function App(): i32 {
  return <View class="flex-col p-4 gap-3 h-full">
    <View class="flex-row gap-2">
      <Tooltip label="Save file" action="save" delay={50}><Button label="Save" onClick={() => log('save clicked')} /></Tooltip>
      <DropdownMenu label="Edit" items={[{ label: 'Undo', action: 'undo' }, { label: 'Copy', action: 'copy' }, { label: 'Paste', disabled: true }, { label: 'Delete', onSelect: () => setConfirming(true) }]} />
      <Popover label="Info"><Text class="text-sm">Zinc overlays</Text><Button label="Got it" size="sm" /></Popover>
    </View>
    <Button label="Notify" variant="secondary" onClick={() => toast('Saved', 'All changes are on disk.', 100)} />
    <Dialog open={confirming} onOpenChange={(v: boolean) => { log(`dialog open -> ${v}`); setConfirming(v); }} title="Delete file?" description="This cannot be undone."
      footer={() => <View class="flex-row gap-2"><Button label="Cancel" variant="outline" onClick={() => setConfirming(false)} /><Button label="Delete" variant="destructive" onClick={() => { log('deleted'); setConfirming(false); }} /></View>} />
  </View>;
}

/** Laid-out nodes with absolute positions, without fragments (their nesting differs between the models). */
function layout(): string {
  return ui.dump().split('\n').filter((l: string) => l.indexOf('fragment') < 0).map((l: string) => l.trim()).join('\n');
}
/** First text under a node (depth first). */
function textIn(h: i32): string {
  const n = ui.inspectNode(h);
  if (n === null) return '';
  if (n.text.length > 0) return n.text;
  for (const c of n.children) { const t = textIn(c); if (t.length > 0) return t; }
  return '';
}
function focusedText(): string { const h = ui.focused(); return h < 0 ? 'none' : textIn(h); }
/** The node that a press on a label would hit is that label's button (it is on screen and on top). */
function reachable(label: string): boolean { const p = center(label); return ui.hitAt(p[0], p[1]) === ui.find(label); }
function center(label: string): number[] { const b = ui.screenBox(ui.find(label)); return [b[0] + b[2] / 2, b[1] + b[3] / 2]; }
function clickAt(p: number[]): void { ui.pointerAt(p[0], p[1], true); ui.pointerAt(p[0], p[1], false); }

const steps: (() => void)[] = [];
let frame = 0;
ui.bindKeys('mod-s', 'save'); ui.bindKeys('mod-z', 'undo'); ui.bindKeys('mod-c', 'copy');
for (const a of ['undo', 'copy']) ui.onAction(-1, a, () => log(`action ${a}`));
render(App, 0xffffff, (dt: number) => {
  frame++;
  if (frame >= 2 && frame - 2 < steps.length) steps[frame - 2](); else if (frame >= 2) quit();
});
const wait = (n: i32): void => { for (let i = 0; i < n; i++) steps.push(() => {}); };
steps.push(() => {
  const p = center('Save');
  ui.pointerAt(p[0], p[1], false);   // hover
  log('-- tooltip after its delay, with the shortcut');
});
wait(6);
steps.push(() => {
  const b = ui.screenBox(ui.find('Save file'));
  log(`tooltip ${Math.round(b[0])},${Math.round(b[1])} hint ${ui.inspectNode(ui.find('⌘S')) !== null}`);
  ui.pointerAt(1, 300, false);   // leave
  log('-- dropdown: opens focused on its first item');
  clickAt(center('Edit'));
  log(`focused ${focusedText()}, menu reachable ${reachable('Undo')}`);
  ui.keyDown(-1, 'ArrowDown');
});
steps.push(() => { log(`focused ${focusedText()}`); ui.keyDown(-1, 'ArrowDown'); });
steps.push(() => { log(`focused ${focusedText()} (Paste is disabled)`); console.log(layout()); ui.keyDown(-1, 'ArrowUp'); });
steps.push(() => { log(`focused ${focusedText()}`); ui.keyDown(-1, 'Enter'); });
steps.push(() => {
  log(`focused ${focusedText()} after picking`);
  clickAt(center('Edit'));
  ui.keyDown(-1, 'Escape');
  log(`after Escape: focused ${focusedText()}, menu reachable ${reachable('Undo')}`);
  log('-- popover: a press outside closes it');
  clickAt(center('Info'));
  log(`focused ${focusedText()}`);
  clickAt([300, 220]);
  log(`focused ${focusedText()}`);
  log('-- dialog from the menu: trap, Escape');
  clickAt(center('Edit'));
  clickAt(center('Delete'));
});
steps.push(() => { log(`dialog focused ${focusedText()}`); ui.keyDown(-1, 'Tab'); });
steps.push(() => { log(`focused ${focusedText()}`); ui.keyDown(-1, 'Tab'); });
steps.push(() => {
  log(`focused ${focusedText()}`);
  const e = center('Edit');
  log(`under the backdrop: ${ui.hitAt(e[0], e[1])}`);
  ui.keyDown(-1, 'Escape');
});
steps.push(() => {
  log(`focused ${focusedText()}`);
  log('-- toast');
  clickAt(center('Notify'));
});
steps.push(() => { log(`toast shown ${ui.find('All changes are on disk.') >= 0}`); console.log(layout()); });
wait(10);
steps.push(() => { log(`toast gone ${ui.find('All changes are on disk.') < 0}`); });
