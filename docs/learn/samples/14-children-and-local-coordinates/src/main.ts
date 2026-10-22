import { onFrame, rrect, font, drawText, textWidth } from 'zinc:gfx';
import { Stage, Sprite, DisplayObject, uiState } from 'zinc:stage';

// A sun, a planet or a moon: a disc centred on its own (0, 0), turning around its parent's (0, 0).
class Body extends Sprite {
  color: u32 = 0xffffff;
  radius: number = 10;
  orbit: number = 0;    // how far from the parent's centre, in pixels (0: it does not turn)
  speed: number = 0;    // how fast it turns, in radians per second
  angle: number = 0;

  override onUpdate(dt: number): void {
    if (this.orbit === 0) return;
    this.angle += this.speed * dt;
    this.x = Math.cos(this.angle) * this.orbit;
    this.y = Math.sin(this.angle) * this.orbit;
    uiState.dirty = true;
  }

  override onDraw(w: number, h: number): void {
    rrect(-this.radius, -this.radius, this.radius * 2, this.radius * 2, this.radius, this.color, 255);
  }
}

// A name written under its parent, centred on the parent's (0, 0).
const small = font('sans', 14);
class Name extends Sprite {
  text: string = '';
  override onDraw(w: number, h: number): void {
    drawText(small, -textWidth(small, this.text, 0) / 2, 0, this.text, 0xc9c3e6, 255, 0);
  }
}

function body(name: string, color: u32, radius: number, orbit: number, speed: number): Body {
  const b = new Body(name);
  b.color = color;
  b.radius = radius;
  b.orbit = orbit;
  b.speed = speed;
  b.x = orbit;          // its place before it starts turning
  return b;
}

// Where a node is in the window: its x and y, plus its parent's, plus the parent's parent's...
function windowX(node: DisplayObject): number {
  let x = 0;
  let n: DisplayObject | null = node;
  while (n !== null) {
    x += (n as DisplayObject).x;
    n = (n as DisplayObject).parent;
  }
  return x;
}
function windowY(node: DisplayObject): number {
  let y = 0;
  let n: DisplayObject | null = node;
  while (n !== null) {
    y += (n as DisplayObject).y;
    n = (n as DisplayObject).parent;
  }
  return y;
}

const stage = new Stage();
stage.color = 0x0b1026;

const sun = body('sun', 0xffd166, 40, 0, 0);
sun.x = 320;
sun.y = 200;
const mercury = body('mercury', 0xb8b0a8, 8, 70, 2);
const earth = body('earth', 0x5ec2f2, 16, 150, 0.6);
const moon = body('moon', 0xe9e6df, 6, 34, 3);
const label = new Name('label');
label.text = 'Earth';
label.y = 22;

stage.addChild(sun);
sun.addChild(mercury);
sun.addChild(earth);
earth.addChild(moon);
earth.addChild(label);

function tell(): void {
  console.log(`The moon is at ${Math.round(moon.x)}, ${Math.round(moon.y)} in the earth, ` +
    `at ${Math.round(windowX(moon))}, ${Math.round(windowY(moon))} in the window.`);
}

tell();
let time = 0;
let told = false;
onFrame((dt: number) => {
  stage.frame(dt);
  time += dt;
  if (!told && time >= 1) {
    tell();
    told = true;
  }
});
