// ============================================================================
// components/slider.ts — Horizontal slider and loading indicator
// ============================================================================

import { rrect, shadow, stroke } from 'zinc:gfx';
import { COLOR_TEXT_SECONDARY } from '../constants';
import { registerDragZone, isZonePressed, isLocalRectVisible, uiState } from 'zinc:stage';

/**
 * Draws a horizontal slider whose value is between `0` and `1`.
 * - If `alwaysShowKnob` is `false` (e.g. a track's progress bar), the round
 *   knob shows only while the user holds the slider.
 * - `onChange(newValue, isReleased)` is called continuously during the drag and with
 *   `isReleased = true` when the finger lifts.
 */
export function drawSlider(
  zoneId: string,
  x: number,
  y: number,
  width: number,
  normalizedValue: number,
  fillColor: u32,
  onChange: (newValue: number, isReleased: boolean) => void,
  trackThickness: number = 6,
  alwaysShowKnob: boolean = true
): void {
  const clampedValue = Math.max(0, Math.min(1, normalizedValue));
  const isActive = isZonePressed(zoneId);
  const currentThickness = isActive ? trackThickness + 2 : trackThickness;

  rrect(x, y - currentThickness / 2, width, currentThickness, currentThickness / 2, 0xffffff, 50);
  if (clampedValue > 0) {
    rrect(
      x,
      y - currentThickness / 2,
      Math.max(currentThickness, width * clampedValue),
      currentThickness,
      currentThickness / 2,
      fillColor,
      255
    );
  }

  if (alwaysShowKnob || isActive) {
    const knobRadius = isActive ? 15 : 12;
    const knobX = x + width * clampedValue;
    shadow(knobX - knobRadius, y - knobRadius + 2, knobRadius * 2, knobRadius * 2, knobRadius, 8, 0x000000, 90);
    rrect(knobX - knobRadius, y - knobRadius, knobRadius * 2, knobRadius * 2, knobRadius, 0xffffff, 255);
  }

  registerDragZone(zoneId, x - 16, y - 26, width + 32, 52, (pointerX: number, pointerY: number, phase: i32) => {
    const updatedRatio = Math.max(0, Math.min(1, (pointerX - x) / width));
    onChange(updatedRatio, phase === 2);
  });
}

/**
 * Draws the 12-spoke rotating activity indicator (iOS style) centred at `(centerX, centerY)`.
 * Turns on `uiState.animating` automatically to keep the frames refreshing.
 */
export function drawActivitySpinner(
  centerX: number,
  centerY: number,
  radius: number,
  color: u32 = COLOR_TEXT_SECONDARY
): void {
  // Scrolled out of its list (the "more pages" spinner below the last row): neither drawn nor animated
  if (!isLocalRectVisible(centerX - radius, centerY - radius, radius * 2, radius * 2)) return;
  const activeStep = Math.floor(performance.now() / 83) % 12;
  for (let spokeIndex = 0; spokeIndex < 12; spokeIndex++) {
    const angle = (spokeIndex / 12) * Math.PI * 2;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const trailDistance = (spokeIndex - activeStep + 12) % 12;
    const lineWidth = Math.max(2, radius * 0.18);

    const startX = centerX + cosAngle * radius * 0.5;
    const startY = centerY + sinAngle * radius * 0.5;
    const endX = centerX + cosAngle * radius;
    const endY = centerY + sinAngle * radius;
    stroke([startX, startY, endX, endY], lineWidth, color, Math.round(255 - trailDistance * 17) as i32, false);
  }
  uiState.animating = true;
}
