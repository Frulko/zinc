// Missions and ranks: each mission counts one kind of shot; finishing it promotes the player one rank, and the next
// mission starts. Names are this game's own.

export const M_BUMPERS: i32 = 0, M_TARGETS: i32 = 1, M_RAMP: i32 = 2, M_SPINNER: i32 = 3, M_LANES: i32 = 4,
  M_HOLE: i32 = 5, M_SLINGS: i32 = 6;

export class Mission {
  constructor(public name: string, public goal: string, public kind: i32, public count: i32, public award: i32) {}
}

export const MISSIONS: Mission[] = [
  new Mission('ASTEROID FIELD', 'Hit the pop bumpers', M_BUMPERS, 15, 20000),
  new Mission('RAMP RUN', 'Ride the ramp', M_RAMP, 2, 30000),
  new Mission('TARGET PRACTICE', 'Clear the drop targets', M_TARGETS, 2, 30000),
  new Mission('ORBIT SPIN', 'Spin the spinner', M_SPINNER, 20, 25000),
  new Mission('STAR LANES', 'Complete the top lanes', M_LANES, 2, 30000),
  new Mission('WORMHOLE', 'Sink the wormhole', M_HOLE, 2, 40000),
  new Mission('SLINGSHOT', 'Kick the slingshots', M_SLINGS, 10, 25000),
];

export const RANKS: string[] = ['RECRUIT', 'CADET', 'PILOT', 'NAVIGATOR', 'COMMANDER', 'CAPTAIN', 'COMMODORE', 'ADMIRAL'];
