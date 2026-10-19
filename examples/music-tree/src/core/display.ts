// ============================================================================
// core/display.ts — AS3/Haxe display tree + light Flex layout engine
// ============================================================================
// This module combines:
// 1. An ActionScript 3 / Haxe style DisplayList (`DisplayObject`, `Stage`,
//    `addChild`, `removeChild`, local coordinates and lifecycle
//    `onAddedToStage` / `onRemovedFromStage` / `onUpdate` / `onDraw`).
// 2. An ultra-light Flexbox layout engine built right into
//    `DisplayObject` (`direction: 'none' | 'row' | 'column'`, `gap`, `padding`,
//    `flex`, `alignItems`, `justifyContent`, `autoWidth`, `autoHeight`).

import { setTransform, resetTransform } from 'zinc:gfx';
import { uiState } from './input';

/**
 * True while a layout and render pass runs (`layoutAndRender`). The tree changes made then (a page that mounts its
 * rows in `onMeasure`) are drawn by that same pass, so they never ask for another frame: only events set `dirty`.
 */
let isFramePassRunning = false;

/**
 * Base visual element of the display tree with built-in light Flexbox support.
 */
export class DisplayObject {
  /** Readable name of the node (for clarity and debugging). */
  name: string = '';

  /** Local X position relative to the parent. */
  x: number = 0;

  /** Local Y position relative to the parent. */
  y: number = 0;

  /** Width of the node in pixels. */
  width: number = 0;

  /** Height of the node in pixels. */
  height: number = 0;

  /** If `true`, the width of a 'row' container is computed from its children. */
  autoWidth: boolean = false;

  /** If `true`, the height of a 'column' container is computed from its children. */
  autoHeight: boolean = false;

  /** If `false`, the node is ignored by layout, `onUpdate` and `onDraw`. */
  visible: boolean = true;

  /** Logical opacity (0..1). */
  alpha: number = 1;

  // --------------------------------------------------------------------------
  // Properties of the light Flexbox layout engine
  // --------------------------------------------------------------------------

  /** `'none'` | `'row'` | `'column'` */
  direction: string = 'none';

  /** Spacing (in pixels) inserted automatically between two visible children. */
  gap: number = 0;

  /** Inner margins of the container (in pixels). */
  paddingTop: number = 0;
  paddingRight: number = 0;
  paddingBottom: number = 0;
  paddingLeft: number = 0;

  /** Flexible grow weight in a `'row'` or `'column'` parent (`0` = fixed). */
  flex: number = 0;

  /** Alignment on the cross axis: `'start'` | `'center'` | `'end'` | `'stretch'`. */
  alignItems: string = 'start';

  /** Distribution on the main axis: `'start'` | `'center'` | `'end'` | `'space-between'`. */
  justifyContent: string = 'start';

  // --------------------------------------------------------------------------
  // Relations in the display tree
  // --------------------------------------------------------------------------

  parent: DisplayObject | null = null;
  isOnStage: boolean = false;
  children: DisplayObject[] = [];

  constructor(name: string = '') {
    this.name = name;
  }

  // --------------------------------------------------------------------------
  // Fluent helpers to configure the layout
  // --------------------------------------------------------------------------

  setPadding(allSides: number): DisplayObject {
    this.paddingTop = allSides;
    this.paddingRight = allSides;
    this.paddingBottom = allSides;
    this.paddingLeft = allSides;
    return this;
  }

  setPaddingSymmetric(horizontal: number, vertical: number): DisplayObject {
    this.paddingLeft = horizontal;
    this.paddingRight = horizontal;
    this.paddingTop = vertical;
    this.paddingBottom = vertical;
    return this;
  }

  setSize(width: number, height: number): DisplayObject {
    this.width = width;
    this.height = height;
    this.autoWidth = false;
    this.autoHeight = false;
    return this;
  }

  // --------------------------------------------------------------------------
  // Hierarchy management (addChild / removeChild)
  // --------------------------------------------------------------------------

  addChild(child: DisplayObject): DisplayObject {
    if (child.parent !== null) {
      (child.parent as DisplayObject).removeChild(child);
    }
    child.parent = this;
    this.children.push(child);
    if (this.isOnStage) {
      child.notifyAddedToStage();
    }
    if (!isFramePassRunning) uiState.dirty = true;
    return child;
  }

