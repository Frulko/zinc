// The builder's state and its actions: the profile being edited, the build that runs, what it printed. Nothing is
// drawn here; the pages read the signals and call the actions.
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as os from 'zinc:os';
import * as dialog from 'zinc:system/dialog';
import * as opener from 'zinc:system/opener';
import { LOG_LINES_KEPT, SSH_PUBLIC_KEYS, RASPBERRY_PI_IMAGER, BuildStatus } from './constants';
import { Profile, decodeProfile, encodeProfile, loadProfile, readProfileText, saveProfile, engineVersion } from './services/profile';
import { Preset, addPreset, loadPresets } from './services/presets';
import { Catalog, loadCatalog } from './services/catalog';
import { BuildRun, BuildListener } from './services/build';
import { repositoryRoot, buildTool, catalogFile, defaultProfileFile, profileFile, presetsFile, hostPath } from './services/paths';

export const catalog: Catalog = loadCatalog(catalogFile());

export const [saveError, setSaveError] = createSignal<string>('');
export const [presetError, setPresetError] = createSignal<string>('');
export const [presetNames, setPresetNames] = createSignal<string[]>([]);
export const [selectedPreset, setSelectedPreset] = createSignal<string>('');
export const [presetDialogOpen, setPresetDialogOpen] = createSignal<boolean>(false);
export const [presetName, setPresetName] = createSignal<string>('');
let currentProfile: Profile = new Profile();
try { currentProfile = loadProfile(profileFile()); } catch (e) { setSaveError('Could not load settings: ' + (e as Error).message); }
let presets: Preset[] = [];
try {
  presets = loadPresets(presetsFile());
  setPresetNames(presets.map((p: Preset) => p.name));
} catch (e) { setPresetError('Could not load presets: ' + (e as Error).message); }
const [profileRevision, setProfileRevision] = createSignal<i32>(0);

/** The profile; reading it subscribes to its changes. */
export function profile(): Profile { profileRevision(); return currentProfile; }

export function editProfile(change: (p: Profile) => void): void {
  change(currentProfile);
  persistProfile();
  setSelectedPreset('');
  setProfileRevision(profileRevision() + 1);
}

function persistProfile(): boolean {
  try {
    saveProfile(profileFile(), currentProfile);
    if (saveError() !== '' && errorMessage() === saveError()) setErrorMessage('');
    setSaveError('');
    return true;
  }
  catch (e) { setSaveError('Could not save settings: ' + (e as Error).message); return false; }
}

export function loadPreset(name: string): void {
  for (const preset of presets) if (preset.name === name) {
    try {
      const restored = decodeProfile(preset.text);
      saveProfile(profileFile(), restored, preset.text);
      currentProfile = restored;
      setSelectedPreset(name);
      setSaveError('');
      setPresetError('');
      setProfileRevision(profileRevision() + 1);
    } catch (e) { setPresetError('Could not load preset: ' + (e as Error).message); }
    return;
  }
}

export function openPresetDialog(): void {
  setPresetName('');
  setPresetError('');
  setPresetDialogOpen(true);
}

export function closePresetDialog(): void {
  setPresetDialogOpen(false);
  setPresetError('');
}

export function savePreset(): void {
  try {
    presets = addPreset(presetsFile(), presetName(), encodeProfile(currentProfile, readProfileText(profileFile())));
    setPresetNames(presets.map((p: Preset) => p.name));
    setSelectedPreset(presetName().trim());
    setPresetDialogOpen(false);
    setPresetError('');
  } catch (e) { setPresetError((e as Error).message); }
}

export function toggleLibrary(key: string, on: boolean): void {
  editProfile((p: Profile) => {
    const kept = p.libraries.filter((k: string) => k !== key);
    if (on) kept.push(key);
    p.libraries = kept;
  });
}

