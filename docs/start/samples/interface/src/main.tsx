import { createSignal, render } from 'zinc:ui/solid';
import { width, height } from 'zinc:gfx';

const COLORS = ['bg-[#f27aa6]', 'bg-[#5ec2f2]', 'bg-[#e8b06a]', 'bg-[#7bd389]'];
const NAMES = ['pink', 'blue', 'gold', 'green'];
const R = 30;                 // the radius of the ball
const [x, setX] = createSignal<number>(100);   // the centre of the ball
const [y, setY] = createSignal<number>(80);
const [color, setColor] = createSignal<i32>(0);
const [score, setScore] = createSignal<i32>(0);
let vx = 150, vy = 110;       // its speed, in pixels per second

function move(dt: number): void {
  setX(x() + vx * dt);
  setY(y() + vy * dt);
  if (x() < R || x() > width() - R) vx = -vx;
  if (y() < R || y() > height() - R) vy = -vy;
}

function hit(): void {
  setColor((color() + 1) % COLORS.length);
  setScore(score() + 1);
  console.log(`hit: score ${score()}, the ball is ${NAMES[color()]}`);
}

function App(): i32 {
  return <View className="w-full h-full">
    <View className={`absolute w-[60px] h-[60px] rounded-full ${COLORS[color()]}`}
      style={{ left: x() - R, top: y() - R }} onClick={hit} />
    <Text className="absolute text-xl text-white" style={{ left: 16, top: 12 }}>{`Score: ${score()}`}</Text>
  </View>;
}

render(App, 0x1c1b20, move);
