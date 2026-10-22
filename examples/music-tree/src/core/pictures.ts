// ============================================================================
// core/pictures.ts — Network picture cache, progressive decoding and blur
// ============================================================================
// On a modest tablet (like the HP TouchPad on webOS), decoding a
// 300-pixel JPEG/PNG picture takes 15 to 40 ms on the CPU.
// To never block an animation or a scroll:
// 1. Requested pictures are downloaded in the background (4 at most in parallel).
// 2. The received bytes are put in a queue (`readyQueue`).
// 3. `decodeNextPicture()` decodes only one picture per frame, and only
//    when no finger touches the screen and no list is scrolling.
// 4. Memory is capped at `MAX_CACHED_PICTURES` (60 pictures max, 400 px per side max)
//    with LRU eviction (the least recently drawn picture is freed first).

import {
  drawImage,
  drawImageRect,
  imageFromBytes,
  destroyImage,
  createImage,
  beginImage,
  endImage,
  resetTransform,
  setTransform,
  imageWidth,
  imageHeight,
} from 'zinc:gfx';
import {
  MAX_CACHED_PICTURES,
  MAX_INFLIGHT_DOWNLOADS,
  MAX_PICTURE_DIMENSION,
  PICTURE_FADE_DURATION_MS,
} from '../constants';
import { uiState } from 'zinc:stage';

/** Maps each URL to its GPU picture id (`-1` on a load error). */
const cachedPicturesByUrl = new Map<string, i32>();

/** URLs whose download is in progress or already started. */
const loadingUrls = new Map<string, boolean>();

/** Frame number of the last display of each URL (for LRU eviction). */
const lastDrawnFrameByUrl = new Map<string, number>();

/** Timestamp (`performance.now()`) of each picture's decoding (for the fade-in). */
const decodedTimestampByUrl = new Map<string, number>();

/** Queue of downloaded URLs ready to decode (priority: visible on screen). */
const priorityDecodeQueue: string[] = [];

/** Secondary queue of URLs preloaded in the background. */
const backgroundDecodeQueue: string[] = [];

/** Raw downloaded bytes waiting to be decoded. */
const pendingBytesByUrl = new Map<string, u8[]>();

let currentFrameTick: number = 0;
let activeDownloadsCount: i32 = 0;
let totalDecodedCount: number = 0;
let totalDecodeDurationMs: number = 0;

/** Advances the picture cache's internal clock (called once per frame). */
export function tickPicturesClock(): void {
  currentFrameTick++;
}

/** Returns `[number of pictures decoded, cumulated time in ms]` for profiling. */
export function getPictureDecodeStats(): number[] {
  return [totalDecodedCount, totalDecodeDurationMs];
}

/**
 * Returns the picture id for `url`, or `-1` if it is not ready yet.
 * Starts its download automatically on the first request.
 */
export function getPicture(url: string): i32 {
  if (url === '') return -1;
  const existingImage = cachedPicturesByUrl.get(url);
  if (existingImage !== undefined) {
    lastDrawnFrameByUrl.set(url, currentFrameTick);
    return existingImage;
  }
  if (loadingUrls.get(url) === undefined && activeDownloadsCount < MAX_INFLIGHT_DOWNLOADS) {
    downloadPictureBytes(url, true);
  }
  return -1;
}

/** True while a picture is asked for and not yet decoded nor failed (a cover then shows a quiet tile, not a made-up one). */
export function isPictureOnItsWay(url: string): boolean {
  return url !== '' && cachedPicturesByUrl.get(url) === undefined;
}

/**
 * Preloads a picture in the background while the app is idle.
 * Returns `false` if there is no free slot for now.
 */
export function prefetchPicture(url: string): boolean {
  if (url === '' || cachedPicturesByUrl.get(url) !== undefined || loadingUrls.get(url) !== undefined) {
    return true;
  }
  const totalTracked = cachedPicturesByUrl.size + priorityDecodeQueue.length + backgroundDecodeQueue.length;
  if (activeDownloadsCount >= 1 || totalTracked >= MAX_CACHED_PICTURES - 20) {
    return false;
  }
  downloadPictureBytes(url, false);
  return true;
}

/** Downloads a picture's bytes over the network and puts them in the decoding queue. */
async function downloadPictureBytes(url: string, isVisibleOnScreen: boolean): Promise<void> {
  loadingUrls.set(url, true);
  activeDownloadsCount++;
  try {
    const response = await fetch(url, {
      timeoutMs: 10000,
      headers: [['User-Agent', 'ZincMusic/1.0']],
    });
    if (response.status === 200) {
      pendingBytesByUrl.set(url, await response.bytes());
      if (isVisibleOnScreen) {
        priorityDecodeQueue.push(url);
      } else {
        backgroundDecodeQueue.push(url);
      }
    } else {
      cachedPicturesByUrl.set(url, -1);
    }
  } catch (error) {
    cachedPicturesByUrl.set(url, -1);
  }
  activeDownloadsCount--;
}

/**
 * Decodes at most one pending picture per call.
 * Returns `true` if a new picture is ready (which triggers a screen refresh).
 */
