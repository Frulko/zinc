import * as tray from 'zinc:system/tray';
import * as menu from 'zinc:system/menu';
import { Card, CardHeader, CardContent, Input, Switch, theme } from 'zinc:ui/kit';
import { userName, rename, dark, setDark } from '../state';

function renderLine(label: string, ok: boolean): i32 {
  const t = theme();
  return <View className="flex-row justify-between"><Text className={`text-[13px] text-${t.foreground}`}>{label}</Text>
    <Text className={`text-[13px] text-${ok ? t.success : t.mutedForeground}`}>{ok ? 'available' : 'not on this platform yet'}</Text></View>;
}

export function Settings(): i32 {
  return <View className="flex-col gap-4">
    <Card>
      <CardHeader title="Profile" />
      <CardContent><Input placeholder="Your name" value={() => userName()} onInput={rename} /></CardContent>
    </Card>
    <Card>
      <CardHeader title="Appearance" description="Saved for the next run." />
      <CardContent><Switch label="Dark mode" checked={dark} onChange={setDark} /></CardContent>
    </Card>
    <Card>
      <CardHeader title="Desktop integration" />
      <CardContent className="gap-2">
        {renderLine('Native menu bar (zinc:system/menu)', menu.native)}
        {renderLine('System tray (zinc:system/tray)', tray.isSupported())}
      </CardContent>
    </Card>
  </View>;
}
