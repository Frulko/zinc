import { onFrame, rrect, font, drawText, width, height } from 'zinc:gfx';
import { Stage, Sprite, registerTapZone, uiState } from 'zinc:stage';

const COLORS: u32[] = [0xf27aa6, 0x5ec2f2, 0xe8b06a, 0x7bd389];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const label = font('sans', 20);

class Score extends Sprite {
  points: i32 = 0;
  override onDraw(w: number, h: number): void {
    drawText(label, 0, 0, `Score: ${this.points}`, 0xffffff, 255, 0);
  }
}

class Ball extends Sprite {
  vx: number = 150;           // its speed, in pixels per second
  vy: number = 110;
  color: i32 = 0;             // which colour of COLORS it has
  override onUpdate(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < 0 || this.x > width() - this.width) this.vx = -this.vx;
    if (this.y < 0 || this.y > height() - this.height) this.vy = -this.vy;
    uiState.dirty = true;     // it moved: draw the next frame
  }
  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, w / 2, COLORS[this.color], 255);           // (0, 0) is the ball's own corner
    registerTapZone('ball', 0, 0, w, h, () => this.hit());
  }
  hit(): void {
    this.color = (this.color + 1) % COLORS.length;
    score.points++;
    console.log(`hit: score ${score.points}, the ball is ${NAMES[this.color]}`);
  }
}

const stage = new Stage();
stage.color = 0x1c1b20;
const score = new Score('score');
score.x = 16;
score.y = 12;
const ball = new Ball('ball');
ball.x = 70;                  // the corner: the centre is at 100, 80
ball.y = 50;
ball.width = 60;
ball.height = 60;
stage.addChild(ball);
stage.addChild(score);
onFrame((dt: number) => stage.frame(dt));
