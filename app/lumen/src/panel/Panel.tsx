// What opens under the menu bar icon: the sliders first, then a menu of everything else about the selected display, then the tools.
import * as M from 'zinc:monitors';
import { NodeRef, createSignal } from 'zinc:ui/solid';
import * as autostart from 'zinc:system/autostart';
import { quit } from 'zinc:system';
import { GlassSlider } from '../components/GlassSlider';
import { GlassSwitch, SwitchControl } from '../components/GlassSwitch';
import { CheckList, Choice, Segmented } from '../components/GlassChoice';
import { MenuRow, PlainRow, RowIcon } from '../components/MenuRow';
import { RevertBanner } from '../components/RevertBanner';
import { ResolutionSlider, DisplayModeList, RefreshRates } from './DisplayModes';
import { PictureInPicture } from './PictureInPicture';
import { ManageDisplay } from './ManageDisplay';
import { Arrangement } from './Arrangement';
import { VirtualScreens } from './VirtualScreens';
import { TEXT_ROW, TEXT_SMALL, palette } from '../theme';
import { boost, boostLimit, brightness, contrast, displays, hasDdc, input, muted, notice, revertLeft, rotateDisplay, selectDisplay, selected, selectedId, setBoost, setBrightness, setContrast, setInput, setMuted, setVolume, setWarmth, sharpSourceOf, sharpenDisplay, stopSharpening, volume, warmth } from '../state';

const ROTATIONS: Choice[] = [{ value: 0, label: '0°' }, { value: 90, label: '90°' }, { value: 180, label: '180°' }, { value: 270, label: '270°' }];
const INPUTS: Choice[] = [{ value: 15, label: 'DisplayPort 1' }, { value: 16, label: 'DisplayPort 2' }, { value: 17, label: 'HDMI 1' }, { value: 18, label: 'HDMI 2' }, { value: 27, label: 'USB-C' }];

function inputName(code: number): string {
  for (const c of INPUTS) if (c.value === code) return c.label;
  return '';
}
function Separator(): i32 { return <View className={`h-px mx-1 my-[6px] ${palette().separator}`} />; }

/** A row with a switch where the others have a chevron. */
function SwitchRow(props: { label: string; icon: string; value: () => boolean; onChange: (on: boolean) => void }): i32 {
  return <View role="switch" focusable aria-label={props.label} className={`cursor-pointer flex-row items-center gap-2 h-[28px] px-1 rounded-[7px] ${palette().rowHover}`} onPress={() => props.onChange(!props.value())}>
    <RowIcon name={props.icon} />
    <Text className={`grow shrink ${TEXT_ROW} ${palette().label}`}>{props.label}</Text>
    <SwitchControl value={props.value} />
  </View>;
}

export function Panel(props: { contentRef: NodeRef }): i32 {
  const current = (): M.Display => selected() as M.Display;
  const [startAtLogin, setStartAtLogin] = createSignal<boolean>(false);
  autostart.isEnabled().then((on: boolean) => setStartAtLogin(on));
  const changeStartAtLogin = (on: boolean): void => {
    setStartAtLogin(on);
    if (on) autostart.enable(true); else autostart.disable();
  };
  const displayChoices = (): Choice[] => displays().map((d: M.Display) => ({ value: d.id, label: d.name }));
  const canBeSharpened = (): boolean => selected() !== null && !current().builtin && !current().virtual && (current().pixelWidth === current().width || sharpSourceOf(current()) !== 0);
  return <View className={`w-full h-full rounded-[16px] overflow-hidden ${palette().panel}`}>
    <ScrollView showsVerticalScrollIndicator={false} className="w-full h-full">
      <View ref={props.contentRef} className="p-[10px]">
        <Show when={revertLeft() > 0}><View className="pb-2"><RevertBanner /></View></Show>
        <Show when={notice() !== ''}><Text className={`${TEXT_SMALL} px-1 pb-2 ${palette().warning}`}>{notice()}</Text></Show>
        <Show when={displays().length > 1}>
          <View className="pb-1"><CheckList choices={displayChoices} value={selectedId} onChange={selectDisplay} /></View>
          <Separator />
        </Show>

        <Show when={selected() !== null}><View>
          <View className="gap-2 px-1 pt-[2px] pb-[2px]">
            <View className="pb-[2px]">
              <Text className={`text-[13px] font-semibold ${palette().label}`}>{current().name}</Text>
              <Text className={`${TEXT_SMALL} ${palette().secondary}`}>{`${current().width} × ${current().height} · ${Math.round(current().refresh)} Hz`}</Text>
            </View>
            <GlassSlider label="Brightness" icon="sun.max" value={brightness} onChange={setBrightness} />
            <Show when={hasDdc()}><GlassSlider label="Volume" icon="speaker.wave.2" value={volume} onChange={setVolume} /></Show>
            <ResolutionSlider />
          </View>
          <Separator />
          <MenuRow label="Display Mode" icon="display" value={() => `${current().width} × ${current().height}`}><DisplayModeList /></MenuRow>
          <MenuRow label="Refresh Rate" icon="speedometer" value={() => `${Math.round(current().refresh)} Hz`}><RefreshRates /></MenuRow>
          <MenuRow label="Picture in Picture" icon="pip"><PictureInPicture /></MenuRow>
          <MenuRow label="Screen Rotation" icon="rotate.right" value={() => `${current().rotation}°`}>
            <Segmented choices={() => ROTATIONS} value={() => current().rotation} onChange={(v: number) => rotateDisplay(current().id, v)} />
          </MenuRow>
          <MenuRow label="Image Adjustments" icon="camera.filters">
            <GlassSlider label="Warmth" value={warmth} onChange={setWarmth} />
            <Show when={boostLimit() > 1}>
              <GlassSlider label="XDR Boost" value={boost} min={1} max={boostLimit()} format={(v: number) => `${v.toFixed(1)} ×`} onChange={setBoost} />
            </Show>
          </MenuRow>
          <Show when={hasDdc()}><View>
            <MenuRow label="Device Control" icon="slider.horizontal.3">
              <GlassSlider label="Contrast" value={contrast} onChange={setContrast} />
              <GlassSwitch label="Mute" value={muted} onChange={setMuted} />
            </MenuRow>
            <MenuRow label="Input Source" icon="cable.connector" value={() => inputName(input())}><CheckList choices={() => INPUTS} value={input} onChange={setInput} /></MenuRow>
          </View></Show>
          <MenuRow label="Manage Display" icon="gearshape.2"><ManageDisplay /></MenuRow>
          <Show when={canBeSharpened()}>
            <SwitchRow label="High Resolution (HiDPI)" icon="sparkles" value={() => sharpSourceOf(current()) !== 0}
              onChange={(on: boolean) => { if (on) sharpenDisplay(current()); else stopSharpening(current()); }} />
          </Show>
        </View></Show>

        <Separator />
        <MenuRow label="Arrangement" icon="rectangle.3.group"><Arrangement /></MenuRow>
        <MenuRow label="Virtual Screens" icon="display.2"><VirtualScreens /></MenuRow>
        <SwitchRow label="Start at Login" icon="power" value={startAtLogin} onChange={changeStartAtLogin} />
        <Separator />
        <PlainRow label="Quit Lumen" icon="xmark" onPress={() => quit(0)} />
      </View>
    </ScrollView>
  </View>;
}
