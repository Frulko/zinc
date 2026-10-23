// ============================================================================
// state.ts — The player's state and its actions
// ============================================================================
// What the pages show (the app's last crash, the machine, the Wi-Fi networks, the agent's pairing, the form being
// typed) and what they call. Nothing runs at import: main.ts starts the refresh once the stage is mounted.

import * as fs from 'zinc:fs';
import * as os from 'zinc:os';
import * as sys from 'zinc:sys';
import * as network from 'zinc:network';
import {
  BACKGROUND_THEMES,
  CLOCK_INTERVAL_MS,
  CRASH_REPORT_FILE,
  DEFAULT_ADMIN_PATH,
  DEFAULT_APP_PATH,
  DEFAULT_RUN_DIRECTORY,
  EXIT_START_APP,
  KEYBOARD_AZERTY,
  KEYBOARD_QWERTY,
  PAGE_CRASH,
  PAGE_HOME,
  PAGE_REFRESH_INTERVAL_MS,
  PAGE_SETTINGS,
  SECTION_WIFI,
  SETTINGS_REFRESH_INTERVAL_MS,
} from './constants';
import { uiState } from './core/input';
import { CrashReport, deleteCrashReport, readCrashReport } from './services/crash-report';
import { PairingState, readPairingState } from './services/pairing';
import { AdminResult, SystemStatus, parseStatus, runAdmin, statusFromOs } from './services/system';
import { PlayerConfig, loadConfig, saveConfig } from './services/config';

function fromEnv(name: string, fallback: string): string {
  return sys.env(name) === '' ? fallback : sys.env(name);
}

const zincHome = fromEnv('ZINC_HOME', os.homedir() + '/.zinc');
const appPath = fromEnv('ZINC_APP', DEFAULT_APP_PATH);
const crashReportPath = fromEnv('ZINC_RUN', DEFAULT_RUN_DIRECTORY) + '/' + CRASH_REPORT_FILE;
const adminPath = fromEnv('ZINC_ADMIN', DEFAULT_ADMIN_PATH);
const agentDirectory = fromEnv('ZINC_PLAYER_AGENT_DIR', zincHome + '/agent');
const configPath = fromEnv('ZINC_PLAYER_CONFIG', zincHome + '/player.json');
/** The engine's version, which zinc-session passes on (the last word of `zinc --version`: zinc-next 0.6.2). */
const versionWords = sys.env('ZINC_VERSION').trim().split(' ');
export const zincVersion = versionWords[versionWords.length - 1];

/** The text field the overlay form edits (a Wi-Fi password, the country, the name). */
export class TextForm {
  isOpen: boolean = false;
  title: string = '';
  label: string = '';
  value: string = '';
  isSecret: boolean = false;
  isRevealed: boolean = false;
  submitLabel: string = '';
  maxLength: i32 = 64;
  /** 'upper' or 'lower' changes what is typed; '' keeps it. */
  letterCase: string = '';
  error: string = '';
  isBusy: boolean = false;
  onSubmit: ((value: string) => void) | null = null;
}

class AppState {
  page: string = PAGE_HOME;
  settingsSection: string = SECTION_WIFI;
  crashReport: CrashReport | null = null;
  isAppInstalled: boolean = false;
  status: SystemStatus = new SystemStatus();
  network: network.NetworkStatus = new network.NetworkStatus();
  pairing: PairingState = new PairingState();
  networks: network.WifiNetwork[] = [];
  isScanning: boolean = false;
  hasScanned: boolean = false;
  /** The action running ('agent', 'ssh', 'pair', 'wifi/<name>'...): its button waits. */
  busyAction: string = '';
  /** The last sentence about an action (an error, or what it did), and the page it belongs to. */
  message: string = '';
  isMessageError: boolean = false;
  /** 'reboot' or 'poweroff' waiting for its second press. */
  pendingPowerAction: string = '';
  form: TextForm = new TextForm();
  isKeyboardShifted: boolean = false;
  isKeyboardSymbols: boolean = false;
  /** A computer keyboard typed into a form: the on-screen keyboard stays hidden until the field is tapped. */
  isScreenKeyboardHidden: boolean = false;
  config: PlayerConfig = new PlayerConfig();
  clockText: string = '';
  /** Seconds since the last touch, click or key (main.ts counts them). */
  inputIdleSeconds: number = 0;
}

