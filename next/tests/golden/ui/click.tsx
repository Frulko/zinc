// A zinc:ui screen driven by real pointer events (ZINC_INPUT script), not by ui.click: hover the Fill button, press and release it.
import { createSignal, render } from 'zinc:ui/solid';
import { Card, CardHeader, CardContent, CardFooter, Button, Badge, Switch, Progress } from 'zinc:ui/kit';

const [on, setOn] = createSignal<boolean>(false);
const [level, setLevel] = createSignal<number>(30);

function App(): i32 {
  return <View class="flex-col p-3 gap-2">
    <Card>
      <CardHeader title="Pointer input" description="Events come from the HAL" />
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

render(App, 0xf1f5f9, (dt: number) => {});
