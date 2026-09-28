// Connection card: where to send, where to listen, the link status and the simulator switch.
// Fields apply when they lose the focus or on Enter; a new listen port reopens the socket at once.
import { Card, CardHeader, CardContent, Switch, Separator, smallText, mutedText, captionText, theme } from 'zinc:ui/kit';
import { now, stamp } from '../state';
import { lastRx, received } from '../incoming';
import { host, setHost, sendPort, setSendPort, listenPort, changeListenPort, simulated, setSimulated, sent, linkStatus, statusColor } from '../link';

/** A labelled text field. */
function Field(props: { label: string; value: () => string; onCommit: (v: string) => void; class?: string }): i32 {
  return <View class={`flex-col gap-1 ${props.class ?? ''}`}>
    <Text class={captionText()}>{props.label}</Text>
    <Input class={`w-full h-9 px-3 rounded-md border border-${theme().border} bg-${theme().card} text-sm text-${theme().foreground} focus:border-indigo-500`}
      value={props.value()} onChange={props.onCommit} />
  </View>;
}

/** A port number from a field, or the previous one when the text is not a valid port. */
function port(text: string, previous: i32): i32 {
  const p = Math.floor(parseInt(text.trim()));
  return p >= 1 && p <= 65535 ? p : previous;
}

function lastMessage(): string {
  const t = lastRx();
  if (t < 0) return 'no message yet';
  const ago = now() - t;
  return ago < 1 ? `last message just now (${stamp(t)})` : `last message ${ago.toFixed(0)} s ago (${stamp(t)})`;
}

export function ConnectionCard(): i32 {
  return <Card>
    <CardHeader title="Connection" />
    <CardContent>
      <View class="flex-row items-center gap-2">
        <View class={`w-2.5 h-2.5 rounded-full bg-${statusColor(linkStatus())}`} />
        <Text class={smallText()}>{linkStatus()}</Text>
        <View class="grow" />
        <Text class={captionText()}>{`${sent()} out · ${received()} in`}</Text>
      </View>
      <Text class={mutedText()}>{lastMessage()}</Text>
      <Separator />
      <Field label="Chataigne host" value={host} onCommit={(v: string) => setHost(v.trim().length > 0 ? v.trim() : host())} />
      <View class="flex-row gap-3">
        <Field class="grow" label="Send to port" value={() => `${sendPort()}`} onCommit={(v: string) => setSendPort(port(v, sendPort()))} />
        <Field class="grow" label="Listen on port" value={() => `${listenPort()}`} onCommit={(v: string) => changeListenPort(port(v, listenPort()))} />
      </View>
      <Separator />
      <Switch checked={simulated} onChange={setSimulated} label="Simulator (no Chataigne needed)" />
    </CardContent>
  </Card>;
}
