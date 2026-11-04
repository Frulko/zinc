// ============================================================================
// core/pictures.ts — Network picture cache, progressive decoding and blur
// ============================================================================
// On a modest tablet (like the HP TouchPad on webOS), decoding a
// 300-pixel JPEG/PNG picture takes 15 to 40 ms on the CPU.
// To never block an animation or a scroll:
// 1. Requested pictures are downloaded in the background (4 at most in parallel).
// 2. The received bytes are put in a queue (`readyQueue`).
// 3. `decodeNextPicture()` hands them to the engine's decoder thread (zinc:gfx startImageDecode, two at a time)
//    and installs the finished ones, only when no finger touches the screen and no list is scrolling:
//    a frame pays for a pixel copy, never for a decode.
// 4. Memory is capped at `MAX_CACHED_PICTURES` (60 pictures max, 400 px per side max)
//    with LRU eviction (the least recently drawn picture is freed first).

import {
  drawImage,
  drawImageRect,
  rrect,
  startImageDecode,
  pollImageDecode,
  destroyImage,
  createImage,
  beginImage,
  endImage,
  resetTransform,
  setTransform,
  imageWidth,
  imageHeight,
  pixelScale,
  ImageFlag,
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
/** A Sonos answers 404 for a cover it has not fetched yet and 200 minutes later: a failed download is asked again, less and less often. */
const nextTryAtByUrl = new Map<string, number>();
const tryWaitByUrl = new Map<string, number>();
const FIRST_TRY_WAIT_MS = 15000;
const LONGEST_TRY_WAIT_MS = 120000;

function noteFailedDownload(url: string): void {
  cachedPicturesByUrl.set(url, -1);
  const lastWait = tryWaitByUrl.get(url);
  const wait = lastWait === undefined ? FIRST_TRY_WAIT_MS : Math.min(lastWait * 2, LONGEST_TRY_WAIT_MS);
  tryWaitByUrl.set(url, wait);
  nextTryAtByUrl.set(url, Date.now() + wait);
}

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
let backgroundDecodeBlockedUntilTick: number = 0;
let activeDownloadsCount: i32 = 0;
let totalDecodedCount: number = 0;
let totalDecodeDurationMs: number = 0;

/**
 * Pictures redrawn at the size they are shown at. Scaling a 400 px cover down to 280 px costs about 100 ns a pixel on a Raspberry Pi 3
 * (12 ms of CPU a frame for the player's cover, drawn again at every frame of a slide); a copy made once at the shown size is a row copy.
 */
const scaledPicturesByKey = new Map<string, i32>();
const scaledLastUsedByKey = new Map<string, number>();
const MAX_SCALED_PIXELS = 1500000;
let scaledPixels = 0;
let scaledMadeThisFrame = 0;

/** Advances the picture cache's internal clock (called once per frame). */
export function tickPicturesClock(): void {
  currentFrameTick++;
  scaledMadeThisFrame = 0;
}

function dropLeastRecentScaledPicture(): void {
  let oldestKey = '';
  let oldestTick = currentFrameTick + 1;
  scaledLastUsedByKey.forEach((tick: number, key: string) => {
    if (tick < oldestTick) {
      oldestTick = tick;
      oldestKey = key;
    }
  });
  const imageId = scaledPicturesByKey.get(oldestKey);
  if (imageId !== undefined) {
    destroyImage(imageId);
    const side = parseInt(oldestKey.slice(oldestKey.lastIndexOf('|') + 1), 10);
    scaledPixels -= side * side;
  }
  scaledPicturesByKey.delete(oldestKey);
  scaledLastUsedByKey.delete(oldestKey);
}

/**
 * Returns a copy of picture `sourceImage` (of `url`) at `size` x `size` pixels, made once, or `sourceImage` itself when it already has that
 * size or when a copy cannot be made now (at most two a frame, so a grid scrolling into view never stalls a frame).
 * `onLightTile`: for a station's logo, the copy is the whole tile, the logo contained in a light square.
 */
export function getPictureAtSize(url: string, sourceImage: i32, size: i32, onLightTile: boolean = false): i32 {
  // Only where pixels are the unit of layout: a scaled-up screen (a Retina window) shows the copy blurrier than the picture, and its CPU is fast
  if (pixelScale() !== 1 || (!onLightTile && imageWidth(sourceImage) === size && imageHeight(sourceImage) === size)) return sourceImage;
  const key = url + (onLightTile ? '|tile|' : '|') + size;
  const made = scaledPicturesByKey.get(key);
  if (made !== undefined) {
    scaledLastUsedByKey.set(key, currentFrameTick);
    return made;
  }
  if (scaledMadeThisFrame >= 2 || size * size > MAX_SCALED_PIXELS / 2) return sourceImage;
  while (scaledPixels + size * size > MAX_SCALED_PIXELS && scaledPicturesByKey.size > 0) {
    dropLeastRecentScaledPicture();
  }
  const copy = createImage(size, size);
  if (copy < 0) return sourceImage;
  // Drawn at identity: beginImage keeps the matrix in force, and the node's offset would put the picture outside the texture
  resetTransform();
  beginImage(copy);
  if (onLightTile) {
    // an image made by beginImage is opaque: the tile's light square is part of the copy
    rrect(0, 0, size, size, 0, 0xf2f2f7, 255);
    drawPictureContained(sourceImage, size * 0.14, size * 0.14, size * 0.72, size * 0.72, 4);
  } else {
    drawImage(sourceImage, 0, 0, size, size, 255, 0);
  }
  endImage();
  setTransform(1, 0, 0, 1, uiState.offsetX, uiState.offsetY);
  scaledPicturesByKey.set(key, copy);
  scaledLastUsedByKey.set(key, currentFrameTick);
  scaledPixels += size * size;
  scaledMadeThisFrame++;
  return copy;
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
    // a failure stays -1 during the new try: the tile with the initials does not blink
    if (existingImage < 0 && activeDownloadsCount < MAX_INFLIGHT_DOWNLOADS) {
      const nextTryAt = nextTryAtByUrl.get(url);
      if (nextTryAt !== undefined && Date.now() >= nextTryAt) {
        nextTryAtByUrl.delete(url);
        downloadPictureBytes(url, true);
      }
    }
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
      noteFailedDownload(url);
    }
  } catch (error) {
    noteFailedDownload(url);
  }
  activeDownloadsCount--;
}

