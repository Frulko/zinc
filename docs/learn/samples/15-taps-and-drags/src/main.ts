import { onFrame, rrect, border, font, drawText, textWidth, lineHeight } from 'zinc:gfx';
import { Stage, Sprite, DisplayObject, registerTapZone, registerDragZone, isZonePressed } from 'zinc:stage';

const label = font('sans', 18);

// A button that counts its taps.
class Counter extends Sprite {
  taps: i32 = 0;
  override onDraw(w: number, h: number): void {
    const held = isZonePressed(this.name);                 // a finger is on it right now
    rrect(0, 0, w, h, h / 2, held ? 0x3f33b0 : 0x5746e0, 255);
    const words = `Taps: ${this.taps}`;
    drawText(label, (w - textWidth(label, words, 0)) / 2, (h - lineHeight(label)) / 2, words, 0xffffff, 255, 0);
    registerTapZone(this.name, 0, 0, w, h, () => {
      this.taps++;
      console.log(`tap ${this.taps}`);
    });
  }
}

// A card you pick up and move.
class Card extends Sprite {
  color: u32 = 0;
  startX: number = 0;   // where the card was when it was picked up
  startY: number = 0;
  grabX: number = 0;    // where the finger took it, in the card
  grabY: number = 0;

  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, 14, this.color, 255);
    if (isZonePressed(this.name)) border(0, 0, w, h, 14, 3, 0xffffff, 255);
    registerDragZone(this.name, 0, 0, w, h, (x: number, y: number, phase: i32) => this.drag(x, y, phase));
  }

  drag(x: number, y: number, phase: i32): void {
    if (phase === 0) {                                     // pressed
      this.startX = this.x;
      this.startY = this.y;
      this.grabX = x;
      this.grabY = y;
      (this.parent as DisplayObject).addChild(this);       // added again: now on top of the other cards
      console.log(`picked up the ${this.name} at ${Math.round(x)}, ${Math.round(y)} in the card`);
    } else if (phase === 1) {                              // moved
      this.x = this.startX + x - this.grabX;
      this.y = this.startY + y - this.grabY;
    } else if (phase === 2) {                              // let go
      console.log(`dropped the ${this.name} at ${Math.round(this.x)}, ${Math.round(this.y)}`);
    }
  }
}

function card(name: string, color: u32, x: number, y: number): Card {
  const c = new Card(name);
  c.color = color;
  c.x = x;
  c.y = y;
  c.width = 120;
  c.height = 160;
  return c;
}

const stage = new Stage();
stage.color = 0xf3f1ec;
const counter = new Counter('counter');
counter.x = 24;
counter.y = 24;
counter.width = 140;
counter.height = 44;
stage.addChild(counter);
stage.addChild(card('green card', 0x7bd389, 200, 120));
stage.addChild(card('pink card', 0xf27aa6, 260, 150));
stage.addChild(card('blue card', 0x5ec2f2, 320, 180));
onFrame((dt: number) => stage.frame(dt));
