# zinc:remarkable

An explicitly imported, platform-specific toolbar for reMarkable applications:

```tsx
import { RemarkableBar } from 'zinc:remarkable';

<RemarkableBar title="Dashboard" />
```

Displays the tablet's local time, battery percentage/charging state and a finger-sized **Quitter** button. Without `onQuit`, the button calls `zinc:gfx.quit()`. Supply `onQuit` to save first or keep the app open if saving fails (see Notes).

**Widgets**, after iOS WidgetKit and Android's Glance: wrap the app in `RemarkableApp` and give it a small view of itself.

```tsx
import { RemarkableApp } from 'zinc:remarkable';
render(() => <RemarkableApp app={App} widget={{ view: TimerWidget, width: 640, height: 260 }} />, 0xffffff, null);
```

Accueil then shows the widget as a card over the tablet's screen: the same program, drawing `view` at the top left of its screen while
`windowMode()` is `'widget'`, so what is tapped in the card is the app's state when it opens again (the card's open button). The card
needs AppLoad with the window patches of `integrations/remarkable-engine/appload` (with `0003`, a tap on the card's header folds it
and the app keeps running); without them Accueil minimizes, or quits. The calls
under it are `setWidget(x, y, w, h)`, `showWidget()` and `windowState()` of `zinc:gfx`.

**Accueil** goes back to the tablet's screen and leaves the app running: it calls `onHome` (save the state there), then `zinc:gfx.minimizeWindow()`, which minimizes the AppLoad window; tap the window's bar to come back. An AppLoad without the window-state patch (`integrations/remarkable-engine/appload`) cannot minimize from the app: Accueil then quits like **Quitter**, and an app that restores its saved state at start comes back as it was. AppLoad's own `_` button (swipe down from the top of a full-screen app) minimizes too.

On Linux (the reMarkable runs the package's linux build) the native module reads the battery from `/sys/class/power_supply` and the local time. macOS previews show an unknown battery. Values are checked every ten seconds; unchanged signals do not require repainting. The clock has minute precision.

Finger events control the UI. `InkCanvas` consumes the separate pen sample queue, so fingers do not draw. This component does not itself alter display ownership or the e-ink waveform.

**Writing tools**: `<InkPalette ink={ink} />` is xochitl's palette for a `zinc:ink` surface: ballpoint, fineliner, marker, pencil,
calligraphy, highlighter, the stroke and area erasers, the Paper Pro's nine pen colours (`PEN_COLORS`) or the highlighter's
(`HIGHLIGHTER_COLORS`), thin / medium / thick, undo, redo, erase all; **Hide** folds it to a small handle that names the tool. Props:
`widths` (default half, once and twice `ink.width`), `open` (default true), `onChange` (after every choice). It only sets `ink.tool`,
`ink.color` and `ink.width` and calls `ink.undo()`/`redo()`/`clear()`, so an app keeps its own pen input and saving.

```tsx
import { InkPalette } from 'zinc:remarkable';
<View className="flex-col h-full"><InkPalette ink={ink} open={false} /><InkCanvas ink={ink} className="grow" /></View>
```

**Keyboard**: `<RemarkableKeyboard />` is the kit's `Keyboard` drawn for e-paper as the tablet's own (white keys with a thin outline, large
captions, no shadow or preview bubble, Enter and the capitals in black). It shows itself while a text field has the focus; its languages are
the tablet's handwriting language, then `LANG`, then English (`tabletLayouts()`), or `layouts={['fr', 'en']}`.

`setPenMode(on)` puts the panel in its Pen waveform (fast, black and white: for writing) or back in its UI one (greys, colour,
clean pages). `InkPalette` calls it: unfolded is writing, folded is reading. The switch takes about a second on the tablet (qtfb
pauses), so an app asks when the user starts or stops writing, never per stroke. Apps keep `"refresh_mode": "ui"` in zinc.json.
