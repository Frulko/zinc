// A program written before 2026-10-16: <view class="x"> in this comment stays as it is.
import { render } from 'zinc:ui/solid';
/* block comment: <text class="y"> stays too */
type CardProps = { className?: string; title: string };
function Card(props: CardProps): i32 {
  const { className: extra } = props;
  const label = '<view class="in a string">';
  return <View className={'rounded ' + (props.className ?? '') + extra + label}>
    <Text className="font-bold">{props.title} uses class and view in its text</Text>
  </View>;
}
function less(a: number, b: number): boolean { return a < b && b > a; }
function App(): i32 {
  const n = 3;
  const items: Array<number> = [1, 2];
  return <ScrollView className="grow">
    {items.map((i) => <Button className="m-1" onTap={() => less(i, n)}>{`${i}`}</Button>)}
    <Card className={n < 4 ? 'p-2' : 'p-4'} title="hi" />
    <Image className="w-8" />
    <frobnicate />
  </ScrollView>;
}
render(App, 0xffffff, null);
