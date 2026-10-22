// zinc:stage — a scene of objects, as ActionScript 3 and Haxe/OpenFL write it, drawn with zinc:gfx (docs/reference/stage.md).
// Promoted from examples/music-tree (core/display.ts and core/input.ts), the model of examples/GUIDELINES.md for old devices:
// a frame costs only what it draws, and nothing is drawn while nothing changed.
//
//   import { onFrame, rrect } from 'zinc:gfx';
//   import { Stage, Sprite, registerTapZone, uiState } from 'zinc:stage';
//   class Ball extends Sprite {
//     color: u32 = 0xf27aa6;
//     override onDraw(w: number, h: number): void {
//       rrect(0, 0, w, h, w / 2, this.color, 255);                                    // local coordinates: (0, 0) is the node's corner
//       registerTapZone('ball', 0, 0, w, h, () => { this.color = 0x5ec2f2; uiState.dirty = true; });
//     }
//   }
//   const stage = new Stage();
//   const ball = new Ball('ball'); ball.x = 100; ball.y = 80; ball.width = 60; ball.height = 60;
//   stage.addChild(ball);
//   onFrame((dt: number) => stage.frame(dt));                                         // input, onUpdate, layout and drawing
//
// The parts:
//   - the tree: DisplayObject (Sprite), Stage, addChild/removeChild, local coordinates, the hooks onAddedToStage, onRemovedFromStage,
//     onUpdate, onMeasure and onDraw, and a light row/column layout (direction, gap, padding, flex, alignItems, autoHeight);
//   - the input: a node registers its tap and drag zones while it draws; the pointer is tested against them from the last drawn to the
//     first (the hit test), and scroll boxes clip what they hold and scroll with a finger, a wheel or a fling;
//   - the frame: `uiState.dirty` asks for a drawing (an event sets it, never the layout or the drawing), `uiState.animating` asks for
//     the next one from inside onDraw. Stage.frame() does it all for a program with no gestures of its own; music-tree routes its own.

import { setTransform, resetTransform, clip, unclip, keep, clear, width, height, pointerX, pointerY, pointerDown, wheel, scrollDY } from 'zinc:gfx';

/** The frame state the tree, the zones and the program share. */
class UiRenderState {
  /** Set when something shown changed: the next frame lays out and draws the scene. */
  dirty: boolean = true;
  /** The pointer of this frame, in screen pixels. */
  pointerX: number = 0;
  pointerY: number = 0;
  /** The id of the zone held under the finger ('' when none): a button draws itself pressed (`isZonePressed`). */
  pressedZoneId: string = '';
  /** The screen position of the node being drawn: the zones registered in its onDraw are moved by it. */
  offsetX: number = 0;
  offsetY: number = 0;
  /** Set by a node while it draws (a spinner, a fade) to ask for the next frame too. */
  animating: boolean = false;
}

export const uiState = new UiRenderState();

/** True while a layout and drawing pass runs: the tree changes it makes (a page that mounts its rows in onMeasure) are drawn by that same pass. */
let isFramePassRunning = false;

// ----------------------------------------------------------------------------------------------------------------------------------------
// Scroll boxes and touch zones
// ----------------------------------------------------------------------------------------------------------------------------------------

/** The state of a vertical list that scrolls, with a fling. */
export class ScrollBox {
  /** How far the content is scrolled, in pixels. */
  scrollY: number = 0;
  /** The height of the content, measured while it is laid out. */
  contentHeight: number = 0;
  /** The visible height (set by `beginScrollBox`). */
  viewportHeight: number = 0;
  /** The speed of the fling, in pixels per second. */
  velocityY: number = 0;

  maxScrollY(): number {
    return Math.max(0, this.contentHeight - this.viewportHeight);
  }

  /** Keeps `scrollY` within [0, maxScrollY()]. */
  clamp(): void {
    this.scrollY = Math.max(0, Math.min(this.maxScrollY(), this.scrollY));
  }

