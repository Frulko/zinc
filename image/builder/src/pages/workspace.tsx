// The window: a slim sidebar with the steps of the flow, and a calm centered column for the page.
import { Show } from 'zinc:ui/solid';
import '../theme';
import { Icon } from 'zinc:icons';
import { Spinner } from 'zinc:ui/kit';
import { Presets } from '../components/presets';
import { SettingsPage } from './settings';
import { BuildPage } from './build';
import { Page, page, setPage, status } from '../state';

function NavItem(p: { target: Page; label: string; icon: string }): i32 {
  const on = (): boolean => page() === p.target;
  return <Button aria-label={p.label} onClick={() => setPage(p.target)} className={`flex-row items-center gap-2.5 h-8 px-2.5 rounded-[6px] ${on() ? 'bg-[#007aff]' : 'hover:bg-[#e2e2e8]'}`}>
    <Icon name={p.icon} size={16} color={() => on() ? 0xffffff : 0x3a3a3c} />
    <Text className={`grow text-[13px] ${on() ? 'text-white font-medium' : 'text-[#1d1d1f]'}`}>{p.label}</Text>
    <Show when={p.target === 'build' && status() === 'running'}><Spinner size={13} color={() => on() ? 0xffffff : 0x007aff} active={() => status() === 'running'} /></Show>
    <Show when={p.target === 'build' && status() === 'done'}><Icon name="check" size={14} color={() => on() ? 0xffffff : 0x34c759} /></Show>
  </Button>;
}

export function Workspace(): i32 {
  return <View className="w-full h-full flex-row bg-[#f5f5f7]">
    <View className="flex-col w-[220px] max-[1000px]:w-[190px] shrink-0 gap-5 px-3 py-5 bg-[#ececf1] border-r border-[#dcdce2]">
      <View className="flex-row items-center gap-2 px-1.5"><Icon name="layers" size={18} color={() => 0x007aff} /><Text className="text-[15px] font-semibold text-[#1d1d1f]">Zinc Pi Image</Text></View>
      <View className="flex-col gap-0.5">
        <NavItem target="device" label="Device" icon="cpu" />
        <NavItem target="network" label="Network and account" icon="wifi" />
        <NavItem target="apps" label="Apps and options" icon="blocks" />
        <NavItem target="build" label="Build" icon="hammer" />
      </View>
      <View className="grow" />
      <Presets />
    </View>
    <ScrollView className="grow basis-0 min-w-0" aria-label="Image settings">
      <View className="flex-col w-full max-w-[680px] self-center px-8 pt-10 pb-6 max-[1000px]:px-5">
        <Show when={page() !== 'build'}><SettingsPage /></Show>
        <Show when={page() === 'build'}><BuildPage /></Show>
      </View>
    </ScrollView>
  </View>;
}
