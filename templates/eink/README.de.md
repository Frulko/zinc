# {{name}}

## Nächste Schritte

- `zinc dev`: startet es; jedes Speichern ist sofort zu sehen.
- Ändere `src/main.tsx` und speichere.
- Lerne, zu zeichnen und auf Tastatur und Maus zu reagieren: https://frulko.github.io/zinc/de/docs/learn/
- Der Leitfaden: https://frulko.github.io/zinc/de/docs/guide/01-getting-started/
- `zinc tour`: ein erster Rundgang mit Anleitung.

Eine App für das reMarkable Paper Pro aus der Vorlage `eink`: eine To-do-Liste, die du mit dem Stift abhakst, und eine Seite zum Skizzieren. Beides bleibt zwischen den Läufen erhalten.

```sh
zinc run                          # on the desktop, half the tablet's size (the mouse is the pen; right button erases)
zinc test                         # the to-do list (tests/todo.test.ts)
zinc export --target rmpp         # the tablet build in dist/ (see Zinc's docs/targets/remarkable-paper-pro.md to install it)
```

| Datei | Was sie tut |
|---|---|
| `src/main.tsx` | die zwei Seiten und die Tab-Leiste |
| `src/todo.ts` | die Liste: hinzufügen, abhaken, die abgehakten entfernen, speichern / laden (getestet) |
| `src/store.ts` | was mit `zinc:storage` gespeichert wird: die Liste und die Striche der Skizze |

E-Paper ändert sich langsam und hat keine Farbe: Die Vorlage bleibt bei Schwarz auf Weiß, breiten Rändern und großer Schrift und ändert den Bildschirm nur,
wenn etwas passiert (keine Animation, kein blinkender Cursor).
