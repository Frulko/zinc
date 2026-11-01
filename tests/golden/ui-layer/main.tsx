// A cached layer (ZN-930): `layer-cache` keeps the children as an image. While another node changes, the layer's thirty rows are not drawn again
// (no recording, one image command); invalidate() draws them once more.
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
import { render, NodeRef } from 'zinc:ui/solid';

const layer = new NodeRef();
const other = new NodeRef();
const rows: i32[] = [];
for (let i = 0; i < 30; i++) rows.push(i);
function App(): i32 {
  return <View className="flex-col gap-2 p-2 w-full bg-white">
    <View ref={other} className="w-16 h-8 bg-slate-200" />
    <View ref={layer} className="layer-cache flex-col w-64 bg-white">
      {rows.map((i: i32): i32 => <Text className="text-xs text-black">row {i}</Text>)}
    </View>
  </View>;
}
let f = 0, cmds0 = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { console.log('recorded once', ui.layerRecordCount()); cmds0 = ui.lastFrameCommands(); ui.setClass(other.node, 'w-16 h-8 bg-slate-400'); }
  if (f === 4) { console.log('other changed: recordings', ui.layerRecordCount(), 'commands equal', ui.lastFrameCommands() === cmds0); ui.invalidate(layer.node); }
  if (f === 6) { console.log('invalidated: recordings', ui.layerRecordCount()); quit(); }
});
