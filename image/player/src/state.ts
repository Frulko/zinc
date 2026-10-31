// ============================================================================
// state.ts — The player's state and its actions
// ============================================================================
// What the pages show (the app's last crash, the machine, the Wi-Fi networks, the agent's pairing, the form being
// typed) and what they call. Nothing runs at import: main.ts starts the refresh once the stage is mounted.

import * as fs from 'zinc:fs';
import * as os from 'zinc:os';
import * as sys from 'zinc:sys';
import * as network from 'zinc:network';
import * as shell from 'zinc:shell';
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
  NEXT_APP_FILE,
  PAGE_APP,
  PAGE_APPS,
  PAGE_CRASH,
  PAGE_HOME,
  PAGE_HUB,
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
import { UpdateStatus } from './services/updates';
import { InstalledApp, appsSignature, deleteInstalledApp, readInstalledApps } from './services/apps';

function fromEnv(name: string, fallback: string): string {
  return sys.env(name) === '' ? fallback : sys.env(name);
}

const zincHome = fromEnv('ZINC_HOME', os.homedir() + '/.zinc');
const appPath = fromEnv('ZINC_APP', DEFAULT_APP_PATH);
const runDirectory = fromEnv('ZINC_RUN', DEFAULT_RUN_DIRECTORY);
const crashReportPath = runDirectory + '/' + CRASH_REPORT_FILE;
const adminPath = fromEnv('ZINC_ADMIN', DEFAULT_ADMIN_PATH);
export const agentDirectory = fromEnv('ZINC_PLAYER_AGENT_DIR', zincHome + '/agent');
const configPath = fromEnv('ZINC_PLAYER_CONFIG', zincHome + '/player.json');
/** The version of the engine running the player, with its commit (0.9.1+708.gbace6c038); an older engine: the one zinc-session passes on
 *  (the last word of `zinc --version`). */
const versionWords = sys.env('ZINC_VERSION').trim().split(' ');
// ZINC_PLAYER_VERSION pins it (a test: the engine sets ZINC_ENGINE_VERSION in every run, and its commit changes with each one)
export const zincVersion = fromEnv('ZINC_PLAYER_VERSION', fromEnv('ZINC_ENGINE_VERSION', versionWords[versionWords.length - 1]));
/** The player is the shell (D194): it starts the apps itself and shows them below its bar, instead of exiting for zinc-session. */
export const isShell = sys.env('ZINC_SHELL_SOCKET') !== '' && sys.env('ZINC_DISPLAY') !== 'shell';   // shown by a shell: an app, not a shell
/** The last lines of an app's log a crash page shows. */
const CRASH_LOG_LINES = 80;

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
  /** The app the shell shows ('' when none). */
  shownAppName: string = '';
  shownAppDirectory: string = '';
  /** Its title, for the bar. */
  shownAppTitle: string = '';
  isAppInstalled: boolean = false;
  /** The apps sent to the device, newest first. */
  apps: InstalledApp[] = [];
  /** The apps show their delete buttons. */
  isEditingApps: boolean = false;
  /** The app whose deletion waits for its confirmation. */
  appToDelete: InstalledApp | null = null;
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
  updates: UpdateStatus = new UpdateStatus();
}

export const appState = new AppState();
let nextUpdateCheck: number = 0;
let readingUpdateStatus: boolean = false;

export function refreshUpdates(): void {
  if (readingUpdateStatus) return;
  readingUpdateStatus = true;
  runAdmin(adminPath, ['update-status'], '').then((result: AdminResult) => {
    readingUpdateStatus = false;
    if (result.code === 0) {
      const before = appState.updates.signature();
      try { appState.updates.read(result.output, false); } catch (e) {
        appState.updates.error = 'Could not read the update status.';
        uiState.dirty = true;
      }
      if (before !== appState.updates.signature()) uiState.dirty = true;
    }
  });
}

