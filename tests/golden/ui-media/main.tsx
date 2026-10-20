// Media and container queries (ZN-272): pointer kind, orientation, max-*, @container, env(keyboard-inset), settled in at most 2 layout passes.
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-col w-full');
const probe = ui.createNode(ui.VIEW);
ui.setClass(probe, 'w-4 h-4 pointer-coarse:w-8 pointer-fine:h-8 landscape:gap-3 max-md:gap-5 min-[1000px]:gap-7 pb-[env(keyboard-inset)]');
const cont = ui.createNode(ui.VIEW);
ui.setClass(cont, '@container w-[300px]');
const inner = ui.createNode(ui.VIEW);
ui.setClass(inner, 'w-2 @md:w-12 @[200px]:h-9');
ui.insert(cont, inner, -1);
ui.insert(root, probe, -1);
ui.insert(root, cont, -1);
ui.setRoot(root);
ui.layout();
function show(tag: string): void {
  const a = ui.inspectNode(probe), b = ui.inspectNode(inner);
  if (a === null || b === null) return;
  console.log(tag, `probe w${a.w} h${a.h} gap${a.gap} pb${a.pb}`, `inner w${b.w} h${b.h}`, 'passes', ui.layoutPasses());
}
show('start');
ui.pointerAt(10, 10, false);
show('mouse');
ui.touchAt(1, 10, 10, 0); ui.touchAt(1, 10, 10, 2);
show('touch');
ui.pointerAt(20, 20, false);
show('mouse again');
ui.setKeyboardInset(120);
show('keyboard 120');
ui.setClass(cont, '@container w-[500px]');
ui.layout();
show('container 500');
ui.setClass(cont, '@container w-[100px]');
ui.layout();
show('container 100');
quit();
