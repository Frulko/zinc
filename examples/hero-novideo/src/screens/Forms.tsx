// Forms: every kind of input on one screen. Each field asks the on-screen keyboard for its own layout (text, email,
// tel, url, numeric PIN, decimal, search); a multiline area, a switch, a slider and tabs complete the form.
import { createSignal } from 'zinc:ui/solid';
import { theme, Card, CardHeader, CardContent, Button, Switch, Slider, Tabs, Badge, heading, mutedText } from 'zinc:ui/kit';
import { toast } from '../app/overlays';

const [name, setName] = createSignal<string>('');
const [email, setEmail] = createSignal<string>('');
const [phone, setPhone] = createSignal<string>('');
const [site, setSite] = createSignal<string>('');
const [pin, setPin] = createSignal<string>('');
const [amount, setAmount] = createSignal<string>('');
const [query, setQuery] = createSignal<string>('');
const [notes, setNotes] = createSignal<string>('');
const [news, setNews] = createSignal<boolean>(true);
const [volume, setVolume] = createSignal<number>(40);
const [plan, setPlan] = createSignal<i32>(0);
const PLANS: string[] = ['Free', 'Pro', 'Team'];

const fieldClass = (): string => `h-11 w-full rounded-lg bg-${theme().card} border-${theme().border} text-${theme().foreground} focus:border-${theme().accent}`;

function Field(props: { label: string; hint: string; children: () => i32 }): i32 {
  return <View class="flex-col gap-1 grow w-[240]">
    <View class="flex-row items-center justify-between">
      <Text class={`text-xs font-semibold text-${theme().foreground}`}>{props.label}</Text>
      <Text class={`text-xs text-${theme().mutedForeground}`}>{props.hint}</Text>
    </View>
    {props.children()}
  </View>;
}

function clear(): void {
  setName(''); setEmail(''); setPhone(''); setSite(''); setPin(''); setAmount(''); setQuery(''); setNotes('');
  setNews(true); setVolume(40); setPlan(0);
}

function submit(): void {
  toast('Form submitted', `${name() === '' ? 'Anonymous' : name()} · ${PLANS[plan()]} · ${email() === '' ? 'no email' : email()}`, 'success');
}

export function Forms(): i32 {
  return <ScrollView class="grow">
    <View class="flex-col gap-4 p-4 lg:p-8">
      <View class="flex-col gap-1">
        <Text class={heading(2)}>Forms</Text>
        <Text class={mutedText()}>Tap a field: the on-screen keyboard opens with the layout it asks for.</Text>
      </View>
      <Card>
        <CardHeader title="Contact" description="Text layouts">
          <View class="flex-row"><Badge label="inputMode" variant="outline" /></View>
        </CardHeader>
        <CardContent>
          <View class="flex-row flex-wrap gap-4">
            <Field label="Name" hint="text"><Input class={fieldClass()} placeholder="Ada Lovelace" value={name()} onInput={(v: string) => setName(v)} /></Field>
            <Field label="Email" hint="email"><Input class={fieldClass()} inputMode="email" placeholder="ada@example.org" value={email()} onInput={(v: string) => setEmail(v)} /></Field>
            <Field label="Phone" hint="tel"><Input class={fieldClass()} inputMode="tel" placeholder="+33 6 12 34 56 78" value={phone()} onInput={(v: string) => setPhone(v)} /></Field>
            <Field label="Website" hint="url"><Input class={fieldClass()} inputMode="url" placeholder="https://" value={site()} onInput={(v: string) => setSite(v)} /></Field>
          </View>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Numbers and search" description="Digit pads" />
        <CardContent>
          <View class="flex-row flex-wrap gap-4">
            <Field label="PIN" hint="numeric, hidden"><Input class={fieldClass()} inputMode="numeric" password placeholder="••••" value={pin()} onInput={(v: string) => setPin(v)} /></Field>
            <Field label="Amount" hint="decimal"><Input class={fieldClass()} inputMode="decimal" placeholder="0.00" value={amount()} onInput={(v: string) => setAmount(v)} /></Field>
            <Field label="Search" hint="search"><Input class={fieldClass()} inputMode="search" placeholder="Find…" value={query()} onInput={(v: string) => setQuery(v)} /></Field>
          </View>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Choices" description="Controls that need no keyboard" />
        <CardContent>
          <Tabs items={PLANS} selected={plan} onSelect={(i: i32) => setPlan(i)} />
          <Switch checked={news} onChange={(on: boolean) => setNews(on)} label="Send me the newsletter" />
          <View class="flex-row items-center gap-3">
            <Text class={`text-sm text-${theme().foreground}`}>Volume</Text>
            <Slider class="grow" value={volume} onChange={(v: number) => setVolume(v)} />
            <Text class={`text-sm font-semibold w-[36] text-${theme().foreground}`}>{`${Math.round(volume())}`}</Text>
          </View>
          <Field label="Notes" hint="multiline: Enter is a new line">
            <TextArea class={`w-full rounded-lg bg-${theme().card} border-${theme().border} text-${theme().foreground} focus:border-${theme().accent}`} rows={3}
              value={notes()} onInput={(v: string) => setNotes(v)} />
          </Field>
        </CardContent>
      </Card>
      <View class="flex-row gap-2">
        <Button label="Submit" onClick={() => submit()} />
        <Button label="Clear" variant="outline" onClick={() => clear()} />
      </View>
    </View>
  </ScrollView>;
}
