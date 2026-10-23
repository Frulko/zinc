// ============================================================================
// services/pairing.ts — The Zinc agent's pairing, read from its files
// ============================================================================
// The agent (zinc agent, run by zinc-agent.service as the same user as the player) keeps its state in <ZINC_HOME>/agent:
// pairing.json holds the code of an open pairing and when it ends, clients.json the paired computers, agent.json the
// device's name (docs/reports/zinc-next-agent.md, "Files of the agent").

import * as fs from 'zinc:fs';

export class PairingState {
  /** The six digits of an open pairing ('' when none is open). */
  code: string = '';
  /** Seconds since 1970 when the code stops working. */
  validUntil: f64 = 0;
  /** How many computers are paired. */
  pairedComputers: i32 = 0;
  /** The name the agent announces (zinc device pair <name> <code>); '' before it first ran. */
  deviceName: string = '';

  signature(): string {
    return this.code + '|' + this.pairedComputers + '|' + this.deviceName;
  }
}

function readJson(path: string): any {
  if (!fs.exists(path)) return null;
  try {
    return JSON.parse(fs.readText(path));
  } catch (e) {
    return null;
  }
}

/** The pairing as the agent's files say, a code past its end counting as none. */
export function readPairingState(agentDirectory: string, nowSeconds: f64): PairingState {
  const state = new PairingState();
  const pairing = readJson(agentDirectory + '/pairing.json');
  if (pairing !== null && typeof pairing.code === 'string' && typeof pairing.until === 'number' && (pairing.until as f64) > nowSeconds) {
    state.code = pairing.code as string;
    state.validUntil = pairing.until as f64;
  }
  const clients = readJson(agentDirectory + '/clients.json');
  if (clients !== null && Array.isArray(clients.clients)) state.pairedComputers = (clients.clients as any[]).length as i32;
  const agent = readJson(agentDirectory + '/agent.json');
  if (agent !== null && typeof agent.name === 'string') state.deviceName = agent.name as string;
  return state;
}