  /** Moves the fling on by `deltaSeconds`; true while the list moves. */
  stepInertia(deltaSeconds: number): boolean {
    if (Math.abs(this.velocityY) < 8) {
      this.velocityY = 0;
      return false;
    }
    this.scrollY += this.velocityY * deltaSeconds;
    this.velocityY *= Math.pow(0.04, deltaSeconds);
    if (this.scrollY < 0 || this.scrollY > this.maxScrollY()) {
      this.clamp();
      this.velocityY = 0;
    }
    return true;
  }
}

/** A rectangle of the screen that takes a tap, a drag or a scroll, registered while a node draws. */
export class TouchZone {
  id: string = '';
  /** The rectangle, in screen pixels. */
  x: number = 0;
  y: number = 0;
  width: number = 0;
  height: number = 0;
  /** Called on a press and release with no movement. */
  onTapCallback: (() => void) | null = null;
  /** Called in the local coordinates of the node that registered it; `phase`: 0 press, 1 move, 2 release, 3 cancelled (the gesture went elsewhere). */
  onDragCallback: ((localX: number, localY: number, phase: i32) => void) | null = null;
  /** The screen position of the node that registered the drag (its local origin). */
  originX: number = 0;
  originY: number = 0;
  /** Set when the zone is a scroll box's viewport. */
  scrollBox: ScrollBox | null = null;

  containsPoint(pointX: number, pointY: number): boolean {
    return pointX >= this.x && pointX < this.x + this.width && pointY >= this.y && pointY < this.y + this.height;
  }

  /** Calls the drag callback with a screen point, brought to the local coordinates of the node that registered the zone. */
  drag(screenX: number, screenY: number, phase: i32): void {
    if (this.onDragCallback !== null) (this.onDragCallback as (x: number, y: number, p: i32) => void)(screenX - this.originX, screenY - this.originY, phase);
  }

  /** Copies `zone` into this one and returns this: a gesture keeps the zone it pressed while the frames reuse theirs. */
  copyFrom(zone: TouchZone): TouchZone {
    this.id = zone.id;
    this.x = zone.x;
    this.y = zone.y;
    this.width = zone.width;
    this.height = zone.height;
    this.onTapCallback = zone.onTapCallback;
    this.onDragCallback = zone.onDragCallback;
    this.originX = zone.originX;
    this.originY = zone.originY;
    this.scrollBox = zone.scrollBox;
    return this;
  }
}

// The zones of the last drawn frame, in drawing order. The objects past `activeZoneCount` are kept for the next frame: a drawing allocates none.
let activeZones: TouchZone[] = [];
let activeZoneCount: i32 = 0;

// The screen rectangle of the scroll box being drawn (between beginScrollBox and endScrollBox): the zones registered inside are cut to it,
// so a row scrolled under a header takes no tap.
let isScrollClipOpen = false;
let scrollClipLeft = 0;
let scrollClipTop = 0;
let scrollClipRight = 0;
let scrollClipBottom = 0;
// The window box a stage is drawn in by Stage.drawIn (a zinc:ui Canvas): its zones are cut to it too, outside a scroll box as after one.
let isBoxClipOpen = false;
let boxClipLeft = 0;
let boxClipTop = 0;
let boxClipRight = 0;
let boxClipBottom = 0;

/** The window rectangle the zones registered from now on are cut to (`isOpen` false: none). */
function cutZonesTo(isOpen: boolean, left: number, top: number, right: number, bottom: number): void {
  isScrollClipOpen = isOpen;
  scrollClipLeft = left;
  scrollClipTop = top;
  scrollClipRight = right;
  scrollClipBottom = bottom;
}

/** False when the local rectangle lies wholly outside the scroll box being drawn (always true outside one): skip drawing it. */
export function isLocalRectVisible(x: number, y: number, width: number, height: number): boolean {
  if (!isScrollClipOpen) return true;
  const left = x + uiState.offsetX;
  const top = y + uiState.offsetY;
  return left < scrollClipRight && left + width > scrollClipLeft && top < scrollClipBottom && top + height > scrollClipTop;
}

