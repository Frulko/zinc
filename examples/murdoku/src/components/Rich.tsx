import { createEffect, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { image } from 'zinc:gfx';
import { plain, runsOf } from '../hint-summary';
import { puzzle } from '../state';
import { personLetter } from '../puzzle';
import { INK } from '../skin';
const badges: i32[] = [-1,-1,-1,-1,-1,-1];
function badge(person: number): i32 {
 const letter = personLetter(puzzle(),person), i = letter === 'V' ? 5 : letter.charCodeAt(0)-65;
 if (badges[i] < 0) badges[i] = image('badge-'+letter+'.png');
 return badges[i];
}
const SIZE = 15;
// A text whose **marked** words are bold; `other` >= 0 ends the sentence with that person's letter badge as an inline picture.
export function Rich(props: { text: string; className: string; width: number; other: number }): i32 {
 const r = createNodeRef();
 createEffect(() => {
  const t = props.text, o = INK ? -1 : props.other, runs = runsOf(t);
  if (o >= 0) { runs.push(1); runs.push(0); runs.push(-1); runs.push(1); runs.push(ui.pictureRun(SIZE,SIZE)); runs.push(badge(o)); }
  Promise.resolve().then(() => { if (r.node >= 0) ui.setTextRuns(r.node, runs); });
 });
 return <Text ref={r} style={{ width: props.width }} className={props.className}>{plain(props.text)+(props.other >= 0 ? (INK ? ' → '+personLetter(puzzle(),props.other) : ' ￼') : '')}</Text>;
}
