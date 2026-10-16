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
  return <View className={props.on() ? 'w-3 h-3 rounded-full bg-emerald-500' : 'w-3 h-3 rounded-full bg-zinc-300'} />;
}

function Cards(): i32 {
  return <View className="flex-row flex-wrap gap-4">
    <ModuleCard title="System" module="zinc:sys">
      <Text className={mutedText()}>{sys.platform()} · up {uptime()} · {liveObjects()} live objects</Text>
    </ModuleCard>
    <ModuleCard title="Key/value store" module="zinc:storage">
      <Text className={mutedText()}>Launched {launches} time(s): restart the app to count up.</Text>
    </ModuleCard>
    <ModuleCard title="Files" module="zinc:fs">
      <View className="flex-row items-center gap-3">
        <Button label="Append" variant="outline" size="sm" onClick={appendNote} />
        <Text className={mutedText()}>{notes()}</Text>
      </View>
    </ModuleCard>
    <ModuleCard title="HTTP server + client" module="zinc:net">
      <Text className={mutedText()}>GET :{HTTP_PORT}/ping → {httpReply()}</Text>
    </ModuleCard>
    <ModuleCard title="OSC loopback" module="zinc:osc">
      <Text className={mutedText()}>{oscLast()}</Text>
    </ModuleCard>
    <ModuleCard title="MQTT" module="zinc:mqtt">
      <Text className={mutedText()}>{mqttLast()}</Text>
    </ModuleCard>
    <ModuleCard title="GPIO" module="zinc:gpio">
      <View className="flex-row items-center gap-3">
        <Button label={`Press pin ${BUTTON_PIN}`} variant="outline" size="sm" onClick={pressButton} />
        <Led on={ledOn} />
        <Text className={smallText()}>LED on pin {LED_PIN}</Text>
      </View>
    </ModuleCard>
    <ModuleCard title="Events + telemetry" module="zinc:events">
      <Text className={mutedText()}>{lastEvent() === '' ? 'Press the GPIO button.' : lastEvent()} · telemetry {telemetry.enabled() ? 'on' : 'off (set ZINC_TELEMETRY)'}</Text>
    </ModuleCard>
    <ModuleCard title="Embedded assets" module="zinc:assets">
      <Text className={mutedText()}>{assets.list().join(', ')}: {assets.readText('hello.txt').trim()}</Text>
    </ModuleCard>
  </View>;
}

export function App(): i32 {
  return <ScrollView className="h-full bg-zinc-50">
    <View className="flex-col gap-6 p-6">
      <View className="flex-col gap-1">
        <Text className={heading(2)}>Native modules, live</Text>
        <Text className={mutedText()}>Every card talks to the real module; the network ones talk to themselves over loopback.</Text>
      </View>
      <Cards />
    </View>
  </ScrollView>;
}
