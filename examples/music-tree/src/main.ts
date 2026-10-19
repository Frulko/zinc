// ============================================================================
// main.ts — Point d'entrée et assemblage de l'arbre d'affichage (Stage)
// ============================================================================
// Architecture façon ActionScript 3 / Haxe (DisplayList) :
// L'application est construite comme un arbre hiérarchique de `DisplayObject`
// rattachés à une scène racine (`Stage`) :
//
//   Stage (0, 0)
//   ├── MainContentContainer (0, STATUS_BAR_HEIGHT)
//   │   ├── Page active (montée/démontée avec cycle de vie onAddedToStage / onRemovedFromStage) :
//   │   │   • HomePageNode (contient les 5 slides enfants du carrousel)
//   │   │   • RadiosPageNode (contient la grille + VirtualKeyboardNode)
//   │   │   • SpotifyPageNode (contient la bibliothèque + VirtualKeyboardNode)
//   │   │   • RoomsPageNode (groupes et volumes par pièce)
//   │   │   • SettingsPageNode (réglages + CitySearchSubpageNode)
//   │   └── SidebarNode (barre latérale et mini-lecteur)
//   ├── PopoversContainer (0, STATUS_BAR_HEIGHT + animation d'ouverture)
//   │   ├── VolumePopoverNode
//   │   └── ContextSheetNode
//   ├── ToastContainer (0, STATUS_BAR_HEIGHT)
//   │   └── ToastLayerNode
//   ├── StatusBarNode (0, 0)
//   └── NotificationOverlayNode (0, 0 — au-dessus de toute l'interface)

import {
  onFrame,
  width,
  height,
  keep,
  clear,
  rrect,
  createImage,
  destroyImage,
  beginImage,
  endImage,
  pointerX,
  pointerY,
  pointerDown,
  wheel,
  wheelX,
  scrollDX,
  scrollDY,
  startTextInput,
  stopTextInput,
  keyCount,
  keyKind,
  keyName,
  KeyKind,
} from 'zinc:gfx';
import { exists, appendText } from 'zinc:fs';
import { Group } from 'zinc:sonos';
import { Item } from 'zinc:spotify';
import gsap from 'gsap';
import {
  CLOCK_FACE_COUNT,
  COLOR_BACKGROUND,
  PAGE_PADDING,
  PAGE_NOW_PLAYING,
  PAGE_RADIOS,
  PAGE_ROOMS,
  PAGE_SETTINGS,
  PAGE_SPOTIFY,
  SIDEBAR_WIDTH_DEFAULT,
  SLIDE_CLOCK,
  SLIDE_COUNT,
  SLIDE_NOTIFICATIONS,
  SLIDE_PLAYER,
  SLIDE_RINGS,
  SLIDE_WEATHER,
  STATUS_BAR_HEIGHT,
} from './constants';
import { DisplayObject, Stage } from './core/display';
import {
  ScrollBox,
  TouchZone,
  clearTouchZones,
  findTopmostZoneAt,
  restoreTouchZones,
  scrollBoxUnderPointerByWheel,
  takeTouchZones,
  uiState,
} from './core/input';
import {
  decodeNextPicture,
  getPictureDecodeStats,
  prefetchPicture,
  tickPicturesClock,
} from './core/pictures';
import { RadioStation } from './services/radios-service';
import { startRemoteUdpListener } from './services/remote-udp';
import {
  setWeatherLocation,
  tickWeatherService,
} from './services/weather-service';
import {
  MacNotification,
  doesNotificationRowYieldToCarousel,
  hasActiveStandByOverlay,
  isStandByOverlayHoldingStill,
  setNotificationsShown,
  startNotificationRelay,
  tickNotificationRelay,
} from './services/notify-service';
import { tickSpotifyAccount } from './services/spotify-account';
import { tickQueueContinuation } from './services/spotify-on-sonos';
import { LIBRARY_KEYS, spotifyCatalog } from './services/spotify-catalog';
import { SidebarNode } from './components/sidebar';
import { hasTouchKeyboardOnly } from './components/keyboard';
import { StatusBarNode, getCurrentClockParts } from './components/status-bar';
import { VolumePopoverNode } from './components/volume-popover';
import { ContextSheetNode } from './components/context-sheet';
import { ToastLayerNode } from './components/toast-layer';
import {
  NotificationOverlayNode,
  drawNotificationOverlayLayer,
} from './components/notification-overlay';
import { HomePageNode } from './pages/home/home-page';
import { RadiosPageNode } from './pages/radios/radios-page';
import { SpotifyPageNode } from './pages/spotify/spotify-page';
import { RoomsPageNode } from './pages/rooms/rooms-page';
import { SettingsPageNode } from './pages/settings/settings-page';
import {
  appState,
  carouselGsapTarget,
  clockFaceGsapTarget,
  discoverSonosSystem,
  handleTypedKeyboardKey,
   loadPopularRadios,
  pollActiveGroupMemberVolumes,
  pollActiveSonosGroup,
  pollAllRoomVolumes,
  pollSonosTopology,
  pollSpotifyPlaybackState,
  popoverRiseGsapTarget,
  restoreCarouselAndClockPreferences,
  saveCarouselAndClockPreferences,
  sleepMilliseconds,
} from './state';

// ----------------------------------------------------------------------------
// Construction de la scène (Stage) et des nœuds de l'arbre d'affichage
// ----------------------------------------------------------------------------

