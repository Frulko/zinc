// The build, at the center: the steps of the image as they happen, how far it is, then the result or what failed, and the raw output in a drawer.
import { For, Show, createMemo } from 'zinc:ui/solid';
import { Button as ActionButton } from 'zinc:ui/nuxt';
import { Icon } from 'zinc:icons';
import { Spinner } from 'zinc:ui/kit';
import { ProgressBar } from '../components/progress-bar';
import { LogView } from '../components/log-view';
import { shownPath } from '../services/paths';
import { labelOf } from '../services/catalog';
import { catalog, profile, status, stepIndex, stepTotal, stepLabels, stepProgress, stepDetail, imageEngine, errorMessage, imagePath, imageSize, logLines, logOpen, setLogOpen, startBuild, stopBuild, revealImage, openImager } from '../state';

const HEAD_STEPS: string[] = ['Preparing the build container', 'Checking the settings', 'Downloading Raspberry Pi OS and Zinc', 'Unpacking Raspberry Pi OS', 'Making room on the system partition', 'Installing Zinc and the player'];
const TAIL_STEPS: string[] = ['Writing the first-boot settings', 'Cleaning up', 'Compressing', 'Writing the Raspberry Pi Imager entry'];

function rowCount(): i32 { return stepTotal() > 0 ? stepTotal() : Math.max(stepIndex(), 6) as i32; }
/** What step `n` (from 1) is called: as reported once reached, otherwise as the build usually names it. */
function stepName(n: i32): string {
  const labels = stepLabels();
  if (n <= labels.length && labels[n - 1] !== '') return labels[n - 1];
  const total = rowCount();
  if (n <= HEAD_STEPS.length) return HEAD_STEPS[n - 1];
  if (total >= 10 && n > total - TAIL_STEPS.length) return TAIL_STEPS[n - (total - TAIL_STEPS.length) - 1];
  return 'Setting up the system';
}
/** 'done', 'running', 'failed' or 'pending' for step `n`. */
function stepState(n: i32): string {
  if (status() === 'done' || n < stepIndex()) return 'done';
  if (n === stepIndex()) return status() === 'failed' ? 'failed' : 'running';
  return 'pending';
}

function engineText(): string { return imageEngine() === '' ? 'Zinc engine and player · version not known' : `Zinc ${imageEngine()} · engine and player`; }
function barColor(): string { return status() === 'failed' ? '#ff3b30' : status() === 'done' ? '#34c759' : '#007aff'; }
/** Hundredths of a step: the current step's own progress, while a long command reports it, fills its share of the bar. */
function stepsDone(): i32 {
  const p = stepProgress();
  return status() === 'running' && p >= 0 ? (stepIndex() - 1) * 100 + Math.min(p, 100) as i32 : stepIndex() * 100;
}
function stepsTotal(): i32 { return stepTotal() * 100; }
function percent(): i32 { return stepTotal() <= 0 ? 0 : Math.round(100 * Math.min(stepsDone(), stepsTotal()) / stepsTotal()) as i32; }

function failedStep(): string { return stepName(stepIndex() < 1 ? 1 : stepIndex()); }

function StepIcon(p: { n: i32 }): i32 {
  return <View className="w-5 h-5 items-center justify-center">
    <Show when={stepState(p.n) === 'done'}><Icon name="circle-check" size={18} color={() => 0x34c759} /></Show>
    <Show when={stepState(p.n) === 'running'}><Spinner size={16} color={() => 0x007aff} active={() => stepState(p.n) === 'running'} /></Show>
    <Show when={stepState(p.n) === 'failed'}><Icon name="circle-x" size={18} color={() => 0xff3b30} /></Show>
    <Show when={stepState(p.n) === 'pending'}><View className="w-4 h-4 rounded-full border-2 border-[#d1d1d6]" /></Show>
  </View>;
}

