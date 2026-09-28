// Dashboard: an arc gauge with three readings beside it, and a streaming area chart.
import { Badge } from 'zinc:ui/kit';
import { Panel, tk, rgb } from '../components/ui';
import { drawGauge, drawArea } from '../draw/charts';
import { load, series, chartPhase, temperature, humidity, throughput } from '../app/sensors';
import { uptime, clockText } from '../app/state';


function Reading(props: { label: string; value: () => string; dot: string }): i32 {
  return <View class="flex-col">
    <View class="flex-row items-center gap-1.5">
      <View class={`w-1.5 h-1.5 rounded-full bg-${props.dot}`} />
      <Text class={`text-[10px] text-${tk().mutedForeground}`}>{props.label}</Text>
    </View>
    <Text class={`text-sm font-bold text-${tk().foreground}`}>{props.value()}</Text>
  </View>;
}

export function Home(): i32 {
  return <View class="flex-col gap-2 p-2 grow">
    <Panel class="flex-row items-center p-2 gap-2">
      <Canvas class="w-[96] h-[96]" onDraw={(x: i32, y: i32, w: i32, h: i32) =>
        drawGauge(x, y, w, h, load.get(), rgb(tk().accent), rgb(tk().muted), rgb(tk().foreground), rgb(tk().mutedForeground))} />
      <View class="flex-col grow gap-1">
        <Reading label="Temperature" value={() => `${temperature().toFixed(1)} °C`} dot="rose-500" />
        <Reading label="Humidity" value={() => `${humidity()} %`} dot="sky-500" />
        <Reading label="Uptime" value={() => clockText(uptime())} dot="emerald-500" />
      </View>
    </Panel>
    <Panel class="grow p-2 gap-1">
      <View class="flex-row items-center gap-2 px-1">
        <Text class={`text-[10px] text-${tk().mutedForeground}`}>Throughput</Text>
        <Text class={`grow text-sm font-bold text-${tk().foreground}`}>{`${throughput()} kB/s`}</Text>
        <Badge label="Live" variant="success" />
      </View>
      <Canvas class="grow" onDraw={(x: i32, y: i32, w: i32, h: i32) =>
        drawArea(series, chartPhase(), x, y, w, h, rgb(tk().accent), rgb(tk().border))} />
    </Panel>
  </View>;
}
