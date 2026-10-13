// Simulation is opt-in at the public API; a missing SDK must never impersonate a live sensor.
export default {
  open(): boolean { return false; },
  error(): string { return 'Native tracking unavailable. Use Tracker(true) for simulated hands.'; },
  poll(): number[] { return [0, 0, 0, 0]; },
  close(): void {},
};
