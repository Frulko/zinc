import * as ui from 'zinc:ui';
import { render, createSignal, createNodeRef } from 'zinc:ui/solid';
import { Tooltip, HoverCard, Popover, Dialog, Sheet, ConfirmPopover, GuidedTour, Button as KitButton, toast, clearToasts, useQuietTheme } from 'zinc:ui/kit';
useQuietTheme();
const root = createNodeRef(), target = createNodeRef();
const [dialog, setDialog] = createSignal(false), [persistent, setPersistent] = createSignal(false), [sheet, setSheet] = createSignal(false), [tour, setTour] = createSignal(false), [step, setStep] = createSignal<i32>(0);
let confirmed: i32 = 0, targetHits: i32 = 0, frame: i32 = 0;
function App(): i32 {
  return <View ref={root} className="flex-col gap-3 p-4">
    <View ref={target}><KitButton label="Invoker" onClick={() => targetHits++} /></View>
    <Tooltip label="Hint" delay={100}><Button aria-describedby="existing-description" onClick={() => {}}>Hint target</Button></Tooltip>
    <Tooltip label="Neighbor hint" delay={100}><KitButton label="Neighbor target" /></Tooltip>
    <Popover label="Filters" width={220} padding={12} gap={8}><KitButton label="Panel action" /></Popover>
    <HoverCard label="Owner" delay={100} grace={100} trigger={() => <Text>Ada</Text>}><KitButton label="Profile" /></HoverCard>
    <ConfirmPopover label="Archive" title="Archive project?" onConfirm={() => confirmed++} />
    <Dialog open={dialog} onOpenChange={setDialog} persistent={persistent()} title="Project dialog" description="Description"><KitButton label="Dialog action" /></Dialog>
    <Sheet open={sheet} onOpenChange={setSheet} title="Activity"><KitButton label="Sheet action" /></Sheet>
    <GuidedTour open={tour} onOpenChange={setTour} step={step} onStepChange={setStep} steps={[{ title: 'First step', body: 'Interactive target', target: () => target.node }, { title: 'Final step', body: 'Targetless step', blockTarget: true }]} />
  </View>;
}
function find(h: i32, text: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.tag === ui.TEXT && n.text === text) { let p = n.parent; while (p >= 0) { const a = ui.inspectNode(p); if (a === null) break; if (a.tag === ui.BUTTON) return p; p = a.parent; } return h; }
  for (const c of n.children) { const r = find(c, text); if (r >= 0) return r; }
  return -1;
}
function role(h: i32, name: string): i32 {
  const n = ui.inspectNode(h); if (n === null || n.hidden) return -1;
  if (n.role === name) return h;
  for (const c of n.children) { const r = role(c, name); if (r >= 0) return r; } return -1;
}
function floating(text: string): i32 {
  const layers = ui.domLayers();
  for (let i = 0; i < layers.length; i += 4) { const h = find(layers[i], text); if (h >= 0) return h; }
  return -1;
}
function point(text: string): void { const h = find(root.node, text); if (h < 0) throw new Error('missing target: ' + text); const b = ui.screenBox(h); ui.pointerAt(b[0] + b[2] / 2, b[1] + b[3] / 2, false); }
function press(text: string): void { ui.click(find(root.node, text)); }
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  if (frame === 2) {
    ui.systemSignal('reducemotion 1');
    ui.keyDown(find(root.node, 'Hint target'), 'Shift'); ui.keyUp('Shift');
    const trigger = ui.inspectNode(find(root.node, 'Hint target'));
    if (trigger === null || !trigger.attrV[trigger.attrK.indexOf('aria-describedby')].startsWith('existing-description kit-tip-')) throw new Error('tooltip replaced existing description');
    const tip = role(root.node, 'tooltip'), node = ui.inspectNode(tip);
    if (node === null || node.hidden || ui.focused() !== find(root.node, 'Hint target')) throw new Error('tooltip stole focus or failed to show');
    ui.keyDown(-1, 'Escape');
    const hidden = ui.inspectNode(tip); if (hidden === null || !hidden.hidden) throw new Error('Escape did not dismiss tooltip');
    ui.focusNode(-1); ui.pointerAt(0, 0, false); ui.tick(600); point('Hint target'); ui.tick(80);
    if (role(root.node, 'tooltip') >= 0) throw new Error('tooltip skipped first dwell');
    ui.tick(30); if (role(root.node, 'tooltip') < 0) throw new Error('tooltip dwell failed');
    point('Neighbor target'); ui.tick(1); if (role(root.node, 'tooltip') < 0) throw new Error('neighbor repeated dwell');
    ui.pointerAt(0, 0, false);
    point('Ada'); ui.tick(110); if (role(root.node, 'region') < 0) throw new Error('hover card dwell');
    ui.pointerAt(0, 0, false); ui.tick(50); point('Profile'); ui.tick(60);
    if (role(root.node, 'region') < 0) throw new Error('hover grace did not bridge gap');
    ui.pointerAt(0, 0, false); ui.tick(110);
    if (role(root.node, 'region') >= 0) throw new Error('hover card did not close');
    press('Archive'); if (ui.focused() !== find(root.node, 'Confirm')) throw new Error('confirmation did not focus confirm'); ui.keyDown(-1, 'Enter');
  }
  if (frame === 3) {
    ui.keyUp('Enter');
    if (confirmed !== 1) throw new Error('confirmation Enter failed');
    ui.focusNode(find(root.node, 'Invoker')); setDialog(true);
  }
  if (frame === 4) {
    ui.focused(); if (!ui.hasFocusWithin(role(root.node, 'dialog'))) throw new Error('dialog did not take focus');
    ui.keyDown(-1, 'Escape');
    if (dialog()) throw new Error('dialog Escape');
    ui.focused(); if (ui.focused() !== find(root.node, 'Invoker')) throw new Error('dialog focus restore');
    setPersistent(true); setDialog(true);
  }
  if (frame === 5) { ui.focused(); ui.keyDown(-1, 'Escape'); if (!dialog()) throw new Error('persistent dialog closed'); setDialog(false); setSheet(true); }
  if (frame === 6) { ui.focused(); ui.keyDown(-1, 'Escape'); if (sheet()) throw new Error('sheet Escape'); setTour(true); }
  if (frame === 7) {
    ui.focused();
    const box = ui.screenBox(target.node);
    ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, true); ui.pointerAt(box[0] + box[2] / 2, box[1] + box[3] / 2, false);
    if (targetHits !== 1) throw new Error('tour target was blocked');
    const blocked = ui.inspectHit(950, 780);
    if (blocked < 0 || blocked === root.node) throw new Error('tour shade failed to swallow outside input');
    ui.focusNode(find(root.node, 'Next')); ui.keyDown(-1, 'ArrowRight'); if (step() !== 1) throw new Error('tour next'); }
  if (frame === 8) { ui.focused(); ui.keyDown(-1, 'ArrowLeft'); if (step() !== 0) throw new Error('tour back'); }
  if (frame === 9) {
    ui.focused();
    ui.destroy(target.node);
    const replacement = ui.createNode(ui.BUTTON); ui.setClass(replacement, 'absolute left-0 top-0 w-8 h-8'); ui.insert(root.node, replacement, -1);
    ui.tick(1);
    const panel = ui.screenBox(role(root.node, 'dialog'));
    if (Math.abs(panel[0] + panel[2] / 2 - 480) > 1 || Math.abs(panel[1] + panel[3] / 2 - 400) > 1) throw new Error('tour followed stale target');
    ui.keyDown(-1, 'Escape'); if (tour()) throw new Error('tour Escape'); const before = ui.focused();
    toast('Saved', 'Description', 100); toast('Important', '', -1, { tone: 'warning' });
    if (ui.focused() !== before) throw new Error('toast stole focus');
    const important = floating('! Important'); if (important < 0) throw new Error('missing toast'); const b = ui.screenBox(important); ui.pointerAt(b[0] + 2, b[1] + 2, false); ui.tick(120);
    if (floating('Saved') < 0) throw new Error('toast did not pause');
    ui.domFocus(floating('Dismiss'), true); ui.pointerAt(0, 0, false); ui.tick(120);
    if (floating('Saved') < 0) throw new Error('focus did not keep toast paused after pointer left');
    toast('Arrived while paused', '', 50); ui.tick(100);
    if (floating('Arrived while paused') < 0) throw new Error('new toast ignored paused stack');
    ui.focusNode(-1); ui.tick(120);
    if (floating('Saved') >= 0 || floating('! Important') < 0) throw new Error('toast expiry/persistence');
    toast('Archived', '', -1, { action: 'Undo', onAction: () => confirmed++ });
    ui.click(floating('Undo'));
    if (confirmed !== 2 || floating('Archived') >= 0) throw new Error('toast action');
    toast('Draggable', '', -1);
    let dragRoot = floating('Draggable');
    while (dragRoot >= 0) { const n = ui.inspectNode(dragRoot); if (n !== null && n.role === 'status') break; dragRoot = ui.parentOf(dragRoot); }
    const drag = ui.screenBox(dragRoot);
    ui.pointerAt(drag[0] + 4, drag[1] + 4, true); ui.pointerAt(drag[0] + 120, drag[1] + 4, true); ui.pointerAt(drag[0] + 120, drag[1] + 4, false);
    if (floating('Draggable') >= 0) throw new Error('toast drag did not dismiss');
    clearToasts(); if (floating('! Important') >= 0) throw new Error('toast cleanup');
    console.log('overlays: ok'); }
});
