// zinc:worker: compute off the UI thread, as the Web Workers API names it (D181, docs/guide/04-headless-services.md "Workers"). A worker is a second
// program of the build, its file named by a literal (`new Worker<In, Out>(new URL('./work.ts', import.meta.url))`): it runs on its own thread
// with its own heap and event loop, and nothing is shared. Messages are data (numbers, strings, booleans, u8[] buffers, arrays, records and
// T | null) copied on the record wire (include/zn/rec.h); a u8[] named in the transfer list is moved: the sender's array is emptied.
// The runtime side is src/rt/worker.cpp.

export class MessageEvent<T> {
  readonly data: T;
  constructor(data: T) { this.data = data; }
}

export class ErrorEvent {
  readonly message: string;
  constructor(message: string) { this.message = message; }
}

// What the program receives (In) and posts (Out) cross as records; their schemas travel with the start, so the worker decodes by its parent's types.
let __workerPumps: Map<i32, () => void> = new Map<i32, () => void>();
let __workerSelfPump: (() => void) | null = null;

__addEvHandler((h: i32, kind: i32, data: string) => {
  if (kind !== 70) return;
  if (h === 0) {
    const f = __workerSelfPump;
    if (f !== null) f();
    else while (__host_workerNext(0)) {}   // no onmessage: the messages are dropped, as on the web
    return;
  }
  const p = __workerPumps.get(h);
  if (p !== undefined) p();
});

function __detach(transfer: u8[][]): void {
  for (const b of transfer) b.length = 0;   // moved: the receiver has the bytes, the sender an empty array (ponytail: copied, then emptied; zero-copy is a later step)
}

export class Worker<In, Out> {
  /** Called with each message the worker posts. */
  onmessage: ((e: MessageEvent<Out>) => void) | null = null;
  /** Called once when the worker throws: its program has ended. Without it the error is printed. */
  onerror: ((e: ErrorEvent) => void) | null = null;
  private h: i32 = 0;
  private sIn: string;
  private sOut: string;
  private __zincWorker: boolean = true;

  constructor(entry: string) {
    this.sIn = __recSchemaOf<In>();
    this.sOut = __recSchemaOf<Out>();
    this.h = __host_workerStart(entry, this.sIn, this.sOut);
    if (this.h === 0) throw new Error(__host_workerError(0));
    __workerPumps.set(this.h, () => { this.pump(); });
  }

  /** Sends a message to the worker; the u8[] arrays of `transfer` are moved (emptied here). */
  postMessage(message: In, transfer: u8[][] = []): void {
    __recPost(this.h, message, this.sIn);   // encoded from the objects themselves, by the schema (src/rt/worker.cpp)
    __detach(transfer);
  }

  /** Stops the worker at its next call into the engine; its pending messages are dropped. */
  terminate(): void {
    __host_workerClose(this.h);
    __workerPumps.delete(this.h);
  }

  private pump(): void {
    while (__host_workerNext(this.h)) {
      const f = this.onmessage;
      if (f === null) continue;
      const v = __recRead<Out>(this.sOut);   // decoded into objects of Out, by the schema
      __host_workerMark(this.h, 1);
      f(new MessageEvent<Out>(v));
      __host_workerMark(this.h, 2);
    }
    const err = __host_workerError(this.h);
    if (err === '') return;
    __workerPumps.delete(this.h);
    if (err === '<ended>') return;
    const g = this.onerror;
    if (g !== null) g(new ErrorEvent(err));
    else console.error('Uncaught (in worker) ' + err);
  }
}

// The worker's side: `self` posts to the parent and receives its messages. `self.onmessage = (e: MessageEvent<T>) => ...` is turned into
// __workerOnMessage(handler) and `self.postMessage(v)` into __workerPost(v) by the checker (a setter or a method cannot take its own type parameter).
export class WorkerSelf {
  private __zincWorkerSelf: boolean = true;
  /** Posts a message to the parent; the u8[] arrays of `transfer` are moved (emptied here). */
  postMessage(message: any, transfer: u8[][] = []): void { throw new Error('self.postMessage is rewritten by the checker'); }
  /** Ends the worker once its pending work is done. */
  close(): void { __host_workerClose(0); }
}

export const self: WorkerSelf = new WorkerSelf();