export function checkUpdates(): void {
  const updates = appState.updates;
  if (updates.checking || updates.isBusy()) return;
  updates.checking = true;
  updates.error = '';
  nextUpdateCheck = Date.now() + 300000;
  uiState.dirty = true;
  runAdmin(adminPath, ['update-check'], '').then((result: AdminResult) => {
    updates.checking = false;
    if (result.code !== 0) updates.error = result.message();
    else {
      try {
        updates.read(result.output, true);
        nextUpdateCheck = Date.now() + 86400000;
      } catch (e) { updates.error = 'Could not read the available versions.'; }
    }
    uiState.dirty = true;
  });
}

export function selectUpdateVersion(value: string): void {
  appState.updates.selected = value;
  appState.updates.pending = '';
  uiState.dirty = true;
}

export function askUpdate(value: string): void {
  appState.updates.pending = value;
  uiState.dirty = true;
}

export function installUpdate(): void {
  const updates = appState.updates;
  if (updates.isBusy() || updates.pending === '') return;
  const value = updates.pending;
  updates.pending = '';
  updates.phase = 'queued';
  updates.message = 'Preparing the chosen engine and player…';
  updates.error = '';
  uiState.dirty = true;
  runAdmin(adminPath, value === 'rollback' ? ['update-rollback'] : ['update-install', value], '').then((result: AdminResult) => {
    if (result.code !== 0) {
      updates.phase = 'error';
      updates.error = result.message();
    }
    uiState.dirty = true;
    setTimeout(refreshUpdates, 1000);
  });
}

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
  // the update status costs a Python start: only the settings show it, and an update under way is followed
  if (appState.page === PAGE_SETTINGS || appState.updates.isBusy()) refreshUpdates();
  const installed = fs.exists(appPath);
  if (installed !== appState.isAppInstalled) {
    appState.isAppInstalled = installed;
    uiState.dirty = true;
  }
  const apps = readInstalledApps(agentDirectory);
  if (appsSignature(apps) !== appsSignature(appState.apps)) {
    appState.apps = apps;
    if (apps.length === 0) appState.isEditingApps = false;
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
    if (status.isConnected() && Date.now() >= nextUpdateCheck && sys.env('ZINC_PLAYER_UPDATE_CHECK') !== '0') checkUpdates();
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
  appState.isEditingApps = false;
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
  if (appState.appToDelete !== null) cancelDeleteApp();
  else if (appState.page === PAGE_SETTINGS) navigateTo(appState.crashReport !== null ? PAGE_CRASH : PAGE_HOME);
  else if (appState.page === PAGE_APPS) navigateTo(PAGE_HOME);
  else if (appState.page === PAGE_HUB) navigateTo(PAGE_HOME);
}

// ----------------------------------------------------------------------------
// The app
// ----------------------------------------------------------------------------

export function startApp(): void {
  if (isShell) showApp(appPath, 'app', 'App');
  else sys.exit(EXIT_START_APP);
}

/** A kiosk app that ended starts again after this long (a crash loop stays slow enough to read its log). */
const KIOSK_RESTART_MS = 1000;

/** The shell starts the app and shows it; its end comes back through onAppExit. */
function showApp(directory: string, name: string, title: string): void {
  if (shell.start(directory, name) <= 0) {
    setMessage('Could not start ' + title + '.', true);
    return;
  }
  appState.shownAppName = name;
  appState.shownAppDirectory = directory;
  appState.shownAppTitle = title;
  navigateTo(PAGE_APP);
}

/** Home in the bar: the hub at once, the app is asked to quit (and ended if it does not). */
export function goHome(): void {
  if (shell.mode() === 'kiosk') return;
  shell.home();
  shell.clearMode();
  navigateTo(PAGE_HOME);
}

/** The shown app ended: back to the hub, or its crash page when it failed (143: stopped by SIGTERM; -1: an app the agent started left or was
 *  replaced, whose status is the agent's: `zinc device logs` has it). */