  removeChild(child: DisplayObject): DisplayObject {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parent = null;
      if (child.isOnStage) {
        child.notifyRemovedFromStage();
      }
      if (!isFramePassRunning) uiState.dirty = true;
    }
    return child;
  }

  removeChildren(): void {
    while (this.children.length > 0) {
      const child = this.children[this.children.length - 1];
      this.removeChild(child);
    }
  }

  contains(child: DisplayObject): boolean {
    return this.children.indexOf(child) >= 0;
  }

  // --------------------------------------------------------------------------
  // Global (world) coordinates
  // --------------------------------------------------------------------------

  worldX(): number {
    let totalX = this.x;
    let current = this.parent;
    while (current !== null) {
      totalX += (current as DisplayObject).x;
      current = (current as DisplayObject).parent;
    }
    return totalX;
  }

  worldY(): number {
    let totalY = this.y;
    let current = this.parent;
    while (current !== null) {
      totalY += (current as DisplayObject).y;
      current = (current as DisplayObject).parent;
    }
    return totalY;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  onAddedToStage(): void {}
  onRemovedFromStage(): void {}
  onUpdate(deltaSeconds: number): void {}
  onMeasure(): void {}
  onDraw(localWidth: number, localHeight: number): void {}

  // --------------------------------------------------------------------------
  // Light Flexbox layout engine (Row / Column)
  // --------------------------------------------------------------------------

  computeLayout(availableWidth: number, availableHeight: number): void {
    this.onMeasure();

    const containerWidth = !this.autoWidth && this.width > 0 ? this.width : availableWidth;
    const containerHeight = !this.autoHeight && this.height > 0 ? this.height : availableHeight;

    if (this.direction === 'row') {
      this.layoutHorizontalRow(containerWidth, containerHeight);
    } else if (this.direction === 'column') {
      this.layoutVerticalColumn(containerWidth, containerHeight);
    } else {
      for (let index = 0; index < this.children.length; index++) {
        const child = this.children[index];
        if (child.visible) {
          child.computeLayout(
            child.width > 0 ? child.width : containerWidth,
            child.height > 0 ? child.height : containerHeight
          );
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

    // 1. Measure the fixed-size children and sum the flex weights
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
      if (this.autoWidth) this.width = this.paddingLeft + this.paddingRight;
      if (this.autoHeight) this.height = this.paddingTop + this.paddingBottom;
      return;
    }

    const effectiveInnerHeight = this.autoHeight ? maxChildCrossHeight : innerHeight;
    if (this.autoHeight) {
      this.height = effectiveInnerHeight + this.paddingTop + this.paddingBottom;
    }

    const totalGapsWidth = this.gap * (visibleCount - 1);
    const remainingWidth = Math.max(0, innerWidth - totalFixedWidth - totalGapsWidth);

    // 2. Assign the flexible widths and lay out the flex children
    let occupiedMainWidth = totalGapsWidth;
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      if (!child.visible) continue;

      if (child.flex > 0 && totalFlexWeight > 0) {
        child.width = (remainingWidth * child.flex) / totalFlexWeight;
        if (this.alignItems === 'stretch') {
          child.height = effectiveInnerHeight;
        }
        child.computeLayout(child.width, child.height > 0 ? child.height : effectiveInnerHeight);
      } else if (this.alignItems === 'stretch') {
        child.height = effectiveInnerHeight;
      }
      occupiedMainWidth += child.width;
    }

    if (this.autoWidth) {
      this.width = occupiedMainWidth + this.paddingLeft + this.paddingRight;
    }

    // 3. Horizontal and vertical positioning
    let cursorX = this.paddingLeft;
    let extraStepBetween = 0;

    if (this.justifyContent === 'center') {
      cursorX += Math.max(0, (innerWidth - occupiedMainWidth) / 2);
    } else if (this.justifyContent === 'end') {
      cursorX += Math.max(0, innerWidth - occupiedMainWidth);
    } else if (this.justifyContent === 'space-between' && visibleCount > 1) {
      extraStepBetween = Math.max(0, (innerWidth - occupiedMainWidth) / (visibleCount - 1));
    }

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

      cursorX += child.width + this.gap + extraStepBetween;
    }
  }

  private layoutVerticalColumn(containerWidth: number, containerHeight: number): void {
    const innerWidth = Math.max(0, containerWidth - this.paddingLeft - this.paddingRight);
    const innerHeight = Math.max(0, containerHeight - this.paddingTop - this.paddingBottom);

    let visibleCount: i32 = 0;
    let totalFixedHeight = 0;
    let totalFlexWeight = 0;
    let maxChildCrossWidth = 0;

    // 1. Measure and lay out recursively the fixed-height children (including autoHeight sub-VBoxes)
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      if (!child.visible) continue;
      if (this.alignItems === 'stretch') {
        child.width = innerWidth;
      }
      visibleCount++;
      if (child.flex > 0) {
        child.onMeasure();
        totalFlexWeight += child.flex;
      } else {
        child.computeLayout(innerWidth, innerHeight);
        totalFixedHeight += child.height;
      }
      maxChildCrossWidth = Math.max(maxChildCrossWidth, child.width);
    }

    if (visibleCount === 0) {
      if (this.autoWidth) this.width = this.paddingLeft + this.paddingRight;
      if (this.autoHeight) this.height = this.paddingTop + this.paddingBottom;
      return;
    }

    const effectiveInnerWidth = this.autoWidth ? maxChildCrossWidth : innerWidth;
    if (this.autoWidth) {
      this.width = effectiveInnerWidth + this.paddingLeft + this.paddingRight;
    }

    const totalGapsHeight = this.gap * (visibleCount - 1);
    const remainingHeight = Math.max(0, innerHeight - totalFixedHeight - totalGapsHeight);

    // 2. Assign the flexible heights
    let occupiedMainHeight = totalGapsHeight;
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      if (!child.visible) continue;

      if (child.flex > 0 && totalFlexWeight > 0) {
        child.height = (remainingHeight * child.flex) / totalFlexWeight;
        if (this.alignItems === 'stretch') {
          child.width = effectiveInnerWidth;
        }
        child.computeLayout(child.width > 0 ? child.width : effectiveInnerWidth, child.height);
      } else if (this.alignItems === 'stretch') {
        child.width = effectiveInnerWidth;
      }
      occupiedMainHeight += child.height;
    }

    if (this.autoHeight) {
      this.height = occupiedMainHeight + this.paddingTop + this.paddingBottom;
    }

    // 3. Vertical and horizontal positioning
    let cursorY = this.paddingTop;
    let extraStepBetween = 0;

    if (this.justifyContent === 'center') {
      cursorY += Math.max(0, (innerHeight - occupiedMainHeight) / 2);
    } else if (this.justifyContent === 'end') {
      cursorY += Math.max(0, innerHeight - occupiedMainHeight);
    } else if (this.justifyContent === 'space-between' && visibleCount > 1) {
      extraStepBetween = Math.max(0, (innerHeight - occupiedMainHeight) / (visibleCount - 1));
    }

    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      if (!child.visible) continue;

      child.y = Math.round(cursorY);
      if (this.alignItems === 'center') {
        child.x = Math.round(this.paddingLeft + (effectiveInnerWidth - child.width) / 2);
      } else if (this.alignItems === 'end') {
        child.x = Math.round(this.paddingLeft + effectiveInnerWidth - child.width);
      } else {
        child.x = this.paddingLeft;
      }

      cursorY += child.height + this.gap + extraStepBetween;
    }
  }

  // --------------------------------------------------------------------------
  // Internal propagation down the tree
  // --------------------------------------------------------------------------

  notifyAddedToStage(): void {
    if (this.isOnStage) return;
    this.isOnStage = true;
    this.onAddedToStage();
    for (let index = 0; index < this.children.length; index++) {
      this.children[index].notifyAddedToStage();
    }
  }

  notifyRemovedFromStage(): void {
    if (!this.isOnStage) return;
    for (let index = 0; index < this.children.length; index++) {
      this.children[index].notifyRemovedFromStage();
    }
    this.isOnStage = false;
    this.onRemovedFromStage();
  }

  updateTree(deltaSeconds: number): void {
    if (!this.visible) return;
    this.onUpdate(deltaSeconds);
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      if (child.visible) {
        child.updateTree(deltaSeconds);
      }
    }
  }

  /**
   * Lays this node out in `availableWidth` x `availableHeight` and draws it, its parent's origin at
   * (`parentWorldX`, `parentWorldY`): one frame pass with this node as the root (the stage, or a page drawn offscreen).
   */
  layoutAndRender(
    availableWidth: number,
    availableHeight: number,
    parentWorldX: number,
    parentWorldY: number
  ): void {
    isFramePassRunning = true;
    this.computeLayout(availableWidth, availableHeight);
    this.renderTree(availableWidth, availableHeight, parentWorldX, parentWorldY);
    isFramePassRunning = false;
    resetTransform();
    uiState.offsetX = 0;
    uiState.offsetY = 0;
  }

  renderTree(
    parentWidth: number,
    parentHeight: number,
    parentWorldX: number,
    parentWorldY: number
  ): void {
    if (!this.visible || this.alpha <= 0) return;

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
      if (child.visible) {
        child.renderTree(localWidth, localHeight, absoluteX, absoluteY);
      }
    }
  }
}

/**
 * The root scene (Stage), which first runs the layout pass (`computeLayout`)
 * then the render pass (`renderTree`).
 */
export class Stage extends DisplayObject {
  constructor() {
    super('Stage');
    this.isOnStage = true;
  }

  renderStage(screenWidth: number, screenHeight: number): void {
    this.width = screenWidth;
    this.height = screenHeight;
    this.layoutAndRender(screenWidth, screenHeight, 0, 0);
  }
}