/** The root: before each layout it sizes the layers and mounts the current page, inside the frame pass (no extra frame). */
class ApplicationStage extends Stage {
  override onMeasure(): void {
    sizeLayersAndMountCurrentPage(this.width, this.height);
  }
}

const stage = new ApplicationStage();

const mainContentContainer = new DisplayObject('MainContentContainer');
mainContentContainer.y = STATUS_BAR_HEIGHT;

const homePageNode = new HomePageNode();
const radiosPageNode = new RadiosPageNode();
const spotifyPageNode = new SpotifyPageNode();
const roomsPageNode = new RoomsPageNode();
const settingsPageNode = new SettingsPageNode();
const sidebarNode = new SidebarNode();

const allPageNodes: DisplayObject[] = [
  homePageNode,
  radiosPageNode,
  spotifyPageNode,
  roomsPageNode,
  settingsPageNode,
];

let mountedPageId: i32 = -1;

/**
 * Synchronise la page montée dans `mainContentContainer` avec `appState.currentPage`.
 * Déclenche proprement `onRemovedFromStage()` sur l'ancienne page et `onAddedToStage()` sur la nouvelle.
 */
function syncMountedPageInTree(contentWidth: number, contentHeight: number): void {
  const targetPageId = appState.currentPage;
  if (mountedPageId !== targetPageId) {
    if (mountedPageId >= 0 && mountedPageId < allPageNodes.length) {
      mainContentContainer.removeChild(allPageNodes[mountedPageId]);
    }
    if (mainContentContainer.contains(sidebarNode)) {
      mainContentContainer.removeChild(sidebarNode);
    }
    const nextPageNode = allPageNodes[targetPageId];
    mainContentContainer.addChild(nextPageNode);
    mainContentContainer.addChild(sidebarNode);
    mountedPageId = targetPageId;
  }

  const activePageNode = allPageNodes[targetPageId];
  activePageNode.width = contentWidth;
  activePageNode.height = contentHeight;
  sidebarNode.width = contentWidth;
  sidebarNode.height = contentHeight;
}

const popoversContainer = new DisplayObject('PopoversContainer');
popoversContainer.y = STATUS_BAR_HEIGHT;
const volumePopoverNode = new VolumePopoverNode();
const contextSheetNode = new ContextSheetNode();
popoversContainer.addChild(volumePopoverNode);
popoversContainer.addChild(contextSheetNode);

const toastContainer = new DisplayObject('ToastContainer');
toastContainer.y = STATUS_BAR_HEIGHT;
const toastLayerNode = new ToastLayerNode();
toastContainer.addChild(toastLayerNode);

const statusBarNode = new StatusBarNode();
const notificationOverlayNode = new NotificationOverlayNode();

stage.addChild(mainContentContainer);
stage.addChild(popoversContainer);
stage.addChild(toastContainer);
stage.addChild(statusBarNode);
stage.addChild(notificationOverlayNode);

function sidebarWidthForCurrentPage(): number {
  return appState.currentPage === PAGE_NOW_PLAYING && appState.config.fullScreenPlayer
    ? 0
    : SIDEBAR_WIDTH_DEFAULT;
}

function sizeLayersAndMountCurrentPage(screenWidth: number, screenHeight: number): void {
  appState.sidebarWidth = sidebarWidthForCurrentPage();

  const contentHeight = screenHeight - STATUS_BAR_HEIGHT;

  mainContentContainer.width = screenWidth;
  mainContentContainer.height = contentHeight;
  syncMountedPageInTree(screenWidth, contentHeight);

  popoversContainer.y = STATUS_BAR_HEIGHT + popoverRiseGsapTarget.y;
  popoversContainer.width = screenWidth;
  popoversContainer.height = contentHeight;
  volumePopoverNode.width = screenWidth;
  volumePopoverNode.height = contentHeight;
  contextSheetNode.width = screenWidth;
  contextSheetNode.height = contentHeight;

  toastContainer.width = screenWidth;
  toastContainer.height = contentHeight;
  toastLayerNode.width = screenWidth;
  toastLayerNode.height = contentHeight;

  statusBarNode.width = screenWidth;
  statusBarNode.height = screenHeight;
  notificationOverlayNode.width = screenWidth;
  notificationOverlayNode.height = screenHeight;
}

/**
 * Dessine toute la scène pour la frame en cours.
 */
function renderFullApplicationStage(screenWidth: number, screenHeight: number): void {
  clear(COLOR_BACKGROUND);
  stage.renderStage(screenWidth, screenHeight);
}

// ----------------------------------------------------------------------------
// Gestion des entrées tactiles, des gestes de balayage (swipe) et du clavier
// ----------------------------------------------------------------------------

let wasPointerDownLastFrame = false;
let shouldSwallowCurrentGesture = false;
let hasPointerMovedBeyondThreshold = false;
let pointerIdleSeconds = 0;

let pointerDownStartX = 0;
let pointerDownStartY = 0;
let previousPointerX = 0;
let previousPointerY = 0;
let initialScrollOffsetY = 0;

let activeDragZone: TouchZone | null = null;
let activeTapZone: TouchZone | null = null;
let activeScrollingBox: ScrollBox | null = null;

let isCarouselSwipeAllowed = false;
let isDraggingCarouselHorizontally = false;
let carouselSwipeInitialSlideX = 0;
let carouselSwipeVelocity = 0;

let isDraggingClockFaceVertically = false;
let clockFaceSwipeInitialY = 0;
let clockFaceSwipeVelocity = 0;

