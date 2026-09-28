// Visual regression for zinc:ui: kit components, text, a transition, and scripted input (hover, then a click).
// zinc-test: frames 1,40
import { createSignal, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Card, CardHeader, CardContent, CardFooter, Button, Badge, Switch, Progress } from 'zinc:ui/kit';

const [on, setOn] = createSignal<boolean>(false);
const [level, setLevel] = createSignal<number>(30);

function App(): i32 {
  return <View class="flex-col p-3 gap-2">
    <Card>
      <CardHeader title="Deterministic" description="The same pixels on every run" />
      <CardContent>
        <Switch checked={on} onChange={setOn} label="Enabled" />
        <Progress value={level} />
        <Badge label="Live" variant="success" />
      </CardContent>
      <CardFooter>
        <Button label="Fill" onClick={() => setLevel(90)} />
        <Button label="Cancel" variant="outline" size="sm" />
      </CardFooter>
    </Card>
  </View>;
}

let frame = 0;
render(App, 0xf1f5f9, (dt: number) => {
  frame++;
  if (frame === 10) { const b = ui.screenBox(ui.find('Cancel')); ui.pointerAt(b[0] + 4, b[1] + 4, false); }  // hover
  if (frame === 20) { ui.click(ui.find('Fill')); setOn(true); }
});