export const appState = new AppState();

// ----------------------------------------------------------------------------
// Reading the machine
// ----------------------------------------------------------------------------

function currentClockText(): string {
  const now = new Date();
  const minutes = now.getMinutes();
  return now.getHours() + ':' + (minutes < 10 ? '0' : '') + minutes;
}

function readPairing(): PairingState {
  return readPairingState(agentDirectory, Date.now() / 1000);
}

/** Reads the machine again; the screen is redrawn only when what the page shows changed. */
export function refreshSystem(): void {
  const installed = fs.exists(appPath);
  if (installed !== appState.isAppInstalled) {
    appState.isAppInstalled = installed;
    uiState.dirty = true;
  }
  const pairing = readPairing();
  if (pairing.signature() !== appState.pairing.signature()) uiState.dirty = true;
  appState.pairing = pairing;
  runAdmin(adminPath, ['status'], '').then((result: AdminResult) => {
    const status = result.code === 0 ? parseStatus(result.output) : statusFromOs();
    if (appState.page === PAGE_SETTINGS || status.pageSignature() !== appState.status.pageSignature()) uiState.dirty = true;
    appState.status = status;
  });
  network.readStatus().then((status: network.NetworkStatus) => {
    if (status.signature() !== appState.network.signature()) uiState.dirty = true;
    appState.network = status;
  });
}

let refreshTicks: i32 = 0;

export function startRefreshing(): void {
  appState.config = loadConfig(configPath);
  appState.crashReport = readCrashReport(crashReportPath);
  if (appState.crashReport !== null) appState.page = PAGE_CRASH;
  appState.status = statusFromOs();
  appState.clockText = currentClockText();
  setInterval(() => {
    refreshTicks++;
    // while the boot starts, the home page follows what it is doing at the settings' pace
    if (appState.page === PAGE_SETTINGS || appState.status.isStarting() || refreshTicks % (PAGE_REFRESH_INTERVAL_MS / SETTINGS_REFRESH_INTERVAL_MS) === 0) refreshSystem();
  }, SETTINGS_REFRESH_INTERVAL_MS);
  setInterval(() => {
    const text = currentClockText();
    if (text !== appState.clockText) {
      appState.clockText = text;
      uiState.dirty = true;
    }
  }, CLOCK_INTERVAL_MS);
}

/** The name a computer reaches the Pi by: the agent's, else the host's. */
export function deviceName(): string {
  if (appState.pairing.deviceName !== '') return appState.pairing.deviceName;
  return appState.status.hostname;
}

// ----------------------------------------------------------------------------
// Navigation
// ----------------------------------------------------------------------------

function setMessage(text: string, isError: boolean): void {
  appState.message = text;
  appState.isMessageError = isError;
  uiState.dirty = true;
}

export function navigateTo(page: string): void {
  appState.page = page;
  appState.pendingPowerAction = '';
  setMessage('', false);
}

export function openSettings(section: string): void {
  appState.settingsSection = section;
  navigateTo(PAGE_SETTINGS);
}

export function selectSettingsSection(section: string): void {
  appState.settingsSection = section;
  appState.pendingPowerAction = '';
  setMessage('', false);
}

/** Escape and the back button: a page up. */
export function goBack(): void {
  if (appState.page === PAGE_SETTINGS) navigateTo(appState.crashReport !== null ? PAGE_CRASH : PAGE_HOME);
}

// ----------------------------------------------------------------------------
// The app
// ----------------------------------------------------------------------------

export function startApp(): void {
  sys.exit(EXIT_START_APP);
}

export function dismissCrash(): void {
  deleteCrashReport(crashReportPath);
  appState.crashReport = null;
  navigateTo(PAGE_HOME);
}

// ----------------------------------------------------------------------------
// System actions (zinc-admin)
// ----------------------------------------------------------------------------

/** Runs a zinc-admin verb for the button `action`; `done` gets the result, then the machine is read again. */
function runAction(action: string, args: string[], input: string, done: (result: AdminResult) => void): void {
  if (appState.busyAction !== '') return;
  appState.busyAction = action;
  setMessage('', false);
  runAdmin(adminPath, args, input).then((result: AdminResult) => {
    appState.busyAction = '';
    uiState.dirty = true;
    done(result);
    refreshSystem();
  });
}

