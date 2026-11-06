// A chord's name for the settings and the tray.
import { MOD_COMMAND, MOD_CONTROL, MOD_OPTION } from 'zinc:desktop-windows';

// Virtual key codes of the ANSI layout (HIToolbox Events.h): what the tap reports.
const KEY_NAMES = new Map<number, string>([
  [48, 'Tab'], [49, 'Space'], [50, '`'], [36, 'Return'], [51, 'Delete'],
  [0, 'A'], [1, 'S'], [2, 'D'], [3, 'F'], [4, 'H'], [5, 'G'], [6, 'Z'], [7, 'X'], [8, 'C'], [9, 'V'], [11, 'B'], [12, 'Q'], [13, 'W'], [14, 'E'], [15, 'R'], [16, 'Y'], [17, 'T'],
  [18, '1'], [19, '2'], [20, '3'], [21, '4'], [22, '6'], [23, '5'], [25, '9'], [26, '7'], [28, '8'], [29, '0'], [31, 'O'], [32, 'U'], [34, 'I'], [35, 'P'], [37, 'L'], [38, 'J'], [40, 'K'], [45, 'N'], [46, 'M'],
]);

export function hotkeyLabel(keyCode: number, modifiers: number): string {
  let label = '';
  if (modifiers & MOD_CONTROL) label += 'Ctrl + ';
  if (modifiers & MOD_OPTION) label += 'Option + ';
  if (modifiers & MOD_COMMAND) label += 'Cmd + ';
  return label + (KEY_NAMES.get(keyCode) ?? 'Key ' + keyCode);
}
