// A persistent build desk: configuration summary, progress, output and the finished download.
import { Show } from 'zinc:ui/solid';
import { Button as ActionButton } from 'zinc:ui/nuxt';
import { Icon } from 'zinc:icons';
import { Spinner } from 'zinc:ui/kit';
import { ProgressBar } from '../components/progress-bar';
import { LogView } from '../components/log-view';
import { shownPath } from '../services/paths';
import { labelOf } from '../services/catalog';
import { catalog, profile, status, stepIndex, stepTotal, stepLabel, stepProgress, stepDetail, errorMessage, imagePath, logLines, startBuild, stopBuild, revealImage, openImager } from '../state';

function statusText(): string {
  if (status() === 'running') return stepLabel() === '' ? 'Starting the build…' : stepLabel();
  if (status() === 'done') return 'The image is ready';
  if (status() === 'failed') return 'The build failed. Check the details below.';
  return 'A few minutes to build. A whole world to make.';
}

function barColor(): string { return status() === 'failed' ? '#dc6658' : '#a6ca7f'; }
/** Hundredths of a step: the current step's own progress, while a long command reports it, fills its share of the bar. */
function stepsDone(): i32 {
  const p = stepProgress();
  return status() === 'running' && p >= 0 ? (stepIndex() - 1) * 100 + Math.min(p, 100) as i32 : stepIndex() * 100;
}
function stepsTotal(): i32 { return stepTotal() * 100; }
function percent(): i32 { return stepTotal() <= 0 ? 0 : Math.round(100 * Math.min(stepsDone(), stepsTotal()) / stepsTotal()) as i32; }

function SummaryRow(p: { icon: string; text: string }): i32 {
  return <View className="flex-row items-center gap-2.5"><Icon name={p.icon} size={14} color={() => 0x9dad99} /><Text className="text-xs text-[#d5ddcd]">{p.text}</Text></View>;
}

export function BuildPage(): i32 {
  return <View className="flex-col w-[420px] max-[1000px]:w-[360px] min-[1400px]:w-[480px] shrink-0 min-h-0 gap-5 p-6 bg-[#20362b]">
    <View className="flex-row items-center gap-2"><View className={`w-2 h-2 rounded-full ${status() === 'failed' ? 'bg-[#dc6658]' : 'bg-[#a6ca7f]'}`} /><Text className="font-mono text-[10px] text-[#a6ba98]">YOUR NEXT LITTLE COMPUTER</Text></View>
    <View className="flex-col gap-2">
      <Text className="text-[28px] font-semibold text-[#f0f4e9]">{status() === 'done' ? 'Ready for your Pi.' : status() === 'running' ? 'Making your image.' : status() === 'failed' ? 'A little snag.' : 'Ready when you are.'}</Text>
      <Text className="text-sm text-[#afbfaa]">{statusText()}</Text>
    </View>
    <Show when={status() === 'idle'}><View className="flex-col gap-3 p-4 rounded-[8px] bg-[#2b4435] border border-[#3c5340]">
      <SummaryRow icon="cpu" text={labelOf(catalog.boards, profile().board)} />
      <SummaryRow icon="monitor" text={labelOf(catalog.displays, profile().display)} />
      <SummaryRow icon="wifi" text={profile().wifiName === '' ? 'Ethernet · configure Wi-Fi later' : profile().wifiName} />
      <SummaryRow icon="user-round" text={profile().userName === '' ? 'Player only · no administrator account' : profile().userName + (profile().ssh ? ' · SSH enabled' : ' · SSH off')} />
    </View></Show>
    <Show when={status() !== 'idle'}><SummaryRow icon="cpu" text={labelOf(catalog.boards, profile().board)} /></Show>
    <View className="flex-col gap-3">
      <View className="flex-row items-center gap-2">
        <Button aria-label="Build the image" disabled={status() === 'running'} onClick={startBuild} className={`grow flex-row items-center justify-center gap-2 h-10 rounded-[6px] bg-[#b7d995] hover:bg-[#c7e5a8] ${status() === 'running' ? 'opacity-70' : ''}`}>
          <Show when={status() === 'running'}><Spinner size={17} color={() => 0x203c29} active={() => status() === 'running'} /></Show>
          <Show when={status() !== 'running'}><Icon name="hammer" size={17} color={() => 0x203c29} /></Show>
          <Text className="text-sm font-semibold text-[#203c29]">{status() === 'running' ? 'Building…' : 'Build the image'}</Text>
        </Button>
        <Show when={status() === 'running'}><ActionButton label="Stop" icon="square" color="neutral" variant="outline" onClick={stopBuild} /></Show>
      </View>
      <Show when={status() !== 'idle'}>
        <View className="flex-col gap-2">
          <ProgressBar done={stepsDone} total={stepsTotal} color={barColor} />
          <View className="flex-row items-center h-5 shrink-0"><Text className="text-xs text-[#afbfaa]">{stepTotal() > 0 ? `Step ${stepIndex()} of ${stepTotal()}` : 'Preparing the build'}</Text><View className="grow" /><Text className="font-mono text-xs text-[#d4e4c7]">{stepTotal() > 0 ? percent() + '%' : '…'}</Text></View>
          <Show when={status() === 'running' && stepDetail() !== ''}><Text className="font-mono text-[11px] text-[#c3d3b8]">{stepDetail()}</Text></Show>
        </View>
      </Show>
      <Show when={errorMessage() !== ''}><Text className="text-sm text-[#ffb7a8]">{errorMessage()}</Text></Show>
      <Show when={imagePath() !== ''}>
        <View className="flex-col gap-3 p-3 rounded-[8px] bg-[#2c4838] border border-[#59734b]">
          <View className="flex-row gap-2 items-center"><Icon name="circle-check" size={17} color={() => 0xb7d995} /><Text className="font-mono text-xs text-[#e5efd8]">{shownPath(imagePath())}</Text></View>
          <View className="flex-row gap-2">
            <ActionButton label="Show file" icon="folder-open" color="neutral" variant="outline" size="sm" onClick={revealImage} />
            <ActionButton label="Open Imager" icon="external-link" color="neutral" variant="outline" size="sm" onClick={openImager} />
          </View>
          <Text className="text-xs text-[#b8c7ad]">Flash the .img.xz with Imager or Etcher.</Text>
        </View>
      </Show>
    </View>
    <LogView lines={logLines} />
    <View className="flex-row items-center gap-2 shrink-0"><Icon name="hard-drive" size={13} color={() => 0x859b7d} /><Text className="text-[11px] text-[#9bad90]">Docker required · about 6 GB free disk space</Text></View>
  </View>;
}
