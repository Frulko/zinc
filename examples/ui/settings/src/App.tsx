import * as ui from 'zinc:ui';
import { width } from 'zinc:gfx';
import { createSignal, onCleanup } from 'zinc:ui/solid';
import { Sidebar, Tabs, Button, theme } from 'zinc:ui/kit';
import { createSettings, sections } from './state';
import { Profile } from './pages/Profile';
import { Notifications } from './pages/Notifications';
import { Appearance } from './pages/Appearance';
import { Account } from './pages/Account';
export function App(): i32 {
  const model = createSettings();
  const [viewport, setViewport] = createSignal(width());
  const resize = (): void => { if (width() !== viewport()) setViewport(width()); };
  ui.addWatcher(resize);
  onCleanup(() => ui.removeWatcher(resize));
  const descriptions = ['How others see you.', 'Choose what you hear about.', 'Make this space yours.', 'Your workspace and sample sessions.'];
  return <View className={`w-full h-full flex-col bg-${theme().background}`}>
    <ScrollView className="flex-1 min-h-0">
      <View className={`w-full max-w-[1080px] self-center flex-col ${viewport() < 760 ? 'p-4 gap-6' : 'p-10 gap-8'}`}>
        <View className="flex-col gap-2">
          <Text className={`text-[12px] text-${theme().mutedForeground}`}>{'Fieldwork / Settings / ' + model.section()}</Text>
          <Text className={`text-[28px] font-medium text-${theme().foreground}`}>Settings</Text>
          <Text className={`text-[13px] text-${theme().mutedForeground}`}>A space that works the way you do.</Text>
        </View>
        <Show when={viewport() < 760}><Tabs label="Settings sections" items={sections} selected={() => sections.indexOf(model.section())} onSelect={(index: i32) => model.navigate(sections[index])} className="w-full" /></Show>
        <View className="flex-row gap-10 items-start">
          <Show when={viewport() >= 760}>
            <Sidebar label="Settings sections" selected={model.section} onSelect={model.navigate} groups={[{ id: 'settings', label: 'Preferences', items: [{ id: 'Profile', label: 'Profile', icon: 'user' }, { id: 'Notifications', label: 'Notifications', icon: 'bell' }, { id: 'Appearance', label: 'Appearance', icon: 'palette' }, { id: 'Account', label: 'Account', icon: 'shield' }] }]} className="w-[200px] shrink-0" />
          </Show>
          <View className="flex-1 min-w-0 flex-col gap-6">
            <View className="flex-col gap-2">
              <Text className={`text-[22px] font-medium text-${theme().foreground}`}>{model.section()}</Text>
              <Text className={`text-[13px] text-${theme().mutedForeground}`}>{descriptions[sections.indexOf(model.section())]}</Text>
            </View>
            <View className={`flex-col p-5 gap-6 rounded-[18px] border border-${theme().border} bg-${theme().card}`}>
              <Show when={model.section() === 'Profile'}><Profile model={model} narrow={viewport() < 960} /></Show>
              <Show when={model.section() === 'Notifications'}><Notifications model={model} /></Show>
              <Show when={model.section() === 'Appearance'}><Appearance model={model} /></Show>
              <Show when={model.section() === 'Account'}><Account /></Show>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
    <View className={`shrink-0 flex-col gap-3 px-4 py-3 border-t border-${theme().border} bg-${theme().card}`}>
      <View className={`w-full max-w-[1000px] self-center ${viewport() < 760 ? 'flex-col items-stretch' : 'flex-row items-center'} gap-3`}>
        <Text role="status" aria-live="polite" className={`${viewport() < 760 ? '' : 'flex-1 min-w-0'} text-[12px] text-${theme().mutedForeground}`}>{model.notice()}</Text>
        <View className="flex-row justify-end gap-2">
          <Button label="Discard" variant="ghost" disabled={!model.dirty()} onClick={model.discard} />
          <Button label="Save changes" disabled={!model.dirty()} onClick={model.save} />
        </View>
      </View>
    </View>
  </View>;
}
