import { onFrame, rrect, width } from 'zinc:gfx';
import { Stage, Sprite, uiState } from 'zinc:stage';

class Ball extends Sprite {
  color: u32 = 0xffffff;
  speed: number = 100;   // pixels per second, to the right

  override onAddedToStage(): void {
    console.log(`The ${this.name} joined the stage.`);
  }

  override onUpdate(dt: number): void {
    this.x += this.speed * dt;
    if (this.x > width()) this.x = -this.width;   // gone on the right: back on the left
    uiState.dirty = true;                         // it moved: the stage must be drawn again
  }

  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, w / 2, this.color, 255);    // (0, 0) is the ball's own top left corner
  }
}

function makeBall(name: string, color: u32, y: number, size: number, speed: number): Ball {
  const ball = new Ball(name);
  ball.color = color;
  ball.y = y;
  ball.width = size;
  ball.height = size;
  ball.speed = speed;
  return ball;
}

const stage = new Stage();
stage.color = 0x14213d;
stage.addChild(makeBall('pink ball', 0xf27aa6, 60, 60, 120));
stage.addChild(makeBall('blue ball', 0x5ec2f2, 170, 80, 60));
stage.addChild(makeBall('gold ball', 0xe8b06a, 300, 40, 200));
console.log(`The stage holds ${stage.numChildren} balls.`);

let time = 0;
let told = false;
onFrame((dt: number) => {
  stage.frame(dt);
  time += dt;
  if (!told && time >= 1) {
    console.log(`After ${time.toFixed(2)} seconds the pink ball is at x = ${Math.round(stage.getChildAt(0).x)}.`);
    told = true;
  }
});
