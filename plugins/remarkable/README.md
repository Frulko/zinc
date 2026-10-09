# zinc:remarkable

An explicitly imported, platform-specific toolbar for reMarkable applications:

```tsx
import { RemarkableBar } from 'zinc:remarkable';

<RemarkableBar title="Dashboard" />
```

Displays the tablet's local time, battery percentage/charging state and a finger-sized **Quitter** button. Without `onQuit`, the button calls `zinc:gfx.quit()`. Supply `onQuit` to save first or keep the app open if saving fails (see Notes).

The rmpp native module reads battery sysfs and local system time. Desktop/simulator previews show an unknown battery. Values are checked every ten seconds; unchanged signals do not require repainting. The clock has minute precision.

Finger events control the UI. `InkCanvas` consumes the separate pen sample queue, so fingers do not draw. This component does not itself alter display ownership or the e-ink waveform.
