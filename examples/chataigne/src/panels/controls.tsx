// Show controls: four faders with the meter Chataigne sends back under each, the cue transport and the toggles.
// Faders and toggles move locally and send at once; Chataigne can move them back (/zinc/fader/n, /zinc/toggle/n).
import { Card, CardHeader, CardContent, Slider, Progress, Switch, Button, Badge, heading, smallText, captionText, mutedText } from 'zinc:ui/kit';
import { channels, Channel, toggles, Toggle, cueName, cueRunning } from '../state';
import { sendFader, sendToggle, go, stop } from '../link';

function Strip(props: { channel: Channel }): i32 {
  const c = props.channel;
  return <View class="flex-col gap-1.5">
    <View class="flex-row items-center justify-between">
      <Text class={smallText()}>{`Fader ${c.index}`}</Text>
      <Text class={mutedText()}>{`${Math.round(c.fader() * 100)} %`}</Text>
    </View>
    <Slider value={c.fader} onChange={(v: number) => sendFader(c, v)} min={0} max={1} step={0.01} />
    <Progress value={() => c.meter() * 100} accent={true} />
  </View>;
}

export function FadersCard(): i32 {
  return <Card>
    <CardHeader title="Faders" description="/zinc/fader/1..4 out; the meters come back from Chataigne." />
    <CardContent class="gap-4">
      {channels.map((c: Channel) => <Strip channel={c} />)}
    </CardContent>
  </Card>;
}

export function CueCard(): i32 {
  return <Card>
    <CardHeader title="Cue" description="GO and Stop out, the cue name back." />
    <CardContent>
      <View class="flex-row items-center gap-2">
        <Text class={captionText()}>NOW PLAYING</Text>
        {cueRunning() ? <Badge label="Running" variant="success" /> : <Badge label="Idle" variant="secondary" />}
      </View>
      <Text class={heading(3)}>{cueName()}</Text>
      <View class="flex-row gap-2">
        <Button label="GO" size="lg" class="grow" onClick={go} />
        <Button label="Stop" size="lg" variant="outline" onClick={stop} />
      </View>
    </CardContent>
  </Card>;
}

export function TogglesCard(): i32 {
  return <Card>
    <CardHeader title="Toggles" />
    <CardContent>
      {toggles.map((t: Toggle) => <Switch checked={t.on} onChange={(on: boolean) => sendToggle(t, on)} label={t.name} />)}
    </CardContent>
  </Card>;
}
