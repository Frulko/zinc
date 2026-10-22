# {{name}}

## Nächste Schritte

- `zinc dev`: startet es; jedes Speichern ist sofort zu sehen.
- Ändere `src/main.ts` und speichere.
- Lerne, zu zeichnen und auf Tastatur und Maus zu reagieren: https://frulko.github.io/zinc/de/docs/learn/
- Der Leitfaden: https://frulko.github.io/zinc/de/docs/guide/01-getting-started/
- `zinc tour`: ein erster Rundgang mit Anleitung.

Eine HTTP-JSON-API aus der Vorlage `service`.

```sh
zinc run                 # serves on http://localhost:3000 (PORT=8080 zinc run for another port)
zinc test                # the API without the network (tests/api.test.ts) and over HTTP (tests/http.test.ts)
zinc export --target rpi # a Raspberry Pi build in dist/
```

| Methode | Pfad | Antwort |
|---|---|---|
| GET | /health | `{"ok": true, "items": n}` |
| GET | /items | alle Einträge |
| POST | /items | legt einen aus `{"title": "..."}` an: 201 und den Eintrag, 400 ohne Titel |
| GET | /items/:id | der Eintrag oder 404 |
| DELETE | /items/:id | 204 oder 404 |

`src/api.ts` bildet eine Anfrage auf eine Antwort ab und ist alles, was die Tests brauchen; `src/main.ts` startet nur den Server.

## Als Dienst ausführen

`deploy/{{id}}.service` ist eine systemd-Unit. Auf dem Rechner:

```sh
sudo mkdir -p /opt/{{id}} && sudo cp dist/{{id}}-linux/{{id}} /opt/{{id}}/   # the executable from zinc export
sudo cp deploy/{{id}}.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now {{id}}
journalctl -u {{id}} -f
```
