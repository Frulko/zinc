// zinc:icons (ZN-374): three icons named in the source are compiled in (and only those), they draw through zinc:svg, and colour and stroke width apply.
import { Icon, iconNames, icon } from 'zinc:icons';
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <view style={{ flexDirection: 'row', gap: 12, padding: 12 }}>
    <Icon name="heart" size={48} color={() => 0xff5a36} />
    <Icon name="settings" size={48} color={() => 0x1c1917} strokeWidth={1.5} />
    <Icon name="search" size={48} color={() => 0x0f766e} strokeWidth={3} />
  </view>;
}
let frames = 0;
render(App, 0xffffff, (dt: number) => {
  if (++frames !== 2) return;
  console.log('compiled icons: ' + iconNames().join(', '));
  const h = icon('heart', 0xff5a36, 2);
  console.log('heart parses: ' + (h !== null && h.ok) + ', items ' + (h !== null ? h.items() : 0));
  console.log('unknown icon: ' + (icon('not-an-icon') === null));
});
