/** @jsxHelpers ./helpers */
// A conditional nested in a conditional's branch (ZN-373.04): c1 ? <A/> : c2 ? <B/> : <C/> shows one element, through a fragment for the
// inner one; it was lowered as text before.
import { dump } from './helpers';

function pick(view: string): i32 {
  return <View class="flex-col">
    {view === 'a' ? <Text>a</Text> : view === 'b' ? <Text>b</Text> : view === 'c' ? <Text>c</Text> : <View class="p-2" />}
    {view === 'a' ? (view.length > 0 ? <Text>a1</Text> : <Text>a2</Text>) : null}
  </View>;
}
dump(pick('a'));
dump(pick('c'));
dump(pick('z'));