/** The next free zone, set to the local rectangle of the node being drawn. */
function nextZone(zoneId: string, x: number, y: number, width: number, height: number): TouchZone {
  if (activeZoneCount === activeZones.length) activeZones.push(new TouchZone());
  const zone = activeZones[activeZoneCount];
  zone.id = zoneId;
  zone.x = x + uiState.offsetX;
  zone.y = y + uiState.offsetY;
  zone.width = width;
  zone.height = height;
  zone.onTapCallback = null;
  zone.onDragCallback = null;
  zone.originX = uiState.offsetX;
  zone.originY = uiState.offsetY;
  zone.scrollBox = null;
  return zone;
}

/** Keeps the zone just filled by nextZone, cut to the scroll box being drawn; dropped when nothing of it is left. */
function acceptZone(zone: TouchZone): void {
  if (isScrollClipOpen) {
    const right = Math.min(zone.x + zone.width, scrollClipRight);
    const bottom = Math.min(zone.y + zone.height, scrollClipBottom);
    zone.x = Math.max(zone.x, scrollClipLeft);
    zone.y = Math.max(zone.y, scrollClipTop);
    zone.width = right - zone.x;
    zone.height = bottom - zone.y;
    if (zone.width <= 0 || zone.height <= 0) return;
  }
  activeZoneCount++;
}

/** Forgets the zones: called before a frame is drawn (Stage.frame does it). */
export function clearTouchZones(): void {
  activeZoneCount = 0;
}

/** Takes the zones of the frame on the screen out of the list, for a drawing whose zones must not count (an offscreen warm-up). */
export function takeTouchZones(): TouchZone[] {
  const zones = activeZones;
  zones.splice(activeZoneCount);
  activeZones = [];
  activeZoneCount = 0;
  return zones;
}

/** Puts back the zones taken by takeTouchZones, dropping the ones registered since. */
export function restoreTouchZones(zones: TouchZone[]): void {
  activeZones = zones;
  activeZoneCount = zones.length as i32;
}

/** Registers a tap zone at local coordinates of the node being drawn (call it from onDraw). */
export function registerTapZone(zoneId: string, x: number, y: number, width: number, height: number, onTapCallback: () => void): void {
  const zone = nextZone(zoneId, x, y, width, height);
  zone.onTapCallback = onTapCallback;
  acceptZone(zone);
}

/** Registers a drag zone at local coordinates of the node being drawn; the callback gets the pointer in those coordinates. */
export function registerDragZone(
  zoneId: string, x: number, y: number, width: number, height: number,
  onDragCallback: (localX: number, localY: number, phase: i32) => void
): void {
  const zone = nextZone(zoneId, x, y, width, height);
  zone.onDragCallback = onDragCallback;
  acceptZone(zone);
}

/**
 * The hit test: the topmost zone under the screen point, the last drawn first. `forTapsAndDrags` true looks for tap and drag zones,
 * false for scroll boxes only.
 */
export function findTopmostZoneAt(pointX: number, pointY: number, forTapsAndDrags: boolean): TouchZone | null {
  for (let index = activeZoneCount - 1; index >= 0; index--) {
    const zone = activeZones[index];
    if (zone.containsPoint(pointX, pointY)) {
      if (forTapsAndDrags && zone.scrollBox === null) return zone;
      if (!forTapsAndDrags && zone.scrollBox !== null) return zone;
    }
  }
  return null;
}

/** A wheel or two fingers on a trackpad: `deltaY` pixels (+ = up) scroll the scroll box under the point. False when there is none. */
export function scrollBoxUnderPointerByWheel(pointX: number, pointY: number, deltaY: number): boolean {
  const zone = findTopmostZoneAt(pointX, pointY, false);
  if (zone === null) return false;
  if (deltaY !== 0) {
    const scrollBox = (zone as TouchZone).scrollBox as ScrollBox;
    scrollBox.velocityY = 0;
    scrollBox.scrollY -= deltaY;
    scrollBox.clamp();
    uiState.dirty = true;
  }
  return true;
}

/** True while the zone `zoneId` is held down: draw it pressed. */
export function isZonePressed(zoneId: string): boolean {
  return uiState.pressedZoneId === zoneId;
}

