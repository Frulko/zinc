// ============================================================================
// pages/home/clock-faces.ts — Drawing of the clock faces and the lava lamp
// ============================================================================
// This module holds the graphic renderings of the StandBy clock:
// - Circle arcs with rounded ends (`drawRingArc`)
// - Analog watch face, Apple Watch style (`drawAnalogWatchFace`)
// - Lava lamp made of metaballs on the GPU (GLSL shader) or CPU (`drawLavaLampBackground`)
// - Mechanical rolling-flap odometer (`drawOdometerDigits`).

import {
  stroke,
  rrect,
  rect,
  imageFromPixels,
  updateImage,
  drawImageRect,
  ImageFlag,
  shaderProgram,
  drawShader,
  shaderAvailable,
  clip,
  unclip,
  fontAscent,
} from 'zinc:gfx';
import gsap from 'gsap';
import {
  COLOR_ORANGE,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_TERTIARY,
  RING_COLORS,
} from '../../constants';
import { FONT_ODOMETER_DIGIT, Fonts } from '../../fonts';
import { uiState } from 'zinc:stage';
import { drawCenteredText } from '../../components/primitives';

/**
 * Draws a circle arc starting at 12 o'clock, clockwise, over a fraction `turnRatio` (0..1)
 * of the full turn, with a thickness `strokeWidth` and rounded ends.
 */
export function drawRingArc(
  centerX: number,
  centerY: number,
  radius: number,
  strokeWidth: number,
  turnRatio: number,
  color: u32,
  alpha: i32
): void {
  if (turnRatio <= 0) return;
  const clampedTurn = Math.min(1, turnRatio);
  const segmentCount = Math.max(2, Math.ceil(clampedTurn * 96)) as i32;
  const points: number[] = [];
  const isFullCircle = clampedTurn >= 1;
  const limit = isFullCircle ? segmentCount : segmentCount + 1;

  for (let index = 0; index < limit; index++) {
    const angle = ((index / segmentCount) * clampedTurn - 0.25) * Math.PI * 2;
    points.push(centerX + Math.cos(angle) * radius);
    points.push(centerY + Math.sin(angle) * radius);
  }

  if (isFullCircle) {
    stroke(points, strokeWidth, color, alpha, true);
    return;
  }

  stroke(points, strokeWidth, color, alpha, false);
  rrect(
    points[0] - strokeWidth / 2,
    points[1] - strokeWidth / 2,
    strokeWidth,
    strokeWidth,
    strokeWidth / 2,
    color,
    alpha
  );
  rrect(
    points[segmentCount * 2] - strokeWidth / 2,
    points[segmentCount * 2 + 1] - strokeWidth / 2,
    strokeWidth,
    strokeWidth,
    strokeWidth / 2,
    color,
    alpha
  );
}

/**
 * Draws a watch hand at the turn fraction `turnRatio`,
 * going from `tailLength` behind the axis to `tipLength` in front.
 */
function drawWatchHand(
  centerX: number,
  centerY: number,
  turnRatio: number,
  tailLength: number,
  tipLength: number,
  strokeWidth: number,
  color: u32
): void {
  const angle = (turnRatio - 0.25) * Math.PI * 2;
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  const startX = centerX - cosAngle * tailLength;
  const startY = centerY - sinAngle * tailLength;
  const endX = centerX + cosAngle * tipLength;
  const endY = centerY + sinAngle * tipLength;

  stroke([startX, startY, endX, endY], strokeWidth, color, 255, false);
  rrect(startX - strokeWidth / 2, startY - strokeWidth / 2, strokeWidth, strokeWidth, strokeWidth / 2, color, 255);
  rrect(endX - strokeWidth / 2, endY - strokeWidth / 2, strokeWidth, strokeWidth, strokeWidth / 2, color, 255);
}

/**
 * Draws a complete analog watch face (minute ticks, hour numerals,
 * double-body hour and minute hands and an orange seconds hand).
 */
