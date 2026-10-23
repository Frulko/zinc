import { createSignal, Show } from 'zinc:ui/solid';
import { theme, hex, Input, Select, Button, Modal } from 'zinc:ui/nuxt';
import { Icon } from 'zinc:icons';
import {
  presetNames, selectedPreset, loadPreset, openPresetDialog, presetDialogOpen, closePresetDialog,
  presetName, setPresetName, presetError, savePreset, saveError,
} from '../state';

const [listOpen, setListOpen] = createSignal<boolean>(false);

export function Presets(): i32 {
  return <View className="flex-col gap-2">
    <View className="flex-col gap-2 rounded-[14px] bg-[#eef1e8] p-4">
      <View className="flex-row items-center gap-2"><Icon name="bookmark" size={15} color={() => 0x6b7c5e} /><Text className="text-xs font-semibold text-[#53634b]">Your presets</Text></View>
      <View className="flex-row items-center gap-2">
        <Select items={presetNames()} modelValue={selectedPreset} onUpdate={loadPreset} placeholder="Last settings"
          open={listOpen} onOpen={setListOpen} className="grow basis-0" />
        <Button label="Save as…" icon="save" color="neutral" variant="outline" onClick={openPresetDialog} />
      </View>
      <Text className={`text-xs text-${hex(saveError() === '' ? theme().textMuted : theme().error)}`}>
        {saveError() === '' ? 'Changes are saved automatically and restored next time.' : saveError()}
      </Text>
      <Show when={presetError() !== '' && !presetDialogOpen()}><Text className={`text-xs text-${hex(theme().error)}`}>{presetError()}</Text></Show>
    </View>
    <Modal open={presetDialogOpen} onUpdate={() => closePresetDialog()} title="Save a preset" description="Keep these settings to reuse them for another image.">
      <View className="flex-col gap-3" onSubmit={savePreset}>
        <Input modelValue={presetName} onUpdate={setPresetName} placeholder="Preset name" />
        <Text className={`text-xs text-${hex(theme().textMuted)}`}>Includes Wi-Fi and login settings. Stored only on this computer.</Text>
        <Show when={presetError() !== ''}><Text className={`text-sm text-${hex(theme().error)}`}>{presetError()}</Text></Show>
        <View className="flex-row justify-end gap-2">
          <Button label="Cancel" color="neutral" variant="outline" onClick={closePresetDialog} />
          <Button label="Save preset" icon="save" onClick={savePreset} />
        </View>
      </View>
    </Modal>
  </View>;
}
