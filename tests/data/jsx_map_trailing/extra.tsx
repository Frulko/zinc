import { render } from 'zinc:ui/solid';
function row(n: i32): i32 { return <Text>{n}</Text>; }
render(() => <View>{[0, 1].map(row, row,)}</View>, 0xffffff, null);