export function drawAnalogWatchFace(
  centerX: number,
  centerY: number,
  radius: number,
  hours: number,
  minutes: number,
  seconds: number
): void {
  rrect(centerX - radius, centerY - radius, radius * 2, radius * 2, radius, 0x0e0e10, 255);

  for (let tickIndex = 0; tickIndex < 60; tickIndex++) {
    const angle = (tickIndex / 60 - 0.25) * Math.PI * 2;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const isHourMark = tickIndex % 5 === 0;
    const innerRadius = radius * (isHourMark ? 0.87 : 0.92);
    const outerRadius = radius * 0.96;

    stroke(
      [
        centerX + cosAngle * innerRadius,
        centerY + sinAngle * innerRadius,
        centerX + cosAngle * outerRadius,
        centerY + sinAngle * outerRadius,
      ],
      isHourMark ? 5 : 2,
      isHourMark ? COLOR_TEXT_PRIMARY : COLOR_TEXT_TERTIARY,
      255,
      false
    );
  }

  const numeralFont = Fonts.title;
  const numeralAscent = fontAscent(numeralFont);
  for (let hourNumber = 1; hourNumber <= 12; hourNumber++) {
    const angle = (hourNumber / 12 - 0.25) * Math.PI * 2;
    drawCenteredText(
      numeralFont,
      centerX + Math.cos(angle) * radius * 0.74,
      centerY + Math.sin(angle) * radius * 0.74 - numeralAscent / 2 - 2,
      '' + hourNumber,
      COLOR_TEXT_PRIMARY
    );
  }

  const hourTurn = ((hours % 12) + minutes / 60) / 12;
  const minuteTurn = (minutes + seconds / 60) / 60;

  drawWatchHand(centerX, centerY, hourTurn, 0, radius * 0.12, 5, COLOR_TEXT_PRIMARY);
  drawWatchHand(centerX, centerY, hourTurn, -radius * 0.12, radius * 0.5, 13, COLOR_TEXT_PRIMARY);

  drawWatchHand(centerX, centerY, minuteTurn, 0, radius * 0.12, 5, COLOR_TEXT_PRIMARY);
  drawWatchHand(centerX, centerY, minuteTurn, -radius * 0.12, radius * 0.84, 13, COLOR_TEXT_PRIMARY);

  rrect(centerX - 9, centerY - 9, 18, 18, 9, COLOR_TEXT_PRIMARY, 255);
  drawWatchHand(centerX, centerY, seconds / 60, radius * 0.16, radius * 0.93, 3, COLOR_ORANGE);
  rrect(centerX - 6, centerY - 6, 12, 12, 6, COLOR_ORANGE, 255);
  rrect(centerX - 2.5, centerY - 2.5, 5, 5, 2.5, 0x000000, 255);
}

// ----------------------------------------------------------------------------
// Lava lamp (GPU / CPU metaballs)
// ----------------------------------------------------------------------------
const LAVA_GRID_WIDTH: i32 = 80;
const LAVA_GRID_HEIGHT: i32 = 60;
const LAVA_BLOB_COUNT: i32 = 4;

const LAVA_COLOR_PALETTES: number[][][] = [
  [[200, 14, 63], [214, 120, 8], [96, 48, 204], [24, 170, 180]],    // Lava
  [[190, 20, 20], [220, 90, 10], [230, 160, 20], [120, 10, 60]],    // Magma
  [[10, 90, 200], [20, 170, 190], [90, 60, 200], [10, 40, 120]],    // Ocean
  [[60, 200, 40], [190, 210, 20], [20, 150, 110], [10, 90, 60]],    // Acid
  [[220, 60, 150], [240, 120, 90], [150, 60, 200], [90, 30, 120]],  // Candy
];

export const LAVA_PALETTE_NAMES: string[] = ['Lave', 'Magma', 'Océan', 'Acide', 'Bonbon'];

