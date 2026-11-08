// ZN-1025: JSX gaps, one case per line of App; the frame draws the texts of expected.out (tests/t0/jsx_gaps.sh runs it in the React and the Solid model).
import { render } from 'zinc:ui/react';
import { importedRow } from './rows';

function Bar(p: { label?: string; n?: i32 }): i32 { return <Text>{'bar ' + (p.label ?? '-')}</Text>; }
function Labeled(p: { id: string }): i32 { return <Text>{'lab ' + p.id}</Text>; }
function Many(p: { children?: () => i32 }): i32 { return <View>{p.children !== undefined ? p.children() : null}</View>; }
function Card(p: { children?: () => i32 }): i32 { return <View>{p.children?.()}</View>; }
function Opt(p: { inner?: { children?: () => i32 } }): i32 { return <View>{p.inner?.children !== undefined ? p.inner.children() : <Text>no inner</Text>}</View>; }
const items = ['a', 'b'];
const row = (s: string) => <Text key={s}>{'r' + s}</Text>;
const name: string | undefined = 'zed';
function App(): i32 {
  const on = items.length > 1;
  return <View>
    <Bar />
    {items.map(row)}
    {items.map(importedRow)}
    <Labeled id="x" aria-label="hello" data-test="t1" />
    <View aria-label="host" data-id="h1"><Text>host</Text></View>
    {on ? items.map((s: string) => <Text key={s}>{'c' + s}</Text>) : <View />}
    {name === undefined ? <Text>none</Text> : <Text>{name.toUpperCase()}</Text>}
    <Many><Text>m1</Text><Text>m2</Text></Many>
    <Card><Text>k1</Text><Text>k2</Text></Card>
    <Opt />
    <Opt inner={{ children: () => <Text>inner</Text> }} />
  </View>;
}
render(App, 0xffffff, (dt: number) => {});
