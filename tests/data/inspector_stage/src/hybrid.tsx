// A zinc:ui interface with a zinc:stage scene drawn in its <Canvas> (Stage.drawIn), under the Zinc Inspector (tests/t1/inspector_stage.sh):
// Elements shows both trees, the scene under its Canvas, and the ball's box and its edit are in window coordinates (the Canvas is 16 px in).
// A dark box painted after the Canvas covers part of the moved ball: the ball's highlight is drawn over it, and a point picks one or the other.
import 'zinc:devtools';
import { render } from 'zinc:ui/solid';
import { rect } from 'zinc:gfx';
import { Stage, Sprite } from 'zinc:stage';

class Box extends Sprite {
  alpha: number = 1;
  override onDraw(w: number, h: number): void { rect(0, 0, w, h, 0xe11d48); }
}
const stage = new Stage();
const ball = new Box('ball');
ball.x = 40; ball.y = 30; ball.width = 50; ball.height = 40;
stage.addChild(ball);

function App(): i32 {
  return <View className="flex-col p-4 gap-2">
    <Canvas className="w-64 h-40" onDraw={(x: i32, y: i32, w: i32, h: i32) => stage.drawIn(x, y, w, h)} />
    <Text className="text-sm">A scene in a Canvas</Text>
    <View className="absolute left-36 top-12 w-16 h-8 bg-slate-900" />
  </View>;
}
render(App, 0xffffff, (dt: number) => {});
