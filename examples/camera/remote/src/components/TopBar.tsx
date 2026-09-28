// Top bar: the camera picker (click to cycle when several are plugged in), Rescan, live view statistics and switch.
import { Button, Switch, heading, captionText, smallText } from 'zinc:ui/kit';
import { cameras, cameraIndex, model, live, stats } from '../state';
import { scan, nextCamera, setLiveView } from '../session';

/** "Canon EOS R6 (1/2)" when several cameras are plugged in. */
function cameraLabel(): string {
  const name = model() === '' ? 'No camera' : model();
  return cameras().length > 1 ? `${name} (${cameraIndex() + 1}/${cameras().length})` : name;
}

export function TopBar(): i32 {
  return <View class="flex-row items-center gap-3 h-14 px-4 bg-white border border-zinc-200">
    <Text class={heading(4)}>Camera</Text>
    <Button variant="outline" size="sm" onClick={nextCamera}>
      <Text class={smallText()}>{cameraLabel()}</Text>
    </Button>
    <Button label="Rescan" variant="ghost" size="sm" onClick={() => { scan(); }} />
    <View class="grow" />
    <Text class={captionText()}>{stats()}</Text>
    <Switch checked={live} onChange={setLiveView} label="Live view" />
  </View>;
}