/** Opens a scroll box at local coordinates: what is drawn until endScrollBox is clipped to it, and so are its zones. */
export function beginScrollBox(scrollBox: ScrollBox, x: number, y: number, width: number, height: number): void {
  const zone = nextZone('scroll', x, y, width, height);
  zone.scrollBox = scrollBox;
  activeZoneCount++;   // the viewport itself is never cut
  scrollBox.viewportHeight = height;
  clip(x, y, width, height);
  // ponytail: one level, a scroll box inside another would need a stack of rectangles (and inside drawIn's box it is cut to its own only)
  cutZonesTo(true, zone.x, zone.y, zone.x + width, zone.y + height);
}

/** Closes the scroll box opened by beginScrollBox. */
export function endScrollBox(): void {
  unclip();
  cutZonesTo(isBoxClipOpen, boxClipLeft, boxClipTop, boxClipRight, boxClipBottom);
}

// ----------------------------------------------------------------------------------------------------------------------------------------
// The pointer: taps, drags and scrolls routed to the zones
// ----------------------------------------------------------------------------------------------------------------------------------------

/** Pixels a finger moves before a press stops being a tap and starts scrolling. */
const TAP_SLOP_PIXELS = 12;
/** Pixels a wheel step scrolls. */
const WHEEL_STEP_PIXELS = 48;

let wasPointerDown = false;
let hasPointerMoved = false;
let pressX = 0;
let pressY = 0;
let previousPointerY = 0;
let scrollStartY = 0;
const heldDragZone = new TouchZone();
const heldTapZone = new TouchZone();
let isDragging = false;
let isTapping = false;
let heldScrollBox: ScrollBox | null = null;

/**
 * Routes one frame of the pointer to the zones of the last drawn frame: a press on a drag zone drags it (phases 0, 1, 2); a press and
 * release on a tap zone, with no movement past 12 pixels, taps it; a movement past 12 pixels over a scroll box scrolls it and flings it
 * on release. Stage.frame calls it with zinc:gfx's pointer; a program with gestures of its own writes its own from findTopmostZoneAt.
 */
export function routePointer(x: number, y: number, isDown: boolean, deltaSeconds: number): void {
  uiState.pointerX = x;
  uiState.pointerY = y;
  if (isDown && !wasPointerDown) {
    pressX = x;
    pressY = y;
    previousPointerY = y;
    hasPointerMoved = false;
    const hit = findTopmostZoneAt(x, y, true);
    isDragging = hit !== null && (hit as TouchZone).onDragCallback !== null;
    isTapping = hit !== null && !isDragging;
    if (isDragging) heldDragZone.copyFrom(hit as TouchZone);
    if (isTapping) heldTapZone.copyFrom(hit as TouchZone);
    uiState.pressedZoneId = hit !== null ? (hit as TouchZone).id : '';
    const scrollZone = findTopmostZoneAt(x, y, false);
    heldScrollBox = scrollZone !== null ? (scrollZone as TouchZone).scrollBox : null;
    if (heldScrollBox !== null) {
      (heldScrollBox as ScrollBox).velocityY = 0;
      scrollStartY = (heldScrollBox as ScrollBox).scrollY;
    }
    if (isDragging) heldDragZone.drag(x, y, 0);
    uiState.dirty = true;
  } else if (isDown) {
    if (isDragging) {
      heldDragZone.drag(x, y, 1);
      uiState.dirty = true;
    } else {
      if (!hasPointerMoved && (Math.abs(x - pressX) > TAP_SLOP_PIXELS || Math.abs(y - pressY) > TAP_SLOP_PIXELS)) {
        hasPointerMoved = true;
        uiState.pressedZoneId = '';
        uiState.dirty = true;
      }
      if (hasPointerMoved && heldScrollBox !== null) {
        const scrollBox = heldScrollBox as ScrollBox;
        scrollBox.scrollY = scrollStartY - (y - pressY);
        scrollBox.clamp();
        if (deltaSeconds > 0) scrollBox.velocityY = scrollBox.velocityY * 0.3 - ((y - previousPointerY) / deltaSeconds) * 0.7;
        uiState.dirty = true;
      }
    }
    previousPointerY = y;
  } else if (wasPointerDown) {
    if (isDragging) {
      heldDragZone.drag(x, y, 2);
    } else if (isTapping && !hasPointerMoved && heldTapZone.containsPoint(x, y) && heldTapZone.onTapCallback !== null) {
      (heldTapZone.onTapCallback as () => void)();
    }
    if (!hasPointerMoved && heldScrollBox !== null) (heldScrollBox as ScrollBox).velocityY = 0;
    isDragging = false;
    isTapping = false;
    uiState.pressedZoneId = '';
    uiState.dirty = true;
  }
  wasPointerDown = isDown;
}

