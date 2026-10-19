// ============================================================================
// core/pictures.ts — Cache d'images réseau, décodage progressif et flou
// ============================================================================
// Sur une tablette modeste (comme le HP TouchPad sous webOS), décoder une image
// JPEG/PNG de 300 pixels prend 15 à 40 ms sur le processeur.
// Pour ne jamais bloquer une animation ou un défilement :
// 1. Les images demandées sont téléchargées en arrière-plan (4 maximum en parallèle).
// 2. Les octets reçus sont placés dans une file d'attente (`readyQueue`).
// 3. `decodeNextPicture()` ne décode qu'une seule image par frame, et uniquement
//    lorsque aucun doigt ne touche l'écran et qu'aucune liste ne défile.
// 4. La mémoire est plafonnée à `MAX_CACHED_PICTURES` (60 images max, 400 px de côté max)
//    avec éviction LRU (l'image la moins récemment dessinée est libérée en premier).

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
import { uiState } from './input';

/** Associe chaque URL à l'identifiant d'image GPU (`-1` en cas d'erreur de chargement). */
const cachedPicturesByUrl = new Map<string, i32>();

/** URLs dont le téléchargement est actuellement en cours ou déjà lancé. */
const loadingUrls = new Map<string, boolean>();

/** Numéro de frame du dernier affichage de chaque URL (pour l'éviction LRU). */
const lastDrawnFrameByUrl = new Map<string, number>();

/** Horodatage (`performance.now()`) du décodage de chaque image (pour le fondu d'entrée). */
const decodedTimestampByUrl = new Map<string, number>();

/** File d'attente des URLs téléchargées prêtes à être décodées (prioritaires : visibles à l'écran). */
const priorityDecodeQueue: string[] = [];

/** File d'attente secondaire des URLs préchargées en arrière-plan. */
const backgroundDecodeQueue: string[] = [];

/** Octets bruts téléchargés en attente de décodage. */
const pendingBytesByUrl = new Map<string, u8[]>();

let currentFrameTick: number = 0;
let activeDownloadsCount: i32 = 0;
let totalDecodedCount: number = 0;
let totalDecodeDurationMs: number = 0;

/** Incrémente l'horloge interne du cache d'images (appelé une fois par frame). */
export function tickPicturesClock(): void {
  currentFrameTick++;
}

/** Retourne `[nombre d'images décodées, temps cumulé en ms]` pour le profilage. */
export function getPictureDecodeStats(): number[] {
  return [totalDecodedCount, totalDecodeDurationMs];
}

/**
 * Retourne l'identifiant de l'image pour `url`, ou `-1` si elle n'est pas encore prête.
 * Lance automatiquement son téléchargement lors de la première demande.
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
 * Précharge une image en arrière-plan pendant que l'application est au repos.
 * Retourne `false` s'il n'y a pas de créneau libre pour le moment.
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

/** Télécharge les octets d'une image sur le réseau et les place dans la file de décodage. */
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
 * Décode au plus une image en attente par appel.
 * Retourne `true` si une nouvelle image est prête (ce qui déclenche un rafraîchissement de l'écran).
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

  // Éviction LRU si le cache a atteint sa capacité maximale
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
 * Si l'image décodée dépasse `MAX_PICTURE_DIMENSION` (400 px), la redessine dans une
 * texture plus petite en conservant ses proportions et détruit la grande texture.
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
 * Dessine une image contenue dans la boîte `(x, y, width, height)` en respectant ses proportions (`object-fit: contain`).
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
 * Calcule l'opacité actuelle (0..255) du fondu d'apparition d'une image récemment décodée.
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
// Fond atmosphérique flouté (Backdrop du lecteur)
// ----------------------------------------------------------------------------
let cachedBlurUrl: string = '';
let cachedBlurTexture: i32 = -1;

/**
 * Dessine une copie très adoucie et assombrie de la pochette en plein écran.
 * L'astuce matérielle consiste à réduire l'image dans une texture 12x12 puis à l'étirer
 * avec l'échantillonnage bilinéaire du GPU.
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

  // On ignore les texels du bord (1..10) pour éviter tout contour sombre
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
