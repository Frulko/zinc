// ============================================================================
// components/layout-nodes.ts — Light Flexbox containers and components (AS3/Haxe)
// ============================================================================
// This module provides ready-to-use nodes that use the light Flexbox
// layout engine of `DisplayObject`:
// - `VBox`                  : Vertical stacking (`direction = 'column'`)
// - `HBox`                  : Horizontal alignment (`direction = 'row'`)
// - `SpacerNode`            : Flexible spring (`flex = 1`)
// - `CardBox`               : `VBox` or `HBox` container with a rounded card background
// - `ScrollContainerNode`   : Automatic vertical scroll zone for a `VBox`
// - `LabelNode`             : Self-measuring or flexible text node (`flex = 1`)
// - `IconNode`              : Lucide vector icon node
// - `PillButtonNode`        : Self-measuring capsule button
// - `SegmentedControlNode`  : Self-measuring iOS tab selector

import { rrect, textWidth, fontAscent, setTransform } from 'zinc:gfx';
import {
  COLOR_CARD,
  COLOR_FILL,
  COLOR_TEXT_PRIMARY,
} from '../constants';
import { Fonts } from '../fonts';
import { DisplayObject } from '../core/display';
import { ScrollBox, beginScrollBox, endScrollBox, uiState } from '../core/input';
import { drawGlyph, drawLabel, drawSeparatorLine } from './primitives';
import { drawIconButton, drawPillButton, drawSegmentedControl } from './buttons';
import { drawSearchField } from './search-field';
import { drawActivitySpinner, drawSlider } from './slider';
import { drawCoverArt } from './cover';

/**
 * Vertical Flexbox container (`direction = 'column'`).
 * Stacks its children automatically from top to bottom with a `gap` spacing.
 */
export class VBox extends DisplayObject {
  constructor(gap: number = 0, name: string = 'VBox') {
    super(name);
    this.direction = 'column';
    this.alignItems = 'stretch';
    this.autoHeight = true;
    this.gap = gap;
  }
}

/**
 * Horizontal Flexbox container (`direction = 'row'`).
 * Lines up its children automatically from left to right, vertically centred by default.
 */
export class HBox extends DisplayObject {
  constructor(gap: number = 0, name: string = 'HBox') {
    super(name);
    this.direction = 'row';
    this.alignItems = 'center';
    this.autoHeight = true;
    this.gap = gap;
  }
}

/**
 * Invisible elastic element (`flex = 1`) that pushes the following elements
 * to the right (in an `HBox`) or down (in a `VBox`).
 */
export class SpacerNode extends DisplayObject {
  constructor(flexWeight: number = 1) {
    super('Spacer');
    this.flex = flexWeight;
  }
}

/**
 * Flexbox container (`'row'` or `'column'`) that automatically draws a rounded
 * card background (`COLOR_CARD`) over its whole surface computed by the layout.
 */
export class CardBox extends DisplayObject {
  backgroundColor: u32 = COLOR_CARD;
  backgroundAlpha: i32 = 255;
  cornerRadius: number = 14;

  constructor(direction: string = 'row', fixedHeight: number = 64, name: string = 'CardBox') {
    super(name);
    this.direction = direction;
    this.height = fixedHeight;
    this.alignItems = direction === 'row' ? 'center' : 'stretch';
  }

  override onDraw(localWidth: number, localHeight: number): void {
    rrect(
      0,
      0,
      localWidth,
      localHeight,
      this.cornerRadius,
      this.backgroundColor,
      this.backgroundAlpha
    );
  }
}

/**
 * Text node in the display tree.
 * - If `flex === 0` and `width === 0`, it measures the width of its text automatically.
 * - If `flex > 0` (or in a `stretch` `VBox`), it cleanly truncates the text with `…`
 *   to fit the width given by its Flexbox parent.
 */
export class LabelNode extends DisplayObject {
  fontId: i32;
  text: string;
  color: u32;
  fixedWidth: number = 0;

  constructor(
    fontId: i32,
    text: string = '',
    color: u32 = COLOR_TEXT_PRIMARY,
    fixedHeight: number = 0
  ) {
    super('Label');
    this.fontId = fontId;
    this.text = text;
    this.color = color;
    this.height = fixedHeight > 0 ? fixedHeight : fontAscent(fontId) + 4;
  }

