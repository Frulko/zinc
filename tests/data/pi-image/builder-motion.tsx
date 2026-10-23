import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { setColorMode } from 'zinc:ui/nuxt';
import { BuildPage } from '../../../image/builder/src/pages/build';
import { setStatus, setStepIndex, setStepTotal } from '../../../image/builder/src/state';

function expect(value: boolean, message: string): void { if (!value) throw new Error(message); }
function loading(): i32 {
  for (let h = 0; h < 3000; h++) {
    const n = ui.inspectNode(h);
    if (n !== null && n.label === 'Loading') return h;
  }
  return -1;
}
function fill(): i32 {
  for (let h = 0; h < 3000; h++) {
    const n = ui.inspectNode(h);
    if (n !== null && n.label === 'Build progress') return n.children[0];
  }
  throw new Error('missing progress bar');
}
function fraction(): number { return ui.getNumber(fill(), 'widthPercent'); }
function App(): i32 { return <View className="w-full h-full bg-[#20362b]"><BuildPage /></View>; }
setColorMode('light');
let f = 0, angle = 0;
render(App, 0x20362b, (dt: number) => {
  f++;
  if (f === 2) expect(loading() < 0, 'spinner mounted while idle');
  if (f === 3) { setStatus('running'); setStepTotal(4); setStepIndex(1); }
  if (f === 6) { expect(loading() >= 0, 'missing running spinner'); angle = ui.getNumber(loading(), 'rotate'); }
  if (f === 12) {
    expect(ui.getNumber(loading(), 'rotate') > angle, 'loading icon is static');
    expect(fraction() > 0 && fraction() < 0.25, 'progress jumps instead of easing');
  }
  if (f === 24) { expect(Math.abs(fraction() - 0.25) < 0.001, 'progress did not reach actual step'); setStepIndex(3); }
  if (f === 27) expect(fraction() > 0.25 && fraction() < 0.75, 'next step did not animate');
  if (f === 45) { expect(Math.abs(fraction() - 0.75) < 0.001, 'next step did not settle'); setStatus('failed'); }
  if (f === 47) { expect(loading() < 0, 'spinner survived build failure'); ui.systemSignal('reducemotion 1'); setStatus('running'); }
  if (f === 50) { expect(ui.getNumber(loading(), 'rotate') === 0, 'reduced motion still rotates'); setStepIndex(4); }
  if (f === 51) { expect(fraction() === 1, 'reduced motion still tweens progress'); setStatus('done'); }
  if (f === 53) expect(loading() < 0, 'spinner survived completion');
  if (f === 80) { expect(fraction() === 1 && loading() < 0, 'finished state did not stay still'); console.log('builder motion: spinner, easing, cleanup and reduced motion OK'); }
});
