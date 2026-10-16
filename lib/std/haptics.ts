// zinc:haptics: the phone's touch feedback, as expo-haptics names it (docs/ui.md, "System signals"). Android plays it with
// View.performHapticFeedback (src/app/android), iOS with UIImpactFeedbackGenerator, UISelectionFeedbackGenerator and
// UINotificationFeedbackGenerator (src/app/ios_glue.mm). A desktop has none: the calls do nothing there, and ZINC_DEVICE_LOG=file records them.
import { device } from 'zinc:sys';

export class Haptics {
  /** A collision of UI parts: 'light', 'medium' (the default), 'heavy', 'soft', 'rigid'. */
  static impact(style: string = 'medium'): void { device('haptic', 'impact ' + style); }
  /** A selection moved (a picker's wheel, a switch). */
  static selection(): void { device('haptic', 'selection'); }
  /** A task's outcome: 'success' (the default), 'warning', 'error'. */
  static notification(kind: string = 'success'): void { device('haptic', 'notification ' + kind); }
}