  override onMeasure(): void {
    if (this.fixedWidth > 0) {
      this.width = this.fixedWidth;
    } else if (this.flex === 0) {
      this.width = textWidth(this.fontId, this.text, 0) + 2;
    }
  }

  override onDraw(localWidth: number, localHeight: number): void {
    if (this.text === '') return;
    const verticalOffset = Math.max(0, (localHeight - fontAscent(this.fontId)) / 2 - 1);
    drawLabel(
      this.fontId,
      0,
      verticalOffset,
      this.text,
      this.color,
      localWidth > 0 ? localWidth : 10000,
      255
    );
  }
}

/**
 * Lucide vector icon node of fixed size `iconSize × iconSize`.
 */
export class IconNode extends DisplayObject {
  iconName: string;
  iconSize: number;
  color: u32;
  strokeWidth: number = 2;

  constructor(iconName: string, iconSize: number = 24, color: u32 = COLOR_TEXT_PRIMARY) {
    super(`Icon_${iconName}`);
    this.iconName = iconName;
    this.iconSize = iconSize;
    this.color = color;
    this.width = iconSize;
    this.height = iconSize;
  }

  override onMeasure(): void {
    this.width = this.iconSize;
    this.height = this.iconSize;
  }

  override onDraw(localWidth: number, localHeight: number): void {
    if (this.iconName === '') return;
    const offsetX = (localWidth - this.iconSize) / 2;
    const offsetY = (localHeight - this.iconSize) / 2;
    drawGlyph(
      this.iconName,
      offsetX,
      offsetY,
      this.iconSize,
      this.color,
      255,
      this.strokeWidth
    );
  }
}

/** An activity spinner centred in its square; it animates only while visible. */
export class SpinnerNode extends DisplayObject {
  radius: number;

  constructor(radius: number = 12) {
    super('Spinner');
    this.radius = radius;
    this.width = radius * 2 + 4;
    this.height = radius * 2 + 4;
  }

  override onDraw(localWidth: number, localHeight: number): void {
    drawActivitySpinner(localWidth / 2, localHeight / 2, this.radius);
  }
}

/**
 * Capsule (pill) button node that computes its width automatically
 * from its label and icon during the `onMeasure()` pass.
 */
export class PillButtonNode extends DisplayObject {
  zoneId: string;
  label: string;
  iconName: string;
  foregroundColor: u32 = COLOR_TEXT_PRIMARY;
  backgroundColor: u32 = COLOR_FILL;
  onTap: () => void;

  constructor(
    zoneId: string,
    label: string,
    iconName: string,
    onTap: () => void,
    buttonHeight: number = 40
  ) {
    super(`PillButton_${zoneId}`);
    this.zoneId = zoneId;
    this.label = label;
    this.iconName = iconName;
    this.onTap = onTap;
    this.height = buttonHeight;
  }

  override onMeasure(): void {
    const horizontalPadding = 18;
    const iconAdvance = this.iconName !== '' ? 22 : 0;
    this.width = textWidth(Fonts.smallBold, this.label, 0) + horizontalPadding * 2 + iconAdvance;
  }

  override onDraw(localWidth: number, localHeight: number): void {
    drawPillButton(
      this.zoneId,
      0,
      0,
      this.label,
      this.foregroundColor,
      this.backgroundColor,
      this.onTap,
      this.iconName,
      this.height
    );
  }
}

/**
 * Self-measuring segmented control node (iOS tab bar).
 */
export class SegmentedControlNode extends DisplayObject {
  zoneIdPrefix: string;
  segmentLabels: string[];
  selectedIndex: i32 = 0;
  fixedSegmentWidth: number = 0;
  onSelectSegment: (index: i32) => void;

  constructor(
    zoneIdPrefix: string,
    segmentLabels: string[],
    onSelectSegment: (index: i32) => void,
    fixedSegmentWidth: number = 0
  ) {
    super(`Segmented_${zoneIdPrefix}`);
    this.zoneIdPrefix = zoneIdPrefix;
    this.segmentLabels = segmentLabels;
    this.onSelectSegment = onSelectSegment;
    this.fixedSegmentWidth = fixedSegmentWidth;
    this.height = 40;
  }