// A mouse wheel (steps) or two fingers on a trackpad (pixels: scrollDX/DY, macOS sends them apart) do what a finger's swipe
// does: a list scrolls, the carousel and the clock's faces move one step per gesture. A trackpad's swipe and its momentum
// come as many small moves; 0.25 s without one ends the gesture. 40 px of a trackpad count as one wheel step, as zinc:ui counts.
const TRACKPAD_PIXELS_PER_WHEEL_STEP = 40;
const WHEEL_STEP_PIXELS = 48;
let wheelGestureY = 0;
let wheelGestureX = 0;
let wheelQuietSeconds = 0;
let hasWheelGestureStepped = false;

function processWheelInput(deltaSeconds: number, pointerAtX: number, pointerAtY: number): void {
  const trackpadDeltaX = scrollDX();
  const trackpadDeltaY = scrollDY();
  const stepsY = wheel() + trackpadDeltaY / TRACKPAD_PIXELS_PER_WHEEL_STEP;
  const stepsX = wheelX() - trackpadDeltaX / TRACKPAD_PIXELS_PER_WHEEL_STEP;
  if (stepsY === 0 && stepsX === 0) {
    wheelQuietSeconds += deltaSeconds;
    if (wheelQuietSeconds > 0.25) {
      wheelGestureY = 0;
      wheelGestureX = 0;
      hasWheelGestureStepped = false;
    }
    return;
  }
  wheelQuietSeconds = 0;
  pointerIdleSeconds = 0;
  // It woke the screen, or a finger already moves things
  if (appState.screenPower.onUserTouch() || pointerDown()) return;

  wheelGestureY += stepsY;
  wheelGestureX += stepsX;
  const isSideways = Math.abs(wheelGestureX) > Math.abs(wheelGestureY);
  if (
    !isSideways &&
    scrollBoxUnderPointerByWheel(pointerAtX, pointerAtY, wheel() * WHEEL_STEP_PIXELS + trackpadDeltaY)
  ) {
    return;
  }
  if (
    appState.currentPage !== PAGE_NOW_PLAYING ||
    appState.isVolumePopoverOpen ||
    appState.isContextSheetOpen ||
    hasWheelGestureStepped
  ) {
    return;
  }
  if (isSideways && Math.abs(wheelGestureX) >= 1) {
    // + = right: the next slide
    appState.targetSlideIndex = Math.max(
      0,
      Math.min(SLIDE_COUNT - 1, appState.targetSlideIndex + (wheelGestureX > 0 ? 1 : -1))
    ) as i32;
    if (appState.targetSlideIndex === SLIDE_RINGS) {
      roomsPollTimerSeconds = 99;
    }
    hasWheelGestureStepped = true;
    saveCarouselAndClockPreferences();
  } else if (
    !isSideways &&
    Math.abs(wheelGestureY) >= 1 &&
    appState.targetSlideIndex === SLIDE_CLOCK &&
    Math.round(appState.animatedSlideX) === SLIDE_CLOCK
  ) {
    // + = up: the face above
    appState.targetClockFaceIndex = Math.max(
      0,
      Math.min(CLOCK_FACE_COUNT - 1, appState.targetClockFaceIndex + (wheelGestureY > 0 ? -1 : 1))
    ) as i32;
    hasWheelGestureStepped = true;
    saveCarouselAndClockPreferences();
  }
  uiState.dirty = true;
}

// A computer's keyboard types in the search fields: the window's text input is on while a field takes the typing (else no
// character comes, only keys). A tablet keeps the app's own keyboard: no system keyboard over it.
let isWindowTextInputOn = false;

function processDesktopKeyboard(): void {
  if (!hasTouchKeyboardOnly && appState.isKeyboardVisible !== isWindowTextInputOn) {
    isWindowTextInputOn = appState.isKeyboardVisible;
    if (isWindowTextInputOn) {
      const fieldX = appState.sidebarWidth + PAGE_PADDING;
      startTextInput(fieldX, STATUS_BAR_HEIGHT + 100, width() - fieldX - PAGE_PADDING, 46);
    } else {
      stopTextInput();
    }
  }
  if (!appState.isKeyboardVisible) return;
  const eventsCount = keyCount();
  for (let index = 0; index < eventsCount; index++) {
    const kind = keyKind(index);
    const name = keyName(index);
    if (kind === KeyKind.Text) {
      handleTypedKeyboardKey(name);
    } else if (kind === KeyKind.Down && name === 'Escape') {
      appState.isKeyboardVisible = false;
      uiState.dirty = true;
    } else if ((kind === KeyKind.Down || kind === KeyKind.Repeat) && name === 'Backspace') {
      // Held: it goes on erasing
      handleTypedKeyboardKey('back');
    } else if (kind === KeyKind.Down && name === 'Enter') {
      handleTypedKeyboardKey('enter');
    }
  }
}

