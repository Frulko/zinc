import { Checkbox, Switch, RadioGroup, Separator, theme } from 'zinc:ui/kit';
import { Settings } from '../state';
export function Notifications(p: { model: Settings }): i32 {
  const m = p.model;
  return <View className="flex-col gap-6">
    <View className="flex-col gap-4">
      <Text className={`text-[15px] font-medium text-${theme().foreground}`}>Email notifications</Text>
      <Checkbox label="Comments" description="Replies to your comments and conversations." checked={() => m.draft().comments} onChange={(comments: boolean) => m.edit({ ...m.draft(), comments })} />
      <Checkbox label="Mentions" description="When a teammate mentions you directly." checked={() => m.draft().mentions} onChange={(mentions: boolean) => m.edit({ ...m.draft(), mentions })} />
      <Checkbox label="Weekly digest" description="A quiet summary of the week's activity." checked={() => m.draft().digest} onChange={(digest: boolean) => m.edit({ ...m.draft(), digest })} />
    </View>
    <Separator />
    <Text className={`text-[15px] font-medium text-${theme().foreground}`}>On your devices</Text>
    <RadioGroup label="Push notifications" value={() => m.draft().push} onChange={(push: string) => m.edit({ ...m.draft(), push })} items={[{ value: 'all', label: 'All activity' }, { value: 'mentions', label: 'Mentions only' }, { value: 'none', label: 'No push notifications' }]} />
    <Switch label="Desktop notifications" checked={() => m.draft().desktop} onChange={(desktop: boolean) => m.edit({ ...m.draft(), desktop })} />
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>Preference preview only. No messages are sent and no device permissions are requested.</Text>
  </View>;
}
