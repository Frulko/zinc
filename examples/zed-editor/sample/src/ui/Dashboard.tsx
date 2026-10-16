// The report as a zinc:ui screen: one card per statistic and a button to switch the unit.
import { createSignal, render } from 'zinc:ui/solid';
import { mean, minMax } from '../lib/stats';
import { celsius } from '../lib/format';
import './theme.css';

const TEMPS: number[] = [11.2, 10.8, 10.1, 9.7, 9.5, 9.9, 11.4, 13.6, 15.9, 18.2, 20.1, 21.7];
const [unit, setUnit] = createSignal<string>('C');

interface StatProps { label: string; value: () => string }

function Stat(props: StatProps): i32 {
  return <View className="card flex-col gap-1">
    <Text className="text-xs text-slate-400">{props.label}</Text>
    <Text className="text-2xl font-bold text-white">{props.value()}</Text>
  </View>;
}

function Dashboard(): i32 {
  const range = minMax(TEMPS);
  return (
  <View className="flex-col gap-4 p-6 h-full bg-slate-950">
    <Text className="text-lg font-bold text-white">Weather station</Text>
    <View className="flex-row gap-3">
      <Stat label="Mean" value={() => celsius(mean(TEMPS))} />
      <Stat label="Coldest" value={() => celsius(range[0])} />
      <Stat label="Warmest" value={() => celsius(range[1])} />
    </View>
    <Button className="px-3 py-1 rounded bg-sky-600" onClick={() => setUnit(unit() === 'C' ? 'F' : 'C')}>
      <Text className="text-sm text-white">Unit: {unit()}</Text>
    </Button>
  </View>
  );
}

render(Dashboard, 0x020617, null);
