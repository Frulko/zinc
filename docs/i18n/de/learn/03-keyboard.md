---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 3. Die Tastatur

**Das wirst du sehen:** ein Quadrat, das du mit den Pfeiltasten bewegst. Die Leertaste ändert seine Farbe. Der Name der zuletzt
gedrückten Taste steht in der oberen linken Ecke.

![Ein blaues Quadrat auf dunklem Hintergrund, "Space" in die Ecke geschrieben](img/03-keyboard.png)

## Der Code

Das Projekt liegt in [`samples/03-keyboard`](samples/03-keyboard/). `src/main.ts`:

```ts
import { onFrame, clear, rrect, font, drawText, width, height, isDown, wasPressed, Btn, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';

const SPEED = 240;   // pixels per second
const SIZE = 48;
let x = 100, y = 100;
let color: u32 = 0xe8b06a;
let lastKey = 'Press a key';
const label = font('sans', 24);

onFrame((dt: number) => {
  // 1. Keys held down: ask every frame.
  if (isDown(Btn.Left)) x -= SPEED * dt;
  if (isDown(Btn.Right)) x += SPEED * dt;
  if (isDown(Btn.Up)) y -= SPEED * dt;
  if (isDown(Btn.Down)) y += SPEED * dt;
  x = Math.max(0, Math.min(width() - SIZE, x));
  y = Math.max(0, Math.min(height() - SIZE, y));

  // 2. A key pressed this frame (not held since before).
  if (wasPressed(Btn.A)) color = color === 0xe8b06a ? 0x5bc0eb : 0xe8b06a;

  // 3. Every key that went down since the last frame, by name.
  for (let i = 0; i < keyCount(); i++) {
    if (keyKind(i) === KeyKind.Down) {
      lastKey = keyName(i) === ' ' ? 'Space' : keyName(i);
      console.log(`key "${lastKey}", the square is at x = ${Math.round(x)}`);
    }
  }

  clear(0x1c1b20);
  rrect(x, y, SIZE, SIZE, 10, color, 255);
  drawText(label, 20, 16, lastKey, 0xeceaf0, 255, 0);
});
```

Drücke Tasten: Das Terminal zeigt jede einzelne, zum Beispiel `key "a", the square is at x = 220`.

## Zwei Arten, die Tastatur zu lesen

**Jeden Frame fragen: Wird diese Taste gehalten?** `isDown(Btn.Left)` ist `true`, solange die Taste gehalten wird. Das benutzen Spiele,
um Dinge zu bewegen: Solange du den Pfeil hältst, bewegt sich das Quadrat in jedem Frame ein Stückchen. `zinc:gfx` benennt eine kleine Menge von
Buttons, die eines Game-Controllers, damit derselbe Code mit einer Tastatur, einem Gamepad oder den Tasten eines Handhelds funktioniert:

| Button | Tasten auf einer Tastatur |
|---|---|
| `Btn.Up`, `Btn.Down`, `Btn.Left`, `Btn.Right` | die Pfeile oder W, S, A, D |
| `Btn.A` | Leertaste oder Z |
| `Btn.B`, `Btn.X`, `Btn.Y` | X, C, V |
| `Btn.L`, `Btn.R` | Q, E |
| `Btn.Start`, `Btn.Select` | Enter, Tab |

**Die Liste der Tasten lesen, die seit dem letzten Frame gedrückt wurden.** Jede Taste, die heruntergeht, hochkommt oder sich wiederholt (lange genug gehalten,
um wieder zu tippen), ist ein Ereignis mit einem Namen: `'a'`, `'1'`, `' '` (Leertaste), `'Enter'`, `'Escape'`, `'ArrowLeft'`, `'F5'` ...
So liest du jede Taste, auch Buchstaben, und nichts geht verloren, selbst wenn zwei Tasten im selben Frame kommen.

## Zeile für Zeile

- `import { ... } from 'zinc:gfx';` neu diesmal: `font` und `drawText` (Lektion 5 erklärt sie), `isDown`,
  `wasPressed` und `Btn` für die Spiel-Buttons, `keyCount`, `keyKind`, `keyName` und `KeyKind` für die Tastenereignisse.
- `let x = 100, y = 100;` wo das Quadrat ist. `let color: u32 = 0xe8b06a;` seine Farbe, ein `u32` wie jede Farbe.
- `let lastKey = 'Press a key';` der Text, der in der Ecke steht. Wörter zwischen Anführungszeichen sind ein `string`.
- `const label = font('sans', 24);` eine Schrift, einmal am Anfang angefordert: die Familie `'sans'` mit 24 Pixeln.
- `if (isDown(Btn.Left)) x -= SPEED * dt;` Solange Links gehalten wird, bewege dich nach links. Hoch ist `y -= ...`, weil y nach unten wächst.
- `x = Math.max(0, Math.min(width() - SIZE, x));` hält das Quadrat im Fenster. `Math.min(a, b)` ist die kleinere
  der beiden Zahlen, `Math.max(a, b)` die größere: Zusammen halten sie `x` zwischen 0 und `width() - SIZE`.
- `if (wasPressed(Btn.A)) color = ...;` `wasPressed` ist nur in dem Frame `true`, in dem der Button heruntergeht, nicht solange
  er unten bleibt. Wenn du die Leertaste hältst, ändert sich die Farbe einmal, nicht 60-mal pro Sekunde.
- `color === 0xe8b06a ? 0x5bc0eb : 0xe8b06a` liest sich so: "wenn die Farbe Orange ist, dann Blau, sonst Orange". `===` vergleicht,
  `? :` wählt einen von zwei Werten.
- `for (let i = 0; i < keyCount(); i++) { ... }` geht die Tastenereignisse dieses Frames durch, vom ersten (Nummer 0)
  bis zum letzten.
- `if (keyKind(i) === KeyKind.Down)` behält nur die Tasten, die heruntergehen. Die anderen sind `KeyKind.Up` (losgelassen),
  `KeyKind.Repeat` (gehalten, tippt erneut) und `KeyKind.Text` (getippter Text, wenn ein Textfeld ihn angefordert hat).
- `lastKey = keyName(i) === ' ' ? 'Space' : keyName(i);` der Name der Taste. Der Name der Leertaste ist ein Leerzeichen, das du
  auf dem Bildschirm nicht sehen würdest, deshalb schreibt das Programm stattdessen `Space`. Namen ändern sich nicht mit Umschalt: Umschalt+A ist weiterhin `'a'`.
- `drawText(label, 20, 16, lastKey, 0xeceaf0, 255, 0);` schreibt `lastKey` bei (20, 16) in hellem Grau.

## Probier das aus

- Lass Umschalt schneller machen: `import { modifiers, Mod }` und `const fast = (modifiers() & Mod.Shift) !== 0;`.
- Lass Enter (`Btn.Start`) das Quadrat zurück in die Mitte setzen.
- Zähle die gedrückten Tasten und zeige die Zahl unter dem Namen.
- Zeichne das Quadrat größer, solange die Leertaste gehalten wird (`isDown(Btn.A)`), und kleiner, wenn sie losgelassen wird.
- Lass das Quadrat umlaufen: Wenn es rechts hinausgeht, kommt es links wieder herein, wie in Lektion 2.
- Escape schließt ein `zinc:gfx`-Programm (oder verlässt den Vollbildmodus). Um Escape selbst zu benutzen, rufe einmal `escapeByApp(true)` auf.

## Weiter

[4. Die Maus und Touch](04-mouse-and-touch.md): mit der Maus oder einem Finger zeichnen.