function processUserInput(deltaSeconds: number): void {
  const isDown = pointerDown();
  const currentX = pointerX();
  const currentY = pointerY();

  uiState.pointerX = currentX;
  uiState.pointerY = currentY;

  if (isDown) {
    pointerIdleSeconds = 0;
  }

  if (isDown && !wasPointerDownLastFrame) {
    shouldSwallowCurrentGesture = appState.screenPower.onUserTouch();
    if (!shouldSwallowCurrentGesture) {
      pointerDownStartX = currentX;
      pointerDownStartY = currentY;
      previousPointerX = currentX;
      previousPointerY = currentY;
      hasPointerMovedBeyondThreshold = false;

      const hitInteractiveZone = findTopmostZoneAt(currentX, currentY, true);
      activeDragZone =
        hitInteractiveZone !== null && (hitInteractiveZone as TouchZone).onDragCallback !== null
          ? hitInteractiveZone
          : null;

      isCarouselSwipeAllowed =
        appState.currentPage === PAGE_NOW_PLAYING &&
        (activeDragZone === null ||
          (activeDragZone as TouchZone).id.startsWith('nrow/')) &&
        !appState.isVolumePopoverOpen &&
        !appState.isContextSheetOpen;

      isDraggingCarouselHorizontally = false;
      carouselSwipeInitialSlideX = appState.animatedSlideX;
      carouselSwipeVelocity = 0;

      isDraggingClockFaceVertically = false;
      clockFaceSwipeInitialY = appState.animatedClockFaceY;
      clockFaceSwipeVelocity = 0;

      activeTapZone = activeDragZone === null ? hitInteractiveZone : null;
      uiState.pressedZoneId =
        hitInteractiveZone !== null ? (hitInteractiveZone as TouchZone).id : '';

      const hitScrollZone = findTopmostZoneAt(currentX, currentY, false);
      activeScrollingBox =
        hitScrollZone !== null ? (hitScrollZone as TouchZone).scrollBox : null;
      if (activeScrollingBox !== null) {
        (activeScrollingBox as ScrollBox).velocityY = 0;
        initialScrollOffsetY = (activeScrollingBox as ScrollBox).scrollY;
      }

      if (activeDragZone !== null) {
        const dragCallback = (activeDragZone as TouchZone).onDragCallback as (
          x: number,
          y: number,
          phase: i32
        ) => void;
        dragCallback(currentX, currentY, 0);
      }
    }
    uiState.dirty = true;
  } else if (isDown && !shouldSwallowCurrentGesture) {
    appState.screenPower.idleSeconds = 0;

    if (
      activeDragZone !== null &&
      isCarouselSwipeAllowed &&
      doesNotificationRowYieldToCarousel(
        currentX - pointerDownStartX,
        currentY - pointerDownStartY
      )
    ) {
      const dragCallback = (activeDragZone as TouchZone).onDragCallback as (
        x: number,
        y: number,
        phase: i32
      ) => void;
      dragCallback(currentX, currentY, 3);
      activeDragZone = null;
    }

    if (activeDragZone !== null) {
      const dragCallback = (activeDragZone as TouchZone).onDragCallback as (
        x: number,
        y: number,
        phase: i32
      ) => void;
      dragCallback(currentX, currentY, 1);
      uiState.dirty = true;
    } else {
      const deltaFromStartX = currentX - pointerDownStartX;
      const deltaFromStartY = currentY - pointerDownStartY;

      if (
        !hasPointerMovedBeyondThreshold &&
        (Math.abs(deltaFromStartY) > 12 || Math.abs(deltaFromStartX) > 12)
      ) {
        hasPointerMovedBeyondThreshold = true;
        uiState.pressedZoneId = '';
        uiState.dirty = true;
        isDraggingCarouselHorizontally =
          isCarouselSwipeAllowed &&
          Math.abs(deltaFromStartX) > Math.abs(deltaFromStartY);
        isDraggingClockFaceVertically =
          isCarouselSwipeAllowed &&
          !isDraggingCarouselHorizontally &&
          appState.targetSlideIndex === SLIDE_CLOCK &&
          appState.animatedSlideX === SLIDE_CLOCK;
      }

      if (isDraggingClockFaceVertically) {
        const contentHeight = height() - STATUS_BAR_HEIGHT;
        appState.animatedClockFaceY = Math.max(
          -0.12,
          Math.min(
            CLOCK_FACE_COUNT - 1 + 0.12,
            clockFaceSwipeInitialY - deltaFromStartY / contentHeight
          )
        );
        if (deltaSeconds > 0) {
          const instantaneousVelocity =
            -(currentY - previousPointerY) / contentHeight / deltaSeconds;
          clockFaceSwipeVelocity =
            clockFaceSwipeVelocity * 0.3 + instantaneousVelocity * 0.7;
        }
        uiState.dirty = true;
      }

      if (isDraggingCarouselHorizontally) {
        const screenWidth = width();
        appState.animatedSlideX = Math.max(
          -0.12,
          Math.min(
            SLIDE_COUNT - 1 + 0.12,
            carouselSwipeInitialSlideX - deltaFromStartX / screenWidth
          )
        );
        if (deltaSeconds > 0) {
          const instantaneousVelocity =
            -(currentX - previousPointerX) / screenWidth / deltaSeconds;
          carouselSwipeVelocity =
            carouselSwipeVelocity * 0.3 + instantaneousVelocity * 0.7;
        }
        uiState.dirty = true;
      }

      if (hasPointerMovedBeyondThreshold && activeScrollingBox !== null) {
        const scrollBox = activeScrollingBox as ScrollBox;
        scrollBox.scrollY = initialScrollOffsetY - deltaFromStartY;
        scrollBox.clamp();
        if (deltaSeconds > 0) {
          const instantaneousVelocity =
            -(currentY - previousPointerY) / deltaSeconds;
          scrollBox.velocityY =
            scrollBox.velocityY * 0.3 + instantaneousVelocity * 0.7;
        }
        uiState.dirty = true;
      }
    }

    previousPointerX = currentX;
    previousPointerY = currentY;
  } else if (!isDown && wasPointerDownLastFrame && !shouldSwallowCurrentGesture) {
    if (isDraggingCarouselHorizontally) {
      const originSlide = Math.round(carouselSwipeInitialSlideX) as i32;
      const slideDisplacement = appState.animatedSlideX - carouselSwipeInitialSlideX;
      const slideStep =
        Math.abs(carouselSwipeVelocity) > 0.8
          ? carouselSwipeVelocity > 0
            ? 1
            : -1
          : Math.abs(slideDisplacement) > 0.2
          ? slideDisplacement > 0
            ? 1
            : -1
          : 0;
      appState.targetSlideIndex = Math.max(
        0,
        Math.min(SLIDE_COUNT - 1, originSlide + slideStep)
      ) as i32;
      if (appState.targetSlideIndex === SLIDE_RINGS) {
        roomsPollTimerSeconds = 99;
      }
      isDraggingCarouselHorizontally = false;
      saveCarouselAndClockPreferences();
    } else if (isDraggingClockFaceVertically) {
      const originFace = Math.round(clockFaceSwipeInitialY) as i32;
      const faceDisplacement = appState.animatedClockFaceY - clockFaceSwipeInitialY;
      const faceStep =
        Math.abs(clockFaceSwipeVelocity) > 0.8
          ? clockFaceSwipeVelocity > 0
            ? 1
            : -1
          : Math.abs(faceDisplacement) > 0.2
          ? faceDisplacement > 0
            ? 1
            : -1
          : 0;
      appState.targetClockFaceIndex = Math.max(
        0,
        Math.min(CLOCK_FACE_COUNT - 1, originFace + faceStep)
      ) as i32;
      isDraggingClockFaceVertically = false;
      saveCarouselAndClockPreferences();
    } else if (activeDragZone !== null) {
      const dragCallback = (activeDragZone as TouchZone).onDragCallback as (
        x: number,
        y: number,
        phase: i32
      ) => void;
      dragCallback(currentX, currentY, 2);
    } else if (
      !hasPointerMovedBeyondThreshold &&
      activeTapZone !== null &&
      (activeTapZone as TouchZone).containsPoint(currentX, currentY) &&
      (activeTapZone as TouchZone).onTapCallback !== null
    ) {
      const tapCallback = (activeTapZone as TouchZone).onTapCallback as () => void;
      tapCallback();
    }

    if (!hasPointerMovedBeyondThreshold && activeScrollingBox !== null) {
      (activeScrollingBox as ScrollBox).velocityY = 0;
    }

    activeDragZone = null;
    activeTapZone = null;
    uiState.pressedZoneId = '';
    uiState.dirty = true;
  }

  wasPointerDownLastFrame = isDown;
  processWheelInput(deltaSeconds, currentX, currentY);
  processDesktopKeyboard();
}