function reportFailure(result: AdminResult): boolean {
  if (result.code === 0) return false;
  setMessage(result.message(), true);
  return true;
}

export function setAgentEnabled(isOn: boolean): void {
  runAction('agent', ['agent', isOn ? 'on' : 'off'], '', (result: AdminResult) => {
    if (reportFailure(result)) return;
    // a new agent opens its first pairing as it starts: look again once it has
    if (isOn) setTimeout(refreshSystem, 1500);
  });
}

export function setSshEnabled(isOn: boolean): void {
  runAction('ssh', ['ssh', isOn ? 'on' : 'off'], '', (result: AdminResult) => {
    reportFailure(result);
  });
}

export function openPairing(): void {
  runAction('pair', ['pair'], '', (result: AdminResult) => {
    reportFailure(result);
  });
}

/** The networks around; `rescan` asks for a fresh scan (the Scan button), which takes a few seconds. */
export function scanWifi(rescan: boolean): void {
  if (appState.isScanning) return;
  appState.isScanning = true;
  uiState.dirty = true;
  network.listWifiNetworks(rescan).then((scan: network.WifiScan) => {
    appState.isScanning = false;
    appState.hasScanned = true;
    if (scan.error === '') appState.networks = scan.networks;
    else setMessage(scan.error, true);
    uiState.dirty = true;
  });
}

/** Runs a zinc:network call for the button `action`: `call` resolves with '' or the error; `done` gets it, then the machine is read again. */
function runNetworkAction(action: string, call: () => Promise<string>, done: (error: string) => void): void {
  if (appState.busyAction !== '') return;
  appState.busyAction = action;
  setMessage('', false);
  call().then((error: string) => {
    appState.busyAction = '';
    uiState.dirty = true;
    done(error);
    refreshSystem();
  });
}

function connectWifi(ssid: string, password: string): void {
  runNetworkAction('wifi/' + ssid, () => network.joinWifi(ssid, password), (error: string) => {
    const form = appState.form;
    form.isBusy = false;
    if (error !== '') {
      if (form.isOpen) form.error = error;
      else setMessage(error, true);
      return;
    }
    closeForm();
    setMessage('Joined ' + ssid + '.', false);
    scanWifi(false);
  });
}

export function joinNetwork(wifi: network.WifiNetwork): void {
  if (wifi.inUse) return;
  if (!wifi.secured) {
    connectWifi(wifi.ssid, '');
    return;
  }
  const ssid = wifi.ssid;
  openForm('Join “' + ssid + '”', 'Password', '', true, 'Join', 63, '', (password: string) => {
    if (password.length < 8) {
      appState.form.error = 'A Wi-Fi password has 8 to 63 characters.';
      return;
    }
    appState.form.isBusy = true;
    connectWifi(ssid, password);
  });
}

export function forgetNetwork(ssid: string): void {
  runNetworkAction('forget', () => network.forgetWifi(ssid), (error: string) => {
    if (error !== '') setMessage(error, true);
    else scanWifi(false);
  });
}

/** Runs a verb from the form: it closes on success and shows the error otherwise. */
function submitFromForm(action: string, args: string[]): void {
  appState.form.isBusy = true;
  runAction(action, args, '', (result: AdminResult) => {
    appState.form.isBusy = false;
    if (result.code !== 0) {
      appState.form.error = result.message();
      return;
    }
    closeForm();
  });
}

export function editWifiCountry(): void {
  openForm('Wi-Fi country', 'Two letters: FR, US, GB, DE...', appState.status.wifiCountry, false, 'Save', 2, 'upper', (country: string) => {
    submitFromForm('country', ['wifi-country', country]);
  });
}

export function editHostname(): void {
  openForm('Name on the network', 'Small letters, digits and hyphens', appState.status.hostname, false, 'Save', 63, 'lower', (name: string) => {
    submitFromForm('hostname', ['hostname', name]);
  });
}

export function askPowerAction(action: string): void {
  appState.pendingPowerAction = action;
  uiState.dirty = true;
}

export function confirmPowerAction(): void {
  const action = appState.pendingPowerAction;
  appState.pendingPowerAction = '';
  runAction(action, [action], '', (result: AdminResult) => {
    reportFailure(result);
  });
}

