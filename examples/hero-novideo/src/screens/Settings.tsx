// Settings: dark mode and accent colour (the whole app re-themes), motion speed (slow motion for every
// transition) and reduce motion, the profile name (used by the sidebar and the greeting), and a reset that asks
// for confirmation in a modal.
import { theme, Card, CardHeader, CardContent, Switch, Slider, Button, heading, mutedText } from 'zinc:ui/kit';
import { entrances, SETTINGS, replayIntro } from '../app/router';
import { ACCENTS, keyboardOn, setKeyboardOn, autoScroll, setAutoScroll, name, setName, dark, setDark, accent, setAccent, speed, setSpeed, reduceMotion, setReduceMotion, resetPrefs } from '../app/prefs';
import { seedTasks } from '../app/tasks';
import { resetBalls } from '../app/physics';
import { ARTWORKS, Artwork } from '../app/art';
import { toast, openDialog, Dialog } from '../app/overlays';

const enter = entrances[SETTINGS];

function Section(props: { delay: number; children: () => i32 }): i32 {
  return <View class="flex-col" style={{ opacity: enter.at(props.delay), translateY: (1 - enter.at(props.delay)) * 16 }}>
    {props.children()}
  </View>;
}

function Row(props: { title: string; hint: string; children: () => i32 }): i32 {
  return <View class="flex-row items-center gap-4 py-2">
    <View class="flex-col grow gap-0.5">
      <Text class={`text-sm font-semibold text-${theme().foreground}`}>{props.title}</Text>
      <Text class={`text-xs text-${theme().mutedForeground}`}>{props.hint}</Text>
    </View>
    {props.children()}
  </View>;
}

function Swatch(props: { hue: string }): i32 {
  const on = (): boolean => accent() === props.hue;
  return <View class={`w-8 h-8 rounded-full items-center justify-center cursor-pointer border-2 ${on() ? `border-${theme().foreground}` : `border-${theme().card}`}`}
    onClick={() => { setAccent(props.hue); toast(`Accent: ${props.hue}`, 'Kit components, charts and the nav follow.'); }}>
    <View class={`w-6 h-6 rounded-full bg-${props.hue}-500`} />
  </View>;
}

function resetAll(): void {
  openDialog(new Dialog('Reset the demo?', 'Preferences, tasks, likes and the playground go back to their initial state. This cannot be undone.',
    'Reset everything', true, () => {
      resetPrefs();
      seedTasks();
      resetBalls();
      for (const a of ARTWORKS) a.setLiked(false);
      toast('Demo reset', 'Everything is back to the start.', 'success');
    }));
}

export function Settings(): i32 {
  return <ScrollView class="grow">
    <View class="flex-col gap-5 p-4 lg:p-8 w-full lg:w-[720px]">
      <Section delay={0}>
        <Text class={heading(2)}>Settings</Text>
        <Text class={mutedText()}>Every change applies at once, across the whole app.</Text>
      </Section>
      <Section delay={0.04}>
        <Card>
          <CardHeader title="Appearance" description="Theme and brand colour" />
          <CardContent>
            <Row title="Dark mode" hint="Also: press D anywhere">
              <Switch checked={dark} onChange={(on: boolean) => setDark(on)} />
            </Row>
            <Row title="Accent colour" hint="Buttons, badges, charts, the nav highlight">
              <View class="flex-row gap-1">{ACCENTS.map((h: string) => <Swatch hue={h} />)}</View>
            </Row>
          </CardContent>
        </Card>
      </Section>
      <Section delay={0.08}>
        <Card>
          <CardHeader title="Motion" description="Every animation runs on one clock" />
          <CardContent>
            <Row title={`Animation speed`} hint="Slow it down to watch the transitions frame by frame">
              <View class="flex-row items-center gap-3 w-[260]">
                <Slider class="grow" value={() => speed() * 100} min={25} max={200} step={5} onChange={(v: number) => setSpeed(v / 100)} />
                <Text class={`text-sm font-semibold w-[44] text-${theme().foreground}`}>{`${Math.round(speed() * 100)}%`}</Text>
              </View>
            </Row>
            <Row title="Reduce motion" hint="Transitions end at once (springs snap)">
              <Switch checked={reduceMotion} onChange={(on: boolean) => setReduceMotion(on)} />
            </Row>
            <Row title="Intro" hint="The title screen, from the start">
              <Button label="Replay intro" variant="outline" onClick={() => replayIntro()} />
            </Row>
          </CardContent>
        </Card>
      </Section>
      <Section delay={0.1}>
        <Card>
          <CardHeader title="Input" description="Touch screens" />
          <CardContent>
            <Row title="On-screen keyboard" hint="Slides in when a text field takes the focus">
              <Switch checked={keyboardOn} onChange={(on: boolean) => setKeyboardOn(on)} />
            </Row>
            <Row title="Keep the field in view" hint="Scrolls to what you type when the keyboard opens">
              <Switch checked={autoScroll} onChange={(on: boolean) => setAutoScroll(on)} />
            </Row>
          </CardContent>
        </Card>
      </Section>
      <Section delay={0.12}>
        <Card>
          <CardHeader title="Profile" description="Shown in the sidebar and on Home" />
          <CardContent>
            <Row title="Display name" hint="Initials are computed as you type">
              <Input class={`w-[260] h-9 rounded-lg bg-${theme().card} border-${theme().border} text-${theme().foreground} focus:border-${theme().accent}`}
                value={name()} placeholder="Your name" onInput={(v: string) => setName(v)} />
            </Row>
          </CardContent>
        </Card>
      </Section>
      <Section delay={0.16}>
        <Card>
          <CardHeader title="Danger zone" description="Start the demo over" />
          <CardContent>
            <Row title="Reset the demo" hint="Asks for confirmation first">
              <Button label="Reset…" variant="destructive" onClick={() => resetAll()} />
            </Row>
          </CardContent>
        </Card>
      </Section>
    </View>
  </ScrollView>;
}
