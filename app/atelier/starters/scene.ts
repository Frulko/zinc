import { onFrame, rrect } from 'zinc:gfx';
import { Stage, Sprite, registerTapZone, uiState } from 'zinc:stage';

const COLORS: u32[] = [0x9388ff, 0x5ec2f2, 0xe8b06a];

class Ball extends Sprite {
  t: number = 0;
  color: i32 = 0;
  override onUpdate(dt: number): void {
    this.t += dt;
    uiState.dirty = true;     // it changed: draw the next frame
  }
  override onDraw(w: number, h: number): void {   // (0, 0) is the sprite's own top left corner
    const r = 40 + 10 * Math.sin(this.t * 2);
    rrect(w / 2 - r, h / 2 - r, r * 2, r * 2, r, COLORS[this.color], 255);
    registerTapZone('ball', w / 2 - r, h / 2 - r, r * 2, r * 2, () => { this.color = (this.color + 1) % COLORS.length; });
  }
}

const stage = new Stage();
stage.color = 0x1c1b20;
stage.direction = 'column';
stage.alignItems = 'stretch';
const ball = new Ball('ball');
ball.flex = 1;                // the whole window
stage.addChild(ball);
onFrame((dt: number) => stage.frame(dt));
