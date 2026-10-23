// The build: start and stop it, where it is, what went wrong, the image when it is made, and its log.
import { Show } from 'zinc:ui/solid';
import { theme, hex, Card, Button } from 'zinc:ui/nuxt';
import { ProgressBar } from '../components/progress-bar';
import { LogView } from '../components/log-view';
import { shownPath } from '../services/paths';
import { status, stepIndex, stepTotal, stepLabel, errorMessage, imagePath, logLines, startBuild, stopBuild, revealImage, openImager } from '../state';

function statusText(): string {
  if (status() === 'running') return stepTotal() > 0 ? `Step ${stepIndex()} of ${stepTotal()}: ${stepLabel()}` : stepLabel();
  if (status() === 'done') return 'The image is ready';
  if (status() === 'failed') return 'The build failed';
  return 'Builds Raspberry Pi OS Lite with Zinc in Docker: a few minutes, about 6 GB of disk while it runs';
}

function barColor(): string {
  if (status() === 'failed') return theme().color('error');
  if (status() === 'done') return theme().color('success');
  return theme().color('primary');
}

export function BuildPage(): i32 {
  return <View className="flex-col grow basis-0 gap-3 p-4">
    <Card title="Build">
      <View className="flex-col gap-3">
        <View className="flex-row gap-2">
          <Button label="Build the image" icon="hammer" loading={status() === 'running'} disabled={status() === 'running'} onClick={startBuild} />
          <Show when={status() === 'running'}><Button label="Stop" icon="square" color="neutral" variant="outline" onClick={stopBuild} /></Show>
        </View>
        <ProgressBar done={stepIndex} total={stepTotal} color={barColor} />
        <Text className={`text-sm text-${hex(theme().text)}`}>{statusText()}</Text>
        <Show when={errorMessage() !== ''}>
          <Text className={`text-sm text-${hex(theme().color('error'))}`}>{errorMessage()}</Text>
        </Show>
        <Show when={imagePath() !== ''}>
          <View className="flex-col gap-2">
            <Text className={`font-mono text-xs text-${hex(theme().textMuted)}`}>{shownPath(imagePath())}</Text>
            <View className="flex-row gap-2">
              <Button label="Show in Finder" icon="folder-open" color="neutral" variant="outline" onClick={revealImage} />
              <Button label="Raspberry Pi Imager" icon="external-link" color="neutral" variant="outline" onClick={openImager} />
            </View>
          </View>
        </Show>
      </View>
    </Card>
    <LogView lines={logLines} />
  </View>;
}
