// zinc:stage (ZN-774.13, lib/std/stage.ts): a small tree's layout, the lifecycle order, the AS3 names, the hit test, the pointer
// routed to tap, drag and scroll zones, and the frames Stage.frame draws (none while nothing changed). Run by tests/t0/stage.sh.
import { onFrame } from 'zinc:gfx';
import {
  Stage, Sprite, DisplayObject, ScrollBox, TouchZone, uiState, registerTapZone, registerDragZone, findTopmostZoneAt, routePointer,
  beginScrollBox, endScrollBox, clearTouchZones,
} from 'zinc:stage';

class Node extends Sprite {
  tappable: boolean = false;
  draggable: boolean = false;
  draws: i32 = 0;
  override onAddedToStage(): void { console.log(`added ${this.name}`); }
  override onRemovedFromStage(): void { console.log(`removed ${this.name}`); }
  override onDraw(localWidth: number, localHeight: number): void {
    this.draws++;
    if (this.tappable) registerTapZone(this.name, 0, 0, localWidth, localHeight, () => { console.log(`tap ${this.name}`); });
    if (this.draggable) {
      registerDragZone(this.name, 0, 0, localWidth, localHeight, (x: number, y: number, phase: i32) => {
        console.log(`drag ${this.name} ${x} ${y} ${phase}`);
      });
    }
  }
}

function node(name: string, width: number, height: number): Node {
  const n = new Node(name);
  n.width = width;
  n.height = height;
  return n;
}

/** The node's screen rectangle. */
function at(n: DisplayObject): string {
  let left = 0;
  let top = 0;
  let p: DisplayObject | null = n;
  while (p !== null) {
    left += (p as DisplayObject).x;
    top += (p as DisplayObject).y;
    p = (p as DisplayObject).parent;
  }
  return `${n.name} ${left} ${top} ${n.width} ${n.height}`;
}

function hit(x: number, y: number): string {
  const zone = findTopmostZoneAt(x, y, true);
  return zone === null ? 'none' : (zone as TouchZone).id;
}

// a column (padding 10, gap 5): a header, a row that takes the rest (a fixed child and a flex one, centred), a footer
const stage = new Stage();
const column = new Node('column');
column.direction = 'column';
column.alignItems = 'stretch';
column.gap = 5;
column.setPaddingSymmetric(10, 10);
column.width = 200;   // whatever the window's size
column.height = 100;
const header = node('header', 0, 20);
const body = node('body', 0, 0);
body.flex = 1;
body.direction = 'row';
body.alignItems = 'center';
body.gap = 4;
body.tappable = true;
const a = node('a', 30, 10);
a.tappable = true;
const b = node('b', 0, 20);
b.flex = 1;
b.tappable = true;
const footer = node('footer', 0, 15);
footer.draggable = true;
body.addChild(a);
body.addChild(b);
column.addChild(header);
column.addChild(body);
column.addChild(footer);
stage.addChild(column);   // added: parents first

let frameCount = 0;
onFrame((dt: number) => {
  frameCount++;
  stage.frame(dt);
  if (frameCount === 1) {
    console.log(`layout ${at(header)} | ${at(body)} | ${at(a)} | ${at(b)} | ${at(footer)}`);
    console.log(`hit ${hit(12, 50)} ${hit(100, 40)} ${hit(100, 50)} ${hit(100, 80)} ${hit(5, 5)}`);
    console.log(`as3 ${column.numChildren} ${column.getChildAt(2).name} ${column.getChildIndex(body)} ${column.contains(a)} ${body.contains(header)} ${a.stage === stage} ${new Sprite().stage === null}`);
    routePointer(15, 50, false, 0.016);
    console.log(`mouse ${a.mouseX} ${a.mouseY}`);
    // a tap; a press that moves past 12 pixels is no tap; a drag, in the zone's local coordinates
    routePointer(12, 50, true, 0.016);
    console.log(`pressed ${uiState.pressedZoneId}`);
    routePointer(12, 50, false, 0.016);
    routePointer(100, 50, true, 0.016);
    routePointer(100, 70, true, 0.016);
    console.log(`moved pressed='${uiState.pressedZoneId}'`);
    routePointer(100, 70, false, 0.016);
    routePointer(20, 80, true, 0.016);
    routePointer(30, 82, true, 0.016);
    routePointer(30, 82, false, 0.016);
    // lifecycle: a removed subtree tells its children first; addChildAt puts it back in its place
    column.removeChild(body);
    column.addChildAt(body, 1);
    console.log(`order ${column.getChildAt(0).name} ${column.getChildAt(1).name} ${column.getChildAt(2).name}`);
    // a scroll box cuts the zones it holds; a finger moved past 12 pixels scrolls it and taps nothing
    clearTouchZones();
    const box = new ScrollBox();
    box.contentHeight = 200;
    uiState.offsetX = 0;
    uiState.offsetY = 0;
    beginScrollBox(box, 0, 0, 50, 50);
    registerTapZone('row', 0, 40, 50, 20, () => { console.log('tap row'); });
    registerTapZone('hidden', 0, 60, 50, 20, () => { console.log('tap hidden'); });
    endScrollBox();
    console.log(`scroll ${hit(10, 45)} ${hit(10, 55)} ${hit(10, 65)}`);
    routePointer(10, 45, true, 0.016);
    routePointer(10, 15, true, 0.016);
    routePointer(10, 15, false, 0.016);
    console.log(`scrolled ${box.scrollY}`);
  }
  // frame 2 draws what the pointer changed; frames 3 and 4 have nothing to draw
  if (frameCount === 4) console.log(`draws ${column.draws} ${a.draws} ${footer.draws}`);
});
