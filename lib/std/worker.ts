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
    else while (__host_workerRecv(0).length > 0) {}   // no onmessage: the messages are dropped, as on the web
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
    __host_workerPost(this.h, __recEnc(message, this.sIn));
    __detach(transfer);
  }

  /** Stops the worker at its next call into the engine; its pending messages are dropped. */
  terminate(): void {
    __host_workerClose(this.h);
    __workerPumps.delete(this.h);
  }

  private pump(): void {
    for (;;) {
      const b = __host_workerRecv(this.h);
      if (b.length === 0) break;
      const f = this.onmessage;
      if (f === null) continue;
      const v: any = __recDec(b, this.sOut);
      __host_workerMark(this.h, 1);
      f(new MessageEvent<Out>(v as Out));
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
// __workerOnMessage(handler) by the checker (a setter cannot take its own type parameter).
export class WorkerSelf {
  private __zincWorkerSelf: boolean = true;
  /** Posts a message to the parent; the u8[] arrays of `transfer` are moved (emptied here). */
  postMessage(message: any, transfer: u8[][] = []): void {
    __host_workerPost(0, __recEnc(message, __host_workerSchema(1)));
    __detach(transfer);
  }
  /** Ends the worker once its pending work is done. */
  close(): void { __host_workerClose(0); }
}

export const self: WorkerSelf = new WorkerSelf();

export function __workerOnMessage<T>(f: (e: MessageEvent<T>) => void): void {
  const s = __host_workerSchema(0);
  __workerSelfPump = () => {
    for (;;) {
      const b = __host_workerRecv(0);
      if (b.length === 0) break;
      const v: any = __recDec(b, s);
      __host_workerMark(0, 1);
      f(new MessageEvent<T>(v as T));
      __host_workerMark(0, 2);
    }
  };
}
