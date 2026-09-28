// The showcase page: one card per built-in module, in a wrapping grid inside a scroll view.
import { Button, heading, mutedText, smallText } from 'zinc:ui/kit';
import * as sys from 'zinc:sys';
import * as telemetry from 'zinc:telemetry';
import * as assets from 'zinc:assets';
import { ModuleCard } from './components/module-card';
import { uptime, liveObjects, launches, notes, appendNote } from './services/system';
import { HTTP_PORT, httpReply, oscLast, mqttLast } from './services/network';
import { LED_PIN, BUTTON_PIN, ledOn, lastEvent, pressButton } from './services/hardware';

/** A round LED indicator. */
function Led(props: { on: () => boolean }): i32 {
  return <View class={props.on() ? 'w-3 h-3 rounded-full bg-emerald-500' : 'w-3 h-3 rounded-full bg-zinc-300'} />;
}

function Cards(): i32 {
  return <View class="flex-row flex-wrap gap-4">
    <ModuleCard title="System" module="zinc:sys">
      <Text class={mutedText()}>{sys.platform()} · up {uptime()} · {liveObjects()} live objects</Text>
    </ModuleCard>
    <ModuleCard title="Key/value store" module="zinc:storage">
      <Text class={mutedText()}>Launched {launches} time(s): restart the app to count up.</Text>
    </ModuleCard>
    <ModuleCard title="Files" module="zinc:fs">
      <View class="flex-row items-center gap-3">
        <Button label="Append" variant="outline" size="sm" onClick={appendNote} />
        <Text class={mutedText()}>{notes()}</Text>
      </View>
    </ModuleCard>
    <ModuleCard title="HTTP server + client" module="zinc:net">
      <Text class={mutedText()}>GET :{HTTP_PORT}/ping → {httpReply()}</Text>
    </ModuleCard>
    <ModuleCard title="OSC loopback" module="zinc:osc">
      <Text class={mutedText()}>{oscLast()}</Text>
    </ModuleCard>
    <ModuleCard title="MQTT" module="zinc:mqtt">
      <Text class={mutedText()}>{mqttLast()}</Text>
    </ModuleCard>
    <ModuleCard title="GPIO" module="zinc:gpio">
      <View class="flex-row items-center gap-3">
        <Button label={`Press pin ${BUTTON_PIN}`} variant="outline" size="sm" onClick={pressButton} />
        <Led on={ledOn} />
        <Text class={smallText()}>LED on pin {LED_PIN}</Text>
      </View>
    </ModuleCard>
    <ModuleCard title="Events + telemetry" module="zinc:events">
      <Text class={mutedText()}>{lastEvent() === '' ? 'Press the GPIO button.' : lastEvent()} · telemetry {telemetry.enabled() ? 'on' : 'off (set ZINC_TELEMETRY)'}</Text>
    </ModuleCard>
    <ModuleCard title="Embedded assets" module="zinc:assets">
      <Text class={mutedText()}>{assets.list().join(', ')}: {assets.readText('hello.txt').trim()}</Text>
    </ModuleCard>
  </View>;
}

export function App(): i32 {
  return <ScrollView class="h-full bg-zinc-50">
    <View class="flex-col gap-6 p-6">
      <View class="flex-col gap-1">
        <Text class={heading(2)}>Native modules, live</Text>
        <Text class={mutedText()}>Every card talks to the real module; the network ones talk to themselves over loopback.</Text>
      </View>
      <Cards />
    </View>
  </ScrollView>;
}
