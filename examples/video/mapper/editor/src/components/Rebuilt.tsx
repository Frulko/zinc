// What is drawn from the store: built again each time `revision` changes. A <For> on the one value, as a keyed list rebuilds an item whose key is new.
import { For } from 'zinc:ui/solid';
import { revision } from '../state';

export function Rebuilt(props: { make: () => i32 }): i32 {
  return <View><For each={[revision()]}>{(version: i32) => props.make()}</For></View>;
}
