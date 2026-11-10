import { createSignal } from 'zinc:ui/solid';
import { Card, CardHeader, CardContent, Switch, Progress, Button, theme } from 'zinc:ui/kit';
export function Preferences(): i32 {
  const [failures, setFailures] = createSignal(true);
  const [recovery, setRecovery] = createSignal(false);
  const [daily, setDaily] = createSignal(true);
  const [cache, setCache] = createSignal(68.4);
  return <Card><CardHeader title="Desk preferences" description="Local settings · no messages are sent" />
    <CardContent className="gap-4">
      <Switch label="Notify on build failure" checked={failures} onChange={setFailures} />
      <Switch label="Notify on recovery" checked={recovery} onChange={setRecovery} />
      <Switch label="Daily summary" checked={daily} onChange={setDaily} />
      <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{String((failures() ? 1 : 0) + (recovery() ? 1 : 0) + (daily() ? 1 : 0)) + ' notification rules enabled'}</Text>
      <View className={`flex-col gap-3 border-t border-${theme().border} pt-4`}>
        <Text className={`text-[13px] text-${theme().foreground}`}>Sample build cache</Text>
        <Progress value={cache} />
        <Text role="status" className={`text-[12px] tabular-nums text-${theme().mutedForeground}`}>{cache().toFixed(1) + ' / 100 GB'}</Text>
        <Button label="Clear sample cache" variant="outline" disabled={cache() === 0} onClick={() => setCache(0)} />
      </View>
    </CardContent>
  </Card>;
}