/** Decodes in flight on the engine's worker thread: the URL and the handle of its decode. */
const decodesInFlight: { url: string; handle: i32 }[] = [];
const MAX_DECODES_IN_FLIGHT = 2;

/** Puts a decoded picture (or `-1`) in the cache, evicting the least recently drawn one when the cache is full. */
function storeDecodedPicture(url: string, decodedImage: i32): void {
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
  cachedPicturesByUrl.set(url, decodedImage);
  lastDrawnFrameByUrl.set(url, currentFrameTick);
  decodedTimestampByUrl.set(url, performance.now());
}

/**
 * Hands the downloaded pictures to the engine's decoder thread (two at a time, the screen's own first) and installs the ones it has finished:
 * no frame pays for a decode, only for a pixel copy. A picture not yet ready is drawn as its quiet placeholder (`getPicture` gives `-1`).
 * Returns `true` if a new picture is ready (which triggers a screen refresh).
 */
export function decodeNextPicture(allowBackground: boolean = true): boolean {
  let installed = false;
  for (let i = decodesInFlight.length - 1; i >= 0; i--) {
    const pending = decodesInFlight[i];
    const startTime = performance.now();
    const result = pollImageDecode(pending.handle);
    if (result === -2) continue;
    decodesInFlight.splice(i, 1);
    storeDecodedPicture(pending.url, result);
    totalDecodeDurationMs += performance.now() - startTime;
    totalDecodedCount++;
    installed = true;
  }

  while (decodesInFlight.length < MAX_DECODES_IN_FLIGHT) {
    const isBackground = priorityDecodeQueue.length === 0;
    // preloaded pictures are spaced out and wait for a quiet moment: the worker thread shares the cores with the frame's own work
    if (isBackground && (!allowBackground || currentFrameTick < backgroundDecodeBlockedUntilTick)) break;
    const nextUrl =
      priorityDecodeQueue.length > 0
        ? (priorityDecodeQueue[0] as string)
        : backgroundDecodeQueue.length > 0
        ? (backgroundDecodeQueue[0] as string)
        : '';
    if (nextUrl === '') break;
    const rawBytes = pendingBytesByUrl.get(nextUrl);
    const handle = rawBytes !== undefined ? startImageDecode(rawBytes as u8[], MAX_PICTURE_DIMENSION) : -1;
    if (handle === 0) break; // too much in flight: the same picture next time
    if (isBackground) {
      backgroundDecodeQueue.shift();
      backgroundDecodeBlockedUntilTick = currentFrameTick + 30;
    } else {
      priorityDecodeQueue.shift();
    }
    pendingBytesByUrl.delete(nextUrl);
    if (handle < 0) {
      storeDecodedPicture(nextUrl, -1);
      installed = true;
    } else {
      decodesInFlight.push({ url: nextUrl, handle });
    }
  }
  return installed;
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
let cachedBlurWidth: i32 = 0;
let cachedBlurHeight: i32 = 0;
let cachedBlurTexture: i32 = -1;

/** The side of the small copy each blur level stretches (`AppConfig.backdropBlur`); 0: the cover itself, sharp. */
const BLUR_SOURCE_SIDES: i32[] = [0, 96, 40, 12];
let cachedBlurLevel: i32 = -1;

/**
 * Draws a softened and darkened copy of the cover over the screen (`screenWidth` x `screenHeight`, its top left at `(0, -originY)` of
 * the node: the status bar sits above it).
 * The cover is shrunk into a small texture (halving, so no detail flickers) and stretched once with a B-spline into a picture of the
 * screen's size with the darkening already in it; every frame is then a row copy (the stretch alone cost 11 ms of CPU a frame on a
 * Raspberry Pi 3, the darkening 5 more, and a slide redraws the backdrop at every frame).
 */
export function drawBlurredBackdrop(url: string, screenWidth: number, screenHeight: number, originY: number, blurLevel: i32, alpha: i32 = 255): boolean {
  if (!prepareBlurTexture(url, screenWidth, screenHeight, blurLevel)) return false;
  drawImage(cachedBlurTexture, 0, -originY, Math.round(screenWidth) as i32, Math.round(screenHeight) as i32, alpha, 0);
  return true;
}

/** Keeps the backdrop texture of this cover ready. A blurred picture has no detail to lose: a quarter of the screen's side costs the GPU far less to read (Tegra 3). */
function prepareBlurTexture(url: string, screenWidth: number, screenHeight: number, blurLevel: i32): boolean {
  const sourceImage = getPicture(url);
  if (sourceImage < 0) return false;
  const width = Math.round(screenWidth) as i32;
  const height = Math.round(screenHeight) as i32;

  if (cachedBlurUrl !== url || cachedBlurWidth !== width || cachedBlurHeight !== height || cachedBlurLevel !== blurLevel) {
    if (cachedBlurTexture >= 0) destroyImage(cachedBlurTexture);
    const shrink: i32 = blurLevel > 0 ? 4 : 1;
    const textureWidth = Math.max(1, (width / shrink) as i32) as i32;
    const textureHeight = Math.max(1, (height / shrink) as i32) as i32;
    cachedBlurTexture = createImage(textureWidth, textureHeight);
    if (cachedBlurTexture < 0) return false;
    // Drawn at identity: beginImage keeps the matrix in force, and the node's offset would put the picture outside the texture
    resetTransform();
    const smallSide = BLUR_SOURCE_SIDES[blurLevel];
    let stretched = sourceImage;
    const halves: i32[] = [];
    for (let side: i32 = smallSide * 4; smallSide > 0 && side >= smallSide; side = (side / 2) as i32) {
      const smaller = createImage(side, side);
      beginImage(smaller);
      drawImage(stretched, 0, 0, side, side, 255, 0);
      endImage();
      stretched = smaller;
      halves.push(smaller);
    }
    const inset = smallSide > 0 ? 1 : 0;   // skips the edge texels: no dark outline
    const sourceSide = smallSide > 0 ? smallSide : imageWidth(sourceImage);
    const coverSide = Math.max(textureWidth, textureHeight) * 1.1;
    beginImage(cachedBlurTexture);
    drawImageRect(
      stretched,
      inset,
      inset,
      sourceSide - inset * 2,
      (smallSide > 0 ? smallSide : imageHeight(sourceImage)) - inset * 2,
      (textureWidth - coverSide) / 2,
      (textureHeight - coverSide) / 2,
      coverSide,
      coverSide,
      255,
      smallSide > 0 ? ImageFlag.Smooth : 0,
      0,
      0x8c8c8c
    );
    rrect(0, 0, textureWidth, textureHeight, 0, 0x000000, 110);
    endImage();
    setTransform(1, 0, 0, 1, uiState.offsetX, uiState.offsetY);
    for (let index = 0; index < halves.length; index++) destroyImage(halves[index]);
    cachedBlurUrl = url;
    cachedBlurWidth = width;
    cachedBlurHeight = height;
    cachedBlurLevel = blurLevel;
  }
  return true;
}

/** The backdrop turning very slowly over itself: the colours move. One opaque layer, the screen is covered by it; a sharp backdrop stays still (it would only look crooked). */
export function drawLivingBackdrop(url: string, screenWidth: number, screenHeight: number, originY: number, blurLevel: i32, seconds: number): boolean {
  if (blurLevel === 0) return drawBlurredBackdrop(url, screenWidth, screenHeight, originY, blurLevel);
  if (!prepareBlurTexture(url, screenWidth, screenHeight, blurLevel)) return false;
  const side = Math.max(screenWidth, screenHeight) * 1.5;   // wider than the diagonal: no corner shows as it turns
  drawImageRect(
    cachedBlurTexture,
    0,
    0,
    imageWidth(cachedBlurTexture),
    imageHeight(cachedBlurTexture),
    (screenWidth - side) / 2,
    (screenHeight - side) / 2 - originY,
    side,
    side,
    255,
    0,
    seconds * 0.05
  );
  return true;
}