// ----------------------------------------------------------------------------------------------------------------------------------------
// The display tree
// ----------------------------------------------------------------------------------------------------------------------------------------

/** A node of the scene: a position in its parent, a size, children, the hooks a subclass overrides, and the row/column layout. */
export class DisplayObject {
  /** A readable name, for debugging. */
  name: string = '';
  /** Position in the parent, in pixels. */
  x: number = 0;
  y: number = 0;
  /** Size in pixels; 0 takes the size the parent gives. */
  width: number = 0;
  height: number = 0;
  /** A 'row' or 'column' computes its height from its children. */
  autoHeight: boolean = false;
  /** False: no layout, no onUpdate, no onDraw, for it and its children. */
  visible: boolean = true;

  /** 'none' (children placed by their x and y), 'row' or 'column'. */
  direction: string = 'none';
  /** Pixels between two visible children of a row or a column. */
  gap: number = 0;
  paddingTop: number = 0;
  paddingRight: number = 0;
  paddingBottom: number = 0;
  paddingLeft: number = 0;
  /** The share of the free space it takes in a row or a column (0: its own size). */
  flex: number = 0;
  /** The children on the cross axis: 'start', 'center', 'end' or 'stretch'. */
  alignItems: string = 'start';

  parent: DisplayObject | null = null;
  /** True while it is in a tree whose root is a Stage. */
  isOnStage: boolean = false;
  /** The children, the first drawn first (under the next ones). */
  children: DisplayObject[] = [];

  constructor(name: string = '') {
    this.name = name;
  }

  setPaddingSymmetric(horizontal: number, vertical: number): DisplayObject {
    this.paddingLeft = horizontal;
    this.paddingRight = horizontal;
    this.paddingTop = vertical;
    this.paddingBottom = vertical;
    return this;
  }

  // The tree ---------------------------------------------------------------------------------------------------------------------------

  /** Adds `child` on top of the others (taking it from its former parent). */
  addChild(child: DisplayObject): DisplayObject {
    if (child.parent !== null) (child.parent as DisplayObject).removeChild(child);
    child.parent = this;
    this.children.push(child);
    if (this.isOnStage) child.notifyAddedToStage();
    if (!isFramePassRunning) uiState.dirty = true;
    return child;
  }

  /** Adds `child` at `index` of the children (0: under all the others). */
  addChildAt(child: DisplayObject, index: i32): DisplayObject {
    this.addChild(child);
    const at = Math.max(0, Math.min(index, this.children.length - 1)) as i32;
    for (let i = this.children.length - 1; i > at; i--) this.children[i] = this.children[i - 1];
    this.children[at] = child;
    return child;
  }

