// zinc:ui/kit in the Solid model: a card of kit components, a tab click, then the layout tree.
// kit_react.tsx builds the same screen with the React engine and must print the same bytes.
import { createSignal, render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
import { Card, CardHeader, CardContent, CardFooter, Button, Badge, Switch, Progress, Tabs, Stat, List, ListItem, Alert,
  Avatar, Kbd, Separator, Slider } from 'zinc:ui/kit';

const [tab, setTab] = createSignal<i32>(0);
const [wifi, setWifi] = createSignal<boolean>(true);
const [level, setLevel] = createSignal<number>(40);

function App(): i32 {
  return <View class="flex-col p-2 gap-2">
    <Card>
      <CardHeader title="Device" description="Kit conformance" />
      <CardContent>
        <Tabs items={['Status', 'Network']} selected={tab} onSelect={setTab} />
        {tab() === 0 ? <Stat label="Level" value={() => `${level()}`} unit="%" /> : <Switch checked={wifi} onChange={setWifi} label="Wi-Fi" />}
        <Progress value={level} />
        <Slider value={level} onChange={setLevel} />
        <Separator />
        <List>
          <ListItem title="Ada" description="owner" leading={() => <Avatar name="Ada Lovelace" size="sm" />}><Badge label="Live" variant="success" /></ListItem>
        </List>
        <Alert title="Heads up" description="Two models, one kit." />
      </CardContent>
      <CardFooter>
        <Button label="Save" onClick={() => setLevel(80)} />
        <Button label="Cancel" variant="outline" size="sm" />
        <Kbd label="Esc" />
      </CardFooter>
    </Card>
  </View>;
}

/** The laid-out nodes with absolute positions, without fragments (their nesting differs between the models). */
function layout(): string {
  return ui.dump().split('\n').filter((l: string) => l.indexOf('fragment') < 0).map((l: string) => l.trim()).join('\n');
}

let frame = 0;
render(App, 0xffffff, (dt: number) => {
  frame++;
  if (frame === 2) { ui.click(ui.find('Network')); ui.click(ui.find('Save')); }
  if (frame === 4) { console.log(layout()); quit(); }
});
