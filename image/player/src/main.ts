// ============================================================================
// main.ts — The stage, the input and the frame loop
// ============================================================================
//
//   Stage
//   ├── PageContainer: the page mounted (HomePageNode, CrashPageNode or SettingsPageNode)
//   ├── TopBarNode (0, 0, width, TOP_BAR_HEIGHT)
//   └── TextFormNode: the form and the on-screen keyboard, over everything while a value is asked
//
// A frame is drawn only when something changed (`uiState.dirty`): an input, an answer of zinc-admin, the clock's
// minute, a frame of the home page's animation. For tests: ZINC_PLAYER_TRACE_FRAMES=1 prints "drawn <frame>" for each
// one drawn, and ZINC_PLAYER_POLL_MS=n waits up to n ms a frame for zinc-admin's answers (headless frames are unpaced:
// thousands go by while a child process starts).

import {
  Cursor,
  KeyKind,
  Mod,
  escapeByApp,
  frame,
  height,
  keep,
  keyCount,
  keyKind,
  keyMods,
  keyName,
  onFrame,
  pointerDown,
  pointerX,
  pointerY,
  scrollDY,
  setCursor,
  startTextInput,
  stopTextInput,
  wheel,
  width,
} from 'zinc:gfx';
import * as sys from 'zinc:sys';
import { PAGE_CRASH, PAGE_SETTINGS, TOP_BAR_HEIGHT } from './constants';
import { DisplayObject, Stage } from './core/display';
import {
  ScrollBox,
  TouchZone,
  activateFocusedZone,
  clearTouchZones,
  findTopmostZoneAt,
  moveFocus,
  scrollBoxUnderPointerByWheel,
  uiState,
} from './core/input';
import {
  appState,
  closeForm,
  eraseInForm,
  goBack,
  hideScreenKeyboard,
  startRefreshing,
  submitForm,
  typeIntoForm,
} from './state';
import { TopBarNode } from './components/top-bar';
import { TextFormNode } from './components/text-form';
import { HomePageNode } from './pages/home/home-page';
import { CrashPageNode } from './pages/crash/crash-page';
import { SettingsPageNode } from './pages/settings/settings-page';

const WHEEL_STEP_PIXELS = 48;
const TAP_SLOP_PIXELS = 10;
const isFrameTraceOn = sys.env('ZINC_PLAYER_TRACE_FRAMES') === '1';
const pollMilliseconds = parseInt(sys.env('ZINC_PLAYER_POLL_MS') === '' ? '0' : sys.env('ZINC_PLAYER_POLL_MS')) as i32;

// ----------------------------------------------------------------------------
// The tree, built once
// ----------------------------------------------------------------------------

const stage = new Stage();
const pageContainer = new DisplayObject('PageContainer');
const homePage = new HomePageNode();
const crashPage = new CrashPageNode();
const settingsPage = new SettingsPageNode();
const topBar = new TopBarNode();
const textForm = new TextFormNode();
stage.addChild(pageContainer);
stage.addChild(topBar);
stage.addChild(textForm);
/** The nodes as big as the screen. */
const screenSizedNodes: DisplayObject[] = [pageContainer, homePage, crashPage, settingsPage, textForm];

let mountedPage = '';

/** Mounts the page `appState.page` names (and the settings' section), sized to the screen. */
function syncMountedPage(screenWidth: number, screenHeight: number): void {
  if (mountedPage !== appState.page) {
    mountedPage = appState.page;
    pageContainer.removeChildren();
    pageContainer.addChild(appState.page === PAGE_SETTINGS ? settingsPage : appState.page === PAGE_CRASH ? crashPage : homePage);
  }
  if (appState.page === PAGE_SETTINGS) settingsPage.syncSection();
  for (let index = 0; index < screenSizedNodes.length; index++) {
    screenSizedNodes[index].width = screenWidth;
    screenSizedNodes[index].height = screenHeight;
  }
  topBar.width = screenWidth;
  topBar.height = TOP_BAR_HEIGHT;
}

// ----------------------------------------------------------------------------
// Pointer: taps, drags that scroll, the wheel, the cursor
// ----------------------------------------------------------------------------

let wasPointerDown = false;
let pressStartX = 0;
let pressStartY = 0;
let previousPointerY = 0;
let hasPointerMoved = false;
let tapZoneUnderPress: TouchZone | null = null;
let scrollBoxUnderPress: ScrollBox | null = null;
let scrollStartY = 0;
let hoverX = -1;
let hoverY = -1;
let currentCursor: Cursor = Cursor.Default;