let currentLavaPaletteIndex: i32 = 0;

export function getLavaLampPaletteIndex(): i32 {
  return currentLavaPaletteIndex;
}

export function setLavaLampPaletteIndex(index: i32): void {
  currentLavaPaletteIndex = index % LAVA_COLOR_PALETTES.length;
}

const LAVA_FRAGMENT_SHADER = shaderProgram(
  `
void main() {
  float px = v_uv.x * ${LAVA_GRID_WIDTH / LAVA_GRID_HEIGHT}, v = 1.0 - v_uv.y, field = 0.0;
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 b = u_p[i];
    float dx = px - b.x, dy = (v - b.y) * b.w, f = b.z / (dx * dx + dy * dy + 0.0008);
    field += f; c += u_p[4 + i].rgb * f;
  }
  c = field > 0.0001 ? c / field : vec3(0.0);
  float body = clamp((field - 0.85) / 0.4, 0.0, 1.0), glow = clamp((field - 0.15) / 0.7, 0.0, 1.0);
  float lit = 0.7 + 0.2 * clamp((field - 1.2) / 1.8, 0.0, 1.0), gr = body * body * (3.0 - 2.0 * body);
  vec3 bg = u_p[4].rgb * (0.05 + (1.0 - v) * 0.13);
  gl_FragColor = vec4(min((bg + c * glow * 0.22) * (1.0 - gr) + c * lit * gr, vec3(1.0)), 1.0);
}`,
  4
);

const lavaShaderUniforms: number[] = [];
const lavaCpuPixelsRgba: u8[] = [];
let lavaCpuTextureId: i32 = -1;

/**
 * Draws the lava lamp animation over the whole `(width, height)` surface.
 */
