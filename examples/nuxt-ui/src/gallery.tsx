// The gallery of zinc:ui/nuxt (ZN-357.02): every component with its variants, sizes and colours, in the light or the dark scheme.
import { createSignal, For } from 'zinc:ui/solid';
import { Overlays } from './overlays';
import { theme, hex, Button, Badge, Avatar, Card, Input, Textarea, Select, Checkbox, Switch, RadioGroup } from 'zinc:ui/nuxt';

const VARIANTS = ['solid', 'outline', 'soft', 'subtle', 'ghost', 'link'];
const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'];
const COLORS = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'];

export const [email, setEmail] = createSignal<string>('');
export const [bio, setBio] = createSignal<string>('Builds UIs in Zinc.');
export const [plan, setPlan] = createSignal<string>('Team');
export const [planOpen, setPlanOpen] = createSignal<boolean>(false);
export const [terms, setTerms] = createSignal<boolean>(true);
export const [news, setNews] = createSignal<boolean>(false);
export const [notify, setNotify] = createSignal<boolean>(true);
export const [freq, setFreq] = createSignal<string>('Weekly');
export const [clicks, setClicks] = createSignal<number>(0);

/** Children of a section (the JSX lowering appends what a render* call returns). */
function renderSlot(c: (() => i32) | undefined): i32 { return c !== undefined ? c() : <View />; }
function Section(p: { title: string; children?: () => i32 }): i32 {
  return <View class="flex-col gap-3">
    <Text class={`text-sm font-semibold text-${hex(theme().textHighlighted)}`}>{p.title}</Text>
    {renderSlot(p.children)}
  </View>;
}

export function Gallery(): i32 {
  return <View class="flex-row gap-8 p-6 items-start">
    <View class="flex-col gap-6 w-[500px]">
      <Section title="Button · variants">
        <View class="flex-row gap-2 flex-wrap">
          <For each={VARIANTS}>{(v: string, i: i32) => <Button label={v} variant={v} onClick={() => setClicks(clicks() + 1)} />}</For>
        </View>
        <View class="flex-row gap-2 flex-wrap">
          <For each={VARIANTS}>{(v: string, i: i32) => <Button label={v} variant={v} color="neutral" />}</For>
        </View>
      </Section>
      <Section title="Button · sizes, icons, loading">
        <View class="flex-row gap-2 items-center flex-wrap">
          <For each={SIZES}>{(s: string, i: i32) => <Button label={s} size={s} icon="plus" />}</For>
        </View>
        <View class="flex-row gap-2 items-center">
          <Button label="Next" trailingIcon="arrow-right" color="neutral" variant="outline" />
          <Button label="Saving" loading={true} />
          <Button icon="heart" variant="soft" color="error" />
          <Button label="Disabled" disabled={true} />
        </View>
      </Section>
      <Section title="Badge">
        <View class="flex-row gap-2 items-center flex-wrap">
          <For each={COLORS}>{(c: string, i: i32) => <Badge label={c} color={c} />}</For>
        </View>
        <View class="flex-row gap-2 items-center flex-wrap">
          <For each={['solid', 'outline', 'soft', 'subtle']}>{(v: string, i: i32) => <Badge label={v} variant={v} />}</For>
          <For each={SIZES}>{(s: string, i: i32) => <Badge label={s} size={s} variant="subtle" color="neutral" />}</For>
        </View>
      </Section>
      <Section title="Avatar">
        <View class="flex-row gap-2 items-center">
          <For each={['3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']}>{(s: string, i: i32) => <Avatar alt="Ada Lovelace" size={s} />}</For>
          <Avatar icon="user" size="xl" color="primary" />
          <Avatar text="GH" size="xl" color="info" chip={true} />
        </View>
      </Section>
    </View>
    <View class="flex-col gap-6 w-[480px]">
      <Card title="Account" description="Inputs, a select and a textarea.">
        <Input modelValue={email} onUpdate={setEmail} placeholder="you@example.com" icon="mail" />
        <View class="flex-row gap-2">
          <For each={['outline', 'soft', 'subtle', 'ghost']}>{(v: string, i: i32) => <Input variant={v} placeholder={v} size="sm" />}</For>
        </View>
        <Select items={['Hobby', 'Team', 'Enterprise']} modelValue={plan} onUpdate={setPlan} open={planOpen} onOpen={setPlanOpen} />
        <Textarea modelValue={bio} onUpdate={setBio} rows={3} />
      </Card>
      <Card title="Preferences" variant="subtle">
        <Checkbox label="I accept the terms" description="You can change it later." modelValue={terms} onUpdate={setTerms} required={true} />
        <Checkbox label="Send me the newsletter" modelValue={news} onUpdate={setNews} variant="card" />
        <Switch label="Notifications" description="Email and push" modelValue={notify} onUpdate={setNotify} />
        <View class="flex-row gap-3"><For each={SIZES}>{(s: string, i: i32) => <Switch size={s} modelValue={notify} onUpdate={setNotify} />}</For></View>
        <RadioGroup legend="Digest" items={['Daily', 'Weekly', 'Never']} modelValue={freq} onUpdate={setFreq} orientation="horizontal" />
        <RadioGroup items={['Daily', 'Weekly']} modelValue={freq} onUpdate={setFreq} variant="card" color="neutral" />
      </Card>
      <Overlays />
      <Card variant="solid" title="Solid card" description="An inverted surface." />
    </View>
  </View>;
}