function StepRow(p: { n: i32 }): i32 {
  const state = (): string => stepState(p.n);
  return <View className={`flex-row items-center gap-3 px-4 py-2.5 min-h-[44px] ${p.n === 1 ? '' : 'border-t border-[#ececf0]'}`}>
    <StepIcon n={p.n} />
    <View className="flex-col grow basis-0 min-w-0 gap-0.5">
      <Text className={`text-[14px] ${state() === 'pending' ? 'text-[#8e8e93]' : state() === 'failed' ? 'text-[#d70015]' : 'text-[#1d1d1f]'}`}>{stepName(p.n)}</Text>
      <Show when={state() === 'running' && stepDetail() !== ''}><Text className="font-mono text-xs text-[#6e6e73]">{stepDetail()}</Text></Show>
    </View>
  </View>;
}

function Steps(): i32 {
  const rows = createMemo((): i32[] => { const n = rowCount(); const all: i32[] = []; for (let i = 1; i <= n; i++) all.push(i); return all; }, [] as i32[]);
  return <View className="flex-col rounded-[8px] bg-white border border-[#e3e3e8]">
    <For each={rows()}>{(n: i32) => <StepRow n={n} />}</For>
  </View>;
}

function Line(p: { label: string; value: string; first?: boolean }): i32 {
  return <View className={`flex-row items-center gap-3 px-4 py-2.5 min-h-[44px] ${p.first === true ? '' : 'border-t border-[#ececf0]'}`}>
    <Text className="text-[14px] text-[#1d1d1f] w-[120px] shrink-0">{p.label}</Text>
    <Text className="grow basis-0 min-w-0 text-[14px] text-[#6e6e73]">{p.value}</Text>
  </View>;
}

function optionsText(): string {
  const on: string[] = [];
  if (profile().shell) on.push('Zinc shell');
  if (profile().agent) on.push('Agent');
  if (profile().ab) on.push('A/B updates');
  if (profile().bluetooth) on.push('Bluetooth');
  if (profile().app !== '') on.push('App at boot');
  return on.length === 0 ? 'Player only' : on.join(', ');
}

/** Your image: what it will contain, without any password. */
function Summary(): i32 {
  return <View className="flex-col gap-1.5">
    <Text className="text-[13px] font-semibold text-[#6e6e73] px-1">Your image</Text>
    <View className="flex-col rounded-[8px] bg-white border border-[#e3e3e8]">
      <Line first={true} label="Zinc" value={engineText()} />
      <Line label="Raspberry Pi" value={labelOf(catalog.boards, profile().board)} />
      <Line label="Screen" value={labelOf(catalog.displays, profile().display)} />
      <Line label="Network" value={profile().wifiName === '' ? 'Ethernet · configure Wi-Fi later' : profile().wifiName} />
      <Line label="Account" value={profile().userName === '' ? 'Player only · no administrator account' : profile().userName + (profile().ssh ? ' · SSH enabled' : ' · SSH off')} />
      <Line label="Options" value={optionsText()} />
    </View>
    <Text className="text-xs text-[#8e8e93] px-1">Docker required · about 6 GB free disk space</Text>
  </View>;
}

function Result(): i32 {
  return <View className="flex-col gap-4 p-4 rounded-[8px] bg-white border border-[#e3e3e8]">
    <View className="flex-row gap-3 items-center">
      <Icon name="circle-check" size={26} color={() => 0x34c759} />
      <View className="flex-col grow basis-0 min-w-0 gap-0.5">
        <Text className="font-mono text-[13px] text-[#1d1d1f]">{shownPath(imagePath())}</Text>
        <Text className="text-xs text-[#8e8e93]">{imageSize() === '' ? 'Compressed image' : imageSize() + ' · compressed image'}</Text>
      </View>
    </View>
    <View className="flex-row gap-2">
      <ActionButton label="Open Imager" icon="external-link" onClick={openImager} />
      <ActionButton label="Show file" icon="folder-open" color="neutral" variant="outline" onClick={revealImage} />
    </View>
    <View className="flex-col gap-1.5 pt-3 border-t border-[#ececf0]">
      <Text className="text-xs font-semibold text-[#6e6e73]">Next</Text>
      <Text className="text-[13px] text-[#1d1d1f]">1. Flash the .img.xz to a card with Imager or Etcher.</Text>
      <Text className="text-[13px] text-[#1d1d1f]">2. Put the card in the Pi and power it on.</Text>
      <Text className="text-[13px] text-[#1d1d1f]">{profile().agent ? '3. Pair it from your Mac with zinc device.' : '3. Wait a minute at first boot: the Pi sets itself up.'}</Text>
    </View>
  </View>;
}

