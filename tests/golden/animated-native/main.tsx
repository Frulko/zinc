// Animated's native driver (ZN-364.01), run by tests/t0/animated_native.sh: values bound to a view with attach() and animated with
// useNativeDriver: true are played by the engine (the compositor for translateX and opacity): the view shows the program-driven values,
// the program paints nothing per frame, a layout property throws React Native's error, and the lifecycles hold across a stale node handle
// (released, its slot recycled) and a restart.
import * as ui from 'zinc:ui';
import * as A from 'zinc:ui/animated';
import { createNodeRef, render } from 'zinc:ui/solid';

const box = createNodeRef(), bar = createNodeRef();
const x = new A.Value(0), fade = new A.Value(1), w = new A.Value(40);
function App(): i32 {
  return <View style={{ padding: 20, gap: 10 }}>
    <View ref={box} className="w-20 h-20 bg-blue-500 rounded-md"><Text className="text-white">Go</Text></View>
    <View ref={bar} className="h-6 bg-amber-300" />
  </View>;
}
function r3(v: number): number { return Math.round(v * 1000) / 1000; }
let frames = 0, uid = 0, spare = -1, gone = -1;
const y = new A.Value(0);
render(App, 0xffffff, (dt: number) => {
  frames++;
  if (frames === 2) {
    A.attach(box.node, 'translateX', x);
    A.attach(box.node, 'opacity', fade.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }));
    A.attach(bar.node, 'width', w);
    try { A.timing(w, { toValue: 120, duration: 300, useNativeDriver: true }).start(); console.log('width: no error'); }
    catch (e) { console.log(`width: ${(e as Error).message}`); }
    w.setValue(120);   // from the program, a layout property is fine
    A.timing(x, { toValue: 100, duration: 500, useNativeDriver: true }).start((f: boolean) => { console.log(`x ended at frame ${frames}: ${f} ${x.get()}`); });
    A.timing(fade, { toValue: 0, duration: 500, useNativeDriver: true }).start();
  }
  if (frames === 12 || frames === 22) {   // what the view shows (written by the engine) and what the value reads (computed now) agree
    console.log(`frame ${frames}: value ${r3(x.get())}, view ${r3(ui.getNumber(box.node, 'translateX'))}, opacity ${r3(ui.getNumber(box.node, 'opacity'))}`);
  }
  if (frames === 40) {   // restart: stopped half way, the value is where it was shown; started again, it ends
    A.spring(x, { toValue: 0, stiffness: 100, damping: 10, useNativeDriver: true }).start((f: boolean) => { console.log(`spring: ${f ? 'finished' : 'stopped'} at ${r3(x.get())}`); });
  }
  if (frames === 46) { x.stopAnimation(); console.log(`after stop: value ${r3(x.get())} view ${r3(ui.getNumber(box.node, 'translateX'))}`); }
  if (frames === 47) A.timing(x, { toValue: 0, duration: 100, useNativeDriver: true }).start((f: boolean) => { console.log(`again: ${f ? 'finished' : 'stopped'} at ${x.get()}, view ${ui.getNumber(box.node, 'translateX')}`); });
  if (frames === 50) {   // a stale handle: the node of a series and of a binding is released and its slot recycled
    const root = ui.rootNode();
    gone = ui.createNode(ui.VIEW);
    ui.insert(root, gone, -1);
    uid = ui.animateSeries(gone, 'translateX', [0, 10, 20, 30, 40, 50, 60, 70, 80], 50, 0, (f: boolean) => { console.log(`series told: ${f}`); });
    A.attach(gone, 'translateY', y);
    console.log(`series state ${ui.animState(uid)}`);
    const was = ui.nodeSerial(gone);
    ui.remove(root, gone);
    ui.destroy(gone);
    spare = ui.createNode(ui.VIEW);
    ui.insert(root, spare, -1);
    console.log(`slot recycled: ${spare === gone}, serial changed: ${ui.nodeSerial(spare) !== was}`);
  }
  if (frames === 52) {
    y.setValue(33);
    console.log(`after release: stop ${ui.stopSeries(uid)}, state ${ui.animState(uid)}, new node x ${ui.getNumber(spare, 'translateX')} y ${ui.getNumber(spare, 'translateY')}`);
  }
});