function processPointer(deltaSeconds: number): void {
  const isDown = pointerDown();
  const x = pointerX();
  const y = pointerY();
  uiState.pointerX = x;
  uiState.pointerY = y;

  if (isDown && !wasPointerDown) {
    appState.inputIdleSeconds = 0;
    uiState.focusedZoneId = '';
    pressStartX = x;
    pressStartY = y;
    previousPointerY = y;
    hasPointerMoved = false;
    tapZoneUnderPress = findTopmostZoneAt(x, y, true);
    uiState.pressedZoneId = tapZoneUnderPress !== null ? (tapZoneUnderPress as TouchZone).id : '';
    const scrollZone = findTopmostZoneAt(x, y, false);
    scrollBoxUnderPress = scrollZone !== null ? (scrollZone as TouchZone).scrollBox : null;
    if (scrollBoxUnderPress !== null) {
      (scrollBoxUnderPress as ScrollBox).velocityY = 0;
      scrollStartY = (scrollBoxUnderPress as ScrollBox).scrollY;
    }
    uiState.dirty = true;
  } else if (isDown) {
    appState.inputIdleSeconds = 0;
    if (!hasPointerMoved && (Math.abs(x - pressStartX) > TAP_SLOP_PIXELS || Math.abs(y - pressStartY) > TAP_SLOP_PIXELS)) {
      hasPointerMoved = true;
      if (scrollBoxUnderPress !== null) uiState.pressedZoneId = '';
      uiState.dirty = true;
    }
    if (hasPointerMoved && scrollBoxUnderPress !== null) {
      const scroll = scrollBoxUnderPress as ScrollBox;
      scroll.scrollY = scrollStartY - (y - pressStartY);
      scroll.clamp();
      if (deltaSeconds > 0) scroll.velocityY = scroll.velocityY * 0.3 + (-(y - previousPointerY) / deltaSeconds) * 0.7;
      uiState.dirty = true;
    }
    previousPointerY = y;
  } else if (wasPointerDown) {
    const zone = tapZoneUnderPress;
    // a press that scrolled a list is no tap; one that wandered off a button but stayed on it still is
    const isTap = zone !== null && (zone as TouchZone).containsPoint(x, y) && !(hasPointerMoved && scrollBoxUnderPress !== null);
    uiState.pressedZoneId = '';
    tapZoneUnderPress = null;
    scrollBoxUnderPress = null;
    uiState.dirty = true;
    if (isTap && (zone as TouchZone).onTapCallback !== null) {
      const onTap = (zone as TouchZone).onTapCallback as () => void;
      onTap();
    }
  }
  wasPointerDown = isDown;

  // A mouse over the screen: the hand over what can be pressed
  if (!isDown && (x !== hoverX || y !== hoverY)) {
    hoverX = x;
    hoverY = y;
    appState.inputIdleSeconds = 0;
    const cursor = findTopmostZoneAt(x, y, true) !== null ? Cursor.Pointer : Cursor.Default;
    if (cursor !== currentCursor) {
      currentCursor = cursor;
      setCursor(cursor);
    }
  }

  const wheelPixels = wheel() * WHEEL_STEP_PIXELS + scrollDY();
  if (wheelPixels !== 0) {
    appState.inputIdleSeconds = 0;
    scrollBoxUnderPointerByWheel(x, y, wheelPixels);
  }
}

// ----------------------------------------------------------------------------
// Keyboard: typing into the form, Tab and the arrows between controls, Enter, Escape
// ----------------------------------------------------------------------------

let isTextInputOn = false;

function processKeyboard(): void {
  const isFormOpen = appState.form.isOpen;
  if (isFormOpen !== isTextInputOn) {
    isTextInputOn = isFormOpen;
    if (isFormOpen) startTextInput(0, 0, width(), height());
    else stopTextInput();
  }
  const count = keyCount();
  for (let index = 0; index < count; index++) {
    appState.inputIdleSeconds = 0;
    const kind = keyKind(index);
    const name = keyName(index);
    const isPress = kind === KeyKind.Down || kind === KeyKind.Repeat;
    if (isFormOpen && kind === KeyKind.Text) {
      typeIntoForm(name);
      hideScreenKeyboard();
      continue;
    }
    if (!isPress) continue;
    if (name === 'Tab') moveFocus((keyMods(index) & Mod.Shift) !== 0 ? -1 : 1);
    else if (name === 'ArrowDown' || name === 'ArrowRight') moveFocus(1);
    else if (name === 'ArrowUp' || name === 'ArrowLeft') moveFocus(-1);
    else if (isFormOpen && name === 'Backspace') eraseInForm();
    else if (isFormOpen && name === 'Enter') {
      if (!activateFocusedZone()) submitForm();
    } else if (isFormOpen && name === 'Escape') closeForm();
    else if (kind === KeyKind.Down && (name === 'Enter' || name === ' ' || name === 'Space')) activateFocusedZone();
    else if (kind === KeyKind.Down && name === 'Escape') goBack();
    uiState.dirty = true;
  }
}

// ----------------------------------------------------------------------------
// The frame loop
// ----------------------------------------------------------------------------

/** A list keeps gliding after a fling. */
function stepScrollInertia(deltaSeconds: number): void {
  const zone = findTopmostZoneAt(uiState.pointerX, uiState.pointerY, false);
  if (zone === null || pointerDown()) return;
  const scroll = (zone as TouchZone).scrollBox as ScrollBox;
  if (scroll.stepInertia(deltaSeconds)) uiState.dirty = true;
}

escapeByApp(true);
startRefreshing();

onFrame((deltaSeconds: number) => {
  if (pollMilliseconds > 0) sys.poll(pollMilliseconds);
  appState.inputIdleSeconds += deltaSeconds;
  processPointer(deltaSeconds);
  processKeyboard();
  stepScrollInertia(deltaSeconds);
  const screenWidth = width();
  const screenHeight = height();
  syncMountedPage(screenWidth, screenHeight);
  stage.updateTree(deltaSeconds);

  if (!uiState.dirty) {
    keep();
    return;
  }
  uiState.dirty = false;
  clearTouchZones();
  stage.renderStage(screenWidth, screenHeight);
  if (isFrameTraceOn) console.log('drawn ' + frame());
});
