import { DisplayObject, uiState } from 'zinc:stage';
import { setTransform, drawImageRect } from 'zinc:gfx';
import { Event, EnterFrameEvent, EventDispatcher, TouchEvent } from './events';
import { Texture } from './textures';

export class Sprite extends DisplayObject {
  alpha = 1;
  rotation = 0;
  scaleX = 1; scaleY = 1;
  pivotX = 0; pivotY = 0;
  useHandCursor = false;
  private events = new SpriteEvents(this);
  private frameEvent = new EnterFrameEvent();
  a = 1; b = 0; c = 0; d = 1; tx = 0; ty = 0;
  worldAlpha = 1;
  constructor() { super(); }
  get eventParent(): EventDispatcher | null {
    return this.parent instanceof Sprite ? this.parent.events : null;
  }
  addEventListener(type: string, callback: (event: never) => void): void {
    this.events.addEventListener(type, callback as (event: Event) => void);
  }
  removeEventListener(type: string, callback: (event: never) => void): void {
    this.events.removeEventListener(type, callback as (event: Event) => void);
  }
  hasEventListener(type: string): boolean { return this.events.hasEventListener(type); }
  dispatchEvent(event: Event): void { this.events.dispatchEvent(event); }
  override removeChild(child: DisplayObject): DisplayObject {
    // Flash accepts an empty Vector slot; Zinc's tree expects an actual node.
    return child ? super.removeChild(child) : child;
  }
  override onAddedToStage(): void { this.dispatchEvent(new Event(Event.ADDED_TO_STAGE)); }
  override onUpdate(dt: number): void {
    if (!this.hasEventListener(Event.ENTER_FRAME)) return;
    uiState.dirty = true;
    this.frameEvent.passedTime = dt;
    this.dispatchEvent(this.frameEvent);
  }
  override updateTree(dt: number): void {
    if (!this.visible) return;
    this.onUpdate(dt);
    let i = 0;
    while (i < this.children.length) {
      const child = this.children[i];
      child.updateTree(dt);
      if (this.children[i] === child) i++;
      else { const at = this.children.indexOf(child); if (at >= 0) i = at+1; }
    }
  }
  override computeLayout(w: number, h: number): void { this.onMeasure(); }
  override renderTree(w: number, h: number, x: number, y: number): void {
    if (!this.visible || this.alpha <= 0) return;
    const p = this.parent instanceof Sprite ? this.parent : null;
    const pa = p ? p.a : 1, pb = p ? p.b : 0, pc = p ? p.c : 0, pd = p ? p.d : 1;
    const cos = Math.cos(this.rotation), sin = Math.sin(this.rotation);
    const a = cos * this.scaleX, b = sin * this.scaleX;
    const c = -sin * this.scaleY, d = cos * this.scaleY;
    const lx = this.x - this.pivotX * a - this.pivotY * c;
    const ly = this.y - this.pivotX * b - this.pivotY * d;
    this.a = pa*a + pc*b; this.b = pb*a + pd*b;
    this.c = pa*c + pc*d; this.d = pb*c + pd*d;
    this.tx = pa*lx + pc*ly + (p ? p.tx : x);
    this.ty = pb*lx + pd*ly + (p ? p.ty : y);
    this.worldAlpha = this.alpha * (p ? p.worldAlpha : 1);
    setTransform(this.a, this.b, this.c, this.d, this.tx, this.ty);
    this.onDraw(this.width, this.height);
    for (const child of this.children) child.renderTree(this.width, this.height, this.tx, this.ty);
  }
  hitTest(x: number, y: number): Sprite | null {
    if (!this.visible || this.alpha <= 0) return null;
    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i];
      if (child instanceof Sprite) {
        const hit = child.hitTest(x, y);
        if (hit) return hit;
      }
    }
    const determinant = this.a*this.d - this.b*this.c;
    if (Math.abs(determinant) < 1e-9) return null;
    const dx = x-this.tx, dy = y-this.ty;
    const lx = (this.d*dx-this.c*dy)/determinant;
    const ly = (this.a*dy-this.b*dx)/determinant;
    if (this.width <= 0 || this.height <= 0 || lx < 0 || ly < 0 || lx > this.width || ly > this.height) return null;
    let node: DisplayObject | null = this;
    while (node instanceof Sprite) {
      if (node.hasEventListener(TouchEvent.TOUCH) || node.hasEventListener(Event.TRIGGERED)) return node;
      node = node.parent;
    }
    return null;
  }
}
// Event targets remain display objects, while the std Stage owns the actual tree.
class SpriteEvents extends EventDispatcher {
  constructor(private owner: Sprite) { super(); }
  override get eventParent(): EventDispatcher | null { return this.owner.eventParent; }
  override get eventTarget(): unknown { return this.owner; }
}
export class Image extends Sprite {
  constructor(public texture: Texture) {
    super(); this.width = texture.frameWidth; this.height = texture.frameHeight;
  }
  override onDraw(w: number, h: number): void {
    const t = this.texture;
    const sx = w/t.frameWidth, sy = h/t.frameHeight;
    drawImageRect(t.image,t.x,t.y,t.width,t.height,-t.frameX*sx,-t.frameY*sy,t.width*sx,t.height*sy,
      Math.round(this.worldAlpha*255),0,0,0xffffff,0);
  }
}
export class Button extends Image {
  constructor(texture: Texture, public text = '') { super(texture); this.useHandCursor = true; }
}
