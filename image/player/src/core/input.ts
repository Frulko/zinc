// ============================================================================
// core/input.ts — Touch zones, dragging, scrolling and keyboard focus
// ============================================================================
// A copy of examples/music-tree/src/core/input.ts with keyboard focus added (Tab, the arrows and Enter move between and
// press the tap zones of the last frame: a Pi with a keyboard and no mouse). Since the screen is redrawn only when
// something changes (`uiState.dirty`), each component registers its interactive zones (`TouchZone`) while it draws in
// `onDraw()`. The input handler then tests the coordinates of the finger or mouse against the last element drawn back
// to the first (Z order).
import { clip, unclip } from 'zinc:gfx';

/**
 * Global render and pointer state shared by the display tree.
 */
class UiRenderState {
  /** Set when at least one element changed and the scene must be redrawn. */
  dirty: boolean = true;

  /** Current X coordinate of the pointer for this frame. */
  pointerX: number = 0;

  /** Current Y coordinate of the pointer for this frame. */
  pointerY: number = 0;

  /** Id of the zone currently held under the finger ('' if none). */
  pressedZoneId: string = '';

  /** Current X offset injected by the DisplayObject being drawn. */
  offsetX: number = 0;

  /** Current Y offset injected by the DisplayObject being drawn. */
  offsetY: number = 0;

  /** Set to `true` by an animated component (spinner, image fade, lava lamp) to ask for the next frame. */
  animating: boolean = false;

  /** Id of the zone the keyboard focus is on ('' if none): Tab and the arrows move it, Enter presses it. */
  focusedZoneId: string = '';
}

export const uiState = new UiRenderState();

/**
 * State of a vertical scrolling list with inertial scrolling (fling physics).
 */
export class ScrollBox {
  /** Current vertical scroll position (in pixels). */
  scrollY: number = 0;

  /** Total content height measured while drawing. */
  contentHeight: number = 0;

  /** Visible height of the clipping window (viewport). */
  viewportHeight: number = 0;

  /** Current speed of the inertial scroll (in pixels per second). */
  velocityY: number = 0;

  /** Maximum value `scrollY` can take. */
  maxScrollY(): number {
    return Math.max(0, this.contentHeight - this.viewportHeight);
  }

  /** Clamps `scrollY` to the bounds `[0, maxScrollY()]`. */
  clamp(): void {
    this.scrollY = Math.max(0, Math.min(this.maxScrollY(), this.scrollY));
  }

  /**
   * Advances the inertia after a finger fling.
   * Returns `true` while the list is moving.
   */
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

/**
 * A rectangular interactive zone registered while a component renders.
 */
export class TouchZone {
  id: string = '';
  x: number = 0;
  y: number = 0;
  width: number = 0;
  height: number = 0;

  /** Action fired on a short press (tap) with no movement. */
  onTapCallback: (() => void) | null = null;

  /**
   * Action fired on a drag (volume slider, swipe on a row).
   * `phase` is: 0 = initial press, 1 = move, 2 = release, 3 = cancelled in favour of the carousel.
   */
  onDragCallback: ((localX: number, localY: number, phase: i32) => void) | null = null;

  /** Associated scroll box if this zone is a scrollable container. */
  scrollBox: ScrollBox | null = null;

  /** False for zones Tab skips (the keys of the on-screen keyboard). */
  focusable: boolean = true;

