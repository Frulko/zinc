// keyboard: the on-screen keyboard of zinc:ui/kit on a touch-style form. Tap a field: the keyboard slides in with
// the layout the field asks for (digits for inputMode="numeric", @ for email...); long-press a letter for accents,
// the FR / DE key cycles the languages, ⌄ closes it. ZINC_DEMO=<step> scripts a state for screenshots.
import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { env } from 'zinc:sys';
import { Keyboard, Card, CardHeader, CardContent, Tabs, Badge, heading, mutedText, theme } from 'zinc:ui/kit';

const LANGS: string[][] = [['fr', 'en', 'de'], ['en', 'es', 'it', 'pt'], ['ru', 'el', 'sv']];
const [langSet, setLangSet] = createSignal<i32>(0);
const [style, setStyle] = createSignal<i32>(0);
const [name, setName] = createSignal<string>('');
const [email, setEmail] = createSignal<string>('');
const [pin, setPin] = createSignal<string>('');
const [note, setNote] = createSignal<string>('');
const [last, setLast] = createSignal<string>('—');
const nameRef = createNodeRef(), pinRef = createNodeRef();

/** Two looks: the theme's default keys, or a custom dark "kiosk" style through the class props. */
function customKeys(): string { return style() === 1 ? 'bg-slate-700 text-white active:bg-slate-600' : `bg-${theme().card} text-${theme().foreground} active:bg-${theme().secondaryPressed}`; }

function Field(props: { label: string; children: () => i32 }): i32 {
  return <View class="flex-col gap-1 grow">
    <Text class={`text-xs font-semibold text-${theme().mutedForeground}`}>{props.label}</Text>
    {props.children()}
  </View>;
}
const fieldClass = (): string => `h-10 rounded-lg bg-${theme().card} border-${theme().border} text-${theme().foreground} focus:border-${theme().accent}`;

function App(): i32 {
  return <View class={`flex-col h-full bg-${theme().background}`}>
    <ScrollView class="grow">
      <View class="flex-col gap-4 p-6">
        <View class="flex-row items-end justify-between">
          <View class="flex-col gap-1">
            <Text class={heading(3)}>On-screen keyboard</Text>
            <Text class={mutedText()}>Tap a field. Long-press a letter for accents; the language key cycles layouts.</Text>
          </View>
          <Badge label={`last key: ${last()}`} variant="outline" />
        </View>
        <Card>
          <CardContent>
            <View class="flex-row gap-3">
              <Field label="Name"><Input ref={nameRef} class={fieldClass()} placeholder="Zoë Dupré" value={name()} onInput={(v: string) => setName(v)} /></Field>
              <Field label="Email"><Input class={fieldClass()} inputMode="email" placeholder="zoe@exemple.fr" value={email()} onInput={(v: string) => setEmail(v)} /></Field>
              <Field label="PIN"><Input ref={pinRef} class={fieldClass()} inputMode="numeric" password placeholder="••••" value={pin()} onInput={(v: string) => setPin(v)} /></Field>
            </View>
            <Field label="Notes (multiline: Enter is a new line)">
              <TextArea class={`rounded-lg bg-${theme().card} border-${theme().border} text-${theme().foreground} focus:border-${theme().accent}`} rows={3} value={note()} onInput={(v: string) => setNote(v)} />
            </Field>
          </CardContent>
        </Card>
        <View class="flex-row gap-3 items-center">
          <Text class={mutedText()}>Languages</Text>
          <Tabs items={['FR EN DE', 'EN ES IT PT', 'RU EL SV']} selected={langSet} onSelect={(i: i32) => setLangSet(i)} />
          <Text class={mutedText()}>Style</Text>
          <Tabs items={['Theme', 'Kiosk']} selected={style} onSelect={(i: i32) => setStyle(i)} />
        </View>
      </View>
    </ScrollView>
    {[langSet()].map((i: i32) => <Keyboard layouts={LANGS[i]} keyClass={customKeys()}
      class={style() === 1 ? 'bg-slate-900 border-slate-800' : ''}
      onKey={(k: string) => setLast(k === ' ' ? 'space' : k)} />)}
  </View>;
}

// ---- ZINC_DEMO: focus the name field and type through the keyboard (screenshots / checks)
const demo = env('ZINC_DEMO');
let frame = 0;
render(App, 0xfafafa, (dt: number) => {
  frame++;
  if (demo === '' || frame !== 3) return;
  ui.pointerAt(0, 0, false);
  ui.focusNode(demo === 'numeric' ? pinRef.node : nameRef.node);
});
