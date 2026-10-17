// The fixture of tests/t1/web_dom.sh: what the semantic DOM of the web target (`--render dom`) has to get right in one page. A header with a nav and links, a main that scrolls,
// a Form with real inputs, a list, a Canvas, a dialog, a counter. Everything the test asserts is named here.
import { createSignal, For, Show, render } from 'zinc:ui/solid';
import { Form, Button, Dialog } from 'zinc:ui/kit';
import { rect, rrect } from 'zinc:gfx';

const [name, setName] = createSignal<string>('');
const [email, setEmail] = createSignal<string>('');
const [pw, setPw] = createSignal<string>('');
const [sent, setSent] = createSignal<string>('not sent');
const [open, setOpen] = createSignal<boolean>(false);
const [count, setCount] = createSignal<number>(0);
const [typed, setTyped] = createSignal<number>(0);
const [items, setItems] = createSignal<string[]>(['Alpha', 'Beta', 'Gamma']);
const FIELD = 'w-full bg-white text-slate-900 border-slate-300 rounded-md';

function App(): i32 {
  return <View className="flex-col w-full h-full bg-white">
    <View as="header" className="flex-row items-center gap-4 px-6 py-3 bg-slate-900">
      <Text as="h1" className="text-xl font-bold text-white">DOM fixture</Text>
      <View as="nav" aria-label="Main" className="flex-row gap-3">
        <Text as="a" href="#form" className="text-sm text-sky-300">Form</Text>
        <Text as="a" href="#list" className="text-sm text-sky-300">List</Text>
      </View>
    </View>
    <ScrollView as="main" className="grow" aria-label="Content">
      <View className="flex-col gap-6 p-6">
        <View as="section" aria-label="Sign in" className="flex-col gap-2">
          <Text as="h2" className="text-lg font-semibold text-slate-900">Sign in</Text>
          <Form name="login" className="w-80" onSubmit={() => setSent(`sent ${name()}|${email()}|${pw().length}`)}>
            <Input name="name" autoComplete="name" required placeholder="Name" aria-label="Name" className={FIELD} value={name()} onInput={(v: string) => { setName(v); setTyped(typed() + 1); }} />
            <Input name="email" type="email" autoComplete="email" required placeholder="Email" aria-label="Email" className={FIELD} value={email()} onInput={(v: string) => setEmail(v)} />
            <Input name="password" type="password" autoComplete="current-password" minLength={3} placeholder="Password" aria-label="Password" className={FIELD} value={pw()} onInput={(v: string) => setPw(v)} />
            <TextArea name="notes" rows={2} placeholder="Notes" aria-label="Notes" className={FIELD} />
            <Button label="Send" type="submit" />
          </Form>
          <Text className="text-sm text-slate-600">{sent()}</Text>
        </View>
        <View as="section" aria-label="Counter" className="flex-row items-center gap-3">
          <Button label="Add one" onClick={() => setCount(count() + 1)} />
          <Text className="text-slate-900">Count: {count()}</Text>
          <Button label="Open dialog" variant="outline" onClick={() => setOpen(true)} />
        </View>
        <View as="section" aria-label="List" className="flex-col gap-2">
          <Text as="h2" className="text-lg font-semibold text-slate-900">Items</Text>
          <View as="ul" className="flex-col gap-1">
            <For each={items()}>{(it: string) => <View as="li" className="px-3 py-2 rounded-md bg-slate-100"><Text className="text-slate-900">{it}</Text></View>}</For>
          </View>
          <Button label="Add item" variant="secondary" onClick={() => setItems([...items(), 'Item ' + (items().length + 1)])} />
        </View>
        <Canvas style={{ width: 160, height: 60 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => { rect(x, y, w, h, 0xe0f2fe); rrect(x + 10, y + 10, w - 20, h - 20, 8, 0x0284c7, 255); }} />
        <View className="flex-col gap-1">
          <For each={['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']}>{(w: string) => <View className="h-16 px-3 justify-center rounded-md bg-slate-50"><Text className="text-slate-900">{'Row ' + w}</Text></View>}</For>
        </View>
      </View>
    </ScrollView>
    <Dialog open={open} onOpenChange={(o: boolean) => setOpen(o)} title="A dialog" description="A modal layer: a real dialog element." footer={() => <Button label="Close" onClick={() => setOpen(false)} />}>
      <Text className="text-slate-900">Dialog body</Text>
    </Dialog>
  </View>;
}

render(App, 0xffffff, null);
