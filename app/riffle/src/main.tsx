// Riffle: hold Cmd, press Tab, go to any window, in the order they were last used. No Dock icon: a menu bar icon, and one window that is either the list or the settings.
import * as sys from 'zinc:sys';
import { render } from 'zinc:ui/solid';
import * as win from 'zinc:system/window';
import * as power from 'zinc:system/power';
import * as autostart from 'zinc:system/autostart';
import * as instance from 'zinc:system/instance';
import { quit } from 'zinc:system';
import * as D from 'zinc:desktop-windows';
import { Picker } from './Picker';
import { applyTrayIcon, setupTrayMenu } from './trayIcon';
import { SettingsPanel, changeStartAtLogin, changeTrayIcon, hasAccessibility, setHasAccessibility, setRecordingHotkey, setStartsAtLogin, startsAtLogin } from './SettingsPanel';
import { leaveHold, mode, openPickerForCapture, setMode, setRecordedHandler, startSwitching, probeWindows, countFrame } from './switcher';
import { settings, updateSettings } from './settings';
import { PANEL_RADIUS, isDark, setSystemDark } from './theme';

const SETTINGS_WIDTH = 460, SETTINGS_HEIGHT = 520;
const PERMISSION_POLL_MS = 1000;

function openSettings(): void {
  leaveHold();
  setHasAccessibility(D.hasPermission(false));
  D.endOverlay();
  setMode('settings');
  win.setSize(SETTINGS_WIDTH, SETTINGS_HEIGHT);
  win.center();
  win.show();
}
function closeSettings(): void {
  setMode('hidden');
  setRecordingHotkey(false);
  D.recordHotkey(false);
  win.hide();
}

/** The permission can come at any moment after the launch: the shortcut starts working as soon as it does, with no restart. */
function startWhenAllowed(): void {
  if (D.start()) { setHasAccessibility(true); return; }
  setHasAccessibility(false);
  openSettings();
  const poll = setInterval(() => {
    if (!D.start()) return;
    clearInterval(poll);
    setHasAccessibility(true);
  }, PERMISSION_POLL_MS);
}

function applyRecordedChord(value: number): void {
  setRecordingHotkey(false);
  if (value < 0) return;
  const modifiers = Math.floor(value / D.RECORDED_MODIFIER_UNIT);
  const keyCode = value - modifiers * D.RECORDED_MODIFIER_UNIT;
  updateSettings({ ...settings(), keyCode: keyCode, modifiers: modifiers });
  D.setHotkey(keyCode, modifiers);
}

async function main(): Promise<void> {
  // A capture, a test or a probe looks; it never stands in for the running app, nor gives way to it.
  const opened = sys.env('RIFFLE_OPEN');
  const probeSeconds = Number(sys.env('RIFFLE_PROBE_SECONDS'));
  if (opened === '' && !(probeSeconds > 0)) {
    const isFirstCopy = await instance.lock((cwd: string, argv: string[]) => openSettings());
    if (!isFirstCopy) { quit(); return; }
  }
  setSystemDark(power.isDark());
  power.onAppearance((appearance: string) => setSystemDark(appearance === 'dark'));
  setStartsAtLogin(await autostart.isEnabled());

  render(() => <Show when={mode() === 'settings'} fallback={<Picker onSettings={openSettings} onToggleTray={changeTrayIcon} onQuit={() => quit()} />}><SettingsPanel onClose={closeSettings} /></Show>, 0x000000, (dt: number) => {
    applyWindowLook();
    countFrame();
  });
  win.hide();
  setRecordedHandler(applyRecordedChord);
  win.onBlur(() => { if (mode() === 'settings' && hasAccessibility()) closeSettings(); });
  startSwitching();

  // RIFFLE_PROBE_SECONDS=n: prints what is seen, for n seconds, without the hotkey and without showing anything: safe next to another switcher.
  if (probeSeconds > 0) { probeWindows(probeSeconds); return; }

  // RIFFLE_OPEN=picker | settings: a capture or a test looks at a screen with nobody holding keys; it starts neither the tap nor the observers.
  if (opened === 'picker') { openPickerForCapture(); return; }
  if (opened === 'settings') { setMode('settings'); return; }
  setupTrayMenu(startsAtLogin, openSettings, () => changeStartAtLogin(!startsAtLogin()), () => quit());
  await applyTrayIcon();
  startWhenAllowed();
}

let appliedBlur = '';
let appliedDark = -1;
/** What the window itself shows, behind the UI, goes with the settings; asked once per change, not per frame. */
function applyWindowLook(): void {
  const blur = settings().blur ? 'menu' : '';
  if (blur !== appliedBlur) {
    appliedBlur = blur;
    win.setVibrancy(blur, PANEL_RADIUS);
  }
  const dark = isDark() ? 1 : 0;
  if (dark !== appliedDark) {
    appliedDark = dark;
    D.setDarkAppearance(dark === 1);
  }
}
main();
