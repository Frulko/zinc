// Fatty's Starling subset, backed by Zinc's retained display tree and graphics host.
import { Stage, uiState } from 'zinc:stage';
import { clear, keep, resetTransform, width, height, pointerX, pointerY, pointerDown, setCursor, buttonEventCount, buttonEventButton, buttonEventDown, buttonEventX, buttonEventY } from 'zinc:gfx';
import { Sprite } from './display';
import { Event, TouchEvent } from './events';
import { TextInput } from './text';
import { Juggler } from './animation';
export { Sprite, Image, Button } from './display';
export { Event, EnterFrameEvent, Touch, TouchEvent, TouchPhase } from './events';
export { Texture, TextureAtlas } from './textures';
export { MovieClip, Tween } from './animation';
export { TextField } from './text';
export function deg2rad(degrees: number): number { return degrees*Math.PI/180; }

export class Starling {
  static juggler = new Juggler();
  antiAliasing = 1;
  showStats = false;
  private root: Sprite;
  private wasDown = false;
  private pressed: Sprite | null = null;
  private accumulator = 0;
  constructor(root: new () => Sprite, private stage: Stage) {
    this.root = new root();
    stage.addChild(this.root);
  }
  start(): void { uiState.dirty = true; }
  private routePointer(down: boolean, hit: Sprite | null): void {
    if (down && !this.wasDown) {
      this.pressed = hit;
      if (hit) hit.dispatchEvent(new TouchEvent());
    } else if (!down && this.wasDown) {
      if (hit && hit === this.pressed && hit.isOnStage) hit.dispatchEvent(new Event(Event.TRIGGERED,true));
      this.pressed = null;
    }
    this.wasDown = down;
  }
  frame(dt: number): void {
    const scale = Math.min(width()/1024,height()/768);
    this.root.scaleX = scale; this.root.scaleY = scale;
    this.root.x = (width()-1024*scale)/2; this.root.y = (height()-768*scale)/2;
    const hit = this.root.hitTest(pointerX(),pointerY());
    setCursor(hit ? 2 : 0);
    let mouseEvent = false;
    for (let i = 0; i < buttonEventCount(); i++) {
      if (buttonEventButton(i) !== 0) continue;
      mouseEvent = true;
      this.routePointer(buttonEventDown(i),this.root.hitTest(buttonEventX(i),buttonEventY(i)));
    }
    if (!mouseEvent) this.routePointer(pointerDown(),hit);
    TextInput.routeKeyboard();
    // AS3's motion is specified per ENTER_FRAME, at the document's original 60 Hz.
    this.accumulator += Math.min(dt,0.25);
    while (this.accumulator+1e-9 >= 1/60) {
      this.accumulator -= 1/60;
      Starling.juggler.advanceTime(1/60);
      this.stage.updateTree(1/60);
    }
    if (!uiState.dirty && this.stage.width === width() && this.stage.height === height()) { keep(); return; }
    uiState.dirty = false;
    resetTransform();
    clear(0xf1bb4f);
    this.stage.renderStage(width(),height());
  }
}
