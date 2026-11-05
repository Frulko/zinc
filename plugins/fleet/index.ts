// zinc:fleet — one clock for several machines (docs/plugins/fleet.md). One machine serves its clock over UDP; the others ask it, keep the answer
// that travelled fastest of their last ones (queues only add delay) and read the shared time with now(). The four instants
// of NTP (sent, arrived there, answered, arrived back) leave out the time a datagram waits for the frame loop to read it.
//   await serveClock(7790);                                   on the machine that gives the time
//   const clock = await joinClock('192.168.1.20', 7790);      on the others
//   clock.now()                                               milliseconds, the same on all of them
import { udp, Datagram } from 'zinc:socket';
import * as sys from 'zinc:sys';

const BURST: i32 = 8;          // probes at the start, one every BURST_MS, so a player knows the time at once
const BURST_MS = 30;
const STEADY_MS = 1000;        // then one a second
const KEPT: i32 = 8;           // the answers the filter chooses from

interface Sample { offset: number; rtt: number }

function localNow(): number { return performance.now() + skewMs; }
const skewEnv = sys.env('ZINC_FLEET_SKEW_US');   // a test makes one process's clock wrong
const skewMs: number = skewEnv !== '' ? parseFloat(skewEnv) / 1000 : 0;

/** The time as this machine knows it: its own when it serves, the served one when it joined. */
export class FleetClock {
  /** What to add to this machine's clock to get the shared time, in ms. */
  offset = 0;
  /** How long the answer in use took to come back, in ms; offset is right within half of it. */
  rtt = 0;
  /** Whether an answer has come (always true on the machine that serves). */
  synced = false;
  private samples: Sample[] = [];

  /** The shared time in milliseconds. */
  now(): number { return localNow() + this.offset; }

  note(sentAt: number, arrivedThere: number, answeredAt: number, receivedAt: number): void {
    this.samples.push({ offset: ((arrivedThere - sentAt) + (answeredAt - receivedAt)) / 2, rtt: (receivedAt - sentAt) - (answeredAt - arrivedThere) });
    if (this.samples.length > KEPT) this.samples.shift();
    let best = this.samples[0];
    for (const sample of this.samples) if (sample.rtt < best.rtt) best = sample;
    // ponytail: the offset steps; clocks drift about 50 ppm, 0.05 ms between probes, so no drift line until a measure shows a need
    this.offset = best.offset;
    this.rtt = best.rtt;
    this.synced = true;
  }
}

/** The clock of the machine that serves: offset 0. */
export function ownClock(): FleetClock {
  const clock = new FleetClock();
  clock.synced = true;
  return clock;
}

/** Answers every probe with this machine's time. Rejects when the port is taken. */
export async function serveClock(port: i32): Promise<void> {
  const socket = await udp(port);
  socket.onMessage((m: Datagram) => {
    const now = localNow();
    socket.send(m.address, m.port, `${m.text} ${now - m.age} ${now}`);
  });
}

/** A clock that follows the one served at host:port; it goes on asking as long as the program runs. */
export async function joinClock(host: string, port: i32): Promise<FleetClock> {
  const socket = await udp(0);
  const clock = new FleetClock();
  socket.onMessage((m: Datagram) => {
    const parts = m.text.split(' ');
    if (parts.length === 3) clock.note(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]), localNow() - m.age);
  });
  const probe = (): void => { socket.send(host, port, `${localNow()}`); };
  let sent: i32 = 0;
  const burst = setInterval(() => {
    probe();
    if (++sent >= BURST) clearInterval(burst);
  }, BURST_MS);
  setInterval(probe, STEADY_MS);
  return clock;
}
