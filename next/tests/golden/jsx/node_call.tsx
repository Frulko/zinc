/** @jsxHelpers ./helpers */
// A call that gives a node, used as a child (ZN-689): a component of the file (`{Part()}`), an arrow helper that returns JSX (`{row('a')}`)
// and a component in a fragment are mounted; a number and String(x) stay text.
import { dump } from './helpers';

function Part(): i32 { return <View class="p-2"><Text>part</Text></View>; }
const row = (label: string): i32 => <View class="flex-row"><Text>{label}</Text></View>;
function count(): number { return 3; }

const root = <View class="flex-col">
  {Part()}
  {row('a')}
  <>{Part()}</>
  {count()}
  {String(7)}
</View>;
dump(root);
