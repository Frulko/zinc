// The simulated drive. A speed profile is computed once along the route (every 2 m): the speed limit, slower in
// curves (lateral acceleration), a traffic jam, red lights, and braking / acceleration limits so the car never
// jumps between speeds. Each frame the car moves along the route at the profile's speed (× the simulation speed).
// The remaining time for the ETA is the profile integrated from the car to the end.
import { createSignal } from 'zinc:ui/solid';
import { routeLength, limitAt, headingAt, angleDelta, nextStepAt, steps, streetAt, formatDistance } from './route';

// ---------------------------------------------------------------- scripted events along the route (metres)
/** Red lights: the car stops there for STOP_SECONDS. */
const STOPS: number[] = [1925, 5545];
const STOP_SECONDS: number = 5;
/** A stretch where the driver goes over the limit (the speed bubble turns red). */
export const SPEEDING_FROM: number = 2900, SPEEDING_TO: number = 3500;
/** A traffic jam: drawn red on the route, crawled through at 8 km/h. */
export const JAM_FROM: number = 4430, JAM_TO: number = 4800;
const JAM_SPEED: number = 8 / 3.6;
/** Start time on the dashboard clock: 17:42 (a fixed time keeps screenshots reproducible). */
const START_CLOCK: number = 17 * 3600 + 42 * 60;

// ---------------------------------------------------------------- speed profile
const DS: number = 2;
const N: i32 = Math.ceil(routeLength / DS) + 1;
const profile: number[] = [];
/** Seconds from sample i to the end (including the red lights ahead). */
const remaining: number[] = [];

function buildProfile(): void {
  for (let i: i32 = 0; i < N; i++) {
    const d = i * DS;
    let v = limitAt(d) / 3.6 * 0.96;
    if (d > SPEEDING_FROM && d < SPEEDING_TO) v *= 1.22;
    // curve: the heading change over 24 m gives the radius; lateral acceleration 2.2 m/s²
    const turn = Math.abs(angleDelta(headingAt(d - 12, 4), headingAt(d + 12, 4)));
    if (turn > 0.05) v = Math.min(v, Math.max(3.5, Math.sqrt(2.2 * 24 / turn)));
    if (d > JAM_FROM && d < JAM_TO) v = Math.min(v, JAM_SPEED);
    profile.push(v);
  }
  profile[0] = 0; profile[N - 1] = 0;
  for (const s of STOPS) profile[Math.round(s / DS)] = 0;
  // braking (2.2 m/s²) seen from the end, acceleration (1.8 m/s²) from the start: v² = v0² + 2·a·ds
  for (let i: i32 = N - 2; i >= 0; i--) profile[i] = Math.min(profile[i], Math.sqrt(profile[i + 1] * profile[i + 1] + 2 * 2.2 * DS));
  for (let i: i32 = 1; i < N; i++) profile[i] = Math.min(profile[i], Math.sqrt(profile[i - 1] * profile[i - 1] + 2 * 1.8 * DS));
  for (let i: i32 = 0; i < N; i++) remaining.push(0);
  for (let i: i32 = N - 2; i >= 0; i--) {
    let t = remaining[i + 1] + DS / Math.max(1, (profile[i] + profile[i + 1]) / 2);
    for (const s of STOPS) if (Math.round(s / DS) === i) t += STOP_SECONDS;
    remaining[i] = t;
  }
}
buildProfile();

function profileAt(d: number): number {
  const f = Math.max(0, Math.min(N - 1.001, d / DS)), i: i32 = Math.floor(f);
  return profile[i] + (profile[i + 1] - profile[i]) * (f - i);
}
/** Seconds of driving left from distance d, following the profile. */
export function timeLeftFrom(d: number): number { return remaining[Math.max(0, Math.min(N - 1, Math.round(d / DS)))]; }
export const totalTime: number = remaining[0];

// ---------------------------------------------------------------- state
export const PREVIEW: i32 = 0, DRIVING: i32 = 1, ARRIVED: i32 = 2;
/** Distance driven (m) and speed (m/s): read every frame by the scene, so plain variables. */
export class Car { d: number = 0; v: number = 0; t: number = 0; wait: number = 0; stopsDone: i32 = 0; }
export const car: Car = new Car();

