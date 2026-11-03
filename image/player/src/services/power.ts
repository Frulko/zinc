// ============================================================================
// services/power.ts — Under-voltage of a Raspberry Pi, read from the kernel
// ============================================================================
// The Pi's firmware reports a weak supply as the hwmon device `rpi_volt`: in0_lcrit_alarm is 1 while the voltage is
// too low. One tiny file, readable by everyone, read every 2 s; machines without it (a Mac, other boards) show nothing.
// ZINC_POWER_SYSFS replaces /sys (the tests and the development machine).

import * as fs from 'zinc:fs';

export const POWER_HELP = 'The power supply is too weak:';
export const POWER_HELP_2 = 'use a 5 V / 2.5 A supply and a short, thick cable.';

export class PowerState {
  /** The alarm file; '' when this machine has none. */
  alarmPath: string = '';
  /** Under-voltage right now. */
  now: boolean = false;
  /** How many times it began since the player started. */
  episodes: i32 = 0;

  isPresent(): boolean {
    return this.alarmPath !== '';
  }

  /** What Settings > System says. */
  summary(): string {
    if (this.now) return 'Under-voltage now' + (this.episodes > 1 ? ' (' + this.episodes + ' times since start)' : '');
    if (this.episodes > 0) return 'OK now, under-voltage ' + (this.episodes === 1 ? 'once' : this.episodes + ' times') + ' since start';
    return 'OK';
  }
}

/** Finds the rpi_volt alarm file under `sysRoot` ('' when absent). */
export function findAlarm(sysRoot: string): string {
  for (let index = 0; index < 8; index++) {
    const dir = sysRoot + '/class/hwmon/hwmon' + index;
    if (!fs.exists(dir + '/name')) continue;
    if (fs.readText(dir + '/name').trim() === 'rpi_volt' && fs.exists(dir + '/in0_lcrit_alarm')) return dir + '/in0_lcrit_alarm';
  }
  return '';
}

/** Reads the alarm once; returns true when what the screen shows changed. */
export function readPower(power: PowerState): boolean {
  if (power.alarmPath === '') return false;
  let raw = '';
  try {
    raw = fs.readText(power.alarmPath).trim();
  } catch (e) {
    return false;
  }
  const now = raw === '1';
  if (now === power.now) return false;
  if (now) power.episodes++;
  power.now = now;
  return true;
}
