// Ownership of a player belongs to its most recently accepted master channel.
export enum MasterPhase { Waiting, Active, Closed }
export interface MasterSession { phase: MasterPhase; epoch: i32 }

let currentEpoch: i32 = 0;

export function newMasterSession(): MasterSession { return { phase: MasterPhase.Waiting, epoch: 0 }; }

export function transitionMaster(session: MasterSession, next: MasterPhase): void {
  if (session.phase === MasterPhase.Closed || next === MasterPhase.Waiting || (next === MasterPhase.Active && session.phase !== MasterPhase.Waiting)) {
    throw new Error('Invalid master channel transition');
  }
  if (next === MasterPhase.Active) session.epoch = ++currentEpoch;
  session.phase = next;
}

export function currentMaster(session: MasterSession): boolean {
  return session.phase === MasterPhase.Active && session.epoch === currentEpoch;
}
