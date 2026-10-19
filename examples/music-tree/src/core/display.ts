// ============================================================================
// core/display.ts — AS3/Haxe display tree + light Flex layout engine
// ============================================================================
// This module combines:
// 1. An ActionScript 3 / Haxe style DisplayList (`DisplayObject`, `Stage`,
//    `addChild`, `removeChild`, local coordinates and lifecycle
//    `onAddedToStage` / `onRemovedFromStage` / `onUpdate` / `onDraw`).
// 2. An ultra-light Flexbox layout engine built right into
//    `DisplayObject` (`direction: 'none' | 'row' | 'column'`, `gap`, `padding`,
//    `flex`, `alignItems`, `autoHeight`).

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

  /** If `true`, the height of a 'column' container is computed from its children. */
  autoHeight: boolean = false;

  /** If `false`, the node is ignored by layout, `onUpdate` and `onDraw`. */
  visible: boolean = true;

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

  setPaddingSymmetric(horizontal: number, vertical: number): DisplayObject {
    this.paddingLeft = horizontal;
    this.paddingRight = horizontal;
    this.paddingTop = vertical;
    this.paddingBottom = vertical;
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
    }

    // 3. Horizontal and vertical positioning
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
    }

    if (visibleCount === 0) {
      if (this.autoHeight) this.height = this.paddingTop + this.paddingBottom;
      return;
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
          child.width = innerWidth;
        }
        child.computeLayout(child.width > 0 ? child.width : innerWidth, child.height);
      } else if (this.alignItems === 'stretch') {
        child.width = innerWidth;
      }
      occupiedMainHeight += child.height;
    }

    if (this.autoHeight) {
      this.height = occupiedMainHeight + this.paddingTop + this.paddingBottom;
    }

    // 3. Vertical and horizontal positioning
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