  override onMeasure(): void {
    let totalInnerWidth = 0;
    for (let index = 0; index < this.segmentLabels.length; index++) {
      const itemWidth =
        this.fixedSegmentWidth > 0
          ? this.fixedSegmentWidth
          : textWidth(Fonts.smallBold, this.segmentLabels[index], 0) + 32;
      totalInnerWidth += itemWidth;
    }
    this.width = totalInnerWidth + 4;
    this.height = 40;
  }

  override onDraw(localWidth: number, localHeight: number): void {
    drawSegmentedControl(
      this.zoneIdPrefix,
      0,
      0,
      this.segmentLabels,
      this.selectedIndex,
      this.onSelectSegment,
      this.fixedSegmentWidth
    );
  }
}

/**
 * Vertical scroll container that hosts a `contentBox` (`VBox`).
 * Automatically computes the total height `scrollBox.contentHeight` from
 * the children of the `contentBox` and applies the `-scrollBox.scrollY` offset as well
 * as the `beginScrollBox` / `endScrollBox` clipping mask.
 */
export class ScrollContainerNode extends DisplayObject {
  readonly scrollBox: ScrollBox;
  readonly contentBox: VBox;

  constructor(scrollBox: ScrollBox, gap: number = 0, name: string = 'ScrollContainer') {
    super(name);
    this.scrollBox = scrollBox;
    this.contentBox = new VBox(gap, `${name}_Content`);
    this.addChild(this.contentBox);
  }

  override computeLayout(availableWidth: number, availableHeight: number): void {
    const viewportWidth = this.width > 0 ? this.width : availableWidth;
    const viewportHeight = this.height > 0 ? this.height : availableHeight;
    this.width = viewportWidth;
    this.height = viewportHeight;

    this.contentBox.x = 0;
    this.contentBox.y = -this.scrollBox.scrollY;
    this.contentBox.width = viewportWidth;

    // Vertical layout of the contentBox
    this.contentBox.computeLayout(viewportWidth, viewportHeight);

    // Measure the total height taken by the contentBox's children
    let maxChildBottom = this.contentBox.paddingTop;
    for (let index = 0; index < this.contentBox.children.length; index++) {
      const child = this.contentBox.children[index];
      if (!child.visible) continue;
      maxChildBottom = Math.max(maxChildBottom, child.y + child.height);
    }
    this.scrollBox.contentHeight = maxChildBottom + this.contentBox.paddingBottom;
  }

  override renderTree(
    parentWidth: number,
    parentHeight: number,
    parentWorldX: number,
    parentWorldY: number
  ): void {
    if (!this.visible) return;

    const absoluteX = parentWorldX + this.x;
    const absoluteY = parentWorldY + this.y;
    const localWidth = this.width > 0 ? this.width : parentWidth;
    const localHeight = this.height > 0 ? this.height : parentHeight;

    setTransform(1, 0, 0, 1, absoluteX, absoluteY);
    uiState.offsetX = absoluteX;
    uiState.offsetY = absoluteY;
    beginScrollBox(this.scrollBox, 0, 0, localWidth, localHeight);
    super.renderTree(localWidth, localHeight, parentWorldX, parentWorldY);
    endScrollBox();
  }
}

/**
 * Horizontal Flexbox header bar of a page (`HBox`):
 * Puts the large title on the left, a stretchable `SpacerNode(1)` in the middle,
 * and the action buttons or segmented controls aligned to the right.
 */
export class PageHeaderBarNode extends HBox {
  readonly titleLabel: LabelNode;
  readonly spacer: SpacerNode;

  constructor(title: string, gap: number = 14) {
    super(gap, `PageHeader_${title}`);
    this.y = 30;
    this.height = 44;
    this.autoHeight = false;
    this.alignItems = 'center';

    this.titleLabel = new LabelNode(Fonts.hero, title, COLOR_TEXT_PRIMARY, 40);
    this.spacer = new SpacerNode(1);

    this.addChild(this.titleLabel);
    this.addChild(this.spacer);
  }
}

/**
 * Search field as a `DisplayObject` node that can be inserted
 * directly in a `VBox` or placed at the top of a page.
 */
export class SearchFieldNode extends DisplayObject {
  placeholder: string;
  currentText: string = '';
  isTypingActive: boolean = false;
  onFocusField: () => void;
  onClearText: () => void;

