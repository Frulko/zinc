// A zinc:stage scene under the Zinc Inspector (tests/t1/inspector_stage.sh): its display tree with the class of each node (the program's own
// subclasses too), an `alpha` that only a subclass declares, a hidden node that "rendered only" leaves out, an edit of x that moves a box,
// the tree following the program live (once the ball is moved, a node joins, another leaves and the ball drops), and a node turned about its
// pivot (fatty's rotation in radians, pivotX, pivotY) whose box turns with it and that a point of the window picks, and a node the program
// renames and hides once the ball is moved past 250 (the inspector is told without selecting it). What nodes show, found by their fields: a
// Label's text (a text child, edited in place; the program changes it too), a Picture's texture name (src).
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
class Label extends Sprite {   // its width follows its text: an edit changes the frame
  text: string = 'Score: 0';
  override onDraw(w: number, h: number): void { rect(0, 0, this.text.length * 6, h, 0xfacc15); }
}
class Texture { name: string; constructor(name: string) { this.name = name; } }
class Picture extends Sprite {
  texture: Texture = new Texture('ball.png');
  override onDraw(w: number, h: number): void { rect(0, 0, w, h, 0x22c55e); }
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
    if (ball.x > 250 && tag.visible) { tag.name = 'renamed'; tag.visible = false; score.text = 'Score: 1'; }
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
const score = new Label('score');
score.x = 10; score.y = 150; score.width = 80; score.height = 16;
game.addChild(score);
const pic = new Picture('pic');
pic.x = 100; pic.y = 150; pic.width = 16; pic.height = 16;
game.addChild(pic);
onFrame((dt: number) => stage.frame(dt));
