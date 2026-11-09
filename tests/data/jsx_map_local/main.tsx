import { render } from 'zinc:ui/solid';
function App(): i32 {
  const captured = <Text>Captured</Text>;
  const row = <Text>Outer</Text>;
  return <View className="flex-col p-4">
    {['Save', 'Export'].map((label: string) => {
      const row = <Button className="h-9 bg-zinc-200"><Text>{label}</Text></Button>;
      return row;
    })}
    {['Direct'].map((label: string) => <Text>{label}</Text>)}
    {[0].map((n: i32) => { return captured; })}
    {[1, 2].map((n: i32) => { const row = n + 10; return row; })}
    {[3, 4].map((row: i32) => { return row; })}
    {[5, 6].map((n: i32) => { const make = () => { return <Text>Unused</Text>; }; return n; })}
    {[9, 10].map((row: i32) => row)}
    {[7, 8]}
    {row}
  </View>;
}
render(App, 0xffffff, null);