function onAppExit(name: string, status: number): void {
  if (shell.mode() === 'kiosk' && name === appState.shownAppName) {   // a kiosk app is never left: it starts again
    const directory = appState.shownAppDirectory, title = appState.shownAppTitle;
    setTimeout(() => showApp(directory, name, title), KIOSK_RESTART_MS);
    return;
  }
  shell.clearMode();
  appState.shownAppName = '';
  if (status === 0 || status === 143 || status === -1) {
    if (appState.page === PAGE_APP) navigateTo(PAGE_HOME);
    uiState.dirty = true;
    return;
  }
  const report = new CrashReport();
  report.app = name;
  report.exitStatus = '' + status;
  report.time = new Date().toLocaleString();
  const logPath = agentDirectory + '/logs/' + name + '.log';
  const lines = fs.exists(logPath) ? fs.readText(logPath).trimEnd().split('\n') : [];
  const tail = lines.slice(Math.max(0, lines.length - CRASH_LOG_LINES)).filter((line: string) => !line.startsWith('[exited'));
  report.output = tail.length === 0 ? ['It printed nothing.'] : tail;
  appState.crashReport = report;
  navigateTo(PAGE_CRASH);
}

let connectedApp = '';
/** An app that connected by itself (`zinc device run`: the agent starts it with the shell's socket) is shown at once, over any page. */
export function followConnectedApp(): void {
  const current = shell.current();
  if (current === connectedApp) return;
  connectedApp = current;
  if (current === '' || current === appState.shownAppName) return;
  appState.shownAppName = current;
  appState.shownAppDirectory = '';
  appState.shownAppTitle = shell.title();
  navigateTo(PAGE_APP);
}

/** The shell's start: zinc-session (ZINC_SHELL=1) leaves the boot app to it (ZINC_BOOT_APP=1, not during an update). */
export function startShell(): void {
  if (!isShell) return;
  shell.onExit(onAppExit);
  // ZINC_SHELL_START=<app dir>: shown at once, as if its tile were tapped (a measurement or a test on a device nobody touches)
  const startDirectory = sys.env('ZINC_SHELL_START');
  if (startDirectory !== '') showApp(startDirectory, 'app', 'App');
  else if (sys.env('ZINC_BOOT_APP') === '1' && fs.exists(appPath)) showApp(appPath, 'app', 'App');
}

/** Starts an app sent to the device: zinc-session reads its folder from the run directory. */
export function startInstalledApp(app: InstalledApp): void {
  if (isShell) {
    showApp(app.directory, app.name, app.title);
    return;
  }
  try {
    fs.writeText(runDirectory + '/' + NEXT_APP_FILE, app.directory + '\n');
  } catch (e) {
    setMessage('Could not start ' + app.title + '.', true);
    return;
  }
  sys.exit(EXIT_START_APP);
}

export function openAllApps(): void {
  navigateTo(PAGE_APPS);
}

export function toggleEditingApps(): void {
  appState.isEditingApps = !appState.isEditingApps;
  uiState.dirty = true;
}

export function askDeleteApp(app: InstalledApp): void {
  appState.appToDelete = app;
  uiState.focusedZoneId = '';
  uiState.dirty = true;
}

export function cancelDeleteApp(): void {
  appState.appToDelete = null;
  uiState.focusedZoneId = '';
  uiState.dirty = true;
}

export function confirmDeleteApp(): void {
  const app = appState.appToDelete;
  appState.appToDelete = null;
  uiState.focusedZoneId = '';
  if (app === null) return;
  const deleted = app as InstalledApp;
  if (!deleteInstalledApp(agentDirectory, deleted)) setMessage('Could not delete ' + deleted.title + '.', true);
  refreshSystem();
  uiState.dirty = true;
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
  if (appState.busyAction !== '' || appState.updates.isBusy()) return;
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

export function restartNetwork(): void {
  appState.pendingPowerAction = '';
  runAction('network', ['network-restart'], '', (result: AdminResult) => {
    if (reportFailure(result)) return;
    setMessage('Network service restarted. Checking connections…', false);
    scanWifi(true);
    setTimeout(refreshSystem, 2000);
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