export function __workerPost<T>(message: T, transfer: u8[][] = []): void {
  __recPost(0, message, __host_workerSchema(1));   // the parent's schema of what it receives, matched by name against T
  __detach(transfer);
}

// ---- ports (ZN-864): the Web's MessageChannel with Electron's invoke/handle on top. A port posts Out and receives In; `request(m)` sends
// a request whose reply is the In that the other side's `handle` returns. Over a worker the messages travel as Envelope records on the same
// wire; between two windows of one program (MessageChannel) they are delivered as microtasks, never inside the sender's call.

export interface Envelope<T> { kind: i32; id: i32; data: T }   // kind 0 a message, 1 a request, 2 its reply (id matches)

export class MessagePort<Out, In> {
  /** Called with each message the other side posts. */
  onmessage: ((e: MessageEvent<In>) => void) | null = null;
  private answer: ((m: In) => Out) | null = null;
  private waiting: Map<i32, (v: In) => void> = new Map<i32, (v: In) => void>();
  private next: i32 = 1;
  private send: (e: Envelope<Out>) => void;
  constructor(send: (e: Envelope<Out>) => void) { this.send = send; }
  postMessage(message: Out): void { this.send({ kind: 0, id: 0, data: message }); }
  /** Sends `message` to the other side's `handle` and settles with what it returns. */
  request(message: Out): Promise<In> {
    const id = this.next++;
    return new Promise<In>((resolve: (v: In) => void) => {
      this.waiting.set(id, resolve);
      this.send({ kind: 1, id: id, data: message });
    });
  }
  /** Answers the other side's requests: what `f` returns is the reply. */
  handle(f: (m: In) => Out): void { this.answer = f; }
  /** One envelope from the other side (the channel or the worker's pump calls it). */
  deliver(e: Envelope<In>): void {
    if (e.kind === 2) {
      const r = this.waiting.get(e.id);
      if (r !== undefined) { this.waiting.delete(e.id); r(e.data); }
    } else if (e.kind === 1) {
      const f = this.answer;
      if (f === null) throw new Error('MessagePort: a request came and no handle() answers it');
      this.send({ kind: 2, id: e.id, data: f(e.data) });
    } else {
      const g = this.onmessage;
      if (g !== null) g(new MessageEvent<In>(e.data));
    }
  }
}

/** Two ports joined to each other in one program (two windows): port1 posts A and receives B, port2 the other way. */
export class MessageChannel<A, B> {
  readonly port1: MessagePort<A, B>;
  readonly port2: MessagePort<B, A>;
  constructor() {
    let p2: MessagePort<B, A> | null = null;
    const p1 = new MessagePort<A, B>((e: Envelope<A>) => { queueMicrotask(() => { if (p2 !== null) p2.deliver(e); }); });
    this.port1 = p1;
    const q = new MessagePort<B, A>((e: Envelope<B>) => { queueMicrotask(() => { p1.deliver(e); }); });
    p2 = q;
    this.port2 = q;
  }
}

/** The program's port to a worker made as `new Worker<Envelope<Out>, Envelope<In>>(...)`: posts Out to it, receives its In. */
export function workerPort<Out, In>(w: Worker<Envelope<Out>, Envelope<In>>): MessagePort<Out, In> {
  const p = new MessagePort<Out, In>((e: Envelope<Out>) => { w.postMessage(e); });
  w.onmessage = (e: MessageEvent<Envelope<In>>) => { p.deliver(e.data); };
  return p;
}

/** Inside a worker: its port to the program that started it (the other end of workerPort). */
export function parentPort<Out, In>(): MessagePort<Out, In> {
  const p = new MessagePort<Out, In>((e: Envelope<Out>) => { __workerPost<Envelope<Out>>(e); });
  __workerOnMessage<Envelope<In>>((e: MessageEvent<Envelope<In>>) => { p.deliver(e.data); });
  return p;
}

export function __workerOnMessage<T>(f: (e: MessageEvent<T>) => void): void {
  const s = __host_workerSchema(0);
  __workerSelfPump = () => {
    while (__host_workerNext(0)) {
      const v = __recRead<T>(s);
      __host_workerMark(0, 1);
      f(new MessageEvent<T>(v));
      __host_workerMark(0, 2);
    }
  };
}
