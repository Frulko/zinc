/** @jsxHelpers ./helpers */
// A call that gives a node, used as a child (ZN-689): a component of the file (`{Part()}`), an arrow helper that returns JSX (`{row('a')}`)
// and a component in a fragment are mounted; a number and String(x) stay text. Also mounted: a render prop (`{props.render(x)}`), a
// variable that holds an element (`{body}`, the second of its declarators), a node call in a conditional (`?:` and `&&`), and the
// children a component is given written as React does (`{p.children}`).
import { dump } from './helpers';

function Part(): i32 { return <View className="p-2"><Text>part</Text></View>; }
const row = (label: string): i32 => <View className="flex-row"><Text>{label}</Text></View>;
function count(): number { return 3; }
const props = { render: (s: string): i32 => <Text>{s}</Text> };
function Card(p: { children: () => i32 }): i32 { return <View className="p-4">{p.children}</View>; }
const flag = true, body = flag ? props.render('held') : <View />;

const root = <View className="flex-col">
  {Part()}
  {row('a')}
  <>{Part()}</>
  {count()}
  {String(7)}
  {props.render('prop')}
  {body}
  {flag ? row('b') : null}
  {flag && row('c')}
  <Card><Text>inside</Text></Card>
</View>;
dump(root);
