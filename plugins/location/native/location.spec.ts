// zinc:location native side: nothing blocks. index.ts starts the updates and polls fix() on a timer; the backend (location.macos.mm, Core
// Location on macOS and iOS) writes the newest fix from its own callbacks under a mutex. location.host.cpp alone (Linux, Windows) has no
// provider; location.sim.ts neither. The fake provider (ZINC_FAKE_LOCATION) is Zinc code in index.ts, the same on every engine.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** '' when zinc.json "permissions" allow "location", else why not. */
  allowed(): string;
  /** 0 undetermined, 1 granted, 2 denied, 3 restricted (parental controls, a profile), 4 location services off, 5 no provider here.
   *  `ask`: show the system's question (when in use) when undetermined; it is answered later, so call again with false. */
  permission(ask: boolean): i32;
  /** Starts the updates, or retunes them: the accuracy wanted and the distance between two fixes, in metres (0: the best, every change). */
  start(accuracy: f64, distance: f64): void;
  stop(): void;
  /** The newest fix: [seq, latitude, longitude, accuracy, altitude, altitudeAccuracy, speed, heading, timestamp in ms]; NaN for what the
   *  provider does not know; seq 0 before the first. */
  fix(): f64[];
  /** The failure since the last call ('' none): its code ('denied', 'unavailable'), \u001f, the provider's message. */
  error(): string;
}
export default requireNative<Spec>('Location');
