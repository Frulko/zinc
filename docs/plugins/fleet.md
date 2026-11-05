# zinc:fleet

One clock for several machines on a network, so they can act at the same moment. Written in Zinc on `zinc:socket`, no native code.

```ts
import { joinClock, ownClock, serveClock } from 'zinc:fleet';

await serveClock(7790);                                // on the machine that gives the time
const mine = ownClock();

const clock = await joinClock('192.168.1.20', 7790);   // on the others
clock.now();                                           // milliseconds, the same on all of them
```

| Member | What it is |
|---|---|
| `clock.now()` | the shared time in milliseconds |
| `clock.offset` | what is added to this machine's clock, in ms |
| `clock.rtt` | how long the answer in use spent on the network, in ms: the offset is right within half of it. The wait for a frame to read a datagram does not count, on either side |
| `clock.synced` | whether an answer has come |

A clock probes eight times at the start, then once a second, and keeps the fastest answer of its last eight: queues on a network only add delay. Probes are plain UDP with no authentication: they tell the time and nothing else. Without genlock, two screens can still differ by up to one refresh even with a perfect clock.

`ZINC_FLEET_SKEW_US` adds to this process's clock, for a test on one machine.

| Platform | State |
|---|---|
| macos | verified, on loopback |
| linux, windows, android, ios, rpi1 | written, not run |