export function drawLavaLampBackground(width: number, height: number): void {
  const elapsedSeconds = (performance.now() / 1000) % 1200;
  const aspect = LAVA_GRID_WIDTH / LAVA_GRID_HEIGHT;
  const paletteColors = LAVA_COLOR_PALETTES[currentLavaPaletteIndex];

  const blobCenterX: number[] = [];
  const blobCenterY: number[] = [];
  const blobRadiusSquared: number[] = [];
  const blobStretch: number[] = [];

  for (let blobIndex = 0; blobIndex < LAVA_BLOB_COUNT; blobIndex++) {
    const speedFactor = 1 + 0.31 * blobIndex;
    blobCenterX.push(
      aspect * (0.18 + (0.64 * blobIndex) / (LAVA_BLOB_COUNT - 1)) +
        0.07 * Math.sin(elapsedSeconds * 0.17 + blobIndex * 1.9)
    );
    blobCenterY.push(
      0.5 +
        0.4 *
          Math.sin(elapsedSeconds * 0.13 * speedFactor + blobIndex * 2.1) *
          Math.cos(elapsedSeconds * 0.05 + blobIndex)
    );
    const radius = 0.12 + 0.03 * Math.sin(elapsedSeconds * 0.21 + blobIndex * 1.3);
    blobRadiusSquared.push(radius * radius);
    blobStretch.push(
      0.8 + 0.25 * Math.sin(elapsedSeconds * 0.13 * speedFactor + blobIndex * 2.1 + 1)
    );
  }

  if (shaderAvailable()) {
    lavaShaderUniforms.length = 0;
    for (let blobIndex = 0; blobIndex < LAVA_BLOB_COUNT; blobIndex++) {
      lavaShaderUniforms.push(blobCenterX[blobIndex]);
      lavaShaderUniforms.push(blobCenterY[blobIndex]);
      lavaShaderUniforms.push(blobRadiusSquared[blobIndex]);
      lavaShaderUniforms.push(blobStretch[blobIndex]);
    }
    for (let blobIndex = 0; blobIndex < LAVA_BLOB_COUNT; blobIndex++) {
      lavaShaderUniforms.push(paletteColors[blobIndex][0] / 255);
      lavaShaderUniforms.push(paletteColors[blobIndex][1] / 255);
      lavaShaderUniforms.push(paletteColors[blobIndex][2] / 255);
      lavaShaderUniforms.push(0);
    }
    drawShader(LAVA_FRAGMENT_SHADER, 0, 0, width, height, lavaShaderUniforms);
    uiState.animating = true;
    return;
  }

  // CPU fallback for platforms without shaders (e.g. HP TouchPad on webOS)
  lavaCpuPixelsRgba.length = 0;
  for (let gridY = 0; gridY < LAVA_GRID_HEIGHT; gridY++) {
    const normalizedV = 1 - gridY / (LAVA_GRID_HEIGHT - 1);
    for (let gridX = 0; gridX < LAVA_GRID_WIDTH; gridX++) {
      const normalizedU = (gridX / LAVA_GRID_WIDTH) * aspect;
      let fieldStrength = 0;
      let weightedRed = 0;
      let weightedGreen = 0;
      let weightedBlue = 0;

      for (let blobIndex = 0; blobIndex < LAVA_BLOB_COUNT; blobIndex++) {
        const deltaX = normalizedU - blobCenterX[blobIndex];
        const deltaY = (normalizedV - blobCenterY[blobIndex]) * blobStretch[blobIndex];
        const contribution =
          blobRadiusSquared[blobIndex] / (deltaX * deltaX + deltaY * deltaY + 0.0008);
        fieldStrength += contribution;
        weightedRed += paletteColors[blobIndex][0] * contribution;
        weightedGreen += paletteColors[blobIndex][1] * contribution;
        weightedBlue += paletteColors[blobIndex][2] * contribution;
      }

      const inverseField = fieldStrength > 0.0001 ? 1 / fieldStrength : 0;
      weightedRed *= inverseField;
      weightedGreen *= inverseField;
      weightedBlue *= inverseField;

      const bodyFactor = Math.min(1, Math.max(0, (fieldStrength - 0.85) / 0.4));
      const glowFactor = Math.min(1, Math.max(0, (fieldStrength - 0.15) / 0.7));
      const backgroundGradient = 0.05 + (1 - normalizedV) * 0.13;
      const bgRed = paletteColors[0][0] * backgroundGradient;
      const bgGreen = paletteColors[0][1] * backgroundGradient;
      const bgBlue = paletteColors[0][2] * backgroundGradient;

      const highlightFactor = 0.7 + 0.2 * Math.min(1, Math.max(0, (fieldStrength - 1.2) / 1.8));
      const smoothBody = bodyFactor * bodyFactor * (3 - 2 * bodyFactor);

      const finalRed =
        (bgRed + weightedRed * glowFactor * 0.22) * (1 - smoothBody) +
        weightedRed * highlightFactor * smoothBody;
      const finalGreen =
        (bgGreen + weightedGreen * glowFactor * 0.22) * (1 - smoothBody) +
        weightedGreen * highlightFactor * smoothBody;
      const finalBlue =
        (bgBlue + weightedBlue * glowFactor * 0.22) * (1 - smoothBody) +
        weightedBlue * highlightFactor * smoothBody;

      lavaCpuPixelsRgba.push(Math.min(255, finalRed) as u8);
      lavaCpuPixelsRgba.push(Math.min(255, finalGreen) as u8);
      lavaCpuPixelsRgba.push(Math.min(255, finalBlue) as u8);
      lavaCpuPixelsRgba.push(255);
    }
  }

  if (lavaCpuTextureId < 0) {
    lavaCpuTextureId = imageFromPixels(lavaCpuPixelsRgba, LAVA_GRID_WIDTH, LAVA_GRID_HEIGHT);
  } else {
    updateImage(lavaCpuTextureId, lavaCpuPixelsRgba);
  }
  if (lavaCpuTextureId >= 0) {
    drawImageRect(
      lavaCpuTextureId,
      0,
      0,
      LAVA_GRID_WIDTH,
      LAVA_GRID_HEIGHT,
      0,
      0,
      width,
      height,
      255,
      ImageFlag.Smooth
    );
  }
  uiState.animating = true;
}

