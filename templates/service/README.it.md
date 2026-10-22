# {{name}}

## Prossimi passi

- `zinc dev`: lo esegue; ogni salvataggio si vede subito.
- Cambia `src/main.ts` e salva.
- Impara a disegnare e a reagire a tastiera e mouse: https://frulko.github.io/zinc/it/docs/learn/
- La guida: https://frulko.github.io/zinc/it/docs/guide/01-getting-started/
- `zinc tour`: un primo tour guidato.

Un'API HTTP JSON fatta con il modello `service`.

```sh
zinc run                 # serves on http://localhost:3000 (PORT=8080 zinc run for another port)
zinc test                # the API without the network (tests/api.test.ts) and over HTTP (tests/http.test.ts)
zinc export --target rpi # a Raspberry Pi build in dist/
```

| Metodo | Percorso | Risposta |
|---|---|---|
| GET | /health | `{"ok": true, "items": n}` |
| GET | /items | tutti gli elementi |
| POST | /items | ne crea uno da `{"title": "..."}`: 201 e l'elemento, 400 senza titolo |
| GET | /items/:id | l'elemento, oppure 404 |
| DELETE | /items/:id | 204, oppure 404 |

`src/api.ts` trasforma una richiesta in una risposta ed è tutto ciò che serve ai test; `src/main.ts` si limita ad avviare il server.

## Eseguilo come servizio

`deploy/{{id}}.service` è un'unità systemd. Sulla macchina:

```sh
sudo mkdir -p /opt/{{id}} && sudo cp dist/{{id}}-linux/{{id}} /opt/{{id}}/   # the executable from zinc export
sudo cp deploy/{{id}}.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now {{id}}
journalctl -u {{id}} -f
```