  removeChild(child: DisplayObject): DisplayObject {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parent = null;
      if (child.isOnStage) child.notifyRemovedFromStage();
      if (!isFramePassRunning) uiState.dirty = true;
    }
    return child;
  }

  removeChildAt(index: i32): DisplayObject {
    return this.removeChild(this.children[index]);
  }

  removeChildren(): void {
    while (this.children.length > 0) this.removeChild(this.children[this.children.length - 1]);
  }

  get numChildren(): i32 {
    return this.children.length;
  }

  getChildAt(index: i32): DisplayObject {
    return this.children[index];
  }

  /** The index of `child` among the children, -1 when it is not one. */
  getChildIndex(child: DisplayObject): i32 {
    return this.children.indexOf(child);
  }

  /** True when `node` is this one or lies anywhere under it (AS3's contains). */
  contains(node: DisplayObject): boolean {
    let current: DisplayObject | null = node;
    while (current !== null) {
      if (current === this) return true;
      current = (current as DisplayObject).parent;
    }
    return false;
  }

  /** The Stage at the root of its tree, null when it is not under one. */
  get stage(): Stage | null {
    let root: DisplayObject = this;
    while (root.parent !== null) root = root.parent as DisplayObject;
    return root instanceof Stage ? (root as Stage) : null;
  }

  /** The pointer in this node's coordinates. */
  get mouseX(): number {
    let left = 0;
    let node: DisplayObject | null = this;
    while (node !== null) {
      left += (node as DisplayObject).x;
      node = (node as DisplayObject).parent;
    }
    return uiState.pointerX - left;
  }

  get mouseY(): number {
    let top = 0;
    let node: DisplayObject | null = this;
    while (node !== null) {
      top += (node as DisplayObject).y;
      node = (node as DisplayObject).parent;
    }
    return uiState.pointerY - top;
  }

  // The hooks a subclass overrides --------------------------------------------------------------------------------------------------------

  /** It joined a tree under the Stage (its children are told after it): start what it needs (data, timers). */
  onAddedToStage(): void {}
  /** It left the Stage's tree (its children are told before it): stop what it started. */
  onRemovedFromStage(): void {}
  /** Every frame while it is visible, parents first: move things on; set uiState.dirty when what it shows changed. */
  onUpdate(deltaSeconds: number): void {}
  /** Before it is laid out: set its size and its values (text, visibility) in place, never add or remove children. */
  onMeasure(): void {}
  /** Draws it with zinc:gfx, (0, 0) at its corner, parents under children; registers its zones. */
  onDraw(localWidth: number, localHeight: number): void {}

  // The row/column layout ----------------------------------------------------------------------------------------------------------------

  computeLayout(availableWidth: number, availableHeight: number): void {
    this.onMeasure();
    const containerWidth = this.width > 0 ? this.width : availableWidth;
    const containerHeight = !this.autoHeight && this.height > 0 ? this.height : availableHeight;
    if (this.direction === 'row') {
      this.layoutHorizontalRow(containerWidth, containerHeight);
    } else if (this.direction === 'column') {
      this.layoutVerticalColumn(containerWidth, containerHeight);
    } else {
      for (let index = 0; index < this.children.length; index++) {
        const child = this.children[index];
        if (child.visible) {
          child.computeLayout(child.width > 0 ? child.width : containerWidth, child.height > 0 ? child.height : containerHeight);
        }
      }
    }
  }

  private layoutHorizontalRow(containerWidth: number, containerHeight: number): void {
    const innerWidth = Math.max(0, containerWidth - this.paddingLeft - this.paddingRight);
    const innerHeight = Math.max(0, containerHeight - this.paddingTop - this.paddingBottom);
    let visibleCount: i32 = 0;
    let totalFixedWidth = 0;
    let totalFlexWeight = 0;
    let maxChildCrossHeight = 0;

    // 1. the fixed children are laid out, the flex weights summed
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      if (!child.visible) continue;
      visibleCount++;
      if (child.flex > 0) {
        child.onMeasure();
        totalFlexWeight += child.flex;
      } else {
        child.computeLayout(innerWidth, innerHeight);
        totalFixedWidth += child.width;
      }
      maxChildCrossHeight = Math.max(maxChildCrossHeight, child.height);
    }
    if (visibleCount === 0) {
      if (this.autoHeight) this.height = this.paddingTop + this.paddingBottom;
      return;
    }
    const effectiveInnerHeight = this.autoHeight ? maxChildCrossHeight : innerHeight;
    if (this.autoHeight) this.height = effectiveInnerHeight + this.paddingTop + this.paddingBottom;
    const totalGapsWidth = this.gap * (visibleCount - 1);
    const remainingWidth = Math.max(0, innerWidth - totalFixedWidth - totalGapsWidth);

    // 2. the flex children share what is left
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      if (!child.visible) continue;
      if (child.flex > 0 && totalFlexWeight > 0) {
        child.width = (remainingWidth * child.flex) / totalFlexWeight;
        if (this.alignItems === 'stretch') child.height = effectiveInnerHeight;
        child.computeLayout(child.width, child.height > 0 ? child.height : effectiveInnerHeight);
      } else if (this.alignItems === 'stretch') {
        child.height = effectiveInnerHeight;
      }
    }

    // 3. positions
    let cursorX = this.paddingLeft;
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      if (!child.visible) continue;
      child.x = Math.round(cursorX);
      if (this.alignItems === 'center') {
        child.y = Math.round(this.paddingTop + (effectiveInnerHeight - child.height) / 2);
      } else if (this.alignItems === 'end') {
        child.y = Math.round(this.paddingTop + effectiveInnerHeight - child.height);
      } else {
        child.y = this.paddingTop;
      }
      cursorX += child.width + this.gap;
    }
  }

  private layoutVerticalColumn(containerWidth: number, containerHeight: number): void {
    const innerWidth = Math.max(0, containerWidth - this.paddingLeft - this.paddingRight);
    const innerHeight = Math.max(0, containerHeight - this.paddingTop - this.paddingBottom);
    let visibleCount: i32 = 0;
    let totalFixedHeight = 0;
    let totalFlexWeight = 0;

    // 1. the fixed children are laid out (an autoHeight column inside too), the flex weights summed
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      if (!child.visible) continue;
      if (this.alignItems === 'stretch') child.width = innerWidth;
      visibleCount++;
      if (child.flex > 0) {
        child.onMeasure();
        totalFlexWeight += child.flex;
      } else {
        child.computeLayout(innerWidth, innerHeight);
        totalFixedHeight += child.height;
      }
    }
    if (visibleCount === 0) {
      if (this.autoHeight) this.height = this.paddingTop + this.paddingBottom;
      return;
    }
    const totalGapsHeight = this.gap * (visibleCount - 1);
    const remainingHeight = Math.max(0, innerHeight - totalFixedHeight - totalGapsHeight);

    // 2. the flex children share what is left
    let occupiedMainHeight = totalGapsHeight;
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      if (!child.visible) continue;
      if (child.flex > 0 && totalFlexWeight > 0) {
        child.height = (remainingHeight * child.flex) / totalFlexWeight;
        if (this.alignItems === 'stretch') child.width = innerWidth;
        child.computeLayout(child.width > 0 ? child.width : innerWidth, child.height);
      } else if (this.alignItems === 'stretch') {
        child.width = innerWidth;
      }
      occupiedMainHeight += child.height;
    }
    if (this.autoHeight) this.height = occupiedMainHeight + this.paddingTop + this.paddingBottom;

    // 3. positions
    let cursorY = this.paddingTop;
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      if (!child.visible) continue;
      child.y = Math.round(cursorY);
      if (this.alignItems === 'center') {
        child.x = Math.round(this.paddingLeft + (innerWidth - child.width) / 2);
      } else if (this.alignItems === 'end') {
        child.x = Math.round(this.paddingLeft + innerWidth - child.width);
      } else {
        child.x = this.paddingLeft;
      }
      cursorY += child.height + this.gap;
    }
  }

  // The passes down the tree ---------------------------------------------------------------------------------------------------------------

  notifyAddedToStage(): void {
    if (this.isOnStage) return;
    this.isOnStage = true;
    this.onAddedToStage();
    for (let index = 0; index < this.children.length; index++) this.children[index].notifyAddedToStage();
  }

  notifyRemovedFromStage(): void {
    if (!this.isOnStage) return;
    for (let index = 0; index < this.children.length; index++) this.children[index].notifyRemovedFromStage();
    this.isOnStage = false;
    this.onRemovedFromStage();
  }

  /** Calls onUpdate on it and its visible children. */
  updateTree(deltaSeconds: number): void {
    if (!this.visible) return;
    this.onUpdate(deltaSeconds);
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      if (child.visible) child.updateTree(deltaSeconds);
    }
  }

  /**
   * Lays this node out in `availableWidth` x `availableHeight` and draws it, its parent's origin at (`parentWorldX`, `parentWorldY`):
   * one frame pass with this node as the root (the Stage, or a page drawn offscreen).
   */
  layoutAndRender(availableWidth: number, availableHeight: number, parentWorldX: number, parentWorldY: number): void {
    isFramePassRunning = true;
    this.computeLayout(availableWidth, availableHeight);
    this.renderTree(availableWidth, availableHeight, parentWorldX, parentWorldY);
    isFramePassRunning = false;
    resetTransform();
    uiState.offsetX = 0;
    uiState.offsetY = 0;
  }

  /** Draws it at its screen position, then its visible children; a subclass overrides it to clip or move what its children draw. */
  renderTree(parentWidth: number, parentHeight: number, parentWorldX: number, parentWorldY: number): void {
    if (!this.visible) return;
    const absoluteX = parentWorldX + this.x;
    const absoluteY = parentWorldY + this.y;
    setTransform(1, 0, 0, 1, absoluteX, absoluteY);
    uiState.offsetX = absoluteX;
    uiState.offsetY = absoluteY;
    const localWidth = this.width > 0 ? this.width : parentWidth;
    const localHeight = this.height > 0 ? this.height : parentHeight;
    this.onDraw(localWidth, localHeight);
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      if (child.visible) child.renderTree(localWidth, localHeight, absoluteX, absoluteY);
    }
  }
}

