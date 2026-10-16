// Settings: tabs switching two panels, switches, a slider and a live progress bar.
import { Card, CardHeader, CardContent, Tabs, Switch, Slider, Progress, Separator, smallText, mutedText } from 'zinc:ui/kit';
import { tab, setTab, volume, setVolume, notifications, setNotifications, autoUpdate, setAutoUpdate, upload } from '../state';

function GeneralPanel(): i32 {
  return <View className="flex-col gap-4">
    <Switch checked={notifications} onChange={setNotifications} label="Notifications" />
    <Switch checked={autoUpdate} onChange={setAutoUpdate} label="Install updates automatically" />
    <Separator />
    <View className="flex-col gap-2">
      <View className="flex-row justify-between">
        <Text className={smallText()}>Volume</Text>
        <Text className={mutedText()}>{Math.round(volume())} %</Text>
      </View>
      <Slider value={volume} onChange={setVolume} step={5} />
    </View>
  </View>;
}

function SyncPanel(): i32 {
  return <View className="flex-col gap-2">
    <View className="flex-row justify-between">
      <Text className={smallText()}>Uploading photos</Text>
      <Text className={mutedText()}>{Math.floor(upload())} %</Text>
    </View>
    <Progress value={upload} />
    <Text className={mutedText()}>The bar follows a signal updated every frame.</Text>
  </View>;
}

export function SettingsCard(): i32 {
  return <Card className="w-[360px]">
    <CardHeader title="Settings" description="Tabs, switches, a slider and progress." />
    <CardContent>
      <Tabs items={['General', 'Sync']} selected={tab} onSelect={setTab} className="w-full" />
      {tab() === 0 ? <GeneralPanel /> : <SyncPanel />}
    </CardContent>
  </Card>;
}