// ----------------------------------------------------------------------------
// Préchargement des listes et préchauffage des pages en arrière-plan
// ----------------------------------------------------------------------------

let hasStartedPreload = false;
const warmRenderQueue: i32[] = [];
let warmRenderOffscreenImage: i32 = -1;

async function preloadCatalogListsAndQueueWarmup(): Promise<void> {
  if (hasStartedPreload) return;
  hasStartedPreload = true;
  await sleepMilliseconds(2000);

  loadPopularRadios();
  if (appState.spotifyClient.ready()) {
    await spotifyCatalog.preload();
  }
  while (appState.popularStationsState === 'loading') {
    await sleepMilliseconds(200);
  }

  const warmupTargets: i32[] = [
    PAGE_NOW_PLAYING * 10 + SLIDE_CLOCK,
    PAGE_NOW_PLAYING * 10 + SLIDE_WEATHER,
    PAGE_NOW_PLAYING * 10 + SLIDE_RINGS,
    PAGE_NOW_PLAYING * 10 + SLIDE_NOTIFICATIONS,
    PAGE_RADIOS * 10,
    PAGE_RADIOS * 10 + 1,
    PAGE_SPOTIFY * 10,
    PAGE_SPOTIFY * 10 + 1,
    PAGE_SPOTIFY * 10 + 2,
    PAGE_SPOTIFY * 10 + 3,
    PAGE_ROOMS * 10,
    PAGE_SETTINGS * 10,
  ];
  for (let index = 0; index < warmupTargets.length; index++) {
    warmRenderQueue.push(warmupTargets[index]);
  }
}