  constructor(
    placeholder: string,
    onFocusField: () => void,
    onClearText: () => void
  ) {
    super('SearchField');
    this.placeholder = placeholder;
    this.onFocusField = onFocusField;
    this.onClearText = onClearText;
    this.height = 46;
  }

  override onDraw(localWidth: number, localHeight: number): void {
    drawSearchField(
      0,
      0,
      localWidth,
      this.placeholder,
      this.currentText,
      this.isTypingActive,
      this.onFocusField,
      this.onClearText
    );
  }
}

/**
 * 1-pixel horizontal separator line that stretches over the whole width of its parent.
 */
export class SeparatorNode extends DisplayObject {
  insetLeft: number = 0;
  insetRight: number = 0;

  constructor(insetLeft: number = 0, insetRight: number = 0) {
    super('Separator');
    this.height = 1;
    this.insetLeft = insetLeft;
    this.insetRight = insetRight;
  }

  override onDraw(localWidth: number, localHeight: number): void {
    const lineWidth = Math.max(0, localWidth - this.insetLeft - this.insetRight);
    if (lineWidth > 0) {
      drawSeparatorLine(this.insetLeft, 0, lineWidth);
    }
  }
}

/**
 * Horizontal slider (`Slider`) as a Flexbox node (often used with `flex = 1` in an `HBox`).
 */
export class SliderNode extends DisplayObject {
  zoneId: string;
  normalizedValue: number = 0;
  fillColor: u32 = 0xffffff;
  trackThickness: number = 6;
  alwaysShowKnob: boolean = true;
  onChange: (newValue: number, isReleased: boolean) => void;

  constructor(
    zoneId: string,
    fillColor: u32,
    onChange: (newValue: number, isReleased: boolean) => void,
    trackThickness: number = 6,
    alwaysShowKnob: boolean = true
  ) {
    super(`Slider_${zoneId}`);
    this.zoneId = zoneId;
    this.fillColor = fillColor;
    this.onChange = onChange;
    this.trackThickness = trackThickness;
    this.alwaysShowKnob = alwaysShowKnob;
    this.height = 28;
  }

  override onDraw(localWidth: number, localHeight: number): void {
    if (localWidth <= 0) return;
    drawSlider(
      this.zoneId,
      0,
      localHeight / 2,
      localWidth,
      this.normalizedValue,
      this.fillColor,
      this.onChange,
      this.trackThickness,
      this.alwaysShowKnob
    );
  }
}

/**
 * Round icon button as a fixed-size Flexbox node.
 */
export class IconButtonNode extends DisplayObject {
  zoneId: string;
  iconName: string;
  iconSize: number;
  iconColor: u32;
  backgroundColor: u32 = 0;
  backgroundAlpha: i32 = 0;
  onTap: () => void;

  constructor(
    zoneId: string,
    iconName: string,
    iconSize: number,
    iconColor: u32,
    onTap: () => void,
    boxSize: number = 36
  ) {
    super(`IconButton_${zoneId}`);
    this.zoneId = zoneId;
    this.iconName = iconName;
    this.iconSize = iconSize;
    this.iconColor = iconColor;
    this.onTap = onTap;
    this.width = boxSize;
    this.height = boxSize;
  }

  override onDraw(localWidth: number, localHeight: number): void {
    drawIconButton(
      this.zoneId,
      this.iconName,
      localWidth / 2,
      localHeight / 2,
      this.iconSize,
      this.iconColor,
      this.onTap,
      this.backgroundColor,
      this.backgroundAlpha
    );
  }
}

/**
 * Square album cover or station logo (`size × size`) as a Flexbox node.
 */
export class CoverArtNode extends DisplayObject {
  imageUrl: string = '';
  title: string = '';
  size: number;
  cornerRadius: number;
  isStationLogo: boolean = false;

  constructor(size: number, cornerRadius: number = 8, isStationLogo: boolean = false) {
    super('CoverArt');
    this.size = size;
    this.cornerRadius = cornerRadius;
    this.isStationLogo = isStationLogo;
    this.width = size;
    this.height = size;
  }

  override onMeasure(): void {
    this.width = this.size;
    this.height = this.size;
  }

  override onDraw(localWidth: number, localHeight: number): void {
    drawCoverArt(
      this.imageUrl,
      this.title,
      0,
      0,
      this.size,
      this.cornerRadius,
      this.isStationLogo
    );
  }
}
