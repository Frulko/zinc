// Units and terminal colours for the report.
export const RESET = '\u001b[0m';
const RED = '\u001b[31m', YELLOW = '\u001b[33m', GREEN = '\u001b[32m', CYAN = '\u001b[36m';

export function bold(s: string): string { return `\u001b[1m${s}${RESET}`; }
export function dim(s: string): string { return `\u001b[90m${s}${RESET}`; }

/** "21.7 °C" with one decimal. */
export function celsius(t: number): string {
  return `${Math.round(t * 10) / 10} °C`;
}

/** Colour of a temperature: cold, mild, warm, hot. */
export function colorFor(t: number): string {
  if (t < 10) return CYAN;
  if (t < 16) return GREEN;
  if (t < 22) return YELLOW;
  return RED;
}
