// Clock arithmetic: seconds of the day to hours / minutes / seconds, and two-digit formatting.

export interface ClockTime {
  hours: i32;
  minutes: i32;
  seconds: i32;
}

export const SECONDS_PER_DAY: i32 = 86400;

export function split(secondsOfDay: i32): ClockTime {
  return {
    hours: Math.floor(secondsOfDay / 3600) % 24,
    minutes: Math.floor(secondsOfDay / 60) % 60,
    seconds: secondsOfDay % 60,
  };
}

/** 7 -> "07" */
export function twoDigits(n: i32): string {
  return n < 10 ? `0${n}` : `${n}`;
}