export function decodeNextPicture(): boolean {
  const nextUrl =
    priorityDecodeQueue.length > 0
      ? (priorityDecodeQueue.shift() as string)
      : backgroundDecodeQueue.length > 0
      ? (backgroundDecodeQueue.shift() as string)
      : '';
  if (nextUrl === '') return false;

  const rawBytes = pendingBytesByUrl.get(nextUrl);
  pendingBytesByUrl.delete(nextUrl);

  const startTime = performance.now();
  const decodedImage = rawBytes !== undefined ? downscaleIfNeeded(imageFromBytes(rawBytes as u8[])) : -1;
  totalDecodeDurationMs += performance.now() - startTime;
  totalDecodedCount++;

  // LRU eviction if the cache has reached its maximum capacity
  if (cachedPicturesByUrl.size >= MAX_CACHED_PICTURES) {
    let oldestUrl = '';
    let oldestTick = currentFrameTick + 1;
    cachedPicturesByUrl.forEach((imageId: i32, keyUrl: string) => {
      const drawnTick = lastDrawnFrameByUrl.get(keyUrl);
      const effectiveTick = drawnTick !== undefined ? drawnTick : -1;
      if (effectiveTick < oldestTick) {
        oldestTick = effectiveTick;
        oldestUrl = keyUrl;
      }
    });
    const evictedImageId = cachedPicturesByUrl.get(oldestUrl);
    if (evictedImageId !== undefined && evictedImageId >= 0) {
      destroyImage(evictedImageId);
    }
    cachedPicturesByUrl.delete(oldestUrl);
    loadingUrls.delete(oldestUrl);
    lastDrawnFrameByUrl.delete(oldestUrl);
    decodedTimestampByUrl.delete(oldestUrl);
  }

  cachedPicturesByUrl.set(nextUrl, decodedImage);
  lastDrawnFrameByUrl.set(nextUrl, currentFrameTick);
  decodedTimestampByUrl.set(nextUrl, performance.now());
  return true;
}

/**
 * If the decoded picture exceeds `MAX_PICTURE_DIMENSION` (400 px), redraws it into a
 * smaller texture keeping its proportions and destroys the large texture.
 */
function downscaleIfNeeded(sourceImage: i32): i32 {
  if (sourceImage < 0) return sourceImage;
  const sourceWidth = imageWidth(sourceImage);
  const sourceHeight = imageHeight(sourceImage);
  if (sourceWidth <= MAX_PICTURE_DIMENSION && sourceHeight <= MAX_PICTURE_DIMENSION) {
    return sourceImage;
  }
  const scaleFactor = MAX_PICTURE_DIMENSION / Math.max(sourceWidth, sourceHeight);
  const targetWidth = Math.max(1, Math.round(sourceWidth * scaleFactor)) as i32;
  const targetHeight = Math.max(1, Math.round(sourceHeight * scaleFactor)) as i32;
  const resizedImage = createImage(targetWidth, targetHeight);
  if (resizedImage < 0) return sourceImage;

  beginImage(resizedImage);
  drawImage(sourceImage, 0, 0, targetWidth, targetHeight, 255, 0);
  endImage();
  destroyImage(sourceImage);
  return resizedImage;
}

/**
 * Draws a picture inside the box `(x, y, width, height)` keeping its proportions (`object-fit: contain`).
 */
export function drawPictureContained(
  imageId: i32,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: number
): void {
  const sourceWidth = imageWidth(imageId);
  const sourceHeight = imageHeight(imageId);
  if (sourceWidth <= 0 || sourceHeight <= 0) return;

  const scaleFactor = Math.min(width / sourceWidth, height / sourceHeight);
  const drawnWidth = sourceWidth * scaleFactor;
  const drawnHeight = sourceHeight * scaleFactor;
  drawImage(
    imageId,
    x + (width - drawnWidth) / 2,
    y + (height - drawnHeight) / 2,
    drawnWidth,
    drawnHeight,
    255,
    cornerRadius
  );
}

/**
 * Computes the current opacity (0..255) of the fade-in of a recently decoded picture.
 */
export function getPictureFadeAlpha(url: string): i32 {
  const bornTimestamp = decodedTimestampByUrl.get(url);
  if (bornTimestamp === undefined) return 255;

  const progress = (performance.now() - (bornTimestamp as number)) / PICTURE_FADE_DURATION_MS;
  if (progress >= 1) {
    decodedTimestampByUrl.delete(url);
    return 255;
  }
  uiState.animating = true;
  return Math.round(progress * 255) as i32;
}

// ----------------------------------------------------------------------------
// Blurred atmospheric background (the player's backdrop)
// ----------------------------------------------------------------------------
let cachedBlurUrl: string = '';
let cachedBlurTexture: i32 = -1;

/**
 * Draws a very softened and darkened copy of the cover full screen.
 * The hardware trick is to shrink the picture into a 12x12 texture then stretch it
 * with the GPU's bilinear sampling.
 */
export function drawBlurredBackdrop(url: string, screenWidth: number, screenHeight: number): boolean {
  const sourceImage = getPicture(url);
  if (sourceImage < 0) return false;

  if (cachedBlurUrl !== url) {
    if (cachedBlurTexture < 0) {
      cachedBlurTexture = createImage(12, 12);
    }
    // Drawn at identity: beginImage keeps the matrix in force, and the node's offset would put the picture outside the 12x12 texture
    resetTransform();
    beginImage(cachedBlurTexture);
    drawImage(sourceImage, 0, 0, 12, 12, 255, 0);
    endImage();
    setTransform(1, 0, 0, 1, uiState.offsetX, uiState.offsetY);
    cachedBlurUrl = url;
  }

  // Skip the edge texels (1..10) to avoid any dark outline
  drawImageRect(
    cachedBlurTexture,
    1,
    1,
    10,
    10,
    -screenWidth * 0.1,
    -screenHeight * 0.1,
    screenWidth * 1.2,
    screenHeight * 1.2,
    255,
    0,
    0,
    0x8c8c8c
  );
  return true;
}
