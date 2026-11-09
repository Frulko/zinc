// A component whose items come from props.options.map((o, i) => <Pick ... />), built from the captured props (ZN-798, ZN-757's relay):
// the IR verifier passed it ("const of a non-scalar type" before)
import { render } from 'zinc:ui/solid';
function Pick(props: { on: boolean; label: string; value: string; onPick: (v: string) => void }): i32 {
  console.log(props.label + (props.on ? ' *' : ''));
  return <Button onClick={() => props.onPick(props.value)}><Text>{props.label}</Text></Button>;
}
function Choice(props: { value: string; options: string[]; names: string[]; onPick: (v: string) => void }): i32 {
  return <View className="flex-row gap-1">
    {props.options.map((o: string, i: number) => <Pick on={props.value === o} label={props.names[i]} value={o} onPick={props.onPick} />)}
  </View>;
}
const OPTIONS: string[] = ['relay', 'hold', 'follow'];
const NAMES: string[] = ['Relay', 'Hold', 'Follow'];
function App(): i32 { return <View><Choice value="hold" options={OPTIONS} names={NAMES} onPick={(v: string) => console.log(v)} /></View>; }
render(App, 0xffffff, null);
