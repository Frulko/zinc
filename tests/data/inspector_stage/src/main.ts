// A zinc:stage scene under the Zinc Inspector (tests/t1/inspector_stage.sh): its display tree with the class of each node (the program's own
// subclasses too), an `alpha` that only a subclass declares, a hidden node that "rendered only" leaves out, an edit of x that moves a box,
// the tree following the program live (once the ball is moved, a node joins, another leaves and the ball drops), and a node turned about its
// pivot (fatty's rotation in radians, pivotX, pivotY) whose box turns with it and that a point of the window picks, and a node the program
// renames and hides once the ball is moved past 250 (the inspector is told without selecting it).
import 'zinc:devtools';
import { onFrame, rect } from 'zinc:gfx';
import { Stage, Sprite } from 'zinc:stage';

class Box extends Sprite {
  color: u32 = 0xe11d48;
  alpha: number = 1;
  override onDraw(w: number, h: number): void { rect(0, 0, w, h, this.color); }
}
class Spin extends Sprite {
  rotation: number = Math.PI / 2;
  pivotX: number = 20;
  pivotY: number = 10;
}
class GameManager extends Sprite {
  override onUpdate(dt: number): void {
    if (ball.x > 100 && ghost.parent !== null) {
      this.removeChild(ghost);
      const spark = new Box('spark');
      spark.width = 10; spark.height = 10;   // a size: one of 0 would cover the whole stage
      this.addChild(spark);
      ball.y = 60;
    }
    if (ball.x > 250 && tag.visible) { tag.name = 'renamed'; tag.visible = false; }
  }
}

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
const spin = new Spin('spin');
spin.x = 200; spin.y = 100; spin.width = 40; spin.height = 20;
game.addChild(spin);
const tag = new Box('tag');
tag.x = 10; tag.y = 200; tag.width = 20; tag.height = 20;
game.addChild(tag);
onFrame((dt: number) => stage.frame(dt));
