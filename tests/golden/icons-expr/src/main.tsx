// Icon names written inside expressions are compiled in, and <VirtualList aria-label> is accepted.
import { Icon, iconNames } from 'zinc:icons';
import { render } from 'zinc:ui/solid';

const on = true;
function App(): i32 {
  return <View style={{ flexDirection: 'row', gap: 12, padding: 12 }}>
    <Icon name={on ? 'heart' : 'star'} size={32} color={() => 0xff5a36} />
    <VirtualList count={3} itemHeight={20} aria-label="Rows" role="list" className="h-[60px] w-[100px]">{(i: number) => <Text>row</Text>}</VirtualList>
  </View>;
}
let frames = 0;
render(App, 0xffffff, (dt: number) => {
  if (++frames !== 2) return;
  console.log('compiled icons: ' + iconNames().join(', '));
});