/** AS3's and OpenFL's name for a node that draws and holds children: the same as DisplayObject. */
export class Sprite extends DisplayObject {}

/** The root of the scene: the window's size, laid out then drawn. */
export class Stage extends DisplayObject {
  /** The background Stage.frame clears to (AS3's stage.color). */
  color: u32 = 0x000000;

  constructor() {
    super('Stage');
    this.isOnStage = true;
  }

  /** Lays out and draws the scene in `screenWidth` x `screenHeight`. */
  renderStage(screenWidth: number, screenHeight: number): void {
    this.width = screenWidth;
    this.height = screenHeight;
    this.layoutAndRender(screenWidth, screenHeight, 0, 0);
  }

  /**
   * One whole frame: the pointer and the wheel routed to the zones, onUpdate, the flings of the scroll boxes, then the layout and the
   * drawing only when something changed (else the previous picture is kept). Call it from zinc:gfx's onFrame.
   */
  frame(deltaSeconds: number): void {
    this.update(deltaSeconds);
    if (uiState.animating) uiState.dirty = true;
    if (!uiState.dirty) {
      keep();
      return;
    }
    uiState.dirty = false;
    uiState.animating = false;
    clearTouchZones();
    clear(this.color);
    this.renderStage(width(), height());
  }

  /**
   * The first half of a frame, without the drawing: the pointer and the wheel routed to the zones, onUpdate, the flings. `frame` calls
   * it; a scene inside a zinc:ui interface calls it from render's frame function, and draws with drawIn.
   */
  update(deltaSeconds: number): void {
    const x = pointerX();
    const y = pointerY();
    const isDown = pointerDown();
    routePointer(x, y, isDown, deltaSeconds);
    const wheelPixels = wheel() * WHEEL_STEP_PIXELS + scrollDY();
    if (!isDown && wheelPixels !== 0) scrollBoxUnderPointerByWheel(x, y, wheelPixels);
    this.updateTree(deltaSeconds);
    for (let index = 0; index < activeZoneCount; index++) {
      const scrollBox = activeZones[index].scrollBox;
      if (scrollBox !== null && !(isDown && scrollBox === heldScrollBox) && (scrollBox as ScrollBox).stepInertia(deltaSeconds)) uiState.dirty = true;
    }
  }

  /**
   * Lays out and draws the scene now in the window box (x, y, w, h), cut to it, its zones too: a scene inside a zinc:ui interface,
   * `<Canvas onDraw={(x, y, w, h) => stage.drawIn(x, y, w, h)} />`. The box's background is the Canvas's own (stage.color is not
   * painted), and it draws on every frame the Canvas does.
   */
  drawIn(x: number, y: number, w: number, h: number): void {
    uiState.dirty = false;
    uiState.animating = false;
    clearTouchZones();
    this.x = x;   // the stage's corner is the box's: mouseX and the zones count from it
    this.y = y;
    this.width = w;
    this.height = h;
    clip(x, y, w, h);
    isBoxClipOpen = true;
    boxClipLeft = x;
    boxClipTop = y;
    boxClipRight = x + w;
    boxClipBottom = y + h;
    cutZonesTo(true, x, y, x + w, y + h);
    this.layoutAndRender(w, h, 0, 0);
    isBoxClipOpen = false;
    cutZonesTo(false, 0, 0, 0, 0);
    unclip();
  }
}
