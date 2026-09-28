// The panel: three metric tiles, the live temperature chart and the button controls.
import { Stat, Badge, Card, CardHeader, CardContent, Button, Kbd, heading, mutedText, captionText } from 'zinc:ui/kit';
import { ledOn, presses, simulatePress, LED_PIN, BUTTON_PIN } from './board';
import { temperature, range } from './sensor';
import { drawChart } from './components/chart';

function Header(): i32 {
  return <View class="flex-row items-center justify-between">
    <View class="flex-col gap-1">
      <Text class={heading(3)}>IoT panel</Text>
      <Text class={mutedText()}>GPIO button → LED, a live sensor, telemetry and OSC.</Text>
    </View>
    <Badge label="Simulated board" variant="secondary" />
  </View>;
}

function Metrics(): i32 {
  return <View class="flex-row gap-4">
    <Stat class="grow" label="Temperature" value={() => temperature().toFixed(1)} unit="°C" hint="sensor 1, every frame" />
    <Stat class="grow" label="LED" value={() => ledOn() ? 'On' : 'Off'} hint={`pin ${LED_PIN}`}>
      {ledOn() && <Badge label="Lit" variant="success" />}
    </Stat>
    <Stat class="grow" label="Button presses" value={() => `${presses()}`} hint={`pin ${BUTTON_PIN}, debounced 20 ms`} />
  </View>;
}

function ChartCard(): i32 {
  return <Card class="grow">
    <CardHeader title="Temperature" description="Last two seconds, 15 to 30 °C." />
    <CardContent class="grow">
      <Canvas class="grow rounded-md" onDraw={drawChart} />
      <Text class={captionText()}>{range()}</Text>
    </CardContent>
  </Card>;
}

function Controls(): i32 {
  return <View class="flex-row items-center gap-3">
    <Button label="Press the button" onClick={simulatePress} />
    <Text class={mutedText()}>or hold</Text>
    <Kbd label="X" />
  </View>;
}

export function App(): i32 {
  return <View class="flex-col gap-5 p-6 h-full bg-zinc-50">
    <Header />
    <Metrics />
    <ChartCard />
    <Controls />
  </View>;
}
