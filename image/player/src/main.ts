// ============================================================================
// main.ts — The stage, the input and the frame loop
// ============================================================================
//
//   Stage
//   ├── PageContainer: the page mounted (HomePageNode, AppsPageNode, CrashPageNode or SettingsPageNode)
//   ├── TopBarNode (0, 0, width, TOP_BAR_HEIGHT)
//   ├── DeleteAppDialogNode: "Delete this app?", over everything while it is asked
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
import * as fs from 'zinc:fs';
import * as shell from 'zinc:shell';
import { PAGE_APP, PAGE_APPS, PAGE_CRASH, PAGE_HUB, PAGE_SETTINGS, TOP_BAR_HEIGHT } from './constants';
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
  agentDirectory,
  appState,
  closeForm,
  eraseInForm,
  goBack,
  hideScreenKeyboard,
  isShell,
  startRefreshing,
  startShell,
  followConnectedApp,
  submitForm,
  typeIntoForm,
} from './state';
import { TopBarNode } from './components/top-bar';
import { TextFormNode } from './components/text-form';
import { DeleteAppDialogNode } from './components/delete-app-dialog';
import { HomePageNode } from './pages/home/home-page';
import { CrashPageNode } from './pages/crash/crash-page';
import { AppsPageNode } from './pages/apps/apps-page';
import { SettingsPageNode } from './pages/settings/settings-page';
import { AppPageNode } from './pages/app/app-page';
import { HubPageNode } from './pages/hub/hub-page';
import { installFromEnvironment } from './services/hub';

const WHEEL_STEP_PIXELS = 48;
const TAP_SLOP_PIXELS = 10;
const isFrameTraceOn = sys.env('ZINC_PLAYER_TRACE_FRAMES') === '1';
const pollMilliseconds = parseInt(sys.env('ZINC_PLAYER_POLL_MS') === '' ? '0' : sys.env('ZINC_PLAYER_POLL_MS')) as i32;
let readyWritten: boolean = false;

// ----------------------------------------------------------------------------
// The tree, built once
// ----------------------------------------------------------------------------

const stage = new Stage();
const pageContainer = new DisplayObject('PageContainer');
const homePage = new HomePageNode();
const crashPage = new CrashPageNode();
const settingsPage = new SettingsPageNode();
const appsPage = new AppsPageNode();
const appPage = new AppPageNode();
const hubPage = new HubPageNode();
const topBar = new TopBarNode();
const deleteAppDialog = new DeleteAppDialogNode();
const textForm = new TextFormNode();
stage.addChild(pageContainer);
stage.addChild(topBar);
stage.addChild(deleteAppDialog);
stage.addChild(textForm);
/** The nodes as big as the screen. */
const screenSizedNodes: DisplayObject[] = [pageContainer, homePage, crashPage, settingsPage, appsPage, appPage, hubPage, deleteAppDialog, textForm];

let mountedPage = '';

/** Mounts the page `appState.page` names (and the settings' section), sized to the screen. */
function syncMountedPage(screenWidth: number, screenHeight: number): void {
  if (mountedPage !== appState.page) {
    mountedPage = appState.page;
    pageContainer.removeChildren();
    const page = appState.page;
    pageContainer.addChild(page === PAGE_SETTINGS ? settingsPage : page === PAGE_CRASH ? crashPage : page === PAGE_APPS ? appsPage : page === PAGE_APP ? appPage : page === PAGE_HUB ? hubPage : homePage);
  }
  if (appState.page === PAGE_SETTINGS) settingsPage.syncSection();
  for (let index = 0; index < screenSizedNodes.length; index++) {
    screenSizedNodes[index].width = screenWidth;
    screenSizedNodes[index].height = screenHeight;
  }
  topBar.width = screenWidth;
  topBar.height = appState.page === PAGE_APP ? shell.barHeight() : TOP_BAR_HEIGHT;
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

// ZINC_PLAYER_HUB_INSTALL: install one app from a hub and end (services/hub.ts), for scripts and tests
if (sys.env('ZINC_PLAYER_HUB_INSTALL') !== '') installFromEnvironment(agentDirectory);
escapeByApp(true);
startRefreshing();
startShell();
let shownSerial = -1;

let drawnImage = -1;   // the app image the last drawn frame showed (zinc:shell)
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
  if (isShell) followConnectedApp();
  // the shown app sent a frame: the shell draws it
  if (isShell && appState.page === PAGE_APP && shell.serial() !== shownSerial) {
    shownSerial = shell.serial();
    // on a plane the new buffer shows by itself: keep() offers it again, nothing is drawn (the same image as the frame drawn last)
    if (!uiState.dirty && shell.onPlane() && shell.image() === drawnImage) {
      keep();
      return;
    }
    uiState.dirty = true;
  }

  if (!uiState.dirty) {
    keep();
    return;
  }
  uiState.dirty = false;
  clearTouchZones();
  stage.renderStage(screenWidth, screenHeight);
  drawnImage = isShell && appState.page === PAGE_APP ? shell.image() : -1;
  if (!readyWritten && sys.env('ZINC_PLAYER_READY_FILE') !== '') {
    readyWritten = true;
    try { fs.writeText(sys.env('ZINC_PLAYER_READY_FILE'), 'ready\n'); } catch (e) { /* the updater times out if readiness cannot be reported */ }
  }
  if (isFrameTraceOn) console.log('drawn ' + frame());
});
