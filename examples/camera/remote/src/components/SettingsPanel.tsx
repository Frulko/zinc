// Right sidebar: one stepper row per camera setting, the shutter and the last capture.
import { Button, Separator, overline, captionText } from 'zinc:ui/kit';
import { Setting, settings, openMenu, setOpenMenu, busy, lastFile } from '../state';
import { step, capture, focus, thumbnail } from '../session';
import { drawFitted } from './LiveView';
import { rrect } from 'zinc:gfx';

/** "ISO   [‹] [ Auto ] [›]": the middle button opens the choice list. */
function SettingRow(props: { setting: Setting; index: i32 }): i32 {
  const s = props.setting;
  return <View class="flex-row items-center gap-2 h-9">
    <Text class="w-16 text-sm text-zinc-500">{s.title}</Text>
    <Button label="‹" variant="outline" size="icon" class="w-8 h-8" onClick={() => step(s, -1)} />
    <Button variant="secondary" size="sm" class="grow w-0" onClick={() => setOpenMenu(openMenu() === props.index ? -1 : props.index)}>
      <Text class="text-sm font-medium text-zinc-900">{s.value()}</Text>
    </Button>
    <Button label="›" variant="outline" size="icon" class="w-8 h-8" onClick={() => step(s, 1)} />
  </View>;
}

/** Last capture, drawn from a runtime image (a placeholder until the first photo). */
function drawThumbnail(x: i32, y: i32, w: i32, h: i32): void {
  rrect(x, y, w, h, 12, 0xf4f4f5, 255);
  if (thumbnail >= 0) drawFitted(thumbnail, x, y, w, h);
}

export function SettingsPanel(): i32 {
  return <View class="flex-col w-80 p-4 gap-3 bg-white border border-zinc-200">
    <Text class={overline()}>SETTINGS</Text>
    <View class="flex-col gap-1">
      {settings().map((s: Setting, i: i32) => <SettingRow setting={s} index={i} />)}
    </View>
    <Separator />
    <Button variant="outline" size="lg" class="w-full" onClick={() => { focus(); }}>
      <Text class="text-sm font-medium text-zinc-900">Focus</Text>
    </Button>
    <Button size="lg" class="w-full" onClick={() => { capture(); }}>
      <Text class="text-sm font-medium text-zinc-50">{busy() ? 'Capturing…' : 'Capture'}</Text>
    </Button>
    <Canvas class="grow" onDraw={drawThumbnail} />
    <Text class={captionText()}>{lastFile() === '' ? 'No capture yet' : lastFile()}</Text>
  </View>;
}
