import * as M from 'zinc:monitors';
import { CheckList, Choice } from '../components/GlassChoice';
import { GlassSwitch } from '../components/GlassSwitch';
import { GlassButton } from '../components/GlassButton';
import { TEXT_SMALL, palette } from '../theme';
import { connectDisplay, displays, makeMain, mirrorDisplay, selected } from '../state';

export function ManageDisplay(): i32 {
  const current = (): M.Display => selected() as M.Display;
  const mirrorChoices = (): Choice[] => {
    const out: Choice[] = [{ value: 0, label: 'Off' }];
    for (const other of displays()) if (other.id !== current().id && other.connected) out.push({ value: other.id, label: other.name });
    return out;
  };
  return <View className="gap-1">
    <GlassSwitch label="Connected" value={() => current().connected} onChange={(on: boolean) => connectDisplay(current().id, on)} />
    <Text className={`${TEXT_SMALL} font-medium ${palette().secondary}`}>Mirror</Text>
    <CheckList choices={mirrorChoices} value={() => current().mirrorOf} onChange={(v: number) => mirrorDisplay(current().id, v)} />
    <Show when={!current().main && current().connected}>
      <View className="flex-row"><GlassButton label="Make Main Display" onPress={() => makeMain(current().id)} /></View>
    </Show>
  </View>;
}
