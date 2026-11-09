// The gallery's right column: people with a role menu, a link to copy, a coverage ring with a threshold, toggle chips (CUI's components screen).
import { createSignal } from 'zinc:ui/solid';
import { Card, CardHeader, CardContent, Button, Avatar, DropdownMenu, MenuItem, Input, Tabs, ProgressRing, Slider, theme, themeColor } from 'zinc:ui/kit';
import { Label, Body, Muted, RoleIcon, Chip } from './parts';

const ROLES: MenuItem[] = [{ label: 'Required' }, { label: 'Optional' }];

function Reviewer(props: { name: string; email: string; role: string }): i32 {
  return <View className="flex-row items-center gap-3">
    <Avatar name={props.name} />
    <View className="flex-col grow">
      <Label text={props.name} className="text-[14px]" />
      <Muted text={props.email} />
    </View>
    <DropdownMenu label={props.role} items={ROLES} variant="outline" />
  </View>;
}

export function ReviewersCard(): i32 {
  return <Card>
    <CardContent className="gap-4">
      <View className="flex-row items-center">
        <Text className={`grow text-[15px] font-medium text-${theme().foreground}`}>Reviewers</Text>
        <Button label="Add" variant="secondary" size="sm"><RoleIcon name="user-plus" size={14} /></Button>
      </View>
      <Reviewer name="Jonas Berg" email="jonas@northlight.io" role="Required" />
      <Reviewer name="Priya Nair" email="priya@harbor.dev" role="Required" />
      <Reviewer name="Tomas Rivera" email="tomas@kiln.app" role="Optional" />
    </CardContent>
  </Card>;
}

const [link, setLink] = createSignal('https://kiln.app/r/2.4.0-rc.2');
const [audience, setAudience] = createSignal<i32>(1);

export function ReleaseCard(): i32 {
  return <Card>
    <CardHeader title="Release candidate" description="Builds for all three platforms, signed." />
    <CardContent className="gap-4">
      <View className="flex-row items-center gap-3">
        <Input value={() => link()} onInput={setLink} className="grow" />
        <Button variant="ghost" size="icon"><RoleIcon name="copy" /></Button>
      </View>
      <Tabs items={['Public', 'Team only']} selected={audience} onSelect={setAudience} className="w-full" />
    </CardContent>
  </Card>;
}

const [threshold, setThreshold] = createSignal<number>(80);

export function CoverageCard(): i32 {
  return <Card>
    <CardContent className="gap-5">
      <View className="flex-row items-center gap-6">
        <View className="w-[84px] h-[84px] items-center justify-center">
          <ProgressRing value={() => 76} size={84} strokeWidth={1.7} color={() => themeColor('primary')} track={() => themeColor('secondary')} />
          <View className="absolute inset-0 items-center justify-center"><Text className={`text-[20px] font-medium tabular-nums text-${theme().foreground}`}>76%</Text></View>
        </View>
        <View className="flex-col gap-1 grow">
          <Label text="Line coverage" className="text-[15px]" />
          <Muted text="76.3% on main, 3,912 of 5,127 lines." />
        </View>
      </View>
      <View className="flex-col gap-2">
        <View className="flex-row items-center">
          <Label text="Fail below" className="grow" />
          <Muted text={`${Math.round(threshold())}%`} className="tabular-nums" />
        </View>
        <Slider value={threshold} onChange={setThreshold} min={50} max={100} />
      </View>
    </CardContent>
  </Card>;
}

const TARGETS: string[] = ['x86-64', 'ARM64', 'Debug', 'Release', 'ASan', 'MinGW'];
const [chosen, setChosen] = createSignal<string[]>(['x86-64', 'Debug', 'Release']);
function toggle(name: string): void {
  const now = chosen();
  setChosen(now.indexOf(name) >= 0 ? now.filter((n: string) => n !== name) : now.concat([name]));
}

export function MatrixCard(): i32 {
  return <Card>
    <CardHeader title="Build matrix" />
    <CardContent>
      <View className="flex-row flex-wrap gap-2">
        {TARGETS.map((name: string) => <Chip label={name} on={() => chosen().indexOf(name) >= 0} onToggle={() => toggle(name)} />)}
      </View>
    </CardContent>
  </Card>;
}