export const [phase, setPhase] = createSignal<i32>(PREVIEW);
export const [playing, setPlaying] = createSignal<boolean>(true);
export const [simSpeed, setSimSpeed] = createSignal<i32>(1);

// dashboard values, as signals (a signal only notifies when its value changes, so setting them every frame is cheap)
export const [speedKmh, setSpeedKmh] = createSignal<i32>(0);
export const [limitKmh, setLimitKmh] = createSignal<i32>(30);
export const [stepIndex, setStepIndex] = createSignal<i32>(1);
export const [street, setStreet] = createSignal<string>('');
export const [etaClock, setEtaClock] = createSignal<string>('');
export const [etaMinutes, setEtaMinutes] = createSignal<i32>(0);
export const [distanceLeft, setDistanceLeft] = createSignal<string>('');

function clockText(seconds: number): string {
  const m: i32 = Math.floor(seconds / 60) % (24 * 60);
  return `${Math.floor(m / 60)}:${`${m % 60}`.padStart(2, '0')}`;
}
/** Banner distance: 10 m steps below 300 m, 50 m steps below 1 km, "Now" in the last 15 m. */
export function maneuverText(m: number): string {
  if (m < 15) return 'Now';
  if (m < 300) return `${Math.max(20, Math.round(m / 10) * 10)} m`;
  if (m < 1000) return `${Math.round(m / 50) * 50} m`;
  return formatDistance(m);
}

function publish(): void {
  const d = car.d;
  setSpeedKmh(Math.round(car.v * 3.6));
  setLimitKmh(limitAt(d));
  const next = nextStepAt(d);
  setStepIndex(next);
  setStreet(streetAt(d + 1));
  const left = timeLeftFrom(d) + car.wait;
  setEtaMinutes(Math.max(1, Math.round(left / 60)));
  setEtaClock(clockText(START_CLOCK + car.t + left));
  setDistanceLeft(formatDistance(routeLength - d));
}

/** Puts the car at distance d, at the profile's speed (restart, scripted demo states). */
export function jumpTo(d: number): void {
  car.d = d; car.v = profileAt(d); car.wait = 0; car.t = totalTime - timeLeftFrom(d);
  car.stopsDone = 0;
  for (const s of STOPS) if (s <= d) car.stopsDone++;
  publish();
}

/** Leaves the route preview: the drive starts. */
export function start(): void { jumpTo(0); setPhase(DRIVING); setPlaying(true); }
export function restart(): void { jumpTo(0); setPhase(PREVIEW); }
export function togglePlay(): void { if (phase() === DRIVING) setPlaying(!playing()); else if (phase() === PREVIEW) start(); }
export function cycleSpeed(): void { setSimSpeed(simSpeed() === 1 ? 2 : simSpeed() === 2 ? 4 : 1); }

/** One frame of driving; dt in real seconds. */
export function stepSim(dt: number): void {
  if (phase() !== DRIVING || !playing()) return;
  const h = Math.min(dt, 0.05) * simSpeed();
  car.t += h;
  if (car.wait > 0) {                       // at a red light
    car.wait -= h; car.v = 0;
  } else {
    // follow the profile, with a little breathing so the speed is not machine-perfect
    const target = Math.max(profileAt(car.d), 1.2) * (1 + 0.025 * Math.sin(car.t * 0.6));
    car.v += Math.max(-3 * h, Math.min(2.2 * h, target - car.v));
    const next = car.d + car.v * h;
    if (car.stopsDone < STOPS.length && next >= STOPS[car.stopsDone]) {
      car.d = STOPS[car.stopsDone]; car.stopsDone++; car.wait = STOP_SECONDS; car.v = 0;
    } else car.d = next;
  }
  if (car.d >= routeLength) { car.d = routeLength; car.v = 0; setPhase(ARRIVED); }
  publish();
}

jumpTo(0);