export function cancelPowerAction(): void {
  appState.pendingPowerAction = '';
  uiState.dirty = true;
}

// ----------------------------------------------------------------------------
// Preferences
// ----------------------------------------------------------------------------

export function setBackgroundTheme(index: i32): void {
  if (index < 0 || index >= BACKGROUND_THEMES.length) return;
  appState.config.backgroundTheme = index;
  saveConfig(configPath, appState.config);
  uiState.dirty = true;
}

export function setAnimationEnabled(isOn: boolean): void {
  appState.config.animation = isOn;
  saveConfig(configPath, appState.config);
  uiState.dirty = true;
}

export function setKeyboardLayout(layout: string): void {
  appState.config.keyboardLayout = layout === KEYBOARD_AZERTY ? KEYBOARD_AZERTY : KEYBOARD_QWERTY;
  saveConfig(configPath, appState.config);
  uiState.dirty = true;
}

// ----------------------------------------------------------------------------
// The form and its keyboard
// ----------------------------------------------------------------------------

export function openForm(
  title: string,
  label: string,
  value: string,
  isSecret: boolean,
  submitLabel: string,
  maxLength: i32,
  letterCase: string,
  onSubmit: (value: string) => void
): void {
  const form = appState.form;
  form.isOpen = true;
  form.title = title;
  form.label = label;
  form.value = value;
  form.isSecret = isSecret;
  form.isRevealed = false;
  form.submitLabel = submitLabel;
  form.maxLength = maxLength;
  form.letterCase = letterCase;
  form.error = '';
  form.isBusy = false;
  form.onSubmit = onSubmit;
  appState.isKeyboardShifted = false;
  appState.isKeyboardSymbols = false;
  uiState.focusedZoneId = '';
  uiState.dirty = true;
}

export function closeForm(): void {
  appState.form.isOpen = false;
  appState.form.value = '';
  appState.form.onSubmit = null;
  uiState.focusedZoneId = '';
  uiState.dirty = true;
}

export function submitForm(): void {
  const form = appState.form;
  if (form.isBusy || form.onSubmit === null) return;
  form.error = '';
  const onSubmit = form.onSubmit as (value: string) => void;
  onSubmit(form.value.trim());
  uiState.dirty = true;
}

export function toggleFormReveal(): void {
  appState.form.isRevealed = !appState.form.isRevealed;
  uiState.dirty = true;
}

/** Text typed into the form, from the screen's keyboard or the computer's. */
export function typeIntoForm(text: string): void {
  const form = appState.form;
  if (!form.isOpen || form.isBusy) return;
  let typed = text;
  if (form.letterCase === 'upper') typed = typed.toUpperCase();
  else if (form.letterCase === 'lower') typed = typed.toLowerCase();
  const room = form.maxLength - form.value.length;
  if (room <= 0) return;
  form.value += typed.length > room ? typed.slice(0, room) : typed;
  form.error = '';
  uiState.dirty = true;
}

export function eraseInForm(): void {
  const form = appState.form;
  if (!form.isOpen || form.isBusy || form.value.length === 0) return;
  form.value = form.value.slice(0, form.value.length - 1);
  uiState.dirty = true;
}

/** A key of the on-screen keyboard: a character, or 'back', 'shift', 'symbols', 'enter', 'hide'. */
export function pressScreenKey(key: string): void {
  if (key === 'back') eraseInForm();
  else if (key === 'shift') appState.isKeyboardShifted = !appState.isKeyboardShifted;
  else if (key === 'symbols') appState.isKeyboardSymbols = !appState.isKeyboardSymbols;
  else if (key === 'enter') submitForm();
  else if (key === 'hide') appState.isScreenKeyboardHidden = true;
  else {
    typeIntoForm(appState.isKeyboardShifted ? key.toUpperCase() : key);
    appState.isKeyboardShifted = false;
  }
  uiState.dirty = true;
}

export function showScreenKeyboard(): void {
  appState.isScreenKeyboardHidden = false;
  uiState.dirty = true;
}

export function hideScreenKeyboard(): void {
  if (appState.isScreenKeyboardHidden) return;
  appState.isScreenKeyboardHidden = true;
  uiState.dirty = true;
}
