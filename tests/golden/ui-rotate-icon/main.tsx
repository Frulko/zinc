// An icon inside a turned view turns with it (ZN-361.01): icons are drawn by the svg plugin, whose commands go through the matrix of
// the view's rotate. ROT sets the turn; tests/t1/ui_rotate_icon.sh compares the frames.
import { render } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import { Icon } from 'zinc:icons';
const rot = sys.env('ROT') === '' ? 0 : parseFloat(sys.env('ROT'));
function App(): i32 {
  return <View className="w-full h-full items-center justify-center bg-white">
    <View style={{ width: 48, height: 48, rotate: rot }}><Icon name="loader-circle" size={48} color={() => 0x2563eb} /></View>
  </View>;
}
render(App, 0xffffff, (dt: number) => {});
