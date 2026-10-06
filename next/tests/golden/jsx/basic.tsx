/** @jsxHelpers ./helpers */
import { dump } from './helpers';

function Badge(props: { label: string; children: () => i32 }): i32 {
  return <View class="badge"><Text>{props.label}</Text>{props.children()}</View>;
}

const items: string[] = ['a', 'b'];
const on = true;
const root = <View class="flex-col p-3" gap={8} onClick={() => console.log('clicked')}>
  <Text>Hello {items.length} items</Text>
  <Badge label="x"><Text>child</Text></Badge>
  {on && <Text>shown</Text>}
  {on ? <Text>yes</Text> : <Text>no</Text>}
  {items.map(s => <Text>{s}</Text>)}
  <>
    <Text>frag</Text>
  </>
</View>;
dump(root);