  /** Checks whether the screen point `(pointX, pointY)` lies inside this rectangle. */
  containsPoint(pointX: number, pointY: number): boolean {
    return (
      pointX >= this.x &&
      pointX < this.x + this.width &&
      pointY >= this.y &&
      pointY < this.y + this.height
    );
  }
}

/**
 * The screen rectangle of the scroll box being drawn (between `beginScrollBox` and `endScrollBox`): the zones registered
 * inside are cut to it, so a row scrolled under a header takes no tap, and what lies outside need not be drawn.
 */
let isScrollClipOpen = false;
let scrollClipLeft = 0;
let scrollClipTop = 0;
let scrollClipRight = 0;
let scrollClipBottom = 0;

/** False when the local rectangle lies wholly outside the scroll box being drawn (always true outside a scroll box). */
export function isLocalRectVisible(x: number, y: number, width: number, height: number): boolean {
  if (!isScrollClipOpen) return true;
  const left = x + uiState.offsetX;
  const top = y + uiState.offsetY;
  return left < scrollClipRight && left + width > scrollClipLeft && top < scrollClipBottom && top + height > scrollClipTop;
}

/** Cuts a zone in screen coordinates to the scroll box being drawn; false when nothing of it is left. */
function clipZoneToScrollBox(zone: TouchZone): boolean {
  if (!isScrollClipOpen) return true;
  const right = Math.min(zone.x + zone.width, scrollClipRight);
  const bottom = Math.min(zone.y + zone.height, scrollClipBottom);
  zone.x = Math.max(zone.x, scrollClipLeft);
  zone.y = Math.max(zone.y, scrollClipTop);
  zone.width = right - zone.x;
  zone.height = bottom - zone.y;
  return zone.width > 0 && zone.height > 0;
}

/** List of the interactive zones collected during the last render of the tree. */
let activeZones: TouchZone[] = [];

/** Takes the zones of the frame on the screen out of the list, for a drawing whose zones must not count (the offscreen warm-up). */
export function takeTouchZones(): TouchZone[] {
  const zones = activeZones;
  activeZones = [];
  return zones;
}

/** Puts back the zones taken by `takeTouchZones`, dropping the ones registered since. */
export function restoreTouchZones(zones: TouchZone[]): void {
  activeZones = zones;
}

/** Clears the zones at the start of a new render of the scene. */
export function clearTouchZones(): void {
  activeZones = [];
}

/**
 * Registers a click/tap zone at the local coordinates `(x, y, width, height)`.
 * The global offset of the current `DisplayObject` (`uiState.offsetX/Y`) is added automatically.
 */
export function registerTapZone(
  zoneId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  onTapCallback: () => void,
  focusable: boolean = true
): void {
  const zone = new TouchZone();
  zone.id = zoneId;
  zone.x = x + uiState.offsetX;
  zone.y = y + uiState.offsetY;
  zone.width = width;
  zone.height = height;
  zone.onTapCallback = onTapCallback;
  zone.focusable = focusable;
  if (clipZoneToScrollBox(zone)) activeZones.push(zone);
}

/**
 * Registers a drag zone at the local coordinates `(x, y, width, height)`.
 * The coordinates passed to the callback are automatically brought back to the component's local frame.
 */
export function registerDragZone(
  zoneId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  onDragCallback: (localX: number, localY: number, phase: i32) => void
): void {
  const capturedOffsetX = uiState.offsetX;
  const capturedOffsetY = uiState.offsetY;
  const zone = new TouchZone();
  zone.id = zoneId;
  zone.x = x + capturedOffsetX;
  zone.y = y + capturedOffsetY;
  zone.width = width;
  zone.height = height;
  zone.onDragCallback = (screenX: number, screenY: number, phase: i32) => {
    onDragCallback(screenX - capturedOffsetX, screenY - capturedOffsetY, phase);
  };
  if (clipZoneToScrollBox(zone)) activeZones.push(zone);
}

/**
 * Finds the topmost interactive zone under the point `(pointX, pointY)`.
 * - If `forTapsAndDrags` is `true`, skips the scroll zones to find buttons/sliders.
 * - If `forTapsAndDrags` is `false`, looks only for scroll containers (`ScrollBox`).
 */
export function findTopmostZoneAt(pointX: number, pointY: number, forTapsAndDrags: boolean): TouchZone | null {
  for (let index = activeZones.length - 1; index >= 0; index--) {
    const zone = activeZones[index];
    if (zone.containsPoint(pointX, pointY)) {
      if (forTapsAndDrags && zone.scrollBox === null) return zone;
      if (!forTapsAndDrags && zone.scrollBox !== null) return zone;
    }
  }
  return null;
}

/**
 * A mouse wheel or two fingers on a trackpad over a scroll box: `deltaY` pixels (+ = up) scroll it, as a finger's drag
 * would. False when no scroll box is under the pointer (the page's own swipes get it).
 */
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

/** Tells whether the zone `zoneId` is currently held down by the user. */
export function isZonePressed(zoneId: string): boolean {
  return uiState.pressedZoneId === zoneId;
}

/**
 * Opens a vertical scroll zone and turns on the graphic clipping mask (`clip`).
 * Must always be closed by a call to `endScrollBox()`.
 */
export function beginScrollBox(
  scrollBox: ScrollBox,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const zone = new TouchZone();
  zone.id = 'scroll';
  zone.x = x + uiState.offsetX;
  zone.y = y + uiState.offsetY;
  zone.width = width;
  zone.height = height;
  zone.scrollBox = scrollBox;
  activeZones.push(zone);

  scrollBox.viewportHeight = height;
  clip(x, y, width, height);
  // ponytail: one level, a scroll box inside another would need a stack of rectangles
  isScrollClipOpen = true;
  scrollClipLeft = zone.x;
  scrollClipTop = zone.y;
  scrollClipRight = zone.x + width;
  scrollClipBottom = zone.y + height;
}

/** Closes the scroll zone opened by `beginScrollBox()`. */
export function endScrollBox(): void {
  unclip();
  isScrollClipOpen = false;
}

/** Tells whether the keyboard focus is on the zone `zoneId` (the control draws its focus ring). */
export function isZoneFocused(zoneId: string): boolean {
  return uiState.focusedZoneId === zoneId;
}

/** Moves the keyboard focus to the next (`step` 1) or previous (-1) focusable tap zone of the last frame, in drawing order. */
export function moveFocus(step: i32): void {
  let focusableCount: i32 = 0;
  let focusedIndex: i32 = -1;
  for (let index = 0; index < activeZones.length; index++) {
    const zone = activeZones[index];
    if (zone.onTapCallback === null || !zone.focusable) continue;
    if (zone.id === uiState.focusedZoneId) focusedIndex = focusableCount;
    focusableCount++;
  }
  if (focusableCount === 0) return;
  const target = focusedIndex < 0 ? (step > 0 ? 0 : focusableCount - 1) : (focusedIndex + step + focusableCount) % focusableCount;
  let seen: i32 = 0;
  for (let index = 0; index < activeZones.length; index++) {
    const zone = activeZones[index];
    if (zone.onTapCallback === null || !zone.focusable) continue;
    if (seen === target) {
      uiState.focusedZoneId = zone.id;
      break;
    }
    seen++;
  }
  uiState.dirty = true;
}

/** Presses the zone the keyboard focus is on; false when there is none on the screen. */
export function activateFocusedZone(): boolean {
  if (uiState.focusedZoneId === '') return false;
  for (let index = activeZones.length - 1; index >= 0; index--) {
    const zone = activeZones[index];
    if (zone.id === uiState.focusedZoneId && zone.onTapCallback !== null) {
      const onTap = zone.onTapCallback as () => void;
      onTap();
      uiState.dirty = true;
      return true;
    }
  }
  return false;
}
