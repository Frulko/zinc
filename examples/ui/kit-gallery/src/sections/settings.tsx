// Settings: tabs switching two panels, switches, a slider and a live progress bar.
import { Card, CardHeader, CardContent, Tabs, Switch, Slider, Progress, Separator, smallText, mutedText } from 'zinc:ui/kit';
import { tab, setTab, volume, setVolume, notifications, setNotifications, autoUpdate, setAutoUpdate, upload } from '../state';

function GeneralPanel(): i32 {
  return <View class="flex-col gap-4">
    <Switch checked={notifications} onChange={setNotifications} label="Notifications" />
    <Switch checked={autoUpdate} onChange={setAutoUpdate} label="Install updates automatically" />
    <Separator />
    <View class="flex-col gap-2">
      <View class="flex-row justify-between">
        <Text class={smallText()}>Volume</Text>
        <Text class={mutedText()}>{Math.round(volume())} %</Text>
      </View>
      <Slider value={volume} onChange={setVolume} step={5} />
    </View>
  </View>;
}

function SyncPanel(): i32 {
  return <View class="flex-col gap-2">
    <View class="flex-row justify-between">
      <Text class={smallText()}>Uploading photos</Text>
      <Text class={mutedText()}>{Math.floor(upload())} %</Text>
    </View>
    <Progress value={upload} />
    <Text class={mutedText()}>The bar follows a signal updated every frame.</Text>
  </View>;
}

export function SettingsCard(): i32 {
  return <Card class="w-[360px]">
    <CardHeader title="Settings" description="Tabs, switches, a slider and progress." />
    <CardContent>
      <Tabs items={['General', 'Sync']} selected={tab} onSelect={setTab} class="w-full" />
      {tab() === 0 ? <GeneralPanel /> : <SyncPanel />}
    </CardContent>
  </Card>;
}
