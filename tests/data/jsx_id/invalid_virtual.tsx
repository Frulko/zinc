import { render } from 'zinc:ui/solid';
const App = (): i32 => <VirtualList count={1} itemHeight={20} stillUnknown="bad">{(i: i32) => <Text>{i}</Text>}</VirtualList>;
render(App, 0xffffff, null);