function warmRenderSinglePageOffscreen(screenWidth: number, screenHeight: number): void {
  const targetCode = warmRenderQueue.shift() as i32;
  if (warmRenderOffscreenImage < 0) {
    warmRenderOffscreenImage = createImage(screenWidth as i32, screenHeight as i32);
  }

  const savedPage = appState.currentPage;
  const savedRadioTab = appState.activeRadioTab;
  const savedSpotifyTab = appState.activeSpotifyTab;
  const savedKeyboard = appState.isKeyboardVisible;
  const savedVolumePopover = appState.isVolumePopoverOpen;
  const savedContextSheet = appState.isContextSheetOpen;
  const savedSlideX = appState.animatedSlideX;

  appState.currentPage = Math.floor(targetCode / 10) as i32;
  if (appState.currentPage === PAGE_NOW_PLAYING) appState.animatedSlideX = targetCode % 10;
  if (appState.currentPage === PAGE_RADIOS) appState.activeRadioTab = targetCode % 10;
  if (appState.currentPage === PAGE_SPOTIFY) appState.activeSpotifyTab = targetCode % 10;
  appState.isKeyboardVisible = false;
  appState.isVolumePopoverOpen = false;
  appState.isContextSheetOpen = false;
  const savedSidebarWidth = appState.sidebarWidth;
  appState.sidebarWidth = sidebarWidthForCurrentPage();
  const wasAnimating = uiState.animating;

  // The page node alone, never mounted in the live tree: no onAddedToStage (network calls), no zone left behind
  const warmPageNode = allPageNodes[appState.currentPage];
  const contentHeight = screenHeight - STATUS_BAR_HEIGHT;
  warmPageNode.width = screenWidth;
  warmPageNode.height = contentHeight;
  const touchZonesOnScreen = takeTouchZones();
  spotifyCatalog.isOffline = true;
  beginImage(warmRenderOffscreenImage);
  clear(COLOR_BACKGROUND);
  warmPageNode.layoutAndRender(screenWidth, contentHeight, 0, STATUS_BAR_HEIGHT);
  endImage();
  spotifyCatalog.isOffline = false;
  restoreTouchZones(touchZonesOnScreen);
  uiState.animating = wasAnimating;
  appState.sidebarWidth = savedSidebarWidth;

  if (warmRenderQueue.length === 0) {
    destroyImage(warmRenderOffscreenImage);
    warmRenderOffscreenImage = -1;
  }

  appState.currentPage = savedPage;
  appState.activeRadioTab = savedRadioTab;
  appState.activeSpotifyTab = savedSpotifyTab;
  appState.isKeyboardVisible = savedKeyboard;
  appState.isVolumePopoverOpen = savedVolumePopover;
  appState.isContextSheetOpen = savedContextSheet;
  appState.animatedSlideX = savedSlideX;
  // The screen keeps its frame: endImage took the warm-up's commands out of this frame's list
}

function prefetchNextIdleArtwork(): void {
  const radioLists: RadioStation[][] = [appState.myStations, appState.popularStations];
  for (let listIndex = 0; listIndex < radioLists.length; listIndex++) {
    const stationList = radioLists[listIndex];
    for (let stationIndex = 0; stationIndex < stationList.length; stationIndex++) {
      if (!prefetchPicture(stationList[stationIndex].artworkUrl)) return;
    }
  }
  for (let tabIndex = 0; tabIndex < LIBRARY_KEYS.length; tabIndex++) {
    const loaded = spotifyCatalog.loadedList(LIBRARY_KEYS[tabIndex]);
    if (loaded === null) continue;
    const items = loaded as Item[];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      // the grids (playlists, albums) show the large covers, the rows the small ones
      if (!prefetchPicture(tabIndex < 2 ? item.art : item.thumb)) return;
    }
  }
}

// ----------------------------------------------------------------------------
// Boucle principale (onFrame)
// ----------------------------------------------------------------------------

let lastDrawnVeilOpacity = 0;
let groupPollTimerSeconds = 0;
let topologyPollTimerSeconds = 0;
let roomsPollTimerSeconds = 0;
let spotifyPollTimerSeconds = 0;
let oneSecondClockTimer = 0;
let lastDisplayedMinute: i32 = -1;
let lastDisplayedSecond: i32 = -1;

function wakeScreenForNotification(minimumSeconds: number): void {
  if (appState.screenPower.wakeForDuration(minimumSeconds)) {
    groupPollTimerSeconds = 99;
    topologyPollTimerSeconds = 99;
  }
  uiState.dirty = true;
}

const isPerfLoggingEnabled = exists('/tmp/music-perf');
let previousDecodedCount = 0;
let previousDecodeTotalMs = 0;

function logFramePerformanceIfEnabled(deltaSeconds: number, drawDurationMs: number): void {
  if (!isPerfLoggingEnabled) return;
  const stats = getPictureDecodeStats();
  const decodedThisFrame = stats[0] - previousDecodedCount;
  const decodeMsThisFrame = stats[1] - previousDecodeTotalMs;
  previousDecodedCount = stats[0];
  previousDecodeTotalMs = stats[1];

  if (deltaSeconds < 0.03 && drawDurationMs < 12 && decodedThisFrame === 0) return;
  try {
    appendText(
      '/tmp/music-perf.log',
      `${Math.round(appState.elapsedAppClockSeconds * 1000)} page ${
        appState.currentPage
      } dt ${Math.round(deltaSeconds * 1000)} draw ${Math.round(
        drawDurationMs
      )} decodes ${decodedThisFrame} ${Math.round(decodeMsThisFrame)}ms\n`
    );
  } catch (error) {
    /* /tmp plein */
  }
}

