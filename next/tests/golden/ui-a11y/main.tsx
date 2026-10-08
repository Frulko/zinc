// Accessibility metadata (ZN-276): ui.inspect() dumps role, label and hidden state of a form; setRootFontSize scales rem lengths, spacing and text.
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/react';
import { quit } from 'zinc:gfx';
function Form(): i32 {
  return <View role="form" aria-label="Sign in" class="flex-col gap-2 p-2 w-full">
    <Text class="text-lg">Welcome back</Text>
    <Input aria-label="Email" placeholder="you@example.com" value="a@b.c" class="h-8 border" />
    <Button role="button" aria-label="Submit" class="h-8 bg-indigo-600" onClick={() => {}}><Text>Go</Text></Button>
    <View aria-hidden class="h-4"><Text>decor</Text></View>
    <Text class="sr-only">Required fields are marked</Text>
    <Button disabled class="h-8"><Text>Cancel</Text></Button>
  </View>;
}
function formPad(): number {
  for (let h = 0; h < 64; h++) { const n = ui.inspectNode(h); if (n !== null && n.role === 'form') return n.pl; }
  return -1;
}
let f = 0;
render(Form, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { console.log(ui.inspect()); console.log('padding p-2 at 16:', formPad()); ui.setRootFontSize(20); }
  if (f === 4) { console.log('padding p-2 at 20:', formPad()); ui.setRootFontSize(16); }
  if (f === 6) { console.log('padding p-2 back at 16:', formPad()); quit(); }
});
