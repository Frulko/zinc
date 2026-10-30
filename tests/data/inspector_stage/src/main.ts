// A zinc:stage scene under the Zinc Inspector (tests/t1/inspector_stage.sh): its display tree with the class of each node (the program's own
// subclasses too), an `alpha` that only a subclass declares, a hidden node that "rendered only" leaves out, and an edit of x that moves a box.
import 'zinc:devtools';
import { onFrame, rect } from 'zinc:gfx';
import { Stage, Sprite } from 'zinc:stage';

class Box extends Sprite {
  color: u32 = 0xe11d48;
  alpha: number = 1;
  override onDraw(w: number, h: number): void { rect(0, 0, w, h, this.color); }
}
class GameManager extends Sprite {}

const stage = new Stage();
stage.color = 0x0f172a;
const game = new GameManager('game');
stage.addChild(game);
const ball = new Box('ball');
ball.x = 40; ball.y = 30; ball.width = 50; ball.height = 40;
game.addChild(ball);
const ghost = new Box('ghost');
ghost.visible = false;
game.addChild(ghost);
onFrame((dt: number) => stage.frame(dt));