function Failure(): i32 {
  return <View className="flex-col gap-3 p-4 rounded-[8px] bg-white border border-[#ffd1cc]">
    <View className="flex-row gap-3 items-start">
      <Icon name="circle-x" size={26} color={() => 0xff3b30} />
      <View className="flex-col grow basis-0 min-w-0 gap-1">
        <Text className="text-[14px] font-semibold text-[#1d1d1f]">{'Stopped at: ' + failedStep()}</Text>
        <Text className="text-[13px] leading-[18px] text-[#d70015]">{errorMessage()}</Text>
      </View>
    </View>
    <View className="flex-row gap-2"><ActionButton label="Retry" icon="rotate-cw" onClick={startBuild} /></View>
  </View>;
}

function heading(): string {
  return status() === 'done' ? 'Your image is ready' : status() === 'running' ? 'Making your image' : status() === 'failed' ? 'The build stopped' : 'Ready to build';
}
function subtitle(): string {
  if (status() === 'running') return 'This takes a few minutes. You can leave the window open.';
  if (status() === 'done') return 'Flash it to a card and start your Pi.';
  if (status() === 'failed') return 'Nothing is lost: your settings are saved.';
  return 'Review what goes in the image, then build it.';
}

export function BuildPage(): i32 {
  return <View className="flex-col gap-6">
    <View className="flex-row items-start gap-3">
      <View className="flex-col grow basis-0 min-w-0 gap-1.5">
        <Text className="text-[30px] font-bold text-[#1d1d1f]">{heading()}</Text>
        <Text className="text-[15px] leading-[21px] text-[#6e6e73]">{subtitle()}</Text>
      </View>
      <Show when={status() === 'running'}><ActionButton label="Stop" icon="square" color="neutral" variant="outline" onClick={stopBuild} /></Show>
    </View>
    <Show when={status() === 'idle'}><View className="flex-col gap-6">
      <Summary />
      <View className="flex-row"><ActionButton label="Build the image" icon="hammer" size="lg" onClick={startBuild} /></View>
    </View></Show>
    <Show when={status() !== 'idle'}><View className="flex-col gap-6">
      <View className="flex-col gap-2">
        <View className="flex-row items-end gap-3 h-[44px]"><Text className="text-[40px] font-light text-[#1d1d1f]">{stepTotal() > 0 ? percent() + '%' : '…'}</Text><View className="grow" /><Text className="text-xs text-[#6e6e73] pb-2">{stepTotal() > 0 ? `Step ${stepIndex()} of ${stepTotal()}` : 'Preparing the build'}</Text></View>
        <ProgressBar done={stepsDone} total={stepsTotal} color={barColor} />
        <View className="flex-row gap-1.5"><Text className="text-xs text-[#8e8e93]">{engineText()}</Text><Text className="text-xs text-[#8e8e93]">{'· ' + labelOf(catalog.boards, profile().board)}</Text></View>
      </View>
      <Show when={status() === 'done' && imagePath() !== ''}><Result /></Show>
      <Show when={status() === 'failed'}><Failure /></Show>
      <Steps />
      <LogView lines={logLines} open={logOpen} onToggle={() => setLogOpen(!logOpen())} />
    </View></Show>
  </View>;
}
