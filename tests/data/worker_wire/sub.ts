// The receiver's own types: a subset of the sender's fields (the rest skipped), in another order, a number read as i32, and fields the
// sender does not have (their defaults).
import { self, MessageEvent } from 'zinc:worker';

interface Score { score: number; name: string; rank: i32 }
interface Sub { inners: Score[]; s: string; n: i32; added: string; addedN: number; addedList: number[]; addedRec: Score; addedMaybe: Score | null }

self.onmessage = (e: MessageEvent<Sub>) => {
  const d = e.data;
  let names = '';
  for (const x of d.inners) names += x.name + ':' + x.score + ':' + x.rank + ' ';
  self.postMessage('sub n=' + d.n + ' s=' + d.s + ' inners=' + names + 'added="' + d.added + '" ' + d.addedN + ' ' + d.addedList.length + ' ' +
    d.addedRec.name.length + '/' + d.addedRec.score + ' ' + (d.addedMaybe === null ? 'null' : 'set'));
};
