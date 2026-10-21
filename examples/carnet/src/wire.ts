// The one message format of the collaboration: a block, a page, a person's presence or a person leaving, as one JSON object
// per WebSocket message. Records (blocks, pages) carry a stamp, a Lamport clock and the peer that wrote it: the larger stamp
// wins, per record (last writer wins, as Notion merged blocks before it had a CRDT).

export const W_BLOCK = 'b', W_PAGE = 'p', W_HELLO = 'hi', W_BYE = 'bye';

export class Wire {
  k: string = '';                                           // W_BLOCK, W_PAGE, W_HELLO, W_BYE
  id: string = '';                                          // record id; for W_HELLO / W_BYE the peer
  page: string = '';                                        // block: its page; W_HELLO: the page shown
  type: string = ''; text: string = ''; checked: boolean = false; indent: i32 = 0;
  pos: number = 0; del: boolean = false;                    // order in its list, tombstone
  title: string = ''; icon: string = '';                    // page
  c: i32 = 0; p: string = '';                               // stamp: Lamport clock, writer
  name: string = ''; color: i32 = 0;                        // W_HELLO: who
  block: string = ''; caret: i32 = -1; anchor: i32 = -1;    // W_HELLO: where their caret is
}

function str(v: any): string { return typeof v === 'string' ? v : ''; }
function num(v: any): number { return typeof v === 'number' ? v : 0; }

export function encode(w: Wire): string { return JSON.stringify(w); }

/** The message, or null when it is not one of ours. */
export function decode(text: string): Wire | null {
  try {
    const o = JSON.parse(text);
    const w = new Wire();
    w.k = str(o.k); w.id = str(o.id); w.page = str(o.page);
    w.type = str(o.type); w.text = str(o.text); w.checked = o.checked === true; w.indent = Math.floor(num(o.indent));
    w.pos = num(o.pos); w.del = o.del === true;
    w.title = str(o.title); w.icon = str(o.icon);
    w.c = Math.floor(num(o.c)); w.p = str(o.p);
    w.name = str(o.name); w.color = Math.floor(num(o.color));
    w.block = str(o.block); w.caret = Math.floor(num(o.caret)); w.anchor = Math.floor(num(o.anchor));
    return w.k === '' || w.id === '' ? null : w;
  } catch (e) {
    return null;
  }
}
