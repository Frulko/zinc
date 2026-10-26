/** @jsxHelpers ./helpers */
// .map over a conditional list whose callback returns a conditional of elements (`(c ? xs : ys).map((r) => c ? <A/> : <B/>)`, or the same
// in a block body): one row per item; it was lowered as text and drew the array of node handles ("201").
import { dump } from './helpers';

const xs: string[] = ['alpha', 'beta'];
const ys: string[] = ['gamma'];
function A(props: { row: string }): i32 { return <Text>{`A ${props.row}`}</Text>; }
function B(props: { row: string }): i32 { return <Text>{`B ${props.row}`}</Text>; }
function rows(on: boolean): i32 {
  return <View className="flex-col">
    {(on ? xs : ys).map((r: string) => on ? <A row={r} /> : <B row={r} />)}
    {ys.map((r: string) => { return on ? <A row={r} /> : <B row={r} />; })}
  </View>;
}
dump(rows(true));
dump(rows(false));