export const [status, setStatus] = createSignal<BuildStatus>('idle');
export const [stepIndex, setStepIndex] = createSignal<i32>(0);
export const [stepTotal, setStepTotal] = createSignal<i32>(0);
export const [stepLabel, setStepLabel] = createSignal<string>('');
export const [stepProgress, setStepProgress] = createSignal<i32>(-1);
export const [stepDetail, setStepDetail] = createSignal<string>('');
/** The Zinc version the next image will carry, read again before each build. */
export const [imageEngine, setImageEngine] = createSignal<string>('');
function readImageEngine(): void {
  try { setImageEngine(engineVersion(readProfileText(profileFile()), readProfileText(defaultProfileFile()))); } catch (e) { setImageEngine(''); }
}
readImageEngine();
export const [errorMessage, setErrorMessage] = createSignal<string>('');
export const [imagePath, setImagePath] = createSignal<string>('');
export const [logLines, setLogLines] = createSignal<string[]>([]);
export const [notice, setNotice] = createSignal<string>('');

let running: BuildRun | null = null;

function appendLog(line: string): void {
  const lines = logLines().length >= LOG_LINES_KEPT ? logLines().slice(logLines().length - LOG_LINES_KEPT + 1) : logLines().slice();
  lines.push(line);
  setLogLines(lines);
}

class StateListener implements BuildListener {
  onStep(index: i32, total: i32, label: string): void {
    setStepIndex(index);
    if (total > 0) setStepTotal(total);
    setStepLabel(label);
    setStepProgress(-1); setStepDetail('');
  }
  onProgress(percent: i32, text: string): void { setStepProgress(percent); setStepDetail(text); }
  onError(message: string): void { if (errorMessage() === '') setErrorMessage(message); }
  onDone(path: string): void { setImagePath(hostPath(path)); }
  onLine(line: string): void { appendLog(line); }
  onExit(code: i32): void {
    running = null;
    setStatus(code === 0 && imagePath() !== '' ? 'done' : 'failed');
    if (code !== 0 && errorMessage() === '') setErrorMessage(`tools/pi-image stopped with exit ${code}`);
  }
}

export function startBuild(): void {
  if (running !== null) return;
  if (!persistProfile()) { setErrorMessage(saveError()); return; }
  readImageEngine();
  setLogLines([]); setErrorMessage(''); setImagePath(''); setStepIndex(0); setStepTotal(0); setStepLabel(''); setStepProgress(-1); setStepDetail('');
  try {
    running = new BuildRun(buildTool(), profileFile(), repositoryRoot(), new StateListener());
    setStatus('running');
  } catch (e) {
    setStatus('failed');
    setErrorMessage(`${buildTool()} cannot be started: ${(e as Error).message}`);
  }
}

export function stopBuild(): void {
  const run = running;
  if (run !== null) run.stop();
}

export async function chooseApp(): Promise<void> {
  const options = new dialog.OpenOptions();
  options.title = 'The Zinc project the Pi starts';
  options.directory = true;
  const picked = await dialog.open(options);
  if (picked === null || picked.length === 0) return;
  const project = picked[0];
  editProfile((p: Profile) => { p.app = project; });
}

export function useMySshKey(): void {
  for (const relative of SSH_PUBLIC_KEYS) {
    const path = os.homedir() + '/' + relative;
    if (!fs.exists(path)) continue;
    const key = fs.readText(path).trim();
    editProfile((p: Profile) => {
      if (p.sshKeys.indexOf(key) < 0) p.sshKeys = p.sshKeys.trim() === '' ? key : p.sshKeys.trim() + '\n' + key;
    });
    setNotice(`Added ~/${relative}`);
    return;
  }
  setNotice('No public key in ~/.ssh: make one with ssh-keygen -t ed25519');
}

export function revealImage(): void { opener.reveal(imagePath()); }

export function openImager(): void {
  if (fs.exists(RASPBERRY_PI_IMAGER)) opener.openPath(RASPBERRY_PI_IMAGER);
  else opener.openUrl('https://www.raspberrypi.com/software/');
}