// ----------------------------------------------------------------------------
// Rolling-flap clock (odometer)
// ----------------------------------------------------------------------------
let previousOdometerDigits: string = '';
let currentOdometerDigits: string = '';
const odometerRollState = { progress: 1 };
const ODOMETER_ROLL_SECONDS = 0.65;

/**
 * Draws four digit cards centered at `(centerX, centerY)`.
 * When a minute turns, only the changed digits roll vertically.
 */
export function drawOdometerDigits(
  centerX: number,
  centerY: number,
  hours: number,
  minutes: number
): void {
  const formattedDigits = `${hours < 10 ? '0' : ''}${hours}${minutes < 10 ? '0' : ''}${minutes}`;
  if (formattedDigits !== currentOdometerDigits) {
    previousOdometerDigits =
      currentOdometerDigits === '' ? formattedDigits : currentOdometerDigits;
    currentOdometerDigits = formattedDigits;
    gsap.killTweensOf(odometerRollState);
    odometerRollState.progress = previousOdometerDigits === formattedDigits ? 1 : 0;
    if (odometerRollState.progress === 0) {
      gsap.to(odometerRollState, {
        progress: 1,
        duration: ODOMETER_ROLL_SECONDS,
        ease: 'power3.out',
      });
    }
  }

  const rollProgress = odometerRollState.progress;
  const isRolling = rollProgress < 1;
  const cardWidth = 170;
  const cardHeight = 250;
  const cardGap = 18;
  const colonWidth = 56;
  const totalWidth = cardWidth * 4 + cardGap * 2 + colonWidth + cardGap * 2;

  let cardX = centerX - totalWidth / 2;
  const cardY = centerY - cardHeight / 2;

  for (let digitIndex = 0; digitIndex < 4; digitIndex++) {
    rrect(cardX, cardY, cardWidth, cardHeight, 22, 0x1b1e26, 255);
    clip(cardX, cardY, cardWidth, cardHeight, 22);

    const currentDigit = currentOdometerDigits.charAt(digitIndex);
    const previousDigit = previousOdometerDigits.charAt(digitIndex);
    const baseTextY = cardY + (cardHeight - fontAscent(FONT_ODOMETER_DIGIT)) / 2 - 20;

    if (isRolling && previousDigit !== currentDigit) {
      drawCenteredText(
        FONT_ODOMETER_DIGIT,
        cardX + cardWidth / 2,
        baseTextY - rollProgress * cardHeight,
        previousDigit,
        COLOR_TEXT_PRIMARY
      );
      drawCenteredText(
        FONT_ODOMETER_DIGIT,
        cardX + cardWidth / 2,
        baseTextY + (1 - rollProgress) * cardHeight,
        currentDigit,
        COLOR_TEXT_PRIMARY
      );
    } else {
      drawCenteredText(
        FONT_ODOMETER_DIGIT,
        cardX + cardWidth / 2,
        baseTextY,
        currentDigit,
        COLOR_TEXT_PRIMARY
      );
    }

    unclip();
    rect(cardX, centerY - 1.5, cardWidth, 3, 0x000000); // Central hinge of the flap clock
    cardX += cardWidth + cardGap;

    if (digitIndex === 1) {
      rrect(cardX + colonWidth / 2 - 6, centerY - 36, 12, 12, 6, RING_COLORS[0], 255);
      rrect(cardX + colonWidth / 2 - 6, centerY + 24, 12, 12, 6, RING_COLORS[0], 255);
      cardX += colonWidth + cardGap;
    }
  }

  if (isRolling) {
    uiState.animating = true;
  }
}
