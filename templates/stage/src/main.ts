// A scene of objects (zinc:stage), the way ActionScript 3 and Haxe write it: a Stage holds sprites, each sprite draws itself in its
// own coordinates ((0, 0) is its corner) and says where it takes a tap or a drag. Nothing is drawn while nothing changes, which keeps
// it light on old tablets. Tap a colour, drag the sticker.
import { onFrame, rrect, border, font, drawText, lineHeight } from 'zinc:gfx';
import { Stage, Sprite, registerTapZone, registerDragZone, isZonePressed } from 'zinc:stage';

const COLORS: u32[] = [0xf27aa6, 0x5ec2f2, 0xe8b06a, 0x7bd389];
const titleFont = font('sans-bold', 22);

// A line of text, centred in its height.
class Label extends Sprite {
  text: string = '';
  override onDraw(w: number, h: number): void {
    drawText(titleFont, 0, (h - lineHeight(titleFont)) / 2, this.text, 0xffffff, 255, 0);
  }
}

// A round button of one colour: a tap paints the sticker with it.
class Swatch extends Sprite {
  color: u32 = 0;
  override onDraw(w: number, h: number): void {
    const held = isZonePressed(this.name);                       // the finger is on it: draw it lighter
    rrect(0, 0, w, h, w / 2, this.color, held ? 150 : 255);
    if (sticker.color === this.color) border(-4, -4, w + 8, h + 8, w / 2 + 4, 3, 0xffffff, 255);
    registerTapZone(this.name, 0, 0, w, h, () => { sticker.color = this.color; });
  }
}

// The area the sticker lives in: its children are placed by their own x and y.
class Board extends Sprite {
  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, 16, 0x2a2930, 255);
  }
}

// A round sticker you drag around the board.
class Sticker extends Sprite {
  color: u32 = COLORS[0];
  startX: number = 0;
  startY: number = 0;
  grabX: number = 0;
  grabY: number = 0;
  override onDraw(w: number, h: number): void {
    rrect(0, 0, w, h, w / 2, this.color, 255);
    registerDragZone('sticker', 0, 0, w, h, (x: number, y: number, phase: i32) => {
      if (phase === 0) {                                         // pressed: remember where it was and where the finger took it
        this.startX = this.x;
        this.startY = this.y;
        this.grabX = x;
        this.grabY = y;
      } else if (phase === 1) {                                  // moved: follow the finger, inside the board
        this.x = Math.max(0, Math.min(board.width - this.width, this.startX + x - this.grabX));
        this.y = Math.max(0, Math.min(board.height - this.height, this.startY + y - this.grabY));
      }
    });
  }
}

const stage = new Stage();
stage.color = 0x1c1b20;
stage.direction = 'column';                                      // its children from top to bottom
stage.alignItems = 'stretch';                                    // as wide as the window
stage.gap = 16;
stage.setPaddingSymmetric(24, 20);

const header = new Sprite('header');
header.direction = 'row';                                        // its children from left to right
header.alignItems = 'center';
header.gap = 12;
header.height = 44;
const title = new Label('title');
title.text = 'Tap a colour, drag the sticker';
title.flex = 1;                                                  // takes the room the swatches leave
title.height = 44;
header.addChild(title);
for (let i = 0; i < COLORS.length; i++) {
  const swatch = new Swatch(`swatch ${i}`);
  swatch.color = COLORS[i];
  swatch.width = 36;
  swatch.height = 36;
  header.addChild(swatch);
}

const board = new Board('board');
board.flex = 1;                                                  // the rest of the height
const sticker = new Sticker('sticker');
sticker.x = 40;
sticker.y = 40;
sticker.width = 90;
sticker.height = 90;
board.addChild(sticker);

stage.addChild(header);
stage.addChild(board);
onFrame((dt: number) => stage.frame(dt));                        // the pointer, onUpdate, the layout and the drawing
