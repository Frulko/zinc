import { render, renderWindow, createSignal, createEffect, onCleanup, batch, createSubtree } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { equal } from 'zinc:assert';

const [value, setValue] = createSignal(0);
let cleaned = 0, effects = 0, effectCleaned = 0, afterThrow = 0, failedRender = 0;
function Probe(): i32 {
  onCleanup(() => { cleaned++; ui.destroy(ui.rootNode()); });
  createEffect(() => { value(); effects++; onCleanup(() => { effectCleaned++; }); });
  return <Text>owned app</Text>;
}
function Broken(): i32 {
  onCleanup(() => { failedRender++; });
  throw new Error('render failed');
}
function ThrowingCleanup(): i32 {
  onCleanup(() => { throw new Error('cleanup failed'); });
  onCleanup(() => { afterThrow++; });
  createEffect(() => { value(); onCleanup(() => { throw new Error('child cleanup failed'); }); });
  return <View />;
}
const [sibling, setSibling] = createSignal(0);
let siblingRuns = 0;
function EarlyCleanup(): i32 { onCleanup(() => { setSibling(1); }); return <View />; }
function LateCleanup(): i32 { createEffect(() => { sibling(); siblingRuns++; }); return <View />; }
function checkLifecycle(): void {
  const first = ui.rootNode();
  batch(() => { setValue(1); ui.destroy(first); });
  ui.destroy(first);
  equal(cleaned, 1, 'root destroy cleans App exactly once, including reentrant destroy');
  equal(effects, 1, 'a queued disposed effect never runs');
  equal(effectCleaned, 1, 'owned effect cleanup runs');
  setValue(2);
  equal(effects, 1, 'destroy unsubscribes effects');

  render(() => <Probe />, 0, null);
  render(() => <View />, 0, null);
  equal(cleaned, 2, 'render replacement disposes the previous App');
  equal(effectCleaned, 2);
  setValue(3);
  equal(effects, 2, 'replacement unsubscribes old effects');

  render(() => <View><EarlyCleanup /><LateCleanup /></View>, 0, null);
  ui.destroy(ui.rootNode());
  equal(siblingRuns, 1, 'cleanup cannot rerun a sibling under a disposing ancestor');

  try { render(Broken, 0, null); } catch (e) { equal(e.message, 'render failed'); }
  equal(failedRender, 1, 'failed render disposes its owner');
  onCleanup(() => { throw new Error('render left a current owner'); });
  try { renderWindow('unopened', 100, 100, Broken, 0); } catch (e) { equal(e.message, 'render failed'); }
  equal(failedRender, 2, 'window render unwinds before opening a native window');

  render(() => <ThrowingCleanup />, 0, null);
  try { ui.destroy(ui.rootNode()); } catch (e) { equal(e.message, 'cleanup failed'); }
  equal(afterThrow, 1, 'one cleanup throwing does not skip the others');
  setValue(4);

  // The existing subtree API shares disposal: repeated/reentrant disposal stays harmless after a throw.
  const tree = createSubtree(() => {
    try { render(Broken, 0, null); } catch (e) { equal(e.message, 'render failed'); }
    onCleanup(() => { afterThrow++; });
    return <View />;
  });
  tree.dispose(); tree.dispose(); ui.destroy(tree.node);
  equal(afterThrow, 2, 'throwing render restores the surrounding owner');
  equal(failedRender, 3);
  render(() => <Probe />, 0, null);
  ui.destroy(ui.rootNode());
  equal(cleaned, 3, 'render restarts after render and cleanup failures');
  equal(effects, 3);
  equal(effectCleaned, 3);
  render(() => <Text>done</Text>, 0, null);
  console.log('solid-root-cleanup: pass');
}
let frame = 0;
render(() => <Probe />, 0, (dt: number) => { frame++; if (frame === 2) checkLifecycle(); });