onFrame((deltaSeconds: number) => {
  const screenWidth = width();
  const screenHeight = height();

  appState.elapsedAppClockSeconds += deltaSeconds;
  tickPicturesClock();

  const wasScreenAsleep = appState.screenPower.asleep;
  processUserInput(deltaSeconds);

  appState.screenPower.standbyMode =
    appState.currentPage === PAGE_NOW_PLAYING &&
    appState.targetSlideIndex === SLIDE_CLOCK;

  if (appState.screenPower.tick(deltaSeconds)) {
    appState.isVolumePopoverOpen = false;
    appState.isKeyboardVisible = false;
    appState.currentPage = PAGE_NOW_PLAYING;
    uiState.dirty = true;
  }

  if (wasScreenAsleep && !appState.screenPower.asleep) {
    groupPollTimerSeconds = 99;
    topologyPollTimerSeconds = 99;
    uiState.dirty = true;
  }

  // Scrutation réseau (fréquente écran allumé, ralentie par 10 écran éteint)
  const sleepSlowdownFactor = appState.screenPower.asleep ? 10 : 1;
  groupPollTimerSeconds += deltaSeconds;
  topologyPollTimerSeconds += deltaSeconds;
  roomsPollTimerSeconds += deltaSeconds;
  spotifyPollTimerSeconds += deltaSeconds;
  oneSecondClockTimer += deltaSeconds;

  if (groupPollTimerSeconds >= 2 * sleepSlowdownFactor) {
    groupPollTimerSeconds = 0;
    if (appState.volumeHoldCooldownSeconds <= 0) {
      pollActiveSonosGroup();
    }
  }
  if (topologyPollTimerSeconds >= 15 * sleepSlowdownFactor) {
    topologyPollTimerSeconds = 0;
    pollSonosTopology();
  }
  if (
    appState.sonosSystem === null &&
    !appState.isFindingSpeakers &&
    topologyPollTimerSeconds === 0
  ) {
    discoverSonosSystem();
  }
  if (
    (appState.currentPage === PAGE_ROOMS ||
      (appState.currentPage === PAGE_NOW_PLAYING &&
        appState.targetSlideIndex === SLIDE_RINGS)) &&
    roomsPollTimerSeconds >= 4 &&
    !appState.screenPower.asleep
  ) {
    roomsPollTimerSeconds = 0;
    if (appState.volumeHoldCooldownSeconds <= 0) {
      pollAllRoomVolumes();
    }
  }
  if (appState.isVolumePopoverOpen && roomsPollTimerSeconds >= 1) {
    roomsPollTimerSeconds = 0;
    if (appState.volumeHoldCooldownSeconds <= 0) {
      pollActiveGroupMemberVolumes();
    }
  }
  if (
    appState.currentPage === PAGE_NOW_PLAYING &&
    appState.activeGroup !== null &&
    (appState.activeGroup as Group).track.source === 'spotify' &&
    spotifyPollTimerSeconds >= 5 &&
    !appState.screenPower.asleep
  ) {
    spotifyPollTimerSeconds = 0;
    pollSpotifyPlaybackState();
  } else if (
    appState.currentPage === PAGE_NOW_PLAYING &&
    appState.targetSlideIndex === SLIDE_PLAYER &&
    appState.spotifyClient.ready() &&
    spotifyPollTimerSeconds >= 8 &&
    !appState.screenPower.asleep
  ) {
    // what the account plays elsewhere ("Reprendre ici")
    spotifyPollTimerSeconds = 0;
    pollSpotifyPlaybackState();
  }
  tickQueueContinuation();
  if (appState.volumeHoldCooldownSeconds > 0) {
    appState.volumeHoldCooldownSeconds -= deltaSeconds;
  }

  tickWeatherService(deltaSeconds, !appState.screenPower.asleep);
  tickNotificationRelay(deltaSeconds);
  tickSpotifyAccount(deltaSeconds);

  // Mise à jour de tous les nœuds actifs de l'arbre d'affichage (StatusBar, ToastLayer, etc.)
  stage.updateTree(deltaSeconds);

  if (appState.screenPower.peeking && !hasActiveStandByOverlay()) {
    appState.screenPower.endNotificationPeek();
    uiState.dirty = true;
  }

  if (appState.isVolumePopoverOpen && activeDragZone === null) {
    appState.volumePopoverRemainingSeconds -= deltaSeconds;
    if (appState.volumePopoverRemainingSeconds <= 0) {
      appState.isVolumePopoverOpen = false;
      uiState.dirty = true;
    }
  }

  // Inertie des listes déroulantes
  let isAnyScrollMoving = false;
  for (let index = 0; index < appState.pageScrollBoxes.length; index++) {
    if (appState.pageScrollBoxes[index].stepInertia(deltaSeconds)) {
      uiState.dirty = true;
      isAnyScrollMoving = true;
    }
  }

  // Avancement de l'horloge d'animations GSAP
  gsap.tick(Math.min(deltaSeconds, 0.1));
  if (gsap.active() && !isStandByOverlayHoldingStill()) {
    uiState.dirty = true;
    isAnyScrollMoving = true;
  }

  // Atterrissage fluide du carrousel horizontal
  if (isDraggingCarouselHorizontally) {
    if (appState.isSettlingSlideX) {
      gsap.killTweensOf(carouselGsapTarget);
      appState.isSettlingSlideX = false;
    }
  } else {
    if (
      appState.isSettlingSlideX &&
      appState.settlingSlideTarget !== appState.targetSlideIndex
    ) {
      gsap.killTweensOf(carouselGsapTarget);
      appState.isSettlingSlideX = false;
    }
    if (
      !appState.isSettlingSlideX &&
      appState.animatedSlideX !== appState.targetSlideIndex
    ) {
      appState.isSettlingSlideX = true;
      appState.settlingSlideTarget = appState.targetSlideIndex;
      carouselGsapTarget.x = appState.animatedSlideX;
      gsap
        .to(carouselGsapTarget, {
          x: appState.targetSlideIndex,
          duration: 0.55,
          ease: 'power3.out',
        })
        .onComplete(() => {
          appState.isSettlingSlideX = false;
        });
    }
  }
  if (appState.isSettlingSlideX) {
    appState.animatedSlideX = carouselGsapTarget.x;
  }

  // Atterrissage fluide du cadran vertical de l'horloge
  if (!isDraggingClockFaceVertically) {
    if (
      appState.isSettlingFaceY &&
      appState.settlingFaceTarget !== appState.targetClockFaceIndex
    ) {
      gsap.killTweensOf(clockFaceGsapTarget);
      appState.isSettlingFaceY = false;
    }
    if (
      !appState.isSettlingFaceY &&
      appState.animatedClockFaceY !== appState.targetClockFaceIndex
    ) {
      appState.isSettlingFaceY = true;
      appState.settlingFaceTarget = appState.targetClockFaceIndex;
      clockFaceGsapTarget.y = appState.animatedClockFaceY;
      gsap
        .to(clockFaceGsapTarget, {
          y: appState.targetClockFaceIndex,
          duration: 0.5,
          ease: 'power3.out',
        })
        .onComplete(() => {
          appState.isSettlingFaceY = false;
        });
    }
  } else if (appState.isSettlingFaceY) {
    gsap.killTweensOf(clockFaceGsapTarget);
    appState.isSettlingFaceY = false;
  }
  if (appState.isSettlingFaceY) {
    appState.animatedClockFaceY = clockFaceGsapTarget.y;
  }

  // Animation d'ouverture des popovers
  const isAnyPopoverOpenNow =
    appState.isContextSheetOpen || appState.isVolumePopoverOpen;
  if (isAnyPopoverOpenNow && !appState.wasAnyPopoverOpen) {
    gsap.killTweensOf(popoverRiseGsapTarget);
    popoverRiseGsapTarget.y = 28;
    gsap.to(popoverRiseGsapTarget, { y: 0, duration: 0.3, ease: 'back.out(1.4)' });
  }
  appState.wasAnyPopoverOpen = isAnyPopoverOpenNow;

  // Rafraîchissement à la seconde exacte lorsque l'horloge StandBy est visible
  if (
    appState.currentPage === PAGE_NOW_PLAYING &&
    appState.animatedSlideX > 0 &&
    appState.animatedSlideX < 2 &&
    !appState.screenPower.asleep
  ) {
    const currentSecond = new Date().getSeconds() as i32;
    if (currentSecond !== lastDisplayedSecond) {
      lastDisplayedSecond = currentSecond;
      uiState.dirty = true;
    }
  }

  if (oneSecondClockTimer >= 1) {
    oneSecondClockTimer = 0;
    if (
      appState.currentPage === PAGE_NOW_PLAYING &&
      appState.activeGroup !== null &&
      (appState.activeGroup as Group).playing()
    ) {
      uiState.dirty = true;
    }
    const currentMinute = getCurrentClockParts()[1];
    if (currentMinute !== lastDisplayedMinute) {
      lastDisplayedMinute = currentMinute;
      uiState.dirty = true;
    }
  }

  // Décodage d'images et préchargement pendant les temps morts
  pointerIdleSeconds += deltaSeconds;
  if (appState.screenPower.asleep && appState.screenPower.peeking) {
    // a song's notification shows its cover on the sleeping screen
    if (decodeNextPicture()) uiState.dirty = true;
  } else if (!pointerDown() && !isAnyScrollMoving && !appState.screenPower.asleep) {
    if (decodeNextPicture()) {
      uiState.dirty = true;
    } else if (pointerIdleSeconds > 1 && warmRenderQueue.length > 0) {
      warmRenderSinglePageOffscreen(screenWidth, screenHeight);
    } else if (pointerIdleSeconds > 1.5) {
      prefetchNextIdleArtwork();
    }
  }

  if (
    appState.screenPower.veilOpacity !== lastDrawnVeilOpacity &&
    !appState.screenPower.asleep
  ) {
    uiState.dirty = true;
  }
  if (uiState.animating && !appState.screenPower.asleep) {
    uiState.dirty = true;
  }

  if (!uiState.dirty) {
    keep();
    return;
  }

  uiState.dirty = false;
  uiState.animating = false;
  clearTouchZones();

  if (appState.screenPower.asleep) {
    clear(0x000000);
    if (appState.screenPower.peeking) {
      drawNotificationOverlayLayer(screenWidth, screenHeight, STATUS_BAR_HEIGHT);
    }
    return;
  }

  const drawStartTime = performance.now();
  renderFullApplicationStage(screenWidth, screenHeight);
  lastDrawnVeilOpacity = appState.screenPower.veilOpacity;

  if (appState.screenPower.veilOpacity > 0) {
    rrect(
      0,
      0,
      screenWidth,
      screenHeight,
      0,
      0x000000,
      Math.round(appState.screenPower.veilOpacity * 255) as i32
    );
  }
  logFramePerformanceIfEnabled(deltaSeconds, performance.now() - drawStartTime);
});

// ----------------------------------------------------------------------------
// Initialisation au démarrage
// ----------------------------------------------------------------------------

if (
  appState.config.weatherLatitude !== 0 ||
  appState.config.weatherLongitude !== 0
) {
  setWeatherLocation(
    appState.config.weatherLatitude,
    appState.config.weatherLongitude,
    appState.config.weatherCityName
  );
}

restoreCarouselAndClockPreferences();
discoverSonosSystem();
startRemoteUdpListener();
preloadCatalogListsAndQueueWarmup();

setNotificationsShown(appState.config.macNotificationsShown);
startNotificationRelay(
  (notification: MacNotification) => {
    appState.isVolumePopoverOpen = false;
    appState.isContextSheetOpen = false;
    if (!appState.screenPower.beginNotificationPeek()) {
      wakeScreenForNotification(12);
    }
  },
  () =>
    appState.screenPower.asleep ||
    (appState.currentPage === PAGE_NOW_PLAYING &&
      appState.targetSlideIndex === SLIDE_CLOCK)
);
