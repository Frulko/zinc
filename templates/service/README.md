# {{name}}

An HTTP JSON API made from the `service` template.

```sh
zinc run                 # serves on http://localhost:3000 (PORT=8080 zinc run for another port)
zinc test                # the API without the network (tests/api.test.ts) and over HTTP (tests/http.test.ts)
zinc export --target rpi # a Raspberry Pi build in dist/
```

| Method | Path | Answer |
|---|---|---|
| GET | /health | `{"ok": true, "items": n}` |
| GET | /items | every item |
| POST | /items | creates one from `{"title": "..."}`: 201 and the item, 400 without a title |
| GET | /items/:id | the item, or 404 |
| DELETE | /items/:id | 204, or 404 |

`src/api.ts` maps a request to a reply and is all the tests need; `src/main.ts` only starts the server.

## Run it as a service

`deploy/{{id}}.service` is a systemd unit. On the machine:

```sh
sudo mkdir -p /opt/{{id}} && sudo cp dist/{{id}}-linux/{{id}} /opt/{{id}}/   # the executable from zinc export
sudo cp deploy/{{id}}.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now {{id}}
journalctl -u {{id}} -f
```
