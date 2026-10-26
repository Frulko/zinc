// Running (ZN-844): every Zinc app running on the tablet, its state from its watcher (zinc-watch), CPU, memory and uptime, and Stop.
import { SECTION, TITLE, LABEL } from '../constants';
import { runningApps, runningLine, stopRunning, stuck, waitFor } from '../state';
import { RunningApp } from '../services/running';
import { SolidButton, OutlineButton } from '../components/buttons';

function Row(props: { app: RunningApp }): i32 {
  const a = props.app;
  return <View className="flex-row gap-6 items-center py-6 border-b-2 border-black">
    <View className="flex-col gap-2 grow">
      <Text className={TITLE}>{a.name}</Text>
      <Text className={LABEL}>{runningLine(a)}</Text>
    </View>
    <OutlineButton label="Stop" onClick={() => stopRunning(a.pid)} />
  </View>;
}

export function RunningPage(): i32 {
  return <View className={`${SECTION} grow`}>
    <Text className={TITLE}>Running</Text>
    {runningApps().length === 0 ? <Text className={LABEL}>No Zinc app is running.</Text> : null}
    <ScrollView className="grow">
      <View className="flex-col">{runningApps().map((a: RunningApp) => <Row app={a} />)}</View>
    </ScrollView>
  </View>;
}

/** At the top of every page: an app that stopped responding, and the choice. Stop ends it (it saves on SIGTERM where it can). */
export function StuckBanner(): i32 {
  const a = stuck()[0];
  return <View className="flex-col gap-4 mx-10 mt-8 p-6 border-4 border-black rounded-lg">
    <Text className={TITLE}>{`${a.name} is not responding. Stop it?`}</Text>
    <View className="flex-row gap-6">
      <SolidButton label="Stop" onClick={() => stopRunning(a.pid)} />
      <OutlineButton label="Wait" onClick={() => waitFor(a.pid)} />
    </View>
  </View>;
}
