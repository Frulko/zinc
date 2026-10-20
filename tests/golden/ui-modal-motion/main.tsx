// Layer motions (tests/t1/ui_modal_motion.sh): a transparent React Native Modal with animationType="slide" over a white page. Its dimmed full-size view
// is the scrim: it fades in place while the sheet (blue) slides up from the bottom, and the reverse on close. Toggled quickly, it ends shown or gone,
// never half way. MOTION_OUT=dir: the frame is captured there on every frame (f-<n>.png) for the script to read the pixels.
import { useState } from 'zinc:ui/react';
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { View, Text, Modal, Pressable } from 'zinc:react-native';
import { quit, capture } from 'zinc:gfx';
import { env } from 'zinc:sys';

let setOpen: (v: boolean) => void = (v: boolean): void => {};
function App() {
  const [open, so] = useState(false);
  setOpen = so;
  return <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
    <Modal visible={open} transparent={true} animationType="slide" onRequestClose={() => so(false)}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' }} onPress={() => so(false)}>
        <View style={{ height: 200, backgroundColor: '#3366cc' }}><Text style={{ color: '#3366cc' }}>sheet</Text></View>
      </Pressable>
    </Modal>
  </View>;
}
/** The layer node: the nearest ancestor of the sheet's text that is a layer. */
function layer(): i32 {
  let h = ui.find('sheet');
  while (h >= 0 && ui.layerProgress(h) < 0) { const n = ui.inspectNode(h); h = n === null ? -1 : n.parent; }
  return h;
}
function moving(): string { const v = ui.layerProgress(layer()); return v > 0 && v < 1 ? 'in motion' : `not moving (${v})`; }
const out = env('MOTION_OUT');
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (out !== '') capture(`${out}/f-${f}.png`);   // the frame presented before this one
  if (f === 3) setOpen(true);
  if (f === 6) console.log(`opening: ${moving()}`);
  if (f === 40) { console.log(`open: ${ui.layerProgress(layer())}`); setOpen(false); }
  if (f === 44) console.log(`closing: ${moving()}`);
  if (f === 70) { console.log(`closed: ${ui.layerProgress(layer())}`); setOpen(true); }
  if (f === 72) setOpen(false);
  if (f === 73) setOpen(true);
  if (f === 75) setOpen(false);
  if (f === 76) setOpen(true);
  if (f === 110) { console.log(`toggled, ends open: ${ui.layerProgress(layer())}`); setOpen(false); }
  if (f === 111) setOpen(true);
  if (f === 112) setOpen(false);
  if (f === 150) { console.log(`toggled, ends closed: ${ui.layerProgress(layer())}`); quit(); }
});
