// Lumen: display control in the menu bar (zinc:monitors), no Dock icon and no window of its own but the panel that opens under its icon.
// The process keeps running with the panel hidden: virtual displays and software dimming end with it.
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { createNodeRef, render } from 'zinc:ui/solid';
import * as win from 'zinc:system/window';
import * as tray from 'zinc:system/tray';
import * as shortcut from 'zinc:system/shortcut';
import * as power from 'zinc:system/power';
import { Panel } from './panel/Panel';
import { PANEL_RADIUS, setIsDark } from './theme';
import { nudgeBrightness, selectDisplay, selectedId, setOpenRow, startMonitoring } from './state';

const PANEL_WIDTH = 300, PANEL_GAP_BELOW_ICON = 6, SCREEN_MARGIN = 40, MIN_PANEL_HEIGHT = 120;
const BRIGHTNESS_STEP = 0.05;
/** A click on the icon while the panel is open first hides it (blur): the same click must not open it again. */
const REOPEN_GUARD_MS = 250;
/** The menu bar gives a new icon its place a moment after it is created. */
const ICON_SETTLE_MS = 500;

const contentRef = createNodeRef();
let icon: tray.Tray | null = null;
let panelShown = false;
let panelHeight = 0;
let hiddenAt = -REOPEN_GUARD_MS;

/** The panel hangs from the icon: AppKit's y goes up, so the window's bottom moves whenever its height changes. */
function placeUnderIcon(): void {
  if (icon === null) return;
  const b = icon.bounds();
  win.setPosition(Math.round(b.x + b.w / 2 - PANEL_WIDTH / 2), Math.round(b.y - PANEL_GAP_BELOW_ICON - panelHeight));
}
function showPanel(): void {
  panelShown = true;
  placeUnderIcon();
  win.show();
  // After the panel is on screen, as a DDC read takes 50 ms a value. Asked again at each opening: buttons on the monitor change them too, and a
  // monitor that was waking up did not answer the last time.
  setTimeout(() => selectDisplay(selectedId()), 1);
}
function hidePanel(): void {
  panelShown = false;
  hiddenAt = sys.clock();
  win.hide();
}
function togglePanel(): void {
  if (panelShown) hidePanel();
  else if (sys.clock() - hiddenAt > REOPEN_GUARD_MS) showPanel();
}

/** The window follows its content, up to what the screen leaves. */
function fitWindowToContent(): void {
  const content = ui.inspectNode(contentRef.node);
  if (content === null || content.lh <= 0) return;
  const screens = win.displays();
  const most = screens.length > 0 ? screens[0].h - SCREEN_MARGIN * 2 : content.lh;
  const wanted = Math.max(MIN_PANEL_HEIGHT, Math.min(most, Math.ceil(content.lh)));
  if (wanted === panelHeight) return;
  panelHeight = wanted;
  if (icon === null) { win.setSize(PANEL_WIDTH, wanted); return; }
  const b = icon.bounds();
  win.setFrame(Math.round(b.x + b.w / 2 - PANEL_WIDTH / 2), Math.round(b.y - PANEL_GAP_BELOW_ICON - wanted), PANEL_WIDTH, wanted);   // in one move: the top stays under the icon while the section unfolds
}

async function main(): Promise<void> {
  setIsDark(power.isDark());
  power.onAppearance((mode: string) => setIsDark(mode === 'dark'));
  startMonitoring();
  render(() => <Panel contentRef={contentRef} />, 0x000000, (dt: number) => fitWindowToContent());
  win.setVibrancy('menu', PANEL_RADIUS);
  win.hide();
  // A capture runs in the background and never has the keyboard: the panel would hide as soon as it opened.
  const openForCapture = sys.env('LUMEN_OPEN') === '1';
  if (!openForCapture) win.onBlur(() => { if (panelShown) hidePanel(); });

  const options = new tray.Options('lumen');
  options.symbol = 'sun.max';
  options.tooltip = 'Lumen';
  options.menuOnLeftClick = false;
  icon = await tray.create(options);
  icon.onClick((button: string, double: boolean) => togglePanel());
  shortcut.register('Control+Alt+Up', () => nudgeBrightness(BRIGHTNESS_STEP));
  shortcut.register('Control+Alt+Down', () => nudgeBrightness(-BRIGHTNESS_STEP));
  if (openForCapture) {
    setOpenRow(sys.env('LUMEN_OPEN_ROW'));
    setTimeout(showPanel, ICON_SETTLE_MS);
  }
}
main();
