// ZN-904: an effect's cleanup (the function it returns) runs before the effect runs again for new deps, and when its component goes;
// an effect that returns nothing, annotated `(): void` or not, still works.
import { render, useState, useEffect } from 'zinc:ui/react';

let setN: (v: i32) => void = (v: i32): void => {};
let setShown: (v: boolean) => void = (v: boolean): void => {};

function Ticker(p: { n: i32 }) {
  useEffect(() => {
    console.log('start', p.n);
    return () => console.log('stop', p.n);
  }, [p.n]);
  useEffect((): void => { console.log('plain', p.n); }, []);
  return <Text>{`${p.n}`}</Text>;
}

function App() {
  const [n, sn] = useState<i32>(1);
  const [shown, ss] = useState<boolean>(true);
  setN = sn; setShown = ss;
  return <View>{shown ? <Ticker n={n} /> : <Text>gone</Text>}</View>;
}

render(App, 0, null);
let ticks = 0;
setInterval(() => {
  ticks++;
  if (ticks === 2) setN(2);
  if (ticks === 4) setShown(false);
}, 30);
