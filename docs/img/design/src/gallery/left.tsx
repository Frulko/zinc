// The gallery's left column: a form, notification switches, a usage bar.
import { createSignal } from 'zinc:ui/solid';
import { Card, CardHeader, CardContent, Tabs, Input, Button, Switch, Progress, heading, theme } from 'zinc:ui/kit';
import { Label, Muted, AffixField, RoleIcon } from './parts';

const [platformTab, setPlatformTab] = createSignal<i32>(0);
const [runnerName, setRunnerName] = createSignal('linux-arm64-02');
const [token, setToken] = createSignal('kq7Wm2rT9xLp4Vb8Nc3Zs6Hd');

/** A labelled field: the label 6 px above it. */
function Field(props: { label: string; children: () => i32 }): i32 {
  return <View className="flex-col gap-[6px]"><Label text={props.label} />{props.children()}</View>;
}

export function RunnerCard(): i32 {
  return <Card>
    <CardContent className="gap-4">
      <View className="flex-col gap-1">
        <Text className={heading(3)}>Add a runner</Text>
        <Muted text="Runners pick up jobs for the platforms you choose." />
      </View>
      <Tabs items={['Linux', 'macOS', 'Windows']} selected={platformTab} onSelect={setPlatformTab} className="w-full" />
      <Field label="Name"><Input value={() => runnerName()} onInput={setRunnerName} /></Field>
      <Field label="Address"><AffixField prefix="ssh://" value="10.0.4.17" suffix=":22" /></Field>
      <View className="flex-col gap-[6px]">
        <Label text="Registration token" />
        <View className="flex-row items-center">
          <Input type="password" value={() => token()} onInput={setToken} className="grow pr-9" />
          <View className="absolute right-3"><RoleIcon name="eye" role="mutedForeground" /></View>
        </View>
        <Muted text="Shown once. Store it with the runner." small={true} />
      </View>
      <Button label="Add runner" className="w-full" />
    </CardContent>
  </Card>;
}

const [onFail, setOnFail] = createSignal(true);
const [onRecover, setOnRecover] = createSignal(false);
const [onNightly, setOnNightly] = createSignal(true);

/** A setting: its name and what it means on the left, the switch on the right. */
function SwitchRow(props: { title: string; hint: string; checked: () => boolean; onChange: (v: boolean) => void }): i32 {
  return <View className="flex-row items-center gap-4">
    <View className="flex-col gap-0.5 grow">
      <Text className={`text-[13px] text-${theme().foreground}`}>{props.title}</Text>
      <Muted text={props.hint} small={true} />
    </View>
    <Switch checked={props.checked} onChange={props.onChange} accessibilityLabel={props.title} />
  </View>;
}

export function NotifyCard(): i32 {
  return <Card>
    <CardHeader title="Email me when" />
    <CardContent className="gap-4">
      <SwitchRow title="A build fails" hint="Only for branches you pushed to" checked={onFail} onChange={setOnFail} />
      <SwitchRow title="A build recovers" hint="After at least one failure" checked={onRecover} onChange={setOnRecover} />
      <SwitchRow title="The nightly report is ready" hint="Every weekday at 07:00" checked={onNightly} onChange={setOnNightly} />
    </CardContent>
  </Card>;
}

export function CacheCard(): i32 {
  return <Card>
    <CardContent className="gap-4">
      <View className="flex-row items-center gap-3">
        <RoleIcon name="database" />
        <Text className={`grow text-[15px] font-medium text-${theme().foreground}`}>Build cache</Text>
        <Button label="Clear" variant="ghost" size="sm" />
      </View>
      <View className="flex-col gap-2">
        <View className="flex-row items-center">
          <Label text="Used" className="grow" />
          <Muted text="68.4 / 100 GB" className="tabular-nums" />
        </View>
        <Progress value={() => 68.4} />
      </View>
    </CardContent>
  </Card>;
}
