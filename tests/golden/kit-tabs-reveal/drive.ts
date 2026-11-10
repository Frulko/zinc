import * as ui from 'zinc:ui';
function find(h: i32, label: string): i32 {
  const n = ui.inspectNode(h); if (n === null || n.hidden) return -1;
  if (n.label === label) return h;
  for (const c of n.children) { const found = find(c, label); if (found >= 0) return found; }
  return -1;
}
function control(label: string): i32 {
  const h = find(ui.rootNode(), label); if (h < 0) throw new Error('missing ' + label); return h;
}
function tab(track: string, label: string): i32 { return find(control(track), label); }
function expect(ok: boolean, message: string): void { if (!ok) throw new Error(message); }
function contained(track: string, label: string): void {
  const box = ui.screenBox(tab(track, label)), viewport = ui.screenBox(control(track));
  expect(box[0] - 2 >= viewport[0] - 0.5 && box[0] + box[2] + 2 <= viewport[0] + viewport[2] + 0.5, track + ' clipped label/focus: ' + JSON.stringify(box) + ' in ' + JSON.stringify(viewport));
}
/** Both models run the same selection, nested-scroll and remount contract. */
export function drive(frame: i32, value: () => i32, rich: () => string, select: (i: i32) => void, selectRich: (id: string) => void, show: (visible: boolean) => void): void {
  // React commits state at the frame boundary; allow its layout watcher the following frame.
  if (frame % 2 !== 0) return;
  frame = (frame / 2) as i32;
  if (frame === 2) {
    ui.systemSignal('reducemotion 1'); ui.scrollTo(control('Outer'), 0, 60);
    ui.keyDown(tab('Basic', 'Profile'), 'End'); ui.keyDown(tab('Rich', 'Profile'), 'End');
  }
  if (frame === 3 || frame === 7 || frame === 30 || frame === 33) {
    expect(value() === 3 && rich() === '3', 'controlled selection'); contained('Basic', 'Account'); contained('Rich', 'Account');
    expect(ui.scrollTop(control('Outer')) === 60, 'nested scroll changed');
  }
  if (frame === 3) {
    expect(ui.focused() === tab('Rich', 'Account'), 'End focus');
    ui.keyDown(tab('Basic', 'Account'), 'ArrowRight'); ui.keyDown(tab('Rich', 'Account'), 'ArrowRight');
  }
  if (frame === 4 || frame === 6 || frame === 34) {
    expect(value() === 0 && rich() === '0', 'wrap/Home/pointer selection'); contained('Basic', 'Profile'); contained('Rich', 'Profile');
  }
  if (frame === 4) {
    ui.keyDown(tab('Basic', 'Profile'), 'ArrowRight'); ui.keyDown(tab('Rich', 'Profile'), 'ArrowRight');
  }
  if (frame === 5) {
    expect(value() === 2 && rich() === '2', 'disabled tab not skipped');
    ui.keyDown(tab('Basic', 'Appearance'), 'Home'); ui.keyDown(tab('Rich', 'Appearance'), 'Home');
  }
  if (frame === 6) { select(3); selectRich('3'); }
  if (frame === 7) { ui.click(tab('Basic', 'Profile')); ui.click(tab('Rich', 'Profile')); }
  if (frame === 8) {
    expect(value() === 0 && rich() === '0', 'pointer selection');
    ui.systemSignal('reducemotion 0'); select(3); selectRich('3');
  }
  if (frame === 30) show(false);
  if (frame === 31) { expect(find(ui.rootNode(), 'Basic') < 0 && find(ui.rootNode(), 'Rich') < 0, 'unmount'); ui.systemSignal('reducemotion 1'); show(true); }
  if (frame === 33) { ui.keyDown(tab('Basic', 'Account'), 'Home'); ui.keyDown(tab('Rich', 'Account'), 'Home'); }
  if (frame === 34) console.log('tabs reveal: ok');
}
