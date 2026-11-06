// The settings: the shortcut, the look, starting at login. The window shows a live sample of the list, so a change is seen as it is made.
import { createSignal } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import * as autostart from 'zinc:system/autostart';
import * as D from 'zinc:desktop-windows';
import { Button, Segmented, SettingRow, Toggle } from './components/Controls';
import { hotkeyLabel } from './hotkey';
import { settings, updateSettings } from './settings';
import { applyTrayIcon, refreshTrayMenu } from './trayIcon';
import { ACCENTS, PANEL_RADIUS, iconColor, palette, panelFill } from './theme';

const WIDTHS = [{ value: '420', label: 'Narrow' }, { value: '520', label: 'Medium' }, { value: '680', label: 'Wide' }];
const ROWS = [{ value: '6', label: '6' }, { value: '9', label: '9' }, { value: '12', label: '12' }, { value: '16', label: '16' }];

export const [recordingHotkey, setRecordingHotkey] = createSignal<boolean>(false);
export const [hasAccessibility, setHasAccessibility] = createSignal<boolean>(true);
export const [startsAtLogin, setStartsAtLogin] = createSignal<boolean>(false);
export function changeStartAtLogin(on: boolean): void {
  setStartsAtLogin(on);
  if (on) autostart.enable(true); else autostart.disable();
  refreshTrayMenu();
}

function Section(props: { icon: string; title: string; children: () => i32 }): i32 {
  return <View className="gap-[6px]">
    <View className="flex-row items-center gap-[6px] px-[2px]">
      <Icon name={props.icon} size={13} color={iconColor} />
      <Text className={`text-[11px] font-semibold uppercase ${palette().secondary}`}>{props.title}</Text>
    </View>
    <View className={`rounded-[10px] px-[12px] py-[4px] ${palette().card}`}>{props.children()}</View>
  </View>;
}
function AccentChoice(): i32 {
  return <View className="flex-row gap-[8px]">
    <For each={ACCENTS}>{(color: string) =>
      <View role="button" focusable aria-label={'Accent ' + color} onPress={() => updateSettings({ ...settings(), accent: color })}
        className={`cursor-pointer w-[20px] h-[20px] rounded-full items-center justify-center bg-[${color}]`}>
        <Show when={settings().accent === color}><Icon name="check" size={13} color={() => 0xffffff} strokeWidth={3} /></Show>
      </View>}
    </For>
  </View>;
}
function PermissionBanner(): i32 {
  return <View className={`gap-2 p-3 rounded-[10px] ${palette().control}`}>
    <View className="flex-row items-center gap-2">
      <Icon name="shield-alert" size={16} color={iconColor} />
      <Text className={`text-[13px] font-semibold ${palette().label}`}>Riffle needs Accessibility</Text>
    </View>
    <Text className={`text-[12px] ${palette().secondary}`}>It reads the keyboard shortcut, lists your windows and raises the one you choose. Allow Riffle in System Settings; it starts by itself once allowed.</Text>
    <View className="flex-row"><Button label="Open System Settings" onPress={() => D.hasPermission(true)} /></View>
  </View>;
}

export function changeTrayIcon(on: boolean): void {
  updateSettings({ ...settings(), showTrayIcon: on });
  applyTrayIcon();
}

export function SettingsPanel(props: { onClose: () => void }): i32 {
  const record = (): void => {
    const next = !recordingHotkey();
    setRecordingHotkey(next);
    D.recordHotkey(next);
  };
  return <View className={`w-full h-full rounded-[${PANEL_RADIUS}px] overflow-hidden ${panelFill()} ${palette().panel}`}>
    <View className="flex-row items-center justify-between px-[18px] pt-[18px] pb-[10px]">
      <Text className={`text-[17px] font-semibold ${palette().label}`}>Riffle</Text>
      <Button label="Done" onPress={props.onClose} />
    </View>
    <ScrollView className="flex-1 flex-col px-[18px] pb-[18px] gap-[14px]">
    <Show when={!hasAccessibility()}><PermissionBanner /></Show>
    <Section icon="keyboard" title="Shortcut">
      <SettingRow label="Open and cycle">
        <Button label={recordingHotkey() ? 'Press a chord… (Esc cancels)' : hotkeyLabel(settings().keyCode, settings().modifiers)} onPress={record} />
      </SettingRow>
    </Section>
    <Section icon="palette" title="Appearance">
      <SettingRow label="Theme"><Segmented choices={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} value={() => settings().theme} onChange={(value: string) => updateSettings({ ...settings(), theme: value })} /></SettingRow>
      <SettingRow label="Accent"><AccentChoice /></SettingRow>
      <SettingRow label="Row size"><Segmented choices={[{ value: 'compact', label: 'Compact' }, { value: 'regular', label: 'Regular' }, { value: 'large', label: 'Large' }]} value={() => settings().density} onChange={(value: string) => updateSettings({ ...settings(), density: value })} /></SettingRow>
      <SettingRow label="List width"><Segmented choices={WIDTHS} value={() => String(settings().width)} onChange={(value: string) => updateSettings({ ...settings(), width: Number(value) })} /></SettingRow>
      <SettingRow label="Rows at most"><Segmented choices={ROWS} value={() => String(settings().maxRows)} onChange={(value: string) => updateSettings({ ...settings(), maxRows: Number(value) })} /></SettingRow>
      <SettingRow label="Blur behind the list"><Toggle label="Blur behind the list" value={() => settings().blur} onChange={(on: boolean) => updateSettings({ ...settings(), blur: on })} /></SettingRow>
      <SettingRow label="Show app names"><Toggle label="Show app names" value={() => settings().showAppName} onChange={(on: boolean) => updateSettings({ ...settings(), showAppName: on })} /></SettingRow>
    </Section>
    <Section icon="sliders-horizontal" title="General">
      <SettingRow label="Start at login"><Toggle label="Start at login" value={startsAtLogin} onChange={changeStartAtLogin} /></SettingRow>
      <SettingRow label="Menu bar icon"><Toggle label="Menu bar icon" value={() => settings().showTrayIcon} onChange={changeTrayIcon} /></SettingRow>
      <Show when={!settings().showTrayIcon}><Text className={`text-[11px] ${palette().secondary}`}>Without the icon, open the settings from the list, or by starting Riffle again.</Text></Show>
    </Section>
    </ScrollView>
  </View>;
}
