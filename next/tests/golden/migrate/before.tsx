// A program written before 2026-10-16: <view class="x"> in this comment stays as it is.
import { render } from 'zinc:ui/solid';
/* block comment: <text class="y"> stays too */
type CardProps = { class?: string; title: string };
function Card(props: CardProps): i32 {
  const { class: extra } = props;
  const label = '<view class="in a string">';
  return <view class={'rounded ' + (props.class ?? '') + extra + label}>
    <text class="font-bold">{props.title} uses class and view in its text</text>
  </view>;
}
function less(a: number, b: number): boolean { return a < b && b > a; }
function App(): i32 {
  const n = 3;
  const items: Array<number> = [1, 2];
  return <scroll class="grow">
    {items.map((i) => <button class="m-1" onTap={() => less(i, n)}>{`${i}`}</button>)}
    <Card class={n < 4 ? 'p-2' : 'p-4'} title="hi" />
    <img class="w-8" />
    <frobnicate />
  </scroll>;
}
render(App, 0xffffff, null);
