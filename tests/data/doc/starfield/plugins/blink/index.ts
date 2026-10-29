// zinc:blink: an LED on a pin that blinks at a rate.
import N from './native/blink.spec';

/** Options of a blinker. */
export interface BlinkOptions {
  /** The GPIO pin. */
  pin: i32;
  /** Blinks per second. */
  rate?: f64;
}

/** An LED that blinks. */
export class Blinker {
  private h: i32;
  constructor(o: BlinkOptions) { this.h = N.open(o.pin, o.rate ?? 1); }
  /** Stops blinking and turns the LED off. */
  stop(): void { N.close(this.h); }
}

/** Starts a blinker on `pin`. */
export function blink(pin: i32, rate: f64 = 1): Blinker { return new Blinker({ pin, rate }); }
