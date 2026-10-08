import * as tray from 'zinc:system/tray';
import * as menu from 'zinc:system/menu';
import { theme, hex, Card, Input, Switch } from 'zinc:ui/nuxt';
import { userName, rename, dark, setDark } from '../state';

function renderLine(label: string, ok: boolean): i32 {
  return <View class="flex-row justify-between"><Text class={`text-sm text-${hex(theme().text)}`}>{label}</Text>
    <Text class={`text-sm text-${hex(ok ? theme().success : theme().textMuted)}`}>{ok ? 'available' : 'not on this platform yet'}</Text></View>;
}

export function Settings(): i32 {
  return <View class="flex-col gap-4">
    <Card title="Profile">
      <Input placeholder="Your name" modelValue={userName} onUpdate={rename} />
    </Card>
    <Card title="Appearance">
      <Switch label="Dark mode" description="Saved for the next run." modelValue={dark} onUpdate={setDark} />
    </Card>
    <Card title="Desktop integration">
      <View class="flex-col gap-2">
        {renderLine('Native menu bar (zinc:system/menu)', menu.native)}
        {renderLine('System tray (zinc:system/tray)', tray.isSupported())}
      </View>
    </Card>
  </View>;
}
